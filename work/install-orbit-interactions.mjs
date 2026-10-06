import fs from 'node:fs/promises'
import path from 'node:path'
const app = 'C:/path/to/music-universe'
const stage = path.resolve('work/orbit-interactions/src')
const previous = path.resolve('work/orbit-interactions/previous')
for (const file of ['App.tsx','components/GalaxyScene.tsx','styles.css']) {
  await fs.mkdir(path.dirname(path.join(previous, file + '.txt')), { recursive: true })
  await fs.writeFile(path.join(previous, file + '.txt'), await fs.readFile(path.join(app, 'src', file)))
}
let appSource = (await fs.readFile(path.join(app, 'src/App.tsx'), 'utf8')).replaceAll('\r\n','\n')
appSource = appSource.replace("import { MUSIC_HALL_URL }", "import { ALBUM_TARGET } from './lib/galaxyNavigation'\nimport { useGalaxyNavigation } from './hooks/useGalaxyNavigation'\nimport { MUSIC_HALL_URL }")
appSource = appSource.replace('  const [playing,', '  const [pulseTarget, setPulseTarget] = useState<string | null>(null)\n  const [playing,')
appSource = appSource.replace('const [hudVisible, setHudVisible] = useState(true)', 'const [hudVisible, setHudVisible] = useState(false)')
appSource = appSource.replace('  const indexStrip =', '  const sceneHost = useRef<HTMLElement>(null)\n  const indexStrip =')
appSource = appSource.replace('  const selected =', `  const navigation = useGalaxyNavigation(sceneHost, resetKey, (target) => {
    setSelectedId(target === ALBUM_TARGET ? null : target); setTracksOpen(false); setNotice('')
  })
  const selected =`)
const keyStart = appSource.indexOf('  useEffect(() => {\n    const shortcuts =')
const keyEnd = appSource.indexOf('  const regenerate =', keyStart)
if (keyStart < 0 || keyEnd < 0) throw Error('Keyboard block missing')
appSource = appSource.slice(0,keyStart) + appSource.slice(keyEnd)
appSource = appSource.replace("    setSeedError(''); setSeed(value.trim()); setSeedInput(value.trim())", "    setSeedError(''); setSeed(value.trim()); setSeedInput(value.trim()); setSelectedId(null); setPulseTarget(null)")
appSource = appSource.replace("  const selectTrack = (id: string | null) => { setSelectedId(id); if (id) setTracksOpen(false); setNotice('') }", `  const selectTrack = (id: string | null) => {
    if (id) navigation.focus(id)
    else setSelectedId(null)
    setTracksOpen(false); setNotice('')
  }
  const toggleTarget = (target: string) => {
    const view = navigation.viewRef.current
    if (view.transitioning && view.target !== target) return
    navigation.activate(target)
    setPulseTarget(target)
    setPlaying((current) => pulseTarget === target ? !current : true)
  }
  const skipTrack = (direction: -1 | 1) => {
    const current = galaxy.planets.findIndex((planet) => planet.id === navigation.viewRef.current.target)
    const index = current < 0 ? (direction === 1 ? 0 : galaxy.planets.length - 1) : (current + direction + galaxy.planets.length) % galaxy.planets.length
    navigation.focus(galaxy.planets[index].id)
  }`)
appSource = appSource.replace('  return <div className=', `  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return
      const element = event.target as HTMLElement | null
      if (element?.closest('input,textarea,select,[contenteditable=true]')) return
      if (event.key.toLowerCase() === 'h') { setHudVisible((value) => !value); return }
      if (event.code === 'Escape') {
        if (tracksOpen || hallOpen || qualityOpen) { setTracksOpen(false); setHallOpen(false); setQualityOpen(false) }
        else if (hudVisible) setHudVisible(false)
        else window.location.assign(MUSIC_HALL_URL)
        return
      }
      if (element?.closest('button,a')) return
      if (event.code === 'Space') { event.preventDefault(); setPulseTarget(navigation.viewRef.current.target); setPlaying((value) => !value) }
      if (event.code === 'ArrowRight') { event.preventDefault(); skipTrack(1) }
      if (event.code === 'ArrowLeft') { event.preventDefault(); skipTrack(-1) }
    }
    window.addEventListener('keydown', shortcuts)
    return () => window.removeEventListener('keydown', shortcuts)
  })
  return <div className=`)
