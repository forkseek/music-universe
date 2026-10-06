import "server-only";
import { z } from "@/lib/validation";
import { RequestError } from "@/lib/server/errors";
import { radiohandAlbum } from "../providers/radiohand-qq";
import { readAccount } from "./accounts";
import { registerPlatformTrack } from "./catalog";
import { platformCall } from "./runtime";
import { locateAlbumTrack, matchesRecording, orderedAlbumTracks } from "./album-matching";
import { record, text, type AlbumResolution, type AlbumTrack, type Platform, type PlayingIdentity, type Values } from "./types";

const identitySchema = z.object({
  provider: z.enum(["qq", "netease", "kugou", "qishui"]).optional(), trackId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(),
  albumId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(), title: z.string().trim().min(1).max(300),
  artist: z.string().trim().min(1).max(300), album: z.string().trim().max(300).default(""),
  durationMs: z.number().finite().positive().max(86400000).optional(),
  discNumber: z.number().int().min(1).max(100).optional(), trackNumber: z.number().int().min(1).max(300).optional(),
});
interface CachedAlbum { raw: Values; until: number }
const globalAlbums = globalThis as typeof globalThis & { musicAlbumMetadata?: Map<string, CachedAlbum> };
const cache = () => globalAlbums.musicAlbumMetadata ??= new Map();
const supported = (p: Platform): p is "netease" | "qq" => p === "netease" || p === "qq";
const safeId = (p: Platform, id: string) => p === "netease" ? /^\d{1,20}$/.test(id) : /^[A-Za-z0-9]{1,64}$/.test(id);
const coverPath = (p: Platform, id: string) => p === "qq" ? "/api/qq/cover?mid=" + encodeURIComponent(id) : "/api/music/album/cover?provider=netease&id=" + encodeURIComponent(id);

async function nativeAlbum(provider: "netease" | "qq", albumId: string, trackId: string, cookie: string, signal: AbortSignal): Promise<Values> {
  signal.throwIfAborted();
  if ((!albumId && !trackId) || !safeId(provider, albumId || trackId)) throw new RequestError(400, "歌曲或专辑标识无效。", "ALBUM_ID_INVALID");
  const key = provider + ":" + (albumId || "song:" + trackId);
  const hit = cache().get(key);
  if (hit && hit.until > Date.now()) return hit.raw;
  const raw = provider === "qq" ? await radiohandAlbum(albumId, trackId, signal) as unknown as Values
    : await platformCall(provider, "album", { albumId, trackId }, cookie, signal);
  const id = text(raw.id, 100), tracks = Array.isArray(raw.tracks) ? raw.tracks : [];
  if (!safeId(provider, id) || !text(raw.name) || !text(raw.cover, 2048) || !tracks.length) throw new RequestError(502, "平台暂未返回完整的专辑信息。", "ALBUM_INCOMPLETE");
  if (tracks.length > 300 || Number(raw.total) > tracks.length) throw new RequestError(422, "该专辑曲目过多或平台只返回了部分曲目，暂时无法生成完整星系。", "ALBUM_INCOMPLETE");
  for (const [k, entry] of cache()) if (entry.until <= Date.now()) cache().delete(k);
  while (cache().size >= 200) cache().delete(cache().keys().next().value!);
  const entry = { raw, until: Date.now() + 15 * 60000 };
  cache().set(key, entry); cache().set(provider + ":" + id, entry);
  return raw;
}

function materialize(userId: string, provider: "netease" | "qq", raw: Values, identity: PlayingIdentity): AlbumResolution | null {
  const albumId = text(raw.id, 100), name = text(raw.name), cover = coverPath(provider, albumId);
  const values = orderedAlbumTracks<Values & { discNumber: number; trackNumber: number }>((raw.tracks as unknown[]).map((item, index) => {
    const value = record(item);
    return { ...value, discNumber: Math.max(1, Number(value.discNumber) || 1), trackNumber: Math.max(1, Number(value.trackNumber) || index + 1) };
  }));
  const tracks: AlbumTrack[] = [];
  for (const value of values) {
    if (!text(value.name)) return null;
    const song = registerPlatformTrack(userId, provider, { ...value, albumId, album: name, cover });
    if (!song) return null;
    tracks.push({ ...song, discNumber: value.discNumber, trackNumber: value.trackNumber });
  }
  const match = locateAlbumTrack(identity, tracks, identity.provider === provider);
  if (!match) return null;
  return { album: { provider, id: albumId, name, artist: text(raw.artist) || tracks[0].artist, cover, year: Number(raw.year) || undefined, tracks },
    trackId: tracks[match.index].id, trackIndex: match.index, matchedBy: match.matchedBy };
}

