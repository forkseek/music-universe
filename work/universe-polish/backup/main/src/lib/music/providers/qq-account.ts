import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { z } from "@/lib/validation";
import { RequestError } from "@/lib/server/errors";
import { getDatabase } from "@/db/connection";
import { qqAccounts } from "@/db/schema";
import { normalizeQqProfile, parseQqLoginCallback, qqCookieValues, qqMusicKey, trustedQqLoginUrl, type QqUserProfile } from "./qq-profile";

// In-page QQ Music login. Credentials obtained from the official QR flow are
// sealed with AES-256-GCM and stored in the local SQLite database, so playback
// can request per-account vkeys without any external desktop service.
const midSchema = z.string().regex(/^[A-Za-z0-9]{1,64}$/);
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const qqReferer = "https://y.qq.com/";
const loginU1 = "https://graph.qq.com/oauth2.0/login_jump";
const qqConnectParams = { response_type: "code", client_id: "100497308", redirect_uri: "https://y.qq.com/portal/wx_redirect.html?login_type=1&surl=https://y.qq.com/", scope: "get_user_info", state: "state" };
const qqConnectReferer = "https://graph.qq.com/oauth2.0/show?" + new URLSearchParams({ which: "Login", display: "pc", ...qqConnectParams });
const musicuEndpoint = "https://u.y.qq.com/cgi-bin/musicu.fcg";
const qrTimeoutMs = 180_000;
const audioHost = /(^|\.)stream\.qqmusic\.qq\.com$/;

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};

export interface QqAccount { uin: string; nickname: string; avatar?: string; guid: string; cookie: string }
export interface QqLoginState { provider: "qq"; status: "pending" | "scanned" | "expired" | "success" | "error"; message: string; nickname?: string; user?: QqUserProfile }
export interface QqPlayback { playable: boolean; url: string; quality: string; trial: boolean; reason: string; message: string }

interface PendingQr { id: string; qrsig: string; ptqrtoken: number; startedAt: number; completion?: Promise<QqLoginState> }

interface ProfileResult { user: QqUserProfile; expired: boolean; available: boolean }

const runtime = globalThis as typeof globalThis & {
  __musicWorldQqLogin?: Map<string, PendingQr>;
  __musicWorldQqVaultKey?: Buffer;
  __musicWorldQqProfiles?: Map<string, { credentials: string; expires: number; result: ProfileResult }>;
};
const pendingQr = () => runtime.__musicWorldQqLogin ??= new Map<string, PendingQr>();

function vaultKey() {
  if (runtime.__musicWorldQqVaultKey) return runtime.__musicWorldQqVaultKey;
  const secret = process.env.QQ_CREDENTIAL_SECRET?.trim();
  if (secret) return runtime.__musicWorldQqVaultKey = scryptSync(secret, "music-world-qq-vault", 32);
  const database = process.env.DATABASE_PATH ?? "./data/music-world.db";
  const file = path.join(path.dirname(path.resolve(/* turbopackIgnore: true */ database)), ".qq-vault-key");
  try {
    if (existsSync(file)) return runtime.__musicWorldQqVaultKey = Buffer.from(readFileSync(file, "utf8").trim(), "base64");
    mkdirSync(path.dirname(file), { recursive: true });
    const key = randomBytes(32);
    writeFileSync(file, key.toString("base64"), { mode: 0o600 });
    return runtime.__musicWorldQqVaultKey = key;
  } catch { throw new RequestError(500, "无法初始化本地凭证存储。", "QQ_VAULT_UNAVAILABLE"); }
}

function seal(account: QqAccount) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(account), "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

function unseal(payload: string): QqAccount | null {
  try {
    const [iv, tag, data] = payload.split(".");
    if (!iv || !tag || !data) return null;
    const decipher = createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plain = Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(plain) as Partial<QqAccount>;
    return { uin: String(parsed.uin ?? ""), nickname: String(parsed.nickname ?? ""), avatar: String(parsed.avatar ?? ""), guid: String(parsed.guid ?? ""), cookie: String(parsed.cookie ?? "") };
  } catch { return null; }
}

