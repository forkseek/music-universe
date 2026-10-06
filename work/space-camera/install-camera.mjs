import { readFile, writeFile, copyFile } from 'node:fs/promises'
import path from 'node:path'
const root = 'C:/path/to/music-universe'
const stage = path.resolve('work/space-camera')
const read = file => readFile(path.join(root, file), 'utf8')
const write = (file, text) => writeFile(path.join(root, file), text, 'utf8')
await copyFile(path.join(stage, 'sceneInput.ts.txt'), path.join(root, 'src/lib/sceneInput.ts'))
let camera = await readFile(path.join(stage, 'CameraDirector.tsx.txt'), 'utf8')
camera = camera.replace('String(result.moving || backdropMoving)', 'String(result.moving || (!result.drifting && backdropMoving))')
camera = camera.replace("touches.clear(); releaseCapture(); motion.cancel(); pointerSeen = false; invalidate()", "touches.clear(); releaseCapture(); motion.cancel(); pointerSeen = false; canvas.style.cursor = ''; invalidate()")
let scene = await read('src/components/SceneInteraction.tsx')
scene = scene.replace("import { MathUtils, Vector3 } from 'three'", "import { MathUtils, Vector2, Vector3 } from 'three'\nimport type { PerspectiveCamera } from 'three'\nimport { SpaceCameraController } from '../lib/spaceCamera'\nimport { isSurfaceEvent, markSurfaceEvent } from '../lib/sceneInput'")
const start = scene.indexOf('export function CameraDirector(')
const end = scene.indexOf('/** Surface gestures', start)
if (start < 0 || end < 0) throw Error('CameraDirector boundaries missing')
scene = scene.slice(0, start) + camera + '\n\n' + scene.slice(end)
scene = scene.replace('onPointerDown: (event: ThreeEvent<PointerEvent>) => {\n      event.stopPropagation()', "onPointerDown: (event: ThreeEvent<PointerEvent>) => {\n      if (navigation.cameraModeRef.current === 'free') return\n      markSurfaceEvent(event.nativeEvent)\n      event.stopPropagation()")
scene = scene.replace('onClick: (event: ThreeEvent<MouseEvent>) => { event.stopPropagation();', "onClick: (event: ThreeEvent<MouseEvent>) => { if (navigation.cameraModeRef.current === 'free') return; event.stopPropagation();")
scene = scene.replace('onDoubleClick: (event: ThreeEvent<MouseEvent>) => {\n      event.stopPropagation()', "onDoubleClick: (event: ThreeEvent<MouseEvent>) => {\n      if (navigation.cameraModeRef.current === 'free') return\n      markSurfaceEvent(event.nativeEvent)\n      event.stopPropagation()")
await write('src/components/SceneInteraction.tsx', scene)
let nav = await read('src/hooks/useGalaxyNavigation.ts')
nav = nav.replace('  const pinching = useRef(false)', `  const pinching = useRef(false)
  const [cameraMode, cameraModeState] = useState<'orbit' | 'free'>('orbit')
  const cameraModeRef = useRef(cameraMode)
  const setCameraMode = useCallback((mode: 'orbit' | 'free') => { cameraModeRef.current = mode; cameraModeState(mode) }, [])
  const cameraActions = useRef<{ toggleFree: () => void; recenter: () => void; zoomFree: (pixels: number) => void } | null>(null)
  const projectAnchor = useRef<((view: GalaxyView, point: { x: number; y: number }) => [number, number] | undefined) | null>(null)
  const backdrop = useRef<HTMLDivElement>(null)`)
nav = nav.replace('  const zoomBy = useCallback', `  const reset = useCallback(() => { update({ ...initialGalaxyView(), target: viewRef.current.target }) }, [update])
  const zoomBy = useCallback`)
