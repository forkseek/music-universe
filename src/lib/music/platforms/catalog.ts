import "server-only";
import { randomUUID } from "node:crypto";
import { RequestError } from "@/lib/server/errors";
import { radiohandSearchPage, radiohandSongUrl } from "../providers/radiohand-qq";
import { qqAccountResolve } from "../providers/qq-account";
import { readAccount } from "./accounts";
import { platformCall } from "./runtime";
import { musicMediaTicket } from "./media";
import { putStates, readState, rateLimitShared } from "./shared-state";
import { platformLabels, record, text, type Platform, type PlatformTrack, type Values } from "./types";
interface SearchEntry {
    userId: string;
    provider: Platform;
    raw: Values;
    expires: number;
}
/** Shared by search and album adapters. The browser receives an opaque, owner-bound playback reference. */
function describeTrack(provider: Platform, raw: Values): PlatformTrack | null {
    const id = text(raw.mid || raw.id || raw.hash, 100);
    if (!id)
        return null;
    const playbackId = randomUUID();
    let cover = text(raw.cover, 2048);
    if (!cover.startsWith("/api/qq/cover?") && !cover.startsWith("/api/music/album/cover?")
        && !/^\/api\/music\/album\/cover\/v2\/netease\/\d{1,20}$/.test(cover) && !/^https?:\/\//.test(cover))
        cover = "";
    if (cover.startsWith("http:"))
        cover = "https:" + cover.slice(5);
    return { provider, id, playbackId, name: text(raw.name) || "未命名歌曲", artist: text(raw.artist) || "未知歌手", album: text(raw.album),
        albumId: text(raw.albumId || raw.albumMid || raw.album_id, 100) || undefined, cover,
        duration: Math.max(0, Number(raw.duration) || 0), fee: Number(raw.fee) || 0 };
}
export async function registerPlatformTracks(userId: string, provider: Platform, values: Values[]): Promise<PlatformTrack[]> {
    const tracks: PlatformTrack[] = [], entries = [];
    const expiresAt = Date.now() + 60 * 60 * 1000;
    for (const raw of values) {
        const track = describeTrack(provider, raw);
        if (!track) continue;
        tracks.push(track);
        entries.push({ key: track.playbackId, value: { userId, provider, raw, expires: expiresAt } satisfies SearchEntry, expiresAt });
    }
    await putStates(userId, "catalog", entries);
    return tracks;
}
export async function registerPlatformTrack(userId: string, provider: Platform, raw: Values) {
    return (await registerPlatformTracks(userId, provider, [raw]))[0] || null;
}
export async function rateLimitMusic(userId: string, action: string) {
    if (!await rateLimitShared(userId, action === "login" ? "login" : "requests", action === "login" ? 6 : 100))
        throw new RequestError(429, "操作较快，请稍后重试。", "MUSIC_RATE_LIMIT");
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
    const raws: Values[] = [];
    const seen = new Set<string>();
    for (const value of values.slice(0, limit)) {
        const raw = record(value);
        const id = text(raw.mid || raw.id || raw.hash, 100);
        if (!id || seen.has(id))
            continue;
        seen.add(id);
        raws.push(raw);
    }
    const songs = await registerPlatformTracks(userId, provider, raws);
    return { provider, query, page, songs, hasMore: typeof response.hasMore === "boolean" ? response.hasMore : typeof response.total === "number" ? page * limit < response.total : values.length >= limit, source: text(response.source) };
}
export async function resolvePlatformSong(userId: string, provider: Platform, id: string, signal: AbortSignal) {
    const entry = (await readState<SearchEntry>(userId, "catalog", id))?.value;
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
    return { provider, playable: true, url: await musicMediaTicket(userId, provider, text(result.url, 16000)), quality: text(result.quality || result.level, 60), trial: result.trial === true };
}