function hash33(value: string) { let hash = 0; for (let index = 0; index < value.length; ++index) hash += (hash << 5) + value.charCodeAt(index); return 2147483647 & hash; }
function gtkOf(pSkey: string) { let hash = 5381; for (let index = 0; index < pSkey.length; ++index) hash += (hash << 5) + pSkey.charCodeAt(index); return hash & 0x7fffffff; }
function randomGuid() {
  return "xxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.random() * 16 | 0;
    return (character === "x" ? value : (value & 0x3) | 0x8).toString(16);
  }).toUpperCase();
}
// The vkey endpoint expects a numeric guid (same formula as the official web
// client), not the UUID used for the authorize `ui` parameter.
function numericGuid() {
  return String((Math.round(2147483647 * Math.random()) * new Date().getUTCMilliseconds()) % 1e10);
}

function setCookieLines(response: Response) {
  const split = (line: string) => line.split(/,(?=\s*[A-Za-z0-9_-]+=)/);
  if (typeof response.headers.getSetCookie === "function") {
    const lines = response.headers.getSetCookie();
    // A proxy or upstream can join several cookies into one header even when
    // getSetCookie() exists. Normalize every line, including Expires dates.
    if (lines.length) return lines.flatMap(split);
  }
  // Fallback for runtimes without getSetCookie(): split the combined header on
  // commas that start a new `name=` pair (Expires dates contain commas too).
  const combined = response.headers.get("set-cookie");
  return combined ? split(combined) : [];
}
function mergeCookies(jar: Record<string, string>, lines: string[]) {
  for (const line of lines) {
    const pair = line.split(";")[0].trim();
    const index = pair.indexOf("=");
    if (index > 0) jar[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
  }
}
function cookieHeader(jar: Record<string, string>) { return Object.entries(jar).map(([key, value]) => key + "=" + value).join("; "); }
const diagnosticCookieName = (name: string) => name.replace(/_\d+$/, "_*");

export function qqAccountCredentials(userId: string) {
  const row = getDatabase().db.select().from(qqAccounts).where(eq(qqAccounts.userId, userId)).get();
  const account = row ? unseal(row.credentials) : null;
  return account && account.uin && qqMusicKey(account.cookie) ? account : null;
}

async function fetchQqProfile(account: QqAccount, signal: AbortSignal): Promise<ProfileResult> {
  const fallback = normalizeQqProfile({}, { id: account.uin, nickname: account.nickname, avatar: account.avatar ?? "" });
  const cookies = qqCookieValues(account.cookie);
  const url = new URL("https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg");
  for (const [key, value] of Object.entries({ cid: "205360838", userid: account.uin, loginUin: account.uin, hostUin: "0", reqfrom: "1", g_tk: String(gtkOf(qqMusicKey(account.cookie) || cookies.p_skey || cookies.skey || "")), format: "json", inCharset: "utf8", outCharset: "utf-8", platform: "yqq.json", needNewCode: "0" })) url.searchParams.set(key, value);
  try {
    const response = await fetch(url, { headers: { Cookie: account.cookie, Referer: qqReferer, "User-Agent": userAgent }, redirect: "error", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(6500)]) });
    if (!response.ok) return { user: fallback, expired: false, available: false };
    const raw = (await response.text()).slice(0, 256 * 1024);
    const value = record(JSON.parse(raw));
    if ([1000, 301].includes(Number(value.code)) || Number(value.result) === 301) return { user: fallback, expired: true, available: true };
    if (Number(value.code ?? 0) !== 0) return { user: fallback, expired: false, available: false };
    return { user: normalizeQqProfile(value, fallback), expired: false, available: true };
  } catch { return { user: fallback, expired: false, available: false }; }
}

