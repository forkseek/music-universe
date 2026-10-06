import { parseLyrics, type ListeningTrack } from "@/components/player/player-library";
import type { RadiohandSong } from "./radiohand-qq";
import type { QqUserProfile } from "./qq-profile";

export interface ListeningConnection { configured: boolean; authorized: boolean; message: string; nickname?: string; user?: QqUserProfile; profileAvailable?: boolean }

let sessionReady: Promise<void> | null = null;
function ensureSession() {
  // Serialize creation of the first HttpOnly session before search/status/QR requests race.
  sessionReady ??= fetch("/api/qq/session", { headers: { "X-Music-World": "1" }, cache: "no-store" }).then(async response => {
    const result = await response.json();
    if (!response.ok || result.ready !== true) throw new Error(result.error?.message ?? "暂时无法创建音乐会话，请重试。");
  }).catch(error => { sessionReady = null; throw error; });
  return sessionReady;
}

async function responseJson<T>(path: string, signal?: AbortSignal, method = "GET"): Promise<T> {
  await ensureSession();
  signal?.throwIfAborted();
  const response = await fetch(path, { method, headers: { "X-Music-World": "1" }, cache: "no-store", signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? "音乐接口暂时不可用，请重试。");
  return result as T;
}

export function listeningConnection(signal?: AbortSignal, refresh = false) {
  return responseJson<ListeningConnection>("/api/qq/status" + (refresh ? "?refresh=1" : ""), signal);
}

export async function searchListeningPage(keywords: string, signal?: AbortSignal, page = 1) {
  const result = await responseJson<{ songs: RadiohandSong[]; query: string; page: number; hasMore: boolean; source?: string }>("/api/qq/search?keywords=" + encodeURIComponent(keywords) + "&limit=12&page=" + page, signal);
  const tracks = result.songs.map((song): ListeningTrack => ({
    id: crypto.randomUUID(), title: song.name, artist: song.artist || "QQ 音乐", album: song.album, duration: song.duration / 1000,
    genre: song.fee ? "会员曲目" : "在线歌曲", url: "", artwork: song.cover || "/media/scene-light.webp", source: "qqmusic", lyrics: [],
    description: "在熟悉的旋律里，遇见一个新的音乐世界。",
    online: { mid: song.mid, mediaMid: song.mediaMid, songId: song.qqId, albumMid: song.albumMid, fee: song.fee },
    externalUrl: "https://y.qq.com/n/ryqq/songDetail/" + encodeURIComponent(song.mid),
  }));
  return { tracks, query: result.query ?? keywords, page: result.page ?? page, hasMore: result.hasMore === true, source: result.source ?? "search" };
}

export async function searchListeningTracks(keywords: string, signal?: AbortSignal) {
  return (await searchListeningPage(keywords, signal)).tracks;
}

export async function resolveListeningAudio(track: ListeningTrack, signal?: AbortSignal) {
  if (track.source !== "qqmusic" || !track.online) return { url: track.url, quality: track.source === "local" ? "本地音乐" : "原创试听", trial: false };
  const query = new URLSearchParams({ mid: track.online.mid, mediaMid: track.online.mediaMid });
  const result = await responseJson<{ url: string; playable: boolean; message?: string; quality?: string; trial?: boolean }>("/api/qq/song/url?" + query, signal);
  if (!result.playable || !result.url) throw new Error(result.message ?? "这首歌暂时无法播放，可在 QQ 音乐中查看。");
  return { url: result.url, quality: result.quality ?? "标准音质", trial: result.trial === true };
}

export async function listeningLyrics(mid: string, signal?: AbortSignal) {
  const result = await responseJson<{ lyric: string }>("/api/qq/lyric?mid=" + encodeURIComponent(mid), signal);
  return parseLyrics(result.lyric);
}

export interface QrLoginStart { provider: "qq"; image: string; expiresIn: number; expiresAt: number; loginId: string }
export interface QrLoginPoll { provider: "qq"; status: "pending" | "scanned" | "expired" | "success" | "error"; message: string; nickname?: string; user?: QqUserProfile }

export function startQqLogin(signal?: AbortSignal) {
  return responseJson<QrLoginStart>("/api/qq/login/qr", signal);
}

export function pollQqLogin(signal?: AbortSignal, loginId?: string) {
  return responseJson<QrLoginPoll>("/api/qq/login/poll" + (loginId ? "?loginId=" + encodeURIComponent(loginId) : ""), signal);
}

export function logoutQqLogin(signal?: AbortSignal) {
  return responseJson<{ ok: boolean; message: string }>("/api/qq/login/logout", signal, "POST");
}
