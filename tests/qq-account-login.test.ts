import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { DatabaseContext } from "@/db/connection";
import { openDatabase } from "./helpers/database";
import { platformAccounts } from "@/db/schema";
import { createSession } from "@/lib/server/session";
import { readAccount, saveAccount } from "@/lib/music/platforms/accounts";
import { cancelQqOAuth, completeQqOAuth, logoutQqOAuth, pollQqOAuth, qqOAuthAvailability, qqOAuthStatus, startQqOAuth } from "@/lib/music/providers/qq-oauth";
import { qqAccountCredentials, qqAccountResolve } from "@/lib/music/providers/qq-account";
import { normalizeQqProfile } from "@/lib/music/providers/qq-profile";
const db = vi.hoisted(() => ({ context: null as DatabaseContext | null }));
vi.mock("@/db/connection", async (original) => ({ ...await original<typeof import("@/db/connection")>(), getDatabase: () => db.context! }));
const runtime = globalThis as typeof globalThis & {
    qqOAuthJobs?: Map<string, {
        abort: AbortController;
    }>;
    qqOAuthProfiles?: Map<string, unknown>;
    qqOAuthRefresh?: Map<string, unknown>;
};
let owner: string, other: string, nickname: string, profileRet: number, identityApp: string, format: boolean, calls: Mock<(input: URL | string, init?: RequestInit) => Promise<Response>>;
const signal = () => new AbortController().signal;
const request = () => new Request("http://127.0.0.1:3002/api/music/qq/login", { headers: { host: "127.0.0.1:3002" } });
beforeEach(async () => {
    db.context = (await openDatabase(":memory:"));
    owner = (await createSession(db.context)).userId;
    other = (await createSession(db.context)).userId;
    vi.stubEnv("QQ_CONNECT_APP_ID", "12345678");
    vi.stubEnv("QQ_CONNECT_APP_SECRET", "fixture-secret-for-this-application");
    vi.stubEnv("QQ_CONNECT_REDIRECT_URI", "http://127.0.0.1:3002/api/qq/login/callback");
    vi.stubEnv("APP_ORIGIN", "");
    vi.stubEnv("MUSIC_CREDENTIAL_SECRET", "fixture-account-encryption-for-tests-only");
    nickname = "测试听众";
    profileRet = 0;
    identityApp = "12345678";
    format = false;
    calls = vi.fn(async (input: URL | string, init?: RequestInit) => {
        const url = new URL(String(input));
        expect(url.hostname).toBe("graph.qq.com");
        expect(url.searchParams.get("fmt")).toBe("json");
        expect(new Headers(init?.headers).has("cookie")).toBe(false);
        if (url.pathname === "/oauth2.0/token") {
            const refreshing = url.searchParams.get("grant_type") === "refresh_token";
            const value = { access_token: refreshing ? "fixture-refreshed-access" : "fixture-access-token", refresh_token: refreshing ? "fixture-rotated-refresh" : "fixture-refresh-token", expires_in: 3600 };
            return format ? new Response(new URLSearchParams(Object.entries(value).map(([key, value]) => [key, String(value)])).toString()) : Response.json(value);
        }
        if (url.pathname === "/oauth2.0/me") {
            const value = { client_id: identityApp, openid: "fixture-openid-123" };
            return format ? new Response("callback( " + JSON.stringify(value) + " );") : Response.json(value);
        }
        if (url.pathname === "/user/get_user_info")
            return Response.json({ ret: profileRet, nickname, figureurl_qq_2: "", figureurl_qq_1: "https://q.qlogo.cn/qqapp/fixture/40" });
        throw new Error("unexpected endpoint");
    });
    vi.stubGlobal("fetch", calls);
});
afterEach(async () => {
    runtime.qqOAuthJobs?.forEach(job => job.abort.abort());
    runtime.qqOAuthJobs?.clear();
    runtime.qqOAuthProfiles?.clear();
    runtime.qqOAuthRefresh?.clear();
    await db.context?.close();
    db.context = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});
