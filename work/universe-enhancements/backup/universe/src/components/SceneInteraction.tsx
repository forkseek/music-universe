import { useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { MathUtils, Vector2, Vector3 } from 'three'
import type { PerspectiveCamera } from 'three'
import { SpaceCameraController } from '../lib/spaceCamera'
import { isSurfaceEvent, markSurfaceEvent } from '../lib/sceneInput'
import type { Group } from 'three'
import { advanceAngularBody, createAngularBody, dragAngularBody, releaseAngularBody, stopAngularBody } from '../lib/albumRotationPhysics'
import { ALBUM_TARGET } from '../lib/galaxyNavigation'
import type { GalaxyNavigation } from '../hooks/useGalaxyNavigation'
import { getGalaxyFraming } from '../lib/sceneFraming'
import type { AlbumGalaxy } from '../lib/generateAlbumGalaxy'

type WorldRef = RefObject<Group | null>
type TimeRef = RefObject<number>

export function CameraDirector({ galaxy, navigation, resetKey, playing, toolsVisible, orbitSpeed, time }: { galaxy: AlbumGalaxy; navigation: GalaxyNavigation; resetKey: number; playing: boolean; toolsVisible: boolean; orbitSpeed: number; time: TimeRef }) {
  const { camera, size, gl, invalidate, events } = useThree()
  const framing = useMemo(() => getGalaxyFraming(size.width, size.height, galaxy.planets.length, galaxy.bounds), [size.width, size.height, galaxy.planets.length, galaxy.bounds])
  const reduced = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const motion = useMemo(() => new SpaceCameraController(camera as PerspectiveCamera, framing, navigation.setCameraMode), [camera, navigation.setCameraMode])
  const backdrop = useMemo(() => ({ x: 0, y: 0, scale: 1.08, rotation: 0, forward: new Vector3(), up: new Vector3(), frames: 0 }), [])
  const pointer = useMemo(() => new Vector2(), [])
  const initialReset = useRef(true)
  const followClock = useRef(time.current)
  useEffect(() => { motion.setOrbitFollowSpeed(orbitSpeed) }, [motion, orbitSpeed])
  useEffect(() => {
    motion.setFraming(framing)
    camera.far = Math.max(400, framing.distance * 4 + galaxy.bounds.depth)
    camera.updateProjectionMatrix()
    invalidate()
  }, [motion, framing, camera, galaxy.bounds.depth, invalidate])
  useEffect(() => { invalidate() }, [navigation.view, playing, toolsVisible, invalidate])
  useEffect(() => {
    if (initialReset.current) { initialReset.current = false; return }
    motion.recenter(); invalidate()
  }, [resetKey, motion, invalidate])
  useEffect(() => {
    const canvas = gl.domElement
    const eventHost = events.connected instanceof HTMLElement ? events.connected : canvas
    let dragPointer = -1, lastX = 0, lastY = 0, lastAt = 0, pointerSeen = false, hadLock = false, disposed = false
    const touches = new Set<number>()
    const releaseLock = () => { if (document.pointerLockElement === canvas) document.exitPointerLock() }
    const releaseCapture = () => { if (dragPointer >= 0 && canvas.hasPointerCapture(dragPointer)) canvas.releasePointerCapture(dragPointer); dragPointer = -1 }
    const recenter = () => {
      motion.recenter(); navigation.reset(); releaseCapture(); releaseLock(); pointerSeen = false; invalidate()
    }
    const requestLock = () => {
      canvas.focus({ preventScroll: true })
      if (!matchMedia('(pointer: fine)').matches || !canvas.requestPointerLock || document.pointerLockElement === canvas) return
      try { const result = canvas.requestPointerLock(); result?.catch(() => { pointerSeen = false }) } catch { pointerSeen = false }
    }
    const toggleFree = () => {
      window.dispatchEvent(new Event('pointercancel'))
      if (motion.getState().mode === 'free') recenter()
      else { navigation.releaseFollow(); motion.toggleFree(); requestLock(); pointerSeen = false; invalidate() }
    }
    navigation.cameraActions.current = { toggleFree, recenter, zoomFree: (pixels) => { motion.zoomFree(pixels); invalidate() }, getLookCenter: () => motion.getLookCenter() }
    navigation.projectAnchor.current = (view, point) => {
      const bounds = canvas.getBoundingClientRect()
      pointer.set((point.x - bounds.left) / bounds.width * 2 - 1, 1 - (point.y - bounds.top) / bounds.height * 2)
      return motion.projectAnchor(view, pointer)
    }
    const cancel = () => { touches.clear(); releaseCapture(); motion.cancel(); pointerSeen = false; canvas.style.cursor = ''; invalidate() }
    const down = (event: PointerEvent) => {
      if (event.target !== canvas) return
      motion.holdAutomaticMotion()
      if (event.pointerType === 'touch') touches.add(event.pointerId)
      if (touches.size > 1) { releaseCapture(); motion.endDrag(false); invalidate(); return }
      if (motion.getState().mode === 'free') { if (event.pointerType !== 'touch') requestLock(); lastX = event.clientX; lastY = event.clientY; pointerSeen = true; return }
      // R3F owns mesh input on this same host and runs before the camera listener.
      if (disposed || isSurfaceEvent(event) || event.button !== 0 || touches.size > 1 || navigation.pinching.current) return
      dragPointer = event.pointerId; lastX = event.clientX; lastY = event.clientY; lastAt = performance.now()
      canvas.setPointerCapture(event.pointerId); motion.beginDrag(); canvas.style.cursor = 'grabbing'; invalidate()
    }
    const move = (event: PointerEvent) => {
      if (event.buttons || touches.size > 0) motion.holdAutomaticMotion()
      if (navigation.pinching.current || touches.size > 1) { motion.endDrag(false); lastX = event.clientX; lastY = event.clientY; lastAt = performance.now(); return }
      if (motion.getState().mode === 'free') {
        if (document.pointerLockElement !== canvas && !pointerSeen) { lastX = event.clientX; lastY = event.clientY; pointerSeen = true; return }
        const dx = document.pointerLockElement === canvas ? event.movementX : pointerSeen ? event.clientX - lastX : 0
        const dy = document.pointerLockElement === canvas ? event.movementY : pointerSeen ? event.clientY - lastY : 0
        motion.look(dx, dy); lastX = event.clientX; lastY = event.clientY; pointerSeen = true; invalidate(); return
      }
      if (event.pointerId !== dragPointer) return
      const now = performance.now()
      motion.drag(event.clientX - lastX, event.clientY - lastY, (now - lastAt) / 1000)
      lastX = event.clientX; lastY = event.clientY; lastAt = now; invalidate()
    }
    const up = (event: PointerEvent) => {
      touches.delete(event.pointerId)
      if (event.pointerId !== dragPointer) return
      releaseCapture(); motion.endDrag(performance.now() - lastAt < 120 && !reduced && touches.size === 0); canvas.style.cursor = ''; invalidate()
    }
    const doubleClick = (event: MouseEvent) => { if (!disposed && event.target === canvas && !isSurfaceEvent(event)) recenter() }
    const movementKeys = /^(KeyW|KeyA|KeyS|KeyD|KeyQ|KeyE|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight)$/
    const editable = (event: KeyboardEvent) => event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable=true],button,a')
    const keyDown = (event: KeyboardEvent) => {
      if (motion.getState().mode !== 'free' || !movementKeys.test(event.code) || editable(event) || document.querySelector('dialog[open]')) return
      event.preventDefault(); motion.keys.add(event.code); invalidate()
    }
    const keyUp = (event: KeyboardEvent) => { if (movementKeys.test(event.code)) { motion.keys.delete(event.code); invalidate() } }
    const lockChanged = () => {
      const locked = document.pointerLockElement === canvas
      if (hadLock && !locked && motion.getState().mode === 'free') recenter()
      hadLock = locked; pointerSeen = false
    }
    const visibility = () => { if (document.hidden) { cancel(); releaseLock() } }
    eventHost.addEventListener('pointerdown', down)
    eventHost.addEventListener('pointermove', move)
    eventHost.addEventListener('dblclick', doubleClick)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    document.addEventListener('pointerlockchange', lockChanged)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      disposed = true
      eventHost.removeEventListener('pointerdown', down); eventHost.removeEventListener('pointermove', move); eventHost.removeEventListener('dblclick', doubleClick)
      window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel)
      window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp)
      document.removeEventListener('pointerlockchange', lockChanged); document.removeEventListener('visibilitychange', visibility)
      releaseCapture(); motion.cancel(); navigation.cameraActions.current = null; navigation.projectAnchor.current = null; releaseLock()
    }
  }, [motion, navigation.cameraActions, navigation.projectAnchor, navigation.reset, navigation.releaseFollow, navigation.pinching, gl, events.connected, pointer, reduced, invalidate])
  useFrame((_, delta) => {
    // Wheel zoom keeps the view center fixed; a touch pinch can supply its own
    // midpoint. Song inspection never changes either the camera center or distance.
    const view = navigation.viewRef.current
    const orbitalDelta = Math.max(0, time.current - followClock.current)
    followClock.current = time.current
    const target = navigation.followPointRef.current
    const result = motion.update(Math.min(delta, 0.08), view, playing && !toolsVisible, reduced, orbitalDelta, target)
    const state = motion.getState()
    const center = motion.getLookCenter()
    if (state.trackingTarget) {
      view.center[0] = center[0]; view.center[1] = center[1]; view.centerZ = center[2]
    }
    gl.domElement.dataset.cameraFollowTarget = state.trackingTarget ?? ''
    gl.domElement.dataset.cameraTargetLocked = String(state.targetLocked)
    gl.domElement.dataset.cameraLookCenter = JSON.stringify(center)
    gl.domElement.dataset.followPlanetPosition = target ? JSON.stringify(target.position) : ''
    gl.domElement.dataset.followStarPosition = target?.starPosition ? JSON.stringify(target.starPosition) : ''
    gl.domElement.dataset.cameraAxisLocked = String(state.axisLocked)
    gl.domElement.dataset.cameraAxisConstrained = String(state.axisConstrained)
    camera.updateMatrixWorld()
    backdrop.forward.set(0, 0, -1).applyQuaternion(camera.quaternion)
    backdrop.up.set(0, 1, 0).applyQuaternion(camera.quaternion)
    const limit = Math.min(size.width, size.height) * 0.06
    const tx = MathUtils.clamp((-backdrop.forward.x - (camera.position.x - navigation.viewRef.current.center[0]) * 0.05) * 46, -limit, limit)
    const ty = MathUtils.clamp((backdrop.forward.y + (camera.position.y - navigation.viewRef.current.center[1]) * 0.05) * 46, -limit, limit)
    const scale = MathUtils.clamp(1.08 + (framing.distance - state.radius) * 0.012, 1.08, 1.30)
    const roll = Math.atan2(backdrop.up.x, backdrop.up.y) * 180 / Math.PI
    const rotation = MathUtils.clamp(roll * 1.2 + state.theta * 8, -10, 10)
    const ease = 1 - Math.exp(-Math.min(delta, .12) * 6)
    backdrop.x = MathUtils.damp(backdrop.x, tx, 6, Math.min(delta, .12))
    backdrop.y = MathUtils.damp(backdrop.y, ty, 6, Math.min(delta, .12))
    backdrop.scale += (scale - backdrop.scale) * ease
    backdrop.rotation += (rotation - backdrop.rotation) * ease
    const backdropMoving = Math.abs(backdrop.x - tx) + Math.abs(backdrop.y - ty) + Math.abs(backdrop.scale - scale) + Math.abs(backdrop.rotation - rotation) > .0002
    const element = navigation.backdrop.current
    if (element) {
      element.style.transform = `translate3d(${backdrop.x.toFixed(4)}px,${backdrop.y.toFixed(4)}px,0) rotate(${backdrop.rotation.toFixed(5)}deg) scale(${backdrop.scale.toFixed(6)})`
      element.dataset.rotation = backdrop.rotation.toFixed(6)
      element.dataset.parallaxX = backdrop.x.toFixed(6); element.dataset.parallaxY = backdrop.y.toFixed(6)
      element.dataset.scale = backdrop.scale.toFixed(6)
    }
    gl.domElement.dataset.viewMode = 'continuous'
    gl.domElement.dataset.overview = String(navigation.overview.current)
    gl.domElement.dataset.hoverTarget = navigation.hover.current ?? ''
    gl.domElement.dataset.focusTarget = navigation.viewRef.current.target
    gl.domElement.dataset.zoom = navigation.viewRef.current.zoom.toFixed(6)
    gl.domElement.dataset.viewCenterX = view.center[0].toFixed(6)
    gl.domElement.dataset.viewCenterY = view.center[1].toFixed(6)
    gl.domElement.dataset.renderedZoom = (state.radius / framing.distance).toFixed(6)
    gl.domElement.dataset.cameraX = camera.position.x.toFixed(6); gl.domElement.dataset.cameraY = camera.position.y.toFixed(6); gl.domElement.dataset.cameraZ = camera.position.z.toFixed(6)
    gl.domElement.dataset.cameraMode = state.mode
    gl.domElement.dataset.cameraTheta = state.theta.toFixed(6); gl.domElement.dataset.cameraPhi = state.phi.toFixed(6)
    gl.domElement.dataset.cameraRoll = state.roll.toFixed(6); gl.domElement.dataset.cameraFov = (camera as PerspectiveCamera).fov.toFixed(6)
    gl.domElement.dataset.cameraMoving = String(result.moving || (!result.drifting && backdropMoving))
    gl.domElement.dataset.cameraDrifting = String(result.drifting)
    gl.domElement.dataset.cameraAutoFollowing = String(state.following)
    gl.domElement.dataset.cameraFollowPhase = state.followPhase.toFixed(6)
    gl.domElement.dataset.cameraFollowSpeed = state.followSpeed.toFixed(6)
    gl.domElement.dataset.cameraQuaternion = JSON.stringify(camera.quaternion.toArray())
    gl.domElement.dataset.frameCount = String(++backdrop.frames)
    if (result.moving || result.drifting || backdropMoving) invalidate()
  }, -0.5)
  return null
}


