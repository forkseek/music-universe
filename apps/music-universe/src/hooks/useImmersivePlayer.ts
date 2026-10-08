import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'

export const IMMERSIVE_PLAYER_CONFIG = { edge: 56, openDelay: 280, closeDelay: 900, swipeDistance: 32 } as const

/** Timers run on pointer transitions, never in the 3D frame loop. */
export function useImmersivePlayer(enabled: boolean, busy: boolean, dock: RefObject<HTMLDivElement | null>) {
  const [revealed, setRevealed] = useState(false)
  const open = useRef(false), blocked = useRef(busy), dismissed = useRef(false), touchPinned = useRef(false)
  const enterTimer = useRef<number | undefined>(undefined), leaveTimer = useRef<number | undefined>(undefined)
  const held = useRef(false), inside = useRef(false)
  const keyboardIntent = useRef(false), keyboardFocus = useRef(false)
  const gesture = useRef<{ y: number; pointerId: number } | null>(null)
  const swiped = useRef(false)
  blocked.current = busy
  const clearTimers = useCallback(() => { clearTimeout(enterTimer.current); clearTimeout(leaveTimer.current); enterTimer.current = leaveTimer.current = undefined }, [])
  const show = useCallback(() => { clearTimers(); dismissed.current = false; open.current = true; setRevealed(true) }, [clearTimers])
  const close = useCallback(() => {
    clearTimers(); dismissed.current = true; touchPinned.current = false; open.current = false; setRevealed(false)
    if (dock.current?.contains(document.activeElement)) (document.activeElement as HTMLElement)?.blur()
  }, [clearTimers, dock])

  useEffect(() => {
    if (!enabled) { clearTimers(); open.current = false; touchPinned.current = false; dismissed.current = false; setRevealed(false); return }
    const inDock = (target: EventTarget | null) => target instanceof Node && !!dock.current?.contains(target)
    const inHandle = (target: EventTarget | null) => target instanceof Element && !!target.closest('.immersive-player-handle')
    const focused = () => keyboardFocus.current && inDock(document.activeElement)
    const scheduleClose = () => {
      clearTimeout(enterTimer.current); enterTimer.current = undefined
      if (!open.current || leaveTimer.current !== undefined || held.current || focused() || blocked.current || touchPinned.current) return
      leaveTimer.current = window.setTimeout(() => {
        leaveTimer.current = undefined
        if (!inside.current && !held.current && !focused() && !blocked.current && !touchPinned.current) { open.current = false; setRevealed(false) }
      }, IMMERSIVE_PLAYER_CONFIG.closeDelay)
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      touchPinned.current = false
      const near = event.clientY >= window.innerHeight - IMMERSIVE_PLAYER_CONFIG.edge
      inside.current = inDock(event.target) || inHandle(event.target) || near
      if (!inside.current) { dismissed.current = false; scheduleClose(); return }
      clearTimeout(leaveTimer.current); leaveTimer.current = undefined
      if (open.current || dismissed.current || blocked.current || enterTimer.current !== undefined) return
      enterTimer.current = window.setTimeout(() => { enterTimer.current = undefined; if (inside.current && !blocked.current && !dismissed.current) show() }, IMMERSIVE_PLAYER_CONFIG.openDelay)
    }
    const leave = () => { inside.current = false; dismissed.current = false; scheduleClose() }
    const down = (event: PointerEvent) => {
      keyboardIntent.current = false; keyboardFocus.current = false
      if (inDock(event.target)) { held.current = true; clearTimers() }
      else if (event.pointerType !== 'mouse' && open.current && !inHandle(event.target) && !blocked.current) close()
    }
    const up = (event: PointerEvent) => {
      held.current = false
      if (event.pointerType === 'mouse') inside.current = inDock(document.elementFromPoint(event.clientX, event.clientY)) || event.clientY >= window.innerHeight - IMMERSIVE_PLAYER_CONFIG.edge
      if (!inside.current) scheduleClose()
    }
    const focus = (event: FocusEvent) => { if (inDock(event.target)) { keyboardFocus.current = keyboardIntent.current; clearTimers(); if (!dismissed.current) show() } }
    const blur = () => { queueMicrotask(() => { if (!focused()) scheduleClose() }) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Tab') keyboardIntent.current = true }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerdown', down, { passive: true })
    window.addEventListener('pointerup', up, { passive: true })
    window.addEventListener('pointercancel', up, { passive: true })
    window.addEventListener('blur', leave)
    document.addEventListener('pointerleave', leave)
    document.addEventListener('focusin', focus)
    document.addEventListener('focusout', blur)
    document.addEventListener('keydown', key)
    return () => {
      clearTimers(); held.current = false; inside.current = false
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('blur', leave)
      document.removeEventListener('pointerleave', leave); document.removeEventListener('focusin', focus); document.removeEventListener('focusout', blur)
      document.removeEventListener('keydown', key)
    }
  }, [enabled, dock, clearTimers, show, close])
  useEffect(() => {
    // Closing a queue/search overlay restarts the delay even if the mouse stays still.
    if (!enabled || busy || !open.current || inside.current || touchPinned.current || held.current || dock.current?.contains(document.activeElement)) return
    leaveTimer.current = window.setTimeout(() => { leaveTimer.current = undefined; if (!inside.current && !blocked.current) { open.current = false; setRevealed(false) } }, IMMERSIVE_PLAYER_CONFIG.closeDelay)
    return () => { clearTimeout(leaveTimer.current); leaveTimer.current = undefined }
  }, [enabled, busy, dock])

  return {
    revealed, close,
    handle: {
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
        swiped.current = false; gesture.current = { y: event.clientY, pointerId: event.pointerId }
        event.currentTarget.setPointerCapture(event.pointerId); event.stopPropagation()
      },
      onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
        const start = gesture.current; gesture.current = null
        if (start?.pointerId !== event.pointerId) return
        const delta = start.y - event.clientY
        if (Math.abs(delta) >= IMMERSIVE_PLAYER_CONFIG.swipeDistance) {
          swiped.current = true
          if (delta > 0) { touchPinned.current = true; show() } else close()
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        event.stopPropagation()
      },
      onPointerCancel: () => { gesture.current = null; swiped.current = true },
      onClick: () => { if (swiped.current) { swiped.current = false; return }; if (open.current) close(); else { touchPinned.current = true; show() } },
    },
  }
}
