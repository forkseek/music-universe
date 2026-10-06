import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowDownToLine, ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Crosshair, Disc3, Expand, EyeOff, Fingerprint, Layers3, ListMusic, Orbit, Pause, Pencil, Play, RotateCcw, Search, Settings2, Shuffle, Sparkles, Tags, X } from 'lucide-react'
import { formatDuration } from './data/albums'
import { createAlbumGalaxy, createGalaxySeed, STYLE_LABELS } from './lib/generateAlbumGalaxy'
import type { Album } from './lib/generateAlbumGalaxy'
import { derivePlanetMetrics } from './lib/planetMetrics'
import type { RenderQuality } from './lib/sceneFraming'
import { ALBUM_TARGET } from './lib/galaxyNavigation'
import { useGalaxyNavigation } from './hooks/useGalaxyNavigation'
import { MUSIC_HALL_URL } from './lib/musicWorld'
import { readExploration, rememberExploration } from './lib/explorationSession'
import { rememberPlay } from './lib/playHistory'
import { enrichAlbumRatings } from './lib/ratingEnrichment'
import AlbumEditor from './components/AlbumEditor'
import ControlConsole from './components/ControlConsole'
import HallConnection from './components/HallConnection'
import { CompanionRooms } from './components/CompanionRooms'
import type { CompanionRoom } from './components/CompanionRooms'
import MusicWorldBridge from './components/MusicWorldBridge'
import { PlayerBar } from './components/PlayerBar'
import MusicSearch from './components/MusicSearch'
import { PlayQueue } from './components/PlayQueue'
import { useAudioPlayback } from './hooks/useAudioPlayback'
import { useAlbumMusic } from './hooks/useAlbumMusic'
import { usePlaybackAlbum } from './hooks/usePlaybackAlbum'
import './album-sync.css'
import './hall-connection.css'
import './music-search.css'
import './companion-rooms.css'
import './glass-ui.css'

const GalaxyScene = lazy(() => import('./components/GalaxyScene'))
const QUALITY_LABELS = { auto: '自适应', high: '精致', low: '流畅' } as const

