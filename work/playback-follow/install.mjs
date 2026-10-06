import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2]
if (!root) throw new Error('Expected the existing Music Universe project')
const changes = new Map()
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n') }
function replace(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`Current source no longer matches: ${label}`)
  return text.replace(before, after)
}

let code = read('src/lib/galaxyNavigation.ts')
code = replace(code, "  /** Camera and look point share this center on the scene's Z=0 plane. */\n  center: [number, number]", "  /** Camera and look point share this center; depth is retained when a 3D lock is released. */\n  center: [number, number]\n  centerZ?: number", 'view depth')
changes.set('src/lib/galaxyNavigation.ts', code)

code = read('src/hooks/useGalaxyNavigation.ts')
code = replace(code, "import type { GalaxyView } from '../lib/galaxyNavigation'", "import type { GalaxyView } from '../lib/galaxyNavigation'\nimport type { CameraFollowTarget } from '../lib/spaceCamera'", 'follow point type')
code = replace(code, "/** 双击星球跟随过去时的相机距离：比整星系统览更近，让该星球成为画面主体。 */\nconst FOLLOW_ZOOM = 0.5\n\n", '', 'remove follow zoom snap')
code = replace(code, "  /** 双击星球后需要逐帧跟随的目标；由场景在每帧写入 followRef 对应星球的位置。 */\n  const followRef = useRef<string | null>(null)", "  const followRef = useRef<string | null>(null)\n  const followPointRef = useRef<CameraFollowTarget | null>(null)\n  const [followingTarget, setFollowingTarget] = useState<string | null>(null)\n  // A manual release stays in effect across pause/resume, track changes and album requests.\n  const [followEnabled, setFollowEnabled] = useState(true)\n  const lastResetKey = useRef(resetKey)", 'follow state')
code = replace(code, "const cameraActions = useRef<{ toggleFree: () => void; recenter: () => void; zoomFree: (pixels: number) => void } | null>(null)", "const cameraActions = useRef<{ toggleFree: () => void; recenter: () => void; zoomFree: (pixels: number) => void; getLookCenter: () => [number, number, number] } | null>(null)", 'release camera center')
code = replace(code, "  const reset = useCallback(() => { overview.current = false; hover.current = null; followRef.current = null; update({ ...initialGalaxyView(), target: viewRef.current.target }) }, [update])\n  /** 让主视角飞到目标星球：拉近到跟随距离，并由场景逐帧把相机中心贴在该星球上。 */\n  const follow = useCallback((target: string | null) => {\n    followRef.current = target\n    if (!target) return\n    const current = viewRef.current\n    const zoom = Math.min(current.zoom, FOLLOW_ZOOM)\n    if (zoom !== current.zoom) overview.current = overviewFor(overview.current, zoom)\n    update({ ...current, target, zoom })\n    onFocusRef.current(target)\n  }, [update])", `  const clearFollow = useCallback(() => {
    followRef.current = null
    followPointRef.current = null
    setFollowingTarget(null)
  }, [])
  const releaseFollow = useCallback(() => {
    if (followRef.current) {
      // Freeze the rendered look point, including Z, rather than jumping to the old view.
      const center = cameraActions.current?.getLookCenter()
      if (center) update({ ...viewRef.current, center: [center[0], center[1]], centerZ: center[2] })
    }
    clearFollow()
    setFollowEnabled(false)
  }, [clearFollow, update])
  const enableFollow = useCallback(() => { setFollowEnabled(true) }, [])
  const reset = useCallback(() => {
    releaseFollow(); overview.current = false; hover.current = null
    update({ ...initialGalaxyView(), target: viewRef.current.target })
  }, [releaseFollow, update])
  /** Acquire a planet smoothly without changing the user's chosen zoom distance. */
  const follow = useCallback((target: string | null) => {
    if (!target) { releaseFollow(); return }
    setFollowEnabled(true)
    if (followRef.current === target) return
    followRef.current = target
    followPointRef.current = null
    setFollowingTarget(target)
    update({ ...viewRef.current, target })
    onFocusRef.current(target)
  }, [releaseFollow, update])`, 'follow controls')