/** Surface gestures never rotate or reorder the solar-system layout. */
export function useSurfaceGesture({ target, navigation, onInspect, onToggle, onPlay, inspectOnClick, inertial = false, playing = false, autoSpeed = 0 }: { target: string; navigation: GalaxyNavigation; onInspect: () => void; onToggle: (target: string) => void; onPlay?: (target: string) => void; inspectOnClick: boolean; inertial?: boolean; playing?: boolean; autoSpeed?: number }) {
  const { invalidate, gl } = useThree()
  const rotation = useRef({ yaw: 0, pitch: 0 })
  const body = useMemo(() => inertial ? createAngularBody() : null, [inertial])
  const reduced = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const gesture = useRef({ pressed: false, dragging: false, moved: false, x: 0, y: 0, lastX: 0, lastY: 0, lastMoveAt: 0, tapAt: 0, tapX: 0, tapY: 0, handledAt: -1000, pointer: -1 })
  type CaptureTarget = { setPointerCapture: (id: number) => void; releasePointerCapture: (id: number) => void }
  const captured = useRef<CaptureTarget | null>(null)
  const releaseCapture = () => {
    if (captured.current) { try { captured.current.releasePointerCapture(gesture.current.pointer) } catch { /* Cancellation may already have released capture. */ } }
    captured.current = null
  }
  const clear = (redraw = true) => {
    releaseCapture()
    gesture.current.pressed = false; gesture.current.dragging = false; gesture.current.moved = true; gesture.current.tapAt = 0
    if (body) stopAngularBody(body)
    document.body.style.cursor = ''
    if (redraw) invalidate()
  }
  useEffect(() => {
    const reset = () => clear()
    window.addEventListener('pointercancel', reset)
    window.addEventListener('blur', reset)
    return () => { window.removeEventListener('pointercancel', reset); window.removeEventListener('blur', reset); clear(false) }
  }, [body])
  useEffect(() => { if (body && (!playing || reduced)) { stopAngularBody(body); invalidate() } }, [body, playing, reduced, invalidate])
  useFrame((_, delta) => {
    if (!body) return
    if (navigation.pinching.current) { stopAngularBody(body); gesture.current.moved = true; gesture.current.tapAt = 0 }
    const moving = advanceAngularBody(body, Math.min(delta, 0.08), { active: playing, dragging: gesture.current.dragging, reducedMotion: reduced, autoSpeed })
    rotation.current.yaw = body.angles.yaw; rotation.current.pitch = body.angles.pitch
    gl.domElement.dataset.starYaw = body.angles.yaw.toFixed(6)
    gl.domElement.dataset.starPitch = body.angles.pitch.toFixed(6)
    gl.domElement.dataset.starAngularSpeed = body.velocity.length().toFixed(6)
    gl.domElement.dataset.starSimulationTime = body.elapsed.toFixed(6)
    gl.domElement.dataset.starDragging = String(gesture.current.dragging)
    gl.domElement.dataset.starSpinning = String(moving)
    gl.domElement.dataset.starQuaternion = JSON.stringify(body.orientation.toArray())
    gl.domElement.dataset.starArtworkMapping = 'paired-hemispheres'
    if (moving) invalidate()
  }, -0.1)
  const handlers = {
    onPointerDown: (event: ThreeEvent<PointerEvent>) => {
      if (navigation.cameraModeRef.current === 'free') return
      markSurfaceEvent(event.nativeEvent)
      event.stopPropagation()
      const state = gesture.current
      if (state.pressed && state.pointer !== event.pointerId) { state.moved = true; state.tapAt = 0; if (body) stopAngularBody(body); return }
      if (body) stopAngularBody(body)
      state.pressed = true; state.moved = false; state.x = state.lastX = event.clientX; state.y = state.lastY = event.clientY; state.pointer = event.pointerId; state.lastMoveAt = performance.now()
      state.tapAt = navigation.pinching.current ? 0 : state.tapAt
      state.dragging = true
      captured.current = event.target as unknown as CaptureTarget
      captured.current.setPointerCapture(event.pointerId)
      document.body.style.cursor = 'grabbing'
      invalidate()
    },
    onPointerMove: (event: ThreeEvent<PointerEvent>) => {
      const state = gesture.current
      if (!state.pressed || state.pointer !== event.pointerId) return
      const now = performance.now()
      if (navigation.pinching.current) {
        state.moved = true; state.tapAt = 0; state.lastX = event.clientX; state.lastY = event.clientY; state.lastMoveAt = now
        if (body) stopAngularBody(body)
        return
      }
      if (Math.hypot(event.clientX - state.x, event.clientY - state.y) > 7) state.moved = true
      if (!state.dragging) return
      event.stopPropagation()
      if (body) {
        dragAngularBody(body, (event.clientX - state.lastX) * 0.008, (event.clientY - state.lastY) * 0.006, (now - state.lastMoveAt) / 1000)
        rotation.current.yaw = body.angles.yaw; rotation.current.pitch = body.angles.pitch
      } else {
        rotation.current.yaw = MathUtils.clamp(rotation.current.yaw + (event.clientX - state.lastX) * 0.004, -0.75, 0.75)
        rotation.current.pitch = MathUtils.clamp(rotation.current.pitch + (event.clientY - state.lastY) * 0.002, -0.2, 0.2)
      }
      state.lastX = event.clientX; state.lastY = event.clientY; state.lastMoveAt = now
      gl.domElement.dataset.surfaceYaw = rotation.current.yaw.toFixed(4)
      gl.domElement.dataset.surfacePitch = rotation.current.pitch.toFixed(4)
      invalidate()
    },
    onPointerUp: (event: ThreeEvent<PointerEvent>) => {
      const state = gesture.current
      if (state.pointer !== event.pointerId) return
      releaseCapture()
      if (body) releaseAngularBody(body, (performance.now() - state.lastMoveAt) / 1000, state.moved && playing && !reduced && !navigation.pinching.current)
      state.dragging = false; document.body.style.cursor = ''
      invalidate()
      if (!state.pressed) return
      state.pressed = false
      if (state.moved) { state.tapAt = 0; return }
      if (event.pointerType === 'mouse') return
      event.stopPropagation()
      const now = performance.now()
      if (state.tapAt > 0 && now - state.tapAt < 380 && Math.hypot(event.clientX - state.tapX, event.clientY - state.tapY) < 24) {
        state.tapAt = 0; state.handledAt = now; (onPlay ?? onToggle)(target)
      } else { state.tapAt = now; state.tapX = event.clientX; state.tapY = event.clientY }
    },
    onPointerCancel: () => clear(),
    onClick: (event: ThreeEvent<MouseEvent>) => { if (navigation.cameraModeRef.current === 'free') return; event.stopPropagation(); if (!gesture.current.moved && inspectOnClick) onInspect() },
    onDoubleClick: (event: ThreeEvent<MouseEvent>) => {
      if (navigation.cameraModeRef.current === 'free') return
      markSurfaceEvent(event.nativeEvent)
      event.stopPropagation()
      if (!gesture.current.moved && performance.now() - gesture.current.handledAt > 700) (onPlay ?? onToggle)(target)
    },
  }
  return { rotation, handlers, orientation: body?.orientation }
}

