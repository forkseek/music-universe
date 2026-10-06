import "server-only";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { RequestError } from "@/lib/server/errors";
import { logoutQqAccount, qqAccountStatus } from "../providers/qq-account";
import { cancelQqOAuth, pollQqOAuth, startQqOAuth } from "../providers/qq-oauth";
import { desktopAvailable, electronPath, integrationRoot, platformCall } from "./runtime";
import { deleteAccount, readAccount, saveAccount } from "./accounts";
import { platformLabels, record, text, type Platform, type MusicProfile, type PlatformStatus, type Values } from "./types";

type State = "pending" | "scanned" | "authorizing" | "success" | "expired" | "cancelled" | "error";
interface LoginJob { id: string; userId: string; provider: Platform; expiresAt: number; status: State; message: string; image?: string; key?: string; child?: ChildProcess; timer?: NodeJS.Timeout; polling?: Promise<void>; user?: MusicProfile }
const runtime = globalThis as typeof globalThis & { musicLoginJobs?: Map<string, LoginJob> };
const jobs = () => runtime.musicLoginJobs ??= new Map();
const keyOf = (userId: string, provider: Platform) => userId + ":" + provider;
const active = (job: LoginJob) => jobs().get(keyOf(job.userId, job.provider)) === job && ["pending", "scanned", "authorizing"].includes(job.status) && job.expiresAt > Date.now();
export function publicLogin(job: LoginJob) { return { loginId: job.id, provider: job.provider, status: job.status, message: job.message, expiresAt: job.expiresAt, image: job.image, user: job.user }; }
const terminal = (job: LoginJob, status: State, message: string) => { job.status = status; job.message = message; if (job.timer) clearTimeout(job.timer); job.child?.kill(); };

export function parsePlatformProfile(value: Values): MusicProfile {
  const rawAvatar = text(value.avatar || value.avatarUrl, 2048);
  let avatar = "";
  try { const url = new URL(rawAvatar); if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) { url.protocol = "https:"; avatar = url.href; } } catch { /* Optional profile artwork. */ }
  return { id: text(value.userId || value.id, 100), nickname: text(value.nickname, 100), avatar };
}
export async function platformStatus(userId: string, provider: Platform, signal: AbortSignal): Promise<PlatformStatus> {
  const loginMode = provider === "qq" || provider === "kugou" ? "window" : "qr";
  const base = { provider, loginMode, loginAvailable: provider === "netease" || desktopAvailable() } as const;
  if (provider === "qq") {
    const result = await qqAccountStatus(userId, signal);
    return { ...result, provider, user: "user" in result ? result.user : undefined };
  }
  const account = readAccount(userId, provider);
  if (!account) return { ...base, authorized: false, message: "连接账号后可按账号权益播放。" };
  try {
    const result = await platformCall(provider, "status", {}, account.cookie, signal);
    const authorized = result.loggedIn === true && result.reauthRequired !== true;
    const profile = parsePlatformProfile(result);
    const user = profile.id && profile.nickname ? profile : account.profile;
    return { ...base, authorized, user: authorized ? user : undefined, message: authorized ? "已连接 " + (user.nickname || platformLabels[provider]) : "登录已过期，请重新连接。" };
  } catch {
    return { ...base, authorized: false, user: account.profile, message: "账号已保存，暂时无法向平台确认登录状态，请稍后刷新。" };
  }
}

async function complete(job: LoginJob, cookie: string) {
  if (!active(job)) return;
  job.status = "authorizing"; job.message = "正在确认账号信息…";
  try {
    if (!cookie || cookie.length > 32768 || /[\r\n]/.test(cookie)) throw new Error("invalid");
    const signal = AbortSignal.timeout(45000);
    let profile: MusicProfile;
    {
      const result = await platformCall(job.provider, "status", {}, cookie, signal);
      if (result.loggedIn !== true || result.reauthRequired === true) throw new Error("expired");
      profile = parsePlatformProfile(result);
      if (!profile.id || !profile.nickname) throw new RequestError(502, "平台暂未返回用户信息，请重新连接。", "PROFILE_UNAVAILABLE");
      if (!active(job)) return;
      saveAccount(job.userId, job.provider, { cookie, profile });
    }
    if (!active(job)) return;
    job.user = profile; terminal(job, "success", "已连接 " + profile.nickname);
  } catch (error) {
    if (active(job)) terminal(job, "error", error instanceof RequestError ? error.message : "平台授权未完成，请重新连接账号。");
  }
}