code = replace(code, "    if (screenPoint && projectAnchor.current)", "    // A locked planet remains the zoom/pinch center regardless of pointer position.\n    if (followRef.current) screenPoint = undefined\n    if (screenPoint && projectAnchor.current)", 'locked pinch')
code = replace(code, "    followRef.current = null\n    update(initialGalaxyView())\n    onFocusRef.current(ALBUM_TARGET)\n  }, [resetKey, update])", "    if (lastResetKey.current !== resetKey) releaseFollow()\n    else clearFollow()\n    lastResetKey.current = resetKey\n    update(initialGalaxyView())\n    onFocusRef.current(ALBUM_TARGET)\n  }, [resetKey, update, releaseFollow, clearFollow])", 'manual generation release')
code = replace(code, "follow, followRef, zoomBy, reset", "follow, followRef, followPointRef, followingTarget, followEnabled, enableFollow, releaseFollow, zoomBy, reset", 'navigation exports')
changes.set('src/hooks/useGalaxyNavigation.ts', code)

code = read('src/lib/spaceCamera.ts')
code = replace(code, "type Mode = 'orbit' | 'free'", "type Mode = 'orbit' | 'free'\n\nexport interface CameraFollowTarget { id: string; position: [number, number, number] }", 'target DTO')
code = replace(code, "const FOLLOW_IDLE_DELAY = 1.6", "const FOLLOW_IDLE_DELAY = 1.6\nconst TARGET_ACQUIRE_SECONDS = 0.8", 'smooth acquisition duration')
code = replace(code, "  private requestedCenter: Vector3", "  private requestedCenter: Vector3\n  private trackedId: string | null = null\n  private targetElapsed = 0\n  private readonly targetOffset = new Vector3()", 'tracking math state')
code = replace(code, "  recenter() {\n    this.cancel()", "  recenter() {\n    this.trackedId = null\n    this.targetElapsed = 0\n    this.cancel()", 'reset tracking')
code = replace(code, "update(seconds: number, view: GalaxyView, cinematic: boolean, reducedMotion: boolean, orbitalSeconds = seconds)", "update(seconds: number, view: GalaxyView, cinematic: boolean, reducedMotion: boolean, orbitalSeconds = seconds, followTarget?: CameraFollowTarget | null)", 'controller follow argument')
code = replace(code, "      center: [finite(view.center[0], this.framing.target[0]), finite(view.center[1], this.framing.target[1])],", "      center: [finite(view.center[0], this.framing.target[0]), finite(view.center[1], this.framing.target[1])],\n      centerZ: finite(view.centerZ ?? 0, 0),", '3D clean center')
code = replace(code, "    const zoomChanged = cleanView.zoom !== this.lastView.zoom", "    const target = followTarget?.id && followTarget.position.every(Number.isFinite) && this.mode === 'orbit' ? followTarget : null\n    if (target && this.reset) this.interruptReset()\n    const zoomChanged = cleanView.zoom !== this.lastView.zoom", 'valid target')
code = replace(code, "cleanView.center[1] !== this.lastView.center[1]\n", "cleanView.center[1] !== this.lastView.center[1] || cleanView.centerZ !== (this.lastView.centerZ ?? 0)\n", 'view depth change')
code = replace(code, "Math.abs(cleanView.center[1] - this.framing.target[1]) < 1e-10", "Math.abs(cleanView.center[1] - this.framing.target[1]) < 1e-10 && Math.abs(cleanView.centerZ ?? 0) < 1e-10", 'baseline depth')
code = replace(code, "    this.requestedCenter.set(cleanView.center[0], cleanView.center[1], 0)", "    this.requestedCenter.set(cleanView.center[0], cleanView.center[1], cleanView.centerZ ?? 0)", 'depth requested center')
code = replace(code, "    this.center.lerp(this.requestedCenter, zoomEase)", `    if (target) {
      this.requestedCenter.set(...target.position)
      if (this.trackedId !== target.id) {
        this.trackedId = target.id
        this.targetElapsed = 0
        this.targetOffset.copy(this.center).sub(this.requestedCenter)
        this.holdAutomaticMotion()
      }
      this.targetElapsed = Math.min(TARGET_ACQUIRE_SECONDS, this.targetElapsed + dt)
      const progress = reducedMotion ? 1 : this.targetElapsed / TARGET_ACQUIRE_SECONDS
      // Fade a fixed acquisition offset, rather than damping the moving target itself.
      // Once acquired, position and gaze use the same world-space planet point every frame.
      const remaining = 1 - progress * progress * (3 - 2 * progress)
      this.center.copy(this.requestedCenter).addScaledVector(this.targetOffset, remaining)
    } else {
      this.trackedId = null
      this.targetElapsed = 0
      this.center.lerp(this.requestedCenter, zoomEase)
    }`, 'tracking feedforward')
