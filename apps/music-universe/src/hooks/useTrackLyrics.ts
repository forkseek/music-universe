import { useEffect, useRef, useState } from 'react'
import { fetchMusicLyrics } from '../lib/musicPlatforms'
import { LYRIC_LIMITS, parseLrc } from '../lib/lyrics'
import type { LyricLine } from '../lib/lyrics'
import type { AudioPlayback } from './useAudioPlayback'

type LyricStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'
interface LyricState { key: string; status: LyricStatus; lines: readonly LyricLine[]; message: string; source?: 'platform' | 'file' }
const EMPTY: readonly LyricLine[] = []
const initial: LyricState = { key: '', status: 'idle', lines: EMPTY, message: '' }

/** One lyric owner for all playback entry points; imports never leave this browser. */
export function useTrackLyrics(audio: AudioPlayback, switching: boolean) {
  const track = audio.track
  const provider = track?.provider
  const platformId = track?.platformTrackId
  const resourceKey = track ? (provider && platformId ? `${provider}:${platformId}` : `local:${track.playbackInstance}`) : ''
  const trackKey = resourceKey ? `${resourceKey}:${track?.playbackInstance ?? 0}` : ''
  const latestKey = useRef(trackKey); latestKey.current = trackKey
  const [state, setState] = useState<LyricState>(initial)
  const [importError, setImportError] = useState<{ key: string; message: string } | null>(null)
  const request = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const cache = useRef(new Map<string, { lines: readonly LyricLine[]; expires: number; source: 'platform' | 'file' }>())
  const remember = (key: string, lines: readonly LyricLine[], source: 'platform' | 'file') => {
    cache.current.delete(key)
    cache.current.set(key, { lines, source, expires: Date.now() + LYRIC_LIMITS.cacheMs })
    while (cache.current.size > LYRIC_LIMITS.cacheEntries) cache.current.delete(cache.current.keys().next().value!)
  }

  useEffect(() => {
    const version = ++generation.current
    request.current?.abort()
    if (!trackKey) { setState(initial); return }
    const saved = cache.current.get(resourceKey)
    if (saved && (saved.source === 'file' || saved.expires > Date.now())) {
      setState({ key: trackKey, status: 'ready', lines: saved.lines, source: saved.source, message: saved.source === 'file' ? '本地 LRC' : '' }); return
    }
    if (!provider || !platformId) {
      setState({ key: trackKey, status: 'unavailable', lines: EMPTY, message: '此音频暂无平台歌词，可导入 LRC。' }); return
    }
    const controller = new AbortController(); request.current = controller
    setState({ key: trackKey, status: 'loading', lines: EMPTY, message: '正在获取歌词…' })
    void fetchMusicLyrics(provider, platformId, controller.signal).then(result => {
      if (controller.signal.aborted || version !== generation.current) return
      if (result.provider !== provider || result.trackId !== platformId) throw new Error('歌词与当前歌曲不匹配。')
      const lines = result.available ? parseLrc(result.lyric) : []
      if (!lines.some(line => line.text)) {
        setState({ key: trackKey, status: 'unavailable', lines: EMPTY, message: result.message || '暂无同步歌词，可导入 LRC。' }); return
      }
      remember(resourceKey, lines, 'platform')
      setState({ key: trackKey, status: 'ready', lines, source: 'platform', message: '' })
    }).catch(error => {
      if (controller.signal.aborted || version !== generation.current) return
      setState({ key: trackKey, status: 'error', lines: EMPTY, message: error instanceof Error ? error.message : '歌词暂不可用，可导入 LRC。' })
    })
    return () => controller.abort()
  }, [trackKey, resourceKey, provider, platformId])

  const importFile = async (file: File) => {
    const capturedKey = trackKey
    if (!capturedKey || switching) return
    setImportError(null)
    // Claim the current track before awaiting file I/O, so a slow API cannot replace this import.
    const version = ++generation.current
    request.current?.abort()
    try {
      if (file.size > LYRIC_LIMITS.bytes) throw new Error('歌词文件不能超过 512 KB。')
      const lines = parseLrc(await file.text())
      if (!lines.some(line => line.text)) throw new Error('未找到有效的 LRC 时间行，请使用 [分:秒.毫秒] 格式。')
      if (latestKey.current !== capturedKey || version !== generation.current) return
      remember(resourceKey, lines, 'file')
      setState({ key: capturedKey, status: 'ready', lines, source: 'file', message: '本地 LRC' })
    } catch (error) {
      if (latestKey.current !== capturedKey || version !== generation.current) return
      const message = error instanceof Error ? error.message : '无法读取歌词文件。'
      setImportError({ key: capturedKey, message })
      setState(current => current.key === capturedKey && current.status === 'ready' ? current : { key: capturedKey, status: 'error', lines: EMPTY, message })
    }
  }
  // This render-time gate hides the previous song even before the next effect executes.
  const current = state.key === trackKey && !switching ? state : { ...initial, key: trackKey, status: (trackKey ? 'loading' : 'idle') as LyricStatus }
  return { ...current, trackKey, importFile, canImport: !!track && !switching, importError: importError?.key === trackKey ? importError.message : '' }
}
export type TrackLyrics = ReturnType<typeof useTrackLyrics>
