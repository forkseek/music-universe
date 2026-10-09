import { Component, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { PointLight, Sprite, SpriteMaterial } from 'three'
import type { BloomEffect } from 'postprocessing'
import { advanceAlbumLight, createAlbumLightState, mapAlbumToneToLight } from '../lib/albumLighting'
import type { AlbumLightState, AlbumTone } from '../lib/albumLighting'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, PerformanceMonitor } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { AdditiveBlending, CanvasTexture, Group, MathUtils, Mesh, PerspectiveCamera, Vector3 } from 'three'
import { ALBUM_TARGET } from '../lib/galaxyNavigation'
import type { GalaxyNavigation } from '../hooks/useGalaxyNavigation'
import { CameraDirector, CameraFollow, PlaybackHalo, SceneDiagnostics, useSurfaceGesture } from './SceneInteraction'
import ImmersiveBackground from './ImmersiveBackground'
import type { RenderQuality } from '../lib/sceneFraming'
import type { CameraMotionPreset } from '../lib/cameraMotion'
import type { useAudioAnalysis } from '../hooks/useAudioAnalysis'
import { useInteractionActivity } from '../hooks/useInteractionActivity'
import { advanceRenderBudget, createRenderBudget } from '../lib/interactionQuality'
import type { RenderBudget } from '../lib/interactionQuality'
import { shouldShowPlanetLabel, UNIVERSE_EXPERIENCE } from '../lib/universeExperience'
import { MUSIC_HALL_URL } from '../lib/musicWorld'
import { useAlbumTexture } from '../hooks/useAlbumTexture'
import { notifyUniverseReady } from '../hooks/useHallEmbedding'
import { orbitPosition, TAU, writeOrbitPosition } from '../lib/orbitalMotion'
import type { Album, AlbumGalaxy, GalaxyOrbit, GalaxyPlanet } from '../lib/generateAlbumGalaxy'
import type { PlanetMetrics } from '../lib/planetMetrics'
import { createAlbumSurface, createAtmosphere, createPlanetMaterial, createRadialTexture } from '../lib/spaceMaterials'

interface SceneProps {
  galaxy: AlbumGalaxy
  album: Album
  selectedId: string | null
  /** 场景内星球标题标签的点击入口；与点击星球本体一致，会附着镜头并弹出该星球信息浮窗。 */
  onSelect: (id: string) => void
  playing: boolean
  showLabels: boolean
  /** 星球轨迹（轨道线）是否显示；由工具栏的「轨迹」开关与 T 快捷键控制。 */
  showOrbits: boolean
  resetKey: number
  generation: number
  quality: RenderQuality
  navigation: GalaxyNavigation
  onToggleTarget: (target: string) => void
  /** 双击星球：判定为播放该曲目并让主视角跟随过去。 */
  onPlayTarget: (target: string) => void
  /** 单击星球：平滑附着镜头到该行星并展示它的信息浮窗（与浮窗上一首/下一首共用入口）。 */
  onInspectPlanet: (target: string) => void
  pulseTarget: string | null
  toolsVisible: boolean
  /** 当前选中星球由歌曲数据推导出的属性；随点击更新，未选中时为 null。 */
  selectedMetrics: PlanetMetrics | null
  playingPlanetId: string | null
  audioAnalysis: ReturnType<typeof useAudioAnalysis>
  motionPreset: CameraMotionPreset
  reducedMotion: boolean
}

/** 点击星球后，该轨道与自转改按歌曲时长推导的周期运行；其余天体行为保持不变。 */
interface MotionOverride {
  orbitIndex: number
  orbit: GalaxyOrbit
  orbitPhaseShift: number
  planetId: string
  rotationSpeed: number
  spinPhaseShift: number
}

type TimeRef = RefObject<number>

function SimulationClock({ playing, time, galaxy, positions, motion }: { playing: boolean; time: TimeRef; galaxy: AlbumGalaxy; positions: Vector3[]; motion: MotionOverride | null }) {
  const wasPlaying = useRef(false)
  useFrame((_, delta) => {
    // Skip the resume frame so a hidden tab or long pause cannot cause a jump.
    if (playing && wasPlaying.current) time.current += Math.min(delta, 0.1)
    wasPlaying.current = playing
    galaxy.planets.forEach((planet, index) => {
      // The clicked planet's orbit is re-anchored, so a changed period never teleports a body.
      if (motion && planet.orbitIndex === motion.orbitIndex) writeOrbitPosition(positions[index], motion.orbit, planet.orbitalPhase + motion.orbitPhaseShift, time.current, galaxy.star.position)
      else writeOrbitPosition(positions[index], galaxy.orbits[planet.orbitIndex], planet.orbitalPhase, time.current, galaxy.star.position)
    })
  }, -1)
  useEffect(() => { if (!playing) wasPlaying.current = false }, [playing])
  return null
}

