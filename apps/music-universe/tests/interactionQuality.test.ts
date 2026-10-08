import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  advanceRenderBudget, createInteractionActivity, createRenderBudget, DEFAULT_INTERACTION_QUALITY,
  InteractionActivityTracker,
} from '../src/lib/interactionQuality'
import type { InteractionActivity, RenderBudget } from '../src/lib/interactionQuality'

function step(budget: RenderBudget, activity: InteractionActivity, nowMs: number, deltaSeconds = 1 / 60, baseDpr = 1.5) {
  return advanceRenderBudget(budget, { activity, nowMs, deltaSeconds, baseDpr })
}

function run(budget: RenderBudget, activity: InteractionActivity, start: number, end: number, fps = 60, baseDpr = 1.5) {
  const count = Math.round((end - start) * fps / 1000)
  for (let i = 1; i <= count; i++) step(budget, activity, start + i * 1000 / fps, 1 / fps, baseDpr)
}

test('drag needs a held pointer and four pixels of movement; hover and clicks do not lower quality', () => {
  const tracker = new InteractionActivityTracker()
  assert.equal(tracker.movePointer(1, 500, 500, 10), false)
  tracker.beginPointer(1, 10, 10)
  assert.equal(tracker.movePointer(1, 12, 11, 20), false)
  assert.equal(tracker.endPointer(1, 25), false)
  assert.equal(tracker.activity.revision, 0)
  assert.equal(tracker.activity.interacting, false)
  const budget = createRenderBudget(1.5)
  run(budget, tracker.activity, 0, 1000)
  assert.equal(budget.particleRatio, 1)
  assert.equal(budget.dpr, 1.5)
  assert.equal(budget.monitoringAllowed, true)
})

test('a drag remains active without extra move events, and release starts the idle hold', () => {
  const tracker = new InteractionActivityTracker()
  tracker.beginPointer(1, 0, 0)
  assert.equal(tracker.movePointer(1, 4, 0, 10), true)
  const budget = createRenderBudget(1.5)
  step(budget, tracker.activity, 800)
  assert.equal(budget.interactionActive, true)
  assert.equal(tracker.endPointer(1, 900), true)
  step(budget, tracker.activity, 1079)
  assert.equal(budget.interactionActive, true)
  step(budget, tracker.activity, 1080)
  assert.equal(budget.interactionActive, false)
  assert.equal(budget.recovering, true)
})

test('only finite nonzero wheel events activate interaction and rapid bursts extend one hold', () => {
  const tracker = new InteractionActivityTracker()
  assert.equal(tracker.wheel(0, 0, 0, 0), false)
  assert.equal(tracker.wheel(0, Number.NaN, 0, 10), false)
  const budget = createRenderBudget(1.5)
  for (let now = 0; now <= 1000; now += 100) {
    assert.equal(tracker.wheel(0, -30, 0, now), true)
    run(budget, tracker.activity, now, now + 100)
    assert.equal(budget.interactionActive, true)
  }
  assert.ok(budget.particleRatio <= 0.601)
  assert.equal(budget.postEnabled, true)
  assert.ok(budget.dpr >= 1.5 * DEFAULT_INTERACTION_QUALITY.dprMultiplier - 1e-10)
  assert.equal(budget.monitoringAllowed, false)
  step(budget, tracker.activity, 1179)
  assert.equal(budget.interactionActive, true)
  step(budget, tracker.activity, 1180)
  assert.equal(budget.interactionActive, false)
})

test('particle and Bloom fallback precede the more conservative DPR fallback', () => {
  const activity = createInteractionActivity()
  activity.interacting = true; activity.lastActivityAt = 0
  const budget = createRenderBudget(1.5)
  run(budget, activity, 0, 150)
  assert.ok(budget.particleRatio < 0.61)
  assert.equal(budget.postEnabled, true)
  assert.equal(budget.dpr, 1.5)
  run(budget, activity, 150, 650)
  assert.ok(budget.dpr < 1.31)
  assert.ok(budget.dpr >= 1.5 * 0.86)
})

test('recovery restores the glow without ever unmounting post-processing, and returns to the base profile', () => {
  const activity = createInteractionActivity()
  activity.interacting = true; activity.lastActivityAt = 0
  const budget = createRenderBudget(1.5)
  run(budget, activity, 0, 1000)
  assert.equal(budget.postEnabled, true)
  const fromDpr = budget.dpr
  activity.interacting = false; activity.lastActivityAt = 1000
  run(budget, activity, 1000, 1180)
  // The composer is never unmounted by a gesture and the glow never reaches zero, so a zero-delta
  // hand-off frame leaves both the render path and the light level untouched.
  step(budget, activity, 1180, 0)
  assert.equal(budget.postEnabled, true)
  assert.ok(budget.bloomIntensity > 0, 'the album glow stays lit while a gesture is in flight')
  assert.ok(budget.bloomIntensity < DEFAULT_INTERACTION_QUALITY.bloomIntensity)
  step(budget, activity, 1200, 0.02)
  assert.ok(budget.bloomIntensity > 0)
  assert.equal(budget.dpr, fromDpr)
  run(budget, activity, 1200, 3400)
  assert.equal(budget.particleRatio, 1)
  assert.equal(budget.bloomIntensity, 0.8)
  assert.ok(Math.abs(budget.dpr - 1.5) < 0.0002)
  assert.equal(budget.monitoringAllowed, true)
})

