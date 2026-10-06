import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { openDatabase, type DatabaseContext } from "@/db/connection";
import { platformAccounts } from "@/db/schema";
import { createSession } from "@/lib/server/session";
import { deleteAccount, readAccount, saveAccount } from "@/lib/music/platforms/accounts";
import { cancelLogin, logoutPlatform, platformStatus, pollPlatformLogin, startPlatformLogin } from "@/lib/music/platforms/login";
import { parsePlatform, resolvePlatformSong, searchPlatform } from "@/lib/music/platforms/catalog";
import { musicAudio, musicMediaTicket, parseAudioRange, revokeMedia, trustedMediaUrl } from "@/lib/music/platforms/media";
import { connectOfficialQqAccount, qqAccountCredentials } from "@/lib/music/providers/qq-account";

const fixtures = vi.hoisted(() => ({ db: null as DatabaseContext | null, call: vi.fn() }));
vi.mock("@/db/connection", async original => ({ ...await original<typeof import("@/db/connection")>(), getDatabase: () => fixtures.db! }));
vi.mock("@/lib/music/platforms/runtime", () => ({ desktopAvailable: () => true, integrationRoot: () => "", electronPath: () => "", platformCall: fixtures.call }));
let owner: string; let other: string;
const request = () => new Request("http://127.0.0.1:3002/api/music/netease/login", { method: "POST", headers: { host: "127.0.0.1:3002" } });
const signal = () => new AbortController().signal;
const globals = globalThis as typeof globalThis & { musicLoginJobs?: Map<string, unknown>; musicMediaTickets?: Map<string, unknown>; musicCatalog?: Map<string, unknown> };
beforeEach(() => {
  fixtures.db = openDatabase(":memory:"); owner = createSession(fixtures.db).userId; other = createSession(fixtures.db).userId;
  vi.stubEnv("MUSIC_CREDENTIAL_SECRET", "test-fixture-platform-encryption-only"); vi.stubEnv("QQ_CREDENTIAL_SECRET", "test-fixture-qq-encryption-only");
  fixtures.call.mockReset();
  fixtures.call.mockImplementation(async (_provider, action) => action === "qr" ? { key: "fixture-key", image: "data:image/png;base64,fixture" } : action === "poll" ? { code: 801 } : { loggedIn: true, userId: "123456", nickname: "测试听众", avatar: "https://p1.music.126.net/fixture.jpg" });
});
afterEach(() => {
  for (const provider of ["netease", "qq", "kugou", "qishui"] as const) { cancelLogin(owner, provider); cancelLogin(other, provider); }
  globals.musicLoginJobs?.clear(); globals.musicMediaTickets?.clear(); globals.musicCatalog?.clear();
  fixtures.db?.sqlite.close(); fixtures.db = null; vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe("music platform identity and login lifecycle", () => {
  it("encrypts credentials with per-user and per-platform authentication", () => {
    const account = { cookie: "MUSIC_U=fixture-private-cookie", profile: { id: "1", nickname: "Fixture", avatar: "" } };
    saveAccount(owner, "netease", account);
    expect(readAccount(owner, "netease")).toEqual(account);
    expect(readAccount(other, "netease")).toBeNull();
    expect(readAccount(owner, "kugou")).toBeNull();
    const row = fixtures.db!.db.select().from(platformAccounts).get()!;
    expect(row.credentials).not.toContain("fixture-private-cookie");
    fixtures.db!.db.update(platformAccounts).set({ userId: other }).where(eq(platformAccounts.userId, owner)).run();
    expect(readAccount(other, "netease")).toBeNull();
    deleteAccount(other, "netease");
  });
  it("polls QR login, saves a verified profile, and never returns platform credentials", async () => {
    const qr = await startPlatformLogin(owner, "netease", request());
    expect(qr.image).toContain("data:image/png");
    expect(await pollPlatformLogin(owner, "netease", qr.loginId)).toMatchObject({ status: "pending" });
    await expect(pollPlatformLogin(other, "netease", qr.loginId)).rejects.toMatchObject({ code: "LOGIN_NOT_FOUND" });
    fixtures.call.mockImplementation(async (_provider, action) => action === "poll" ? { code: 803, cookie: "MUSIC_U=fixture-private-cookie" } : { loggedIn: true, userId: "123456", nickname: "测试听众" });
    const result = await pollPlatformLogin(owner, "netease", qr.loginId);
    expect(result).toMatchObject({ status: "success", user: { id: "123456", nickname: "测试听众" } });
    expect(JSON.stringify(result)).not.toContain("fixture-private-cookie");
    expect(await platformStatus(owner, "netease", signal())).toMatchObject({ authorized: true });
    logoutPlatform(owner, "netease");
    expect(await platformStatus(owner, "netease", signal())).toMatchObject({ authorized: false });
  });
  it("rejects old QR polling after replacement and blocks saving after cancellation", async () => {
    const old = await startPlatformLogin(owner, "netease", request());
    const current = await startPlatformLogin(owner, "netease", request());
    await expect(pollPlatformLogin(owner, "netease", old.loginId)).rejects.toMatchObject({ code: "LOGIN_NOT_FOUND" });
    let resolvePoll!: (v: unknown) => void;
    fixtures.call.mockImplementation(() => new Promise(resolve => { resolvePoll = resolve; }));
    const running = pollPlatformLogin(owner, "netease", current.loginId);
    cancelLogin(owner, "netease", current.loginId);
    resolvePoll({ code: 803, cookie: "MUSIC_U=fixture-late-cookie" });
    expect(await running).toMatchObject({ status: "cancelled" });
    expect(readAccount(owner, "netease")).toBeNull();
  });
  it("requires QQ music credentials, not just a generic confirmed QQ account", async () => {
    await expect(connectOfficialQqAccount(owner, "uin=o00123456; p_skey=fixture-web-session", signal(), () => true)).rejects.toMatchObject({ code: "QQ_PLAYBACK_AUTH_INCOMPLETE" });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: 0, data: { creator: { nick: "官方窗口用户", headpic: "https://q1.qlogo.cn/fixture" } } })));
    const profile = await connectOfficialQqAccount(owner, "uin=o00123456; qm_keyst=fixture-music-session", signal(), () => true);
    expect(profile.nickname).toBe("官方窗口用户");
    expect(qqAccountCredentials(owner)?.uin).toBe("123456");
    expect(qqAccountCredentials(other)).toBeNull();
  });
});
describe("catalogue and audio boundaries", () => {
  it("keeps playback metadata on the server and refuses cross-account/provider playback", async () => {
    fixtures.call.mockResolvedValue({ songs: [{ id: "song-1", name: "Fixture Song", artist: "Artist", fee: 1, secretMetadata: "server-only" }], total: 1 });
    const result = await searchPlatform(owner, "kugou", "Fixture", 1, signal());
    expect(result.songs[0]).toMatchObject({ provider: "kugou", name: "Fixture Song", fee: 1 });
    expect(JSON.stringify(result)).not.toContain("secretMetadata");
    const id = result.songs[0].playbackId;
    await expect(resolvePlatformSong(other, "kugou", id, signal())).rejects.toMatchObject({ code: "TRACK_NOT_FOUND" });
    await expect(resolvePlatformSong(owner, "netease", id, signal())).rejects.toMatchObject({ code: "TRACK_NOT_FOUND" });
    fixtures.call.mockResolvedValue({ playable: false, reason: "login_required" });
    expect(await resolvePlatformSong(owner, "kugou", id, signal())).toMatchObject({ playable: false, url: "", message: "请先连接 酷狗音乐 账号。" });
    expect(() => parsePlatform("__proto__")).toThrow();
    await expect(searchPlatform(owner, "netease", "", 1, signal())).rejects.toMatchObject({ code: "SEARCH_INVALID" });
  });
  it("allows only platform CDN hosts and prevents token reuse after logout", async () => {
    for (const url of ["https://127.0.0.1/", "https://music.126.net.attacker.test/a", "https://attacker.test@music.126.net/a", "file:///a", "https://music.126.net:3002/a"]) expect(trustedMediaUrl("netease", url)).toBeNull();
    expect(trustedMediaUrl("netease", "http://m801.music.126.net/a")?.protocol).toBe("https:");
    const ticket = musicMediaTicket(owner, "netease", "https://m801.music.126.net/a").split("ticket=")[1];
    await expect(musicAudio(other, ticket, null, signal())).rejects.toMatchObject({ code: "AUDIO_NOT_FOUND" });
    revokeMedia(owner, "netease");
    await expect(musicAudio(owner, ticket, null, signal())).rejects.toMatchObject({ code: "AUDIO_NOT_FOUND" });
  });
  it("handles seek, suffix and invalid audio ranges", () => {
    expect(parseAudioRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9, partial: true });
    expect(parseAudioRange("bytes=-10", 100)).toEqual({ start: 90, end: 99, partial: true });
    expect(parseAudioRange("bytes=90-", 100)).toEqual({ start: 90, end: 99, partial: true });
    for (const range of ["bytes=", "bytes=100-", "bytes=10-9", "bytes=-0", "bytes=0-1,3-4"]) expect(parseAudioRange(range, 100)).toBeNull();
  });
  it("streams range audio without forwarding cookies or exposing upstream URLs", async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { "Content-Type": "audio/mpeg", "Content-Range": "bytes 0-2/100", "Content-Length": "3" } }));
    vi.stubGlobal("fetch", fetcher);
    const ticket = musicMediaTicket(owner, "netease", "https://m801.music.126.net/a").split("ticket=")[1];
    const response = await musicAudio(owner, ticket, "bytes=0-2", signal());
    expect(response.status).toBe(206); expect(response.headers.get("content-range")).toBe("bytes 0-2/100");
    expect((await response.arrayBuffer()).byteLength).toBe(3);
    const call = vi.mocked(fetch).mock.calls[0];
    expect(new Headers(call[1]?.headers).has("cookie")).toBe(false);
  });
});
