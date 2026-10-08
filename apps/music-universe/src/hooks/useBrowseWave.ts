import { useEffect } from 'react'
import type { RefObject } from 'react'

/**
 * 曲目索引的「海浪」联动动效。
 *
 * 监听两类「快速浏览」输入：
 * 1) 曲目条的横向滚动（滚轮 / 触控板 / 左右箭头 / 拖动条）；
 * 2) 光标在索引浮窗上快速掠过。
 *
 * 速度用「滚动窗口」估算：每次输入记一个 (时间, 累计位移) 采样点，取窗口内首尾
 * 两点算平均速度，并对首帧补一个 PRIME 毫秒前的起点。这样对事件合并、长时间
 * 空闲后的陈旧基准、以及首次输入都稳健 —— 单事件瞬时速度做不到。
 *
 * 速度高于 --wave-min-speed 才起浪；停止输入 --wave-delay 毫秒后按 --wave-decay
 * 指数衰减，幅度归零后写回空 transform。慢速浏览达不到阈值，不会触发、也不干扰。
 *
 * 参数全部走 CSS 变量（见 floating-panels.css），便于调参：
 *   --wave-amplitude   最大起伏幅度(px)    --wave-frequency  起伏频率(rad/s)
 *   --wave-gain        速度→幅度增益       --wave-decay      每秒衰减系数
 *   --wave-delay       停止输入后缓冲(ms)  --wave-min-speed  触发阈值(px/s)
 *
 * 只改 transform（translate3d + rotate）并交给 rAF，避免触发布局。
 */
interface WaveOptions {
  panelRef: RefObject<HTMLElement | null>
  stripRef: RefObject<HTMLElement | null>
  enabled: boolean
}

/** 速度采样窗口：短到能反映「快速」，长到能跨过被合并的事件。 */
const WINDOW = 160
/** 首帧补起点的时间跨度，保证单次滚轮也能估出速度。 */
const PRIME = 90
/** 幅度低于该值且已无输入时，直接把 transform 归零收摊。 */
const REST_EPSILON = 0.08

interface Sample { t: number; v: number }

const readNumber = (style: CSSStyleDeclaration, name: string, fallback: number) => {
  const raw = Number.parseFloat(style.getPropertyValue(name))
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

/** 窗口内首尾两点的平均速度（px/s，取绝对值）。 */
function speedOf(samples: Sample[]) {
  if (samples.length < 2) return 0
  const first = samples[0]
  const last = samples[samples.length - 1]
  const dt = last.t - first.t
  return dt > 0 ? (Math.abs(last.v - first.v) / dt) * 1000 : 0
}

export function useBrowseWave({ panelRef, stripRef, enabled }: WaveOptions) {
  useEffect(() => {
    if (!enabled) return
    const strip = stripRef.current
    const panel = panelRef.current
    if (!strip || !panel) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const computed = getComputedStyle(strip)
    const MAX_AMP = readNumber(computed, '--wave-amplitude', 12)
    const FREQ = readNumber(computed, '--wave-frequency', 2.6)
    const GAIN = readNumber(computed, '--wave-gain', 0.014)
    const DECAY = readNumber(computed, '--wave-decay', 3.2)
    const DELAY = readNumber(computed, '--wave-delay', 140)
    const MIN_SPEED = readNumber(computed, '--wave-min-speed', 700)

    let amplitude = 0
    let target = 0
    let phase = 0
    let frame = 0
    let lastFrame = 0
    let lastInput = 0
    const scrollSamples: Sample[] = []
    const moveSamples: Sample[] = []
    let previousScroll = strip.scrollLeft
    let lastPoint: { x: number; y: number } | null = null
    let previousTravel = 0

    const render = (now: number) => {
      const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0.016
      lastFrame = now
      if (now - lastInput > DELAY) target *= Math.exp(-DECAY * dt)
      amplitude += (target - amplitude) * (1 - Math.exp(-9 * dt))
      if (amplitude < REST_EPSILON && target < REST_EPSILON) {
        amplitude = 0; target = 0; frame = 0; lastFrame = 0
        strip.style.transform = ''
        return
      }
      phase += FREQ * dt
      const lift = Math.sin(phase) * amplitude
      const tilt = Math.sin(phase * 0.5) * amplitude * 0.05
      strip.style.transform = `translate3d(0, ${lift.toFixed(2)}px, 0) rotate(${tilt.toFixed(3)}deg)`
      frame = requestAnimationFrame(render)
    }

    // 低于阈值视为「慢速浏览」，不打扰；高于阈值按增益映射成幅度。
    const kick = (speed: number) => {
      const next = Math.min(MAX_AMP, Math.max(0, (speed - MIN_SPEED) * GAIN))
      if (next <= 0) return
      target = Math.max(target, next)
      lastInput = performance.now()
      if (!frame) { lastFrame = 0; frame = requestAnimationFrame(render) }
    }

    const trim = (samples: Sample[], now: number) => {
      while (samples.length && now - samples[0].t > WINDOW) samples.shift()
    }

    const onScroll = () => {
      const now = performance.now()
      const current = strip.scrollLeft
      const previous = previousScroll
      previousScroll = current
      if (current === previous) return
      trim(scrollSamples, now)
      // 窗口里没有起点（长时间空闲后的第一次滚动）时，补一个 PRIME 毫秒前的起点。
      if (!scrollSamples.length) scrollSamples.push({ t: now - PRIME, v: previous })
      scrollSamples.push({ t: now, v: current })
      kick(speedOf(scrollSamples))
    }

    const onMove = (event: PointerEvent) => {
      const now = performance.now()
      if (!lastPoint) { lastPoint = { x: event.clientX, y: event.clientY }; return }
      const step = Math.hypot(event.clientX - lastPoint.x, event.clientY - lastPoint.y)
      lastPoint = { x: event.clientX, y: event.clientY }
      if (step <= 0) return
      const previous = previousTravel
      previousTravel += step
      trim(moveSamples, now)
      if (!moveSamples.length) moveSamples.push({ t: now - PRIME, v: previous })
      moveSamples.push({ t: now, v: previousTravel })
      kick(speedOf(moveSamples))
    }

    strip.addEventListener('scroll', onScroll, { passive: true })
    panel.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      strip.removeEventListener('scroll', onScroll)
      panel.removeEventListener('pointermove', onMove)
      if (frame) cancelAnimationFrame(frame)
      strip.style.transform = ''
    }
  }, [enabled, panelRef, stripRef])
}
