import { z } from "@/lib/validation";
import { IMPORT_LIMITS } from "../import/limits";
import { validateRow, safeSongPage } from "../import/validate";
import { NO_CAPABILITIES, type MusicProvider, type ProviderAvailability, type ProviderPlaylist, type ProviderTrack } from "./types";

/** Tencent LinkLink custom H5 panel SDK. Its presence in a normal browser is not expected. */
export interface QQMusicSDK {
  getAuthStatus?: () => Promise<boolean>;
  goAuthPage?: () => void;
  describeSelfSongList?: () => Promise<unknown>;
  describeSongList?: (params: { DissId: number; Page: number; PageSize: number }) => Promise<unknown>;
  describeRecentPlay?: (params: { Type: 2; UpdateTime: 0 }) => Promise<unknown>;
}

const officialId = z.number().int().positive().refine(Number.isSafeInteger);
const playlistSchema = z.object({ DissId: officialId, DissName: z.string().min(1).max(500),
  SongNum: z.number().int().nonnegative() });
const pageSchema = z.object({ DissId: officialId, TotalNum: z.number().int().nonnegative(),
  SongList: z.array(z.unknown()).max(30) });
const playlistSongSchema = z.object({ SongId: officialId, SongName: z.string().optional(),
  SongTitle: z.string().optional(), SongMid: z.string().optional(), SingerName: z.string().min(1),
  AlbumName: z.string().optional(), SongPlayTime: z.number().nonnegative().optional(), SongH5Url: z.string().optional() });
const recentSongSchema = z.object({ Id: officialId, Title: z.string().min(1),
  Singer: z.array(z.string().min(1)).min(1).max(IMPORT_LIMITS.maxArtists), AlbumTitle: z.string().optional() });
const recentSchema = z.object({ Data: z.object({ Song: z.array(recentSongSchema).max(100).optional() }) });

export function qqMusicAvailability(enabled = process.env.NEXT_PUBLIC_ENABLE_QQMUSIC === "true",
  context?: { sdkPresent: boolean; apiReady?: boolean; authenticated?: boolean; authCheckFailed?: boolean }): ProviderAvailability {
  if (!enabled) return { available: false, reason: "FEATURE_DISABLED", message: "QQ 音乐官方连接默认关闭，可先导入歌单文件。" };
  if (!context) return { available: false, reason: "CLIENT_ENVIRONMENT_REQUIRED", message: "需要在浏览器中检测官方 SDK 与授权环境。" };
  if (!context.sdkPresent) return { available: false, reason: "OFFICIAL_SDK_NOT_AVAILABLE", message: "当前环境没有腾讯连连官方 H5 SDK，可先导入歌单文件。" };
  if (!context.apiReady) return { available: false, reason: "OFFICIAL_INTEGRATION_PENDING", message: "检测到 SDK，但歌单接口不完整；当前不能连接。" };
  if (context.authCheckFailed) return { available: false, reason: "OFFICIAL_AUTH_CHECK_FAILED", message: "无法读取 QQ 音乐授权状态，请在官方环境中重试。" };
  if (context.authenticated === false) return { available: false, reason: "OFFICIAL_AUTH_REQUIRED", message: "官方 SDK 可用，但尚未完成 QQ 音乐授权。" };
  if (context.authenticated === true) return { available: true };
  return { available: false, reason: "OFFICIAL_INTEGRATION_PENDING", message: "尚未核实 QQ 音乐授权状态。" };
}

export function getQQMusicBrowserSDK(): QQMusicSDK | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { h5PanelSdk?: { qqMusic?: QQMusicSDK } }).h5PanelSdk?.qqMusic;
}

function hasReadMethods(sdk: QQMusicSDK) {
  return typeof sdk.getAuthStatus === "function" && typeof sdk.goAuthPage === "function" && typeof sdk.describeSelfSongList === "function"
    && typeof sdk.describeSongList === "function" && typeof sdk.describeRecentPlay === "function";
}

export function detectQQMusicBrowserAvailability(): ProviderAvailability {
  const sdk = getQQMusicBrowserSDK();
  return qqMusicAvailability(undefined, { sdkPresent: !!sdk, apiReady: !!sdk && hasReadMethods(sdk) });
}

export async function checkQQMusicSDKAvailability(sdk = getQQMusicBrowserSDK(), enabled = process.env.NEXT_PUBLIC_ENABLE_QQMUSIC === "true") {
  if (!enabled || !sdk || !hasReadMethods(sdk)) return qqMusicAvailability(enabled, { sdkPresent: !!sdk, apiReady: !!sdk && hasReadMethods(sdk) });
  try { return qqMusicAvailability(enabled, { sdkPresent: true, apiReady: true, authenticated: await sdk.getAuthStatus!() }); }
  catch { return qqMusicAvailability(enabled, { sdkPresent: true, apiReady: true, authCheckFailed: true }); }
}

