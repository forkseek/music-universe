import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialGalaxyView, MAX_SCENE_ZOOM, MIN_SCENE_ZOOM, zoomGalaxyView } from '../src/lib/galaxyNavigation'

test('small zoom inputs remain continuous and never introduce overview / focus stages', () => {
  const original = initialGalaxyView()
  assert.equal(original.zoom, 1)
  assert.deepEqual(original.center, [0, -0.65])
  assert.equal('mode' in original, false)
  assert.equal('transitioning' in original, false)
  let view = { ...original, target: 'kept-track' }
  for (let index = 0; index < 100; index++) {
    const previous = view
    view = zoomGalaxyView(view, 12)
    assert.equal(view.target, 'kept-track')
    assert.deepEqual(view.center, original.center)
    assert.equal('mode' in view, false)
    assert.ok(view.zoom >= previous.zoom)
    assert.ok(view.zoom - previous.zoom < 0.04)
  }
  assert.equal(original.zoom, 1)
  assert.deepEqual(original.center, [0, -0.65])
})

test('zoom around an anchor preserves its projected position and reverses without drift', () => {
  const original = { ...initialGalaxyView(), center: [3, -2] as [number, number] }
  const anchor: [number, number] = [8, 4]
  let view = original
  for (let index = 0; index < 20; index++) view = zoomGalaxyView(view, -30, anchor)
  for (const axis of [0, 1] as const) {
    assert.ok(Math.abs((anchor[axis] - view.center[axis]) / view.zoom - (anchor[axis] - original.center[axis]) / original.zoom) < 1e-10)
  }
  for (let index = 0; index < 20; index++) view = zoomGalaxyView(view, 30, anchor)
  assert.ok(Math.abs(view.zoom - original.zoom) < 1e-10)
  assert.ok(view.center.every((value, index) => Math.abs(value - original.center[index]) < 1e-10))
  assert.deepEqual(original.center, [3, -2])
})

test('successive and reversed deltas accumulate while the camera is still easing', () => {
  let view = initialGalaxyView()
  for (let index = 0; index < 24; index++) view = zoomGalaxyView(view, -20)
  assert.ok(Math.abs(view.zoom - Math.exp(-24 * 20 * 0.0011)) < 1e-10)
  const beforeReverse = view.zoom
  view = zoomGalaxyView(view, 40)
  assert.ok(view.zoom > beforeReverse)
  assert.ok(Math.abs(view.zoom - Math.exp((-24 * 20 + 40) * 0.0011)) < 1e-10)
})

test('large spikes and invalid deltas preserve finite bounded camera state and selection', () => {
  let view = { ...initialGalaxyView(), target: 'kept-track' }
  for (let index = 0; index < 2000; index++) {
    const old = JSON.stringify(view)
    const next = zoomGalaxyView(view, Math.sin(index) * 1e8, [23, -17])
    assert.equal(JSON.stringify(view), old)
    assert.ok(Number.isFinite(next.zoom) && next.zoom >= MIN_SCENE_ZOOM && next.zoom <= MAX_SCENE_ZOOM)
    assert.ok(next.center.every(Number.isFinite))
    assert.equal(next.target, 'kept-track')
    view = next
  }
  for (const delta of [NaN, Infinity, -Infinity, 0]) assert.equal(zoomGalaxyView(view, delta), view)
})
