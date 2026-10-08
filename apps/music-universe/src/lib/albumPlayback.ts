import type { Album, Track } from './generateAlbumGalaxy'
import type { AudioTrackInfo } from '../hooks/useAudioPlayback'
import { matchAlbumSongs } from './albumMusic'
import { musicPlatforms, readConnection, resolveMusic, searchMusic } from './musicPlatforms'
import type { MusicPlatform, PlatformSong } from './musicPlatforms'
import { musicWorldMedia } from './musicWorldClient'

export interface AlbumPlaybackSource { url: string; info: AudioTrackInfo; objectUrl?: boolean }

export function albumPlaybackKey(album: Album, track: Track) {
  return JSON.stringify([album.id, track.id, track.source?.provider, track.source?.trackId, track.source?.playbackId])
}

/** Matches the existing player's circular next/previous order; never guesses an unrelated song. */
export function nextAlbumTrack(album: Album, playing: AudioTrackInfo | null): Track | undefined {
  if (!playing) return
  const index = album.tracks.findIndex(track => track.id === playing.planetId
    || (!!playing.provider && !!playing.platformTrackId && track.source?.provider === playing.provider && track.source.trackId === playing.platformTrackId))
  if (index < 0 || !album.tracks.length) return
  return album.tracks[(index + 1) % album.tracks.length]
}

function preferredPlatform(): MusicPlatform {
  try { const value = localStorage.getItem('music-universe:platform'); if (value && Object.hasOwn(musicPlatforms, value)) return value as MusicPlatform } catch { /* Optional preference. */ }
  return 'qq'
}

/** Shared by explicit playback and silent preparation, using the existing platform adapters. */
export async function resolveAlbumPlayback(album: Album, track: Track, signal: AbortSignal): Promise<AlbumPlaybackSource> {
  const platforms = [...new Set<MusicPlatform>([...(track.source ? [track.source.provider] : []), preferredPlatform(), 'netease'])]
  const errors: string[] = []
  const resolveSong = async (song: PlatformSong) => {
    const source = await resolveMusic(song, signal)
    signal.throwIfAborted()
    if (!source.playable || !source.url) { errors.push(source.message || '当前账号暂不可播放这首歌。'); return }
    return { url: musicWorldMedia(source.url), info: {
      id: `${song.provider}:${song.id}`, planetId: track.id, title: track.title, artist: song.artist,
      album: song.album || album.name, cover: musicWorldMedia(song.cover || album.cover), provider: song.provider,
      platformTrackId: song.id, albumId: song.albumId, durationMs: song.duration || undefined,
      discNumber: track.discNumber, trackNumber: track.trackNumber, trial: source.trial,
    } }
  }
  for (const provider of platforms) {
    signal.throwIfAborted()
    try {
      if (provider === 'qq' || provider === 'qishui') {
        const connection = await readConnection(provider, signal)
        if (!connection.authorized) { errors.push(`请连接 ${musicPlatforms[provider]} 账号。`); continue }
      }
      if (track.source?.provider === provider && track.source.playbackId) {
        try {
          const direct = await resolveSong({ provider, id: track.source.trackId, playbackId: track.source.playbackId,
            name: track.title, artist: track.artist || album.artist, album: album.name, albumId: track.source.albumId,
            cover: album.cover, duration: (track.duration || 0) * 1000, fee: 0 })
          if (direct) return direct
        } catch { signal.throwIfAborted() } // Expired references still use fresh, strictly matched search.
      }
      const result = await searchMusic(provider, `${track.title} ${track.artist || album.artist}`.slice(0, 80), 1, signal)
      for (const song of matchAlbumSongs(album, track, result.songs).slice(0, 2)) {
        const source = await resolveSong(song)
        if (source) return source
      }
    } catch (failure) {
      signal.throwIfAborted()
      errors.push(failure instanceof Error ? failure.message : '平台暂不可用。')
    }
  }
  throw new Error(`未能加载「${track.title}」。${errors[0] || '平台未找到对应歌手的可播放版本。'}请在音乐搜索中连接账号或选择音源。`)
}