function RenderQualityController({ quality, playing, budget, onDprChange, onPostEnabled }: { quality: RenderQuality; playing: boolean; budget: RenderBudget; onDprChange: (dpr: number) => void; onPostEnabled: (enabled: boolean) => void }) {
  const { gl, invalidate, size } = useThree()
  const ceiling = Math.min(window.devicePixelRatio || 1, size.width < 700 ? 1.2 : 1.75)
  const baseDpr = useRef(Math.min(ceiling, 1.31))
  const baseFactor = useRef(0.6)
  const activity = useInteractionActivity(gl.domElement, invalidate)
  const [monitorAllowed, setMonitorAllowed] = useState(true)
  const lastMonitorAllowed = useRef(true), lastPostEnabled = useRef(budget.postEnabled)
  const applyFactor = useCallback((factor: number) => {
    baseFactor.current = factor
    baseDpr.current = Math.min(ceiling, 0.65 + factor * 1.1)
    invalidate()
  }, [ceiling, invalidate])
  useEffect(() => {
    const factor = quality === 'low' ? 0.15 : quality === 'high' ? 1 : 0.6
    applyFactor(factor)
  }, [quality, applyFactor])
  useFrame((_, delta) => {
    advanceRenderBudget(budget, { nowMs: performance.now(), deltaSeconds: delta, baseDpr: baseDpr.current, activity: activity.current })
    if (budget.dprCommit !== null) onDprChange(budget.dprCommit)
    if (lastPostEnabled.current !== budget.postEnabled) { lastPostEnabled.current = budget.postEnabled; onPostEnabled(budget.postEnabled) }
    if (lastMonitorAllowed.current !== budget.monitoringAllowed) { lastMonitorAllowed.current = budget.monitoringAllowed; setMonitorAllowed(budget.monitoringAllowed) }
    gl.domElement.dataset.renderDpr = gl.getPixelRatio().toFixed(3)
    gl.domElement.dataset.baseDpr = budget.baseDpr.toFixed(3)
    gl.domElement.dataset.particleRatio = budget.particleRatio.toFixed(4)
    gl.domElement.dataset.bloomIntensity = budget.bloomIntensity.toFixed(4)
    gl.domElement.dataset.postEnabled = String(budget.postEnabled)
    gl.domElement.dataset.interactionActive = String(budget.interactionActive)
    gl.domElement.dataset.qualityRecovering = String(budget.recovering)
    gl.domElement.dataset.gpuGeometries = String(gl.info.memory.geometries)
    gl.domElement.dataset.gpuTextures = String(gl.info.memory.textures)
    if (budget.interactionActive || budget.recovering) invalidate()
  }, -1.4)
  // Stop collecting FPS samples during input/recovery; resume from the same baseline.
  return quality === 'auto' && playing && monitorAllowed ? <PerformanceMonitor ms={350} iterations={6} threshold={0.65} step={0.15} factor={baseFactor.current}
    bounds={() => [30, 55]} flipflops={3} onChange={({ factor }) => { if (budget.monitoringAllowed) applyFactor(factor) }} onFallback={() => { if (budget.monitoringAllowed) applyFactor(0.2) }} /> : null
}

function AudioAnalysisFrame({ analysis, enabled }: { analysis: SceneProps['audioAnalysis']; enabled: boolean }) {
  const { gl, invalidate } = useThree()
  useFrame((_, delta) => {
    if (!enabled) return
    const moving = analysis.sample(delta)
    gl.domElement.dataset.audioLow = analysis.bandsRef.current.low.toFixed(5)
    gl.domElement.dataset.audioHigh = analysis.bandsRef.current.high.toFixed(5)
    gl.domElement.dataset.audioAnalysis = analysis.status
    if (moving) invalidate()
  }, -1.2)
  return null
}

