import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "@/lib/validation";
import { RequestError } from "@/lib/server/errors";

// Independently implemented adapter for radiohand's /api/qq/* contract.
// Account authorization stays in the operator's existing radiohand service.
const midSchema = z.string().regex(/^[A-Za-z0-9]{1,64}$/);
const musicEndpoint = "https://u.y.qq.com/cgi-bin/musicu.fcg";
const qqHeaders = { Referer: "https://y.qq.com/", "User-Agent": "Mozilla/5.0", "Content-Type": "application/json" };
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown, max = 200): string => typeof value === "string" || typeof value === "number" ? String(value).slice(0, max) : "";

export interface RadiohandSong {
  provider: "qq";
  mid: string;
  mediaMid: string;
  qqId: string;
  name: string;
  artist: string;
  albumMid: string;
  cover: string;
  duration: number;
  fee: number;
}

function serviceOrigin() {
  const configured = process.env.RADIOHAND_API_ORIGIN?.trim();
  if (!configured) return null;
  try {
    const origin = new URL(configured);
    const site = new URL(process.env.APP_ORIGIN ?? "http://127.0.0.1:3002");
    const local = (host: string) => ["127.0.0.1", "localhost", "[::1]"].includes(host);
    // radiohand owns a desktop account session. Bind this bridge to a local, single-user app.
    if (!local(origin.hostname) || !local(site.hostname) || !["http:", "https:"].includes(origin.protocol)
      || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash
      || origin.origin === site.origin) throw new Error("Invalid bridge origin");
    return origin.origin;
  } catch { throw new RequestError(503, "radiohand 接口地址需要是独立端口的本机服务。", "RADIOHAND_CONFIG_INVALID"); }
}

