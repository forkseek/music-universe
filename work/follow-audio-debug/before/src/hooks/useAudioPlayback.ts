import { useCallback, useEffect, useRef, useState } from 'react'
import type { MusicPlatform } from '../lib/musicPlatforms'
import { readLocalAudioMetadata } from '../lib/audioMetadata'

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

// MediaError codes: 1 aborted, 2 network, 3 decode, 4 source not supported.
const ERROR_MESSAGES: Record<number, string> = {
  1: '音频加载被中断，请重试。',
  2: '音频下载中断，请检查网络后重试。',
  3: '音频无法解码，文件可能已损坏或格式不受支持。',
  4: '无法播放该音频：地址不可用，或浏览器不支持该格式。',
}

export function useAudioPlayback() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const trackRef = useRef<AudioTrackInfo | null>(null)
  const playingListeners = useRef(new Set<(track: AudioTrackInfo) => void>())
  const objectUrlRef = useRef<string | null>(null)
  const loadGeneration = useRef(0)
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
    const onTime = () => setCurrentTime(element.currentTime)
    const onMeta = () => { setDuration(Number.isFinite(element.duration) ? element.duration : 0); setStatus(current => current === 'error' ? current : element.paused ? 'ready' : 'playing') }
    const onWaiting = () => setStatus((current) => (current === 'error' ? current : 'loading'))
    const onPlaying = () => {
      setStatus('playing')
      const current = trackRef.current
      if (current) for (const listener of playingListeners.current) listener(current)
    }
    const onPause = () => setStatus(current => current === 'error' || current === 'idle' ? current : 'paused')
    const onEnded = () => setStatus('paused')
    const onVolume = () => { setVolumeState(element.volume); setMuted(element.muted) }
    const onError = () => {
      setStatus('error')
      setMessage(ERROR_MESSAGES[element.error?.code ?? 0] ?? '音频加载失败，请检查地址后重试。')
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

  /** Point the element at a source and (by default) start playing it. */
  const load = useCallback(async (url: string, info: AudioTrackInfo, options?: { objectUrl?: boolean }) => {
    const element = audioRef.current
    if (!element || !url) return false
    const generation = ++loadGeneration.current
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
      setStatus('paused')
      setMessage(error instanceof DOMException && error.name === 'NotAllowedError'
        ? '音源已准备好，请再点击一次播放。'
        : '音频暂时无法播放，请点击播放重试。')
      return false
    }
  }, [releaseObjectUrl])

  const play = useCallback(() => {
    const element = audioRef.current
    if (!element || !element.src) return
    setMessage('')
    const generation = loadGeneration.current
    void element.play().catch(error => {
      if (generation !== loadGeneration.current || (error instanceof DOMException && error.name === 'AbortError')) return
      setMessage(error instanceof DOMException && error.name === 'NotAllowedError' ? '音源已准备好，请再点击一次播放。' : '音频暂时无法播放，请点击播放重试。')
    })
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
    const generation = loadGeneration.current
    setStatus('loading')
    const metadata = await readLocalAudioMetadata(file).catch(() => null)
    if (generation !== loadGeneration.current) return
    const name = file.name.replace(/\.[^.]+$/, '') || file.name
    void load(URL.createObjectURL(file), { id: `file-${file.name}`, title: metadata?.title || name, artist: metadata?.artist || '本地音频',
      album: metadata?.album || '', cover: '', durationMs: metadata?.durationMs, discNumber: metadata?.discNumber, trackNumber: metadata?.trackNumber }, { objectUrl: true })
    // canPlayType is advisory: an empty answer means "probably not", so warn but still try.
    if (type && !element.canPlayType(type)) setMessage(`提示：浏览器可能不支持 ${type}，若无法播放请改用 MP3 / WAV / M4A。`)
  }, [load, stop])

  return {
    audioRef,
    getTrack,
    subscribePlaying,
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
