import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PerspectiveCamera, Vector3 } from 'three'
import { CameraMotionBlend, DEFAULT_CAMERA_MOTION_CONFIG, DEFAULT_CAMERA_MOTION_PRESET } from '../src/lib/cameraMotion'
import type { CameraMotionPreset } from '../src/lib/cameraMotion'
import { SpaceCameraController } from '../src/lib/spaceCamera'
import type { CameraFollowTarget } from '../src/lib/spaceCamera'
import { initialGalaxyView, zoomGalaxyView } from '../src/lib/galaxyNavigation'
import { getGalaxyFraming } from '../src/lib/sceneFraming'
import { readReducedMotion, REDUCED_MOTION_QUERY, subscribeReducedMotion } from '../src/hooks/useReducedMotion'

function fixture(preset: CameraMotionPreset = 'cruise') {
  const framing = getGalaxyFraming(1600, 900)
  const camera = new PerspectiveCamera(36, 1600 / 900, 0.1, 400)
  const controller = new SpaceCameraController(camera, framing, () => {}, undefined, preset)
  return { camera, controller, framing }
}

test('gentle is the UI default and preset blending integrates speed across frame rates', () => {
  assert.equal(DEFAULT_CAMERA_MOTION_PRESET, 'gentle')
  assert.equal(DEFAULT_CAMERA_MOTION_CONFIG.gentleAmplitude, 0.3)
  assert.equal(DEFAULT_CAMERA_MOTION_CONFIG.gentleSpeed, 0.3)
  const integrate = (fps: number) => {
    const blend = new CameraMotionBlend('cruise')
    blend.setPreset('still')
    let distance = 0
    for (let frame = 0; frame < fps * 2; frame++) distance += blend.advance(1 / fps).averageSpeed / fps
    assert.equal(blend.value.transitioning, false)
    assert.equal(blend.value.speed, 0)
    return distance
  }
  assert.ok(Math.abs(integrate(30) - integrate(144)) < 1e-12)
  assert.ok(Math.abs(integrate(60) - 0.35) < 1e-12)
})

test('interrupted preset transitions remain continuous and invalid tuning is rejected', () => {
  const blend = new CameraMotionBlend('cruise')
  blend.setPreset('still')
  blend.advance(0.2)
  const before = { ...blend.value }
  blend.setPreset('gentle')
  const after = blend.advance(0)
  assert.equal(after.amplitude, before.amplitude)
  assert.equal(after.speed, before.speed)
  blend.advance(0.7)
  assert.equal(blend.value.amplitude, 0.3)
  assert.equal(blend.value.speed, 0.3)
  assert.throws(() => new CameraMotionBlend('gentle', { ...DEFAULT_CAMERA_MOTION_CONFIG, transitionSeconds: 0 }), RangeError)
  assert.throws(() => new CameraMotionBlend('gentle', { ...DEFAULT_CAMERA_MOTION_CONFIG, gentleSpeed: NaN }), RangeError)
})

test('still stops autonomous motion at the current pose, while manual zoom and drag continue', () => {
  const { camera, controller, framing } = fixture()
  let view = initialGalaxyView()
  for (let frame = 0; frame < 600; frame++) controller.update(1 / 60, view, true, false)
  const before = camera.position.clone()
  const zoomBefore = view.zoom
  controller.setMotionPreset('still')
  controller.update(0, view, true, false)
  assert.ok(before.distanceTo(camera.position) < 1e-12, 'preset selection itself must not move the pose')
  let previous = before
  for (let frame = 0; frame < 90; frame++) {
    controller.update(1 / 60, view, true, false)
    assert.ok(previous.distanceTo(camera.position) < framing.distance * 0.002)
    previous = camera.position.clone()
  }
  const stopped = camera.position.clone(), orientation = camera.quaternion.clone()
  for (let frame = 0; frame < 240; frame++) controller.update(1 / 60, view, true, false)
  assert.equal(controller.getState().drifting, false)
  assert.equal(controller.getState().followSpeed, 0)
  assert.ok(stopped.distanceTo(camera.position) < 1e-12)
  assert.ok(1 - Math.abs(orientation.dot(camera.quaternion)) < 1e-12)
  assert.equal(view.zoom, zoomBefore)
  view = zoomGalaxyView(view, -100)
  for (let frame = 0; frame < 180; frame++) controller.update(1 / 60, view, true, false)
  assert.ok(controller.getState().radius < framing.distance * zoomBefore)
  const zoomed = camera.position.clone()
  controller.beginDrag(); controller.drag(80, -20, 1 / 60); controller.endDrag(false)
  for (let frame = 0; frame < 120; frame++) controller.update(1 / 60, view, true, false)
  assert.ok(camera.position.distanceTo(zoomed) > 1)
})

test('gentle progresses more slowly than cruise without rescaling the accumulated orbit phase', () => {
  const gentle = fixture('gentle'), cruise = fixture('cruise')
  const view = initialGalaxyView()
  for (let frame = 0; frame < 900; frame++) {
    gentle.controller.update(1 / 60, view, true, false)
    cruise.controller.update(1 / 60, view, true, false)
  }
  assert.ok(Math.abs(gentle.controller.getState().followPhase / cruise.controller.getState().followPhase - 0.3) < 1e-12)
  const phase = cruise.controller.getState().followPhase
  const pose = cruise.camera.position.clone()
  cruise.controller.setMotionPreset('gentle')
  cruise.controller.update(0, view, true, false)
  assert.equal(cruise.controller.getState().followPhase, phase)
  assert.ok(cruise.camera.position.distanceTo(pose) < 1e-12)
  for (let frame = 0; frame < 90; frame++) cruise.controller.update(1 / 60, view, true, false)
  assert.equal(cruise.controller.getState().motionSpeed, 0.3)
  assert.ok(cruise.controller.getState().followPhase >= phase)
})

