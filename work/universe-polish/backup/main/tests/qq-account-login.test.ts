import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { openDatabase, type DatabaseContext } from "@/db/connection";
import { qqAccounts } from "@/db/schema";
import { createSession } from "@/lib/server/session";
import { logoutQqAccount, pollQqLogin, qqAccountCredentials, qqAccountStatus, startQqLogin } from "@/lib/music/providers/qq-account";
import { normalizeQqProfile, parseQqLoginCallback, trustedQqLoginUrl } from "@/lib/music/providers/qq-profile";

const state = vi.hoisted(() => ({ context: null as DatabaseContext | null }));
vi.mock("@/db/connection", async (original) => ({ ...await original<typeof import("@/db/connection")>(), getDatabase: () => state.context! }));

const loginRuntime = globalThis as typeof globalThis & { __musicWorldQqLogin?: Map<string, unknown>; __musicWorldQqVaultKey?: Buffer; __musicWorldQqProfiles?: Map<string, unknown> };
let userId: string;
let code = "66";
let musicKey = true;
let profileExpired = false;
let profileUnavailable = false;
const persistenceFiles: string[] = [];
const callback = () => `ptuiCB('${code}','0','https://ptlogin4.y.qq.com/check_sig?uin=4201337&service=ptqrlogin&ptsigx=fixture-signature&s_url=https%3A%2F%2Fgraph.qq.com%2Foauth2.0%2Flogin_jump','0','登录回调','QQ 昵称');`;
function platformFetch() {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/ptqrshow") return new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), { headers: { "Content-Type": "image/png", "Set-Cookie": "qrsig=qr-fixture; Path=/" } });
    if (url.pathname === "/ptqrlogin") return new Response(callback());
    if (url.pathname === "/check_sig") {
      // Generic QQ callbacks provide identity cookies, but not the QQ Connect key.
      const connect = url.hostname === "ssl.ptlogin2.graph.qq.com" && url.searchParams.get("pt_3rd_aid") === "100497308" && new Headers(init?.headers).get("referer") === "https://xui.ptlogin2.qq.com/";
      return new Response("", { status: 302, headers: { "Set-Cookie": (connect ? "p_skey=test-identity; Path=/, " : "") + "uin=o004201337; Path=/" } });
    }
    if (url.pathname === "/oauth2.0/authorize") return new Response("", { status: 302, headers: { location: "https://y.qq.com/portal/wx_redirect.html?code=test-code" } });
    if (url.pathname.endsWith("/musicu.fcg")) return Response.json({ code: 0, req: { code: 0, data: { musicid: 6789012, nick: "授权昵称", ...(musicKey ? { musickey: "test-music-ticket" } : {}) } } });
    if (url.pathname.endsWith("/fcg_get_profile_homepage.fcg")) {
      if (profileUnavailable) throw new Error("offline fixture");
      return Response.json(profileExpired ? { code: 1000 } : { code: 0, data: { creator: { nick: "%E9%9F%B3%E4%B9%90%E5%90%AC%E4%BC%97", headpic: "https://q1.qlogo.cn/g?b=qq&nk=4201337&s=100" } } });
    }
    throw new Error("Unexpected upstream host in login test");
  });
}

beforeEach(() => {
  state.context = openDatabase(":memory:");
  userId = createSession(state.context).userId;
  code = "66"; musicKey = true; profileExpired = false; profileUnavailable = false;
  delete loginRuntime.__musicWorldQqLogin; delete loginRuntime.__musicWorldQqVaultKey; delete loginRuntime.__musicWorldQqProfiles;
  vi.stubEnv("QQ_CREDENTIAL_SECRET", "unit-test-only-encryption-secret");
  vi.stubGlobal("fetch", platformFetch());
});
afterEach(() => {
  state.context?.sqlite.close(); state.context = null;
  const storeRoot = path.resolve("work/qq-integration");
  for (const file of persistenceFiles.splice(0)) {
    if (path.dirname(file) !== storeRoot || !path.basename(file).startsWith("account-test-")) throw new Error("Unexpected test database path");
    for (const suffix of ["", "-wal", "-shm"]) rmSync(file + suffix, { force: true });
  }
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers();
  vi.restoreAllMocks();
  delete loginRuntime.__musicWorldQqLogin; delete loginRuntime.__musicWorldQqVaultKey; delete loginRuntime.__musicWorldQqProfiles;
});
const signal = () => new AbortController().signal;