export function cancelLogin(userId: string, provider: Platform, loginId?: string) {
  if (provider === "qq") return cancelQqOAuth(userId, loginId);
  const job = jobs().get(keyOf(userId, provider));
  if (job && (!loginId || job.id === loginId)) { terminal(job, "cancelled", "登录已取消。"); jobs().delete(keyOf(userId, provider)); }
  return { ok: true };
}
export function logoutPlatform(userId: string, provider: Platform) {
  cancelLogin(userId, provider); deleteAccount(userId, provider);
  if (provider === "qq") logoutQqAccount(userId);
  return { ok: true };
}
export async function startPlatformLogin(userId: string, provider: Platform, request: Request) {
  if (provider === "qq") return startQqOAuth(userId, request);
  if (provider !== "netease") {
    const host = (request.headers.get("host") || new URL(request.url).host).split(":")[0];
    if (!["127.0.0.1", "localhost"].includes(host) || !desktopAvailable()) throw new RequestError(409, "此平台需要本机官方登录窗口，请在本机运行应用。", "DESKTOP_LOGIN_UNAVAILABLE");
  }
  for (const [key, job] of jobs()) if (job.expiresAt <= Date.now()) { terminal(job, "expired", "二维码已过期，请重新连接。"); jobs().delete(key); }
  cancelLogin(userId, provider);
  if (jobs().size >= 16 || (provider !== "netease" && [...jobs().values()].filter(job => job.child && active(job)).length >= 2)) throw new RequestError(429, "请先完成或关闭其他登录窗口。", "LOGIN_BUSY");
  const job: LoginJob = { id: randomUUID(), userId, provider, expiresAt: Date.now() + 240000, status: "pending", message: "正在打开官方登录…" };
  jobs().set(keyOf(userId, provider), job);
  job.timer = setTimeout(() => { if (active(job) || job.expiresAt <= Date.now()) terminal(job, "expired", "登录已过期，请重新连接。"); }, 240000);
  job.timer.unref();
  try {
    if (provider === "netease") {
      const qr = await platformCall(provider, "qr", {}, "", request.signal);
      if (active(job)) { job.key = text(qr.key, 512); job.image = text(qr.image, 30000); job.message = "请用网易云音乐 App 扫码并确认。"; }
    } else {
      // A separate temporary Chromium profile for every login, removed on exit.
      const profileDir = mkdtempSync(path.join(tmpdir(), "music-world-login-"));
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
      const child = spawn(electronPath(), [path.join(/* turbopackIgnore: true */ integrationRoot(), "login.cjs"), provider, profileDir], { env, windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"] });
      job.child = child;
      child.on("message", (input: unknown) => {
        if (!active(job)) return;
        const message = record(input);
        if (message.status === "success") { if (job.status !== "authorizing") void complete(job, typeof message.cookie === "string" ? message.cookie : ""); return; }
        if (job.status === "authorizing") return;
        if (["pending", "scanned"].includes(String(message.status))) {
          job.status = message.status as State; job.message = text(message.message) || "请完成官方登录。";
          if (typeof message.image === "string" && /^data:image\/png;base64,/.test(message.image)) job.image = message.image.slice(0, 40000);
        } else if (["expired", "error", "cancelled"].includes(String(message.status))) terminal(job, message.status as State, text(message.message) || "登录未完成，请重新连接。");
      });
      child.on("error", () => terminal(job, "error", "无法打开本机登录窗口，请检查登录组件是否安装。"));
      child.on("exit", () => {
        if (active(job) && job.status !== "authorizing") terminal(job, "cancelled", "登录窗口已关闭。");
        // Only the exact directory created above is removed, never a user path.
        try { rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch { /* OS may hold a short-lived Chromium lock. */ }
      });
    }
  } catch (error) { terminal(job, "error", error instanceof RequestError ? error.message : "无法获取登录入口，请重试。"); }
  return publicLogin(job);
}
export async function pollPlatformLogin(userId: string, provider: Platform, id: string) {
  if (provider === "qq") return pollQqOAuth(userId, id);
  const job = jobs().get(keyOf(userId, provider));
  if (!job || job.id !== id) throw new RequestError(404, "登录已失效，请重新连接。", "LOGIN_NOT_FOUND");
  if (job.expiresAt <= Date.now() && ["pending", "scanned", "authorizing"].includes(job.status)) terminal(job, "expired", "登录已过期，请重新连接。");
  if (provider === "netease" && job.key && active(job)) {
    if (!job.polling) job.polling = (async () => {
      const result = await platformCall(provider, "poll", { key: job.key });
      if (!active(job)) return;
      if (result.code === 803) await complete(job, typeof result.cookie === "string" ? result.cookie : "");
      else if (result.code === 800) terminal(job, "expired", "二维码已过期，请重新连接。");
      else if (result.code === 802) { job.status = "scanned"; job.message = "已扫码，请在手机上确认。"; }
    })().finally(() => { job.polling = undefined; });
    await job.polling;
  }
  return publicLogin(job);
}