type WorldRef = RefObject<Group | null>

/** 星系自转速率（rad/s）：约两分钟一圈，慢到不干扰选星，又能被明显看到。 */
const GALAXY_SPIN_RATE = 0.05

function WorldMotion({ world, time, playing, planetCount, children }: { world: WorldRef; time: TimeRef; playing: boolean; planetCount: number; children: ReactNode }) {
  const { pointer } = useThree()
  useFrame((_, delta) => {
    if (!playing || !world.current) return
    // Zoom changes the lens distance, never the galaxy orientation or accumulated spin.
    const limit = planetCount > 20 ? 0.3 : 1
    const x = (0.018 + pointer.y * 0.012 + Math.sin(time.current * 0.15) * 0.006) * limit
    const y = (-0.025 + pointer.x * 0.035) * limit
    world.current.rotation.x = MathUtils.damp(world.current.rotation.x, x, 3, Math.min(delta, 0.06))
    world.current.rotation.y = MathUtils.damp(world.current.rotation.y, y, 3, Math.min(delta, 0.06))
    // Ambient galaxy spin, read from the simulation clock so pause and reduced motion freeze it too.
    world.current.rotation.z = time.current * GALAXY_SPIN_RATE * limit
  }, -0.75)
  return <group ref={world} name="album-solar-system" rotation={[0.018, -0.025, 0]}>{children}</group>
}

function AlbumStar({ galaxy, time, navigation, onToggleTarget, pulseTarget, playing, toolsVisible, onReady, lighting, audioAnalysis, reducedMotion }: SceneProps & { time: TimeRef; onReady: () => void; lighting: AlbumLightState }) {
  const onTone = useCallback((tone: AlbumTone | null) => { lighting.target = mapAlbumToneToLight(tone) }, [lighting])
  const cover = useAlbumTexture(galaxy.star.albumCover, onReady, onTone)
  const light = useRef<PointLight>(null)
  const halo = useRef<SpriteMaterial>(null)
  const corona = useRef<Sprite>(null)
  const { gl } = useThree()
  const sphere = useRef<Mesh>(null)
  const gesture = useSurfaceGesture({ target: ALBUM_TARGET, navigation, onInspect: () => navigation.focus(ALBUM_TARGET), onToggle: onToggleTarget, inspectOnClick: toolsVisible, inertial: true, playing, autoSpeed: galaxy.star.rotationSpeed })
  const surface = useMemo(() => createAlbumSurface(cover), [cover])
  const atmosphere = useMemo(() => createAtmosphere('#ffffff', 0.6), [])
  const glow = useMemo(() => new CanvasTexture(createRadialTexture()), [])
  useEffect(() => () => surface.dispose(), [surface])
  useEffect(() => () => { atmosphere.dispose(); glow.dispose() }, [atmosphere, glow])
  useFrame(() => {
    if (sphere.current && gesture.orientation) sphere.current.quaternion.copy(gesture.orientation)
    const intensity = lighting.intensity
    if (light.current) { light.current.color.copy(lighting.color); light.current.intensity = intensity }
    const low = reducedMotion ? 0 : audioAnalysis.bandsRef.current.low
    const haloGain = 1 + low * UNIVERSE_EXPERIENCE.haloScaleGain
    if (halo.current) { halo.current.color.copy(lighting.color); halo.current.opacity = Math.min(1, lighting.corona * 0.55 * (1 + low * UNIVERSE_EXPERIENCE.haloOpacityGain)) }
    if (corona.current) corona.current.scale.set(galaxy.star.scale * 4.7 * haloGain, galaxy.star.scale * 4.7 * haloGain, 1)
    atmosphere.uniforms.uColor.value.copy(lighting.color)
    atmosphere.uniforms.uIntensity.value = lighting.corona
    surface.uniforms.uGlowColor.value.copy(lighting.color)
    surface.uniforms.uGlowIntensity.value = 0.45 * lighting.intensityScale
    gl.domElement.dataset.starLightIntensity = intensity.toFixed(5)
    gl.domElement.dataset.audioHaloGain = haloGain.toFixed(5)
    // Report the bound sampler, rather than the album metadata, for rendering diagnostics.
    gl.domElement.dataset.starCoverUrl = cover.userData.coverUrl || ''
    gl.domElement.dataset.starCoverReady = String(!!cover.image?.naturalWidth)
  })
  const radius = galaxy.star.scale
  return <group position={galaxy.star.position} name="album-star">
    {/* The cover drives the real light, corona and shader rim with the same bounded profile. */}
    <pointLight ref={light} name="album-tone-light" color={lighting.color} intensity={lighting.intensity} distance={radius * 30} decay={1.7} />
    <sprite ref={corona} position={[0, 0, -0.6]} scale={[radius * 4.7, radius * 4.7, 1]}>
      <spriteMaterial ref={halo} map={glow} color={lighting.color} transparent opacity={lighting.corona * 0.55} blending={AdditiveBlending} depthWrite={false} />
    </sprite>
    <mesh ref={sphere} scale={radius} material={surface} name="album-cover-surface" {...gesture.handlers}
      onPointerOver={(event) => { event.stopPropagation(); navigation.setHover(ALBUM_TARGET); document.body.style.cursor = 'grab' }}
      onPointerOut={() => { navigation.setHover(null); if (document.body.style.cursor !== 'grabbing') document.body.style.cursor = '' }}><sphereGeometry args={[1, 96, 64]} /></mesh>
    {pulseTarget === ALBUM_TARGET && <PlaybackHalo radius={radius} time={time} playing={playing} />}
    <mesh scale={radius * 1.025} material={atmosphere}><sphereGeometry args={[1, 64, 48]} /></mesh>
    <mesh rotation={[0.15, -0.22, -0.28]} scale={[1, 0.34, 1]}>
      <torusGeometry args={[radius * 1.23, 0.008, 8, 160]} />
      <meshBasicMaterial color="#e7c58a" transparent opacity={0.48} />
    </mesh>
    <mesh rotation={[0.12, 0, -0.28]} scale={[1, 0.34, 1]} position={[0, 0, -1]}>
      <torusGeometry args={[radius * 1.42, 0.006, 8, 160]} />
      <meshBasicMaterial color="#aa8152" transparent opacity={0.27} />
    </mesh>
  </group>
}

