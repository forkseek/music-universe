import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { lyricIndexAt } from '../lib/lyrics'
import type { LyricLine } from '../lib/lyrics'
import type { LyricViewMode } from '../lib/universeExperience'
import '../lyric-constellation.css'

export interface LyricConstellationProps {
  lines: readonly LyricLine[]
  audioRef: RefObject<HTMLAudioElement | null>
  trackKey: string
  playing: boolean
  visible: boolean
  obstacleRef: RefObject<HTMLElement | null>
  obstaclePose?: CSSProperties
  playerRef: RefObject<HTMLDivElement | null>
  playerVisible: boolean
  viewMode?: LyricViewMode
}

type Dust = { x: number; y: number; dx: number; dy: number; size: number }
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), Math.max(min, max))

/** Sample a small, temporary glyph mask. The accessible text remains ordinary DOM. */
function glyphDust(text: HTMLElement, root: HTMLElement, width: number, height: number): Dust[] {
  const mask = document.createElement('canvas')
  mask.width = Math.ceil(width); mask.height = Math.ceil(height)
  const context = mask.getContext('2d', { willReadFrequently: true })
  if (!context) return []
  const style = getComputedStyle(text), rect = text.getBoundingClientRect(), base = root.getBoundingClientRect()
  context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = '#fff'
  const lineHeight = parseFloat(style.lineHeight), maxWidth = rect.width
  const rows: string[] = []
  let row = ''
  for (const glyph of Array.from(text.textContent || '')) {
    if (row && context.measureText(row + glyph).width > maxWidth) { rows.push(row); row = '' }
    row += glyph
  }
  if (row) rows.push(row)
  rows.slice(0, 3).forEach((value, i) => context.fillText(value, width / 2, rect.top - base.top + 40 + lineHeight * (i + .5)))
  const pixels = context.getImageData(0, 0, mask.width, mask.height).data
  const points: Dust[] = []
  for (let y = 0; y < mask.height; y += 4) for (let x = 0; x < mask.width; x += 4) {
    if (pixels[(y * mask.width + x) * 4 + 3] < 96) continue
    const wave = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
    const noise = wave - Math.floor(wave)
    points.push({ x, y, dx: (noise - .5) * 100, dy: Math.sin(wave) * 36, size: .5 + noise * .85 })
  }
  const stride = Math.max(1, Math.ceil(points.length / (innerWidth < 620 ? 160 : 280)))
  return points.filter((_, i) => i % stride === 0)
}

