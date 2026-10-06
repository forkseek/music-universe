import "server-only";
import { logoutQqOAuth, pollQqOAuth, qqOAuthStatus, startQqOAuth } from "./qq-oauth";

// Preserve callers while removing the borrowed QQ Music app and Cookie exchange.
export interface QqAccount { uin: string; nickname: string; avatar?: string; guid: string; cookie: string }
export interface QqPlayback { playable: boolean; url: string; quality: string; trial: boolean; reason: string; message: string }
export function qqAccountCredentials(userId: string): QqAccount | null { void userId; return null; }
export function qqAccountResolve(...request: [string, string, string, AbortSignal]): Promise<QqPlayback | null> { void request; return Promise.resolve(null); }
export const qqAccountStatus = qqOAuthStatus;
export const logoutQqAccount = logoutQqOAuth;
export function startQqLogin(userId: string, signal: AbortSignal, request?: Request) { signal.throwIfAborted(); return startQqOAuth(userId, request); }
export function pollQqLogin(userId: string, signal: AbortSignal, id?: string) { signal.throwIfAborted(); return Promise.resolve(pollQqOAuth(userId, id)); }