test('same elapsed time produces the same particle and Bloom recovery at 30 and 120 fps', () => {
  const activity = createInteractionActivity()
  activity.interacting = true; activity.lastActivityAt = 0
  const slow = createRenderBudget(1.5), fast = createRenderBudget(1.5)
  run(slow, activity, 0, 1000, 60)
  run(fast, activity, 0, 1000, 60)
  activity.interacting = false; activity.lastActivityAt = 820
  // Start both exactly at the idle boundary so the measured time interval is identical.
  step(slow, activity, 1000, 0); step(fast, activity, 1000, 0)
  run(slow, activity, 1000, 1500, 30)
  run(fast, activity, 1000, 1500, 120)
  assert.ok(Math.abs(slow.particleRatio - fast.particleRatio) < 1e-12)
  assert.ok(Math.abs(slow.bloomIntensity - fast.bloomIntensity) < 1e-12)
  assert.ok(Math.abs(slow.dpr - fast.dpr) < 0.005)
})

test('a switch to low quality is respected throughout recovery and never restores a high DPR', () => {
  const activity = createInteractionActivity()
  activity.interacting = true; activity.lastActivityAt = 0
  const budget = createRenderBudget(1.75)
  run(budget, activity, 0, 800, 60, 1.75)
  activity.interacting = false; activity.lastActivityAt = 800
  for (let i = 1; i <= 180; i++) {
    advanceRenderBudget(budget, { activity, nowMs: 800 + i * 1000 / 60, deltaSeconds: 1 / 60, baseDpr: 0.8, baseBloomIntensity: 0 })
    assert.ok(budget.dpr <= 0.8)
  }
  assert.equal(budget.dpr, 0.8)
  assert.equal(budget.bloomIntensity, 0)
  assert.equal(budget.postEnabled, false)
  assert.equal(budget.monitoringAllowed, true)
})

test('DPR commits are limited by distance and time rather than every render frame', () => {
  const activity = createInteractionActivity()
  activity.interacting = true; activity.lastActivityAt = 0
  const budget = createRenderBudget(1.75)
  let previousCommit = 1.75, previousTime = -Infinity, commitCount = 0
  for (let frame = 1; frame <= 180; frame++) {
    const now = frame * 1000 / 120
    step(budget, activity, now, 1 / 120, 1.75)
    if (budget.dprCommit === null) continue
    assert.ok(now - previousTime >= 80)
    assert.ok(Math.abs(budget.dprCommit - previousCommit) >= 0.025)
    previousCommit = budget.dprCommit; previousTime = now; commitCount++
  }
  assert.ok(commitCount >= 2 && commitCount < 10)
})

test('continuous 5–8 FPS drag frames still shed particles and dim the glow, then smoothly recover', () => {
  for (const fps of [5, 8]) {
    const activity = createInteractionActivity()
    activity.interacting = true; activity.lastActivityAt = 0
    const budget = createRenderBudget(1.5)
    let previousParticles = 1
    for (let frame = 1; frame <= fps; frame++) {
      step(budget, activity, frame * 1000 / fps, 1 / fps)
      assert.equal(budget.frameTimeReset, false)
      assert.equal(budget.interactionActive, true)
      assert.ok(budget.particleRatio <= previousParticles)
      previousParticles = budget.particleRatio
    }
    assert.ok(budget.particleRatio <= 0.601)
    assert.ok(budget.bloomIntensity > 0)
    assert.ok(budget.bloomIntensity < DEFAULT_INTERACTION_QUALITY.bloomIntensity)
    assert.equal(budget.postEnabled, true)
    assert.ok(budget.dpr < 1.3)
    activity.interacting = false; activity.lastActivityAt = 1000
    let recoveryStarted = false
    for (let frame = 1; frame <= fps * 4; frame++) {
      step(budget, activity, 1000 + frame * 1000 / fps, 1 / fps)
      assert.equal(budget.frameTimeReset, false)
      if (!budget.interactionActive) {
        recoveryStarted = true
        assert.equal(budget.postEnabled, true)
        assert.ok(budget.particleRatio >= previousParticles)
      }
      previousParticles = budget.particleRatio
    }
    assert.equal(recoveryStarted, true)
    assert.equal(budget.particleRatio, 1)
    assert.equal(budget.bloomIntensity, 0.8)
    assert.ok(Math.abs(budget.dpr - 1.5) < 0.0002)
    assert.equal(budget.monitoringAllowed, true)
  }
})

