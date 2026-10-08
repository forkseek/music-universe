import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Quaternion, Vector3 } from 'three'
import {
  advanceAngularBody,
  createAngularBody,
  dragAngularBody,
  releaseAngularBody,
  stopAngularBody,
} from '../src/lib/albumRotationPhysics'

const moving = { active: true, dragging: false, reducedMotion: false, autoSpeed: 0 }
const tolerance = 1e-8

function assertFiniteBody(body: ReturnType<typeof createAngularBody>) {
  assert.ok(body.orientation.toArray().every(Number.isFinite), 'orientation remains finite')
  assert.ok(body.velocity.toArray().every(Number.isFinite), 'velocity remains finite')
  assert.ok(Number.isFinite(body.angles.yaw) && Number.isFinite(body.angles.pitch), 'drag angles remain finite')
  assert.ok(Math.abs(body.orientation.length() - 1) < tolerance, 'quaternion remains normalized')
  assert.ok(body.velocity.length() <= 6 + tolerance, 'angular speed respects its physical limit')
}

function assertSameOrientation(left: Quaternion, right: Quaternion) {
  // q and -q describe the same orientation, including after a complete revolution.
  assert.ok(1 - Math.abs(left.dot(right)) < tolerance, 'orientations match')
}

function movingBody() {
  const body = createAngularBody()
  dragAngularBody(body, 0.04, -0.026, 1 / 60)
  releaseAngularBody(body, 0, true)
  assert.ok(body.velocity.length() > 0.1, 'fresh drag creates release momentum')
  return body
}

test('album surface rotates beyond a full revolution on both axes without angle stops', () => {
  const body = createAngularBody()
  for (let index = 0; index < 40; index++) {
    dragAngularBody(body, 0.24, 0.21, 1 / 60)
    assertFiniteBody(body)
  }
  assert.ok(body.angles.yaw > Math.PI * 2, 'yaw exceeds 360 degrees')
  assert.ok(body.angles.pitch > Math.PI * 2, 'pitch exceeds 360 degrees')

  const yawOnly = createAngularBody()
  for (let index = 0; index < 80; index++) dragAngularBody(yawOnly, Math.PI / 40, 0, 1 / 60)
  assert.ok(Math.abs(yawOnly.angles.yaw - Math.PI * 2) < tolerance)
  assertSameOrientation(yawOnly.orientation, new Quaternion())
})

test('released inertia continues rotation while angular speed decays to rest', () => {
  const body = movingBody()
  const before = body.orientation.clone()
  const initialSpeed = body.velocity.length()
  assert.equal(advanceAngularBody(body, 0.08, moving), true)
  assert.ok(1 - Math.abs(body.orientation.dot(before)) > 1e-6, 'release advances the artwork')
  assert.ok(body.velocity.length() > 0 && body.velocity.length() < initialSpeed)
  let speed = body.velocity.length()
  for (let index = 0; index < 180; index++) {
    advanceAngularBody(body, 1 / 30, moving)
    assert.ok(body.velocity.length() <= speed + tolerance, 'damping cannot add kinetic energy')
    speed = body.velocity.length()
    assertFiniteBody(body)
  }
  assert.ok(speed < 0.001, 'inertia settles')
  assert.equal(advanceAngularBody(body, 1 / 30, moving), false)
})

test('exponential damping integrates independently of frame rate and uneven frame durations', () => {
  const duration = 0.6
  const results = [30, 60, 120].map(rate => {
    const body = movingBody()
    for (let frame = 0; frame < rate * duration; frame++) advanceAngularBody(body, 1 / rate, moving)
    return body
  })
  const uneven = movingBody()
  const initialVelocity = uneven.velocity.clone()
  for (const seconds of [0.001, 0.019, 0.35, 0.23]) advanceAngularBody(uneven, seconds, moving)
  const expectedVelocity = initialVelocity.clone().multiplyScalar(Math.exp(-3.2 * duration))
  assert.ok(uneven.velocity.distanceTo(expectedVelocity) < tolerance, 'frame spikes consume their full elapsed time')
  for (const body of results) {
    assertFiniteBody(body)
    assert.ok(body.velocity.distanceTo(uneven.velocity) < tolerance)
    assertSameOrientation(body.orientation, uneven.orientation)
  }
})