async function boundedBytes(response: Response, maximum: number) {
  if (Number(response.headers.get("content-length")) > maximum) throw new RequestError(502, "音乐接口返回的数据过大。", "UPSTREAM_TOO_LARGE");
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.length;
      if (length > maximum) { await reader.cancel(); throw new RequestError(502, "音乐接口返回的数据过大。", "UPSTREAM_TOO_LARGE"); }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

async function readJson(url: string | URL, signal: AbortSignal, payload?: unknown) {
  try {
    const response = await fetch(url, {
      method: payload ? "POST" : "GET", headers: qqHeaders, body: payload ? JSON.stringify(payload) : undefined,
      redirect: "error", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
    });
    if (!response.ok) throw new Error("Upstream failed");
    return record(JSON.parse(new TextDecoder().decode(await boundedBytes(response, 2 * 1024 * 1024))));
  } catch (cause) {
    if (cause instanceof RequestError) throw cause;
    throw new RequestError(502, "音乐接口暂时没有响应，请稍后重试。", "MUSIC_UPSTREAM_UNAVAILABLE");
  }
}

async function serviceJson(path: string, params: Record<string, string>, signal: AbortSignal) {
  const origin = serviceOrigin();
  if (!origin) throw new RequestError(503, "尚未连接已授权的 radiohand 服务，可先使用原创试听。", "RADIOHAND_NOT_CONFIGURED");
  const url = new URL(path, origin);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  return readJson(url, signal);
}

export async function radiohandStatus(signal: AbortSignal) {
  if (!serviceOrigin()) return { configured: false, authorized: false, provider: "qq", message: "QQ 歌曲搜索可用；在线播放等待连接已授权的 radiohand 服务。" };
  try {
    const result = await serviceJson("/api/qq/login/status", {}, signal);
    const authorized = result.loggedIn === true && result.partial !== true && result.playbackKeyReady !== false;
    return { configured: true, authorized, provider: "qq", message: authorized ? "radiohand 报告 QQ 音乐已授权，歌曲按账号权益播放。" : "radiohand 已连接，请先在该应用中完成 QQ 音乐授权。" };
  } catch { return { configured: true, authorized: false, provider: "qq", message: "radiohand 服务暂时无法连接，请检查它是否已经运行。" }; }
}

function songRecord(value: unknown, fallback: unknown = {}): RadiohandSong | null {
  const item = record(value), previous = record(fallback), album = record(item.album), file = record(item.file);
  const mid = text(item.mid || item.songmid || previous.mid, 64);
  if (!midSchema.safeParse(mid).success) return null;
  const albumMid = text(album.mid || item.albumMid || previous.albumMid, 64);
  const artists = list(item.singer).map((artist) => text(record(artist).name)).filter(Boolean).join(" / ");
  const duration = Number(item.interval) * 1000 || Number(item.duration) || Number(previous.duration) || 0;
  return {
    provider: "qq", mid, mediaMid: text(file.media_mid || item.mediaMid, 64), qqId: text(item.id || item.qqId || previous.qqId, 32),
    name: text(item.name || item.title || previous.name), artist: artists || text(item.artist || item.singer || previous.artist || previous.singer),
    albumMid: midSchema.safeParse(albumMid).success ? albumMid : "",
    cover: midSchema.safeParse(albumMid).success ? "/api/qq/cover?mid=" + encodeURIComponent(albumMid) : "",
    duration: Number.isFinite(duration) ? Math.max(0, Math.min(duration, 24 * 60 * 60 * 1000)) : 0,
    fee: Number(record(item.pay).pay_play || item.fee || 0) > 0 ? 1 : 0,
  };
}

export async function radiohandSearch(keywords: string, limit: number, signal: AbortSignal) {
  const query = z.string().trim().min(1).max(80).parse(keywords);
  const count = Math.max(1, Math.min(20, Math.floor(limit) || 8));
  if (serviceOrigin()) {
    try {
      const result = await serviceJson("/api/qq/search", { keywords: query, limit: String(count), offset: "0" }, signal);
      return list(result.songs).slice(0, count).map((song) => songRecord(song)).filter((song): song is RadiohandSong => !!song?.name);
    } catch (error) { if (!(error instanceof RequestError) || error.code !== "MUSIC_UPSTREAM_UNAVAILABLE") throw error; }
  }
  // The reference project's anonymous smartbox search works without account credentials.
  const url = new URL("https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg");
  for (const [key, value] of Object.entries({ key: query, format: "json", platform: "yqq.json", inCharset: "utf8", outCharset: "utf-8" })) url.searchParams.set(key, value);
  const data = await readJson(url, signal);
  const items = list(record(record(data.data).song).itemlist).slice(0, count);
  const songs = await Promise.all(items.map(async (value) => {
    const fallback = songRecord(value);
    if (!fallback) return null;
    try {
      const detail = await readJson(musicEndpoint, signal, { comm: { ct: 24, cv: 0 }, songinfo: { module: "music.pf_song_detail_svr", method: "get_song_detail_yqq", param: { song_mid: fallback.mid } } });
      return songRecord(record(record(detail.songinfo).data).track_info, fallback) ?? fallback;
    } catch { return fallback; }
  }));
  const seen = new Set<string>();
  return songs.filter((song): song is RadiohandSong => { if (!song?.name || seen.has(song.mid)) return false; seen.add(song.mid); return true; });
}

function allowedAudioUrl(value: unknown) {
  try {
    const url = new URL(text(value, 8192));
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash
      || !(url.hostname === "stream.qqmusic.qq.com" || url.hostname.endsWith(".stream.qqmusic.qq.com"))) throw new Error("Invalid audio host");
    return url.href;
  } catch { throw new RequestError(502, "音乐接口返回了不支持的播放地址。", "UNSUPPORTED_AUDIO_SOURCE"); }
}

interface AudioTicket { userId: string; url: string; expires: number }
const runtimeStore = globalThis as typeof globalThis & { __musicWorldAudioTickets?: Map<string, AudioTicket>; __musicWorldPlayerRates?: Map<string, { time: number; count: number }> };
function tickets() { return runtimeStore.__musicWorldAudioTickets ??= new Map(); }

export function limitPlayerRequests(userId: string) {
  const rates = runtimeStore.__musicWorldPlayerRates ??= new Map();
  const now = Date.now();
  for (const [key, entry] of rates) if (now - entry.time > 60000) rates.delete(key);
  const entry = rates.get(userId) ?? { time: now, count: 0 };
  if (++entry.count > 40 || rates.size > 2000) throw new RequestError(429, "操作太快了，请稍等一会儿再试。", "PLAYER_RATE_LIMIT");
  rates.set(userId, entry);
}

