import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { InteractionActivityTracker } from '../lib/interactionQuality'
import type { InteractionActivity } from '../lib/interactionQuality'

export interface InteractionActivityOptions { dragThreshold?: number }

function isControl(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('button, a, input, select, textarea, [contenteditable="true"], [data-no-scene-interaction]')
}

/** Native input observation only: never captures/prevents events or owns the camera gesture. */
export function useInteractionActivity(
  canvas: HTMLCanvasElement | null,
  onActivity: () => void,
  options: InteractionActivityOptions = {},
): RefObject<InteractionActivity> {
  const tracker = useRef(new InteractionActivityTracker(options.dragThreshold))
  const activity = useRef(tracker.current.activity)
  const callback = useRef(onActivity)
  callback.current = onActivity
  const dragThreshold = options.dragThreshold ?? 4

  useEffect(() => {
    if (!canvas) return
    const next = new InteractionActivityTracker(dragThreshold)
    next.setHidden(document.hidden)
    tracker.current = next
    activity.current = next.activity
    const report = (changed: boolean) => { if (changed) callback.current() }
    const now = () => performance.now()
    const wheel = (event: WheelEvent) => {
      if (!isControl(event.target)) report(next.wheel(event.deltaX, event.deltaY, event.deltaZ, now()))
    }
    const down = (event: PointerEvent) => {
      if (isControl(event.target)) return
      // Only actual canvas touches start a tracker; clicks on overlay/UI siblings never arrive here.
      if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1 && event.button !== 2) return
      next.beginPointer(event.pointerId, event.clientX, event.clientY)
    }
    const move = (event: PointerEvent) => report(next.movePointer(event.pointerId, event.clientX, event.clientY, now()))
    const up = (event: PointerEvent) => report(next.endPointer(event.pointerId, now()))
    const blur = () => report(next.clearPointers(now()))
    const visibility = () => report(next.setHidden(document.hidden))
    canvas.addEventListener('wheel', wheel, { passive: true })
    canvas.addEventListener('pointerdown', down, { passive: true })
    canvas.addEventListener('lostpointercapture', up, { passive: true })
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerup', up, { passive: true })
    window.addEventListener('pointercancel', up, { passive: true })
    window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      canvas.removeEventListener('wheel', wheel)
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('lostpointercapture', up)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('blur', blur)
      document.removeEventListener('visibilitychange', visibility)
      next.clearPointers(now())
    }
  }, [canvas, dragThreshold])

  return activity
}