/**
 * 把当前歌曲星球的真实世界坐标交给镜头：包括公转、星系旋转和 Z 深度。
 * 镜头锁定与动画暂停相互独立；只有用户解除时才停止注视该星球。
 */
export function CameraFollow({ navigation, world, galaxy, positions }: { navigation: GalaxyNavigation; world: WorldRef; galaxy: AlbumGalaxy; positions: Vector3[] }) {
  const { invalidate } = useThree()
  const point = useMemo(() => new Vector3(), [])
  const starPoint = useMemo(() => new Vector3(), [])
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
    starPoint.set(...galaxy.star.position)
    world.current.localToWorld(starPoint)
    const previous = navigation.followPointRef.current
    const changed = !previous || previous.id !== target || Math.hypot(point.x - previous.position[0], point.y - previous.position[1], point.z - previous.position[2]) > 1e-6
    if (!previous || previous.id !== target) navigation.followPointRef.current = { id: target, position: [point.x, point.y, point.z], starPosition: [starPoint.x, starPoint.y, starPoint.z] }
    else {
      previous.position[0] = point.x; previous.position[1] = point.y; previous.position[2] = point.z
      previous.starPosition ??= [0, 0, 0]
      previous.starPosition[0] = starPoint.x; previous.starPosition[1] = starPoint.y; previous.starPosition[2] = starPoint.z
    }
    if (changed) invalidate()
  }, -0.6)
  return null
}

