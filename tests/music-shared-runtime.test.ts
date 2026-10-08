import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { DatabaseContext } from "@/db/connection";
import { openDatabase } from "./helpers/database";
import { musicRuntimeState } from "@/db/schema";
import { createSession } from "@/lib/server/session";
import { deleteStates, mutateState, putStates, rateLimitShared, readState } from "@/lib/music/platforms/shared-state";
import { boundedAudioBody, boundedAudioRange } from "@/lib/music/platforms/audio-response";

const fixtures = vi.hoisted(() => ({ db: null as DatabaseContext | null, call: vi.fn() }));
vi.mock("@/db/connection", async original => ({ ...await original<typeof import("@/db/connection")>(), getDatabase: () => fixtures.db! }));
vi.mock("@/lib/music/platforms/runtime", () => ({ platformCall: fixtures.call, desktopAvailable: () => false }));
let owner: string, other: string;
beforeEach(async () => {
  fixtures.db = await openDatabase();
  owner = (await createSession(fixtures.db)).userId;
  other = (await createSession(fixtures.db)).userId;
  vi.stubEnv("MUSIC_CREDENTIAL_SECRET", "shared-runtime-test-encryption-key-only");
  fixtures.call.mockReset();
});
afterEach(async () => {
  await fixtures.db?.close(); fixtures.db = null;
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers();
});
const signal = () => new AbortController().signal;

describe("shared operational state for cold serverless instances", () => {
  it("encrypts payloads, binds them to their owner and rejects copied ciphertext", async () => {
    await putStates(owner, "media", [{ key: "fixture", value: { url: "https://private.example/signed-source" }, expiresAt: Date.now() + 60000 }]);
    expect(await readState(other, "media", "fixture")).toBeNull();
    const row = (await fixtures.db!.db.select().from(musicRuntimeState))[0];
    expect(row.payload).not.toContain("signed-source");
    await fixtures.db!.db.update(musicRuntimeState).set({ userId: other }).where(eq(musicRuntimeState.userId, owner));
    expect(await readState(other, "media", "fixture")).toBeNull();
  });
  it("enforces the same rate limit during concurrent calls and expires without background timers", async () => {
    const results = await Promise.all(Array.from({ length: 15 }, () => rateLimitShared(owner, "fixture", 6)));
    expect(results.filter(Boolean)).toHaveLength(6);
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 60001);
    expect(await rateLimitShared(owner, "fixture", 6)).toBe(true);
  });
  it("bounds per-user state and removes revoked tickets across fresh module instances", async () => {
    await putStates(owner, "media", Array.from({ length: 32 }, (_, i) => ({ key: String(i).padStart(2, "0"), value: { provider: "netease" }, expiresAt: Date.now() + 60000 })));
    await putStates(owner, "media", [{ key: "new", value: { provider: "netease" }, expiresAt: Date.now() + 60000 }]);
    const rows = await fixtures.db!.db.select().from(musicRuntimeState).where(eq(musicRuntimeState.userId, owner));
    expect(rows).toHaveLength(32);
    vi.resetModules();
    const cold = await import("@/lib/music/platforms/shared-state");
    expect((await cold.readState(owner, "media", "new"))?.value).toEqual({ provider: "netease" });
    await cold.deleteStates(owner, "media");
    expect(await readState(owner, "media", "new")).toBeNull();
  });
  it("rolls back a state transition when its associated database action fails", async () => {
    await putStates(owner, "qr", [{ key: "netease", value: { status: "pending" }, expiresAt: Date.now() + 60000 }]);
    await expect(mutateState(owner, "qr", "netease", () => { throw new Error("fixture failure"); })).rejects.toThrow("fixture failure");
    expect((await readState(owner, "qr", "netease"))?.value).toEqual({ status: "pending" });
    await deleteStates(owner, "qr");
  });
  it("continues QR login, search and playback after module state is discarded", async () => {
    fixtures.call.mockImplementation(async (_provider, action) => action === "qr" ? { key: "fixture-qr-key", image: "data:image/png;base64,fixture" }
      : action === "poll" ? { code: 803, cookie: "MUSIC_U=fixture-private-cookie" }
        : action === "status" ? { loggedIn: true, userId: "123456", nickname: "Fixture" }
          : action === "search" ? { songs: [{ id: "123", name: "Song", artist: "Artist" }] }
            : { playable: true, url: "https://m801.music.126.net/fixture.mp3" });
    const warm = await import("@/lib/music/platforms/login");
    const qr = await warm.startPlatformLogin(owner, "netease", new Request("http://127.0.0.1/api/music/netease/login"));
    const catalog = await import("@/lib/music/platforms/catalog");
    const search = await catalog.searchPlatform(owner, "netease", "Song", 1, signal());
    vi.resetModules();
    const coldLogin = await import("@/lib/music/platforms/login");
    expect(await coldLogin.pollPlatformLogin(owner, "netease", qr.loginId)).toMatchObject({ status: "success", user: { nickname: "Fixture" } });
    const coldCatalog = await import("@/lib/music/platforms/catalog");
    const playback = await coldCatalog.resolvePlatformSong(owner, "netease", search.songs[0].playbackId, signal());
    vi.resetModules();
    const coldMedia = await import("@/lib/music/platforms/media");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { "Content-Type": "audio/mpeg", "Content-Length": "3", "Content-Range": "bytes 0-2/100" } })));
    const id = new URL(playback.url, "http://127.0.0.1").searchParams.get("ticket")!;
    const response = await coldMedia.musicAudio(owner, id, "bytes=0-2", signal());
    expect(response.status).toBe(206); expect((await response.arrayBuffer()).byteLength).toBe(3);
    await coldMedia.revokeMedia(owner, "netease");
    await expect(coldMedia.musicAudio(owner, id, null, signal())).rejects.toMatchObject({ code: "AUDIO_NOT_FOUND" });
  });
});

describe("serverless audio response bounds", () => {
  it("preserves seeking and suffix ranges while splitting open-ended reads", () => {
    vi.stubEnv("MUSIC_AUDIO_RESPONSE_BYTES", String(4 * 1024 * 1024));
    expect(boundedAudioRange("bytes=100-")).toBe("bytes=100-4194403");
    expect(boundedAudioRange("bytes=10-19")).toBe("bytes=10-19");
    expect(boundedAudioRange("bytes=-100")).toBe("bytes=-100");
    for (const range of ["bytes=", "bytes=-0", "bytes=10-9", "bytes=9007199254740991-"]) expect(() => boundedAudioRange(range)).toThrow();
  });
  it("rejects oversized known and unknown bodies before emitting a truncated song", async () => {
    vi.stubEnv("MUSIC_AUDIO_RESPONSE_BYTES", String(4 * 1024 * 1024));
    const bytes = new Uint8Array(19 * 1024 * 1024);
    await expect(boundedAudioBody(new Response(bytes, { headers: { "Content-Length": String(bytes.length) } }))).rejects.toMatchObject({ code: "AUDIO_RESPONSE_TOO_LARGE" });
    await expect(boundedAudioBody(new Response(bytes))).rejects.toMatchObject({ code: "AUDIO_RESPONSE_TOO_LARGE" });
  });
});