/** Every source enters through a provider adapter; renderers never fetch platform endpoints. */
export async function resolvePlayingAlbum(userId: string, input: unknown, signal: AbortSignal): Promise<AlbumResolution> {
  const checked = identitySchema.safeParse(input);
  if (!checked.success) throw new RequestError(400, "缺少有效的歌曲名、歌手或平台标识，暂时无法识别专辑。", "IDENTITY_INVALID");
  const identity = checked.data;
  const attempts: { provider: "netease" | "qq"; albumId: string; trackId: string }[] = [];
  if (identity.provider && supported(identity.provider) && (identity.albumId || identity.trackId)) {
    attempts.push({ provider: identity.provider, albumId: identity.albumId || "", trackId: identity.trackId || "" });
  }
  for (const attempt of attempts) {
    try {
      const raw = await nativeAlbum(attempt.provider, attempt.albumId, attempt.trackId, readAccount(userId, attempt.provider)?.cookie || "", signal);
      const result = materialize(userId, attempt.provider, raw, identity);
      if (result) return result;
    } catch (error) { if (signal.aborted) throw signal.reason; if (error instanceof RequestError && error.code === "ALBUM_INCOMPLETE") throw error; }
  }
  // Sources without an album-detail adapter use strict recording+release metadata matching.
  // Never turn song-search order into an album tracklist.
  const found = await platformCall("netease", "search", { query: `${identity.title} ${identity.artist}`.slice(0, 80), limit: 30, offset: 0 }, readAccount(userId, "netease")?.cookie || "", signal);
  const candidates = (Array.isArray(found.songs) ? found.songs : []).map(record).filter(song => matchesRecording(identity,
    { id: text(song.id), name: text(song.name), artist: text(song.artist), album: text(song.album) }));
  const seen = new Set<string>();
  for (const candidate of candidates.slice(0, 5)) {
    const id = text(candidate.albumId, 100);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    try {
      const raw = await nativeAlbum("netease", id, "", readAccount(userId, "netease")?.cookie || "", signal);
      const result = materialize(userId, "netease", raw, { ...identity, provider: identity.provider, trackId: identity.provider === "netease" ? identity.trackId : undefined });
      if (result) return result;
    } catch (error) { if (signal.aborted) throw signal.reason; if (error instanceof RequestError && error.code === "ALBUM_INCOMPLETE") throw error; }
  }
  throw new RequestError(404, "未能确认这首歌的完整专辑与曲序，音乐仍可继续播放。", "ALBUM_NOT_FOUND");
}

/** Same-origin texture URL. Its upstream URL comes exclusively from the album adapter. */
export async function readAlbumCover(provider: string, id: string, signal: AbortSignal) {
  if (provider !== "netease" || !safeId("netease", id)) throw new RequestError(400, "封面标识无效。", "ALBUM_ID_INVALID");
  const album = await nativeAlbum("netease", id, "", "", signal);
  const url = new URL(text(album.cover, 2048));
  if (!url.hostname.endsWith(".music.126.net") || url.port || url.username || url.password || !["https:", "http:"].includes(url.protocol)) throw new RequestError(502, "封面来源无效。", "ALBUM_COVER_INVALID");
  url.protocol = "https:";
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) });
  const upstreamType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || "";
  // NetEase's CDN sends image/jpg for ordinary JPEGs.
  const type = upstreamType === "image/jpg" ? "image/jpeg" : upstreamType;
  if (!response.ok || !/^image\/(jpeg|png|webp)$/.test(type) || Number(response.headers.get("content-length")) > 8000000) throw new RequestError(502, "专辑封面暂不可用。", "ALBUM_COVER_UNAVAILABLE");
  const reader = response.body!.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 8000000) { await reader.cancel(); throw new RequestError(502, "封面文件过大。", "ALBUM_COVER_UNAVAILABLE"); } chunks.push(part.value); }
  } finally { reader.releaseLock(); }
  return new Response(Buffer.concat(chunks), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}
