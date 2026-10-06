import type { Album, Track } from './generateAlbumGalaxy'

/**
 * Music World (127.0.0.1:3002) serves no CORS headers, so the browser reaches it
 * through this dev server's proxy instead of talking cross-origin. The session
 * cookie is host-scoped and 127.0.0.1 counts as one site for SameSite=Lax, so it
 * survives the hop and every call lands in the same anonymous library.
 */
const BASE = '/mw'

export interface MusicWorldTrack {
  id: string
  title: string
  artists: { id?: string; name: string }[]
  album?: { id?: string; name: string }
  durationMs?: number
}

export interface MusicWorldWorld {
  id: string
  name: string
  createdAt?: string
  totalTracks?: number
}

export interface MusicWorldLibrary {
  scope: string
  tracks: MusicWorldTrack[]
  worlds: MusicWorldWorld[]
  counts: { tracks: number; artists: number; albums: number; sources: number; playlists: number }
}

/** One QQ Music search hit, as returned by Music World's /api/qq/search. */
export interface QqSong {
  provider: 'qq'
  mid: string
  mediaMid: string
  qqId: string
  name: string
  artist: string
  album?: string
  albumMid: string
  /** Music World path, e.g. /api/qq/cover?mid=… — prefix it with /mw before use. */
  cover: string
  /** Milliseconds. */
  duration: number
  /** 1 when the track needs account rights to play in full. */
  fee: number
}

export interface QqSearchPage {
  provider: 'qq'
  songs: QqSong[]
  query: string
  page: number
  limit: number
  hasMore: boolean
  source: string
}

export interface QqPlayback {
  provider: 'qq'
  /** Music World path, e.g. /api/qq/audio?ticket=… — prefix it with /mw before use. */
  url: string
  playable: boolean
  trial?: boolean
  quality?: string
  reason?: string
  message?: string
}

export interface QqStatus {
  configured: boolean
  authorized: boolean
  provider: 'qq'
  message: string
}

async function request<T>(path: string, init?: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal }): Promise<T> {
  const method = init?.method ?? 'GET'
  const response = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    // Music World rejects reads and writes that do not announce themselves.
    headers: { 'X-Music-World': '1', ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }) },
    body: method === 'GET' ? undefined : JSON.stringify(init?.body ?? {}),
    signal: init?.signal,
  })
  if (!response.ok) throw new Error(`Music World ${path} 返回 ${response.status}`)
  return response.json() as Promise<T>
}

export const readLibrary = (scope: 'library' | 'demo' = 'library') => request<MusicWorldLibrary>(`/api/library?scope=${scope}`)

/** 一首曲目的评分查询入参；key 由调用方定义并原样回传。 */
export interface RatingQuery { key: string; title: string; artist?: string; durationMs?: number }

export interface RatingsResponse { source: string; degraded: boolean; ratings: Record<string, number> }

/** 读取曲目的大众热度评分；上游不可用时返回空表 + degraded，而不是让页面报错。 */
export const fetchTrackRatings = (tracks: RatingQuery[], signal?: AbortSignal) =>
  request<RatingsResponse>('/api/ratings', { method: 'POST', body: { tracks }, signal })

export const loadDemoLibrary = () => request<{ addedTracks?: number }>('/api/imports/demo', { method: 'POST' })

export const createWorld = (name: string, scope: 'library' | 'demo' = 'demo') =>
  request<{ world: MusicWorldWorld }>('/api/worlds', { method: 'POST', body: { name, scope } })

/** Turn a Music World path (cover / audio ticket) into a URL this dev server can fetch. */
export const musicWorldMedia = (path: string) => (path.startsWith('/') ? `${BASE}${path}` : path)

export const readQqStatus = () => request<QqStatus>('/api/qq/status')

export const searchQqSongs = (keywords: string, limit = 12, page = 1) =>
  request<QqSearchPage>(`/api/qq/search?keywords=${encodeURIComponent(keywords)}&limit=${limit}&page=${page}`)

export const resolveQqAudio = (mid: string, mediaMid = '') =>
  request<QqPlayback>(`/api/qq/song/url?mid=${encodeURIComponent(mid)}&mediaMid=${encodeURIComponent(mediaMid)}`)

/**
 * Adopt Music World's tracks as this room's album. Session restore validates the
 * result, so ids stay unique, titles stay non-empty, and durations only survive
 * when they are a positive whole number of seconds.
 */
export function albumFromLibrary(library: MusicWorldLibrary, name = 'MUSIC WORLD LIBRARY'): Album | null {
  const tracks: Track[] = []
  const seen = new Set<string>()
  for (const [position, item] of library.tracks.entries()) {
    const title = item.title?.trim()
    const id = (item.id ?? `mw-${position}`).trim()
    if (!title || !id || seen.has(id)) continue
    seen.add(id)
    const seconds = typeof item.durationMs === 'number' && item.durationMs > 0 ? Math.round(item.durationMs / 1000) : 0
    tracks.push({ id, title, artist: item.artists?.[0]?.name?.trim() || undefined, duration: seconds > 0 ? seconds : undefined })
    if (tracks.length === 40) break
  }
  if (!tracks.length) return null
  return {
    id: `music-world-${library.scope || 'library'}`,
    name,
    artist: library.tracks[0]?.artists?.[0]?.name?.trim() || 'Music World',
    cover: '/covers/dont-tap-the-glass.jpg',
    tracks,
  }
}
