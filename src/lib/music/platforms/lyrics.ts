import "server-only";
import { RequestError } from "@/lib/server/errors";
import { radiohandLyric } from "../providers/radiohand-qq";
import { platformCall } from "./runtime";
import { platformLabels, record, type Platform } from "./types";

export interface PlatformLyrics {
  provider: Platform;
  trackId: string;
  lyric: string;
  available: boolean;
  message?: string;
}

/** Bounds apply to decoded UTF-8, not just the number of JavaScript characters. */
export const LYRIC_LIMITS = Object.freeze({
  maxBytes: 512 * 1024,
  timeoutMs: 12_000,
  ttlMs: 5 * 60_000,
  unavailableTtlMs: 20_000,
  entriesPerUser: 16,
  maxEntries: 128,
  maxCacheBytes: 16 * 1024 * 1024,
});

interface CachedLyrics { userId: string; result: PlatformLyrics; expires: number; bytes: number }
const runtime = globalThis as typeof globalThis & { musicLyrics?: Map<string, CachedLyrics> };
const cache = () => runtime.musicLyrics ??= new Map();
const unavailable = (provider: Platform, trackId: string, message = "这首歌曲暂未提供可用歌词，可导入本地 LRC。"):
  PlatformLyrics => ({ provider, trackId, lyric: "", available: false, message });

function validateIdentity(provider: Platform, trackId: string) {
  const valid = provider === "qq" ? /^[A-Za-z0-9]{1,64}$/.test(trackId)
    : provider === "netease" || provider === "qishui" ? /^\d{1,20}$/.test(trackId)
      : provider === "kugou" && /^[A-Za-z0-9_-]{1,100}$/.test(trackId);
  if (!Object.hasOwn(platformLabels, provider) || !valid) {
    throw new RequestError(400, "歌词需要有效的平台歌曲标识。", "LYRIC_ID_INVALID");
  }
}

function remember(userId: string, key: string, result: PlatformLyrics) {
  const entries = cache();
  for (const [id, entry] of entries) if (entry.expires <= Date.now()) entries.delete(id);
  entries.delete(key);
  let ownCount = 0, bytes = Buffer.byteLength(result.lyric, "utf8");
  for (const entry of entries.values()) { if (entry.userId === userId) ownCount++; bytes += entry.bytes; }
  for (const [id, entry] of entries) {
    if (ownCount < LYRIC_LIMITS.entriesPerUser) break;
    if (entry.userId === userId) { entries.delete(id); ownCount--; bytes -= entry.bytes; }
  }
  while (entries.size >= LYRIC_LIMITS.maxEntries || bytes > LYRIC_LIMITS.maxCacheBytes) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    bytes -= entries.get(oldest)!.bytes;
    entries.delete(oldest);
  }
  entries.set(key, {
    userId, result, bytes: Buffer.byteLength(result.lyric, "utf8"),
    expires: Date.now() + (result.available ? LYRIC_LIMITS.ttlMs : LYRIC_LIMITS.unavailableTtlMs),
  });
}

function normalize(provider: Platform, trackId: string, payload: unknown): PlatformLyrics {
  const value = record(payload);
  // If the adapter supplies an identity, it must match. Never recover by song title.
  const returnedId = value.trackId ?? value.id ?? value.hash;
  if (returnedId !== undefined && (provider === "kugou" ? String(returnedId).toLowerCase() !== trackId.toLowerCase() : String(returnedId) !== trackId)) return unavailable(provider, trackId);
  if (value.provider !== undefined && value.provider !== provider) return unavailable(provider, trackId);
  const raw = value.lyric;
  if (typeof raw !== "string" || raw.length > LYRIC_LIMITS.maxBytes || Buffer.byteLength(raw, "utf8") > LYRIC_LIMITS.maxBytes) {
    return unavailable(provider, trackId);
  }
  // Keep LRC line breaks and timestamps; the shared metadata text() helper removes them.
  const lyric = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  return lyric ? { provider, trackId, lyric, available: true } : unavailable(provider, trackId);
}

/** Uses the playing track's native platform ID only; no title search or cross-platform substitution. */
export async function readPlatformLyrics(userId: string, provider: Platform, trackId: string, signal: AbortSignal): Promise<PlatformLyrics> {
  signal.throwIfAborted();
  validateIdentity(provider, trackId);
  const key = JSON.stringify([userId, provider, trackId]);
  const hit = cache().get(key);
  if (hit && hit.expires > Date.now()) return { ...hit.result };
  // Kugou's existing lyric adapter needs the recording hash. A mix-song ID alone is insufficient.
  if (provider === "kugou" && !/^[a-fA-F0-9]{32}$/.test(trackId)) {
    return unavailable(provider, trackId, "当前酷狗曲目缺少歌词所需的歌曲 hash，可导入本地 LRC。");
  }

  const upstream = new AbortController();
  const linked = AbortSignal.any([signal, upstream.signal]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeAbort: (() => void) | undefined;
  try {
    const cancelled = new Promise<never>((_, reject) => {
      const abort = () => reject(linked.reason);
      linked.addEventListener("abort", abort, { once: true });
      removeAbort = () => linked.removeEventListener("abort", abort);
      timer = setTimeout(() => upstream.abort(new DOMException("Lyric lookup timed out", "TimeoutError")), LYRIC_LIMITS.timeoutMs);
    });
    // Public lyric lookups do not read or forward account Cookies or playback credentials.
    const request = provider === "qq" ? radiohandLyric(trackId, linked)
      : platformCall(provider, "lyrics", { id: trackId }, "", linked);
    const payload = await Promise.race([request, cancelled]);
    signal.throwIfAborted();
    const result = normalize(provider, trackId, payload);
    remember(userId, key, result);
    return { ...result };
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    // Upstream errors can contain account/request details; expose only a stable safe message.
    if (error instanceof RequestError && error.status === 429) throw error;
    return unavailable(provider, trackId, "歌词服务暂时没有响应，可稍后重试或导入本地 LRC。");
  } finally {
    if (timer) clearTimeout(timer);
    removeAbort?.();
  }
}
