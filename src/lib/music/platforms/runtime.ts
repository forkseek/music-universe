import "server-only";
import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { RequestError } from "@/lib/server/errors";
import type { Platform, Values } from "./types";

export function integrationRoot() { return process.env.MUSIC_INTEGRATION_ROOT || path.join(process.cwd(), "integrations/mineradio"); }
export function electronPath() {
  return path.resolve(/* turbopackIgnore: true */ integrationRoot(), "../../node_modules/electron/dist", process.platform === "win32" ? "electron.exe" : process.platform === "darwin" ? "Electron.app/Contents/MacOS/Electron" : "electron");
}
export function desktopAvailable(request?: Request) {
  if (process.env.MUSIC_DESKTOP_LOGIN === "0" || process.env.NETLIFY === "true" || !existsSync(electronPath())) return false;
  // A server's installed Electron cannot open a login window on a remote visitor's computer.
  // Check the public origin as well as Host, including reverse proxies with an internal URL.
  try {
    const origins: URL[] = [];
    if (process.env.APP_ORIGIN?.trim()) origins.push(new URL(process.env.APP_ORIGIN.trim()));
    if (request) {
      const url = new URL(request.url);
      origins.push(new URL(url.protocol + "//" + (request.headers.get("host") || url.host)));
    }
    return origins.every(url => ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  } catch { return false; }
}
interface Pending { resolve: (v: Values) => void; reject: (e: Error) => void; cleanup: () => void }
interface WorkerState { child: ChildProcess; pending: Map<string, Pending> }
const runtime = globalThis as typeof globalThis & { musicPlatformWorker?: WorkerState };
function worker() {
  if (runtime.musicPlatformWorker?.child.connected) return runtime.musicPlatformWorker;
  const child = fork(path.join(/* turbopackIgnore: true */ integrationRoot(), "worker.cjs"), [], {
    stdio: ["ignore", "ignore", "ignore", "ipc"], serialization: "advanced", windowsHide: true,
    execArgv: [], env: { ...process.env },
  });
  const state: WorkerState = { child, pending: new Map() };
  runtime.musicPlatformWorker = state;
  child.on("message", (value: unknown) => {
    const message = value as { id: string; error?: string; result?: Values };
    const pending = state.pending.get(message.id);
    if (!pending) return;
    pending.cleanup(); state.pending.delete(message.id);
    if (message.error) pending.reject(new RequestError(502, "音乐平台暂时无法响应，请稍后重试。", "PLATFORM_UNAVAILABLE"));
    else pending.resolve(message.result ?? {});
  });
  const close = () => {
    for (const p of state.pending.values()) { p.cleanup(); p.reject(new RequestError(503, "音乐连接已中断，请重试。", "BRIDGE_DISCONNECTED")); }
    state.pending.clear();
    if (runtime.musicPlatformWorker === state) runtime.musicPlatformWorker = undefined;
  };
  child.on("error", close); child.on("exit", close);
  return state;
}
export function platformCall(provider: Platform, action: string, args: Values = {}, cookie = "", signal?: AbortSignal): Promise<Values> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const state = worker();
  if (state.pending.size >= 32) throw new RequestError(429, "音乐平台正在处理其他请求，请稍后重试。", "PLATFORM_BUSY");
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const abort = () => { state.pending.delete(id); cleanup(); reject(new RequestError(504, "音乐平台响应较慢，请稍后重试。", "PLATFORM_TIMEOUT")); };
    const timer = setTimeout(abort, action === "search" ? 25000 : 45000);
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
    state.pending.set(id, { resolve, reject, cleanup });
    signal?.addEventListener("abort", abort, { once: true });
    state.child.send({ id, provider, action, args, cookie }, error => { if (error) abort(); });
  });
}