export function LyricConstellation({ lines, audioRef, trackKey, playing, visible, obstacleRef, obstaclePose, playerRef, playerVisible, viewMode = 'overview' }: LyricConstellationProps) {
  const caption = useRef<HTMLDivElement>(null), current = useRef<HTMLSpanElement>(null), canvas = useRef<HTMLCanvasElement>(null)
  const previousDust = useRef<{ track: string; points: Dust[] }>({ track: '', points: [] })
  const [active, setActive] = useState({ track: trackKey, lines, index: -1 })
  // A new song/data set cannot render one frame of its predecessor's subtitles.
  const index = active.track === trackKey && active.lines === lines ? active.index : -1

  useLayoutEffect(() => {
    const audio = audioRef.current
    if (!audio || !visible || !lines.length) return
    let frame = 0, lastCheck = 0
    const sync = () => {
      const time = Number.isFinite(audio.currentTime) ? audio.currentTime : 0
      const next = audio.readyState ? lyricIndexAt(lines, time) : -1
      setActive(value => value.track === trackKey && value.lines === lines && value.index === next ? value : { track: trackKey, lines, index: next })
      const start = lines[next]?.time ?? time
      const end = lines[next + 1]?.time ?? (Number.isFinite(audio.duration) ? audio.duration : start + 5)
      caption.current?.style.setProperty('--lyric-progress', String(clamp((time - start) / Math.max(.1, end - start), 0, 1)))
    }
    const tick = (now: number) => {
      if (now - lastCheck >= 80) { sync(); lastCheck = now }
      if (!audio.paused && !audio.ended && !document.hidden) frame = requestAnimationFrame(tick)
    }
    const resume = () => {
      cancelAnimationFrame(frame); sync()
      if (!audio.paused && !audio.ended && !document.hidden) frame = requestAnimationFrame(tick)
    }
    const emptied = () => { cancelAnimationFrame(frame); setActive({ track: trackKey, lines, index: -1 }) }
    const events = ['play', 'playing', 'pause', 'ended', 'timeupdate', 'seeking', 'seeked', 'loadedmetadata', 'ratechange'] as const
    events.forEach(event => audio.addEventListener(event, resume))
    audio.addEventListener('emptied', emptied); document.addEventListener('visibilitychange', resume)
    resume()
    return () => {
      cancelAnimationFrame(frame)
      events.forEach(event => audio.removeEventListener(event, resume))
      audio.removeEventListener('emptied', emptied); document.removeEventListener('visibilitychange', resume)
    }
  }, [audioRef, lines, trackKey, playing, visible])

  useLayoutEffect(() => {
    const root = caption.current
    if (!visible || !root) return
    const player = playerRef.current?.querySelector<HTMLElement>('.player-shell') ?? playerRef.current
    const place = () => {
      const obstacle = obstacleRef.current
      const w = document.documentElement.clientWidth, h = window.visualViewport?.height ?? innerHeight
      const margin = w < 620 ? 18 : 32
      let width = Math.min(820, w - margin * 2), left = (w - width) / 2
      root.style.width = `${width}px`
      const safe = parseFloat(getComputedStyle(root).getPropertyValue('--lyric-safe-bottom')) || 0
      let bottom = h - Math.max(48, safe + 32)
      if (playerVisible && player) {
        // Use the final resting edge; a transforming player can still be offscreen on its first frame.
        bottom = Math.min(bottom, h - (parseFloat(getComputedStyle(player).bottom) || 16) - player.offsetHeight - 20)
      }
      // Compact captions must not overlap the persistent follow button or an open effects menu.
      const controls = root.closest('.app-shell')?.querySelectorAll<HTMLElement>('.planet-follow-control, .universe-experience-controls')
      controls?.forEach(control => {
        const item = control.querySelector<HTMLElement>('.universe-experience-menu') ?? control
        const style = getComputedStyle(item), box = item.getBoundingClientRect()
        if (style.visibility === 'hidden' || style.display === 'none' || !box.width || !box.height) return
        const top = bottom - root.offsetHeight
        if (top < box.bottom + 16 && bottom > box.top - 16 && left < box.right + 16 && left + width > box.left - 16) bottom = Math.min(bottom, box.top - 16)
      })
      let top = bottom - root.offsetHeight
      if (obstacle && getComputedStyle(obstacle).visibility !== 'hidden') {
        const box = obstacle.getBoundingClientRect()
        if (top < box.bottom + 16 && bottom > box.top - 16 && left < box.right + 16 && left + width > box.left - 16) {
          const leftGap = box.left - margin - 20, rightGap = w - margin - box.right - 20
          const gap = Math.max(leftGap, rightGap)
          if (gap >= Math.min(250, w * .55)) {
            width = Math.min(width, gap); root.style.width = `${width}px`
            left = leftGap >= rightGap ? margin + (leftGap - width) / 2 : box.right + 20 + (rightGap - width) / 2
            top = bottom - root.offsetHeight
          } else top = Math.min(top, box.top - root.offsetHeight - 20)
        }
      }
      root.style.left = `${Math.round(left)}px`
      root.style.top = `${Math.round(Math.max(16, top))}px`
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(root)
    if (player) observer.observe(player)
    let watchedObstacle = obstacleRef.current
    if (watchedObstacle) observer.observe(watchedObstacle)
    const followControl = root.closest('.app-shell')?.querySelector<HTMLElement>('.planet-follow-control')
    if (followControl) observer.observe(followControl)
    // Selecting/closing an undragged panel changes ref.current without changing its optional pose.
    const children = new MutationObserver(() => {
      if (watchedObstacle !== obstacleRef.current) {
        if (watchedObstacle) observer.unobserve(watchedObstacle)
        watchedObstacle = obstacleRef.current
        if (watchedObstacle) observer.observe(watchedObstacle)
      }
      place()
    })
    const shell = root.closest('.app-shell') ?? root.parentElement
    if (shell) children.observe(shell, { childList: true, subtree: true })
    window.addEventListener('resize', place); window.visualViewport?.addEventListener('resize', place)
    return () => { observer.disconnect(); children.disconnect(); window.removeEventListener('resize', place); window.visualViewport?.removeEventListener('resize', place) }
  }, [visible, index, trackKey, lines, obstacleRef, obstaclePose, playerRef, playerVisible, viewMode])

  useEffect(() => {
    const root = caption.current, text = current.current, surface = canvas.current
    if (!visible || index < 0 || !root || !text || !surface) { previousDust.current = { track: '', points: [] }; return }
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    if (motion.matches || document.hidden) return
    const context = surface.getContext('2d')
    if (!context) return
    const width = Math.ceil(root.clientWidth + 80), height = Math.ceil(root.clientHeight + 80), ratio = Math.min(devicePixelRatio || 1, 1.5)
    surface.width = Math.ceil(width * ratio); surface.height = Math.ceil(height * ratio)
    surface.style.width = `${width}px`; surface.style.height = `${height}px`
    context.scale(ratio, ratio)
    const dust = glyphDust(text, root, width, height)
    const old = previousDust.current.track === trackKey ? previousDust.current.points : []
    previousDust.current = { track: trackKey, points: dust }
    let frame = 0, start = 0
    const paint = (now: number) => {
      if (!start) start = now
      const t = clamp((now - start) / 920, 0, 1)
      context.clearRect(0, 0, width, height)
      const draw = (points: Dust[], dissolve: boolean) => {
        const spread = dissolve ? t : Math.pow(1 - t, 3)
        const opacity = dissolve ? Math.max(0, 1 - t * 2.2) : Math.sin(Math.PI * t) * .76
        if (!opacity) return
        context.fillStyle = dissolve ? '#d8b38b' : '#fff0d0'; context.globalAlpha = opacity
        for (const point of points) {
          context.beginPath(); context.arc(point.x + point.dx * spread, point.y + point.dy * spread, point.size, 0, Math.PI * 2); context.fill()
        }
      }
      draw(old, true); draw(dust, false)
      if (t < 1 && !document.hidden && !motion.matches) frame = requestAnimationFrame(paint)
      else context.clearRect(0, 0, width, height)
    }
    frame = requestAnimationFrame(paint)
    const stop = () => { cancelAnimationFrame(frame); context.clearRect(0, 0, width, height) }
    const onHidden = () => { if (document.hidden) stop() }
    document.addEventListener('visibilitychange', onHidden); motion.addEventListener('change', stop)
    return () => { stop(); document.removeEventListener('visibilitychange', onHidden); motion.removeEventListener('change', stop) }
  }, [visible, index, trackKey, lines, viewMode])

  if (!visible || index < 0 || !lines[index]) return null
  return <div ref={caption} className="lyric-constellation" data-testid="lyric-caption" data-track-key={trackKey} data-line-index={index} data-view-mode={viewMode} aria-label="同步歌词">
    {/* Keep the dust canvas nested: the existing scene CSS expands direct canvas wrappers. */}
    <div aria-hidden="true"><canvas ref={canvas} className="lyric-dust" /></div>
    {(viewMode === 'near' ? [0, 1] : [-1, 0, 1, 2]).map(offset => {
      const line = lines[index + offset]
      return <div key={`${trackKey}:${index + offset}`} className={`lyric-row lyric-row-${offset === -1 ? 'previous' : offset === 0 ? 'current' : offset === 1 ? 'next' : 'distant'}`} aria-hidden={offset !== 0}>
        <span ref={offset === 0 ? current : undefined} data-testid={offset === 0 ? 'lyric-current' : undefined}>{line?.text || '\u00a0'}</span>
      </div>
    })}
  </div>
}