function Moons({ planet, time }: { planet: GalaxyPlanet; time: TimeRef }) {
  const group = useRef<Group>(null)
  useFrame(() => { if (group.current) group.current.rotation.z = planet.phase + time.current * planet.rotationSpeed * 0.6 })
  return <group ref={group} rotation={[0.2, 0.3, planet.phase]}>
    {Array.from({ length: planet.moonCount }, (_, i) => {
      const angle = i * 2.399 + planet.phase
      return <mesh key={i} position={[Math.cos(angle) * 1.72, Math.sin(angle) * 1.72, -0.1]} scale={0.075 + i * 0.018}>
        <sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color="#9eabb9" roughness={0.95} />
      </mesh>
    })}
  </group>
}

function Planet({ planet, position, selected, onInspect, time, navigation, onToggleTarget, onPlayTarget, pulseTarget, playing, toolsVisible, spin }: { planet: GalaxyPlanet; position: Vector3; selected: boolean; onInspect: () => void; time: TimeRef; navigation: GalaxyNavigation; onToggleTarget: (target: string) => void; onPlayTarget: (target: string) => void; pulseTarget: string | null; playing: boolean; toolsVisible: boolean; spin?: { rotationSpeed: number; phaseShift: number } | null }) {
  const body = useRef<Group>(null)
  const sphere = useRef<Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const gesture = useSurfaceGesture({ target: planet.id, navigation, onInspect, onToggle: onToggleTarget, onPlay: onPlayTarget, inspectOnClick: true })
  const surface = useMemo(() => createPlanetMaterial(planet), [planet])
  const atmosphere = useMemo(() => createAtmosphere(planet.color, planet.style === 'glass' ? 0.7 : 0.32), [planet])
  useEffect(() => () => { surface.dispose(); atmosphere.dispose() }, [surface, atmosphere])
  useFrame(() => {
    body.current?.position.copy(position)
    if (sphere.current) {
      // The clicked planet spins at the rate derived from its song length; others keep the seeded rate.
      const spinAngle = spin ? time.current * spin.rotationSpeed + spin.phaseShift : time.current * planet.rotationSpeed
      sphere.current.rotation.y = spinAngle + planet.phase + gesture.rotation.current.yaw
      sphere.current.rotation.x = gesture.rotation.current.pitch
      sphere.current.rotation.z = 0.14
    }
  })
  return <group ref={body} position={planet.position} name={`track-${planet.index + 1}`}>
    <group scale={planet.scale}>
      <mesh ref={sphere} material={surface} {...gesture.handlers}
        onPointerOver={(event) => { event.stopPropagation(); setHovered(true); navigation.setHover(planet.id); document.body.style.cursor = 'grab' }}
        onPointerOut={() => { setHovered(false); navigation.setHover(null); if (document.body.style.cursor !== 'grabbing') document.body.style.cursor = '' }}>
        {planet.style === 'crystal' ? <icosahedronGeometry args={[1, 2]} /> : <sphereGeometry args={[1, 48, 32]} />}
      </mesh>
      <mesh scale={1.045} material={atmosphere}><sphereGeometry args={[1, 32, 24]} /></mesh>
      {planet.hasRing && <group rotation={[1.12, 0.12, planet.ringTilt]}>
        <mesh><torusGeometry args={[1.37, 0.055, 8, 96]} /><meshStandardMaterial color={planet.color} metalness={0.65} roughness={0.45} transparent opacity={0.76} /></mesh>
        <mesh><torusGeometry args={[1.54, 0.018, 6, 96]} /><meshBasicMaterial color={planet.color} transparent opacity={0.5} /></mesh>
      </group>}
      <Moons planet={planet} time={time} />
      {pulseTarget === planet.id && <PlaybackHalo radius={1} time={time} playing={playing} />}
      {(selected || hovered) && toolsVisible && <mesh><torusGeometry args={[1.92, 0.012, 6, 80]} /><meshBasicMaterial color="#e4c898" transparent opacity={0.9} /></mesh>}
    </group>
  </group>
}