nav = nav.replace('    const current = viewRef.current\n    const element = host.current', "    if (cameraModeRef.current === 'free') { cameraActions.current?.zoomFree(pixels); return }\n    const current = viewRef.current\n    const element = host.current")
nav = nav.replace('    if (element && screenPoint) {', '    if (screenPoint && projectAnchor.current) anchor = projectAnchor.current(current, screenPoint)\n    if (!anchor && !projectAnchor.current && element && screenPoint) {')
nav = nav.replace('return { view, viewRef, pinching, focus, activate: focus, zoomBy }', 'return { view, viewRef, pinching, focus, activate: focus, zoomBy, reset, cameraMode, cameraModeRef, setCameraMode, cameraActions, projectAnchor, backdrop }')
await write('src/hooks/useGalaxyNavigation.ts', nav)
let galaxy = await read('src/components/GalaxyScene.tsx')
galaxy = galaxy.replace('<CameraDirector galaxy={galaxy} navigation={navigation} world={world} onReady={onReady} />', '<CameraDirector galaxy={galaxy} navigation={navigation} world={world} onReady={onReady} resetKey={props.resetKey} playing={playing} />')
galaxy = galaxy.replace('key="continuous-zoom-v4"', 'key="space-camera-v5"')
galaxy = galaxy.replace('音乐星系，滚轮缩放，拖动星球，双击控制动画', '音乐星系，滚轮缩放，拖动空白环绕镜头，拖动恒星旋转封面，R 自由镜头，K 回正')
await write('src/components/GalaxyScene.tsx', galaxy)
let bg = await read('src/components/ImmersiveBackground.tsx')
const nebulaStart = bg.indexOf('function Nebula(')
const nebulaEnd = bg.indexOf('function AsteroidBelt(', nebulaStart)
if (nebulaStart < 0 || nebulaEnd < 0) throw Error('Nebula boundaries missing')
bg = bg.slice(0, nebulaStart) + bg.slice(nebulaEnd)
bg = bg.replace('<Nebula time={time} />', '')
await write('src/components/ImmersiveBackground.tsx', bg)
let app = await read('src/App.tsx')
app = app.replace('  const selected = galaxy.planets.find', `  const openTools = () => { if (navigation.cameraModeRef.current === 'free') navigation.cameraActions.current?.recenter(); setHudVisible(true) }
  const toggleCamera = () => { setHudVisible(false); setTracksOpen(false); setHallOpen(false); setQualityOpen(false); navigation.cameraActions.current?.toggleFree() }
  const selected = galaxy.planets.find`)
app = app.replace("if (event.key.toLowerCase() === 'h') { setHudVisible((value) => !value); return }", "if (event.key.toLowerCase() === 'h') { if (hudVisible) setHudVisible(false); else openTools(); return }")
app = app.replace("      if (event.code === 'Escape') {", "      if (event.code === 'Escape') {\n        if (navigation.cameraModeRef.current === 'free') { event.preventDefault(); navigation.cameraActions.current?.recenter(); return }")
app = app.replace("      if (event.code === 'Space') {", "      if (event.code === 'KeyR') { event.preventDefault(); toggleCamera(); return }\n      if (event.code === 'KeyK') { event.preventDefault(); navigation.cameraActions.current?.recenter(); return }\n      if (navigation.cameraModeRef.current === 'free') return\n      if (event.code === 'Space') {")
app = app.replace('<div className="nebula-field" />', '<div ref={navigation.backdrop} className="space-motion-backdrop" aria-hidden="true" />')
app = app.replace('连续缩放星系。指向任意位置滚动或双指开合，平滑放大缩小；拖动星球旋转，双击或空格控制动画，左右方向键切换曲目，H 显示工具，Escape 返回音乐大厅。', '滚轮或双指开合连续缩放，拖动空白处环绕镜头，拖动恒星可 360 度旋转封面。R 进入自由镜头，WASD 移动，Shift 加速，Space 上升，Ctrl 下降，Q/E 倾斜；K 回正，H 显示工具。自由镜头下 Esc 回正，纯场景下 Esc 返回音乐大厅。')
app = app.replace('滚轮连续缩放 <span>·</span> 拖动星球 <span>·</span> 双击控制动画', '拖动空白环绕 <span>·</span> 滚轮缩放 <span>·</span> R 自由镜头 <span>·</span> K 回正')
app = app.replace('onClick={() => setHudVisible(true)}><Settings2', 'onClick={openTools}><Settings2')
app = app.replace('    {editing && <AlbumEditor', `    {!hudVisible && <button className={\`camera-mode-toggle \${navigation.cameraMode === 'free' ? 'active' : ''}\`} aria-label={navigation.cameraMode === 'free' ? '退出自由镜头' : '自由镜头'} aria-pressed={navigation.cameraMode === 'free'} title="自由镜头 · R" onClick={toggleCamera}><Crosshair size={15} /><span>R</span></button>}
    {navigation.cameraMode === 'free' && <><span className="free-camera-reticle" aria-hidden="true" /><div className="free-camera-hint" role="status"><strong>自由镜头</strong><p>鼠标转向 · WASD 移动 · Shift 加速<br />Space / Ctrl 升降 · Q / E 倾斜 · 滚轮变焦</p><button onClick={() => navigation.cameraActions.current?.recenter()}>返回星系视角 <span>K / Esc</span></button></div></>}
    {editing && <AlbumEditor`)
