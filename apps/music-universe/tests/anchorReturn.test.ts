import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PerspectiveCamera, Vector3 } from 'three'
import { CAMERA_ANCHOR_RANGES, DEFAULT_CAMERA_ANCHOR_CONFIG, SpaceCameraController } from '../src/lib/spaceCamera'
import type { CameraFollowTarget } from '../src/lib/spaceCamera'
import { initialGalaxyView, zoomGalaxyView } from '../src/lib/galaxyNavigation'
import type { GalaxyView } from '../src/lib/galaxyNavigation'
import { getGalaxyFraming } from '../src/lib/sceneFraming'

const star: [number, number, number] = [-3, 1, -2]
const target: CameraFollowTarget = { id: 'song', position: [7, 3, 1], starPosition: star }
const atAnchor = (view: GalaxyView, point: [number, number, number]): GalaxyView => ({ ...view, center: [point[0], point[1]], centerZ: point[2] })
function fixture() {
  const framing = getGalaxyFraming(1600, 900)
  const camera = new PerspectiveCamera(36, 1600 / 900, 0.1, 400)
  const controller = new SpaceCameraController(camera, framing, () => {}, undefined, 'still')
  let view = { ...initialGalaxyView(), zoom: 0.42 }
  for (let frame = 0; frame < 180; frame++) controller.update(1 / 60, view, false, false, 1 / 60, target)
  view = atAnchor(view, target.position)
  return { camera, controller, framing, view }
}

test('explicit star anchor return translates gaze and camera smoothly while keeping zoom, angles, mode and preset', () => {
  const { camera, controller, view } = fixture()
  const pose = camera.position.clone(), quaternion = camera.quaternion.clone(), before = controller.getState()
  const nextView = atAnchor(view, star)
  assert.equal(controller.returnToStarAnchor(star), true)
  controller.update(0, nextView, false, false)
  assert.ok(camera.position.distanceTo(pose) < 1e-12)
  assert.ok(1 - Math.abs(camera.quaternion.dot(quaternion)) < 1e-12)
  let previous = pose
  for (let frame = 0; frame < 90; frame++) {
    controller.update(1 / 60, nextView, false, false)
    const state = controller.getState()
    assert.ok(Math.abs(state.radius - before.radius) < 1e-10)
    assert.ok(Math.abs(state.theta - before.theta) < 1e-10)
    assert.ok(Math.abs(state.phi - before.phi) < 1e-10)
    assert.ok(1 - Math.abs(camera.quaternion.dot(quaternion)) < 1e-12)
    assert.ok(camera.position.distanceTo(previous) < 0.4, 'no single-frame teleport')
    previous = camera.position.clone()
  }
  assert.deepEqual(controller.getLookCenter(), star)
  assert.equal(controller.getState().returningToStarAnchor, false)
  assert.equal(controller.getState().mode, before.mode)
  assert.equal(controller.getState().motionPreset, before.motionPreset)
  assert.equal(controller.getState().axisConstrained, false)
  assert.equal(controller.getState().trackingTarget, null)
  assert.equal(nextView.zoom, view.zoom)
  assert.equal(camera.fov, 36)
  const projected = new Vector3(...star).project(camera)
  assert.ok(Math.hypot(projected.x, projected.y) < 1e-10)
})

test('anchor return has identical mid-transition position across frame rates', () => {
  const low = fixture(), high = fixture()
  for (const [entry, fps] of [[low, 30], [high, 144]] as const) {
    entry.controller.returnToStarAnchor(star)
    const view = atAnchor(entry.view, star)
    for (let frame = 0; frame < fps / 2; frame++) entry.controller.update(1 / fps, view, false, false)
  }
  assert.ok(low.camera.position.distanceTo(high.camera.position) < 1e-10)
  assert.ok(new Vector3(...low.controller.getLookCenter()).distanceTo(new Vector3(...high.controller.getLookCenter())) < 1e-10)
})

test('wheel zoom during anchor return remains continuous and does not reset direction or requested zoom', () => {
  const { camera, controller, framing, view } = fixture()
  const quaternion = camera.quaternion.clone()
  let nextView = atAnchor(view, star)
  controller.returnToStarAnchor(star)
  for (let frame = 0; frame < 180; frame++) {
    const pose = camera.position.clone()
    if (frame > 10 && frame < 35) nextView = zoomGalaxyView(nextView, -3)
    controller.update(1 / 60, nextView, false, false)
    assert.ok(camera.position.distanceTo(pose) < 0.5)
    assert.ok(1 - Math.abs(camera.quaternion.dot(quaternion)) < 1e-12)
  }
  assert.deepEqual(controller.getLookCenter(), star)
  assert.ok(Math.abs(controller.getState().radius - framing.distance * nextView.zoom) < 1e-10)
  assert.ok(nextView.zoom < view.zoom)
  assert.equal(controller.getState().mode, 'orbit')
})