function OrbitPaths({ galaxy, visible }: { galaxy: AlbumGalaxy; visible: boolean }) {
  const paths = useMemo(() => galaxy.orbits.map(orbit => new Float32Array(Array.from({ length: 128 }, (_, index) => orbitPosition(orbit, index * TAU / 128, 0, galaxy.star.position)).flat())), [galaxy])
  return <group name="planet-orbits" visible={visible}>{galaxy.orbits.map((orbit, index) => <lineLoop key={index} name={`orbit-${index}`} raycast={() => {}}>
    <bufferGeometry><bufferAttribute attach="attributes-position" args={[paths[index], 3]} /></bufferGeometry>
    <lineBasicMaterial color={orbit.color} transparent opacity={orbit.opacity} depthWrite={false} />
  </lineLoop>)}</group>
}

function HallGate() {
  return <group position={[-13.65, -5.1, 0]} name="music-hall-gate">
    <mesh><torusGeometry args={[0.64, 0.025, 10, 72]} /><meshBasicMaterial color={[1.55, 1.05, 0.45]} toneMapped={false} /></mesh>
    <mesh rotation={[0, 0, 0.4]}><torusGeometry args={[0.78, 0.011, 8, 72, Math.PI * 1.6]} /><meshBasicMaterial color="#edc389" transparent opacity={0.65} /></mesh>
    <mesh position={[0, 0, -0.05]}><circleGeometry args={[0.61, 48]} /><meshBasicMaterial color="#d9a14e" transparent opacity={0.07} depthWrite={false} /></mesh>
    <mesh position={[0, 0.81, 0]}><sphereGeometry args={[0.035, 12, 8]} /><meshBasicMaterial color={[2.1, 1.3, 0.4]} toneMapped={false} /></mesh>
  </group>
}

type LabelRefs = RefObject<Map<string, HTMLDivElement>>