appSource = appSource.replace('<main id="universe"', '<main ref={sceneHost} onPointerDownCapture={(event) => { if (event.target instanceof HTMLCanvasElement) event.target.focus({ preventScroll: true }) }} id="universe"')
appSource = appSource.replace(' quality={quality} />', ' quality={quality} navigation={navigation} onToggleTarget={toggleTarget} pulseTarget={pulseTarget} toolsVisible={hudVisible} />')
appSource = appSource.replace('    <div className="universe-hud"', `    <p className="visually-hidden" aria-live="polite">{navigation.view.mode === 'overview' ? '星系总览' : '星球近景'}。指向星球向上滚动靠近，向下滚动拉远；拖动近景星球旋转，双击或空格控制动画，左右方向键切换曲目，H 显示工具，Escape 返回音乐大厅。</p>
    <div className="universe-hud"`)
appSource = appSource.replace('拖动探索 <span>·</span> 滚轮缩放 <span>·</span> 点选星球', '滚轮靠近 / 拉远 <span>·</span> 拖动星球 <span>·</span> 双击控制动画')
appSource = appSource.replace('整个窗口都是你的 3D 星系。', '整个窗口都是你的 3D 星系，默认以纯场景方式探索。')
appSource = appSource.replace('拖动旋转、滚轮缩放，点选星球查看详情；曲目索引可以直接找到每首歌。', '在总览中指向星球向上滚动，镜头会平滑靠近它。近景拖动只旋转球体；向下滚动回到总览。手机支持双击和双指缩放。')
appSource = appSource.replace('点击沉浸模式或按 H 隐藏工具；按 H 或点击显示界面恢复。画面品质可选择自适应、精致或流畅。', '双击星球或按空格控制场景动画，左右方向键按曲序切换。按 H 或点击右下角工具按钮显示控制台；再次按 H 隐藏。纯场景下按 Esc 返回音乐大厅。')
appSource = appSource.replace('<Layers3 size={20} /></span><div><strong>同一个音乐世界</strong>', '<Layers3 size={20} /></span><div><strong>同一个音乐世界</strong>')
appSource = appSource.replace('title="显示界面 · H"', 'title="显示工具 · H"')
appSource = appSource.replace('<Eye size={17} /><span>显示界面</span>', '<Settings2 size={16} /><span>H</span>')
appSource = appSource.replace(' Expand, Eye, EyeOff,', ' Expand, EyeOff,')
await fs.writeFile(path.join(stage, 'App.tsx.txt'), appSource)

