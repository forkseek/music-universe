export const platformLabels = { netease: "网易云音乐", qq: "QQ 音乐", kugou: "酷狗音乐", qishui: "汽水音乐" } as const;
export type Platform = keyof typeof platformLabels;
export type Values = Record<string, unknown>;
export const record = (v: unknown): Values => v && typeof v === "object" && !Array.isArray(v) ? v as Values : {};
export const text = (v: unknown, max = 300) => (typeof v === "string" || typeof v === "number" ? String(v) : "").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max);
export interface MusicProfile { id: string; nickname: string; avatar: string }
export interface PlatformAccount { cookie: string; profile: MusicProfile }
export interface PlatformStatus { provider: Platform; authorized: boolean; user?: MusicProfile; message: string; loginMode: "qr" | "window"; loginAvailable: boolean }
export interface PlatformTrack { provider: Platform; id: string; playbackId: string; name: string; artist: string; album: string; albumId?: string; cover: string; duration: number; fee: number }
export interface PlayingIdentity {
  provider?: Platform;
  trackId?: string;
  albumId?: string;
  title: string;
  artist: string;
  album: string;
  durationMs?: number;
  discNumber?: number;
  trackNumber?: number;
}
export interface AlbumTrack extends PlatformTrack { discNumber: number; trackNumber: number }
export interface MusicAlbum { provider: Platform; id: string; name: string; artist: string; cover: string; year?: number; tracks: AlbumTrack[] }
export interface AlbumResolution { album: MusicAlbum; trackId: string; trackIndex: number; matchedBy: "id" | "metadata" }
