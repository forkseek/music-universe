import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { ChevronLeft, ChevronRight, Disc3, Heart, ListMusic, Pause, Play, Radio, Trash2, X } from 'lucide-react'
import { formatDuration } from '../data/albums'
import type { Album, GalaxyPlanet } from '../lib/generateAlbumGalaxy'
import type { AudioPlayback } from '../hooks/useAudioPlayback'
import { clearPlayHistory, readPlayHistory, subscribePlayHistory } from '../lib/playHistory'
import type { PlayHistoryEntry } from '../lib/playHistory'

/**
 * 旅伴入口里的三个互动浮层：音乐电台 / 我的曲库 / 我的旅程。
 *
 * 与播放队列一样挂在 .universe-hud 之外：沉浸模式下也能打开，
 * 打开与关闭都只做浮层显隐，不发生网页跳转，也不打断播放与场景交互。
 *
 * 「我的曲库」是收藏式网格（专辑 + 曲目卡片），「我的旅程」是时间线（播放历史），
 * 两者 UI 已按需求对调到位：旅程承载播放历史。
 */

export type CompanionRoom = 'world' | 'library' | 'journey'

const ROOMS: Record<CompanionRoom, { title: string; eyebrow: string; intro: string; Icon: typeof Radio }> = {
  world: { title: '音乐电台', eyebrow: 'RADIO STATION', intro: '像电台一样连续播放：换一首，或从节目单里点播。', Icon: Radio },
  library: { title: '我的曲库', eyebrow: 'MUSIC ARCHIVE', intro: '当前专辑的全部曲目，在这里整理与点播。', Icon: Disc3 },
  journey: { title: '我的旅程', eyebrow: 'YOUR MUSIC JOURNEY', intro: '按时间倒序记录你真正播放过的歌。', Icon: Heart },
}

