import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PerspectiveCamera, Vector2, Vector3 } from 'three'
import { SpaceCameraController } from '../src/lib/spaceCamera'
import type { CameraFollowTarget } from '../src/lib/spaceCamera'
import { getGalaxyFraming } from '../src/lib/sceneFraming'
import { initialGalaxyView, zoomGalaxyView } from '../src/lib/galaxyNavigation'
import type { GalaxyView } from '../src/lib/galaxyNavigation'

function fixture() {
  const framing = getGalaxyFraming(1600, 900)
  const camera = new PerspectiveCamera(36, 1600 / 900, 0.1, 400)
  const controller = new SpaceCameraController(camera, framing, () => {})
  return { camera, controller, framing }
}
function orbit(seconds: number): [number, number, number] {
  return [Math.cos(seconds * .7) * 8, Math.sin(seconds * .7) * 4, Math.sin(seconds * .37) * 3]
}
function freezeView(controller: SpaceCameraController, view: GalaxyView): GalaxyView {
  const [x, y, z] = controller.getLookCenter()
  return { ...view, center: [x, y], centerZ: z }
}

test('a moving 3D planet stays exactly at screen center after smooth acquisition', () => {
  const { camera, controller, framing } = fixture()
  const view = { ...initialGalaxyView(), zoom: .63 }
  for (let frame = 0; frame < 240; frame++) controller.update(1 / 60, view, false, false)
  const target: CameraFollowTarget = { id: 'playing-song', position: orbit(0) }
  let previous = camera.position.clone()
  for (let frame = 0; frame < 480; frame++) {
    target.position = orbit(frame / 60)
    controller.update(1 / 60, view, true, false, 1 / 60, target)
    assert.ok(camera.position.distanceTo(previous) < .7, 'acquisition and tracking must not teleport')
    if (frame >= 60) {
      const screen = new Vector3(...target.position).project(camera)
      assert.ok(Math.hypot(screen.x, screen.y) < 1e-10, 'gaze must include X, Y and Z')
      assert.equal(controller.getState().targetLocked, true)
    }
    previous = camera.position.clone()
  }
  assert.equal(view.zoom, .63)
  assert.ok(Math.abs(controller.getState().radius - framing.distance * view.zoom) < .1)
})

test('wheel zoom and manual orbit drag keep the moving song as their look point', () => {
  const { camera, controller } = fixture()
  let view = initialGalaxyView()
  const target: CameraFollowTarget = { id: 'song', position: orbit(0) }
  for (let frame = 0; frame < 75; frame++) controller.update(1 / 60, view, false, false, 1 / 60, target)
  const beforeRadius = controller.getState().radius
  controller.beginDrag()
  for (let frame = 0; frame < 45; frame++) {
    target.position = orbit(frame / 60)
    view = zoomGalaxyView(view, -8)
    controller.drag(1.5, .3, 1 / 60)
    controller.update(1 / 60, view, true, false, 1 / 60, target)
    const screen = new Vector3(...target.position).project(camera)
    assert.ok(Math.hypot(screen.x, screen.y) < 1e-10)
  }
  controller.endDrag(false)
  assert.ok(controller.getState().radius < beforeRadius)
})

test('switching songs eases from the rendered pose and acquires the new world position', () => {
  const { camera, controller } = fixture()
  const view = { ...initialGalaxyView(), zoom: .7 }
  const first: CameraFollowTarget = { id: 'first', position: [7, -4, 3] }
  for (let frame = 0; frame < 90; frame++) controller.update(1 / 60, view, false, false, 1 / 60, first)
  const from = camera.position.clone()
  const second: CameraFollowTarget = { id: 'second', position: [-6, 5, -4] }
  controller.update(1 / 120, view, false, false, 1 / 120, second)
  assert.ok(camera.position.distanceTo(from) < .01)
  assert.equal(controller.getState().targetLocked, false)
  for (let frame = 0; frame < 120; frame++) controller.update(1 / 60, view, false, false, 1 / 60, second)
  const screen = new Vector3(...second.position).project(camera)
  assert.ok(Math.hypot(screen.x, screen.y) < 1e-10)
  assert.equal(controller.getState().trackingTarget, 'second')
})

test('release retains the exact camera pose and 3D look depth, even during acquisition', () => {
  for (const frames of [12, 90]) {
    const { camera, controller } = fixture()
    let view = initialGalaxyView()
    const target: CameraFollowTarget = { id: 'song', position: [6, 4, -3] }
    for (let frame = 0; frame < frames; frame++) controller.update(1 / 60, view, false, false, 1 / 60, target)
    view = freezeView(controller, view)
    const from = camera.position.clone(), quaternion = camera.quaternion.clone()
    for (let frame = 0; frame < 90; frame++) controller.update(1 / 60, view, false, false)
    assert.ok(camera.position.distanceTo(from) < 1e-12)
    assert.ok(1 - Math.abs(camera.quaternion.dot(quaternion)) < 1e-12)
    assert.equal(controller.getState().trackingTarget, null)
    assert.ok((view.centerZ ?? 0) < 0)
    const anchor = controller.projectAnchor(view, new Vector2(0, 0))!
    assert.ok(Math.abs(anchor[0] - view.center[0]) < 1e-10)
    assert.ok(Math.abs(anchor[1] - view.center[1]) < 1e-10)
  }
})

test('acquisition and the moving target are independent of frame rate', () => {
  const a = fixture(), b = fixture()
  for (const [entry, fps] of [[a, 30], [b, 144]] as const) {
    entry.controller.update(0, initialGalaxyView(), false, false, 0, { id: 'song', position: orbit(0) })
    for (let frame = 1; frame <= fps / 2; frame++) entry.controller.update(1 / fps, initialGalaxyView(), false, false, 1 / fps, { id: 'song', position: orbit(frame / fps) })
  }
  assert.ok(a.camera.position.distanceTo(b.camera.position) < 1e-10)
})

test('missing or nonfinite targets cannot produce an invalid camera, and recenter clears the lock', () => {
  const { camera, controller } = fixture()
  controller.update(1 / 60, initialGalaxyView(), false, false, 1 / 60, { id: 'broken', position: [NaN, 1, Infinity] })
  assert.equal(controller.getState().trackingTarget, null)
  assert.ok(camera.position.toArray().every(Number.isFinite))
  controller.update(1 / 60, initialGalaxyView(), false, false, 1 / 60, { id: 'valid', position: [4, -3, 2] })
  controller.recenter()
  for (let frame = 0; frame < 90; frame++) controller.update(1 / 60, initialGalaxyView(), false, false)
  assert.equal(controller.getState().trackingTarget, null)
  assert.deepEqual(controller.getLookCenter(), [0, -.65, 0])
})
