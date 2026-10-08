import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'

/**
 * 旅伴机器人的自由摆放 + 收缩。
 *
 * - 拖动：在机器人本体上按下并移动即整体移动 .hall-relay（鼠标 / 触摸共用 Pointer Events）。
 *   位置用内联 left/top 接管；未拖动过时不写内联位置，沿用 styles.css 的默认位置与各断点。
 * - 夹取：始终把机器人留在当前视口内（四边各留 MARGIN），窗口变小时自动拉回。
 * - 翻边：机器人贴近屏幕顶部时，旅伴抽屉从「向上弹出」翻成「向下展开」；
 *   贴近右缘时抽屉改为右对齐，避免出屏。
 * - 收缩：只负责状态，具体由 App 决定是否顺带收起抽屉。
 *
 * 不写 localStorage：刷新后回到默认位置与展开态。
 */

const MARGIN = 12
/** 位移小于这个距离视为点击，避免「轻点一下」被当成拖动。 */
const DRAG_THRESHOLD = 4
/** 机器人顶部低于这个 y 时把抽屉翻到下方：抽屉最高 560px，上方留不出空间就会顶出屏幕。 */
const FLIP_Y_AT = 340
const PANEL_MAX = 560

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max))

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

export function useCompanionDock() {
  const relayRef = useRef<HTMLDivElement | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [pose, setPose] = useState<Pose | null>(null)
  const [flipX, setFlipX] = useState(false)
  const [flipY, setFlipY] = useState(false)
  /** 抽屉那一侧可用的高度，交给 CSS 限制 max-height，避免翻边后出屏。 */
  const [room, setRoom] = useState(PANEL_MAX)
  const drag = useRef<DragState | null>(null)
  const dragged = useRef(false)
  // resize 监听不该依赖 pose：用 ref 读取，免得每次拖动都重挂监听。
  const poseRef = useRef<Pose | null>(pose)
  poseRef.current = pose

  // 抽屉宽度随媒体查询变化（680 / 500 / 420），翻边判断读实际值而不是常量。
  const panelWidth = () => relayRef.current?.querySelector('.hall-panel')?.getBoundingClientRect().width ?? 680

  const syncEdges = useCallback((left: number, top: number, height: number) => {
    const below = top < FLIP_Y_AT
    setFlipY(below)
    setFlipX(left + panelWidth() > window.innerWidth - MARGIN)
    setRoom(below
      ? window.innerHeight - top - height - 13 - MARGIN
      : top - 13 - MARGIN)
  }, [])

  // 视口变化：把机器人拉回可视区，并重算抽屉翻边与可用高度。
  useEffect(() => {
    const measure = () => {
      const element = relayRef.current
      if (!element) return
      const rect = element.getBoundingClientRect()
      const left = clamp(rect.left, MARGIN, window.innerWidth - rect.width - MARGIN)
      const top = clamp(rect.top, MARGIN, window.innerHeight - rect.height - MARGIN)
      const current = poseRef.current
      if (current) {
        const parent = element.offsetParent as HTMLElement | null
        const parentRect = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 }
        const next = { left: left - parentRect.left, top: top - parentRect.top }
        if (Math.abs(next.left - current.left) > 0.5 || Math.abs(next.top - current.top) > 0.5) setPose(next)
      }
      syncEdges(left, top, rect.height)
    }
    measure()
    window.addEventListener('resize', measure)
    // 视口没变但本体尺寸变了（媒体查询换挡、收缩 / 展开）时也要重新夹取，
    // 否则右边距会按旧宽度算，窄屏下会把入口留在右缘之外。
    const observer = new ResizeObserver(measure)
    if (relayRef.current) observer.observe(relayRef.current)
    return () => { window.removeEventListener('resize', measure); observer.disconnect() }
  }, [syncEdges])

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const element = relayRef.current
    if (!element) return
    // 触摸拖动（或未合成 click 的拖动）之后可能没有 click 来消费这个标记，
    // 因此每次新的按下都清空它，避免影响后面的点击。
    dragged.current = false
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
    syncEdges(left, top, state.height)
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId) return
    // 拖动结束后的那次 click 不应该再被当成「展开 / 收起」。
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

  const style = {
    ...(pose ? { left: pose.left, top: pose.top, bottom: 'auto' as const } : {}),
    '--dock-room': `${Math.round(clamp(room, 160, PANEL_MAX))}px`,
  } as unknown as CSSProperties

  return { relayRef, style, collapsed, setCollapsed, dragging, flipX, flipY, onPointerDown, onPointerMove, onPointerUp, consumeDrag }
}
