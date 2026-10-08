import { X } from 'lucide-react'
import { formatDuration } from '../data/albums'
import type { GalaxyPlanet } from '../lib/generateAlbumGalaxy'

/**
 * 播放队列（左侧竖向列表）。
 *
 * 队列就是当前专辑的曲序：与播放器的上一首 / 下一首走的是同一份列表，
 * 因此这里只列当前专辑的曲目，不会混入搜索面板或本地导入的音频。
 *
 * 面板挂在 .universe-hud 之外，所以沉浸模式下也能打开：
 * 打开它不退出沉浸、不暂停播放，也不改变场景里的任何交互。
 */
export function PlayQueue({ open, planets, currentId, playing, onPlay, onClose }: {
  open: boolean
  planets: GalaxyPlanet[]
  currentId: string
  playing: boolean
  onPlay: (id: string) => void
  onClose: () => void
}) {
  return <aside id="play-queue" className={`play-queue${open ? ' is-open' : ''}`} inert={!open} aria-hidden={!open} aria-label="播放队列">
    <div className="queue-head">
      <div className="queue-heading"><span className="eyebrow">PLAY QUEUE</span><strong>播放队列</strong></div>
      <button type="button" className="icon-button" aria-label="收起播放队列" onClick={onClose}><X size={15} /></button>
    </div>
    <ol className="queue-list">
      {planets.map((planet) => {
        const current = planet.id === currentId
        return <li key={planet.id}>
          <button type="button" className={`queue-item${current ? ' is-current' : ''}`} aria-current={current ? 'true' : undefined} aria-label={`播放 ${planet.title}`} onClick={() => onPlay(planet.id)}>
            <span className="queue-index" aria-hidden="true">{current && playing
              ? <span className="queue-bars"><i /><i /><i /></span>
              : String(planet.index + 1).padStart(2, '0')}</span>
            <span className="queue-title">{planet.title}</span>
            <span className="queue-time">{formatDuration(planet.duration)}</span>
          </button>
        </li>
      })}
    </ol>
  </aside>
}