code = replace(code, "  getState() {", "  getLookCenter(): [number, number, number] { return [this.center.x, this.center.y, this.center.z] }\n\n  getState() {", 'release center getter')
code = replace(code, "      following: this.drifting && this.mode === 'orbit',", "      following: this.drifting && this.mode === 'orbit',\n      trackingTarget: this.mode === 'orbit' ? this.trackedId : null,\n      targetLocked: this.mode === 'orbit' && this.trackedId !== null && this.center.distanceTo(this.requestedCenter) < EPSILON,", 'tracking diagnostics')
code = replace(code, "  /** Intersect Z=0 using the requested pose rather than the camera still catching up to it. */", "  /** Intersect the look point's depth plane using the requested pose, independently of damping. */", 'anchor plane description')
code = replace(code, "this.framing.target[1]), 0)\n    const radius", "this.framing.target[1]), finite(view.centerZ ?? 0, 0))\n    const radius", 'anchor center depth')
code = replace(code, "    const distance = -this.anchorCamera.position.z / this.rayDirection.z", "    const distance = (center.z - this.anchorCamera.position.z) / this.rayDirection.z", 'anchor depth ray')
changes.set('src/lib/spaceCamera.ts', code)

code = read('src/components/SceneInteraction.tsx')
code = replace(code, "else { motion.toggleFree(); requestLock(); pointerSeen = false; invalidate() }", "else { navigation.releaseFollow(); motion.toggleFree(); requestLock(); pointerSeen = false; invalidate() }", 'free camera unlock')
code = replace(code, "{ toggleFree, recenter, zoomFree: (pixels) => { motion.zoomFree(pixels); invalidate() } }", "{ toggleFree, recenter, zoomFree: (pixels) => { motion.zoomFree(pixels); invalidate() }, getLookCenter: () => motion.getLookCenter() }", 'expose rendered center')
code = replace(code, "[motion, navigation.cameraActions, navigation.projectAnchor, navigation.reset, navigation.pinching,", "[motion, navigation.cameraActions, navigation.projectAnchor, navigation.reset, navigation.releaseFollow, navigation.pinching,", 'input dependencies')
code = replace(code, "    const result = motion.update(Math.min(delta, 0.08), view, playing && !toolsVisible, reduced, orbitalDelta)\n    const state = motion.getState()", `    const target = navigation.followPointRef.current
    const result = motion.update(Math.min(delta, 0.08), view, playing && !toolsVisible, reduced, orbitalDelta, target)
    const state = motion.getState()
    const center = motion.getLookCenter()
    if (state.trackingTarget) {
      view.center[0] = center[0]; view.center[1] = center[1]; view.centerZ = center[2]
    }
    gl.domElement.dataset.cameraFollowTarget = state.trackingTarget ?? ''
    gl.domElement.dataset.cameraTargetLocked = String(state.targetLocked)
    gl.domElement.dataset.cameraLookCenter = JSON.stringify(center)
    gl.domElement.dataset.followPlanetPosition = target ? JSON.stringify(target.position) : ''`, 'director target integration')