let scene = (await fs.readFile(path.join(app, 'src/components/GalaxyScene.tsx'),'utf8')).replaceAll('\r\n','\n')
scene = scene.replace('Environment, Lightformer, Line, OrbitControls, PerformanceMonitor', 'Environment, Lightformer, Line, PerformanceMonitor')
scene = scene.replace(', PerspectiveCamera,', ',')
scene = scene.replace("import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'\n", '')
scene = scene.replace("import ImmersiveBackground", "import { ALBUM_TARGET } from '../lib/galaxyNavigation'\nimport type { GalaxyNavigation } from '../hooks/useGalaxyNavigation'\nimport { CameraDirector, PlaybackHalo, SceneDiagnostics, useSurfaceGesture } from './SceneInteraction'\nimport ImmersiveBackground")
scene = scene.replace('  quality: RenderQuality\n}', '  quality: RenderQuality\n  navigation: GalaxyNavigation\n  onToggleTarget: (target: string) => void\n  pulseTarget: string | null\n  toolsVisible: boolean\n}')
const frameStart = scene.indexOf('function Framing(')
const frameEnd = scene.indexOf('function RenderQualityController(')
scene = scene.slice(0, frameStart) + scene.slice(frameEnd)
scene = scene.replace('function WorldMotion({ world, time, playing, planetCount, children }: { world: WorldRef; time: TimeRef; playing: boolean; planetCount: number; children: ReactNode })', 'function WorldMotion({ world, time, playing, planetCount, navigation, children }: { world: WorldRef; time: TimeRef; playing: boolean; planetCount: number; navigation: GalaxyNavigation; children: ReactNode })')
scene = scene.replace('    if (!playing || !world.current) return', "    if (!playing || !world.current || navigation.viewRef.current.mode === 'focus') return")
scene = scene.replace('world.current.rotation.y, y, 3, Math.min(delta, 0.06))\n  })', 'world.current.rotation.y, y, 3, Math.min(delta, 0.06))\n  }, -0.75)')
scene = scene.replace('function AlbumStar({ galaxy, time }: { galaxy: AlbumGalaxy; time: TimeRef })', 'function AlbumStar({ galaxy, time, navigation, onToggleTarget, pulseTarget, playing, toolsVisible }: SceneProps & { time: TimeRef })')
scene = scene.replace('  const sphere = useRef<Mesh>(null)\n  const surface = useMemo(() => {', `  const sphere = useRef<Mesh>(null)
  const gesture = useSurfaceGesture({ target: ALBUM_TARGET, navigation, onInspect: () => navigation.focus(ALBUM_TARGET), onToggle: onToggleTarget, inspectOnClick: toolsVisible })
  const surface = useMemo(() => {`)
scene = scene.replace('if (sphere.current) sphere.current.rotation.y = Math.sin(time.current * galaxy.star.rotationSpeed) * 0.028', 'if (sphere.current) { sphere.current.rotation.y = Math.sin(time.current * galaxy.star.rotationSpeed) * 0.028 + gesture.rotation.current.yaw; sphere.current.rotation.x = gesture.rotation.current.pitch }')
scene = scene.replace('<mesh ref={sphere} scale={radius} material={surface} name="album-cover-surface">', `<mesh ref={sphere} scale={radius} material={surface} name="album-cover-surface" {...gesture.handlers}
      onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = navigation.viewRef.current.mode === 'focus' ? 'grab' : 'pointer' }}
      onPointerOut={() => { if (document.body.style.cursor !== 'grabbing') document.body.style.cursor = '' }}>`)
