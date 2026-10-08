import type { CSSProperties } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Pause, Play, RotateCcw, X } from 'lucide-react'
import { formatDuration } from '../data/albums'
import { STYLE_LABELS } from '../lib/generateAlbumGalaxy'
import type { Album, GalaxyPlanet } from '../lib/generateAlbumGalaxy'
import type { PlanetMetrics } from '../lib/planetMetrics'
import type { useFloatingPanel } from '../hooks/useFloatingPanel'
import type { AudioPlayback } from '../hooks/useAudioPlayback'
import type { TrackLyrics } from '../hooks/useTrackLyrics'
import { LyricImport } from './LyricImport'

interface Props {
  planet: GalaxyPlanet; album: Album; metrics: PlanetMetrics | null
  panel: ReturnType<typeof useFloatingPanel>; audio: AudioPlayback; lyrics: TrackLyrics
  immersive: boolean; loading: boolean; failure: string; canRetry: boolean
  onSkip: (direction: -1 | 1) => void; onToggle: () => void; onClose: () => void; onRetry: () => void
}

export function MusicPlanetPanel({ planet, album, metrics, panel, audio, lyrics, immersive, loading, failure, canRetry, onSkip, onToggle, onClose, onRetry }: Props) {
  const current = audio.track?.planetId === planet.id
  const cover = current ? audio.track?.cover || album.cover : album.cover
  const status = loading ? '正在切换…' : current ? (audio.status === 'error' ? '播放失败' : audio.status === 'loading' ? '正在缓冲…' : audio.playing ? '正在播放' : '已暂停') : '待播放'
  const metricRows = metrics && <dl className="detail-metrics" data-testid="planet-metrics">
    <div><dt>半径</dt><dd>{Math.round(metrics.diameter / 2).toLocaleString('en-US')} km</dd></div>
    <div><dt>直径</dt><dd>{Math.round(metrics.diameter).toLocaleString('en-US')} km</dd></div>
    <div><dt>公转周期</dt><dd>{formatDuration(Math.round(metrics.orbitalPeriod))}</dd></div>
    <div><dt>自转周期</dt><dd>{formatDuration(Math.round(metrics.rotationPeriod))}</dd></div>
    <div><dt>重量</dt><dd>{metrics.mass.toFixed(2)} M⊕</dd></div>
    <div><dt>评分</dt><dd>{metrics.rating} / 100{planet.ratingSource === 'netease' && <small className="rating-source" title="来自网易云音乐全站播放热度，非专业乐评">网易云热度</small>}</dd></div>
  </dl>
  return <section className={`planet-detail music-planet-panel${panel.dragging ? ' is-dragging' : ''}${loading ? ' is-loading' : ''}`} role="region" aria-label="音乐星球" aria-busy={loading}
    ref={panel.panelRef} style={panel.style} onPointerDown={panel.onPointerDown} onPointerMove={panel.onPointerMove} onPointerUp={panel.onPointerUp} onPointerCancel={panel.onPointerCancel} data-testid="music-planet-panel" data-planet-id={planet.id}>
    <button className="icon-button detail-close" aria-label="关闭星球详情" onClick={onClose}><X size={16} /></button>
    <div className="detail-top" title="按住可拖动"><span className="detail-number">{String(planet.index + 1).padStart(2, '0')}</span><span className="detail-cover">{cover && <img src={cover} alt="" draggable={false} />}</span><span className="detail-planet" style={{ '--planet-color': planet.color, '--planet-secondary': planet.secondaryColor } as CSSProperties} /></div>
    <span className="detail-eyebrow">TRACK PLANET / {STYLE_LABELS[planet.style]}</span>
    <strong className="detail-title" data-testid="planet-song-title">{planet.title}</strong>
    <p className="detail-artist">{current ? audio.track?.artist : planet.artist || album.artist}</p>
    <p>{formatDuration(planet.duration)} <span>·</span> {planet.moonCount} 颗卫星 {planet.hasRing && ' · 星环'}</p>
    {immersive ? <details className="detail-attributes" data-no-drag><summary>行星参数</summary>{metricRows}</details> : metricRows}
    <div className="detail-playback-status" role="status" data-testid="planet-playback-status">{loading || (current && audio.status === 'loading') ? <Loader2 size={12} className="detail-spinner" /> : <span className={`detail-playing-dot${current && audio.playing ? ' is-playing' : ''}`} />}{status}</div>
    <div className="detail-navigation" data-no-drag>
      <button disabled={planet.index === 0} aria-label="上一颗歌曲星球" onClick={() => onSkip(-1)}><ChevronLeft size={14} />上一首</button>
      <button className="detail-play" aria-label={loading ? '取消切歌' : current && audio.playing ? '暂停星球歌曲' : '播放星球歌曲'} onClick={onToggle}>{loading ? <X size={15} /> : current && audio.playing ? <Pause size={15} /> : <Play size={15} />}</button>
      <button disabled={planet.index === album.tracks.length - 1} aria-label="下一颗歌曲星球" onClick={() => onSkip(1)}>下一首<ChevronRight size={14} /></button>
    </div>
    {(failure || (current && audio.message)) && <div className="detail-playback-error" role="alert"><span>{failure || audio.message}</span>{canRetry && <button onClick={onRetry}><RotateCcw size={12} />重试切歌</button>}</div>}
    {(current || (!audio.track && !loading)) && <LyricImport lyrics={lyrics} />}
  </section>
}