describe("QQ QR login, identity and credential storage", () => {
  it("obtains a session-bound QR, then reports pending, scanned and confirmed account information", async () => {
    const qr = await startQqLogin(userId, signal());
    expect(qr.image).toMatch(/^data:image\/png;base64,/);
    expect(qr.loginId).toMatch(/^[a-f0-9]{32}$/);
    expect(await pollQqLogin(userId, signal(), qr.loginId)).toMatchObject({ status: "pending" });
    code = "67";
    expect(await pollQqLogin(userId, signal(), qr.loginId)).toMatchObject({ status: "scanned" });
    code = "0";
    const loggedIn = await pollQqLogin(userId, signal(), qr.loginId);
    expect(loggedIn).toMatchObject({ status: "success", user: { id: "6789012", nickname: "音乐听众", avatar: expect.stringContaining("qlogo.cn") } });
    expect(JSON.stringify(loggedIn)).not.toMatch(/test-music-ticket|test-identity|cookie|qrsig/);
    expect(await qqAccountStatus(userId, signal())).toMatchObject({ authorized: true, user: loggedIn.user });
  });
  it("stores encrypted credentials and restores public identity independently of pending QR memory", async () => {
    await startQqLogin(userId, signal()); code = "0";
    await pollQqLogin(userId, signal());
    const row = state.context!.db.select().from(qqAccounts).where(eq(qqAccounts.userId, userId)).get()!;
    expect(row.credentials).not.toContain("test-music-ticket");
    expect(row.credentials.split(".")).toHaveLength(3);
    delete loginRuntime.__musicWorldQqLogin; delete loginRuntime.__musicWorldQqProfiles;
    expect(qqAccountCredentials(userId)?.cookie).toContain("test-music-ticket");
    expect(await qqAccountStatus(userId, signal())).toMatchObject({ authorized: true, user: { id: "6789012" } });
    const other = createSession(state.context!).userId;
    expect(await qqAccountStatus(other, signal())).toBeNull();
    expect(qqAccountCredentials(other)).toBeNull();
  });
  it("exchanges a generic QQ callback ticket on the QQ Connect host with its required application scope", async () => {
    await startQqLogin(userId, signal()); code = "0";
    expect(await pollQqLogin(userId, signal())).toMatchObject({ status: "success" });
    const checks = vi.mocked(fetch).mock.calls.filter(([input]) => new URL(String(input)).pathname === "/check_sig");
    expect(checks).toHaveLength(1);
    const [input, init] = checks[0];
    const url = new URL(String(input));
    expect(url.origin).toBe("https://ssl.ptlogin2.graph.qq.com");
    for (const [key, value] of Object.entries({ uin: "4201337", ptsigx: "fixture-signature", service: "ptqrlogin", aid: "716027609", daid: "383", pt_3rd_aid: "100497308", ptredirect: "100", s_url: "https://graph.qq.com/oauth2.0/login_jump" })) expect(url.searchParams.get(key)).toBe(value);
    expect(new Headers(init?.headers).get("referer")).toBe("https://xui.ptlogin2.qq.com/");
    const musicRequest = vi.mocked(fetch).mock.calls.find(([input]) => new URL(String(input)).pathname.endsWith("/musicu.fcg"))!;
    expect(JSON.parse(String(musicRequest[1]?.body)).comm.tmeLoginType).toBe(2);
  });
  it("keeps cookies across several QQ redirects before the authorization key is issued", async () => {
    const upstream = platformFetch();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/check_sig") return new Response("", { status: 302, headers: { location: "/connect/continue", "Set-Cookie": "ptcz=redirect-fixture; Path=/" } });
      if (url.pathname === "/connect/continue") {
        expect(new Headers(init?.headers).get("cookie")).toContain("ptcz=redirect-fixture");
        return new Response("", { status: 302, headers: { location: "https://graph.qq.com/oauth2.0/login_jump" } });
      }
      if (url.pathname === "/oauth2.0/login_jump") return new Response("", { headers: { "Set-Cookie": "p_skey=test-identity; Path=/, uin=o004201337; Path=/" } });
      return upstream(input, init);
    }));
    await startQqLogin(userId, signal()); code = "0";
    expect(await pollQqLogin(userId, signal())).toMatchObject({ status: "success" });
  });
  it("accepts joined Set-Cookie headers when the credential is not the first cookie", async () => {
    const upstream = platformFetch();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/check_sig") return new Response("", { status: 302, headers: { "Set-Cookie": "uin=o004201337; Expires=Wed, 21 Oct 2037 07:28:00 GMT; Path=/, p_skey=test-identity; Domain=.graph.qq.com; Path=/, ptcz=cookie-fixture; Path=/" } });
      if (url.pathname === "/oauth2.0/authorize") {
        const cookie = new Headers(init?.headers).get("cookie");
        expect(cookie).toContain("p_skey=test-identity");
        expect(cookie).toContain("ptcz=cookie-fixture");
      }
      return upstream(input, init);
    }));
    await startQqLogin(userId, signal()); code = "0";
    expect(await pollQqLogin(userId, signal())).toMatchObject({ status: "success" });
  });
  it("passes modern QQ authorization cookies through the official jump and requests nickname/avatar permission", async () => {
    const upstream = platformFetch();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/check_sig") return new Response("", { status: 302, headers: { location: "https://graph.qq.com/oauth2.0/login_jump", "Set-Cookie": "p_uin=o004201337; Path=/, p_skey=; Path=/, p_skey_forbid=1; Path=/, pt_oauth_token=modern-test-token; Path=/" } });
      if (url.pathname === "/oauth2.0/login_jump") {
        expect(new Headers(init?.headers).get("cookie")).toContain("pt_oauth_token=modern-test-token");
        return new Response("", { headers: { "Set-Cookie": "connect_marker=jump-fixture; Path=/" } });
      }
      if (url.pathname === "/oauth2.0/authorize") {
        const headers = new Headers(init?.headers);
        const body = new URLSearchParams(String(init?.body));
        expect(headers.get("cookie")).toContain("pt_oauth_token=modern-test-token");
        expect(headers.get("cookie")).toContain("connect_marker=jump-fixture");
        expect(headers.get("origin")).toBe("https://graph.qq.com");
        expect(new URL(headers.get("referer")!).pathname).toBe("/oauth2.0/show");
        expect(body.get("g_tk")).toBe("5381");
        expect(body.get("scope")).toBe("get_user_info");
        expect(body.get("openapi")).toBe("1010");
      }
      return upstream(input, init);
    }));
    await startQqLogin(userId, signal()); code = "0";
    const result = await pollQqLogin(userId, signal());
    expect(result).toMatchObject({ status: "success", user: { id: "6789012", nickname: "音乐听众" } });
    expect(JSON.stringify(result)).not.toContain("modern-test-token");
  });
  it("reports an authorization redirect without logging codes, account values or token parameters", async () => {
    const upstream = platformFetch();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/oauth2.0/authorize") return new Response("", { status: 302, headers: { location: "https://graph.qq.com/oauth2.0/show?error_code=100010&access_token=private-diagnostic-token&uin=4201337" } });
      return upstream(input, init);
    }));
    await startQqLogin(userId, signal()); code = "0";
    expect(await pollQqLogin(userId, signal())).toMatchObject({ status: "error" });
    const logs = JSON.stringify(warn.mock.calls);
    expect(logs).toContain("/oauth2.0/show");
    expect(logs).toContain("100010");
    expect(logs).not.toMatch(/private-diagnostic-token|fixture-signature|test-identity|4201337/);
    expect(state.context!.db.select().from(qqAccounts).all()).toHaveLength(0);
  });
  it("uses the QQ Music credential for the music profile token instead of the QQ identity key", async () => {
    await startQqLogin(userId, signal()); code = "0";
    expect(await pollQqLogin(userId, signal())).toMatchObject({ status: "success" });
    const profileCall = vi.mocked(fetch).mock.calls.find(([input]) => new URL(String(input)).pathname.endsWith("/fcg_get_profile_homepage.fcg"))!;
    const url = new URL(String(profileCall[0]));
    expect(url.searchParams.get("g_tk")).toBe("1464240484");
    expect(url.searchParams.get("userid")).toBe("6789012");
  });
  it("rejects off-platform credential redirects and logs only structural diagnostics", async () => {
    const upstream = platformFetch();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/check_sig") return new Response("", { status: 302, headers: { location: "https://attacker.invalid/collect", "Set-Cookie": "ptcz=private-test-value; Path=/" } });
      return upstream(input, init);
    }));
    await startQqLogin(userId, signal()); code = "0";
    expect(await pollQqLogin(userId, signal())).toMatchObject({ status: "error" });
    expect(vi.mocked(fetch).mock.calls.some(([input]) => new URL(String(input)).hostname === "attacker.invalid")).toBe(false);
    expect(state.context!.db.select().from(qqAccounts).all()).toHaveLength(0);
    const logs = JSON.stringify(warn.mock.calls);
    expect(logs).toContain("QQ_LOGIN_REDIRECT_INVALID");
    expect(logs).not.toMatch(/private-test-value|fixture-signature|4201337/);
  });
  it("does not claim QQ Music login from a QQ identity without a music credential", async () => {
    await startQqLogin(userId, signal()); code = "0"; musicKey = false;
    expect(await pollQqLogin(userId, signal())).toMatchObject({ status: "error" });
    expect(state.context!.db.select().from(qqAccounts).all()).toHaveLength(0);
    expect(await qqAccountStatus(userId, signal())).toBeNull();
  });
  it("restores encrypted account data after reopening the disk database and recreating the vault key", async () => {
    await startQqLogin(userId, signal()); code = "0";
    await pollQqLogin(userId, signal());
    const file = path.resolve("work/qq-integration/account-test-" + crypto.randomUUID() + ".db");
    mkdirSync(path.dirname(file), { recursive: true });
    persistenceFiles.push(file);
    await state.context!.sqlite.backup(file);
    state.context!.sqlite.close(); state.context = openDatabase(file);
    delete loginRuntime.__musicWorldQqVaultKey; delete loginRuntime.__musicWorldQqProfiles; delete loginRuntime.__musicWorldQqLogin;
    expect(await qqAccountStatus(userId, signal())).toMatchObject({ authorized: true, user: { id: "6789012", nickname: "音乐听众", avatar: expect.stringContaining("qlogo.cn") } });
  });
  it("isolates replaced QR requests and does not expose another browser session's login", async () => {
    const first = await startQqLogin(userId, signal());
    const next = await startQqLogin(userId, signal());
    expect(next.loginId).not.toBe(first.loginId);
    await expect(pollQqLogin(userId, signal(), first.loginId)).rejects.toMatchObject({ code: "QQ_QR_REPLACED" });
    const other = createSession(state.context!).userId;
    await expect(pollQqLogin(other, signal(), next.loginId)).rejects.toMatchObject({ code: "QQ_QR_MISSING" });
  });
  it("expires QR codes locally without contacting the upstream", async () => {
    const qr = await startQqLogin(userId, signal());
    vi.useFakeTimers(); vi.setSystemTime(qr.expiresAt + 1);
    expect(await pollQqLogin(userId, signal(), qr.loginId)).toMatchObject({ status: "expired" });
  });
  it("coalesces concurrent confirmation polls into one authorization exchange", async () => {
    const qr = await startQqLogin(userId, signal()); code = "0";
    const results = await Promise.all([pollQqLogin(userId, signal(), qr.loginId), pollQqLogin(userId, signal(), qr.loginId)]);
    expect(results.map(result => result.status)).toEqual(["success", "success"]);
    const calls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("oauth2.0/authorize"));
    expect(calls).toHaveLength(1);
  });
  it("reports confirmed upstream expiry, while preserving saved identity on a transient profile outage", async () => {
    await startQqLogin(userId, signal()); code = "0";
    await pollQqLogin(userId, signal());
    profileUnavailable = true;
    expect(await qqAccountStatus(userId, signal(), true)).toMatchObject({ authorized: true, profileAvailable: false, user: { nickname: "音乐听众" } });
    profileUnavailable = false; profileExpired = true;
    expect(await qqAccountStatus(userId, signal(), true)).toMatchObject({ authorized: false });
  });
  it("logout removes credentials, identity cache and the pending QR", async () => {
    await startQqLogin(userId, signal()); code = "0";
    await pollQqLogin(userId, signal());
    await qqAccountStatus(userId, signal());
    await startQqLogin(userId, signal());
    logoutQqAccount(userId);
    expect(await qqAccountStatus(userId, signal())).toBeNull();
    expect(qqAccountCredentials(userId)).toBeNull();
    await expect(pollQqLogin(userId, signal())).rejects.toMatchObject({ code: "QQ_QR_MISSING" });
  });
});

