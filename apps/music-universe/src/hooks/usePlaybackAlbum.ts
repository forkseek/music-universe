import { useCallback, useEffect, useRef, useState } from 'react'
import type { AudioPlayback, AudioTrackInfo } from './useAudioPlayback'
import { LatestAlbumRequest, PlaybackAlbumResolver, playingIdentity, preloadAlbumCover } from '../lib/automaticAlbum'
import type { PlaybackAlbum } from '../lib/automaticAlbum'
import { fetchPlayingAlbum } from '../lib/musicPlatforms'

export interface AlbumSyncState { status: 'idle' | 'loading' | 'ready' | 'error' | 'unidentified'; message: string; albumId?: string; planetId?: string; trackIndex?: number }

/** Subscribe once to the real HTMLAudioElement's `playing` events, regardless of the playback entry. */
export function usePlaybackAlbum(audio: AudioPlayback, onResolved: (value: PlaybackAlbum) => boolean | void, deferred = false) {
  const [state, setState] = useState<AlbumSyncState>({ status: 'idle', message: '' })
  const [resolver] = useState(() => new PlaybackAlbumResolver(fetchPlayingAlbum))
  const latest = useRef(new LatestAlbumRequest())
  const callbacks = useRef({ audio, onResolved })
  const handled = useRef('')
  const pending = useRef('')
  const generation = useRef(0)
  useEffect(() => { callbacks.current = { audio, onResolved } }, [audio, onResolved])

  const synchronize = useCallback((track: AudioTrackInfo, force = false) => {
    const key = `${track.id}:${track.playbackInstance ?? 0}`
    if (!force && (handled.current === key || pending.current === key)) return
    const identity = playingIdentity(track)
    if (!identity) { setState({ status: 'unidentified', message: '音频缺少歌名或歌手标签，暂时无法自动识别专辑。' }); return }
    const sequence = ++generation.current
    pending.current = key
    setState({ status: 'loading', message: `正在识别「${track.title}」的专辑…` })
    void latest.current.run(identity, resolver, async (value, signal) => {
      await preloadAlbumCover(value.album.cover, signal)
      signal.throwIfAborted()
      const current = callbacks.current.audio.getTrack()
      if (current?.id !== track.id || current?.playbackInstance !== track.playbackInstance || sequence !== generation.current) return
      // The scene can defer an old song's metadata while the user resolves a new selection.
      // Check before changing audio.planetId, otherwise its still-playing card loses ownership.
      if (callbacks.current.onResolved(value) === false) { setState({ status: 'idle', message: '' }); return }
      callbacks.current.audio.updateTrack(track.id, { planetId: value.planetId, cover: value.album.cover })
      handled.current = key
      setState({ status: 'ready', albumId: value.album.id, planetId: value.planetId, trackIndex: value.trackIndex,
        message: `${value.album.name} · 第 ${String(value.trackIndex + 1).padStart(2, '0')} / ${value.album.tracks.length} 首 · ${track.title}` })
    }).catch(error => {
      const current = callbacks.current.audio.getTrack()
      if (sequence !== generation.current || current?.id !== track.id || current?.playbackInstance !== track.playbackInstance) return
      setState({ status: 'error', message: error instanceof Error ? error.message : '专辑信息暂时无法获取，音乐仍可继续播放。' })
    }).finally(() => { if (sequence === generation.current) pending.current = '' })
  }, [resolver])

  useEffect(() => audio.subscribePlaying(synchronize), [audio.subscribePlaying, synchronize])
  useEffect(() => {
    // Loading a different song invalidates a pending match before its playing event arrives.
    generation.current++; latest.current.cancel(); pending.current = ''
    const key = audio.track ? `${audio.track.id}:${audio.track.playbackInstance ?? 0}` : ''
    if (handled.current !== key) handled.current = ''
    if (!audio.track) setState({ status: 'idle', message: '' })
    if (audio.playing && audio.track) synchronize(audio.track)
    return () => { generation.current++; latest.current.cancel(); pending.current = '' }
  }, [audio.track?.id, audio.track?.playbackInstance, synchronize]) // Pause/resume and album state never restart audio.
  useEffect(() => {
    // Recover a playing event superseded by the track-change effect, or a match deferred
    // while a new selection was resolving. Failed selections must not strand the old star.
    if (!deferred && audio.playing && audio.track) synchronize(audio.track)
  }, [deferred, audio.playing, audio.track?.id, audio.track?.playbackInstance, synchronize])
  const retry = () => { const track = audio.getTrack(); if (track) synchronize(track, true) }
  return { ...state, retry }
}