export async function qqAccountStatus(userId: string, signal: AbortSignal, refresh = false) {
  const row = getDatabase().db.select().from(qqAccounts).where(eq(qqAccounts.userId, userId)).get();
  if (!row) return null;
  const account = unseal(row.credentials);
  if (!account?.uin || !qqMusicKey(account.cookie)) return { provider: "qq" as const, configured: true, authorized: false, message: "QQ 音乐登录凭证已失效，请重新扫码登录。" };
  const cache = runtime.__musicWorldQqProfiles ??= new Map();
  for (const [id, entry] of cache) if (entry.expires <= Date.now()) cache.delete(id);
  const previous = cache.get(userId);
  const profile = !refresh && previous?.credentials === row.credentials ? previous.result : await fetchQqProfile(account, signal);
  if (signal.aborted) throw signal.reason;
  if (profile.available && !profile.expired && (profile.user.nickname !== account.nickname || profile.user.avatar !== account.avatar)) {
    account.nickname = profile.user.nickname; account.avatar = profile.user.avatar;
    const credentials = seal(account);
    getDatabase().db.update(qqAccounts).set({ nickname: account.nickname, credentials }).where(eq(qqAccounts.userId, userId)).run();
    cache.set(userId, { credentials, expires: Date.now() + 60_000, result: profile });
  } else cache.set(userId, { credentials: row.credentials, expires: Date.now() + 60_000, result: profile });
  if (profile.expired) return { provider: "qq" as const, configured: true, authorized: false, message: "QQ 音乐登录已过期，请重新扫码。" };
  return {
    provider: "qq" as const, configured: true, authorized: true, nickname: profile.user.nickname, user: profile.user,
    profileAvailable: profile.available,
    message: profile.available ? "QQ 音乐已登录：" + profile.user.nickname : "QQ 音乐登录已保存，用户信息暂时无法刷新。",
  };
}

export function logoutQqAccount(userId: string) {
  getDatabase().db.delete(qqAccounts).where(eq(qqAccounts.userId, userId)).run();
  pendingQr().delete(userId);
  runtime.__musicWorldQqProfiles?.delete(userId);
  return { provider: "qq", ok: true, message: "已退出 QQ 音乐账号。" };
}

/** The local official login window returns the music session, never a generic QQ ticket. */
export async function connectOfficialQqAccount(userId: string, cookie: string, signal: AbortSignal, shouldSave: () => boolean) {
  if (cookie.length > 32768 || /[\r\n]/.test(cookie)) throw new RequestError(400, "QQ 音乐授权数据无效。", "QQ_COOKIE_INVALID");
  const values = qqCookieValues(cookie);
  const uin = (values.qqmusic_uin || values.uin || values.wxuin || "").replace(/^o0*/, "");
  if (!/^\d{1,20}$/.test(uin) || !qqMusicKey(cookie)) throw new RequestError(400, "QQ 账号已确认，音乐播放授权尚未完成。", "QQ_PLAYBACK_AUTH_INCOMPLETE");
  const fallback = normalizeQqProfile({}, { id: uin, nickname: values.qqmusic_nickname || values.wxnick || "", avatar: values.qqmusic_headurl || "" });
  const account: QqAccount = { uin, cookie, guid: numericGuid(), nickname: fallback.nickname, avatar: fallback.avatar };
  const profile = await fetchQqProfile(account, signal);
  if (profile.expired) throw new RequestError(401, "QQ 音乐授权已过期，请重新登录。", "QQ_AUTH_EXPIRED");
  if (!shouldSave()) throw new RequestError(409, "本次登录已取消。", "LOGIN_CANCELLED");
  account.nickname = profile.user.nickname; account.avatar = profile.user.avatar;
  const credentials = seal(account);
  getDatabase().db.insert(qqAccounts).values({ userId, nickname: account.nickname, uin, guid: account.guid, credentials, updatedAt: new Date() })
    .onConflictDoUpdate({ target: qqAccounts.userId, set: { nickname: account.nickname, uin, guid: account.guid, credentials, updatedAt: new Date() } }).run();
  runtime.__musicWorldQqProfiles?.delete(userId);
  return profile.user;
}

export async function startQqLogin(userId: string, signal: AbortSignal) {
  for (const [id, entry] of pendingQr()) if (Date.now() - entry.startedAt > qrTimeoutMs) pendingQr().delete(id);
  if (pendingQr().size >= 500 && !pendingQr().has(userId)) throw new RequestError(429, "登录请求较多，请稍后重试。", "QQ_LOGIN_BUSY");
  const url = new URL("https://ssl.ptlogin2.qq.com/ptqrshow");
  const params = { appid: "716027609", e: "2", l: "M", s: "3", d: "72", v: "4", t: String(Math.random()), daid: "383", pt_3rd_aid: "100497308", u1: loginU1 };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let response: Response;
  try {
    response = await fetch(url, { headers: { Referer: "https://xui.ptlogin2.qq.com/", "User-Agent": userAgent }, cache: "no-store", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) });
  } catch { throw new RequestError(502, "暂时无法获取 QQ 登录二维码，请稍后重试。", "QQ_QR_UNAVAILABLE"); }
  if (!response.ok) throw new RequestError(502, "暂时无法获取 QQ 登录二维码，请稍后重试。", "QQ_QR_UNAVAILABLE");
  const image = "data:image/png;base64," + Buffer.from(await response.arrayBuffer()).toString("base64");
  let qrsig = "";
  for (const line of setCookieLines(response)) { const matched = line.match(/(?:^|;\s*)qrsig=([^;]+)/); if (matched) { qrsig = matched[1]; break; } }
  if (!qrsig) throw new RequestError(502, "QQ 登录二维码无效，请重试。", "QQ_QR_INVALID");
  const entry = { id: randomBytes(16).toString("hex"), qrsig, ptqrtoken: hash33(qrsig), startedAt: Date.now() };
  pendingQr().set(userId, entry);
  console.info("[qq-login] QR issued", { flow: "qq-connect-4" });
  return { provider: "qq" as const, image, loginId: entry.id, expiresAt: entry.startedAt + qrTimeoutMs, expiresIn: qrTimeoutMs, flowVersion: "qq-connect-4" };
}