app = app.replace('滚轮或双指开合连续放大缩小，镜头平滑追随操作，可随时停下或反向。指针所在位置是缩放中心，拖动星球只旋转球体。', '滚轮或双指开合连续缩放。拖动空白处环绕镜头，松手后缓缓停下，背景随镜头产生视差和旋转。拖动恒星封面可 360° 转动，松手保留惯性，再次抓取即可制动。')
app = app.replace('双击星球或按空格控制场景动画，左右方向键按曲序切换。按 H 或点击右下角工具按钮显示控制台；再次按 H 隐藏。纯场景下按 Esc 返回音乐大厅。', 'R 切换自由镜头：鼠标转向，WASD 移动，Shift 加速，Space / Ctrl 升降，Q / E 倾斜，滚轮改变视角。K 或双击空白处平滑回正；自由镜头下 Esc 也可回正。星系视角下空格控制动画，H 显示工具，纯场景下 Esc 返回音乐大厅。')
await write('src/App.tsx', app)
const css = `
/* The source demo photograph sits behind the transparent 3D scene. */
.space-motion-backdrop{position:absolute;inset:-22%;background:#02040a url('/media/space-motion-background.png') center/cover no-repeat;transform:scale(1.08);transform-origin:center;will-change:transform;pointer-events:none;z-index:0}
.galaxy-viewport>div:has(>canvas){z-index:1}
.scene-vignette{background:linear-gradient(180deg,#02071155,transparent 30%,transparent 77%,#02071177);box-shadow:inset 0 0 120px 20px #01061040}
.camera-mode-toggle{position:absolute;bottom:26px;right:83px;z-index:15;width:43px;height:43px;display:flex;align-items:center;justify-content:center;gap:4px;border:1px solid #a8bdcf1c;border-radius:30px;background:#0a16234a;backdrop-filter:blur(15px);color:#9caebb;opacity:.5;transition:opacity .18s}
.camera-mode-toggle:hover,.camera-mode-toggle:focus-visible,.camera-mode-toggle.active{opacity:1;background:#132234a8}.camera-mode-toggle>span{font-size:7px;color:#a5b3bf}.camera-mode-toggle.active{color:#e3c994;border-color:#e3c99460}
.free-camera-hint{position:absolute;bottom:28px;left:50%;transform:translateX(-50%);z-index:14;text-align:center;color:#a4b2bc;pointer-events:none}.free-camera-hint>strong{font-size:10px;font-weight:400;letter-spacing:2px;color:#d7bc89}.free-camera-hint>p{font-size:9px;line-height:1.9;margin:9px 0 10px;white-space:nowrap}.free-camera-hint>button{font-size:9px;border:1px solid #d7bc8930;border-radius:20px;padding:8px 14px;background:#0b17266b;backdrop-filter:blur(12px);pointer-events:auto}.free-camera-hint>button>span{margin-left:10px;color:#d7bc89;font-size:8px}.free-camera-reticle{position:absolute;left:50%;top:50%;z-index:14;pointer-events:none;width:8px;height:8px;border:1px solid #d7bc8970;border-radius:50%;transform:translate(-50%,-50%)}
@media(max-width:620px){.camera-mode-toggle{width:34px;height:34px;bottom:20px;right:62px}.free-camera-hint{bottom:28px}.free-camera-hint>p{font-size:8px}}
`
await write('src/styles.css', (await read('src/styles.css')) + css)
console.log('Installed reference background and camera integration')
