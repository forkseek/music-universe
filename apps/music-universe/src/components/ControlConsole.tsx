import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { GripHorizontal } from 'lucide-react'

/** 窗口最小尺寸：再小就装不下 SEED 输入行与工具组（实测控制栏最小内容宽约 346px）。 */
const MIN_WIDTH = 376
const MIN_HEIGHT = 128
/** 视口留边：窄屏下最小宽度必须让位于视口，否则窗口自身会溢出屏幕。 */
const VIEWPORT_INSET = 16

interface ConsoleBox { x: number; y: number; width: number; height: number }

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max))
const floorWidth = () => Math.min(MIN_WIDTH, window.innerWidth - VIEWPORT_INSET)

/** 把窗口夹进视口：尺寸与位置一起收敛，位置按夹取后的尺寸计算。 */
const fit = (box: ConsoleBox): ConsoleBox => {
  const width = clamp(box.width, floorWidth(), window.innerWidth)
  const height = clamp(box.height, MIN_HEIGHT, window.innerHeight)
  return { width, height, x: clamp(box.x, 0, window.innerWidth - width), y: clamp(box.y, 0, window.innerHeight - height) }
}

/**
 * 互动栏窗口。
 * - box 为 null 时沿用样式表里的默认停靠（底部居中），不写内联坐标；
 *   一旦拖动或缩放，就改用显式的 left / top / width / height。
 * - 标题栏是拖动手柄，右下角手柄调整窗口大小。
 * - 后续所有变更都只改这一个 box：宽度与位置同批算出，不会读到尚未渲染的旧尺寸。
 */
export default function ControlConsole({ hint, children }: { hint: ReactNode; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<ConsoleBox | null>(null)
  const drag = useRef<{ offsetX: number; offsetY: number } | null>(null)
  const resize = useRef<{ x: number; y: number; width: number; height: number } | null>(null)

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = root.current
    if (!element || event.button !== 0) return
    const rect = element.getBoundingClientRect()
    drag.current = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top }
    setBox({ x: rect.left, y: rect.top, width: rect.width, height: rect.height })
    element.setPointerCapture(event.pointerId)
  }

  const startResize = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const element = root.current
    if (!element || event.button !== 0) return
    event.stopPropagation()
    const rect = element.getBoundingClientRect()
    resize.current = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height }
    setBox({ x: rect.left, y: rect.top, width: rect.width, height: rect.height })
    element.setPointerCapture(event.pointerId)
  }

  // 指针已被 root 捕获，拖动与缩放共用同一组移动 / 结束处理。
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current && !resize.current) return
    setBox((previous) => {
      const grip = drag.current
      const scale = resize.current
      if (!previous) return previous
      if (grip) return fit({ ...previous, x: event.clientX - grip.offsetX, y: event.clientY - grip.offsetY })
      if (!scale) return previous
      return fit({ ...previous, width: scale.width + (event.clientX - scale.x), height: scale.height + (event.clientY - scale.y) })
    })
  }

  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = null
    resize.current = null
    if (root.current?.hasPointerCapture(event.pointerId)) root.current.releasePointerCapture(event.pointerId)
  }

  // 视口变小后把窗口重新夹回可视区域，避免窗口被留在屏幕之外。
  useEffect(() => {
    const reflow = () => setBox((previous) => (previous ? fit(previous) : previous))
    window.addEventListener('resize', reflow)
    return () => window.removeEventListener('resize', reflow)
  }, [])

  const style: CSSProperties = {}
  if (box) {
    style.left = box.x
    style.top = box.y
    style.bottom = 'auto'
    style.transform = 'none'
    style.width = box.width
    style.height = box.height
    style.maxWidth = 'none'
  }

  return <div className="cockpit" ref={root} style={style} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
    <div className="scene-instructions console-title" onPointerDown={startDrag} title="拖动移动互动栏，右下角拖拽调整大小">
      <span className="console-grip" aria-hidden="true"><GripHorizontal size={13} /></span>
      <span className="console-hint">{hint}</span>
    </div>
    <div className="console-body">{children}</div>
    <span className="console-resize" onPointerDown={startResize} aria-hidden="true">
      <svg viewBox="0 0 12 12" width="11" height="11" focusable="false"><path d="M11 5 5 11M11 9 9 11" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
    </span>
  </div>
}
