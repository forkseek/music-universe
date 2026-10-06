import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { ALBUM_TARGET, initialGalaxyView, overviewFor, zoomGalaxyView, ZOOM_SENSITIVITY } from '../lib/galaxyNavigation'
import type { GalaxyView } from '../lib/galaxyNavigation'
import { getGalaxyFraming } from '../lib/sceneFraming'

/** 双击星球跟随过去时的相机距离：比整星系统览更近，让该星球成为画面主体。 */
const FOLLOW_ZOOM = 0.5

export function useGalaxyNavigation(host: RefObject<HTMLElement | null>, resetKey: number, onFocus: (target: string) => void) {
  const [view, setView] = useState(initialGalaxyView)
  const viewRef = useRef(view)
  const pinching = useRef(false)
  // Overview describes the scale only; hovering never changes wheel navigation.
  const overview = useRef(false)
  const hover = useRef<string | null>(null)
  /** 双击星球后需要逐帧跟随的目标；由场景在每帧写入 followRef 对应星球的位置。 */
  const followRef = useRef<string | null>(null)
  const [cameraMode, cameraModeState] = useState<'orbit' | 'free'>('orbit')
  const cameraModeRef = useRef(cameraMode)
  const setCameraMode = useCallback((mode: 'orbit' | 'free') => { cameraModeRef.current = mode; cameraModeState(mode) }, [])
  const cameraActions = useRef<{ toggleFree: () => void; recenter: () => void; zoomFree: (pixels: number) => void } | null>(null)
  const projectAnchor = useRef<((view: GalaxyView, point: { x: number; y: number }) => [number, number] | undefined) | null>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const onFocusRef = useRef(onFocus)
  useEffect(() => { onFocusRef.current = onFocus }, [onFocus])
  const update = useCallback((next: GalaxyView) => { viewRef.current = next; setView(next) }, [])
  const focus = useCallback((target: string) => {
    if (viewRef.current.target !== target) update({ ...viewRef.current, target })
    onFocusRef.current(target)
  }, [update])
  const reset = useCallback(() => { overview.current = false; hover.current = null; followRef.current = null; update({ ...initialGalaxyView(), target: viewRef.current.target }) }, [update])
  /** 让主视角飞到目标星球：拉近到跟随距离，并由场景逐帧把相机中心贴在该星球上。 */
  const follow = useCallback((target: string | null) => {
    followRef.current = target
    if (!target) return
    const current = viewRef.current
    const zoom = Math.min(current.zoom, FOLLOW_ZOOM)
    if (zoom !== current.zoom) overview.current = overviewFor(overview.current, zoom)
    update({ ...current, target, zoom })
    onFocusRef.current(target)
  }, [update])
  const setHover = useCallback((target: string | null) => { hover.current = target }, [])
  const zoomBy = useCallback((pixels: number, screenPoint?: { x: number; y: number }) => {
    if (cameraModeRef.current === 'free') { cameraActions.current?.zoomFree(pixels); return }
    const current = viewRef.current
    const element = host.current
    let anchor: [number, number] | undefined
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
    followRef.current = null
    update(initialGalaxyView())
    onFocusRef.current(ALBUM_TARGET)
  }, [resetKey, update])
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
  return { view, viewRef, pinching, overview, hover, setHover, focus, activate: focus, follow, followRef, zoomBy, reset, cameraMode, cameraModeRef, setCameraMode, cameraActions, projectAnchor, backdrop }
}

export type GalaxyNavigation = ReturnType<typeof useGalaxyNavigation>
