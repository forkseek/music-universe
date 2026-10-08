import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { ALBUM_TARGET, initialGalaxyView, overviewFor, zoomGalaxyView, ZOOM_SENSITIVITY } from '../lib/galaxyNavigation'
import type { GalaxyView } from '../lib/galaxyNavigation'
import type { CameraFollowTarget } from '../lib/spaceCamera'
import { getGalaxyFraming } from '../lib/sceneFraming'

export function useGalaxyNavigation(host: RefObject<HTMLElement | null>, resetKey: number, onFocus: (target: string) => void) {
  const [view, setView] = useState(initialGalaxyView)
  const viewRef = useRef(view)
  const pinching = useRef(false)
  // Overview describes the scale only; hovering never changes wheel navigation.
  const overview = useRef(false)
  const hover = useRef<string | null>(null)
  const followRef = useRef<string | null>(null)
  const followPointRef = useRef<CameraFollowTarget | null>(null)
  const [followingTarget, setFollowingTarget] = useState<string | null>(null)
  // A manual release stays in effect across pause/resume, track changes and album requests.
  const [followEnabled, setFollowEnabled] = useState(true)
  const lastResetKey = useRef(resetKey)
  const [cameraMode, cameraModeState] = useState<'orbit' | 'free'>('orbit')
  const cameraModeRef = useRef(cameraMode)
  const setCameraMode = useCallback((mode: 'orbit' | 'free') => { cameraModeRef.current = mode; cameraModeState(mode) }, [])
  const cameraActions = useRef<{ toggleFree: () => void; recenter: () => void; zoomFree: (pixels: number) => void; getLookCenter: () => [number, number, number]; returnToStarAnchor?: () => void } | null>(null)
  const projectAnchor = useRef<((view: GalaxyView, point: { x: number; y: number }) => [number, number] | undefined) | null>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const onFocusRef = useRef(onFocus)
  useEffect(() => { onFocusRef.current = onFocus }, [onFocus])
  const update = useCallback((next: GalaxyView) => { viewRef.current = next; setView(next) }, [])
  const setAnchor = useCallback((point: [number, number, number]) => {
    if (!point.every(Number.isFinite)) return
    update({ ...viewRef.current, center: [point[0], point[1]], centerZ: point[2] })
  }, [update])
  const focus = useCallback((target: string) => {
    if (viewRef.current.target !== target) update({ ...viewRef.current, target })
    onFocusRef.current(target)
  }, [update])
  const clearFollow = useCallback(() => {
    followRef.current = null
    followPointRef.current = null
    setFollowingTarget(null)
  }, [])
  const suspendFollow = useCallback(() => {
    if (followRef.current) {
      // Freeze the rendered look point, including Z, rather than jumping to the old view.
      const center = cameraActions.current?.getLookCenter()
      if (center) update({ ...viewRef.current, center: [center[0], center[1]], centerZ: center[2] })
    }
    clearFollow()
  }, [clearFollow, update])
  const releaseFollow = useCallback((returnAnchor = true) => {
    const wasFollowing = !!followRef.current
    suspendFollow()
    setFollowEnabled(false)
    // User release recentres the anchor only; automatic suspension still freezes the pose.
    if (wasFollowing && returnAnchor) cameraActions.current?.returnToStarAnchor?.()
  }, [suspendFollow])
  const enableFollow = useCallback(() => { setFollowEnabled(true) }, [])
  const reset = useCallback(() => {
    releaseFollow(false); overview.current = false; hover.current = null
    update({ ...initialGalaxyView(), target: viewRef.current.target })
  }, [releaseFollow, update])
  /** Acquire a planet smoothly without changing the user's chosen zoom distance. */
  const follow = useCallback((target: string | null) => {
    if (!target) { releaseFollow(); return }
    setFollowEnabled(true)
    if (followRef.current === target) return
    followRef.current = target
    followPointRef.current = null
    setFollowingTarget(target)
    update({ ...viewRef.current, target })
    onFocusRef.current(target)
  }, [releaseFollow, update])
  const setHover = useCallback((target: string | null) => { hover.current = target }, [])
  const zoomBy = useCallback((pixels: number, screenPoint?: { x: number; y: number }) => {
    if (cameraModeRef.current === 'free') { cameraActions.current?.zoomFree(pixels); return }
    const current = viewRef.current
    const element = host.current
    let anchor: [number, number] | undefined
    // A locked planet remains the zoom/pinch center regardless of pointer position.
    if (followRef.current) screenPoint = undefined
    if (screenPoint && projectAnchor.current) anchor = projectAnchor.current(current, screenPoint)
    if (!anchor && !projectAnchor.current && element && screenPoint) {
      const bounds = element.getBoundingClientRect()
      const framing = getGalaxyFraming(bounds.width, bounds.height)
      // Use the requested camera, so rapid deltas accumulate without damping drift.
      anchor = [
        current.center[0] + ((screenPoint.x - bounds.left) / bounds.width - 0.5) * framing.viewWidth * current.zoom,
        current.center[1] + (0.5 - (screenPoint.y - bounds.top) / bounds.height) * framing.viewHeight * current.zoom,
      ]
    }
    const next = zoomGalaxyView(current, pixels, anchor)
    if (next !== current) {
      overview.current = overviewFor(overview.current, next.zoom)
      update(next)
    }
  }, [host, update])
  useEffect(() => {
    overview.current = false
    hover.current = null
    if (lastResetKey.current !== resetKey) releaseFollow(false)
    else clearFollow()
    lastResetKey.current = resetKey
    update(initialGalaxyView())
    onFocusRef.current(ALBUM_TARGET)
  }, [resetKey, update, releaseFollow, clearFollow])
  useEffect(() => {
    const element = host.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      if (event.metaKey || event.buttons || document.querySelector('dialog[open]')) return
      if (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[data-scroll-native]')) return
      if (!event.deltaY) return
      // Trackpad pinch emits ctrl+wheel; it belongs to the 3D scene as well.
      event.preventDefault()
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1)
      // Wheel and trackpad zoom retain the current look point, independently of
      // cursor position or hovered planets. Only a real touch pinch supplies an anchor.
      zoomBy(pixels)
    }
    const touches = new Map<number, { x: number; y: number }>()
    let pinchDistance = 0
    const points = () => [...touches.values()]
    const distance = () => { const values = points(); return values.length === 2 ? Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y) : 0 }
    const pointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
      pinchDistance = distance()
      pinching.current = touches.size > 1
    }
    const pointerMove = (event: PointerEvent) => {
      if (!touches.has(event.pointerId)) return
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
      const next = distance()
      if (next > 0 && pinchDistance > 0) {
        event.preventDefault()
        const values = points()
        zoomBy(Math.log(pinchDistance / next) / ZOOM_SENSITIVITY, { x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 })
      }
      pinchDistance = next
    }
    const pointerUp = (event: PointerEvent) => { touches.delete(event.pointerId); pinchDistance = distance(); pinching.current = touches.size > 1 }
    const clearTouches = () => { touches.clear(); pinchDistance = 0; pinching.current = false }
    element.addEventListener('wheel', wheel, { passive: false })
    element.addEventListener('pointerdown', pointerDown)
    element.addEventListener('pointermove', pointerMove, { passive: false })
    window.addEventListener('pointerup', pointerUp)
    window.addEventListener('pointercancel', clearTouches)
    window.addEventListener('blur', clearTouches)
    return () => {
      element.removeEventListener('wheel', wheel)
      element.removeEventListener('pointerdown', pointerDown)
      element.removeEventListener('pointermove', pointerMove)
      window.removeEventListener('pointerup', pointerUp)
      window.removeEventListener('pointercancel', clearTouches)
      window.removeEventListener('blur', clearTouches)
    }
  }, [host, zoomBy])
  return { view, viewRef, pinching, overview, hover, setHover, setAnchor, focus, activate: focus, follow, followRef, followPointRef, followingTarget, followEnabled, enableFollow, releaseFollow, suspendFollow, zoomBy, reset, cameraMode, cameraModeRef, setCameraMode, cameraActions, projectAnchor, backdrop }
}

export type GalaxyNavigation = ReturnType<typeof useGalaxyNavigation>