const start = code.indexOf('export function CameraFollow(')
const end = code.indexOf('\nexport function PlaybackHalo', start)
if (start < 0 || end < 0) throw new Error('CameraFollow source boundaries missing')
// Retain surrounding source and all other scene gestures.
code = code.slice(0, start) + `export function CameraFollow({ navigation, world, galaxy, positions }: { navigation: GalaxyNavigation; world: WorldRef; galaxy: AlbumGalaxy; positions: Vector3[] }) {
  const { invalidate } = useThree()
  const point = useMemo(() => new Vector3(), [])
  useFrame(() => {
    const target = navigation.followRef.current
    const index = target ? galaxy.planets.findIndex(planet => planet.id === target) : -1
    if (!target || index < 0 || !world.current || navigation.cameraModeRef.current === 'free') {
      navigation.followPointRef.current = null
      return
    }
    // SimulationClock (-1) and WorldMotion (-0.75) run before this sample.
    // Include galaxy rotation, tilt, orbit depth and parent transforms.
    world.current.updateWorldMatrix(true, false)
    point.copy(positions[index])
    world.current.localToWorld(point)
    const previous = navigation.followPointRef.current
    const changed = !previous || previous.id !== target || point.distanceToSquared(new Vector3(...previous.position)) > 1e-12
    if (!previous || previous.id !== target) navigation.followPointRef.current = { id: target, position: [point.x, point.y, point.z] }
    else { previous.position[0] = point.x; previous.position[1] = point.y; previous.position[2] = point.z }
    if (changed) invalidate()
  }, -0.6)
  return null
}
` + code.slice(end)
code = replace(code, "/**\n * 双击星球后的", "/**\n * 播放歌曲后的", 'follow documentation prefix')
changes.set('src/components/SceneInteraction.tsx', code)

code = read('src/components/GalaxyScene.tsx')
code = replace(code, "<CameraFollow navigation={navigation} world={world} galaxy={galaxy} positions={positions} playing={playing} />", "<CameraFollow navigation={navigation} world={world} galaxy={galaxy} positions={positions} />", 'follow paused scene too')
changes.set('src/components/GalaxyScene.tsx', code)

code = read('src/App.tsx')
code = replace(code, "import './album-sync.css'", "import './album-sync.css'\nimport './playback-follow.css'", 'follow UI styles')
code = replace(code, "    navigation.followRef.current = null\n    navigation.focus(value.planetId)", "    navigation.focus(value.planetId)", 'keep album playback lock')
code = replace(code, "  const openTools = () =>", `  const playingPlanet = galaxy.planets.find(planet => planet.id === audio.track?.planetId)
  // Real playback, including search, queue and imported audio, activates the same camera path.
  // Album resolution updates planetId asynchronously; manual release is never overridden by it.
  useEffect(() => {
    if (audio.playing && playingPlanet && navigation.followEnabled && navigation.cameraMode === 'orbit') navigation.follow(playingPlanet.id)
  }, [audio.playing, audio.track?.playbackInstance, playingPlanet?.id, galaxy, navigation.followEnabled, navigation.cameraMode, navigation.follow])
  const toggleFollow = () => {
    if (navigation.followingTarget || (navigation.followEnabled && albumSync.status === 'loading')) navigation.releaseFollow()
    else if (playingPlanet) {
      if (navigation.cameraModeRef.current === 'free') navigation.cameraActions.current?.recenter()
      navigation.follow(playingPlanet.id)
    }
  }
  const openTools = () =>`, 'automatic playback follower')
