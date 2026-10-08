import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Drives the player readout without an audio element.
 *
 * This room ships no audio assets, so the transport, clock and seek bar advance
 * a virtual position instead of pretending to play sound. Swapping tracks
 * restarts from zero, exactly like a real source change.
 */
export function useVirtualPlayback({ index, duration, playing }: { index: number; duration: number; playing: boolean }) {
  const [currentTime, setCurrentTime] = useState(0)
  const position = useRef(0)
  useEffect(() => { position.current = 0; setCurrentTime(0) }, [index])
  useEffect(() => {
    if (!playing || duration <= 0) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      position.current = (position.current + Math.min((now - last) / 1000, 0.25)) % duration
      last = now
      setCurrentTime(position.current)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, duration])
  const seek = useCallback((time: number) => {
    if (!Number.isFinite(time)) return
    position.current = Math.max(0, Math.min(duration, time))
    setCurrentTime(position.current)
  }, [duration])
  return { currentTime, seek }
}