test('a new grab can brake rotation immediately without changing its current orientation', () => {
  const body = movingBody()
  advanceAngularBody(body, 0.03, moving)
  const held = body.orientation.clone()
  stopAngularBody(body)
  assert.equal(body.velocity.length(), 0)
  assert.equal(advanceAngularBody(body, 0.3, moving), false)
  assertSameOrientation(body.orientation, held)
})

test('pause, reduced motion and active dragging prevent autonomous rotation', () => {
  for (const gate of [{ active: false }, { reducedMotion: true }, { dragging: true }]) {
    const body = movingBody()
    const held = body.orientation.clone()
    assert.equal(advanceAngularBody(body, 0.25, { ...moving, autoSpeed: 0.08, ...gate }), false)
    assertSameOrientation(body.orientation, held)
    assertFiniteBody(body)
  }

  // Reduced motion removes autonomous motion, while an intentional hand gesture still works.
  const manual = createAngularBody()
  const start = manual.orientation.clone()
  dragAngularBody(manual, 0.3, 0.2, 1 / 60)
  assert.ok(1 - Math.abs(manual.orientation.dot(start)) > 1e-4)
})

test('stale releases and disabled inertia do not restart an old throw', () => {
  for (const [elapsed, allowed] of [[0.121, true], [0.5, true], [0, false]] as const) {
    const body = movingBody()
    releaseAngularBody(body, elapsed, allowed)
    const held = body.orientation.clone()
    assert.equal(body.velocity.length(), 0)
    assert.equal(advanceAngularBody(body, 0.2, moving), false)
    assertSameOrientation(body.orientation, held)
  }
})

test('gentle automatic rotation moves a stationary star without creating throw velocity', () => {
  const body = createAngularBody()
  const start = body.orientation.clone()
  assert.equal(advanceAngularBody(body, 0.5, { ...moving, autoSpeed: 0.05 }), true)
  assert.ok(1 - Math.abs(body.orientation.dot(start)) > 1e-5)
  assert.equal(body.velocity.length(), 0)
  assertFiniteBody(body)
})

test('zero durations, invalid samples and extreme input cannot produce nonfinite motion', () => {
  const samples = [
    [0, 0, 0],
    [0.2, 0.1, 0],
    [-0.2, 0.3, -1],
    [NaN, 0.1, 1 / 60],
    [0.1, Infinity, 1 / 60],
    [-Infinity, NaN, NaN],
    [1e8, -1e8, 1e-12],
    [0.2, -0.1, Infinity],
  ]
  const body = createAngularBody()
  for (const [yaw, pitch, seconds] of samples) {
    dragAngularBody(body, yaw, pitch, seconds)
    assertFiniteBody(body)
  }
  for (const seconds of [0, -0.5, NaN, Infinity, -Infinity]) {
    const before = body.orientation.clone()
    advanceAngularBody(body, seconds, moving)
    assertSameOrientation(body.orientation, before)
    assertFiniteBody(body)
  }
  for (const autoSpeed of [NaN, Infinity, -Infinity]) {
    advanceAngularBody(body, 1 / 60, { ...moving, autoSpeed })
    assertFiniteBody(body)
  }
})

test('independent stars do not share mutable orientation, velocity or drag angles', () => {
  const left = createAngularBody()
  const right = createAngularBody()
  dragAngularBody(left, 0.4, -0.2, 1 / 60)
  assert.ok(left.orientation !== right.orientation)
  assert.ok(left.velocity !== right.velocity)
  assert.ok(left.angles !== right.angles)
  assertSameOrientation(right.orientation, new Quaternion())
  assert.ok(right.velocity.equals(new Vector3()))
  assert.deepEqual(right.angles, { yaw: 0, pitch: 0 })
})