export default function App() {
  const [initial] = useState(readExploration)
  const [album, setAlbum] = useState<Album>(initial.album)
  const [seed, setSeed] = useState(initial.seed)
  const [seedInput, setSeedInput] = useState(initial.seed)
  const [generation, setGeneration] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pulseTarget, setPulseTarget] = useState<string | null>(null)
  const [playing, setPlaying] = useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [showLabels, setShowLabels] = useState(true)
  const [immersiveLabels, setImmersiveLabels] = useState(false)
  const [showOrbits, setShowOrbits] = useState(true)
  const [resetKey, setResetKey] = useState(0)
  const [editing, setEditing] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [tracksOpen, setTracksOpen] = useState(false)
  const [hallOpen, setHallOpen] = useState(false)
  // 旅伴面板首次展开后才挂载内容：它内部会请求 Music World，不能在首屏就发出请求。
  const [hallPanelReady, setHallPanelReady] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  // 三个房间入口（音乐电台 / 我的曲库 / 我的旅程）以浮层展示，不改变当前页面。
  const [room, setRoom] = useState<CompanionRoom | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [qualityOpen, setQualityOpen] = useState(false)
  const [quality, setQuality] = useState<RenderQuality>('auto')
  const [hudVisible, setHudVisible] = useState(false)
  const [playerRevealed, setPlayerRevealed] = useState(false)
  const [notice, setNotice] = useState('')
  const [seedError, setSeedError] = useState('')
  const shell = useRef<HTMLDivElement>(null)
  const audio = useAudioPlayback()
  const albumMusic = useAlbumMusic(album, audio)
  const sceneHost = useRef<HTMLElement>(null)
  const indexStrip = useRef<HTMLDivElement>(null)
  const enriching = useRef('')
  const galaxy = useMemo(() => createAlbumGalaxy(album, { seed }), [seed, album])
  const navigation = useGalaxyNavigation(sceneHost, resetKey, (target) => {
    setSelectedId(target === ALBUM_TARGET ? null : target); setTracksOpen(false); setNotice('')
  })
  const albumSync = usePlaybackAlbum(audio, (value) => {
    // Automatic adoption preserves audio, seed and camera zoom. Manual editing uses replaceAlbum.
    if (album.id !== value.album.id || album.cover !== value.album.cover || album.tracks.map(t => t.id).join('|') !== value.album.tracks.map(t => t.id).join('|')) {
      setAlbum(value.album)
      // Keep Contents mounted so the camera controller and orbit clock remain continuous.
    }
    navigation.followRef.current = null
    navigation.focus(value.planetId)
    setSelectedId(value.planetId); setPulseTarget(value.planetId); setPlaying(true)
  })
  const openTools = () => { if (navigation.cameraModeRef.current === 'free') navigation.cameraActions.current?.recenter(); setHudVisible(true) }
  const toggleCamera = () => { setHudVisible(false); setTracksOpen(false); setHallOpen(false); setQueueOpen(false); setQualityOpen(false); setRoom(null); navigation.cameraActions.current?.toggleFree() }
  // 打开房间浮层：与曲目索引 / 播放队列 / 品质菜单互斥，但保留旅伴面板，方便随时切换房间。
  const openRoom = (next: CompanionRoom) => { setRoom(next); setTracksOpen(false); setQueueOpen(false); setQualityOpen(false) }
  useEffect(() => { if (hallOpen) setHallPanelReady(true) }, [hallOpen])
  useEffect(() => {
    // Closing tools returns keyboard input to the scene rather than its now-inert button.
    if (!hudVisible) sceneHost.current?.querySelector('canvas')?.focus({ preventScroll: true })
  }, [hudVisible])
  // 沉浸模式下，光标滑到屏幕最下方唤出播放菜单；离开底部边缘后收回。
  useEffect(() => {
    if (hudVisible) { setPlayerRevealed(false); return }
    const EDGE = 140
    const track = (event: PointerEvent) => setPlayerRevealed(event.clientY >= window.innerHeight - EDGE)
    const hide = () => setPlayerRevealed(false)
    window.addEventListener('pointermove', track, { passive: true })
    document.addEventListener('pointerleave', hide)
    return () => { window.removeEventListener('pointermove', track); document.removeEventListener('pointerleave', hide) }
  }, [hudVisible])
  const selected = galaxy.planets.find((planet) => planet.id === selectedId)
  // 点击星球时读取该星球的歌曲数据：时长推导尺寸 / 直径 / 公转 / 自转，评分推导重量。
  const selectedMetrics = useMemo(() => selected ? derivePlanetMetrics(selected, galaxy.numericSeed) : null, [selected, galaxy.numericSeed])
  const activePlanet = galaxy.planets.find((planet) => planet.id === (pulseTarget ?? navigation.view.target)) ?? galaxy.planets[0]
  const totalSeconds = album.tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0)
  useEffect(() => { rememberExploration({ album, seed }) }, [album, seed])
  // 用真实的大众热度补齐评分。无变化时 enrichAlbumRatings 返回同一引用，因此不会重复 setAlbum。
  useEffect(() => {
    const fingerprint = `${album.id}|${album.tracks.map((track) => track.rating ?? '').join(',')}`
    if (enriching.current === fingerprint) return
    enriching.current = fingerprint
    const controller = new AbortController()
    void enrichAlbumRatings(album, controller.signal).then((next) => { if (next !== album) setAlbum(next) })
    return () => controller.abort()
  }, [album])
  // 我的旅程：音频真正切到一首新曲目时记一条播放历史（去重、持久化）。
  const playingTrackId = audio.track?.id ?? ''
  useEffect(() => {
    const track = audio.getTrack()
    if (!track) return
    rememberPlay({ key: track.id, title: track.title, artist: track.artist, album: track.album, cover: track.cover, planetId: track.planetId })
  }, [playingTrackId, audio.getTrack])
  const regenerate = (value: string) => {
    if (!value.trim()) { setSeedError('请填写一个 Seed。'); return }
    setSeedError(''); setSeed(value.trim()); setSeedInput(value.trim()); setSelectedId(null); setPulseTarget(null)
    setGeneration((current) => current + 1); setResetKey((current) => current + 1)
    setNotice(`新的星系已点亮 · ${value.trim()}`)
  }
  const randomize = () => regenerate(createGalaxySeed())
  const replaceAlbum = (nextAlbum: Album) => {
    // React batches this event: one album, one seed, one replacement generation.
    albumMusic.cancel(); audio.stop()
    setAlbum(nextAlbum)
    regenerate(createGalaxySeed())
    setNotice('新专辑的星系已点亮')
  }
  const exportGalaxy = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ album, galaxy }, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = `music-universe-${galaxy.numericSeed}.json`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice('专辑与星系数据已导出')
  }
  const selectTrack = (id: string | null) => {
    if (id) navigation.focus(id)
    else setSelectedId(null)
    setTracksOpen(false); setNotice('')
  }
  const toggleTarget = (target: string) => {
    navigation.activate(target)
    setPulseTarget(target)
    setPlaying((current) => pulseTarget === target ? !current : true)
  }
  // 双击星球：判定为播放该曲目，并让主视角跟随过去（幂等，暂停改由播放器 / 空格完成）。
  const playPlanet = (target: string) => {
    navigation.follow(target)
    setPulseTarget(target)
    setPlaying(true)
    const track = galaxy.planets.find(planet => planet.id === target)
    if (track) {
      if (audio.track?.planetId === target) audio.play()
      else void albumMusic.playTrack(target)
    }
  }
  const toggleMusic = () => {
    if (albumMusic.loading) { albumMusic.cancel(); audio.pause(); return }
    if (audio.track) { audio.toggle(); return }
    setPulseTarget(activePlanet.id); setPlaying(true); void albumMusic.playTrack(activePlanet.id)
  }
  const skipTrack = (direction: -1 | 1) => {
    const current = galaxy.planets.findIndex((planet) => planet.id === (audio.track?.planetId || navigation.viewRef.current.target))
    const index = current < 0 ? (direction === 1 ? 0 : galaxy.planets.length - 1) : (current + direction + galaxy.planets.length) % galaxy.planets.length
    const planet = galaxy.planets[index]
    navigation.focus(planet.id); setPulseTarget(planet.id); setPlaying(true)
    void albumMusic.playTrack(planet.id)
  }
  // 从播放队列里点选一首：只切换播放与高亮，不动镜头，避免打断正在进行的沉浸浏览。
  const playFromQueue = (id: string) => {
    setPulseTarget(id); setPlaying(true)
    if (audio.track?.planetId === id) audio.play()
    else void albumMusic.playTrack(id)
  }
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void shell.current?.requestFullscreen().catch(() => setNotice('当前浏览器暂不支持全屏。'))
  }
  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return
      const element = event.target as HTMLElement | null
      if (element?.closest('input,textarea,select,[contenteditable=true]')) return
      if (event.key.toLowerCase() === 'h') { if (hudVisible) setHudVisible(false); else openTools(); return }
      if (event.code === 'KeyT') { event.preventDefault(); setShowOrbits((value) => !value); return }
      if (event.code === 'KeyU' && !hudVisible) { event.preventDefault(); setImmersiveLabels((value) => !value); return }
      if (event.code === 'Escape') {
        if (navigation.cameraModeRef.current === 'free') { event.preventDefault(); navigation.cameraActions.current?.recenter(); return }
        if (room || tracksOpen || hallOpen || qualityOpen || queueOpen) { setRoom(null); setTracksOpen(false); setHallOpen(false); setQualityOpen(false); setQueueOpen(false) }
        else if (hudVisible) setHudVisible(false)
        else window.location.assign(MUSIC_HALL_URL)
        return
      }
      if (element?.closest('button,a')) return
      if (event.code === 'KeyR') { event.preventDefault(); toggleCamera(); return }
      if (event.code === 'KeyK') { event.preventDefault(); navigation.cameraActions.current?.recenter(); return }
      if (navigation.cameraModeRef.current === 'free') return
      if (event.code === 'Space') { event.preventDefault(); toggleMusic() }
      if (event.code === 'ArrowRight') { event.preventDefault(); skipTrack(1) }
      if (event.code === 'ArrowLeft') { event.preventDefault(); skipTrack(-1) }
    }
    window.addEventListener('keydown', shortcuts)
    return () => window.removeEventListener('keydown', shortcuts)
  })
  return <div className={`app-shell has-player ${hudVisible ? '' : 'hud-hidden'} ${!hudVisible && playerRevealed ? 'player-revealed' : ''}`} ref={shell} data-album-id={album.id} data-album-cover={album.cover} data-playing-planet={audio.track?.planetId || ''} data-playing-index={albumSync.trackIndex ?? ''}>
    <audio ref={audio.audioRef} preload="none" data-testid="audio-engine" />
    <main ref={sceneHost} onPointerDownCapture={(event) => { if (event.target instanceof HTMLCanvasElement) event.target.focus({ preventScroll: true }) }} id="universe" className="galaxy-viewport" data-testid="galaxy-viewport" aria-label="全屏专辑 3D 星系">
      <div ref={navigation.backdrop} className="space-motion-backdrop" aria-hidden="true" /><div className="scene-vignette" />
      <Suspense fallback={<div className="scene-loading" role="status"><span className="loading-orbit" />正在点亮你的宇宙…</div>}>
        <GalaxyScene galaxy={galaxy} album={album} selectedId={selectedId} onSelect={selectTrack} playing={playing} showLabels={hudVisible ? showLabels : immersiveLabels} showOrbits={showOrbits} resetKey={resetKey} generation={generation} quality={album.tracks.length > 40 && quality === 'auto' ? 'low' : quality} navigation={navigation} onToggleTarget={toggleTarget} onPlayTarget={playPlanet} pulseTarget={pulseTarget} toolsVisible={hudVisible} selectedMetrics={selectedMetrics} />
      </Suspense>
    </main>
    <p className="visually-hidden" aria-live="polite">滚轮或双指开合连续缩放，拖动空白处环绕镜头，拖动恒星可 360 度旋转封面。双击星球即播放该曲目并让视角跟随。互动栏可拖动标题栏移动，拖拽右下角调整大小。R 进入自由镜头，WASD 移动，Shift 加速，Space 上升，Ctrl 下降，Q/E 倾斜；T 切换星球轨迹，U 切换标签，K 回正，H 显示工具。自由镜头下 Esc 回正，纯场景下 Esc 返回音乐大厅。</p>
    <div className="universe-hud" inert={!hudVisible} aria-hidden={!hudVisible}>
      <header className="site-header">
        <a className="brand" href="#universe" aria-label="Music Universe 首页"><span className="brand-mark"><Orbit size={28} strokeWidth={1.15} /></span><span>Music <b>Universe</b><small>A ROOM IN MUSIC WORLD</small></span></a>
        <nav aria-label="主导航"><a className="hall-nav-link" href={MUSIC_HALL_URL} aria-label="音乐大厅"><ChevronLeft size={14} /><span>音乐大厅</span></a><span className="nav-active"><span className="live-dot" /> 星系探索</span><button onClick={() => setEditing(true)} aria-label="专辑工坊"><Disc3 size={14} /><span>专辑工坊</span></button><button onClick={() => setShowGuide(true)} aria-label="使用指南"><CircleHelp size={14} /><span>使用指南</span></button><button onClick={() => { albumMusic.cancel(); setSearchOpen(true) }} aria-label="音乐搜索"><Search size={14} /><span>音乐搜索</span></button></nav>
        <div className="header-actions"><button className="icon-button" aria-label="沉浸模式" title="隐藏界面 · H" onClick={() => setHudVisible(false)}><EyeOff size={17} /></button><button className="icon-button fullscreen-button" aria-label="全屏查看星系" title="浏览器全屏" onClick={fullscreen}><Expand size={17} /></button></div>
      </header>
      <section className="album-heading" aria-label="当前专辑"><div className="album-eyebrow"><span className="tiny-star">✦</span> ALBUM SOLAR SYSTEM <i /> VOL. 001</div><h1>{album.name}</h1><p><span>{album.artist}</span>{album.year && <><span className="meta-dot">·</span><span>{album.year}</span></>}<span className="meta-dot">·</span><span>{album.tracks.length} 首曲目</span>{totalSeconds > 0 && <><span className="meta-dot">·</span><span>{Math.floor(totalSeconds / 60)} 分 {totalSeconds % 60} 秒</span></>}</p><button className="text-button edit-album" onClick={() => setEditing(true)}><Pencil size={12} /> 编辑专辑 <ArrowUpRight size={11} /></button></section>
      <aside className="scene-status"><span className="scene-live"><span className="live-dot" /> LIVE UNIVERSE</span><span>每张专辑，一片宇宙。</span><div className="quality-picker"><button className="quality-trigger" aria-label="画面品质" aria-expanded={qualityOpen} onClick={() => setQualityOpen((value) => !value)}><Settings2 size={12} />{QUALITY_LABELS[quality]}<ChevronDown size={11} /></button>{qualityOpen && <div className="quality-menu" role="group" aria-label="选择画面品质">{(['auto','high','low'] as const).map((value) => <button key={value} aria-pressed={quality === value} onClick={() => { setQuality(value); setQualityOpen(false) }}>{QUALITY_LABELS[value]}{quality === value && <Check size={12} />}</button>)}</div>}</div></aside>
      {selected && <section className="planet-detail" role="status"><button className="icon-button detail-close" aria-label="关闭星球详情" onClick={() => selectTrack(null)}><X size={16} /></button><div className="detail-top"><span className="detail-number">{String(selected.index + 1).padStart(2, '0')}</span><span className="detail-planet" style={{ '--planet-color': selected.color, '--planet-secondary': selected.secondaryColor } as CSSProperties} /></div><span className="detail-eyebrow">TRACK PLANET / {STYLE_LABELS[selected.style]}</span><strong>{selected.title}</strong><p>{formatDuration(selected.duration)} <span>·</span> {selected.moonCount} 颗卫星 {selected.hasRing && ' · 星环'}</p>{selectedMetrics && <dl className="detail-metrics" data-testid="planet-metrics"><div><dt>半径</dt><dd>{Math.round(selectedMetrics.diameter / 2).toLocaleString('en-US')} km</dd></div><div><dt>直径</dt><dd>{Math.round(selectedMetrics.diameter).toLocaleString('en-US')} km</dd></div><div><dt>公转周期</dt><dd>{formatDuration(Math.round(selectedMetrics.orbitalPeriod))}</dd></div><div><dt>自转周期</dt><dd>{formatDuration(Math.round(selectedMetrics.rotationPeriod))}</dd></div><div><dt>重量</dt><dd>{selectedMetrics.mass.toFixed(2)} M⊕</dd></div><div><dt>评分</dt><dd>{selectedMetrics.rating} / 100{selected.ratingSource === 'netease' && <small className="rating-source" title="来自网易云音乐全站播放热度，非专业乐评">网易云热度</small>}</dd></div></dl>}<div className="detail-navigation"><button disabled={selected.index === 0} aria-label="上一颗歌曲星球" onClick={() => selectTrack(galaxy.planets[selected.index - 1]?.id ?? null)}><ChevronLeft size={13} />上一首</button><button disabled={selected.index === galaxy.planets.length - 1} aria-label="下一颗歌曲星球" onClick={() => selectTrack(galaxy.planets[selected.index + 1]?.id ?? null)}>下一首<ChevronRight size={13} /></button></div></section>}
      <div className="scene-caption"><span>MU—001 / THE ALBUM SYSTEM</span><p>让每一首歌，找到自己的轨道。</p></div>
      <div className="index-launch"><span>{String(album.tracks.length).padStart(2, '0')} PLANETS <i /></span><button className={tracksOpen ? 'active' : ''} aria-label="曲目索引" aria-expanded={tracksOpen} aria-controls="track-drawer" onClick={() => { setTracksOpen((value) => !value); setHallOpen(false); setQueueOpen(false) }}><ListMusic size={16} /> 曲目索引 <ChevronDown size={13} /></button></div>
      {tracksOpen && <section id="track-drawer" className="track-index" aria-label="曲目星球索引"><div className="index-heading"><div><span className="eyebrow">THE CONSTELLATION</span><h2>沿着曲序，探索每颗星球。</h2></div><div className="index-arrows"><button className="icon-button" aria-label="曲目索引向左" onClick={() => indexStrip.current?.scrollBy({ left: -400, behavior: 'smooth' })}><ChevronLeft size={17} /></button><button className="icon-button" aria-label="曲目索引向右" onClick={() => indexStrip.current?.scrollBy({ left: 400, behavior: 'smooth' })}><ChevronRight size={17} /></button><button className="icon-button" aria-label="收起曲目索引" onClick={() => setTracksOpen(false)}><X size={16} /></button></div></div><div className="track-strip" ref={indexStrip}>{galaxy.planets.map((planet) => <button key={planet.id} className={`track-card ${selectedId === planet.id ? 'selected' : ''}`} onClick={() => selectTrack(planet.id)} aria-label={`查看 ${planet.title}`} aria-pressed={selectedId === planet.id}><span className="track-card-top"><span>{String(planet.index + 1).padStart(2, '0')}</span><span className="mini-planet" style={{ '--planet-color': planet.color, '--planet-secondary': planet.secondaryColor } as CSSProperties}>{planet.hasRing && <i />}</span><ArrowUpRight size={12} /></span><strong>{planet.title}</strong><span className="track-card-meta">{STYLE_LABELS[planet.style]} <span>·</span> {formatDuration(planet.duration)}</span></button>)}</div></section>}
      <ControlConsole hint={<>拖动空白环绕 <span>·</span> 滚轮缩放 <span>·</span> R 自由镜头 <span>·</span> K 回正</>}><div className="control-bar"><form className="seed-controls" onSubmit={(event) => { event.preventDefault(); regenerate(seedInput) }}><label htmlFor="seed-input"><Fingerprint size={15} /><span>SEED</span></label><input id="seed-input" aria-label="星系 Seed" value={seedInput} maxLength={80} onChange={(event) => { setSeedInput(event.target.value); setSeedError('') }} spellCheck={false} /><button type="submit" className="icon-button regenerate-button" title="使用当前 Seed 重新生成" aria-label="重新生成"><RotateCcw size={15} /></button><button type="button" className="primary-button random-button" onClick={randomize}><Shuffle size={14} />随机生成</button></form><span className="control-divider" /><div className="view-controls"><button className="tool-button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? '暂停动画' : '继续动画'}>{playing ? <Pause size={14} /> : <Play size={14} />}<span>{playing ? '巡航中' : '已暂停'}</span><i className={playing ? 'playing' : ''} /></button><button className={`tool-button ${showLabels ? 'tool-active' : ''}`} onClick={() => setShowLabels((value) => !value)} aria-pressed={showLabels} aria-label="标签"><Tags size={15} /><span>标签</span></button><button className={`tool-button ${showOrbits ? 'tool-active' : ''}`} onClick={() => setShowOrbits((value) => !value)} aria-pressed={showOrbits} aria-label="星球轨迹" title="显示或隐藏星球轨迹 · T"><Orbit size={15} /><span>轨迹</span></button><button className="tool-button" onClick={() => setResetKey((value) => value + 1)} aria-label="重置视角"><Crosshair size={16} /><span>重置视角</span></button><button className="icon-button export-button" aria-label="导出星系 JSON" title="导出星系数据" onClick={exportGalaxy}><ArrowDownToLine size={16} /></button></div></div><div className="generation-note" role="status">{seedError ? <span className="seed-error">{seedError}</span> : <span>{notice ? <Check size={10} /> : <Sparkles size={10} />}{notice || '相同 Seed，相同星系。曲序始终如一。'}</span>}</div></ControlConsole>
    </div>
    {/* 旅伴入口与播放队列都挂在 HUD 之外：沉浸模式下也能打开，不退出沉浸、不打断播放。 */}
    <div className="hall-relay"><button className={`companion-trigger ${hallOpen ? 'active' : ''}`} aria-label="展开音乐大厅入口" aria-expanded={hallOpen} aria-controls="hall-panel" onClick={() => { setHallOpen((value) => !value); setTracksOpen(false); setQueueOpen(false) }}><span className="hall-companion-portrait" aria-hidden="true" /><span><small>THE SAME LITTLE VOYAGER</small><strong>来自音乐大厅的旅伴</strong></span><ChevronRight size={14} /></button><div id="hall-panel" className={`hall-panel${hallOpen ? ' is-open' : ''}`} inert={!hallOpen} aria-hidden={!hallOpen}>{hallPanelReady && <div className="hall-panel-scroll"><div className="floating-panel-head"><span>MUSIC WORLD / 继续你的音乐旅程</span><button className="icon-button" aria-label="收起音乐大厅入口" onClick={() => setHallOpen(false)}><X size={15} /></button></div><HallConnection onOpenRoom={openRoom} /><MusicWorldBridge onAdoptAlbum={replaceAlbum} /></div>}</div></div>
    <PlayQueue open={queueOpen} planets={galaxy.planets} currentId={activePlanet.id} playing={audio.playing} onPlay={playFromQueue} onClose={() => setQueueOpen(false)} />
    <CompanionRooms room={room} album={album} planets={galaxy.planets} currentId={activePlanet.id} audio={audio} onPlay={playFromQueue} onSkip={skipTrack} onToggle={toggleMusic} onClose={() => setRoom(null)} />
    {albumSync.message && <p className="album-sync-status" data-testid="album-sync-status" data-state={albumSync.status} role="status"><span>{albumSync.message}</span>{albumSync.status === 'error' && <button type="button" onClick={albumSync.retry}>重新获取</button>}</p>}
    <div className="player-dock" inert={!hudVisible && !playerRevealed} aria-hidden={!hudVisible && !playerRevealed}>
      <PlayerBar title={activePlanet.title} album={album.name} index={activePlanet.index} duration={activePlanet.duration ?? 0} playing={playing}
        live={{ track: audio.track, currentTime: audio.currentTime, duration: audio.duration, playing: audio.playing, seek: audio.seek }}
        loading={albumMusic.loading || audio.status === 'loading'} message={audio.message || albumMusic.message} error={albumMusic.error || !!audio.message}
        onOpenMusic={() => { albumMusic.cancel(); setSearchOpen(true) }}
        onOpenQueue={() => { setHallOpen(false); setQueueOpen((value) => !value) }}
        onToggle={toggleMusic} onSkip={skipTrack} />
    </div>
    {!hudVisible && <button className="restore-hud" aria-label="显示界面" title="显示工具 · H" onClick={openTools}><Settings2 size={16} /><span>H</span></button>}
    {!hudVisible && <button className={`camera-mode-toggle ${navigation.cameraMode === 'free' ? 'active' : ''}`} aria-label={navigation.cameraMode === 'free' ? '退出自由镜头' : '自由镜头'} aria-pressed={navigation.cameraMode === 'free'} title="自由镜头 · R" onClick={toggleCamera}><Crosshair size={15} /><span>R</span></button>}
    {navigation.cameraMode === 'free' && <><span className="free-camera-reticle" aria-hidden="true" /><div className="free-camera-hint" role="status"><strong>自由镜头</strong><p>鼠标转向 · WASD 移动 · Shift 加速<br />Space / Ctrl 升降 · Q / E 倾斜 · 滚轮变焦</p><button onClick={() => navigation.cameraActions.current?.recenter()}>返回星系视角 <span>K / Esc</span></button></div></>}
    {editing && <AlbumEditor album={album} onClose={() => setEditing(false)} onSave={replaceAlbum} />}
    {showGuide && <Guide onClose={() => setShowGuide(false)} />}
    {searchOpen && <MusicSearch audio={audio} onClose={() => setSearchOpen(false)} />}
  </div>
}

