import type { Album, Track } from './generateAlbumGalaxy'
import type { AudioTrackInfo } from '../hooks/useAudioPlayback'
import type { MusicPlatform, PlatformSong } from './musicPlatforms'
import { musicWorldMedia } from './musicWorldClient'
import { albumCoverLoader } from './albumCover'

export interface PlayingIdentity {
  provider?: MusicPlatform
  trackId?: string
  albumId?: string
  title: string
  artist: string
  album: string
  durationMs?: number
  discNumber?: number
  trackNumber?: number
}
export interface AlbumSong extends PlatformSong { discNumber: number; trackNumber: number }
export interface ResolvedMusicAlbum {
  provider: MusicPlatform
  id: string
  name: string
  artist: string
  cover: string
  year?: number
  tracks: AlbumSong[]
}
export interface AlbumResolution {
  album: ResolvedMusicAlbum
  trackId: string
  /** Zero-based position in the COMPLETE ordered album, not a search-result position. */
  trackIndex: number
  matchedBy: 'id' | 'metadata'
}
export interface PlaybackAlbum { album: Album; planetId: string; trackIndex: number; matchedBy: AlbumResolution['matchedBy'] }

export function playingIdentity(track: AudioTrackInfo): PlayingIdentity | null {
  if (!track.title.trim() || !track.artist.trim() || ['本地音频', '未知歌手'].includes(track.artist) || track.album === '在线音频') return null
  return { provider: track.provider, trackId: track.platformTrackId, albumId: track.albumId,
    title: track.title, artist: track.artist, album: track.album, durationMs: track.durationMs,
    discNumber: track.discNumber, trackNumber: track.trackNumber }
}
export function playbackAlbumFromResolution(resolution: AlbumResolution): PlaybackAlbum {
  const raw = resolution.album
  if (!raw.id || !raw.name || !raw.cover || !raw.tracks.length || raw.tracks.length > 300
    || !Number.isInteger(resolution.trackIndex) || !raw.tracks[resolution.trackIndex]
    || raw.tracks[resolution.trackIndex].id !== resolution.trackId) throw new Error('平台未返回可靠的专辑曲序。')
  const albumId = `${raw.provider}:album:${raw.id}`
  const tracks: Track[] = raw.tracks.map((song, index) => ({
    id: `${albumId}:${song.discNumber}:${song.trackNumber}:${index}:${song.id}`,
    title: song.name, artist: song.artist, duration: song.duration > 0 ? Math.max(1, Math.round(song.duration / 1000)) : undefined,
    discNumber: song.discNumber, trackNumber: song.trackNumber,
    source: { provider: raw.provider, trackId: song.id, albumId: raw.id, playbackId: song.playbackId },
  }))
  return { album: { id: albumId, name: raw.name, artist: raw.artist, cover: musicWorldMedia(raw.cover), year: raw.year,
    source: { provider: raw.provider, albumId: raw.id }, tracks }, planetId: tracks[resolution.trackIndex].id, trackIndex: resolution.trackIndex, matchedBy: resolution.matchedBy }
}

/** TTL/LRU cache holds metadata, never audio or credentials. Same-release songs share one entry. */
export class PlaybackAlbumResolver {
  private readonly albums = new Map<string, { value: AlbumResolution; until: number }>()
  constructor(private readonly fetchAlbum: (identity: PlayingIdentity, signal: AbortSignal) => Promise<AlbumResolution>, private readonly ttl = 10 * 60000) {}
  async resolve(identity: PlayingIdentity, signal: AbortSignal): Promise<PlaybackAlbum> {
    signal.throwIfAborted()
    const key = identity.albumId && identity.provider ? `${identity.provider}:${identity.albumId}` : ''
    const hit = key ? this.albums.get(key) : undefined
    if (hit && hit.until > Date.now() && identity.trackId) {
      const matches = hit.value.album.tracks.map((song, index) => ({ song, index })).filter(item => item.song.id === identity.trackId
        && (!identity.discNumber || item.song.discNumber === identity.discNumber)
        && (!identity.trackNumber || item.song.trackNumber === identity.trackNumber))
      if (matches.length === 1) return playbackAlbumFromResolution({ ...hit.value, trackId: identity.trackId, trackIndex: matches[0].index, matchedBy: 'id' })
    }
    const value = await this.fetchAlbum(identity, signal)
    signal.throwIfAborted()
    if (key && value.album.provider === identity.provider && value.album.id === identity.albumId) {
      for (const [k, entry] of this.albums) if (entry.until <= Date.now()) this.albums.delete(k)
      while (this.albums.size >= 30) this.albums.delete(this.albums.keys().next().value!)
      this.albums.set(key, { value, until: Date.now() + this.ttl })
    }
    return playbackAlbumFromResolution(value)
  }
}

/** Latest-play-wins guard, including adapters that cannot cancel their upstream request. */
export class LatestAlbumRequest {
  private sequence = 0
  private active?: AbortController
  cancel() { this.sequence++; this.active?.abort(); this.active = undefined }
  async run(identity: PlayingIdentity, resolver: PlaybackAlbumResolver, apply: (value: PlaybackAlbum, signal: AbortSignal) => Promise<void> | void): Promise<boolean> {
    this.cancel()
    const sequence = this.sequence, controller = new AbortController()
    this.active = controller
    const value = await resolver.resolve(identity, controller.signal)
    if (controller.signal.aborted || sequence !== this.sequence) return false
    await apply(value, controller.signal)
    return !controller.signal.aborted && sequence === this.sequence
  }
}

export const preloadAlbumCover = (url: string, signal: AbortSignal) => albumCoverLoader.load(url, signal)
