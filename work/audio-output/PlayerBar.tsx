import type { CSSProperties } from 'react'
import { ChevronLeft, ChevronRight, Disc3, Loader2, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { formatDuration } from '../data/albums'
import type { LivePlayback } from '../hooks/useAudioPlayback'
import '../audio-output.css'

export function PlayerBar({ title, album, cover, duration, onToggle, onSkip, live, loading = false, message = '', error = false, volume = 0.8, muted = false, onVolumeChange, onMute, onOpenMusic }: {
  title: string; album: string; cover?: string; index: number; duration: number; playing: boolean
  onToggle: () => void; onSkip: (direction: -1 | 1) => void; live?: LivePlayback
  loading?: boolean; message?: string; error?: boolean; volume?: number; muted?: boolean
  onVolumeChange?: (volume: number) => void; onMute?: () => void; onOpenMusic?: () => void
}) {
  const track = live?.track
  const shownTitle = track?.title || title
  const shownAlbum = track?.album || album
  const shownCover = track?.cover || cover || ''
  const currentTime = track ? live!.currentTime : 0
  const total = track ? live!.duration : duration
  const isPlaying = !!track && !!live?.playing
  const progress = total > 0 ? currentTime / total * 100 : 0
  const silent = muted || volume === 0
  const status = message || (loading ? '正在加载音源…' : track ? `${shownAlbum} · ${isPlaying ? '正在播放' : '已暂停'}${track.trial ? ' · 试听片段' : ''}` : `${album} · 点击播放加载这首歌`)
  return <footer className={`player-shell${error ? ' player-has-error' : ''}`} aria-label="播放器">
    <div className="player-track">
      {shownCover ? <img src={shownCover} alt={`${shownAlbum} 封面`} /> : <span className="player-cover" aria-hidden="true"><Disc3 size={17} /></span>}
      <div><strong data-testid="player-title">{shownTitle}</strong><span data-testid="player-status" role="status" title={status}>{status}</span></div>
    </div>
    <div className="player-cluster">
      <button className="player-skip" aria-label="上一首" title="上一首 · ←" onClick={() => onSkip(-1)}><ChevronLeft size={16} /></button>
      <button className="player-toggle" aria-label={loading ? '正在加载' : isPlaying ? '暂停' : '播放'} aria-pressed={isPlaying} aria-busy={loading} data-testid="player-toggle" title="播放 / 暂停 · 空格" onClick={onToggle}>{loading ? <Loader2 size={17} className="bridge-spin" /> : isPlaying ? <Pause size={17} /> : <Play size={17} />}</button>
      <button className="player-skip" aria-label="下一首" title="下一首 · →" onClick={() => onSkip(1)}><ChevronRight size={16} /></button>
      <div className="player-volume"><button className="player-skip" aria-label={silent ? '开启声音' : '静音'} aria-pressed={silent} title={silent ? '开启声音' : '静音'} onClick={onMute}>{silent ? <VolumeX size={15} /> : <Volume2 size={15} />}</button><input type="range" min="0" max="1" step="0.01" value={silent ? 0 : volume} aria-label="音量" onChange={event => onVolumeChange?.(Number(event.target.value))} /></div>
    </div>
    <div className="player-scrub"><time data-testid="player-time">{formatDuration(Math.floor(currentTime))}</time><input className="player-seek" type="range" min="0" max={total || 1} step="0.1" value={Math.min(currentTime,total || 1)} disabled={!track || !live?.duration} onChange={event => live?.seek(Number(event.target.value))} aria-label="播放进度" data-testid="player-seek" style={{ '--progress': `${progress}%` } as CSSProperties} /><time>{total > 0 ? formatDuration(Math.floor(total)) : '—'}</time></div>
    {error && <button className="player-source-action" onClick={onOpenMusic}>选择音乐平台</button>}
  </footer>
}