describe("QQ public profile and callback parsing", () => {
  it("decodes escaped callback nicknames as data and only accepts QQ HTTPS redirects", () => {
    expect(parseQqLoginCallback("ptuiCB('67','0','','0','已扫码','O\\'Brien');")?.nickname).toBe("O'Brien");
    expect(parseQqLoginCallback("alert('0','0','https://qq.com','0','登录成功')")).toBeNull();
    expect(trustedQqLoginUrl("https://ptlogin4.y.qq.com/check_sig")).not.toBeNull();
    for (const url of ["http://qq.com", "https://qq.com.attacker.test", "https://user:pass@qq.com", "http://127.0.0.1"]) expect(trustedQqLoginUrl(url)).toBeNull();
  });
  it("normalizes public fields without leaking credentials or trusting a replacement identity", () => {
    const user = normalizeQqProfile({ data: { creator: { uin: "wrong-user", nick: "A&amp;B", headpic: "//q1.qlogo.cn/image" }, cookie: "private" } }, { id: "12345", nickname: "previous", avatar: "" });
    expect(user).toEqual({ id: "12345", nickname: "A&B", avatar: "https://q1.qlogo.cn/image" });
    expect(normalizeQqProfile({ data: { creator: { avatar: "javascript:alert(1)" } } }, user)).toEqual(user);
  });
});
