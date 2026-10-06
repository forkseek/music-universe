import type { AlbumResolution, PlayingIdentity } from './automaticAlbum'

export const musicPlatforms = { qq: 'QQ 音乐', netease: '网易云音乐', kugou: '酷狗音乐', qishui: '汽水音乐' } as const
export type MusicPlatform = keyof typeof musicPlatforms
export interface MusicUser { id: string; nickname: string; avatar: string }
export interface Connection { provider: MusicPlatform; authorized: boolean; user?: MusicUser; message: string; loginMode: 'qr' | 'window'; loginAvailable: boolean }
export interface PlatformSong { provider: MusicPlatform; id: string; playbackId: string; name: string; artist: string; album: string; albumId?: string; cover: string; duration: number; fee: number }
export interface SearchResult { provider: MusicPlatform; songs: PlatformSong[]; query: string; page: number; hasMore: boolean; source?: string }
export interface Login { provider: MusicPlatform; loginId: string; status: 'pending' | 'scanned' | 'authorizing' | 'success' | 'expired' | 'cancelled' | 'error'; message: string; expiresAt: number; image?: string; user?: MusicUser }
export interface AudioSource { playable: boolean; url: string; quality?: string; trial?: boolean; message?: string }
let session: Promise<void> | undefined

async function request<T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/mw/api/music/' + path, { method, credentials: 'same-origin', cache: 'no-store', signal,
    headers: { 'X-Music-World': '1', ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) { if (response.status === 404 && result?.error?.code === 'NOT_FOUND') session = undefined; throw new Error(result?.error?.message || '暂时无法连接音乐服务，请稍后重试。') }
  return result as T
}
async function connected<T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown, signal?: AbortSignal) {
  session ??= request('session').then(() => undefined).catch(error => { session = undefined; throw error })
  await session
  return request<T>(path, method, body, signal)
}
export const fetchPlayingAlbum = (identity: PlayingIdentity, signal?: AbortSignal) => connected<AlbumResolution>('album', 'POST', identity, signal)
export const readConnection = (p: MusicPlatform, signal?: AbortSignal) => connected<Connection>(`${p}/status`, 'GET', undefined, signal)
export const searchMusic = (p: MusicPlatform, q: string, page: number, signal?: AbortSignal) => connected<SearchResult>(`${p}/search?${new URLSearchParams({ q, page: String(page) })}`, 'GET', undefined, signal)
export const resolveMusic = (song: PlatformSong, signal?: AbortSignal) => connected<AudioSource>(`${song.provider}/play`, 'POST', { playbackId: song.playbackId }, signal)
export const connectMusic = (p: MusicPlatform) => connected<Login>(`${p}/login`, 'POST')
export const pollMusicLogin = (p: MusicPlatform, id: string, signal?: AbortSignal) => connected<Login>(`${p}/poll?id=${encodeURIComponent(id)}`, 'GET', undefined, signal)
export const cancelMusicLogin = (p: MusicPlatform, id: string) => connected(`${p}/cancel`, 'POST', { loginId: id })
export const disconnectMusic = (p: MusicPlatform) => connected(`${p}/logout`, 'POST')
