import "server-only";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { RequestError } from "@/lib/server/errors";
import { deleteAccount, readAccount, saveAccount } from "../platforms/accounts";
import { normalizeQqProfile, type QqUserProfile } from "./qq-profile";
import type { PlatformAccount, QqOAuthGrant } from "../platforms/types";
type Status = "pending" | "authorizing" | "success" | "expired" | "cancelled" | "error";
interface Job {
    id: string;
    owner: string;
    stateHash: Buffer;
    expiresAt: number;
    status: Status;
    message: string;
    abort: AbortController;
    user?: QqUserProfile;
    completion?: Promise<ReturnType<typeof publicJob>>;
}
interface VerifiedAccount extends PlatformAccount {
    oauth: QqOAuthGrant;
}
const runtime = globalThis as typeof globalThis & {
    qqOAuthJobs?: Map<string, Job>;
    qqOAuthProfiles?: Map<string, {
        token: string;
        until: number;
        user: QqUserProfile;
    }>;
    qqOAuthRefresh?: Map<string, Promise<VerifiedAccount>>;
};
const jobs = () => runtime.qqOAuthJobs ??= new Map();
const digest = (value: string) => createHash("sha256").update(value).digest();
const publicUser = (user: QqUserProfile): QqUserProfile => ({ ...user, avatar: user.avatar ? "/api/qq/avatar?v=" + createHash("sha256").update(user.avatar).digest("hex").slice(0, 12) : "" });
const publicJob = (job: Job) => ({ provider: "qq" as const, loginId: job.id, expiresAt: job.expiresAt, status: job.status, message: job.message, user: job.user && publicUser(job.user), nickname: job.user?.nickname });
export function qqOAuthConfig() {
    const appId = process.env.QQ_CONNECT_APP_ID?.trim() || "", secret = process.env.QQ_CONNECT_APP_SECRET?.trim() || "";
    const redirect = process.env.QQ_CONNECT_REDIRECT_URI?.trim() || "";
    if (!/^\d{5,32}$/.test(appId) || secret.length < 16 || secret.length > 512)
        return null;
    try {
        const url = new URL(redirect);
        if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))
            return null;
        if (url.username || url.password || url.search || url.hash || url.pathname !== "/api/qq/login/callback")
            return null;
        return { appId, secret, redirect: url.href };
    }
    catch {
        return null;
    }
}
export function qqOAuthAvailability() {
    return { loginAvailable: !!qqOAuthConfig(), loginMode: "oauth" as const,
        message: qqOAuthConfig() ? "通过 QQ 官方授权页面扫码连接账号。QQ 音乐播放需要单独授权。" : "尚未配置本应用的 QQ 官方授权。需要 QQ 互联 App ID、App Key 和登记回调地址。" };
}
/** Documented QQ Connect endpoints, without platform cookies or borrowed app IDs. */
async function official(endpoint: "token" | "me" | "profile", params: Record<string, string>, signal: AbortSignal): Promise<Record<string, unknown>> {
    const url = new URL(endpoint === "profile" ? "https://graph.qq.com/user/get_user_info" : `https://graph.qq.com/oauth2.0/${endpoint}`);
    Object.entries({ ...params, fmt: "json" }).forEach(([key, value]) => url.searchParams.set(key, value));
    try {
        const response = await fetch(url, { redirect: "error", credentials: "omit", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
        if (!response.ok)
            throw new Error("upstream");
        const reader = response.body?.getReader();
        if (!reader)
            throw new Error("empty");
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            for (;;) {
                const { value, done } = await reader.read();
                if (done)
                    break;
                size += value.length;
                if (size > 32768) {
                    await reader.cancel();
                    throw new Error("too-large");
                }
                chunks.push(value);
            }
        }
        finally {
            reader.releaseLock();
        }
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        let value: unknown;
        if (raw.startsWith("{"))
            value = JSON.parse(raw);
        else if (/^callback\s*\(/.test(raw))
            value = JSON.parse(raw.replace(/^callback\s*\(\s*/, "").replace(/\s*\)\s*;?\s*$/, ""));
        else
            value = Object.fromEntries(new URLSearchParams(raw));
        if (!value || typeof value !== "object" || Array.isArray(value))
            throw new Error("invalid");
        const record = value as Record<string, unknown>;
        if (record.error !== undefined || (endpoint === "profile" && Number(record.ret) !== 0))
            throw new RequestError(401, "QQ 官方授权或账号资料未通过校验，请重新连接。", "QQ_OAUTH_REJECTED");
        return record;
    }
    catch (error) {
        if (signal.aborted)
            throw signal.reason;
        if (error instanceof RequestError)
            throw error;
        // Exceptions and response bodies can contain tokens. Never expose/log them.
        throw new RequestError(502, "QQ 官方服务暂时无法响应，请稍后重试。", "QQ_OAUTH_UNAVAILABLE");
    }
}
function grant(value: Record<string, unknown>, appId: string): QqOAuthGrant {
    const token = value.access_token, seconds = Number(value.expires_in);
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{8,1024}$/.test(token) || !Number.isFinite(seconds) || seconds <= 0 || seconds > 90 * 86400)
        throw new RequestError(502, "QQ 官方授权未返回有效令牌。", "QQ_OAUTH_TOKEN_MISSING");
    return { kind: "qq-connect", appId, accessToken: token, expiresAt: Date.now() + seconds * 1000,
        refreshToken: typeof value.refresh_token === "string" && /^[A-Za-z0-9_-]{8,1024}$/.test(value.refresh_token) ? value.refresh_token : undefined };
}
async function profile(access: QqOAuthGrant, id: string, signal: AbortSignal) {
    const value = await official("profile", { access_token: access.accessToken, oauth_consumer_key: access.appId, openid: id }, signal);
    if (typeof value.nickname !== "string" || !value.nickname.replace(/[\u0000-\u001f\u007f]/g, "").trim())
        throw new RequestError(502, "QQ 官方接口尚未返回昵称，请重新连接。", "QQ_PROFILE_MISSING");
    return normalizeQqProfile(value, { id, nickname: "", avatar: "" });
}
async function verified(owner: string): Promise<VerifiedAccount | null> {
    const account = (await readAccount(owner, "qq")), config = qqOAuthConfig();
    if (!config || !account?.oauth || account.oauth.kind !== "qq-connect" || account.oauth.appId !== config.appId || !Number.isFinite(account.oauth.expiresAt) || !account.oauth.accessToken || !account.profile?.id || !account.profile.nickname)
        return null;
    return account as VerifiedAccount;
}
function cacheProfile(owner: string, account: VerifiedAccount) {
    const cache = runtime.qqOAuthProfiles ??= new Map();
    for (const [key, entry] of cache)
        if (entry.until <= Date.now())
            cache.delete(key);
    while (cache.size >= 500)
        cache.delete(cache.keys().next().value!);
    cache.set(owner, { token: account.oauth.accessToken, until: Math.min(account.oauth.expiresAt, Date.now() + 60000), user: account.profile });
}
const active = (job: Job) => jobs().get(job.owner) === job && !job.abort.signal.aborted && job.expiresAt > Date.now() && ["pending", "authorizing"].includes(job.status);
export function cancelQqOAuth(owner: string, id?: string) {
    const job = jobs().get(owner);
    if (job && (!id || id === job.id) && ["pending", "authorizing"].includes(job.status)) {
        job.status = "cancelled";
        job.message = "QQ 登录已取消。";
        job.abort.abort();
    }
    return { ok: true };
}
export async function logoutQqOAuth(owner: string) {
    cancelQqOAuth(owner);
    (await deleteAccount(owner, "qq"));
    runtime.qqOAuthProfiles?.delete(owner);
    return { provider: "qq" as const, ok: true, message: "已断开 QQ 账号。" };
}
export function startQqOAuth(owner: string, request?: Request) {
    const config = qqOAuthConfig();
    if (!config)
        throw new RequestError(503, qqOAuthAvailability().message, "QQ_OFFICIAL_CONFIG_REQUIRED");
    if (request) {
        const url = new URL(request.url), origin = process.env.APP_ORIGIN || new URL(url.protocol + "//" + (request.headers.get("host") || url.host)).origin;
        if (new URL(config.redirect).origin !== origin)
            throw new RequestError(503, "QQ 回调地址与当前站点不一致，请检查官方登记域名和 APP_ORIGIN。", "QQ_CALLBACK_ORIGIN_MISMATCH");
    }
    for (const [key, job] of jobs())
        if (job.expiresAt + 600000 <= Date.now()) {
            job.abort.abort();
            jobs().delete(key);
        }
    if (jobs().size >= 256 && !jobs().has(owner))
        throw new RequestError(429, "登录请求较多，请稍后重试。", "QQ_LOGIN_BUSY");
    cancelQqOAuth(owner);
    const state = randomBytes(32).toString("base64url");
    const job: Job = { owner, id: randomUUID(), stateHash: digest(state), status: "pending", expiresAt: Date.now() + 240000, abort: new AbortController(), message: "请在 QQ 官方授权页面扫码并确认。" };
    jobs().set(owner, job);
    const authorize = new URL("https://graph.qq.com/oauth2.0/authorize");
    Object.entries({ response_type: "code", client_id: config.appId, redirect_uri: config.redirect, scope: "get_user_info", state }).forEach(([key, value]) => authorize.searchParams.set(key, value));
    return { ...publicJob(job), authorizeUrl: authorize.href, image: "", expiresIn: 240000 };
}
export function pollQqOAuth(owner: string, id?: string) {
    const job = jobs().get(owner);
    if (!job || (id && id !== job.id))
        throw new RequestError(409, "本次 QQ 登录已更新，请重新连接。", "QQ_LOGIN_REPLACED");
    if (job.expiresAt <= Date.now() && ["pending", "authorizing"].includes(job.status)) {
        job.status = "expired";
        job.message = "QQ 登录已过期，请重新连接。";
        job.abort.abort();
    }
    return publicJob(job);
}
export async function completeQqOAuth(owner: string, state: string, code: string, denied = false) {
    const job = jobs().get(owner), config = qqOAuthConfig();
    if (!job || !config || state.length > 256 || !timingSafeEqual(job.stateHash, digest(state)))
        throw new RequestError(409, "QQ 登录状态校验失败，请重新连接。", "QQ_OAUTH_STATE_INVALID");
    if (job.completion)
        return job.completion;
    if (!active(job))
        return pollQqOAuth(owner, job.id);
    if (denied) {
        job.status = "cancelled";
        job.message = "你已取消 QQ 官方授权。";
        job.abort.abort();
        return publicJob(job);
    }
    if (!/^[A-Za-z0-9_-]{8,512}$/.test(code))
        throw new RequestError(400, "QQ 官方回调缺少授权码。", "QQ_OAUTH_CODE_MISSING");
    job.status = "authorizing";
    job.message = "正在通过官方接口获取 QQ 昵称和头像…";
    job.completion = (async () => {
        try {
            const access = grant(await official("token", { grant_type: "authorization_code", client_id: config.appId, client_secret: config.secret, redirect_uri: config.redirect, code }, job.abort.signal), config.appId);
            const identity = await official("me", { access_token: access.accessToken }, job.abort.signal);
            if (identity.client_id !== config.appId || typeof identity.openid !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(identity.openid))
                throw new RequestError(401, "QQ 身份不属于当前应用，请重新授权。", "QQ_OAUTH_IDENTITY_INVALID");
            const user = await profile(access, identity.openid, job.abort.signal);
            if (!active(job))
                return pollQqOAuth(owner, job.id);
            const account: VerifiedAccount = { cookie: "", oauth: access, profile: user };
            (await saveAccount(owner, "qq", account));
            cacheProfile(owner, account);
            job.user = user;
            job.status = "success";
            job.message = "QQ 账号已连接：" + user.nickname + "。QQ 音乐播放需另行授权。";
        }
        catch (error) {
            if (active(job)) {
                job.status = "error";
                job.message = error instanceof RequestError ? error.message : "QQ 授权未完成，请重新连接。";
            }
        }
        if (job.expiresAt <= Date.now() && ["pending", "authorizing"].includes(job.status)) {
            job.status = "expired";
            job.message = "QQ 登录已过期，请重新连接。";
        }
        return publicJob(job);
    })();
    return job.completion;
}
async function renew(owner: string, account: VerifiedAccount): Promise<VerifiedAccount> {
    const existing = runtime.qqOAuthRefresh ??= new Map();
    if (existing.has(owner))
        return existing.get(owner)!;
    const pending = (async () => {
        const signal = AbortSignal.timeout(20000);
        const config = qqOAuthConfig();
        if (!config || !account.oauth.refreshToken)
            throw new RequestError(401, "QQ 登录已过期，请重新连接。", "QQ_OAUTH_EXPIRED");
        const access = grant(await official("token", { grant_type: "refresh_token", client_id: config.appId, client_secret: config.secret, refresh_token: account.oauth.refreshToken }, signal), config.appId);
        const next: VerifiedAccount = { ...account, oauth: access };
        next.profile = await profile(access, account.profile.id, signal);
        if ((await verified(owner))?.oauth.accessToken !== account.oauth.accessToken)
            throw new RequestError(409, "QQ 账号连接已更新。", "QQ_LOGIN_REPLACED");
        (await saveAccount(owner, "qq", next));
        cacheProfile(owner, next);
        return next;
    })().finally(() => { if (existing.get(owner) === pending)
        existing.delete(owner); });
    existing.set(owner, pending);
    return pending;
}
export async function qqOAuthStatus(owner: string, signal: AbortSignal, refresh = false) {
    const availability = qqOAuthAvailability();
    const base = { provider: "qq" as const, configured: availability.loginAvailable, ...availability, musicAuthorized: false as const };
    let account = (await verified(owner));
    if (!account)
        return { ...base, authorized: false, profileAvailable: false };
    try {
        if (account.oauth.expiresAt <= Date.now() + 60000)
            account = await renew(owner, account);
        const cached = runtime.qqOAuthProfiles?.get(owner);
        const user = !refresh && cached?.token === account.oauth.accessToken && cached.until > Date.now() ? cached.user : await profile(account.oauth, account.profile.id, signal);
        signal.throwIfAborted();
        if ((await verified(owner))?.oauth.accessToken !== account.oauth.accessToken)
            throw new RequestError(409, "QQ 账号连接已更新。", "QQ_LOGIN_REPLACED");
        if (user.nickname !== account.profile.nickname || user.avatar !== account.profile.avatar) {
            account.profile = user;
            (await saveAccount(owner, "qq", account));
        }
        cacheProfile(owner, { ...account, profile: user });
        return { ...base, authorized: true, nickname: user.nickname, user: publicUser(user), profileAvailable: true, message: "QQ 账号已连接：" + user.nickname + "。QQ 音乐播放需另行授权。" };
    }
    catch (error) {
        if (signal.aborted)
            throw signal.reason;
        return { ...base, authorized: false, profileAvailable: false, message: error instanceof RequestError ? error.message : "暂时无法确认 QQ 账号，请稍后刷新。" };
    }
}
export async function qqOAuthAvatar(owner: string) { return (await verified(owner))?.profile.avatar || ""; }
