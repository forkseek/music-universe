import fs from 'node:fs'
import path from 'node:path'
const root = path.resolve(process.argv[2]), changes = new Map()
if (!root.endsWith(path.join('outputs', 'music-universe'))) throw new Error('Unexpected project root')
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n')
function replace(code, before, after, label) {
  if (!code.includes(before)) throw new Error('Source changed: ' + label)
  return code.replace(before, after)
}

let code = read('src/lib/spaceCamera.ts')
code = replace(code, 'export interface CameraFollowTarget { id: string; position: [number, number, number] }', `export interface CameraFollowTarget {
  id: string
  position: [number, number, number]
  /** In the same world coordinate system as position. */
  starPosition?: [number, number, number]
}

/** An independent axis-acquisition duration; existing gaze and zoom easing stay intact. */
export const DEFAULT_CAMERA_FOLLOW_CONFIG = Object.freeze({ axisAcquireSeconds: 0.8, axisEpsilon: 0.00001 })`, 'follow data')
code = replace(code, '  private targetElapsed = 0', `  private targetElapsed = 0
  private axisActive = false
  private axisElapsed = 0
  private readonly axisDirection = new Vector3()
  private readonly axisPreviousDirection = new Vector3()
  private readonly axisFromOrientation = new Quaternion()
  private readonly axisGoalOrientation = new Quaternion()
  private readonly axisOrientation = new Quaternion()
  private readonly axisTransport = new Quaternion()
  private readonly axisUp = new Vector3(0, 1, 0)
  private readonly forwardAxis = new Vector3(0, 0, 1)`, 'axis state')
code = replace(code, 'private readonly onModeChange: (mode: Mode) => void) {', 'private readonly onModeChange: (mode: Mode) => void, private readonly followConfig: Readonly<{ axisAcquireSeconds: number; axisEpsilon: number }> = DEFAULT_CAMERA_FOLLOW_CONFIG) {\n    if (!Number.isFinite(followConfig.axisAcquireSeconds) || followConfig.axisAcquireSeconds <= 0 || !Number.isFinite(followConfig.axisEpsilon) || followConfig.axisEpsilon <= 0) throw new RangeError(\'Invalid camera follow parameters\')', 'follow parameters')
code = replace(code, "  beginDrag() {\n    if (this.mode !== 'orbit') return", "  beginDrag() {\n    if (this.mode !== 'orbit' || this.axisActive) return", 'axis constrains angular input')
code = replace(code, "  toggleFree() {\n    if (this.mode === 'free')", "  toggleFree() {\n    this.axisActive = false\n    if (this.mode === 'free')", 'free release')
code = replace(code, '  recenter() {\n    this.trackedId = null', '  recenter() {\n    this.axisActive = false\n    this.trackedId = null', 'reset release')
code = replace(code, '    this.anchorCamera.position.copy(goalPosition)\n    this.anchorCamera.lookAt', '    this.anchorCamera.position.copy(goalPosition)\n    this.anchorCamera.up.set(0, 1, 0)\n    this.anchorCamera.lookAt', 'reset up vector')
code = replace(code, "    if (this.mode === 'free') return this.updateFree(dt)\n\n    if (reducedMotion)", `    if (this.mode === 'free') return this.updateFree(dt)

    const star = target?.starPosition
    const validStar = !!star && star.every(Number.isFinite)
    if (target && validStar) this.axisDirection.set(...target.position).sub(new Vector3(...star))
    const constrainAxis = !!target && validStar && this.axisDirection.lengthSq() > this.followConfig.axisEpsilon ** 2
    if (this.axisActive && !constrainAxis) this.releaseAxisPose()
    if (constrainAxis && target) {
      this.axisDirection.normalize()
      if (!this.axisActive || this.trackedId !== target.id) {
        // Acquire the new axis from the actual rendered pose, including prior drag/drift.
        this.axisPreviousDirection.copy(this.camera.position).sub(this.center).normalize()
        this.axisFromOrientation.setFromUnitVectors(this.forwardAxis, this.axisPreviousDirection)
        this.axisUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion).normalize()
        this.axisElapsed = 0
        this.axisActive = true
        this.dragging = false
        this.velocityTheta = this.velocityPhi = 0
      }
    }

    if (reducedMotion)`, 'axis acquisition')
