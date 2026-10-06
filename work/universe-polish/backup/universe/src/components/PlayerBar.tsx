import { useState } from 'react'
import { Heart, ListMusic, Loader2, Pause, Play, Repeat, Shuffle, SkipBack, SkipForward } from 'lucide-react'
import { formatDuration } from '../data/albums'
import { PlayerShip } from './PlayerShip'
import type { LivePlayback } from '../hooks/useAudioPlayback'

/**
 * 弧形轨道播放器（以参考设计为准）。
 * 轨道本身就是进度条：飞船是播放头，飞过的一段被点亮、前方保持暗淡。
 * 播放器不再有底板、封面与常驻音量区，只留下一条拱形轨道与一排扁平控件；
 * 只有音源加载失败时，才会在轨道与控件之间补一行细提示。
 */

/** 轨道几何：viewBox 宽 1000 高 100，控制点抬到 -35，让曲线成为一道浅拱。 */
const ARC_WIDTH = 1000
const ARC_HEIGHT = 100
const ARC_CONTROL_Y = -35

/**
 * 二次贝塞尔在参数 t 处的纵坐标。该曲线的横坐标恰好是 x = 1000t，
 * 所以播放进度可以直接当作参数使用，不必再反解位置。
 */
function arcY(t: number) {
  const u = 1 - t
  return (u * u + t * t - 0.7 * t * u) * ARC_HEIGHT
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export function PlayerBar({ title, album, duration, playing, onToggle, onSkip, live, loading = false, message = '', error = false, onOpenMusic, onOpenQueue }: {
  title: string
  album: string
  index: number
  duration: number
  playing: boolean
  onToggle: () => void
  onSkip: (direction: -1 | 1) => void
  live?: LivePlayback
  loading?: boolean
  message?: string
  error?: boolean
  onOpenMusic?: () => void
  onOpenQueue?: () => void
}) {
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState(false)
  const [liked, setLiked] = useState(false)
  const liveTrack = live?.track ?? null
  const isLive = !!liveTrack
  const shownTitle = liveTrack?.title ?? title
  const shownAlbum = liveTrack?.album ?? album
  const currentTime = isLive ? live!.currentTime : 0
  const total = isLive ? live!.duration : duration
  const isPlaying = isLive && live!.playing
  const ratio = total > 0 ? clamp01(currentTime / total) : 0
  const seek = (time: number) => { if (isLive) live!.seek(time) }
  const path = `M0 ${ARC_HEIGHT} Q${ARC_WIDTH / 2} ${ARC_CONTROL_Y} ${ARC_WIDTH} ${ARC_HEIGHT}`
  // 渐变断点决定轨道配色：飞过的一段是暖金色，播放头处收成一道亮线，前方保持暗淡。
  const stops = [
    { offset: 0, color: '#d9964f', opacity: .62 },
    { offset: Math.max(0, ratio - .28), color: '#eab273', opacity: .78 },
    { offset: clamp01(ratio - .02), color: '#ffe8c4', opacity: .95 },
    { offset: clamp01(ratio + .02), color: '#e8b478', opacity: .16 },
    { offset: 1, color: '#e8b478', opacity: .16 },
  ]
  return <footer className={`player-shell${error ? ' player-has-error' : ''}`} aria-label="播放器">
    <span className="visually-hidden" data-testid="player-title">{shownTitle} · {shownAlbum}</span>
    <div className="player-orbit">
      <svg viewBox={`0 0 ${ARC_WIDTH} ${ARC_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="player-arc-gradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={ARC_WIDTH} y2="0">
            {stops.map((stop, position) => <stop key={position} offset={stop.offset} stopColor={stop.color} stopOpacity={stop.opacity} />)}
          </linearGradient>
        </defs>
        <path className="player-arc player-arc-halo" d={path} />
        <path className="player-arc player-arc-core" d={path} />
      </svg>
      <span className="player-ship" data-playing={playing} style={{ left: `${ratio * 100}%`, top: `${arcY(ratio)}%` }} aria-hidden="true">
        <PlayerShip />
      </span>
      <input className="player-seek" type="range" min="0" max={total || 1} step="0.1" value={Math.min(currentTime, total || 1)}
        disabled={!isLive || !live?.duration} onChange={(event) => seek(Number(event.target.value))} aria-label="播放进度" data-testid="player-seek" />
    </div>
    {error && <p className="player-notice" role="status" data-testid="player-notice"><span>{message || '音源加载失败。'}</span>{onOpenMusic && <button type="button" onClick={onOpenMusic}>选择音源</button>}</p>}
    <div className="player-row">
      <time className="player-time" data-testid="player-time">{formatDuration(Math.floor(currentTime))}</time>
      <div className="player-controls">
        <button className="player-icon" aria-label="随机播放" aria-pressed={shuffle} title="随机播放" onClick={() => setShuffle((value) => !value)}><Shuffle size={20} /></button>
        <button className="player-icon" aria-label="播放队列" title="播放队列" onClick={onOpenQueue}><ListMusic size={20} /></button>
        <button className="player-icon" aria-label="上一首" title="上一首 · ←" onClick={() => onSkip(-1)}><SkipBack size={21} /></button>
        <button className="player-toggle" aria-label={loading ? '正在加载' : isPlaying ? '暂停' : '播放'} aria-busy={loading} aria-pressed={isPlaying} data-testid="player-toggle" title="播放 / 暂停 · 空格" onClick={onToggle}>{loading ? <Loader2 size={20} className="bridge-spin" /> : isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</button>
        <button className="player-icon" aria-label="下一首" title="下一首 · →" onClick={() => onSkip(1)}><SkipForward size={21} /></button>
        <button className="player-icon" aria-label="循环播放" aria-pressed={repeat} title="循环播放" onClick={() => setRepeat((value) => !value)}><Repeat size={20} /></button>
        <button className="player-icon" aria-label="收藏" aria-pressed={liked} title="收藏" onClick={() => setLiked((value) => !value)}><Heart size={20} /></button>
      </div>
      <time className="player-time">{total > 0 ? formatDuration(Math.floor(total)) : '—'}</time>
    </div>
  </footer>
}
