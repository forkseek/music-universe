import { useCallback, useEffect, useRef, useState } from 'react'
import type { Album } from '../lib/generateAlbumGalaxy'
import { albumPlaybackKey, resolveAlbumPlayback } from '../lib/albumPlayback'
import { NextTrackPreloader } from '../lib/nextTrackPreload'
import type { AudioPlayback, AudioTrackInfo } from './useAudioPlayback'

export function useAlbumMusic(album: Album, audio: AudioPlayback) {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)
  // The current requested song is synchronous, so rapid clicks always advance from the latest intent.
  const pendingId = useRef<string | null>(null)
  const resolving = useRef(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const request = useRef<AbortController | null>(null)
  const loadAudio = useRef(audio.load)
  const [preloader] = useState(() => new NextTrackPreloader<AudioTrackInfo>())
  useEffect(() => { loadAudio.current = audio.load }, [audio.load])
  useEffect(() => {
    request.current?.abort(); preloader.clear(); pendingId.current = null; resolving.current = false
    setLoadingId(null); setFailedId(null); setMessage(''); setError(false)
    return () => { request.current?.abort(); preloader.clear() }
  }, [album.id, preloader])

  const preloadTrack = useCallback((id: string) => {
    const track = album.tracks.find(item => item.id === id)
    if (!track) return Promise.resolve()
    return preloader.prepare(albumPlaybackKey(album, track), signal => resolveAlbumPlayback(album, track, signal))
  }, [album, preloader])
  const cancelPreload = useCallback(() => preloader.clear(), [preloader])

  const playTrack = async (id: string): Promise<'started' | 'ready' | 'failed' | 'cancelled'> => {
    const track = album.tracks.find(item => item.id === id)
    if (!track || pendingId.current === id) return 'cancelled'
    request.current?.abort()
    const controller = new AbortController(); request.current = controller
    pendingId.current = id; resolving.current = true
    // Preparation is silent: the current element remains untouched until the replacement is ready.
    audio.primePlayback()
    setLoadingId(id); setFailedId(null); setMessage('正在加载「' + track.title + '」…'); setError(false)
    const prepared = preloader.take(albumPlaybackKey(album, track))
    try {
      const source = prepared ?? await resolveAlbumPlayback(album, track, controller.signal)
      if (controller.signal.aborted) {
        if (source.objectUrl) URL.revokeObjectURL(source.url)
        return 'cancelled'
      }
      resolving.current = false
      const started = await loadAudio.current(source.url, source.info, { objectUrl: source.objectUrl })
      if (controller.signal.aborted) return 'cancelled'
      setMessage(started ? '' : '音源已加载，请再点一次播放。')
      return started ? 'started' : 'ready'
    } catch (failure) {
      if (controller.signal.aborted) return 'cancelled'
      setError(true); setFailedId(id)
      setMessage(failure instanceof Error ? failure.message : '歌曲暂时无法播放，请重试。')
      return 'failed'
    } finally {
      prepared?.releasePreload?.()
      if (request.current === controller && !controller.signal.aborted) { pendingId.current = null; resolving.current = false; setLoadingId(null) }
    }
  }
  const cancel = () => {
    request.current?.abort(); preloader.clear(); pendingId.current = null; resolving.current = false
    setLoadingId(null); setFailedId(null); setMessage(''); setError(false)
  }
  return { playTrack, preloadTrack, cancelPreload, loadingId, pendingId, resolving, failedId, loading: !!loadingId, message, error, cancel }
}