scene = scene.replace('  const radius = galaxy.star.scale\n  return <group', '  const radius = galaxy.star.scale\n  return <group')
scene = scene.replace('    <mesh scale={radius * 1.025}', '    {pulseTarget === ALBUM_TARGET && <PlaybackHalo radius={radius} time={time} playing={playing} />}\n    <mesh scale={radius * 1.025}')
scene = scene.replace('function Planet({ planet, selected, onSelect, time }: { planet: GalaxyPlanet; selected: boolean; onSelect: () => void; time: TimeRef })', 'function Planet({ planet, selected, onSelect, time, navigation, onToggleTarget, pulseTarget, playing, toolsVisible }: { planet: GalaxyPlanet; selected: boolean; onSelect: () => void; time: TimeRef; navigation: GalaxyNavigation; onToggleTarget: (target: string) => void; pulseTarget: string | null; playing: boolean; toolsVisible: boolean })')
scene = scene.replace("  const [hovered, setHovered] = useState(false)", "  const [hovered, setHovered] = useState(false)\n  const gesture = useSurfaceGesture({ target: planet.id, navigation, onInspect: onSelect, onToggle: onToggleTarget, inspectOnClick: toolsVisible })")
scene = scene.replace('sphere.current.rotation.y = time.current * planet.rotationSpeed + planet.phase; sphere.current.rotation.z = 0.14', 'sphere.current.rotation.y = time.current * planet.rotationSpeed + planet.phase + gesture.rotation.current.yaw; sphere.current.rotation.x = gesture.rotation.current.pitch; sphere.current.rotation.z = 0.14')
scene = scene.replace('<mesh ref={sphere} material={surface} onClick={(event) => { event.stopPropagation(); onSelect() }}', '<mesh ref={sphere} material={surface} {...gesture.handlers}')
scene = scene.replace("setHovered(true); document.body.style.cursor = 'pointer'", "setHovered(true); document.body.style.cursor = navigation.viewRef.current.mode === 'focus' ? 'grab' : 'pointer'")
scene = scene.replace("onPointerOut={() => { setHovered(false); document.body.style.cursor = '' }}", "onPointerOut={() => { setHovered(false); if (document.body.style.cursor !== 'grabbing') document.body.style.cursor = '' }}")
scene = scene.replace('      <Moons planet={planet} time={time} />', '      <Moons planet={planet} time={time} />\n      {pulseTarget === planet.id && <PlaybackHalo radius={1} time={time} playing={playing} />}')
scene = scene.replace('function SceneLabels({ galaxy, album, selectedId, onSelect, labels }:', 'function SceneLabels({ galaxy, album, selectedId, onSelect, labels, navigation }:')
scene = scene.replace('  return <div className="scene-label-layer">', "  const overview = navigation.view.mode === 'overview'\n  const visiblePlanets = overview ? galaxy.planets : galaxy.planets.filter((planet) => planet.id === navigation.view.target)\n  return <div className={`scene-label-layer ${overview ? '' : 'focus-label-layer'}`}>")
scene = scene.replace("    <div ref={labelRef('star')} className=\"star-caption\">", "    {(overview || navigation.view.target === ALBUM_TARGET) && <div ref={labelRef('star')} className=\"star-caption\">")
scene = scene.replace('<span>{album.artist}</span></div></div>', '<span>{album.artist}</span></div></div>}')
scene = scene.replace("    <div ref={labelRef('flight')} className=\"flight-caption\">", "    {overview && <div ref={labelRef('flight')} className=\"flight-caption\">")
scene = scene.replace('来自音乐大厅的旅伴</span></div>', '来自音乐大厅的旅伴</span></div>}')
scene = scene.replace("    <div ref={labelRef('hall-gate')} className=\"hall-gate-caption\">", "    {overview && <div ref={labelRef('hall-gate')} className=\"hall-gate-caption\">")
scene = scene.replace('音乐大厅 ↗</a></div>', '音乐大厅 ↗</a></div>}')
scene = scene.replace('{galaxy.planets.map((planet) => <div key={planet.id} className="label-pair">', '{visiblePlanets.map((planet) => <div key={planet.id} className="label-pair">')
scene = scene.replace('title={planet.title} aria-label=', 'data-scene-target={planet.id} title={planet.title} aria-label=')
const contentsStart = scene.indexOf('function Contents(')
const contentsEnd = scene.indexOf('class SceneBoundary ')
scene = scene.slice(0, contentsStart) + `function Contents(props: SceneProps & { onReady: () => void; labels: LabelRefs }) {
  const { galaxy, selectedId, onSelect, playing, quality, navigation, onToggleTarget, pulseTarget, toolsVisible, onReady, labels } = props
  const time = useRef(0)
  const world = useRef<Group>(null)
  const browsing = navigation.view.mode === 'overview' || navigation.view.transitioning
  return <>
    <SimulationClock playing={playing} time={time} />
    <RenderQualityController quality={quality} playing={playing} />
    <ambientLight intensity={0.45} color="#9caed1" />
    <directionalLight position={[-8, 8, 10]} intensity={2.4} color="#ffe3b0" />
    <directionalLight position={[8, -3, 5]} intensity={1.1} color="#7b9bcf" />
    <Environment resolution={128} frames={1} environmentIntensity={0.45}>
      <Lightformer form="rect" intensity={2.5} color="#ffe1b1" position={[-8, 6, 8]} scale={[12, 5, 1]} />
      <Lightformer form="rect" intensity={1.8} color="#8caee9" position={[8, 3, -6]} rotation={[0, Math.PI, 0]} scale={[10, 10, 1]} />
      <Lightformer form="ring" intensity={0.6} color="#eec48c" position={[0, -6, 6]} scale={8} />
    </Environment>
    <ImmersiveBackground seed={galaxy.backgroundSeed} time={time} />
    <WorldMotion world={world} time={time} playing={playing} planetCount={galaxy.planets.length} navigation={navigation}>
      <group visible={browsing || navigation.view.target === ALBUM_TARGET}><AlbumStar {...props} time={time} /></group>
      {galaxy.planets.map((planet) => <group key={planet.id} visible={browsing || navigation.view.target === planet.id}>
        <Planet planet={planet} selected={selectedId === planet.id} onSelect={() => onSelect(planet.id)} time={time} navigation={navigation} onToggleTarget={onToggleTarget} pulseTarget={pulseTarget} playing={playing} toolsVisible={toolsVisible} />
      </group>)}
      <group visible={browsing}><HallGate /><FlightPath galaxy={galaxy} time={time} /></group>
    </WorldMotion>
    <CameraDirector galaxy={galaxy} navigation={navigation} world={world} onReady={onReady} />
    <ProjectLabels galaxy={galaxy} labels={labels} world={world} />
    <SceneDiagnostics galaxy={galaxy} world={world} playing={playing} toolsVisible={toolsVisible} />
    <EffectComposer multisampling={0}><Bloom luminanceThreshold={1.2} intensity={0.55} mipmapBlur /></EffectComposer>
  </>
}

` + scene.slice(contentsEnd)
scene = scene.replace('    <Canvas key="fullscreen-perspective-v2"', '    <Canvas key="orbit-direct-interaction-v3"')
scene = scene.replace('      onPointerMissed={() => props.onSelect(null)}', `      onCreated={({ gl }) => { gl.domElement.tabIndex = 0; gl.domElement.setAttribute('aria-label', '音乐星系，滚轮缩放，拖动星球，双击控制动画') }}`)
await fs.writeFile(path.join(stage,'components/GalaxyScene.tsx.txt'),scene)
let css = await fs.readFile(path.join(app,'src/styles.css'),'utf8')
css += `
/* The reference uses direct scene gestures; tools remain one key away. */
.restore-hud{width:43px;height:43px;padding:0;justify-content:center;gap:4px;border-color:#a8bdcf1c;background:#0a16234a;opacity:.38;transition:opacity .18s}
.restore-hud:hover,.restore-hud:focus-visible{opacity:1;background:#132234a8}.restore-hud>span{font-size:7px;color:#718697}.restore-hud>svg{width:14px}
.focus-label-layer .planet-caption{min-width:150px;max-width:230px}.focus-label-layer .planet-caption button{font-size:12px;line-height:1.6;color:#c8d4df}
.focus-label-layer .planet-number{font-size:10px}.focus-label-layer .star-caption strong{font-size:13px}
@media(max-width:620px){.restore-hud{width:34px;height:34px;bottom:20px;right:20px}.focus-label-layer .planet-caption{display:block;min-width:140px}.focus-label-layer .planet-caption button{font-size:10px}.focus-label-layer .planet-number{font-size:8px}.focus-label-layer .star-caption>div{width:200px}.focus-label-layer .star-caption strong{display:block;font-size:9px}.focus-label-layer .star-kind{font-size:6px}}
`
await fs.writeFile(path.join(stage,'styles.css.txt'),css)
for(const file of ['App.tsx','components/GalaxyScene.tsx','components/SceneInteraction.tsx','hooks/useGalaxyNavigation.ts','lib/galaxyNavigation.ts','styles.css']) {
  await fs.mkdir(path.dirname(path.join(app,'src',file)),{recursive:true})
  await fs.writeFile(path.join(app,'src',file), await fs.readFile(path.join(stage,file+'.txt')))
}
console.log('Installed reference-style scene navigation, surface dragging, wheel focus, double gestures and keyboard controls.')