test('reacquiring a song interrupts anchor return from the rendered pose and relocks its axis', () => {
  const { camera, controller, view } = fixture()
  const nextView = atAnchor(view, star)
  controller.returnToStarAnchor(star)
  for (let frame = 0; frame < 12; frame++) controller.update(1 / 60, nextView, false, false)
  const pose = camera.position.clone()
  const nextTarget: CameraFollowTarget = { id: 'next-song', position: [-8, 4, -1], starPosition: star }
  controller.update(0, nextView, false, false, 0, nextTarget)
  assert.ok(camera.position.distanceTo(pose) < 1e-10)
  assert.equal(controller.getState().returningToStarAnchor, false)
  for (let frame = 0; frame < 90; frame++) controller.update(1 / 60, nextView, false, false, 1 / 60, nextTarget)
  const screen = new Vector3(...nextTarget.position).project(camera)
  assert.ok(Math.hypot(screen.x, screen.y) < 1e-10)
  assert.equal(controller.getState().axisLocked, true)
  assert.equal(controller.getState().trackingTarget, 'next-song')
})

test('free camera anchor return keeps free mode, FOV, quaternion and controls', () => {
  const { camera, controller, view } = fixture()
  controller.toggleFree()
  controller.look(40, -30)
  controller.keys.add('KeyQ')
  for (let frame = 0; frame < 20; frame++) controller.update(1 / 60, view, false, false)
  controller.keys.clear()
  controller.zoomFree(-30)
  for (let frame = 0; frame < 180; frame++) controller.update(1 / 60, view, false, false)
  const pose = camera.position.clone(), quaternion = camera.quaternion.clone(), fov = camera.fov
  const nextView = atAnchor(view, star)
  controller.returnToStarAnchor(star)
  controller.update(0, nextView, false, false)
  assert.ok(camera.position.distanceTo(pose) < 1e-10)
  for (let frame = 0; frame < 90; frame++) controller.update(1 / 60, nextView, false, false)
  assert.equal(controller.getState().mode, 'free')
  assert.equal(camera.fov, fov)
  assert.ok(1 - Math.abs(camera.quaternion.dot(quaternion)) < 1e-12)
  assert.deepEqual(controller.getLookCenter(), star)
  const projected = new Vector3(...star).project(camera)
  assert.ok(Math.hypot(projected.x, projected.y) < 1e-10)
  const returnedPose = camera.position.clone()
  controller.keys.add('KeyD')
  for (let frame = 0; frame < 60; frame++) controller.update(1 / 60, nextView, false, false)
  assert.ok(camera.position.distanceTo(returnedPose) > 1.9)
})

test('reduced motion shortens explicit anchor return while preserving the rendered orientation', () => {
  const { camera, controller, view } = fixture()
  const quaternion = camera.quaternion.clone()
  controller.returnToStarAnchor(star)
  for (let frame = 0; frame < 12; frame++) controller.update(1 / 60, atAnchor(view, star), false, true)
  assert.deepEqual(controller.getLookCenter(), star)
  assert.equal(controller.getState().returningToStarAnchor, false)
  assert.ok(1 - Math.abs(camera.quaternion.dot(quaternion)) < 1e-12)
})

test('invalid anchor points and in-progress recenter do not replace the real reset', () => {
  const { camera, controller, view } = fixture()
  const pose = camera.position.clone()
  assert.equal(controller.returnToStarAnchor([NaN, 0, 0]), false)
  assert.ok(camera.position.distanceTo(pose) < 1e-12)
  controller.recenter()
  assert.equal(controller.returnToStarAnchor(star), false)
  for (let frame = 0; frame < 90; frame++) controller.update(1 / 60, initialGalaxyView(), false, false)
  assert.deepEqual(controller.getLookCenter(), getGalaxyFraming(1600, 900).target)
  assert.equal(controller.getState().mode, 'orbit')
  assert.ok(controller.getState().radius > getGalaxyFraming(1600, 900).distance * view.zoom)
  assert.ok(DEFAULT_CAMERA_ANCHOR_CONFIG.returnSeconds >= CAMERA_ANCHOR_RANGES.returnSeconds[0])
  assert.ok(DEFAULT_CAMERA_ANCHOR_CONFIG.returnSeconds <= CAMERA_ANCHOR_RANGES.returnSeconds[1])
})
