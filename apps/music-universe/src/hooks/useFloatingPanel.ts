import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'

/**
 * 浮窗自由拖动（星球介绍浮窗 / 曲目索引共用）。
 *
 * - 鼠标与触摸共用 Pointer Events，配合 setPointerCapture 保证指针移出元素后仍跟手。
 * - 位移小于 DRAG_THRESHOLD 视为点击，内部按钮的 click 不受影响。
 * - 始终夹取在视口内（四边各留 MARGIN），窗口尺寸变化后重新夹取。
 * - 首次拖动前不写内联定位，沿用 styles.css 的默认位置与各断点；
 *   一旦拖动过就由内联 left/top 接管，并把 right/bottom/transform 归零，
 *   避免与原有 `right` 或 `left:50% + translateX(-50%)` 的定位方式冲突。
 *
 * 不写 localStorage：刷新后回到默认位置。
 */

const MARGIN = 12
/** 位移小于这个距离视为点击，避免「轻点一下」被当成拖动。 */
const DRAG_THRESHOLD = 4
/** 命中这些元素的按下不启动拖动：按钮 / 链接 / 表单 / 标记了 data-no-drag 的可滚动区域。 */
const NO_DRAG = 'button, a, input, textarea, select, [data-no-drag]'

type Pose = { left: number; top: number }

interface DragState {
  pointerId: number
  startX: number
  startY: number
  left: number
  top: number
  width: number
  height: number
  parentLeft: number
  parentTop: number
  moved: boolean
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max))

export function useFloatingPanel({ enabled }: { enabled: boolean }) {
  const panelRef = useRef<HTMLElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [pose, setPose] = useState<Pose | null>(null)
  const drag = useRef<DragState | null>(null)
  const dragged = useRef(false)
  // resize 监听不该依赖 pose：用 ref 读取，免得每次拖动都重挂监听。
  const poseRef = useRef<Pose | null>(pose)
  poseRef.current = pose

  // 视口或本体尺寸变化后，把浮窗拉回可视区。
  useEffect(() => {
    if (!enabled) return
    const measure = () => {
      const element = panelRef.current
      if (!element) return
      const rect = element.getBoundingClientRect()
      const left = clamp(rect.left, MARGIN, window.innerWidth - rect.width - MARGIN)
      const top = clamp(rect.top, MARGIN, window.innerHeight - rect.height - MARGIN)
      const current = poseRef.current
      if (!current) return
      const parent = element.offsetParent as HTMLElement | null
      const parentRect = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 }
      const next = { left: left - parentRect.left, top: top - parentRect.top }
      if (Math.abs(next.left - current.left) > 0.5 || Math.abs(next.top - current.top) > 0.5) setPose(next)
    }
    window.addEventListener('resize', measure)
    const observer = new ResizeObserver(measure)
    if (panelRef.current) observer.observe(panelRef.current)
    return () => { window.removeEventListener('resize', measure); observer.disconnect() }
  }, [enabled])

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const element = panelRef.current
    if (!element) return
    // 每次新的按下都清空标记：触摸拖动可能没有后续 click 来消费它。
    drag.current = null
    dragged.current = false
    const target = event.target as HTMLElement | null
    if (target?.closest(NO_DRAG)) return
    const rect = element.getBoundingClientRect()
    const parent = element.offsetParent as HTMLElement | null
    const parentRect = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 }
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      parentLeft: parentRect.left,
      parentTop: parentRect.top,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId) return
    const dx = event.clientX - state.startX
    const dy = event.clientY - state.startY
    if (!state.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
    if (!state.moved) { state.moved = true; setDragging(true) }
    const left = clamp(state.left + dx, MARGIN, window.innerWidth - state.width - MARGIN)
    const top = clamp(state.top + dy, MARGIN, window.innerHeight - state.height - MARGIN)
    setPose({ left: left - state.parentLeft, top: top - state.parentTop })
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId) return
    // 拖动结束后的那次 click 不应该再被当成「点击」。
    if (state.moved) dragged.current = true
    drag.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  /** 消费掉一次「刚拖完」的标记：返回 true 表示这次 click 来自拖动，调用方应忽略。 */
  const consumeDrag = () => {
    const moved = dragged.current
    dragged.current = false
    return moved
  }

  const style = pose
    ? ({ left: pose.left, top: pose.top, right: 'auto', bottom: 'auto', transform: 'none' } as CSSProperties)
    : undefined

  return { panelRef, style, dragging, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, consumeDrag }
}