test('slow frame integration is capped, while a discontinuous gap is skipped', () => {
  const activity = createInteractionActivity()
  activity.interacting = true; activity.lastActivityAt = 0
  const slow = createRenderBudget(1.5), capped = createRenderBudget(1.5)
  step(slow, activity, 200, 0.2)
  step(capped, activity, 200, DEFAULT_INTERACTION_QUALITY.maxFrameSeconds)
  assert.equal(slow.particleRatio, capped.particleRatio)
  assert.equal(slow.bloomIntensity, capped.bloomIntensity)
  assert.equal(slow.dpr, capped.dpr)
  assert.equal(slow.frameTimeReset, false)
  const before = slow.particleRatio
  step(slow, activity, 1400, 1.2)
  assert.equal(slow.frameTimeReset, true)
  assert.equal(slow.particleRatio, before)
  step(slow, activity, Number.NaN, 0.02)
  assert.equal(slow.frameTimeReset, true)
  assert.equal(slow.particleRatio, before)
})

test('pinch, pointer cancellation, blur and hidden-page transitions cannot leave a stuck interaction', () => {
  const tracker = new InteractionActivityTracker()
  tracker.beginPointer(1, 0, 0); tracker.beginPointer(2, 50, 0)
  assert.equal(tracker.activity.interacting, false)
  assert.equal(tracker.movePointer(2, 60, 0, 10), true)
  assert.equal(tracker.endPointer(2, 20), true)
  assert.equal(tracker.activity.interacting, false)
  tracker.movePointer(1, -10, 0, 30)
  assert.equal(tracker.clearPointers(40), true)
  assert.equal(tracker.movePointer(1, -20, 0, 50), false)
  tracker.beginPointer(3, 0, 0); tracker.movePointer(3, 10, 0, 60)
  assert.equal(tracker.setHidden(true), true)
  assert.equal(tracker.activity.interacting, false)
  assert.equal(tracker.wheel(0, 30, 0, 70), false)
  assert.equal(tracker.setHidden(false), true)
  assert.equal(tracker.activity.visibilityRevision, 2)
  assert.equal(tracker.activity.lastActivityAt, -Infinity)
  assert.equal(tracker.movePointer(3, 40, 0, 80), false)
})

test('invalid deltas and hidden intervals never advance animations or accumulate a resume jump', () => {
  const tracker = new InteractionActivityTracker()
  tracker.wheel(0, 30, 0, 0)
  const budget = createRenderBudget(1.5)
  run(budget, tracker.activity, 0, 100)
  const before = budget.particleRatio
  for (const delta of [Number.NaN, Infinity, -1, 30]) {
    step(budget, tracker.activity, 110, delta)
    assert.equal(budget.particleRatio, before)
    assert.equal(budget.frameTimeReset, true)
  }
  tracker.setHidden(true)
  step(budget, tracker.activity, 120, 1 / 60)
  step(budget, tracker.activity, 100000, 100)
  assert.equal(budget.particleRatio, before)
  tracker.setHidden(false)
  step(budget, tracker.activity, 100010, 0.02)
  assert.equal(budget.frameTimeReset, true)
  assert.equal(budget.particleRatio, before)
  step(budget, tracker.activity, 100030, 0.02)
  assert.equal(budget.frameTimeReset, false)
  assert.ok(budget.particleRatio > before && budget.particleRatio < 1)
})

test('configuration bounds and nonfinite baselines remain safe, while the budget object is reused', () => {
  const budget = createRenderBudget(Number.NaN, { particleRatio: -1, recoveryMs: Infinity, dprCommitIntervalMs: 2 })
  assert.equal(budget.baseDpr, 1)
  assert.equal(budget.config.particleRatio, 0.2)
  assert.equal(budget.config.recoveryMs, 800)
  assert.equal(budget.config.dprCommitIntervalMs, 80)
  assert.equal(step(budget, createInteractionActivity(), 10, 1 / 60, Number.NaN), budget)
  assert.ok(Number.isFinite(budget.dpr))
})

test('a repeated nudge / pause cadence never unmounts post-processing or darkens the glow', () => {
  const activity = createInteractionActivity()
  const budget = createRenderBudget(1.5)
  const postStates = new Set<boolean>()
  let minimumBloom = Infinity
  // Short pauses are expected to close the interaction window and the next nudge opens it again.
  // The degradation may follow that rhythm; the light and the render path may not. If they did,
  // every pause would turn into a visible pulse, which is the flicker this guards against.
  for (let cycle = 0; cycle < 6; cycle++) {
    activity.interacting = true; activity.lastActivityAt = 1000 * cycle
    run(budget, activity, 1000 * cycle, 1000 * cycle + 380)
    activity.interacting = false; activity.lastActivityAt = 1000 * cycle + 380
    run(budget, activity, 1000 * cycle + 380, 1000 * cycle + 900)
    step(budget, activity, 1000 * cycle + 900, 1 / 60)
    assert.equal(budget.frameTimeReset, false)
    postStates.add(budget.postEnabled)
    minimumBloom = Math.min(minimumBloom, budget.bloomIntensity)
  }
  assert.deepEqual([...postStates], [true])
  assert.ok(minimumBloom > 0, 'the glow must never reach zero while a gesture is in flight')
  assert.ok(minimumBloom < DEFAULT_INTERACTION_QUALITY.bloomIntensity)
})
