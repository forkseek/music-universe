import { useCallback, useEffect, useRef, useState } from 'react'
import type { MusicPlatform } from '../lib/musicPlatforms'
import { readLocalAudioMetadata } from '../lib/audioMetadata'
import { playbackFailure } from '../lib/playbackFailure'
import { resumeMediaAnalysis } from '../lib/audioReactivity'

/**
 * A real <audio> engine for this room.
 *
 * One audio element serves planet playback, the search panel and the bottom bar.
 */

export interface AudioTrackInfo {
  id: string
  /** Distinguishes separate loads of the same platform song or filename. */
  playbackInstance?: number
  title: string
  artist: string
  album: string
  cover: string
  planetId?: string
  provider?: MusicPlatform
  platformTrackId?: string
  albumId?: string
  durationMs?: number
  discNumber?: number
  trackNumber?: number
  trial?: boolean
}

/** What the bottom player needs to follow a real element instead of the virtual clock. */
export interface LivePlayback {
  track: AudioTrackInfo | null
  currentTime: number
  duration: number
  playing: boolean
  seek: (time: number) => void
}

export type PlaybackStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error'

const GESTURE_SILENCE = 'data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA'

export function useAudioPlayback() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const trackRef = useRef<AudioTrackInfo | null>(null)
  const playingListeners = useRef(new Set<(track: AudioTrackInfo) => void>())
  const endedListeners = useRef(new Set<(track: AudioTrackInfo) => void>())
  const endedGeneration = useRef<number | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const loadGeneration = useRef(0)
  const priming = useRef(false)
  const [blocked, setBlocked] = useState(false)
  const [track, setTrack] = useState<AudioTrackInfo | null>(null)
  const [status, setStatus] = useState<PlaybackStatus>('idle')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [message, setMessage] = useState('')
  const [volume, setVolumeState] = useState(0.8)
  const [muted, setMuted] = useState(false)

  const releaseObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  useEffect(() => {
    const element = audioRef.current
    if (!element) return
    element.volume = 0.8
    const onTime = () => { if (!priming.current) setCurrentTime(element.currentTime) }
    const onMeta = () => {
      if (priming.current) return
      setDuration(Number.isFinite(element.duration) ? element.duration : 0)
      // Metadata alone does not mean playback succeeded; only the playing event does.
      setStatus(current => current === 'idle' || current === 'paused' ? 'ready' : current)
    }
    const onWaiting = () => { if (!priming.current) setStatus(current => current === 'error' ? current : 'loading') }
    const onPlaying = () => {
      if (priming.current) return
      endedGeneration.current = null
      setBlocked(false)
      setStatus('playing')
      const current = trackRef.current
      if (current) for (const listener of playingListeners.current) listener(current)
    }
    const onPause = () => { if (!priming.current && element.paused) setStatus(current => current === 'error' || current === 'idle' ? current : 'paused') }
    const onEnded = () => {
      const current = trackRef.current
      if (priming.current || !element.ended || !current || endedGeneration.current === loadGeneration.current) return
      endedGeneration.current = loadGeneration.current
      setStatus('paused')
      for (const listener of endedListeners.current) listener(current)
    }
    const onVolume = () => { setVolumeState(element.volume); setMuted(element.muted) }
    const onError = () => {
      if (priming.current) return
      const failure = playbackFailure(new DOMException('Audio source failed', 'NotSupportedError'), element.error?.code)
      setStatus(failure.status); setBlocked(failure.blocked); setMessage(failure.message)
    }
    element.addEventListener('timeupdate', onTime)
    element.addEventListener('durationchange', onMeta)
    element.addEventListener('loadedmetadata', onMeta)
    element.addEventListener('waiting', onWaiting)
    element.addEventListener('playing', onPlaying)
    element.addEventListener('pause', onPause)
    element.addEventListener('volumechange', onVolume)
    element.addEventListener('ended', onEnded)
    element.addEventListener('error', onError)
    return () => {
      element.removeEventListener('timeupdate', onTime)
      element.removeEventListener('durationchange', onMeta)
      element.removeEventListener('loadedmetadata', onMeta)
      element.removeEventListener('waiting', onWaiting)
      element.removeEventListener('playing', onPlaying)
      element.removeEventListener('pause', onPause)
      element.removeEventListener('volumechange', onVolume)
      element.removeEventListener('ended', onEnded)
      element.removeEventListener('error', onError)
    }
  }, [])

  useEffect(() => () => releaseObjectUrl(), [releaseObjectUrl])

  /** Prepare this media element synchronously, before metadata/API awaits lose activation. */
  const primePlayback = useCallback(() => {
    const element = audioRef.current
    resumeMediaAnalysis(element)
    if (!element || trackRef.current || (element.src && !priming.current)) return
    priming.current = true
    element.src = GESTURE_SILENCE
    void element.play().catch(() => { /* The real source reports permission failures separately. */ })
  }, [])

  /** Point the element at a source and (by default) start playing it. */
  const load = useCallback(async (url: string, info: AudioTrackInfo, options?: { objectUrl?: boolean }) => {
    const element = audioRef.current
    resumeMediaAnalysis(element)
    if (!element || !url) return false
    const generation = ++loadGeneration.current
    priming.current = false
    setBlocked(false)
    releaseObjectUrl()
    if (options?.objectUrl) objectUrlRef.current = url
    setMessage('')
    const nextInfo = { ...info, playbackInstance: generation }
    trackRef.current = nextInfo
    setTrack(nextInfo)
    setCurrentTime(0)
    setDuration(0)
    setStatus('loading')
    element.src = url
    element.load()
    try {
      await element.play()
      if (generation !== loadGeneration.current) return false
      setStatus('playing')
      return true
    } catch (error) {
      // A new load aborts the previous play() promise; that is not a failure.
      if (generation !== loadGeneration.current || (error instanceof DOMException && error.name === 'AbortError')) return false
      const failure = playbackFailure(error, element.error?.code)
      setStatus(failure.status); setBlocked(failure.blocked); setMessage(failure.message)
      return false
    }
  }, [releaseObjectUrl])

  const play = useCallback(async () => {
    const element = audioRef.current
    resumeMediaAnalysis(element)
    if (!element || !element.src || priming.current) return false
    setMessage(''); setBlocked(false)
    const generation = loadGeneration.current
    try {
      // Retry the already-resolved source immediately in the user's click handler.
      if (element.error) element.load()
      await element.play()
      return generation === loadGeneration.current
    } catch (error) {
      if (generation !== loadGeneration.current || (error instanceof DOMException && error.name === 'AbortError')) return false
      const failure = playbackFailure(error, element.error?.code)
      setStatus(failure.status); setBlocked(failure.blocked); setMessage(failure.message)
      return false
    }
  }, [])

  const pause = useCallback(() => audioRef.current?.pause(), [])

  const toggle = useCallback(() => {
    const element = audioRef.current
    if (!element || !element.src) return
    if (element.paused) play()
    else element.pause()
  }, [play])

  const seek = useCallback((time: number) => {
    const element = audioRef.current
    if (!element || !Number.isFinite(time)) return
    const limit = Number.isFinite(element.duration) ? element.duration : 0
    element.currentTime = Math.max(0, Math.min(limit || time, time))
    setCurrentTime(element.currentTime)
  }, [])

  const stop = useCallback(() => {
    loadGeneration.current++
    priming.current = false
    setBlocked(false)
    const element = audioRef.current
    if (element) {
      element.pause()
      element.removeAttribute('src')
      element.load()
    }
    releaseObjectUrl()
    trackRef.current = null
    setTrack(null)
    setStatus('idle')
    setCurrentTime(0)
    setDuration(0)
    setMessage('')
  }, [releaseObjectUrl])

  const setVolume = useCallback((value: number) => {
    const element = audioRef.current
    if (!element || !Number.isFinite(value)) return
    element.volume = Math.max(0, Math.min(1, value))
    element.muted = element.volume === 0
    setVolumeState(element.volume); setMuted(element.muted)
  }, [])
  const toggleMute = useCallback(() => {
    const element = audioRef.current
    if (!element) return
    const silent = element.muted || element.volume === 0
    element.muted = !silent
    if (silent && element.volume === 0) element.volume = 0.8
    setVolumeState(element.volume); setMuted(element.muted)
  }, [])

  const getTrack = useCallback(() => trackRef.current, [])
  const subscribePlaying = useCallback((listener: (track: AudioTrackInfo) => void) => {
    playingListeners.current.add(listener)
    return () => { playingListeners.current.delete(listener) }
  }, [])
  const subscribeEnded = useCallback((listener: (track: AudioTrackInfo) => void) => {
    endedListeners.current.add(listener)
    return () => { endedListeners.current.delete(listener) }
  }, [])
  const updateTrack = useCallback((expectedId: string, patch: Partial<AudioTrackInfo>) => {
    if (trackRef.current?.id !== expectedId) return
    const next = { ...trackRef.current, ...patch, id: expectedId }
    trackRef.current = next
    setTrack(next)
  }, [])

  /** Read ID3/MP4/FLAC tags locally; only metadata enters the album resolver. */
  const loadFile = useCallback(async (file: File) => {
    const element = audioRef.current
    if (!element) return
    const type = file.type || ''
    if (type && !type.startsWith('audio/')) {
      setStatus('error')
      setTrack(null)
      setMessage(`「${file.name}」不是音频文件，请选择 MP3 / WAV / M4A 等音频格式。`)
      return
    }
    stop()
    primePlayback()
    const generation = loadGeneration.current
    setStatus('loading')
    const metadata = await readLocalAudioMetadata(file).catch(() => null)
    if (generation !== loadGeneration.current) return
    const name = file.name.replace(/\.[^.]+$/, '') || file.name
    void load(URL.createObjectURL(file), { id: `file-${file.name}`, title: metadata?.title || name, artist: metadata?.artist || '本地音频',
      album: metadata?.album || '', cover: '', durationMs: metadata?.durationMs, discNumber: metadata?.discNumber, trackNumber: metadata?.trackNumber }, { objectUrl: true })
    // canPlayType is advisory: an empty answer means "probably not", so warn but still try.
    if (type && !element.canPlayType(type)) setMessage(`提示：浏览器可能不支持 ${type}，若无法播放请改用 MP3 / WAV / M4A。`)
  }, [load, stop, primePlayback])

  return {
    audioRef,
    blocked,
    primePlayback,
    getTrack,
    subscribePlaying,
    subscribeEnded,
    updateTrack,
    track,
    status,
    currentTime,
    duration,
    playing: status === 'playing',
    message,
    load,
    loadFile,
    play,
    pause,
    toggle,
    seek,
    stop,
    setMessage,
    volume,
    muted,
    setVolume,
    toggleMute,
  }
}

export type AudioPlayback = ReturnType<typeof useAudioPlayback>