export async function pollQqLogin(userId: string, signal: AbortSignal, loginId?: string): Promise<QqLoginState> {
  const entry = pendingQr().get(userId);
  if (!entry) throw new RequestError(409, "二维码已失效，请重新获取。", "QQ_QR_MISSING");
  if (loginId && entry.id !== loginId) throw new RequestError(409, "二维码已刷新，请扫描当前二维码。", "QQ_QR_REPLACED");
  if (entry.completion) return entry.completion;
  if (Date.now() - entry.startedAt > qrTimeoutMs) {
    pendingQr().delete(userId);
    return { provider: "qq", status: "expired", message: "二维码已过期，请刷新后重新扫码。" };
  }
  const url = new URL("https://ssl.ptlogin2.qq.com/ptqrlogin");
  const params = { u1: loginU1, ptqrtoken: String(entry.ptqrtoken), ptredirect: "0", h: "1", t: "1", g: "1", from_ui: "1", ptlang: "2052", action: "0-0-" + Date.now(), js_ver: "23111510", js_type: "1", login_sig: "", pt_uistyle: "40", aid: "716027609", daid: "383", pt_3rd_aid: "100497308" };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let body = "";
  let upstreamStatus = 0;
  const seedCookies: string[] = [];
  try {
    const response = await fetch(url, { headers: { Cookie: "qrsig=" + entry.qrsig, Referer: "https://xui.ptlogin2.qq.com/", "User-Agent": userAgent }, cache: "no-store", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) });
    upstreamStatus = response.status;
    seedCookies.push(...setCookieLines(response));
    body = (await response.text()).slice(0, 8192);
  } catch { return { provider: "qq", status: "pending", message: "正在等待扫码结果…" }; }
  const callback = parseQqLoginCallback(body);
  const code = callback?.code ?? "";
  if (code === "65" || body.includes("已失效")) {
    pendingQr().delete(userId);
    return { provider: "qq", status: "expired", message: "二维码已过期，请刷新后重新扫码。" };
  }
  if (code === "67") return { provider: "qq", status: "scanned", message: "已扫码，请在手机上确认登录。" };
  if (code === "66") return { provider: "qq", status: "pending", message: "请用手机 QQ 扫描二维码。" };
  if (code !== "0") {
    console.warn("[qq-login] QR confirmation incomplete", { upstreamStatus, platformCode: code || "unparsed" });
    return { provider: "qq", status: "error", message: "QQ 扫码登录未完成，请刷新二维码重试。" };
  }
  if (entry.completion) return entry.completion;
  if (pendingQr().get(userId) !== entry) return { provider: "qq", status: "error", message: "二维码已刷新，请扫描当前二维码。" };
  entry.completion = (async (): Promise<QqLoginState> => { try {
    const account = await completeQqLogin(body, seedCookies, signal);
    if (pendingQr().get(userId) !== entry) return { provider: "qq", status: "error", message: "二维码已更新，请重新扫码。" };
    const credentials = seal(account);
    getDatabase().db.insert(qqAccounts).values({ userId, nickname: account.nickname, uin: account.uin, guid: account.guid, credentials, updatedAt: new Date() })
      .onConflictDoUpdate({ target: qqAccounts.userId, set: { nickname: account.nickname, uin: account.uin, guid: account.guid, credentials, updatedAt: new Date() } }).run();
    console.info("[qq-login] QQ Music account connected", { hasNickname: Boolean(account.nickname), hasAvatar: Boolean(account.avatar) });
    runtime.__musicWorldQqProfiles?.delete(userId);
    return { provider: "qq", status: "success", message: "QQ 音乐登录成功。", nickname: account.nickname, user: normalizeQqProfile({}, { id: account.uin, nickname: account.nickname, avatar: account.avatar ?? "" }) };
  } catch (error) {
    console.warn("[qq-login] authorization failed", { code: error instanceof RequestError ? error.code : "QQ_LOGIN_UNKNOWN" });
    return { provider: "qq", status: "error", message: error instanceof RequestError ? error.message : "登录未能完成，请重试。" };
  } finally { if (pendingQr().get(userId) === entry) pendingQr().delete(userId); } })();
  return entry.completion;
}