// No temporary vectors in the frame loop.
code = replace(code, 'this.axisDirection.set(...target.position).sub(new Vector3(...star))', 'this.axisDirection.set(target.position[0] - star[0], target.position[1] - star[1], target.position[2] - star[2])', 'allocation-free axis')
code = replace(code, '      this.userPhi = clamp(this.userPhi + this.velocityPhi * (1 - decay) / ANGULAR_DRAG, -MAX_PHI, MAX_PHI)', '      if (this.velocityPhi !== 0) this.userPhi = clamp(this.userPhi + this.velocityPhi * (1 - decay) / ANGULAR_DRAG, -MAX_PHI, MAX_PHI)', 'release near polar axis')
code = replace(code, '    this.sphericalPosition(this.center, this.theta + this.cinemaTheta, this.phi + this.cinemaPhi, this.radius + this.cinemaRadius, this.camera.position)', `    if (this.axisActive) {
      this.axisElapsed = Math.min(this.followConfig.axisAcquireSeconds, this.axisElapsed + dt)
      const progress = reducedMotion ? 1 : this.axisElapsed / this.followConfig.axisAcquireSeconds
      const amount = progress * progress * (3 - 2 * progress)
      this.axisGoalOrientation.setFromUnitVectors(this.forwardAxis, this.axisDirection)
      this.axisOrientation.copy(this.axisFromOrientation).slerp(this.axisGoalOrientation, amount)
      this.position.copy(this.forwardAxis).applyQuaternion(this.axisOrientation).normalize()
      // C = P + d normalize(P - S): viewed from C the order is camera, planet, star.
      this.camera.position.copy(this.center).addScaledVector(this.position, this.radius + this.cinemaRadius)
      // Parallel-transport the up vector so passing the world Y axis cannot flip the view.
      this.axisTransport.setFromUnitVectors(this.axisPreviousDirection, this.position)
      this.axisUp.applyQuaternion(this.axisTransport).normalize()
      this.camera.up.copy(this.axisUp)
      this.axisPreviousDirection.copy(this.position)
      if (progress < 1) this.moving = true
    } else this.sphericalPosition(this.center, this.theta + this.cinemaTheta, this.phi + this.cinemaPhi, this.radius + this.cinemaRadius, this.camera.position)`, 'axis pose')
code = replace(code, "this.mode === 'orbit' && !this.reset ? this.theta + this.cinemaTheta", "this.mode === 'orbit' && !this.reset && !this.axisActive ? this.theta + this.cinemaTheta", 'actual axis yaw')
code = replace(code, "this.mode === 'orbit' && !this.reset ? this.phi + this.cinemaPhi", "this.mode === 'orbit' && !this.reset && !this.axisActive ? this.phi + this.cinemaPhi", 'actual axis pitch')
code = replace(code, "      targetLocked: this.mode === 'orbit' && this.trackedId !== null && this.center.distanceTo(this.requestedCenter) < EPSILON,", "      targetLocked: this.mode === 'orbit' && this.trackedId !== null && this.center.distanceTo(this.requestedCenter) < EPSILON && (!this.axisActive || this.axisElapsed >= this.followConfig.axisAcquireSeconds),\n      axisConstrained: this.axisActive,\n      axisLocked: this.axisActive && this.axisElapsed >= this.followConfig.axisAcquireSeconds,", 'axis diagnostics')
code = replace(code, '    this.anchorCamera.lookAt(center)\n    this.anchorCamera.updateMatrixWorld()', '    this.anchorCamera.up.copy(this.camera.up)\n    this.anchorCamera.lookAt(center)\n    this.anchorCamera.updateMatrixWorld()', 'released pinch orientation')
code = replace(code, '  private sphericalPosition(', `  private releaseAxisPose() {
    // Preserve the exact rendered pose and zoom when the user releases follow.
    this.axisActive = false
    this.difference.copy(this.camera.position).sub(this.center)
    this.radius = this.difference.length()
    this.userTheta = this.theta = Math.atan2(this.difference.x, this.difference.z)
    this.userPhi = this.phi = Math.asin(clamp(this.difference.y / Math.max(EPSILON, this.radius), -1, 1))
    this.velocityTheta = this.velocityPhi = 0
    this.followPhase = this.followSpeed = 0
    this.cinemaTheta = this.cinemaPhi = this.cinemaRadius = 0
  }

  private sphericalPosition(`, 'exact axis release')
code = replace(code, '      this.reset = null\n      this.userTheta', '      this.reset = null\n      this.camera.up.set(0, 1, 0)\n      this.userTheta', 'default up after recenter')
changes.set('src/lib/spaceCamera.ts', code)

