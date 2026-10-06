import fs from 'node:fs/promises'
import path from 'node:path'

const app = 'C:/path/to/music-universe'
const stage = path.resolve('work/fullscreen-universe/src')
const previous = path.resolve('work/fullscreen-universe/previous')
await fs.mkdir(previous, { recursive: true })
let scene = (await fs.readFile(path.join(app, 'src/components/GalaxyScene.tsx'), 'utf8')).replaceAll('\r\n', '\n')
const styles = await fs.readFile(path.join(app, 'src/styles.css'), 'utf8')
for (const file of ['App.tsx', 'styles.css', 'components/GalaxyScene.tsx']) {
  await fs.mkdir(path.dirname(path.join(previous, `${file}.txt`)), { recursive: true })
  await fs.writeFile(path.join(previous, `${file}.txt`), await fs.readFile(path.join(app, 'src', file)))
}
scene = scene.replace("import { Line, OrbitControls, useTexture } from '@react-three/drei'", "import { Environment, Lightformer, Line, OrbitControls, PerformanceMonitor, useTexture } from '@react-three/drei'")
scene = scene.replace('AdditiveBlending, BufferGeometry, CatmullRomCurve3, CanvasTexture, Float32BufferAttribute, Group, Mesh, SRGBColorSpace, Vector3', 'AdditiveBlending, CatmullRomCurve3, CanvasTexture, Group, MathUtils, Mesh, PerspectiveCamera, SRGBColorSpace, Vector3')
scene = scene.replace('GALAXY_TEMPLATE, mulberry32', 'GALAXY_TEMPLATE')
scene = scene.replace("import { MUSIC_HALL_URL }", "import ImmersiveBackground from './ImmersiveBackground'\nimport { getGalaxyFraming } from '../lib/sceneFraming'\nimport type { RenderQuality } from '../lib/sceneFraming'\nimport { MUSIC_HALL_URL }")
scene = scene.replace('  generation: number\n}', '  generation: number\n  quality: RenderQuality\n}')
const framingStart = scene.indexOf('function Framing(')
const framingEnd = scene.indexOf('function AlbumStar(')
if (framingStart < 0 || framingEnd < 0) throw Error('Framing source was not found')
scene = scene.slice(0, framingStart) + `function Framing({ resetKey, planetCount, onReady }: { resetKey: number; planetCount: number; onReady: () => void }) {
  const { camera, size, gl, invalidate } = useThree()
  const controls = useRef<OrbitControlsImpl>(null)
  const framing = useMemo(() => getGalaxyFraming(size.width, size.height, planetCount), [size.width, size.height, planetCount])
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    camera.fov = framing.fov
    camera.position.set(framing.target[0], framing.target[1], framing.distance)
    camera.up.set(0, 1, 0)
    camera.lookAt(...framing.target)
    camera.updateProjectionMatrix()
    controls.current?.target.set(...framing.target)
    controls.current?.update()
    gl.domElement.dataset.projection = 'perspective'
    invalidate()
    onReady()
  }, [camera, framing, resetKey, onReady, gl, invalidate])
  return <OrbitControls ref={controls} camera={camera} domElement={gl.domElement} makeDefault enablePan={false}
    enableDamping dampingFactor={0.09} rotateSpeed={0.22} zoomSpeed={0.3}
    minAzimuthAngle={-framing.yaw} maxAzimuthAngle={framing.yaw}
    minPolarAngle={Math.PI / 2 - framing.pitch} maxPolarAngle={Math.PI / 2 + framing.pitch}
    minDistance={framing.minDistance} maxDistance={framing.maxDistance} />
}

function RenderQualityController({ quality }: { quality: RenderQuality }) {
  const { gl, setDpr, invalidate, size } = useThree()
  const ceiling = Math.min(window.devicePixelRatio || 1, size.width < 700 ? 1.2 : 1.75)
  const applyFactor = useCallback((factor: number) => {
    const dpr = Math.min(ceiling, 0.65 + factor * 1.1)
    setDpr(dpr)
    gl.domElement.dataset.renderDpr = dpr.toFixed(2)
    invalidate()
  }, [ceiling, gl, setDpr, invalidate])
  useEffect(() => {
    const factor = quality === 'low' ? 0.15 : quality === 'high' ? 1 : 0.6
    applyFactor(factor)
  }, [quality, applyFactor])
  return quality === 'auto' ? <PerformanceMonitor ms={350} iterations={6} threshold={0.65} step={0.15} factor={0.6}
    bounds={() => [30, 55]} flipflops={3} onChange={({ factor }) => applyFactor(factor)} onFallback={() => applyFactor(0.2)} /> : null
}

type WorldRef = RefObject<Group | null>

function WorldMotion({ world, time, playing, planetCount, children }: { world: WorldRef; time: TimeRef; playing: boolean; planetCount: number; children: ReactNode }) {
  const { pointer } = useThree()
  useFrame((_, delta) => {
    if (!playing || !world.current) return
    const limit = planetCount > 20 ? 0.3 : 1
    const x = (0.018 + pointer.y * 0.012 + Math.sin(time.current * 0.15) * 0.006) * limit
    const y = (-0.025 + pointer.x * 0.035) * limit
    world.current.rotation.x = MathUtils.damp(world.current.rotation.x, x, 3, Math.min(delta, 0.06))
    world.current.rotation.y = MathUtils.damp(world.current.rotation.y, y, 3, Math.min(delta, 0.06))
  })
  return <group ref={world} name="album-solar-system" rotation={[0.018, -0.025, 0]}>{children}</group>
}

` + scene.slice(framingEnd)
scene = scene.replace('function ProjectLabels({ galaxy, labels }: { galaxy: AlbumGalaxy; labels: LabelRefs })', 'function ProjectLabels({ galaxy, labels, world }: { galaxy: AlbumGalaxy; labels: LabelRefs; world: WorldRef })')
scene = scene.replace("{ key: `\${planet.id}-number`, position: new Vector3(planet.position[0], planet.position[1] + planet.scale + 0.65, planet.position[2]) }", "{ key: `\${planet.id}-number`, position: new Vector3(planet.position[0], planet.position[1] + planet.scale + 0.65, planet.position[2]), center: new Vector3(...planet.position) }")
scene = scene.replace('    for (const node of nodes) {', '    world.current?.updateMatrixWorld(true)\n    for (const node of nodes) {')
scene = scene.replace('      projected.copy(node.position).project(camera)', '      projected.copy(node.position)\n      world.current?.localToWorld(projected)\n      projected.project(camera)')
scene = scene.replace('      if (node.key.endsWith(\'-title\')) {', `      if ('center' in node && node.center) {
        projected.copy(node.center)
        world.current?.localToWorld(projected)
        projected.project(camera)
        element.dataset.centerX = String((projected.x * 0.5 + 0.5) * size.width)
        element.dataset.centerY = String((-projected.y * 0.5 + 0.5) * size.height)
      }
      if (node.key.endsWith('-title')) {`)