function Guide({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  return <dialog ref={(element) => { dialog.current = element; if (element && !element.open) element.showModal() }} className="guide-dialog" onCancel={onClose} onClick={(event) => { if (event.target === dialog.current) onClose() }}><div className="guide-content"><div className="editor-head"><div><span className="eyebrow">WELCOME, EXPLORER</span><h2>你的音乐宇宙</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭使用指南"><X size={19} /></button></div><p>封面成为恒星，歌曲按曲序排列。整个窗口都是你的 3D 星系，默认以纯场景方式探索。</p><div className="guide-step"><span>01</span><div><strong>轻轻探索</strong><p>沉浸浏览时，镜头会随公转节奏缓慢环绕星系；滚轮或拖动优先响应，停止操作后再平滑恢复。滚轮围绕当前星系中心平滑缩放，光标位置不会带动画面偏移；手机双指开合以双指中点缩放。拖动空白处环绕镜头，松手后缓缓停下，背景随镜头产生视差和旋转。拖动恒星封面可 360° 转动，松手保留惯性，再次抓取即可制动。</p></div></div><div className="guide-step"><span>02</span><div><strong>构建新星系</strong><p>在专辑工坊编辑封面与曲目。相同 Seed 可以复现同一套星球。</p></div></div><div className="guide-step"><span>03</span><div><strong>留一点空间给音乐</strong><p>R 切换自由镜头：鼠标转向，WASD 移动，Shift 加速，Space / Ctrl 升降，Q / E 倾斜，滚轮改变视角。K 或双击空白处平滑回正；自由镜头下 Esc 也可回正。星系视角下空格控制动画，H 显示工具，纯场景下 Esc 返回音乐大厅。</p></div></div><div className="guide-step"><span><Layers3 size={20} /></span><div><strong>同一个音乐世界</strong><p>旅伴入口可前往音乐大厅、电台、曲库与旅程，往返保留当前专辑和 Seed。</p></div></div><button className="primary-button" onClick={onClose}>开始遨游 <ArrowUpRight size={15} /></button></div></dialog>
}
