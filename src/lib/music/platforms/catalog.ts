import "server-only";
import { randomUUID } from "node:crypto";
import { RequestError } from "@/lib/server/errors";
import { radiohandSearchPage, radiohandSongUrl } from "../providers/radiohand-qq";
import { qqAccountResolve } from "../providers/qq-account";
import { readAccount } from "./accounts";
import { platformCall } from "./runtime";
import { musicMediaTicket } from "./media";
import { platformLabels, record, text, type Platform, type PlatformTrack, type Values } from "./types";
interface SearchEntry {
    userId: string;
    provider: Platform;
    raw: Values;
    expires: number;
}
const runtime = globalThis as typeof globalThis & {
    musicCatalog?: Map<string, SearchEntry>;
    musicRateLimits?: Map<string, {
        count: number;
        until: number;
    }>;
};
const catalog = () => runtime.musicCatalog ??= new Map();
/** Shared by search and album adapters. The browser receives an opaque, owner-bound playback reference. */
export function registerPlatformTrack(userId: string, provider: Platform, raw: Values): PlatformTrack | null {
    const id = text(raw.mid || raw.id || raw.hash, 100);
    if (!id)
        return null;
    for (const [key, entry] of catalog())
        if (entry.expires <= Date.now())
            catalog().delete(key);
    const playbackId = randomUUID();
    while (catalog().size >= 3000)
        catalog().delete(catalog().keys().next().value!);
    catalog().set(playbackId, { userId, provider, raw, expires: Date.now() + 60 * 60 * 1000 });
    let cover = text(raw.cover, 2048);
    if (!cover.startsWith("/api/qq/cover?") && !cover.startsWith("/api/music/album/cover?") && !/^https?:\/\//.test(cover))
        cover = "";
    if (cover.startsWith("http:"))
        cover = "https:" + cover.slice(5);
    return { provider, id, playbackId, name: text(raw.name) || "未命名歌曲", artist: text(raw.artist) || "未知歌手", album: text(raw.album),
        albumId: text(raw.albumId || raw.albumMid || raw.album_id, 100) || undefined, cover,
        duration: Math.max(0, Number(raw.duration) || 0), fee: Number(raw.fee) || 0 };
}
export function rateLimitMusic(userId: string, action: string) {
    const limits = runtime.musicRateLimits ??= new Map();
    for (const [id, entry] of limits)
        if (entry.until <= Date.now())
            limits.delete(id);
    const key = userId + (action === "login" ? ":login" : ":requests");
    const entry = limits.get(key) || { count: 0, until: Date.now() + 60000 };
    if (++entry.count > (action === "login" ? 6 : 100))
        throw new RequestError(429, "操作较快，请稍后重试。", "MUSIC_RATE_LIMIT");
    limits.set(key, entry);
}
export function parsePlatform(value: string): Platform {
    if (!Object.hasOwn(platformLabels, value))
        throw new RequestError(404, "不支持的音乐平台。", "PLATFORM_NOT_FOUND");
    return value as Platform;
}
export async function searchPlatform(userId: string, provider: Platform, query: string, page: number, signal: AbortSignal) {
    query = query.trim();
    if (!query || query.length > 80 || !Number.isSafeInteger(page) || page < 1 || page > 50)
        throw new RequestError(400, "请输入有效的搜索关键词。", "SEARCH_INVALID");
    const limit = 12;
    const response = provider === "qq"
        ? await radiohandSearchPage(query, limit, signal, userId, page) as unknown as Values
        : await platformCall(provider, "search", { query, limit, offset: (page - 1) * limit }, (await readAccount(userId, provider))?.cookie || "", signal);
    const values = Array.isArray(response.songs) ? response.songs : [];
    if (!values.length && response.error)
        throw new RequestError(502, "该平台暂时无法完成搜索，请稍后重试或连接账号。", "SEARCH_UNAVAILABLE");
    for (const [id, entry] of catalog())
        if (entry.expires <= Date.now())
            catalog().delete(id);
    const songs: PlatformTrack[] = [];
    const seen = new Set<string>();
    for (const value of values.slice(0, limit)) {
        const raw = record(value);
        const id = text(raw.mid || raw.id || raw.hash, 100);
        if (!id || seen.has(id))
            continue;
        seen.add(id);
        const song = registerPlatformTrack(userId, provider, raw);
        if (song)
            songs.push(song);
    }
    return { provider, query, page, songs, hasMore: typeof response.hasMore === "boolean" ? response.hasMore : typeof response.total === "number" ? page * limit < response.total : values.length >= limit, source: text(response.source) };
}
export async function resolvePlatformSong(userId: string, provider: Platform, id: string, signal: AbortSignal) {
    const entry = catalog().get(id);
    if (!entry || entry.userId !== userId || entry.provider !== provider || entry.expires <= Date.now())
        throw new RequestError(404, "搜索结果已过期，请重新搜索这首歌。", "TRACK_NOT_FOUND");
    let result: Values;
    if (provider === "qq") {
        const account = await qqAccountResolve(userId, text(entry.raw.mid, 64), text(entry.raw.mediaMid, 64), signal);
        if (!account)
            return radiohandSongUrl(userId, text(entry.raw.mid, 64), text(entry.raw.mediaMid, 64), signal);
        result = { ...account };
    }
    else
        result = await platformCall(provider, "resolve", entry.raw, (await readAccount(userId, provider))?.cookie || "", signal);
    if (!result.playable || !result.url)
        return { provider, playable: false, url: "", reason: text(result.reason), message: result.reason === "login_required" ? "请先连接 " + platformLabels[provider] + " 账号。" : text(result.message) || "这首歌曲暂不可播放，请确认账号权益。" };
    return { provider, playable: true, url: musicMediaTicket(userId, provider, text(result.url, 16000)), quality: text(result.quality || result.level, 60), trial: result.trial === true };
}
