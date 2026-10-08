import { useEffect, useRef } from 'react'
import type { Album } from '../lib/generateAlbumGalaxy'
import { nextAlbumTrack } from '../lib/albumPlayback'
import { NEXT_TRACK_PRELOAD } from '../lib/nextTrackPreload'
import type { AudioPlayback } from './useAudioPlayback'
import type { useAlbumMusic } from './useAlbumMusic'

/** End-of-track sequencing shares the same switch path as the existing player controls. */
export function useAutomaticNext(album: Album, audio: AudioPlayback, music: ReturnType<typeof useAlbumMusic>, advance: (id: string) => Promise<unknown>) {
  const latest = useRef({ album, audio, music, advance })
  latest.current = { album, audio, music, advance }
  const sequence = album.tracks.map(track => track.id).join('|')
  useEffect(() => {
    const element = audio.audioRef.current
    if (!element) return
    const prepare = () => {
      const current = latest.current
      if (element.paused || element.ended || element.error || current.music.pendingId.current) return
      if (!Number.isFinite(element.duration) || element.duration <= 0 || element.duration - element.currentTime > NEXT_TRACK_PRELOAD.aheadSeconds) return
      const track = current.audio.getTrack(), next = nextAlbumTrack(current.album, track)
      if (next && next.id !== track?.planetId) void current.music.preloadTrack(next.id)
    }
    const unsubscribe = audio.subscribeEnded(ended => {
      const current = latest.current, playing = current.audio.getTrack()
      if (playing?.id !== ended.id || playing.playbackInstance !== ended.playbackInstance || current.music.pendingId.current) return
      const next = nextAlbumTrack(current.album, playing)
      if (next) void current.advance(next.id)
    })
    for (const event of ['timeupdate', 'playing', 'loadedmetadata', 'durationchange']) element.addEventListener(event, prepare)
    prepare()
    return () => {
      unsubscribe()
      for (const event of ['timeupdate', 'playing', 'loadedmetadata', 'durationchange']) element.removeEventListener(event, prepare)
      latest.current.music.cancelPreload()
    }
  }, [audio.audioRef, audio.subscribeEnded, audio.track?.id, audio.track?.playbackInstance, audio.track?.planetId, album.id, sequence])
}