async function completeQqLogin(callback: string, seedCookies: string[], signal: AbortSignal): Promise<QqAccount> {
  const sig = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
  const details = parseQqLoginCallback(callback);
  const callbackUrl = details && trustedQqLoginUrl(details.callbackUrl);
  if (!callbackUrl) throw new RequestError(502, "QQ 登录回调地址无效。", "QQ_LOGIN_CALLBACK_INVALID");
  const qqUin = callbackUrl.searchParams.get("uin") ?? "";
  const signature = callbackUrl.searchParams.get("ptsigx") ?? "";
  if (callbackUrl.pathname !== "/check_sig" || !/^\d{1,20}$/.test(qqUin) || !signature || signature.length > 2048) {
    throw new RequestError(502, "QQ 登录回调缺少授权信息，请刷新二维码重新扫码。", "QQ_LOGIN_CALLBACK_INCOMPLETE");
  }
  // The QR callback can target a generic ptlogin host. QQ Connect requires
  // exchanging that ticket on the graph-scoped host for authorization cookies.
  const checkSigUrl = new URL("https://ssl.ptlogin2.graph.qq.com/check_sig");
  for (const [key, value] of Object.entries({
    uin: qqUin, pttype: "1", service: "ptqrlogin", nodirect: "0", ptsigx: signature,
    s_url: loginU1, ptlang: "2052", ptredirect: "100", aid: "716027609", daid: "383",
    j_later: "0", low_login_hour: "0", regmaster: "0", pt_login_type: "3", pt_aid: "0",
    pt_aaid: "16", pt_light: "0", pt_3rd_aid: "100497308",
  })) checkSigUrl.searchParams.set(key, value);
  const jar: Record<string, string> = {};
  mergeCookies(jar, seedCookies);
  // Mirror a browser: replay the cookies from ptqrlogin while exchanging for
  // the login ticket.
  const warmHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { Referer: "https://xui.ptlogin2.qq.com/", "User-Agent": userAgent };
    const cookie = cookieHeader(jar);
    if (cookie) headers.Cookie = cookie;
    return headers;
  };
  let destination: URL | null = checkSigUrl;
  const hops: { host: string; status: number; cookieNames: string[] }[] = [];
  for (let index = 0; index < 5 && destination; index++) {
    const response: Response = await fetch(destination, { redirect: "manual", headers: warmHeaders(), cache: "no-store", signal: sig });
    const cookies = setCookieLines(response);
    mergeCookies(jar, cookies);
    hops.push({ host: destination.hostname, status: response.status, cookieNames: cookies.map(line => diagnosticCookieName(line.split("=", 1)[0].trim())) });
    if (response.status >= 400) throw new RequestError(502, "QQ 互联授权服务暂时不可用，请稍后重新扫码。", "QQ_LOGIN_EXCHANGE_UNAVAILABLE");
    const location: string | null = response.headers.get("location");
    destination = location && [301, 302, 303, 307, 308].includes(response.status) ? trustedQqLoginUrl(location, destination.href) : null;
    if (location && !destination) throw new RequestError(502, "QQ 授权跳转地址无效，请重新扫码。", "QQ_LOGIN_REDIRECT_INVALID");
  }
  // Current QQ accounts can have p_skey_forbid and an empty p_skey while
  // receiving pt_oauth_token. The official Q.getToken() uses p_skey || "",
  // yielding 5381 in this case; the authorization endpoint validates the jar.
  // A music account is accepted only after QQLogin returns its music key.
  const pSkey = jar.p_skey || "";
  const credentialMode = pSkey ? "legacy" : jar.pt_oauth_token ? "oauth-token" : "web-session";
  console.info("[qq-login] exchanging QQ Connect authorization", { credentialMode });
  const authorize = new URLSearchParams();
  // Match the official authorization page's current nickname/avatar permission
  // and browser origin. The removed friends permission is not needed here.
  const authorizeParams = { ...qqConnectParams, switch: "", from_ptlogin: "1", src: "1", update_auth: "1", openapi: "1010", g_tk: String(gtkOf(pSkey)), auth_time: String(Date.now()), ui: randomGuid() };
  for (const [key, value] of Object.entries(authorizeParams)) authorize.set(key, value);
  const authorized = await fetch("https://graph.qq.com/oauth2.0/authorize", { method: "POST", body: authorize, redirect: "manual", headers: { Cookie: cookieHeader(jar), Referer: qqConnectReferer, Origin: "https://graph.qq.com", "User-Agent": userAgent }, cache: "no-store", signal: sig });
  mergeCookies(jar, setCookieLines(authorized));
  const authorizationRedirect = trustedQqLoginUrl(authorized.headers.get("location") ?? "", "https://graph.qq.com/");
  const code = authorizationRedirect?.searchParams.get("code");
  if (!code) {
    const redirectPath = authorizationRedirect?.pathname;
    const knownPath = ["/oauth2.0/show", "/oauth2.0/login_jump", "/portal/wx_redirect.html"].includes(redirectPath ?? "") ? redirectPath : "other";
    const upstreamError = authorizationRedirect?.searchParams.get("error_code") ?? authorizationRedirect?.searchParams.get("error");
    console.warn("[qq-login] QQ Connect authorization code missing", { status: authorized.status, credentialMode, hops, cookieNames: Object.keys(jar).map(diagnosticCookieName).sort(), redirect: { host: authorizationRedirect?.hostname, path: knownPath, parameterNames: authorizationRedirect ? [...authorizationRedirect.searchParams.keys()].map(diagnosticCookieName) : [], errorCode: upstreamError && /^\d{1,12}$/.test(upstreamError) ? upstreamError : undefined } });
    throw new RequestError(502, "QQ 账号已确认，但 QQ 音乐授权未完成，请重新扫码确认。", "QQ_LOGIN_CODE_MISSING");
  }
  const login = await fetch(musicuEndpoint, {
    method: "POST", headers: { "Content-Type": "application/json", Referer: qqReferer, "User-Agent": userAgent, Cookie: cookieHeader(jar) },
    body: JSON.stringify({ comm: { g_tk: gtkOf(pSkey), platform: "yqq", ct: 24, cv: 0, tmeLoginType: 2 }, req: { module: "QQConnectLogin.LoginServer", method: "QQLogin", param: { code } } }),
    redirect: "error", cache: "no-store", signal: sig,
  });
  if (!login.ok) throw new RequestError(502, "QQ 音乐登录接口暂时不可用。", "QQ_LOGIN_UPSTREAM_FAILED");
  mergeCookies(jar, setCookieLines(login));
  let parsed: RecordValue = {};
  try { parsed = record(await login.json()); } catch { parsed = {}; }
  const data = record(record(parsed.req).data);
  if (Number(parsed.code ?? 0) !== 0 || Number(record(parsed.req).code ?? 0) !== 0) {
    console.warn("[qq-login] QQ Music grant rejected", { platformCode: Number(record(parsed.req).code ?? parsed.code ?? 0) });
    throw new RequestError(502, "QQ 音乐授权未完成，请重新扫码确认。", "QQ_MUSIC_AUTH_REJECTED");
  }
  // A QQ identity alone does not prove that QQ Music authorization completed.
  const uin = String(data.musicid ?? jar.qqmusic_uin ?? data.uin ?? jar.uin ?? "").replace(/\D/g, "");
  if (!uin) throw new RequestError(502, "QQ 音乐登录未返回账号信息，请重试。", "QQ_LOGIN_UIN_MISSING");
  jar.uin = uin; jar.qqmusic_uin = uin;
  const musicKey = String(jar.qm_keyst ?? jar.qqmusic_key ?? data.musickey ?? "").trim();
  if (!musicKey) throw new RequestError(502, "QQ 账号已确认，但 QQ 音乐授权尚未完成，请重新扫码。", "QQ_MUSIC_KEY_MISSING");
  if (musicKey) { jar.qm_keyst = musicKey; jar.qqmusic_key = musicKey; }
  const user = normalizeQqProfile({ data }, { id: uin, nickname: details?.nickname ?? "", avatar: "" });
  const account: QqAccount = { uin, nickname: user.nickname, avatar: user.avatar, guid: numericGuid(), cookie: cookieHeader(jar) };
  const profile = await fetchQqProfile(account, signal);
  if (profile.expired) throw new RequestError(502, "QQ 音乐授权已失效，请刷新二维码重试。", "QQ_LOGIN_EXPIRED");
  return { ...account, nickname: profile.user.nickname, avatar: profile.user.avatar };
}

function allowedAudioUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash || !audioHost.test(url.hostname)) throw new Error("Invalid audio host");
    return url.href;
  } catch { throw new RequestError(502, "QQ 音乐返回了不支持的播放地址。", "UNSUPPORTED_AUDIO_SOURCE"); }
}

async function requestVkey(account: QqAccount, songMid: string, mediaMid: string, fileName: string, signal: AbortSignal) {
  const param: RecordValue = { guid: account.guid || "10000", songmid: [songMid], songtype: [0], uin: account.uin, loginflag: 1, platform: "20" };
  if (fileName) param.filename = [fileName];
  const response = await fetch(musicuEndpoint, {
    method: "POST", headers: { "Content-Type": "application/json", Referer: qqReferer, "User-Agent": userAgent, Cookie: account.cookie },
    body: JSON.stringify({ comm: { uin: account.uin, format: "json", ct: 24, cv: 0 }, req_0: { module: "vkey.GetVkeyServer", method: "CgiGetVkey", param } }),
    redirect: "error", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
  });
  if (!response.ok) return { purl: "", sip: "" };
  let parsed: RecordValue = {};
  try { parsed = record(await response.json()); } catch { return { purl: "", sip: "" }; }
  const data = record(record(parsed.req_0).data);
  const info = Array.isArray(data.midurlinfo) ? record(data.midurlinfo[0]) : {};
  const sipList = (Array.isArray(data.sip) ? data.sip : []).filter((item): item is string => typeof item === "string");
  // The official client skips the `http://ws` CDN host, which blocks direct
  // browser playback.
  const sip = sipList.find((item) => !item.startsWith("http://ws")) ?? sipList[0] ?? "";
  return { purl: typeof info.purl === "string" ? info.purl : "", sip };
}