test('runtime reduced motion freezes existing drift without a jump, yet preserves input and target tracking', () => {
  const { camera, controller } = fixture()
  let view = initialGalaxyView()
  for (let frame = 0; frame < 900; frame++) controller.update(1 / 60, view, true, false)
  const pose = camera.position.clone(), orientation = camera.quaternion.clone(), phase = controller.getState().followPhase
  for (let frame = 0; frame < 120; frame++) controller.update(1 / 60, view, true, true)
  assert.ok(camera.position.distanceTo(pose) < 1e-12)
  assert.ok(1 - Math.abs(camera.quaternion.dot(orientation)) < 1e-12)
  assert.equal(controller.getState().followPhase, phase)
  assert.equal(controller.getState().drifting, false)
  assert.equal(controller.getState().followSpeed, 0)
  view = zoomGalaxyView(view, -60)
  for (let frame = 0; frame < 120; frame++) controller.update(1 / 60, view, true, true)
  assert.ok(camera.position.distanceTo(pose) > 1)
  for (let frame = 0; frame < 120; frame++) {
    const target: CameraFollowTarget = { id: 'song', position: [8 + frame * 0.01, 2, 1], starPosition: [-3, 0, 0] }
    controller.update(1 / 60, view, true, true, 1 / 60, target)
    const outward = new Vector3(...target.position).sub(new Vector3(...target.starPosition!))
    const toCamera = camera.position.clone().sub(new Vector3(...target.position))
    assert.ok(toCamera.clone().cross(outward).length() / outward.length() / toCamera.length() < 1e-10)
    const projected = new Vector3(...target.position).project(camera)
    assert.ok(Math.hypot(projected.x, projected.y) < 1e-10)
  }
})

test('still keeps camera -> planet -> star tracking for a moving target and preserves follow release', () => {
  const { camera, controller } = fixture('still')
  let view = { ...initialGalaxyView(), zoom: 0.6 }
  for (let frame = 0; frame < 240; frame++) {
    const target: CameraFollowTarget = { id: 'song', position: [Math.cos(frame / 300) * 8, Math.sin(frame / 300) * 8, 2], starPosition: [0, 0, 0] }
    controller.update(1 / 60, view, true, false, 1 / 60, target)
    if (frame > 60) {
      const outward = new Vector3(...target.position)
      const toCamera = camera.position.clone().sub(outward)
      assert.ok(toCamera.clone().cross(outward).length() / outward.length() / toCamera.length() < 1e-10)
      assert.ok(toCamera.dot(outward) > 0)
    }
  }
  const [x, y, z] = controller.getLookCenter()
  view = { ...view, center: [x, y], centerZ: z }
  const pose = camera.position.clone()
  for (let frame = 0; frame < 180; frame++) controller.update(1 / 60, view, true, false)
  assert.equal(controller.getState().trackingTarget, null)
  assert.equal(controller.getState().axisConstrained, false)
  assert.ok(camera.position.distanceTo(pose) < 1e-9)
})

test('free-camera reduced motion removes release inertia but preserves manual movement, look, and zoom', () => {
  const { camera, controller } = fixture('still')
  controller.toggleFree()
  controller.keys.add('KeyW')
  for (let frame = 0; frame < 60; frame++) controller.update(1 / 60, initialGalaxyView(), true, false)
  controller.keys.clear()
  const pose = camera.position.clone()
  for (let frame = 0; frame < 120; frame++) controller.update(1 / 60, initialGalaxyView(), true, true)
  assert.ok(camera.position.distanceTo(pose) < 1e-12)
  controller.keys.add('KeyD')
  for (let frame = 0; frame < 30; frame++) controller.update(1 / 60, initialGalaxyView(), true, true)
  assert.ok(camera.position.distanceTo(pose) > 1)
  controller.keys.clear(); controller.look(20, -10); controller.zoomFree(-20)
  controller.update(1 / 60, initialGalaxyView(), true, true)
  assert.equal(controller.getState().mode, 'free')
  assert.ok(camera.quaternion.toArray().every(Number.isFinite))
  assert.ok(camera.fov < 36)
})

test('reduced-motion external store follows runtime changes and removes its listener', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const listeners = new Set<() => void>()
  const query = {
    matches: false,
    addEventListener: (type: string, listener: () => void) => { assert.equal(type, 'change'); listeners.add(listener) },
    removeEventListener: (type: string, listener: () => void) => { assert.equal(type, 'change'); listeners.delete(listener) },
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: (value: string) => { assert.equal(value, REDUCED_MOTION_QUERY); return query } } })
  try {
    let changes = 0
    assert.equal(readReducedMotion(), false)
    const unsubscribe = subscribeReducedMotion(() => { changes++ })
    query.matches = true
    for (const listener of listeners) listener()
    assert.equal(readReducedMotion(), true)
    assert.equal(changes, 1)
    unsubscribe()
    assert.equal(listeners.size, 0)
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