code = read('src/components/SceneInteraction.tsx')
code = replace(code, '    gl.domElement.dataset.followPlanetPosition = target ? JSON.stringify(target.position) : \'\'', '    gl.domElement.dataset.followPlanetPosition = target ? JSON.stringify(target.position) : \'\'\n    gl.domElement.dataset.followStarPosition = target?.starPosition ? JSON.stringify(target.starPosition) : \'\'\n    gl.domElement.dataset.cameraAxisLocked = String(state.axisLocked)\n    gl.domElement.dataset.cameraAxisConstrained = String(state.axisConstrained)', 'world axis diagnostics')
code = replace(code, '  const point = useMemo(() => new Vector3(), [])\n  useFrame', '  const point = useMemo(() => new Vector3(), [])\n  const starPoint = useMemo(() => new Vector3(), [])\n  useFrame', 'star world sample')
code = replace(code, '    world.current.localToWorld(point)\n    const previous', '    world.current.localToWorld(point)\n    starPoint.set(...galaxy.star.position)\n    world.current.localToWorld(starPoint)\n    const previous', 'shared world coordinates')
code = replace(code, 'navigation.followPointRef.current = { id: target, position: [point.x, point.y, point.z] }', 'navigation.followPointRef.current = { id: target, position: [point.x, point.y, point.z], starPosition: [starPoint.x, starPoint.y, starPoint.z] }', 'follow world data')
code = replace(code, '    else { previous.position[0] = point.x; previous.position[1] = point.y; previous.position[2] = point.z }', '    else {\n      previous.position[0] = point.x; previous.position[1] = point.y; previous.position[2] = point.z\n      previous.starPosition ??= [0, 0, 0]\n      previous.starPosition[0] = starPoint.x; previous.starPosition[1] = starPoint.y; previous.starPosition[2] = starPoint.z\n    }', 'reuse follow tuples')
changes.set('src/components/SceneInteraction.tsx', code)

code = read('src/hooks/useAlbumTexture.ts')
code = replace(code, "import { SRGBColorSpace, Texture } from 'three'", "import { SRGBColorSpace, Texture } from 'three'\nimport { sampleAlbumTone } from '../lib/albumLighting'\nimport type { AlbumTone } from '../lib/albumLighting'", 'texture tone sampling')
code = replace(code, 'url: string, onReady: () => void)', 'url: string, onReady: () => void, onTone?: (tone: AlbumTone | null) => void)', 'optional loaded tone callback')
code = replace(code, '      texture.needsUpdate = true\n      invalidate()', '      texture.needsUpdate = true\n      onTone?.(sampleAlbumTone(image))\n      invalidate()', 'reuse image pixels')
code = replace(code, '[url, texture, invalidate, onReady]', '[url, texture, invalidate, onReady, onTone]', 'tone callback deps')
changes.set('src/hooks/useAlbumTexture.ts', code)

code = read('src/lib/spaceMaterials.ts')
code = replace(code, 'uLight: { value: new Vector3(-0.4, 0.6, 1).normalize() } },', 'uLight: { value: new Vector3(-0.4, 0.6, 1).normalize() }, uGlowColor: { value: new Color(\'#edbe72\') }, uGlowIntensity: { value: 0.45 } },', 'surface glow uniforms')
code = replace(code, '      uniform vec3 uLight;', '      uniform vec3 uLight;\n      uniform vec3 uGlowColor;\n      uniform float uGlowIntensity;', 'cover shader parameters')
code = replace(code, 'vec3(0.73,0.42,0.13)*rim*0.45', 'uGlowColor*rim*uGlowIntensity', 'cover tone rim')
changes.set('src/lib/spaceMaterials.ts', code)

code = read('src/components/GalaxyScene.tsx')
code = replace(code, "import type { ReactNode, RefObject } from 'react'", "import type { ReactNode, RefObject } from 'react'\nimport type { PointLight, SpriteMaterial } from 'three'\nimport { advanceAlbumLight, createAlbumLightState, DEFAULT_ALBUM_LIGHTING_CONFIG, mapAlbumToneToLight } from '../lib/albumLighting'\nimport type { AlbumLightState, AlbumTone } from '../lib/albumLighting'", 'album lighting imports')
code = replace(code, 'function AlbumStar({ galaxy, time, navigation, onToggleTarget, pulseTarget, playing, toolsVisible, onReady }: SceneProps & { time: TimeRef; onReady: () => void }) {\n  const cover = useAlbumTexture(galaxy.star.albumCover, onReady)', `function AlbumStar({ galaxy, time, navigation, onToggleTarget, pulseTarget, playing, toolsVisible, onReady, lighting }: SceneProps & { time: TimeRef; onReady: () => void; lighting: AlbumLightState }) {
  const onTone = useCallback((tone: AlbumTone | null) => { lighting.target = mapAlbumToneToLight(tone) }, [lighting])
  const cover = useAlbumTexture(galaxy.star.albumCover, onReady, onTone)
  const light = useRef<PointLight>(null)
  const halo = useRef<SpriteMaterial>(null)
  const { gl } = useThree()`, 'tone driven star')