export async function qqAccountResolve(userId: string, mid: string, mediaMid: string, signal: AbortSignal): Promise<QqPlayback | null> {
  const row = getDatabase().db.select({ credentials: qqAccounts.credentials })
    .from(qqAccounts).where(eq(qqAccounts.userId, userId)).get();
  if (!row) return null;
  const account = unseal(row.credentials);
  if (!account?.cookie || !account.uin) {
    getDatabase().db.delete(qqAccounts).where(eq(qqAccounts.userId, userId)).run();
    return null;
  }
  const songMid = midSchema.parse(mid);
  if (mediaMid) midSchema.parse(mediaMid);
  // Match the official filename rule: M500{songmid}{mediaId || songmid}.mp3,
  // then the m4a variant, then a bare request as a last resort.
  const media = mediaMid || songMid;
  const candidates = ["M500" + songMid + media + ".mp3", "C400" + songMid + media + ".m4a", ""];
  for (const fileName of candidates) {
    const { purl, sip } = await requestVkey(account, songMid, mediaMid, fileName, signal);
    console.info("[qq-login] vkey file=" + (fileName || "(default)") + " hasPurl=" + Boolean(purl) + " sip=" + (sip ? new URL(sip).hostname : ""));
    if (!purl) continue;
    const base = (sip || "https://isure.stream.qqmusic.qq.com/").replace(/^http:/, "https:");
    const url = allowedAudioUrl(new URL(purl, base.endsWith("/") ? base : base + "/").href);
    return { playable: true, url, quality: "标准音质", trial: false, reason: "", message: "" };
  }
  return { playable: false, url: "", quality: "", trial: false, reason: "QQ_PLAYBACK_RESTRICTED", message: "这首歌暂时无法按当前账号权益播放，可在 QQ 音乐中查看。" };
}