function checkedTrack(value: unknown, row: number, playlist?: ProviderPlaylist, recent = false): ProviderTrack {
  let fields;
  if (recent) {
    const raw = recentSongSchema.parse(value);
    fields = { title: raw.Title, artists: raw.Singer, album: raw.AlbumTitle,
      externalId: String(raw.Id), recentlyPlayed: true };
  } else {
    const raw = playlistSongSchema.parse(value);
    fields = { title: raw.SongName || raw.SongTitle, artist: raw.SingerName, album: raw.AlbumName,
      durationMs: raw.SongPlayTime ? Math.round(raw.SongPlayTime * 1000) : undefined,
      externalId: String(raw.SongId), externalUrl: raw.SongH5Url ? safeSongPage(raw.SongH5Url) : undefined,
      playlistExternalId: playlist?.externalId, playlistName: playlist?.name };
  }
  const parsed = validateRow({ ...fields, provider: "qqmusic" }, playlist?.name ?? "QQ 音乐最近播放", row);
  if (!parsed.track) throw new Error(`QQ 音乐返回的第 ${row} 首歌曲缺少有效元数据。`);
  return { ...parsed.track, source: { ...parsed.track.source, importedVia: "official" } };
}

/** Browser adapter only; server handlers receive a bounded, revalidated metadata payload. */
export function createQQMusicBrowserProvider(sdk: QQMusicSDK, enabled = process.env.NEXT_PUBLIC_ENABLE_QQMUSIC === "true"): MusicProvider {
  const playlists = new Map<string, ProviderPlaylist>();
  async function requireAuth() {
    const status = await checkQQMusicSDKAvailability(sdk, enabled);
    if (!status.available) throw new Error(status.message);
  }
  async function listPlaylists(): Promise<ProviderPlaylist[]> {
    await requireAuth();
    const result = z.array(playlistSchema).max(100).parse(await sdk.describeSelfSongList!());
    const list = result.map((item) => ({ externalId: String(item.DissId), provider: "qqmusic" as const,
      name: item.DissName, trackCount: item.SongNum }));
    for (const item of list) playlists.set(item.externalId, item);
    return list;
  }
  return {
    id: "qqmusic", name: "QQ 音乐", official: true,
    isAvailable: async () => (await checkQQMusicSDKAvailability(sdk, enabled)).available,
    getAvailability: () => checkQQMusicSDKAvailability(sdk, enabled),
    getCapabilities: () => enabled ? { ...NO_CAPABILITIES, auth: true, playlists: true, recentTracks: true, fileImport: true } : { ...NO_CAPABILITIES, fileImport: true },
    connect: async () => {
      if (!enabled || typeof sdk.goAuthPage !== "function") throw new Error("当前环境不能打开 QQ 音乐授权页。");
      sdk.goAuthPage();
    },
    listPlaylists,
    getPlaylistTracks: async (playlistId) => {
      await requireAuth();
      if (!/^\d+$/u.test(playlistId)) throw new Error("QQ 音乐歌单 ID 无效。");
      const playlist = playlists.get(playlistId) ?? (await listPlaylists()).find((item) => item.externalId === playlistId);
      if (!playlist) throw new Error("当前账号没有这个 QQ 音乐歌单。");
      const collected: ProviderTrack[] = [];
      const seenPages = new Set<string>();
      let expectedTotal: number | undefined;
      for (let page = 0; page <= Math.ceil(IMPORT_LIMITS.maxTracks / 30); page++) {
        const data = pageSchema.parse(await sdk.describeSongList!({ DissId: Number(playlistId), Page: page, PageSize: 30 }));
        if (data.DissId !== Number(playlistId) || data.TotalNum > IMPORT_LIMITS.maxTracks) throw new Error("QQ 音乐歌单响应不匹配或超过 5,000 首上限。");
        if (expectedTotal === undefined) expectedTotal = data.TotalNum;
        else if (data.TotalNum !== expectedTotal) throw new Error("QQ 音乐歌单分页总数变化，已停止导入。");
        if (data.TotalNum === 0) {
          if (data.SongList.length) throw new Error("QQ 音乐空歌单返回了歌曲，已停止导入。");
          return [];
        }
        const signature = JSON.stringify(data.SongList.map((song) => playlistSongSchema.parse(song).SongId).sort((a, b) => a - b));
        if (!data.SongList.length || seenPages.has(signature)) throw new Error("QQ 音乐歌单分页提前结束或重复，已停止导入。");
        seenPages.add(signature);
        for (const song of data.SongList) collected.push(checkedTrack(song, collected.length + 1, playlist));
        if (collected.length > data.TotalNum) throw new Error("QQ 音乐歌单分页数量超过声明总数，已停止导入。");
        if (collected.length === data.TotalNum) return collected;
      }
      throw new Error("QQ 音乐歌单分页超过安全上限，已停止导入。");
    },
    getRecentTracks: async () => {
      await requireAuth();
      const response = recentSchema.parse(await sdk.describeRecentPlay!({ Type: 2, UpdateTime: 0 }));
      return (response.Data.Song ?? []).map((song, index) => checkedTrack(song, index + 1, undefined, true));
    },
  };
}

/** Server-side registry never claims that an unknown browser has SDK access. */
export const qqMusicProvider: MusicProvider = {
  id: "qqmusic", name: "QQ 音乐", official: true,
  isAvailable: async () => false,
  getAvailability: async () => qqMusicAvailability(),
  getCapabilities: () => ({ ...NO_CAPABILITIES, fileImport: true }),
};