code = replace(code, 'const atmosphere = useMemo(() => createAtmosphere(galaxy.star.color, galaxy.star.coronaIntensity), [galaxy.star])', "const atmosphere = useMemo(() => createAtmosphere('#ffffff', 0.6), [])", 'stable atmosphere uniforms')
code = replace(code, '    if (sphere.current && gesture.orientation) sphere.current.quaternion.copy(gesture.orientation)\n  })', `    if (sphere.current && gesture.orientation) sphere.current.quaternion.copy(gesture.orientation)
    const intensity = galaxy.star.scale * DEFAULT_ALBUM_LIGHTING_CONFIG.pointPowerPerRadius * lighting.intensityScale
    if (light.current) { light.current.color.copy(lighting.color); light.current.intensity = intensity }
    if (halo.current) { halo.current.color.copy(lighting.color); halo.current.opacity = lighting.corona * 0.55 }
    atmosphere.uniforms.uColor.value.copy(lighting.color)
    atmosphere.uniforms.uIntensity.value = lighting.corona
    surface.uniforms.uGlowColor.value.copy(lighting.color)
    surface.uniforms.uGlowIntensity.value = 0.45 * lighting.intensityScale
    gl.domElement.dataset.starLightIntensity = intensity.toFixed(5)
  })`, 'synchronize star effects')
code = replace(code, '{/* 恒星补一盏点光：给内侧行星一圈暖色近距离光效。 */}\n    <pointLight color={galaxy.star.color} intensity={radius * 14}', '{/* The cover drives the real light, corona and shader rim with the same bounded profile. */}\n    <pointLight ref={light} name="album-tone-light" color={lighting.color} intensity={radius * 14 * lighting.intensityScale}', 'actual point light')
code = replace(code, '<spriteMaterial map={glow} color={galaxy.star.color} transparent opacity={galaxy.star.coronaIntensity * 0.55}', '<spriteMaterial ref={halo} map={glow} color={lighting.color} transparent opacity={lighting.corona * 0.55}', 'glow material')
code = replace(code, 'function Contents(props: SceneProps & { onReady: () => void; labels: LabelRefs })', 'function Contents(props: SceneProps & { onReady: () => void; labels: LabelRefs; lighting: AlbumLightState })', 'persistent lighting passed to scene')
code = replace(code, '// Lighting/PMREM and postprocessing belong to the Canvas, not to an album.', `/** Lives outside the keyed album contents so a new cover starts from the visible light. */
function AlbumLightTransition({ lighting }: { lighting: AlbumLightState }) {
  const { gl, invalidate } = useThree()
  useFrame((_, delta) => {
    const moving = advanceAlbumLight(lighting, delta)
    gl.domElement.dataset.albumLightColor = '#' + lighting.color.getHexString()
    gl.domElement.dataset.albumLightTargetColor = '#' + lighting.target.color.getHexString()
    gl.domElement.dataset.albumLightScale = lighting.intensityScale.toFixed(6)
    gl.domElement.dataset.albumLightCorona = lighting.corona.toFixed(6)
    gl.domElement.dataset.albumToneSource = lighting.target.source
    if (moving) invalidate()
  }, -0.9)
  return null
}

// Lighting/PMREM and postprocessing belong to the Canvas, not to an album.`, 'persistent crossfade')
code = replace(code, '  const [camera] = useState(() => new PerspectiveCamera(36, 1, 0.1, 400))', '  const [camera] = useState(() => new PerspectiveCamera(36, 1, 0.1, 400))\n  const [lighting] = useState(() => createAlbumLightState())', 'light lifecycle')
code = replace(code, '      <SceneLighting />\n      <Suspense', '      <SceneLighting />\n      <AlbumLightTransition lighting={lighting} />\n      <Suspense', 'light updater in Canvas')
code = replace(code, 'onReady={markReady} labels={labels} /></Suspense>', 'onReady={markReady} labels={labels} lighting={lighting} /></Suspense>', 'share current light')
changes.set('src/components/GalaxyScene.tsx', code)
changes.set('src/lib/albumLighting.ts', fs.readFileSync(path.join(import.meta.dirname, 'albumLighting.ts'), 'utf8'))

for (const [file, content] of changes) {
  const destination = path.join(root, file), backup = path.join(import.meta.dirname, 'before', file)
  fs.mkdirSync(path.dirname(backup), { recursive: true })
  if (fs.existsSync(destination)) fs.copyFileSync(destination, backup)
  fs.writeFileSync(destination, content)
  console.log('Updated ' + file)
}