code = replace(code, "    navigation.follow(target)\n    setPulseTarget(target)", "    navigation.enableFollow(); navigation.focus(target)\n    setPulseTarget(target)", 'double click real playback follow')
code = replace(code, "  // 从播放队列里点选一首：只切换播放与高亮，不动镜头，避免打断正在进行的沉浸浏览。", "  // 所有播放入口共用自动跟随；手动解除后，切歌也保留用户的自由浏览选择。", 'queue behavior documentation')
code = replace(code, "      if (event.code === 'KeyR')", "      if (event.code === 'KeyL' && audio.track) { event.preventDefault(); toggleFollow(); return }\n      if (event.code === 'KeyR')", 'keyboard unlock')
code = replace(code, "    {!hudVisible && <button className=\"restore-hud\"", `    {audio.track && <button type="button" className={\x60planet-follow-control \x24{navigation.followingTarget ? 'is-following' : ''}\x60} data-testid="planet-follow-control"
      aria-label={navigation.followingTarget || (navigation.followEnabled && albumSync.status === 'loading') ? '解除跟随' : '跟随当前歌曲'}
      aria-pressed={!!navigation.followingTarget} disabled={!playingPlanet && !(navigation.followEnabled && albumSync.status === 'loading')}
      title="镜头跟随 / 解除 · L" onClick={toggleFollow}>
      <Crosshair size={16} aria-hidden="true" /><span><strong>{navigation.followingTarget || (navigation.followEnabled && albumSync.status === 'loading') ? '解除跟随' : '跟随当前歌曲'}</strong><small>{audio.track.title}</small></span><kbd>L</kbd>
    </button>}
    {!hudVisible && <button className="restore-hud"`, 'visible unlock control')
code = replace(code, "星系视角下空格控制动画，H 显示工具", "播放后镜头会平滑跟随歌曲星球，始终注视它；滚轮缩放和拖动环绕仍可使用。点击「解除跟随」或按 L 自由浏览，再点击可恢复。星系视角下空格控制播放，H 显示工具", 'guide follow instructions')
changes.set('src/App.tsx', code)

changes.set('src/playback-follow.css', `.planet-follow-control{position:absolute;right:30px;bottom:84px;z-index:18;display:flex;align-items:center;gap:10px;max-width:260px;padding:10px 13px;border:1px solid #95adbf30;border-radius:12px;background:#081321b5;backdrop-filter:blur(18px);color:#b5c6d3;text-align:left;cursor:pointer;transition:background .2s,border-color .2s,opacity .2s;}
.planet-follow-control.is-following{border-color:#d6b88054;color:#e1c896;}
.planet-follow-control:hover{background:#122238e8;border-color:#d6b88080;}
.planet-follow-control:focus-visible{outline:2px solid #e1c896;outline-offset:4px;}
.planet-follow-control:disabled{opacity:.45;cursor:default;}
.planet-follow-control>svg{flex-shrink:0;}
.planet-follow-control>span{display:flex;flex-direction:column;gap:3px;min-width:0;}
.planet-follow-control strong{font-size:11px;font-weight:500;letter-spacing:.4px;}
.planet-follow-control small{font-size:9px;line-height:1.4;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#91a5b8;}
.planet-follow-control kbd{flex-shrink:0;margin-left:8px;border:1px solid #a0b4c529;border-radius:4px;padding:2px 4px;color:#8399ad;font-family:inherit;font-size:8px;}
@media(max-width:620px){.planet-follow-control{right:20px;bottom:70px;max-width:190px;gap:8px;padding:8px 10px;}.planet-follow-control small{max-width:115px;}.planet-follow-control strong{font-size:10px;}.planet-follow-control kbd{display:none;}}
`)

for (const [file, content] of changes) {
  const destination = path.join(root, file)
  if (fs.existsSync(destination)) {
    const backup = path.join(import.meta.dirname, 'before', file)
    fs.mkdirSync(path.dirname(backup), { recursive: true })
    fs.copyFileSync(destination, backup)
  }
  fs.writeFileSync(destination, content, 'utf8')
  console.log(`Updated ${file}`)
}
