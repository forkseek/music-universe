import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AudioPlayback } from './useAudioPlayback'
import {
  resolveAudioReactivityConfig,
  retainMediaAnalysis,
  resumeMediaAnalysis,
  updateAudioBands,
} from '../lib/audioReactivity'
import type { AudioBands, AudioReactivityConfig, MediaAnalysisHandle, MediaAnalysisSnapshot } from '../lib/audioReactivity'

export interface AudioAnalysisOptions {
  strength: number
  reducedMotion: boolean
  config?: Partial<AudioReactivityConfig>
}

/** FFT work runs only when the scene calls sample(), never in a parallel rAF. */
export function useAudioAnalysis(audio: Pick<AudioPlayback, 'audioRef'>, options: AudioAnalysisOptions) {
  const bandsRef = useRef<AudioBands>({ low: 0, high: 0, available: false })
  const handleRef = useRef<MediaAnalysisHandle | null>(null)
  const optionsRef = useRef(options)
  const config = useMemo(() => resolveAudioReactivityConfig(options.config), [options.config])
  const configRef = useRef(config)
  configRef.current = config
  optionsRef.current = options
  const enabled = Number.isFinite(options.strength) && options.strength > 0 && !options.reducedMotion
  const [snapshot, setSnapshot] = useState<MediaAnalysisSnapshot>({ status: enabled ? 'gesture-required' : 'disabled', message: '' })

  useEffect(() => {
    const element = audio.audioRef.current
    if (!element) return
    const handle = retainMediaAnalysis(element, enabled, next => {
      setSnapshot(previous => previous.status === next.status && previous.message === next.message ? previous : next)
    }, configRef.current)
    handleRef.current = handle
    return () => {
      if (handleRef.current === handle) handleRef.current = null
      handle.release()
    }
    // The audio ref belongs to the single native player; option changes reuse it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio.audioRef])

  useEffect(() => { handleRef.current?.setEnabled(enabled) }, [enabled])
  useEffect(() => { handleRef.current?.setConfig(config) }, [config])

  const sample = useCallback((delta: number) => {
    const element = audio.audioRef.current
    const liveOptions = optionsRef.current
    const playing = !!element && !element.paused && !element.ended && !element.muted && element.volume > 0
    const canRead = liveOptions.strength > 0 && !liveOptions.reducedMotion && playing
    const target = canRead ? handleRef.current?.read() ?? null : null
    const changed = updateAudioBands(bandsRef.current, target, delta, {
      strength: liveOptions.strength,
      volume: element?.volume ?? 0,
      reducedMotion: liveOptions.reducedMotion,
      playing,
      available: target !== null,
    }, configRef.current)
    // Keep demand rendering sampling live music even during an unchanging note.
    // Paused/unavailable capture invalidates only until its release settles.
    return target !== null || changed
  }, [audio.audioRef])

  const resume = useCallback(() => resumeMediaAnalysis(audio.audioRef.current, { force: true }), [audio.audioRef])

  return { sample, bandsRef, status: snapshot.status, message: snapshot.message, resume }
}