export async function radiohandSongUrl(userId: string, mid: string, mediaMid: string, signal: AbortSignal) {
  const songMid = midSchema.parse(mid);
  if (mediaMid) midSchema.parse(mediaMid);
  const status = await radiohandStatus(signal);
  if (!status.authorized) return { provider: "qq", url: "", playable: false, reason: "QQ_AUTH_REQUIRED", message: status.message };
  const result = await serviceJson("/api/qq/song/url", { mid: songMid, mediaMid, quality: "standard" }, signal);
  if (!result.url || result.playable === false) return { provider: "qq", url: "", playable: false, reason: "QQ_PLAYBACK_RESTRICTED", message: "这首歌暂时无法按当前账号权益播放，可在 QQ 音乐中查看。" };
  const url = allowedAudioUrl(result.url);
  const now = Date.now(), store = tickets();
  for (const [key, item] of store) if (item.expires <= now || store.size >= 200) store.delete(key);
  const ticket = randomBytes(32).toString("base64url");
  store.set(ticket, { userId, url, expires: now + 30 * 60 * 1000 });
  return { provider: "qq", url: "/api/qq/audio?ticket=" + ticket, playable: true, trial: result.trial === true, quality: text(result.quality, 40) || "标准音质" };
}

export async function radiohandLyric(mid: string, signal: AbortSignal) {
  const songMid = midSchema.parse(mid);
  if (serviceOrigin()) {
    const result = await serviceJson("/api/qq/lyric", { mid: songMid }, signal);
    return { provider: "qq", lyric: text(result.lyric, 512 * 1024) };
  }
  const result = await readJson(musicEndpoint, signal, { comm: { ct: 24, cv: 0 }, lyric: { module: "music.musichallSong.PlayLyricInfo", method: "GetPlayLyricInfo", param: { songMID: songMid } } });
  const value = text(record(record(result.lyric).data).lyric, 512 * 1024);
  return { provider: "qq", lyric: value.includes("[") ? value : Buffer.from(value, "base64").toString("utf8").slice(0, 512 * 1024) };
}

export async function radiohandCover(mid: string, signal: AbortSignal) {
  const albumMid = midSchema.parse(mid);
  const response = await fetch("https://y.gtimg.cn/music/photo_new/T002R800x800M000" + albumMid + ".jpg", { headers: { Referer: "https://y.qq.com/" }, redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
  const type = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (!response.ok || !["image/jpeg", "image/png", "image/webp"].includes(type)) throw new RequestError(404, "专辑封面暂不可用。", "COVER_UNAVAILABLE");
  return new Response(await boundedBytes(response, 3 * 1024 * 1024), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}

export async function radiohandAudio(userId: string, ticket: string, range: string | null, signal: AbortSignal) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) throw new RequestError(404, "播放请求无效。", "AUDIO_NOT_FOUND");
  const entry = tickets().get(ticket);
  if (!entry || entry.userId !== userId || entry.expires <= Date.now()) throw new RequestError(404, "播放地址已过期，请重新点击播放。", "AUDIO_NOT_FOUND");
  if (range && !/^bytes=\d{1,12}-\d{0,12}$/.test(range)) throw new RequestError(416, "音频范围无效。", "INVALID_AUDIO_RANGE");
  const headers: Record<string, string> = { Referer: "https://y.qq.com/", "User-Agent": "Mozilla/5.0" };
  if (range) headers.Range = range;
  const upstream = await fetch(entry.url, { headers, cache: "no-store", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(90000)]) });
  if (![200, 206].includes(upstream.status) || !upstream.body) throw new RequestError(502, "音频暂时无法读取，请重新播放。", "AUDIO_UPSTREAM_FAILED");
  const type = upstream.headers.get("content-type")?.split(";")[0] ?? "audio/mpeg";
  if (!/^(audio\/[a-z0-9.+-]+|video\/mp4|application\/octet-stream)$/i.test(type) || Number(upstream.headers.get("content-length")) > 300 * 1024 * 1024) {
    await upstream.body.cancel(); throw new RequestError(502, "音频格式不受支持。", "UNSUPPORTED_AUDIO_FORMAT");
  }
  const output = new Headers({ "Content-Type": type, "Cache-Control": "private, no-store", "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff", Vary: "Cookie" });
  for (const key of ["content-length", "content-range"]) { const value = upstream.headers.get(key); if (value) output.set(key, value); }
  return new Response(upstream.body, { status: upstream.status, headers: output });
}