const moment = (value: number) => {
  const date = new Date(value)
  const clock = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  if (date.toDateString() === new Date().toDateString()) return `今天 ${clock}`
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${clock}`
}

export function CompanionRooms({ room, album, planets, currentId, audio, onPlay, onSkip, onToggle, onClose }: {
  room: CompanionRoom | null
  album: Album
  planets: GalaxyPlanet[]
  currentId: string
  audio: AudioPlayback
  onPlay: (id: string) => void
  onSkip: (direction: -1 | 1) => void
  onToggle: () => void
  onClose: () => void
}) {
  const [history, setHistory] = useState<PlayHistoryEntry[]>(() => readPlayHistory())
  useEffect(() => subscribePlayHistory(setHistory), [])
  const meta = room ? ROOMS[room] : null
  const Icon = meta?.Icon
  return <aside id="companion-rooms" className={`companion-rooms${room ? ' is-open' : ''}`} inert={!room} aria-hidden={!room} aria-label={meta ? meta.title : '旅伴浮层'}>
    {meta && Icon && <div className="rooms-head">
      <div className="rooms-heading">
        <span className="eyebrow">{meta.eyebrow}</span>
        <strong><Icon size={15} strokeWidth={1.6} /> {meta.title}</strong>
        <small>{meta.intro}</small>
      </div>
      <button type="button" className="icon-button" aria-label={`收起${meta.title}`} onClick={onClose}><X size={15} /></button>
    </div>}
    {room && <div className="rooms-body" data-testid={`companion-room-${room}`}>
      {room === 'world' && <RadioRoom planets={planets} currentId={currentId} artist={album.artist} audio={audio} onPlay={onPlay} onSkip={onSkip} onToggle={onToggle} />}
      {room === 'library' && <LibraryRoom album={album} planets={planets} currentId={currentId} onPlay={onPlay} />}
      {room === 'journey' && <JourneyRoom history={history} planets={planets} onPlay={onPlay} />}
    </div>}
  </aside>
}

/** 音乐电台：正在播放 + 电台节目单。 */
function RadioRoom({ planets, currentId, artist, audio, onPlay, onSkip, onToggle }: {
  planets: GalaxyPlanet[]
  currentId: string
  artist: string
  audio: AudioPlayback
  onPlay: (id: string) => void
  onSkip: (direction: -1 | 1) => void
  onToggle: () => void
}) {
  const current = planets.find((planet) => planet.id === currentId) ?? planets[0]
  return <>
    <section className="rooms-now" aria-label="正在播放">
      <span className={`rooms-now-art${audio.playing ? ' is-live' : ''}`} style={{ '--planet-color': current?.color, '--planet-secondary': current?.secondaryColor } as CSSProperties} aria-hidden="true" />
      <div className="rooms-now-copy">
        <span className="rooms-eyebrow"><span className="live-dot" /> ON AIR</span>
        <strong>{current?.title ?? '等待一首歌'}</strong>
        <small>{current?.artist || artist}{current ? ` · ${formatDuration(current.duration)}` : ''}</small>
      </div>
    </section>
    <div className="rooms-transport">
      <button type="button" onClick={() => onSkip(-1)} aria-label="电台上一首"><ChevronLeft size={16} /></button>
      <button type="button" className="rooms-transport-main" onClick={onToggle} aria-label={audio.playing ? '暂停电台' : '播放电台'} aria-pressed={audio.playing}>{audio.playing ? <Pause size={17} /> : <Play size={17} />}</button>
      <button type="button" onClick={() => onSkip(1)} aria-label="电台下一首"><ChevronRight size={16} /></button>
    </div>
    <section className="rooms-section">
      <h3><ListMusic size={12} /> 电台节目单 <span>{planets.length} 首</span></h3>
      <ol className="rooms-tracks">
        {planets.map((planet) => <li key={planet.id}>
          <button type="button" className={`rooms-track${planet.id === currentId ? ' is-current' : ''}`} aria-current={planet.id === currentId ? 'true' : undefined} aria-label={`播放 ${planet.title}`} onClick={() => onPlay(planet.id)}>
            <span className="rooms-track-index">{planet.id === currentId && audio.playing ? <span className="queue-bars"><i /><i /><i /></span> : String(planet.index + 1).padStart(2, '0')}</span>
            <span className="rooms-track-title">{planet.title}</span>
            <span className="rooms-track-time">{formatDuration(planet.duration)}</span>
          </button>
        </li>)}
      </ol>
    </section>
  </>
}

/** 我的曲库：专辑档案 + 收藏式曲目网格。 */
function LibraryRoom({ album, planets, currentId, onPlay }: {
  album: Album
  planets: GalaxyPlanet[]
  currentId: string
  onPlay: (id: string) => void
}) {
  const artists = new Set(album.tracks.map((track) => track.artist).filter(Boolean)).size || 1
  const totalSeconds = album.tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0)
  return <>
    <section className="rooms-album" aria-label="专辑档案">
      <span className="rooms-album-cover" aria-hidden="true">{album.cover && <img src={album.cover} alt="" loading="lazy" />}</span>
      <div className="rooms-album-copy">
        <span className="rooms-eyebrow">{album.year ? `${album.year} · ALBUM` : 'ALBUM'}</span>
        <strong>{album.name}</strong>
        <small>{album.artist}</small>
      </div>
    </section>
    <dl className="rooms-stats">
      <div><dt>曲目</dt><dd>{album.tracks.length}</dd></div>
      <div><dt>艺术家</dt><dd>{artists}</dd></div>
      <div><dt>总时长</dt><dd>{Math.floor(totalSeconds / 60)} 分</dd></div>
      <div><dt>星球</dt><dd>{planets.length}</dd></div>
    </dl>
    <section className="rooms-section">
      <h3><Disc3 size={12} /> 曲目收藏 <span>按曲序排列</span></h3>
      <div className="rooms-grid">
        {planets.map((planet) => <button key={planet.id} type="button" className={`rooms-card${planet.id === currentId ? ' is-current' : ''}`} aria-pressed={planet.id === currentId} aria-label={`播放 ${planet.title}`} onClick={() => onPlay(planet.id)}>
          <span className="rooms-card-art" style={{ '--planet-color': planet.color, '--planet-secondary': planet.secondaryColor } as CSSProperties} aria-hidden="true">{planet.hasRing && <i />}</span>
          <strong>{planet.title}</strong>
          <span className="rooms-card-meta">{formatDuration(planet.duration)}{planet.rating ? ` · 热度 ${planet.rating}` : ''}</span>
        </button>)}
      </div>
    </section>
  </>
}

/** 我的旅程：真实播放历史时间线。 */
function JourneyRoom({ history, planets, onPlay }: {
  history: PlayHistoryEntry[]
  planets: GalaxyPlanet[]
  onPlay: (id: string) => void
}) {
  const known = new Set(planets.map((planet) => planet.id))
  if (!history.length) return <p className="rooms-empty"><Heart size={15} /> 还没有出发。播放一首歌，旅程就会从这里开始。</p>
  return <>
    <div className="rooms-journey-head">
      <span className="rooms-eyebrow">{history.length} 次停留</span>
      <button type="button" className="rooms-clear" onClick={clearPlayHistory}><Trash2 size={12} /> 清空旅程</button>
    </div>
    <ol className="rooms-journey">
      {history.map((entry) => {
        const back = !!entry.planetId && known.has(entry.planetId)
        return <li key={entry.key}>
          <span className="rooms-journey-time">{moment(entry.playedAt)}</span>
          <span className="rooms-journey-dot" aria-hidden="true" />
          <button type="button" className="rooms-journey-item" disabled={!back} aria-label={back ? `再听 ${entry.title}` : `${entry.title} 不在当前星系`} onClick={() => { if (back && entry.planetId) onPlay(entry.planetId) }}>
            <strong>{entry.title}</strong>
            <small>{entry.artist || '未知艺术家'}{entry.album ? ` · ${entry.album}` : ''}</small>
            <span className={`rooms-journey-go${back ? '' : ' is-off'}`}>{back ? <>再听一次 <ChevronRight size={11} /></> : '不在当前星系'}</span>
          </button>
        </li>
      })}
    </ol>
  </>
}