export function PlaybackHalo({ radius, time, playing }: { radius: number; time: TimeRef; playing: boolean }) {
  const rings = useRef<Group>(null)
  useFrame(() => { if (rings.current) { rings.current.rotation.z = -0.22 + time.current * 0.08; rings.current.scale.setScalar(1 + Math.sin(time.current * 2.3) * 0.008) } })
  return <group ref={rings} rotation={[0.35, -0.1, -0.22]} name="gesture-playback-halo">
    <mesh><torusGeometry args={[radius * 1.28, radius * 0.008, 8, 128]} /><meshBasicMaterial color={[1.6, 1.1, 0.52]} toneMapped={false} transparent opacity={playing ? 0.55 : 0.12} depthWrite={false} /></mesh>
    <mesh rotation={[0.08, 0, 0]}><torusGeometry args={[radius * 1.42, radius * 0.004, 6, 128]} /><meshBasicMaterial color="#abc6de" transparent opacity={playing ? 0.23 : 0.06} depthWrite={false} /></mesh>
  </group>
}

export function SceneDiagnostics({ galaxy, world, playing, toolsVisible, positions, time, generation }: { galaxy: AlbumGalaxy; world: WorldRef; playing: boolean; toolsVisible: boolean; positions: Vector3[]; time: TimeRef; generation: number }) {
  const { camera, size, gl, scene, get } = useThree()
  const position = useMemo(() => new Vector3(), [])
  const edge = useMemo(() => new Vector3(), [])
  const right = useMemo(() => new Vector3(1, 0, 0), [])
  const sampledAt = useRef(-Infinity)
  const nodes = useMemo(() => [{ id: ALBUM_TARGET, position: new Vector3(...galaxy.star.position), radius: galaxy.star.scale }, ...galaxy.planets.map(planet => ({ id: planet.id, position: positions[planet.index], radius: planet.scale }))], [galaxy, positions])
  useFrame(() => {
    gl.domElement.dataset.playing = String(playing)
    gl.domElement.dataset.sceneMode = toolsVisible ? 'studio' : 'immersive'
    // Expensive diagnostic serialization is sampled, never performed 60 times/s.
    const now = performance.now()
    if (playing && now - sampledAt.current < 250) return
    sampledAt.current = now
    world.current?.updateMatrixWorld(true)
    gl.domElement.dataset.projectedTargets = JSON.stringify(nodes.map(node => {
      position.copy(node.position); world.current?.localToWorld(position)
      edge.copy(position).addScaledVector(right, node.radius).project(camera)
      position.project(camera)
      return { id: node.id, x: (position.x * 0.5 + 0.5) * size.width, y: (-position.y * 0.5 + 0.5) * size.height, radius: Math.abs(edge.x - position.x) * size.width * 0.5 }
    }))
    let stars = 0, planets = 0, systems = 0, orbits = 0
    scene.traverse(object => {
      if (object.name === 'album-star') stars++
      if (/^track-\d+$/.test(object.name)) planets++
      if (object.name === 'album-solar-system') systems++
      if (/^orbit-\d+$/.test(object.name)) orbits++
    })
    gl.domElement.dataset.sceneObjectCount = String(stars + planets)
    gl.domElement.dataset.sceneSystems = String(systems)
    gl.domElement.dataset.orbitCount = String(orbits)
    gl.domElement.dataset.generation = String(generation)
    gl.domElement.dataset.numericSeed = String(galaxy.numericSeed)
    gl.domElement.dataset.simulationTime = time.current.toFixed(6)
    gl.domElement.dataset.worldSpinZ = world.current?.rotation.z.toFixed(6) ?? '0'
    gl.domElement.dataset.orbitalPositions = JSON.stringify(positions.map(point => point.toArray()))
    gl.domElement.dataset.gpuResources = JSON.stringify({ ...gl.info.memory, programs: gl.info.programs?.length ?? 0 })
    gl.domElement.dataset.frameSubscribers = String(get().internal.subscribers.length)
    gl.domElement.dataset.renderLoop = get().frameloop
    gl.domElement.dataset.flightVisible = 'true'
    gl.domElement.dataset.projection = 'perspective'
  })
  return null
}
