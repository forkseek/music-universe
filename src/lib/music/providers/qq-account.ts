import "server-only";
import { logoutQqOAuth, pollQqOAuth, qqOAuthStatus, startQqOAuth } from "./qq-oauth";
import { readAccount } from "../platforms/accounts";
import { desktopAvailable } from "../platforms/runtime";
import { readQqMusicProfile } from "./qq-music-session";

// Web OAuth and local official-window sessions have separate identity records.
export interface QqAccount { uin: string; nickname: string; avatar?: string; guid: string; cookie: string }
export interface QqPlayback { playable: boolean; url: string; quality: string; trial: boolean; reason: string; message: string }
export function qqAccountCredentials(userId: string): QqAccount | null { void userId; return null; }
export function qqAccountResolve(...request: [string, string, string, AbortSignal]): Promise<QqPlayback | null> { void request; return Promise.resolve(null); }
export async function qqAccountStatus(userId: string, signal: AbortSignal, refresh = false, request?: Request) {
  const available = desktopAvailable(request);
  const account = readAccount(userId, "qq");
  if (available || account?.loginMethod === "official-window") {
    const base = { provider: "qq" as const, configured: available, loginAvailable: available, loginMode: "window" as const, musicAuthorized: false };
    if (account?.loginMethod !== "official-window") return { ...base, authorized: false, profileAvailable: false, message: "通过本机助手打开 QQ 音乐官方窗口，扫码连接你的音乐账号。" };
    try {
      const user = await readQqMusicProfile(account.cookie, signal);
      return { ...base, authorized: true, profileAvailable: true, user, nickname: user.nickname, message: "已连接 QQ 音乐：" + user.nickname + "。曲目播放仍按平台权限处理。" };
    } catch {
      return { ...base, authorized: false, profileAvailable: false, message: "暂时无法确认 QQ 音乐会话，请刷新状态或重新连接。" };
    }
  }
  return qqOAuthStatus(userId, signal, refresh, request);
}
export const logoutQqAccount = logoutQqOAuth;
export function startQqLogin(userId: string, signal: AbortSignal, request?: Request) { signal.throwIfAborted(); return startQqOAuth(userId, request); }
export function pollQqLogin(userId: string, signal: AbortSignal, id?: string) { signal.throwIfAborted(); return Promise.resolve(pollQqOAuth(userId, id)); }

