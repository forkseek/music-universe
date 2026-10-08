import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextLyricViewMode, shouldShowPlanetLabel } from '../src/lib/universeExperience'

test('only the current, hovered or keyboard focused planet has a readable label', () => {
  assert.equal(shouldShowPlanetLabel('a', 'a', 'b'), true)
  assert.equal(shouldShowPlanetLabel('b', 'a', 'b'), true)
  assert.equal(shouldShowPlanetLabel('c', 'a', 'b'), false)
  assert.equal(shouldShowPlanetLabel('c', 'a', 'b', true), true)
  assert.equal(shouldShowPlanetLabel('c', null, null), false)
})

test('near lyrics require following and use separate enter/exit thresholds', () => {
  assert.equal(nextLyricViewMode('overview', true, .70), 'near')
  assert.equal(nextLyricViewMode('near', true, .80), 'near')
  assert.equal(nextLyricViewMode('near', true, .84), 'overview')
  assert.equal(nextLyricViewMode('overview', true, .80), 'overview')
  assert.equal(nextLyricViewMode('near', false, .2), 'overview')
  assert.equal(nextLyricViewMode('near', true, NaN), 'overview')
})
