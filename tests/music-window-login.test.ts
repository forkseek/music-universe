import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildProcess } from "node:child_process";
import { openDatabase, type DatabaseContext } from "@/db/connection";
import { createSession } from "@/lib/server/session";
import { readAccount } from "@/lib/music/platforms/accounts";
import { cancelLogin, pollPlatformLogin, startPlatformLogin } from "@/lib/music/platforms/login";
const fixture = vi.hoisted(() => ({ db: null as DatabaseContext | null, spawn: vi.fn(), profile: vi.fn(), call: vi.fn() }));
vi.mock("@/db/connection", async original => ({ ...await original<typeof import("@/db/connection")>(), getDatabase: () => fixture.db! }));
vi.mock("node:child_process", async original => ({ ...await original<typeof import("node:child_process")>(), spawn: fixture.spawn }));
vi.mock("@/lib/music/platforms/runtime", () => ({ desktopAvailable: () => true, integrationRoot: () => "integrations/mineradio", electronPath: () => "fixture-electron", platformCall: fixture.call }));
vi.mock("@/lib/music/providers/qq-music-session", () => ({ readQqMusicProfile: fixture.profile }));
let owner: string, other: string, child: ChildProcess;
const request = () => new Request("http://127.0.0.1:43891/api/music/qq/login", { method: "POST" });
beforeEach(() => {
 fixture.db = openDatabase(":memory:"); owner = createSession(fixture.db).userId; other = createSession(fixture.db).userId;
 vi.stubEnv("MUSIC_CREDENTIAL_SECRET", "fixture-local-encryption-only");
 child = Object.assign(new EventEmitter(), { kill: vi.fn() }) as unknown as ChildProcess;
 fixture.spawn.mockReturnValue(child); fixture.profile.mockReset(); fixture.call.mockReset();
 fixture.profile.mockResolvedValue({ id: "12345678", nickname: "Fixture Listener", avatar: "" });
 fixture.call.mockResolvedValue({ loggedIn: true, userId: "12345678", nickname: "Fixture Listener" });
});
afterEach(() => {
 for (const provider of ["qq", "kugou", "qishui"] as const) cancelLogin(owner, provider);
 child.emit("exit", 0); fixture.db?.sqlite.close(); vi.unstubAllEnvs(); vi.clearAllMocks();
});
describe("official window completion lifecycle (IPC fixtures)", () => {
 it.each(["qq", "kugou", "qishui"] as const)("persists verified %s completion privately and rejects other users", async provider => {
   const login = await startPlatformLogin(owner, provider, request());
   await expect(pollPlatformLogin(other, provider, login.loginId)).rejects.toThrow();
   child.emit("message", { status: "success", cookie: "fixture-window-cookie" });
   await vi.waitFor(() => expect(readAccount(owner, provider)?.profile.nickname).toBe("Fixture Listener"));
   const completed = await pollPlatformLogin(owner, provider, login.loginId);
   expect(completed.status).toBe("success"); expect(JSON.stringify(completed)).not.toContain("fixture-window-cookie");
   if (provider === "qq") expect(readAccount(owner, provider)?.loginMethod).toBe("official-window");
 });
 it("does not store a window result if cancelled while verifying the QQ profile", async () => {
   let finish!: (value: unknown) => void;
   fixture.profile.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
   const login = await startPlatformLogin(owner, "qq", request());
   child.emit("message", { status: "success", cookie: "fixture-window-cookie" });
   cancelLogin(owner, "qq", login.loginId);
   finish({ id: "12345678", nickname: "Fixture Listener", avatar: "" });
   await new Promise(resolve => setTimeout(resolve, 0));
   expect(readAccount(owner, "qq")).toBeNull(); expect(child.kill).toHaveBeenCalled();
 });
});