function ProjectLabels({ galaxy, labels, world, positions, navigation, playingPlanetId }: { galaxy: AlbumGalaxy; labels: LabelRefs; world: WorldRef; positions: Vector3[]; navigation: GalaxyNavigation; playingPlanetId: string | null }) {
  const { camera, size } = useThree()
  const nodes = useMemo(() => [
    { key: 'star', position: new Vector3(galaxy.star.position[0], galaxy.star.position[1] - galaxy.star.scale - 0.85, 0) },
    { key: 'hall-gate', position: new Vector3(-13.65, -6.3, 0) },
    ...galaxy.planets.flatMap((planet) => [
      { key: `${planet.id}-number`, planetId: planet.id, position: new Vector3(), center: positions[planet.index], offset: planet.scale + 0.65 },
      { key: `${planet.id}-title`, planetId: planet.id, position: new Vector3(), center: positions[planet.index], offset: -planet.scale - 0.7 },
    ]),
  ], [galaxy, positions])
  const projected = useMemo(() => new Vector3(), [])
  useFrame(() => {
    world.current?.updateMatrixWorld(true)
    const keyboardLabel = document.activeElement instanceof HTMLElement && document.activeElement.matches(':focus-visible') ? document.activeElement.closest('.planet-caption') : null
    for (const node of nodes) {
      const element = labels.current.get(node.key)
      if (!element) continue
      if ('planetId' in node && node.planetId) {
        // Keyboard focus is equivalent to pointing, keeping the labels reachable without a mouse.
        const focus = shouldShowPlanetLabel(node.planetId, playingPlanetId, navigation.hover.current, element === keyboardLabel)
        const focused = String(focus), isPlaying = String(node.planetId === playingPlanetId)
        if (element.dataset.focused !== focused) element.dataset.focused = focused
        if (element.dataset.playing !== isPlaying) element.dataset.playing = isPlaying
        // The current/hovered pair alone needs projection on large albums.
        if (!focus) continue
      }
      if ('center' in node && node.center) node.position.copy(node.center).y += node.offset
      projected.copy(node.position)
      world.current?.localToWorld(projected)
      projected.project(camera)
      const x = (projected.x * 0.5 + 0.5) * size.width
      const y = (-projected.y * 0.5 + 0.5) * size.height
      element.style.visibility = projected.z < -1 || projected.z > 1 ? 'hidden' : ''
      element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
      if ('center' in node && node.center) {
        projected.copy(node.center)
        world.current?.localToWorld(projected)
        projected.project(camera)
        element.dataset.centerX = String((projected.x * 0.5 + 0.5) * size.width)
        element.dataset.centerY = String((-projected.y * 0.5 + 0.5) * size.height)
      }
      if (node.key.endsWith('-title')) {
        element.style.width = `${size.width > 1100 ? 84 : size.width > 700 ? 67 : 45}px`
      }
    }
  })
  return null
}

function SceneLabels({ galaxy, album, selectedId, onSelect, labels, navigation, onLabelActivity }: SceneProps & { labels: LabelRefs; onLabelActivity: () => void }) {
  const labelRef = (key: string) => (element: HTMLDivElement | null) => {
    if (element) labels.current.set(key, element)
    else labels.current.delete(key)
  }
  return <div className="scene-label-layer">
    {<div ref={labelRef('star')} className="star-caption"><div><span className="star-kind">ALBUM STAR</span><strong>{album.name}</strong><span>{album.artist}</span></div></div>}
    {<div ref={labelRef('hall-gate')} className="hall-gate-caption"><a href={MUSIC_HALL_URL} aria-label="通过光环返回音乐大厅">音乐大厅 ↗</a></div>}
    {galaxy.planets.map((planet) => <div key={planet.id} className="label-pair">
      <div ref={labelRef(`${planet.id}-number`)} className="planet-number"><span className={selectedId === planet.id ? 'active' : ''}>{String(planet.index + 1).padStart(2, '0')}</span></div>
      <div ref={labelRef(`${planet.id}-title`)} className="planet-caption"
        onPointerEnter={() => { navigation.setHover(planet.id); onLabelActivity() }} onPointerLeave={() => { navigation.setHover(null); onLabelActivity() }}>
        <button className={selectedId === planet.id ? 'active' : ''} onClick={() => onSelect(planet.id)} data-scene-target={planet.id} title={planet.title} aria-label={`选择第 ${planet.index + 1} 首：${planet.title}`}
          onFocus={() => { navigation.setHover(planet.id); onLabelActivity() }} onBlur={() => { navigation.setHover(null); onLabelActivity() }}>{planet.title}</button></div>
    </div>)}
  </div>
}

