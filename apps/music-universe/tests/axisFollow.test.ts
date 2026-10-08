import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PerspectiveCamera, Vector3 } from 'three'
import { SpaceCameraController } from '../src/lib/spaceCamera'
import type { CameraFollowTarget } from '../src/lib/spaceCamera'
import { initialGalaxyView, zoomGalaxyView } from '../src/lib/galaxyNavigation'
import { getGalaxyFraming } from '../src/lib/sceneFraming'

function fixture() {
  const framing = getGalaxyFraming(1600, 900)
  const camera = new PerspectiveCamera(36, 1600 / 900, 0.1, 400)
  return { camera, framing, controller: new SpaceCameraController(camera, framing, () => {}) }
}
function assertAxis(camera: PerspectiveCamera, target: CameraFollowTarget) {
  const toCamera = camera.position.clone().sub(new Vector3(...target.position))
  const outward = new Vector3(...target.position).sub(new Vector3(...target.starPosition!))
  assert.ok(toCamera.clone().cross(outward).length() / toCamera.length() / outward.length() < 1e-10)
  assert.ok(toCamera.dot(outward) > 0, 'the planet must lie between the camera and star')
  assert.ok(new Vector3(...target.position).project(camera).length() > 0) // finite perspective depth
  const screen = new Vector3(...target.position).project(camera)
  assert.ok(Math.hypot(screen.x, screen.y) < 1e-10)
}
function targetAt(seconds: number): CameraFollowTarget {
  const star: [number, number, number] = [-2 + Math.sin(seconds) * .3, 1.1, -3]
  return { id: 'song', starPosition: star, position: [star[0] + Math.cos(seconds * .4) * 7, star[1] + Math.sin(seconds * .4) * 5, star[2] + Math.sin(seconds * .3) * 2] }
}

test('axis follow maintains camera -> planet -> star, gaze and zoom for moving world positions', () => {
  const { camera, controller, framing } = fixture()
  const view = { ...initialGalaxyView(), zoom: .7 }
  for (let frame = 0; frame < 300; frame++) {
    const target = targetAt(frame / 60)
    controller.update(1 / 60, view, false, false, 1 / 60, target)
    if (frame >= 60) { assertAxis(camera, target); assert.equal(controller.getState().axisLocked, true) }
  }
  assert.ok(Math.abs(controller.getState().radius - framing.distance * view.zoom) < 1e-9)
})

test('axis acquisition and song switch start continuously and settle on the new line', () => {
  const { camera, controller } = fixture()
  const view = initialGalaxyView()
  const first = targetAt(0)
  const before = camera.position.clone()
  controller.update(0, view, false, false, 0, first)
  assert.ok(camera.position.distanceTo(before) < 1e-12)
  for (let i = 0; i < 70; i++) controller.update(1 / 60, view, false, false, 1 / 60, first)
  const second: CameraFollowTarget = { id: 'second', starPosition: [-2, 1.1, -3], position: [-9, -2, -4] }
  const start = camera.position.clone()
  controller.update(1 / 120, view, false, false, 1 / 120, second)
  assert.ok(camera.position.distanceTo(start) < .05, 'first switch frame must not teleport')
  for (let i = 0; i < 70; i++) controller.update(1 / 60, view, false, false, 1 / 60, second)
  assertAxis(camera, second)
})

test('zoom preserves the line, angular drag is constrained until follow is released', () => {
  const { camera, controller } = fixture()
  let view = initialGalaxyView()
  const target = targetAt(0)
  for (let i = 0; i < 75; i++) controller.update(1 / 60, view, false, false, 1 / 60, target)
  const distance = controller.getState().radius
  controller.beginDrag(); controller.drag(200, 100, 1 / 60); controller.endDrag()
  view = zoomGalaxyView(view, -100)
  for (let i = 0; i < 100; i++) controller.update(1 / 60, view, false, false, 1 / 60, target)
  assertAxis(camera, target)
  assert.ok(controller.getState().radius < distance)
  const [x, y, z] = controller.getLookCenter()
  view = { ...view, center: [x, y], centerZ: z }
  const pose = camera.position.clone(), orientation = camera.quaternion.clone()
  for (let i = 0; i < 90; i++) controller.update(1 / 60, view, false, false)
  assert.ok(camera.position.distanceTo(pose) < 1e-9)
  assert.ok(1 - Math.abs(camera.quaternion.dot(orientation)) < 1e-12)
  assert.equal(controller.getState().axisConstrained, false)
  controller.beginDrag(); controller.drag(40, 0, 1 / 60); controller.endDrag(false)
  for (let i = 0; i < 45; i++) controller.update(1 / 60, view, false, false)
  assert.ok(camera.position.distanceTo(pose) > 1)
})

test('axis view passes the world up pole without a 180-degree roll flip', () => {
  const { camera, controller } = fixture()
  const view = initialGalaxyView()
  let previous = camera.quaternion.clone()
  for (let i = 0; i < 600; i++) {
    const angle = -1.8 + i / 600 * 3.6
    const target: CameraFollowTarget = { id: 'pole', starPosition: [0, 0, 0], position: [Math.sin(angle) * 8, Math.cos(angle) * 8, 0] }
    controller.update(1 / 60, view, false, false, 1 / 60, target)
    if (i > 60) { assertAxis(camera, target); assert.ok(Math.abs(previous.dot(camera.quaternion)) > .9999) }
    previous.copy(camera.quaternion)
  }
})

test('axis acquisition matches across frame rates; degenerate/invalid star points remain finite', () => {
  const a = fixture(), b = fixture()
  for (const [entry, fps] of [[a, 30], [b, 144]] as const) {
    entry.controller.update(0, initialGalaxyView(), false, false, 0, targetAt(0))
    for (let frame = 1; frame <= fps / 2; frame++) entry.controller.update(1 / fps, initialGalaxyView(), false, false, 1 / fps, targetAt(frame / fps))
  }
  assert.ok(a.camera.position.distanceTo(b.camera.position) < 1e-9)
  for (const target of [{ id: 'same', position: [0, 0, 0], starPosition: [0, 0, 0] }, { id: 'bad', position: [1, 2, 3], starPosition: [NaN, 0, 0] }] as CameraFollowTarget[]) {
    a.controller.update(1 / 60, initialGalaxyView(), false, false, 1 / 60, target)
    assert.equal(a.controller.getState().axisConstrained, false)
    assert.ok(a.camera.position.toArray().every(Number.isFinite))
    assert.ok(a.camera.quaternion.toArray().every(Number.isFinite))
  }
})