function start(user = owner) {
    const login = startQqOAuth(user, request()), url = new URL(login.authorizeUrl);
    return { login, state: url.searchParams.get("state")!, url };
}
async function connected() { const job = start(); const result = await completeQqOAuth(owner, job.state, "fixture-authorization-code"); return { ...job, result }; }
describe("QQ official OAuth adapter (upstream fixtures, not real authorization)", () => {
    it("requires our registered application's config and uses an owner-bound, random state", async () => {
        vi.stubEnv("QQ_CONNECT_APP_SECRET", "");
        expect(qqOAuthAvailability().loginAvailable).toBe(false);
        expect(() => start()).toThrowError();
        expect(calls).not.toHaveBeenCalled();
        vi.stubEnv("QQ_CONNECT_APP_SECRET", "fixture-secret-for-this-application");
        const { url, login, state } = start();
        expect(url.origin).toBe("https://graph.qq.com");
        expect(url.searchParams.get("client_id")).toBe("12345678");
        expect(url.searchParams.get("scope")).toBe("get_user_info");
        expect(state).toHaveLength(43);
        expect(login.image).toBe("");
        expect(JSON.stringify(login)).not.toContain("fixture-secret");
        expect(() => pollQqOAuth(other, login.loginId)).toThrow();
        await expect(completeQqOAuth(owner, "wrong-state", "fixture-code")).rejects.toMatchObject({ code: "QQ_OAUTH_STATE_INVALID" });
        expect(calls).not.toHaveBeenCalled();
    });
    it("checks the configured callback's path and origin before issuing a login", () => {
        vi.stubEnv("QQ_CONNECT_REDIRECT_URI", "https://site.example/api/qq/login/callback");
        expect(() => start()).toThrowError();
        vi.stubEnv("QQ_CONNECT_REDIRECT_URI", "javascript:alert(1)");
        expect(qqOAuthAvailability().loginAvailable).toBe(false);
    });
    it("exchanges code -> token -> OpenID -> real profile, encrypts tokens and exposes only display fields", async () => {
        const { result, login } = await connected();
        expect(result).toMatchObject({ status: "success", user: { id: "fixture-openid-123", nickname: "测试听众", avatar: expect.stringContaining("/api/qq/avatar") } });
        expect(JSON.stringify(result)).not.toMatch(/fixture-access|fixture-refresh|access_token|cookie|client_secret/);
        expect(calls).toHaveBeenCalledTimes(3);
        const row = (await db.context!.db.select().from(platformAccounts))[0]!;
        expect(row.credentials).not.toContain("fixture-access-token");
        expect((await readAccount(owner, "qq"))?.oauth?.accessToken).toBe("fixture-access-token");
        expect((await readAccount(other, "qq"))).toBeNull();
        expect(await qqOAuthStatus(owner, signal())).toMatchObject({ authorized: true, musicAuthorized: false, profileAvailable: true, user: result.user });
        expect(pollQqOAuth(owner, login.loginId)).toMatchObject({ status: "success" });
        expect(calls).toHaveBeenCalledTimes(3);
        expect(qqAccountCredentials(owner)).toBeNull();
        expect(await qqAccountResolve(owner, "songmid", "", signal())).toBeNull();
    });
    it("parses documented form/JSONP responses as data without evaluating Javascript", async () => {
        format = true;
        expect((await connected()).result.status).toBe("success");
    });
    it("rejects a different application's identity and incomplete/failed profiles without storing credentials", async () => {
        identityApp = "87654321";
        expect((await connected()).result.status).toBe("error");
        expect((await readAccount(owner, "qq"))).toBeNull();
        identityApp = "12345678";
        nickname = "";
        expect((await connected()).result.status).toBe("error");
        expect((await readAccount(owner, "qq"))).toBeNull();
        nickname = "\u0000\u0001";
        expect((await connected()).result.status).toBe("error");
        expect((await readAccount(owner, "qq"))).toBeNull();
        nickname = "Fixture";
        profileRet = 1002;
        expect((await connected()).result.status).toBe("error");
        expect((await readAccount(owner, "qq"))).toBeNull();
    });
    it("shares duplicate callbacks and keeps profile checks cached for sixty seconds", async () => {
        const job = start();
        const [a, b] = await Promise.all([completeQqOAuth(owner, job.state, "fixture-code"), completeQqOAuth(owner, job.state, "fixture-code")]);
        expect(a).toEqual(b);
        expect(calls).toHaveBeenCalledTimes(3);
        await Promise.all([qqOAuthStatus(owner, signal()), qqOAuthStatus(owner, signal())]);
        expect(calls).toHaveBeenCalledTimes(3);
        nickname = "更新昵称";
        const refreshed = await qqOAuthStatus(owner, signal(), true);
        expect(refreshed).toMatchObject({ user: { nickname: "更新昵称" } });
        expect((await readAccount(owner, "qq"))?.profile.nickname).toBe("更新昵称");
    });
    it("expires pending login independent of a timer, rejects replaced state, and respects cancellation", async () => {
        vi.useFakeTimers();
        const old = start(), next = start();
        expect(() => pollQqOAuth(owner, old.login.loginId)).toThrow();
        await expect(completeQqOAuth(owner, old.state, "fixture-code")).rejects.toMatchObject({ code: "QQ_OAUTH_STATE_INVALID" });
        cancelQqOAuth(owner, next.login.loginId);
        expect(await completeQqOAuth(owner, next.state, "fixture-code")).toMatchObject({ status: "cancelled" });
        const expired = start();
        vi.setSystemTime(Date.now() + 240001);
        expect(pollQqOAuth(owner, expired.login.loginId)).toMatchObject({ status: "expired" });
        expect(await completeQqOAuth(owner, expired.state, "fixture-code")).toMatchObject({ status: "expired" });
        expect(calls).not.toHaveBeenCalled();
    });
    it("does not save a late profile after the user cancels authorization", async () => {
        const normal = calls.getMockImplementation()!;
        let release!: (value: Response) => void;
        calls.mockImplementation((input, init) => new URL(String(input)).pathname === "/user/get_user_info" ? new Promise(resolve => { release = resolve; }) : normal(input, init));
        const job = start(), finishing = completeQqOAuth(owner, job.state, "fixture-code");
        await vi.waitFor(() => expect(release).toBeTypeOf("function"));
        cancelQqOAuth(owner, job.login.loginId);
        release(Response.json({ ret: 0, nickname: "late profile" }));
        expect(await finishing).toMatchObject({ status: "cancelled" });
        expect((await readAccount(owner, "qq"))).toBeNull();
    });
    it("renews a token once for concurrent callers and rotates the single-use refresh token", async () => {
        vi.useFakeTimers();
        await connected();
        calls.mockClear();
        vi.setSystemTime(Date.now() + 3601000);
        const [a, b] = await Promise.all([qqOAuthStatus(owner, signal()), qqOAuthStatus(owner, signal())]);
        expect(a.authorized).toBe(true);
        expect(b.authorized).toBe(true);
        expect(calls).toHaveBeenCalledTimes(2);
        expect((await readAccount(owner, "qq"))?.oauth).toMatchObject({ accessToken: "fixture-refreshed-access", refreshToken: "fixture-rotated-refresh" });
        expect(JSON.stringify(a)).not.toContain("fixture-refreshed-access");
    });
    it("does not restore an account after logout while a profile request is in flight", async () => {
        await connected();
        const normal = calls.getMockImplementation()!;
        let release!: (value: Response) => void;
        calls.mockImplementation((input, init) => new URL(String(input)).pathname === "/user/get_user_info" ? new Promise(resolve => { release = resolve; }) : normal(input, init));
        const refresh = qqOAuthStatus(owner, signal(), true);
        await vi.waitFor(() => expect(release).toBeTypeOf("function"));
        (await logoutQqOAuth(owner));
        release(Response.json({ ret: 0, nickname: "late profile" }));
        expect(await refresh).toMatchObject({ authorized: false });
        expect((await readAccount(owner, "qq"))).toBeNull();
    });
    it("does not equate a saved cookie or a failed profile check with verified login", async () => {
        (await saveAccount(owner, "qq", { cookie: "qm_keyst=fixture-legacy-cookie", profile: { id: "legacy", nickname: "Legacy", avatar: "" } }));
        expect(await qqOAuthStatus(owner, signal())).toMatchObject({ authorized: false, musicAuthorized: false });
        await connected();
        profileRet = 1002;
        expect(await qqOAuthStatus(owner, signal(), true)).toMatchObject({ authorized: false, profileAvailable: false });
    });
    it("normalizes the official 40px avatar fallback and rejects unsafe avatar origins", () => {
        expect(normalizeQqProfile({ nickname: "昵称", figureurl_qq_1: "http://q.qlogo.cn/qqapp/fixture/40" }, { id: "official-openid", nickname: "", avatar: "" }))
            .toMatchObject({ id: "official-openid", nickname: "昵称", avatar: "https://q.qlogo.cn/qqapp/fixture/40" });
        expect(normalizeQqProfile({ figureurl_qq_2: "https://attacker.example/avatar" }, { id: "id", nickname: "n", avatar: "" }).avatar).toBe("");
    });
});
