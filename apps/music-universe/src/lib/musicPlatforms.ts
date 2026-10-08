import type { AlbumResolution, PlayingIdentity } from './automaticAlbum'
import { MusicRequestError, musicWorldRequest } from './musicWorldTransport'

export const musicPlatforms = { qq: 'QQ 音乐', netease: '网易云音乐', kugou: '酷狗音乐', qishui: '汽水音乐' } as const
export type MusicPlatform = keyof typeof musicPlatforms
export interface MusicUser { id: string; nickname: string; avatar: string }
export interface Connection { provider: MusicPlatform; authorized: boolean; user?: MusicUser; message: string; loginMode: 'qr' | 'window' | 'oauth'; loginAvailable: boolean; musicAuthorized?: boolean }
export interface PlatformSong { provider: MusicPlatform; id: string; playbackId: string; name: string; artist: string; album: string; albumId?: string; cover: string; duration: number; fee: number }
export interface SearchResult { provider: MusicPlatform; songs: PlatformSong[]; query: string; page: number; hasMore: boolean; source?: string }
export interface Login { provider: MusicPlatform; loginId: string; status: 'pending' | 'scanned' | 'authorizing' | 'success' | 'expired' | 'cancelled' | 'error'; message: string; expiresAt: number; image?: string; authorizeUrl?: string; user?: MusicUser }
export interface AudioSource { playable: boolean; url: string; quality?: string; trial?: boolean; message?: string }
export interface MusicLyrics { provider: MusicPlatform; trackId: string; lyric: string; available: boolean; message?: string }
let session: Promise<void> | undefined

async function request<T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  return musicWorldRequest<T>('/api/music/' + path, { method, body, signal })
}
async function connected<T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown, signal?: AbortSignal) {
  session ??= request('session').then(() => undefined).catch(error => { session = undefined; throw error })
  await session
  try { return await request<T>(path, method, body, signal) }
  catch (error) {
    // Restore an expired anonymous session once. Never blindly retry a login/play write.
    if (error instanceof MusicRequestError && error.status === 404 && error.code === 'NOT_FOUND') {
      session = undefined
      if (method === 'GET' && path !== 'session' && !signal?.aborted) {
        session ??= request('session').then(() => undefined).catch(cause => { session = undefined; throw cause })
        await session
        return request<T>(path, method, body, signal)
      }
    }
    throw error
  }
}
export const fetchPlayingAlbum = (identity: PlayingIdentity, signal?: AbortSignal) => connected<AlbumResolution>('album', 'POST', identity, signal)
export const fetchMusicLyrics = (p: MusicPlatform, id: string, signal?: AbortSignal) => connected<MusicLyrics>(`${p}/lyrics?${new URLSearchParams({ id })}`, 'GET', undefined, signal)
export const readConnection = (p: MusicPlatform, signal?: AbortSignal) => connected<Connection>(`${p}/status`, 'GET', undefined, signal)
export const searchMusic = (p: MusicPlatform, q: string, page: number, signal?: AbortSignal) => connected<SearchResult>(`${p}/search?${new URLSearchParams({ q, page: String(page) })}`, 'GET', undefined, signal)
export const resolveMusic = (song: PlatformSong, signal?: AbortSignal) => connected<AudioSource>(`${song.provider}/play`, 'POST', { playbackId: song.playbackId }, signal)
export const connectMusic = (p: MusicPlatform) => connected<Login>(`${p}/login`, 'POST')
export const pollMusicLogin = (p: MusicPlatform, id: string, signal?: AbortSignal) => connected<Login>(`${p}/poll?id=${encodeURIComponent(id)}`, 'GET', undefined, signal)
export const cancelMusicLogin = (p: MusicPlatform, id: string) => connected(`${p}/cancel`, 'POST', { loginId: id })
export const disconnectMusic = (p: MusicPlatform) => connected(`${p}/logout`, 'POST')