/** Lives outside the keyed album contents so a new cover starts from the visible light. */
function AlbumLightTransition({ lighting, radius }: { lighting: AlbumLightState; radius: number }) {
  const { gl, invalidate } = useThree()
  useFrame((_, delta) => {
    lighting.radius = radius
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

// Lighting/PMREM and postprocessing belong to the Canvas, not to an album.
// Keeping them alive avoids rebuilding render targets and renderer-owned caches.
const SceneLighting = memo(function SceneLighting() {
  return <>
    <ambientLight intensity={0.45} color="#9caed1" />
    <directionalLight position={[-8, 8, 10]} intensity={2.4} color="#ffe3b0" />
    <directionalLight position={[8, -3, 5]} intensity={1.1} color="#7b9bcf" />
    <Environment resolution={128} frames={1} environmentIntensity={0.45}>
      <Lightformer form="rect" intensity={2.5} color="#ffe1b1" position={[-8, 6, 8]} scale={[12, 5, 1]} />
      <Lightformer form="rect" intensity={1.8} color="#8caee9" position={[8, 3, -6]} rotation={[0, Math.PI, 0]} scale={[10, 10, 1]} />
      <Lightformer form="ring" intensity={0.6} color="#eec48c" position={[0, -6, 6]} scale={8} />
    </Environment>
  </>
})

const ScenePostProcessing = memo(function ScenePostProcessing({ budget, enabled }: { budget: RenderBudget; enabled: boolean }) {
  const bloom = useRef<BloomEffect>(null)
  useFrame(() => { if (bloom.current) bloom.current.intensity = budget.bloomIntensity })
  return <EffectComposer enabled={enabled} multisampling={0}><Bloom ref={bloom} luminanceThreshold={1.05} intensity={0.8} mipmapBlur /></EffectComposer>
})

function Contents(props: SceneProps & { onReady: () => void; labels: LabelRefs; lighting: AlbumLightState; budget: RenderBudget }) {
  const { galaxy, selectedId, onInspectPlanet, playing, navigation, onToggleTarget, onPlayTarget, pulseTarget, toolsVisible, showOrbits, onReady, labels, selectedMetrics } = props
  const time = useRef(0)
  const world = useRef<Group>(null)
  const positions = useMemo(() => galaxy.planets.map(planet => new Vector3(...planet.position)), [galaxy])
  const selectedIndex = useMemo(() => galaxy.planets.findIndex(planet => planet.id === selectedId), [galaxy, selectedId])
  // Recomputed only when the clicked planet or its song data changes: the anchor keeps both
  // periods continuous, so switching planets never makes a body jump.
  const motion = useMemo<MotionOverride | null>(() => {
    if (!selectedMetrics || selectedIndex < 0) return null
    const planet = galaxy.planets[selectedIndex]
    const orbit = galaxy.orbits[planet.orbitIndex]
    const anchor = time.current
    return {
      orbitIndex: planet.orbitIndex,
      orbit: { ...orbit, angularVelocity: selectedMetrics.angularVelocity },
      orbitPhaseShift: anchor * (orbit.angularVelocity - selectedMetrics.angularVelocity),
      planetId: planet.id,
      rotationSpeed: selectedMetrics.rotationSpeed,
      spinPhaseShift: anchor * (planet.rotationSpeed - selectedMetrics.rotationSpeed),
    }
  }, [galaxy, selectedIndex, selectedMetrics])
  const orbitSpeed = useMemo(() => galaxy.orbits.reduce((sum, orbit, index) => sum + Math.abs(motion?.orbitIndex === index ? motion.orbit.angularVelocity : orbit.angularVelocity), 0) / Math.max(1, galaxy.orbits.length), [galaxy, motion])
  return <>
    <SimulationClock playing={playing} time={time} galaxy={galaxy} positions={positions} motion={motion} />
    <ImmersiveBackground seed={galaxy.backgroundSeed} time={time} budget={props.budget} bands={props.audioAnalysis.bandsRef} reducedMotion={props.reducedMotion} />
    <WorldMotion world={world} time={time} playing={playing} planetCount={galaxy.planets.length}>
      <group><AlbumStar {...props} time={time} onReady={onReady} /></group>
      <OrbitPaths galaxy={galaxy} visible={showOrbits} />
      {galaxy.planets.map((planet) => <group key={planet.id}>
        <Planet planet={planet} position={positions[planet.index]} selected={selectedId === planet.id} onInspect={() => onInspectPlanet(planet.id)} time={time} navigation={navigation} onToggleTarget={onToggleTarget} onPlayTarget={onPlayTarget} pulseTarget={pulseTarget} playing={playing} toolsVisible={toolsVisible} spin={motion && motion.planetId === planet.id ? { rotationSpeed: motion.rotationSpeed, phaseShift: motion.spinPhaseShift } : null} />
      </group>)}
      <group><HallGate /></group>
    </WorldMotion>
    <CameraFollow navigation={navigation} world={world} galaxy={galaxy} positions={positions} />
    <CameraDirector galaxy={galaxy} navigation={navigation} resetKey={props.resetKey} playing={playing} toolsVisible={toolsVisible} orbitSpeed={orbitSpeed} time={time} motionPreset={props.motionPreset} reducedMotion={props.reducedMotion} world={world} />
    <ProjectLabels galaxy={galaxy} labels={labels} world={world} positions={positions} navigation={navigation} playingPlanetId={props.playingPlanetId} />
    <SceneDiagnostics galaxy={galaxy} world={world} playing={playing} toolsVisible={toolsVisible} positions={positions} time={time} generation={props.generation} />
  </>
}

class SceneBoundary extends Component<{ children: ReactNode; album: Album; generation: number }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidUpdate(previous: { generation: number; album: Album }) {
    if (this.state.failed && (previous.generation !== this.props.generation || previous.album.cover !== this.props.album.cover)) this.setState({ failed: false })
  }
  render() {
    if (this.state.failed) return <div className="scene-fallback"><img src={this.props.album.cover} alt={this.props.album.name} /><p>3D 场景暂时无法显示</p><span>请开启浏览器硬件加速后刷新，专辑编辑仍可使用。</span></div>
    return this.props.children
  }
}

export default function GalaxyScene(props: SceneProps) {
  // A camera is a live scene object, not a fresh configuration object on each audio tick.
  const [camera] = useState(() => new PerspectiveCamera(36, 1, 0.1, 400))
  const [lighting] = useState(() => createAlbumLightState({}, props.galaxy.star.scale))
  const [renderDpr, setRenderDpr] = useState(() => Math.min(window.devicePixelRatio || 1, 1.31))
  const [budget] = useState(() => createRenderBudget(renderDpr))
  const [postEnabled, setPostEnabled] = useState(budget.postEnabled)
  const requestFrame = useRef<(() => void) | null>(null)
  const [visible, setVisible] = useState(() => !document.hidden)
  useEffect(() => {
    const updateVisibility = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])
  const moving = props.playing && visible
  const [readyGeneration, setReadyGeneration] = useState(-1)
  const markReady = useCallback(() => setReadyGeneration(props.generation), [props.generation])
  useEffect(() => {
    if (readyGeneration !== props.generation) return
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(notifyUniverseReady) })
    return () => cancelAnimationFrame(frame)
  }, [readyGeneration, props.generation])
  const labels = useRef(new Map<string, HTMLDivElement>())
  return <SceneBoundary album={props.album} generation={props.generation}>
    {readyGeneration !== props.generation && <div className="scene-loading" role="status" aria-label="正在加载专辑宇宙"><span className="loading-orbit" aria-hidden="true" /></div>}
    <Canvas key="space-camera-v5" frameloop={moving ? 'always' : 'demand'} camera={camera}
      dpr={renderDpr} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl, invalidate }) => { requestFrame.current = invalidate; gl.domElement.tabIndex = 0; gl.domElement.setAttribute('aria-label', '音乐星系，滚轮缩放，拖动空白环绕镜头，拖动恒星旋转封面，R 自由镜头，K 回正') }}
      fallback={<div className="scene-fallback"><img src={props.album.cover} alt={props.album.name} /><p>此浏览器不支持 WebGL，请使用支持 3D 的浏览器。</p></div>}>
      <RenderQualityController quality={props.quality} playing={moving} budget={budget} onDprChange={setRenderDpr} onPostEnabled={setPostEnabled} />
      <AudioAnalysisFrame analysis={props.audioAnalysis} enabled={visible} />
      <SceneLighting />
      <ScenePostProcessing budget={budget} enabled={postEnabled} />
      <AlbumLightTransition lighting={lighting} radius={props.galaxy.star.scale} />
      <Suspense fallback={null}><Contents key={props.generation} {...props} playing={moving} onReady={markReady} labels={labels} lighting={lighting} budget={budget} /></Suspense>
    </Canvas>
    {props.showLabels && <SceneLabels {...props} labels={labels} onLabelActivity={() => requestFrame.current?.()} />}
  </SceneBoundary>
}