scene = scene.replace('/ galaxy.bounds.width', '/ getGalaxyFraming(size.width, size.height, galaxy.planets.length).viewWidth')
const contentsStart = scene.indexOf('function Contents(')
const contentsEnd = scene.indexOf('class SceneBoundary ')
scene = scene.slice(0, contentsStart) + `function Contents({ galaxy, selectedId, onSelect, playing, resetKey, quality, onReady, labels }: SceneProps & { onReady: () => void; labels: LabelRefs }) {
  const time = useRef(0)
  const world = useRef<Group>(null)
  return <>
    <SimulationClock playing={playing} time={time} />
    <RenderQualityController quality={quality} />
    <ambientLight intensity={0.45} color="#9caed1" />
    <directionalLight position={[-8, 8, 10]} intensity={2.4} color="#ffe3b0" />
    <directionalLight position={[8, -3, 5]} intensity={1.1} color="#7b9bcf" />
    <Environment resolution={128} frames={1} environmentIntensity={0.45}>
      <Lightformer form="rect" intensity={2.5} color="#ffe1b1" position={[-8, 6, 8]} scale={[12, 5, 1]} />
      <Lightformer form="rect" intensity={1.8} color="#8caee9" position={[8, 3, -6]} rotation={[0, Math.PI, 0]} scale={[10, 10, 1]} />
      <Lightformer form="ring" intensity={0.6} color="#eec48c" position={[0, -6, 6]} scale={8} />
    </Environment>
    <ImmersiveBackground seed={galaxy.backgroundSeed} time={time} />
    <WorldMotion world={world} time={time} playing={playing} planetCount={galaxy.planets.length}>
      <AlbumStar galaxy={galaxy} time={time} />
      {galaxy.planets.map((planet) => <Planet key={planet.id} planet={planet} selected={selectedId === planet.id} onSelect={() => onSelect(planet.id)} time={time} />)}
      <HallGate />
      <FlightPath galaxy={galaxy} time={time} />
    </WorldMotion>
    <Framing resetKey={resetKey} planetCount={galaxy.planets.length} onReady={onReady} />
    <ProjectLabels galaxy={galaxy} labels={labels} world={world} />
    <EffectComposer multisampling={0}><Bloom luminanceThreshold={1.2} intensity={0.55} mipmapBlur /></EffectComposer>
  </>
}

` + scene.slice(contentsEnd)
scene = scene.replace('  const [readyGeneration,', "  const [visible, setVisible] = useState(() => !document.hidden)\n  useEffect(() => {\n    const updateVisibility = () => setVisible(!document.hidden)\n    document.addEventListener('visibilitychange', updateVisibility)\n    return () => document.removeEventListener('visibilitychange', updateVisibility)\n  }, [])\n  const moving = props.playing && visible\n  const [readyGeneration,")
scene = scene.replace("<Canvas frameloop={props.playing ? 'always' : 'demand'} orthographic camera={{ position: [0, 0, 45], near: 0.1, far: 160, zoom: 35 }}", "<Canvas key=\"fullscreen-perspective-v2\" frameloop={moving ? 'always' : 'demand'} camera={{ position: [0, -0.65, 34], fov: 36, near: 0.1, far: 400 }}")
scene = scene.replace('<Contents key={props.generation} {...props} onReady=', '<Contents key={props.generation} {...props} playing={moving} onReady=')
await fs.writeFile(path.join(stage, 'components/GalaxyScene.tsx.txt'), scene)

let css = await fs.readFile(path.join(stage, 'styles.css.txt'), 'utf8')
const dialogStart = styles.indexOf('.editor-dialog{')
const dialogEnd = styles.indexOf('@media(min-width:1700px)')
if (dialogStart < 0 || dialogEnd < 0) throw Error('Retained dialog styles were not found')
css = css.replace('__RETAIN_DIALOG_STYLES__', styles.slice(dialogStart, dialogEnd))
await fs.writeFile(path.join(stage, 'styles.css.txt'), css)
const backgroundPath = path.join(stage, 'components/ImmersiveBackground.tsx.txt')
let background = await fs.readFile(backgroundPath, 'utf8')
background = background.replace('smoothstep(0.5,0.22,r)', '(1.0 - smoothstep(0.22,0.5,r))')
await fs.writeFile(backgroundPath, background)
for (const file of ['App.tsx', 'styles.css', 'components/GalaxyScene.tsx', 'components/ImmersiveBackground.tsx', 'lib/sceneFraming.ts']) {
  await fs.writeFile(path.join(app, 'src', file), await fs.readFile(path.join(stage, `${file}.txt`)))
}
console.log('Installed full-screen UI, perspective framing, layered background and render quality controls.')
