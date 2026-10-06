import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const app = 'C:/path/to/music-universe'
function replaceOnce(source, before, after) {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Unexpected source near ${before.slice(0, 80)}`)
  return source.replace(before, after)
}
async function edit(file, transform) {
  const fullPath = path.join(app, file)
  const source = (await readFile(fullPath, 'utf8')).replaceAll('\r\n', '\n')
  await writeFile(fullPath, transform(source), 'utf8')
  console.log(`Updated ${file}`)
}

await edit('src/lib/spaceCamera.ts', source => {
  source = replaceOnce(source, 'const EPSILON = 0.00005', 'const EPSILON = 0.00005\nconst FOLLOW_IDLE_DELAY = 1.6')
  source = replaceOnce(source, '  private cinemaTime = 0', `  private cinemaTime = 0
  private followPhase = 0
  private followSpeed = 0
  private requestedFollowSpeed = 0.0045
  private followDelay = 0`)
  source = replaceOnce(source, '  beginDrag() {', `  /** A small fraction of the actual orbital rate keeps the camera unhurried. */
  setOrbitFollowSpeed(orbitalAngularVelocity: number) {
    this.requestedFollowSpeed = clamp(Math.abs(finite(orbitalAngularVelocity, 0.075)) * 0.06, 0.003, 0.0075)
  }

  holdAutomaticMotion() {
    this.followDelay = FOLLOW_IDLE_DELAY
    this.followSpeed = 0
  }

  beginDrag() {`)
  source = replaceOnce(source, '    this.dragging = true', '    this.holdAutomaticMotion()\n    this.dragging = true')
  source = replaceOnce(source, '  recenter() {\n    this.cancel()', '  recenter() {\n    this.cancel()\n    this.holdAutomaticMotion()')
  source = replaceOnce(source, '  update(seconds: number, view: GalaxyView, cinematic: boolean, reducedMotion: boolean) {', '  update(seconds: number, view: GalaxyView, cinematic: boolean, reducedMotion: boolean, orbitalSeconds = seconds) {')
  source = replaceOnce(source, '    const zooming = zoomChanged || Math.abs(this.radius - desiredRadius) > EPSILON', `    const zooming = zoomChanged || Math.abs(this.radius - desiredRadius) > EPSILON
    if (zoomChanged || this.dragging) this.holdAutomaticMotion()
    this.followDelay = Math.max(0, this.followDelay - dt)`)
  source = replaceOnce(source, `    if (reducedMotion) {
      this.cinemaTheta = this.cinemaPhi = this.cinemaRadius = 0
    } else if (cinematic && !zooming) {`, `    const following = cinematic && !reducedMotion && !zooming && !this.moving && this.followDelay === 0
    if (reducedMotion) {
      this.followPhase = this.followSpeed = 0
      this.cinemaTheta = this.cinemaPhi = this.cinemaRadius = 0
    } else if (following) {`)
  source = replaceOnce(source, '      this.cinemaTime += dt', `      const orbitStep = clamp(finite(orbitalSeconds, dt), 0, 0.12)
      this.cinemaTime += orbitStep
      const speedDecay = Math.exp(-2.4 * orbitStep)
      // Integrate the speed ramp analytically so low and high frame rates agree.
      this.followPhase += this.requestedFollowSpeed * orbitStep + (this.followSpeed - this.requestedFollowSpeed) * (1 - speedDecay) / 2.4
      this.followSpeed = this.requestedFollowSpeed + (this.followSpeed - this.requestedFollowSpeed) * speedDecay`)
  source = replaceOnce(source, 'Math.sin(this.cinemaTime * 0.08) * 0.012 * attenuation', '(this.followPhase + Math.sin(this.cinemaTime * 0.08) * 0.004) * attenuation')
  source = replaceOnce(source, '    this.drifting = cinematic && !reducedMotion && !zooming', '    this.drifting = following')
  source = replaceOnce(source, '      drifting: this.drifting,', `      drifting: this.drifting,
      followPhase: this.followPhase,
      followSpeed: this.followSpeed,
      following: this.drifting && this.mode === 'orbit',`)
  source = replaceOnce(source, `    this.cinemaTheta = this.cinemaPhi = this.cinemaRadius = 0
  }

  private updateReset`, `    this.followPhase = this.followSpeed = 0
    this.cinemaTheta = this.cinemaPhi = this.cinemaRadius = 0
  }

  private updateReset`)
  return replaceOnce(source, `      this.cinemaTheta = this.cinemaPhi = this.cinemaRadius = 0
      this.freeRoll = 0`, `      this.followPhase = this.followSpeed = 0
      this.cinemaTheta = this.cinemaPhi = this.cinemaRadius = 0
      this.freeRoll = 0`)
})

await edit('src/components/SceneInteraction.tsx', source => {
  source = replaceOnce(source, 'export function CameraDirector({ galaxy, navigation, resetKey, playing }: { galaxy: AlbumGalaxy; navigation: GalaxyNavigation; resetKey: number; playing: boolean }) {', 'export function CameraDirector({ galaxy, navigation, resetKey, playing, toolsVisible, orbitSpeed, time }: { galaxy: AlbumGalaxy; navigation: GalaxyNavigation; resetKey: number; playing: boolean; toolsVisible: boolean; orbitSpeed: number; time: TimeRef }) {')
  source = replaceOnce(source, '  const initialReset = useRef(true)', '  const initialReset = useRef(true)\n  const followClock = useRef(time.current)\n  useEffect(() => { motion.setOrbitFollowSpeed(orbitSpeed) }, [motion, orbitSpeed])')
  source = replaceOnce(source, '  useEffect(() => { invalidate() }, [navigation.view, playing, invalidate])', '  useEffect(() => { invalidate() }, [navigation.view, playing, toolsVisible, invalidate])')
  source = replaceOnce(source, "      if (event.target !== canvas) return\n      if (event.pointerType === 'touch')", "      if (event.target !== canvas) return\n      motion.holdAutomaticMotion()\n      if (event.pointerType === 'touch')")
  source = replaceOnce(source, '    const move = (event: PointerEvent) => {\n      if (navigation.pinching.current', '    const move = (event: PointerEvent) => {\n      if (event.buttons || touches.size > 0) motion.holdAutomaticMotion()\n      if (navigation.pinching.current')
  source = replaceOnce(source, '    const result = motion.update(Math.min(delta, 0.08), view, playing, reduced)', `    const orbitalDelta = Math.max(0, time.current - followClock.current)
    followClock.current = time.current
    const result = motion.update(Math.min(delta, 0.08), view, playing && !toolsVisible, reduced, orbitalDelta)`)
  return replaceOnce(source, '    gl.domElement.dataset.cameraDrifting = String(result.drifting)', `    gl.domElement.dataset.cameraDrifting = String(result.drifting)
    gl.domElement.dataset.cameraAutoFollowing = String(state.following)
    gl.domElement.dataset.cameraFollowPhase = state.followPhase.toFixed(6)
    gl.domElement.dataset.cameraFollowSpeed = state.followSpeed.toFixed(6)`)
})

await edit('src/components/GalaxyScene.tsx', source => {
  source = replaceOnce(source, 'playing, planetCount, navigation, children }: { world: WorldRef; time: TimeRef; playing: boolean; planetCount: number; navigation: GalaxyNavigation;', 'playing, planetCount, children }: { world: WorldRef; time: TimeRef; playing: boolean; planetCount: number;')
  source = replaceOnce(source, '    const limit = (planetCount > 20 ? 0.3 : 1) * Math.min(1, navigation.viewRef.current.zoom ** 2)', '    // Zoom changes the lens distance, never the galaxy orientation or accumulated spin.\n    const limit = planetCount > 20 ? 0.3 : 1')
  source = replaceOnce(source, 'planetCount={galaxy.planets.length} navigation={navigation}>', 'planetCount={galaxy.planets.length}>')
  source = replaceOnce(source, `  return <>
    <SimulationClock playing={playing}`, `  const orbitSpeed = useMemo(() => galaxy.orbits.reduce((sum, orbit, index) => sum + Math.abs(motion?.orbitIndex === index ? motion.orbit.angularVelocity : orbit.angularVelocity), 0) / Math.max(1, galaxy.orbits.length), [galaxy, motion])
  return <>
    <SimulationClock playing={playing}`)
  return replaceOnce(source, '<CameraDirector galaxy={galaxy} navigation={navigation} resetKey={props.resetKey} playing={playing} />', '<CameraDirector galaxy={galaxy} navigation={navigation} resetKey={props.resetKey} playing={playing} toolsVisible={toolsVisible} orbitSpeed={orbitSpeed} time={time} />')
})

await edit('src/App.tsx', source => replaceOnce(source, '滚轮围绕当前星系中心平滑缩放，光标位置不会带动画面偏移；', '沉浸浏览时，镜头会随公转节奏缓慢环绕星系；滚轮或拖动优先响应，停止操作后再平滑恢复。滚轮围绕当前星系中心平滑缩放，光标位置不会带动画面偏移；'))

await edit('README.md', source => replaceOnce(source, '缩放期间保持现有镜头朝向并暂缓自动漂移，结束后自然恢复；', '缩放期间保持现有镜头朝向并暂缓自动跟随。沉浸模式下镜头按轨道平均角速度的一小部分缓慢环绕，使用与星球相同的模拟时钟；滚轮、拖动和惯性运动优先，空闲 1.6 秒后平滑恢复。打开工具、暂停动画、进入自由镜头或减少动态效果时自动跟随停下；'))

await edit('tests/spaceCamera.test.ts', source => source + `
test('immersive following advances slowly with the orbit clock and pauses for manual input', () => {
  const { camera, controller } = fixture()
  const view = initialGalaxyView()
  controller.setOrbitFollowSpeed(0.12)
  for (let index = 0; index < 360; index++) controller.update(1 / 60, view, true, false, 1 / 60)
  const before = controller.getState()
  assert.equal(before.following, true)
  assert.ok(before.followPhase > 0.035 && before.followPhase < 0.05)
  assert.ok(before.followSpeed < 0.008)
  const orientation = camera.quaternion.clone()
  const phase = before.followPhase
  for (let index = 0; index < 60; index++) controller.update(1 / 60, view, false, false, 1 / 60)
  assert.equal(controller.getState().followPhase, phase)
  assert.ok(1 - Math.abs(camera.quaternion.dot(orientation)) < 1e-12)
  controller.holdAutomaticMotion()
  for (let index = 0; index < 80; index++) controller.update(1 / 60, view, true, false, 1 / 60)
  assert.equal(controller.getState().following, false)
  assert.equal(controller.getState().followPhase, phase)
  for (let index = 0; index < 120; index++) controller.update(1 / 60, view, true, false, 1 / 60)
  assert.equal(controller.getState().following, true)
  assert.ok(controller.getState().followPhase > phase)
  controller.toggleFree()
  controller.update(1 / 60, view, true, false, 1 / 60)
  assert.equal(controller.getState().following, false)
})

test('automatic following integrates the same orbital phase across frame rates', () => {
  const low = fixture().controller, high = fixture().controller
  low.setOrbitFollowSpeed(0.12); high.setOrbitFollowSpeed(0.12)
  for (let index = 0; index < 90; index++) low.update(1 / 30, initialGalaxyView(), true, false, 1 / 30)
  for (let index = 0; index < 432; index++) high.update(1 / 144, initialGalaxyView(), true, false, 1 / 144)
  assert.ok(Math.abs(low.getState().followPhase - high.getState().followPhase) < 1e-12)
  assert.ok(Math.abs(low.getState().followSpeed - high.getState().followSpeed) < 1e-12)
})
`)
