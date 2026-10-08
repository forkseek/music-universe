/** A temporary interaction budget applied on top of the existing quality monitor. */
export interface InteractionQualityConfig {
  particleRatio: number
  /**
   * Fraction of the baseline glow that survives while a gesture is in flight.
   * Never zero: a light that goes out and comes back on reads as flicker.
   */
  interactionBloomRatio: number
  bloomIntensity: number
  dprMultiplier: number
  idleHoldMs: number
  fallbackMs: number
  recoveryMs: number
  dprFallbackDelayMs: number
  dprRecoveryDelayMs: number
  dprFallbackMs: number
  dprRecoveryMs: number
  dprCommitIntervalMs: number
  dprCommitThreshold: number
  postDisableThreshold: number
  /** Clamp continuous slow frames to this integration step; do not discard them. */
  maxFrameSeconds: number
}

export const DEFAULT_INTERACTION_QUALITY: Readonly<InteractionQualityConfig> = Object.freeze({
  particleRatio: 0.6,
  interactionBloomRatio: 0.55,
  bloomIntensity: 0.8,
  dprMultiplier: 0.86,
  idleHoldMs: 180,
  fallbackMs: 120,
  recoveryMs: 800,
  dprFallbackDelayMs: 180,
  dprRecoveryDelayMs: 220,
  dprFallbackMs: 240,
  dprRecoveryMs: 1000,
  dprCommitIntervalMs: 80,
  dprCommitThreshold: 0.025,
  postDisableThreshold: 0.005,
  maxFrameSeconds: 0.12,
})

/** A one-second gap is treated as a suspended/discontinuous frame, independently of slow FPS. */
export const RENDER_FRAME_DISCONTINUITY_SECONDS = 1

/** Suggested tuning bounds. Durations represent approximately 99% of the transition. */
export const INTERACTION_QUALITY_RANGES = Object.freeze({
  particleRatio: [0.2, 0.8], interactionBloomRatio: [0.1, 1], bloomIntensity: [0, 1.5], dprMultiplier: [0.65, 1],
  idleHoldMs: [80, 400], fallbackMs: [60, 250], recoveryMs: [400, 1800],
  dprFallbackDelayMs: [100, 500], dprRecoveryDelayMs: [100, 700],
  dprFallbackMs: [120, 500], dprRecoveryMs: [600, 2000],
  dprCommitIntervalMs: [80, 250], dprCommitThreshold: [0.025, 0.1],
  postDisableThreshold: [0.001, 0.02], maxFrameSeconds: [0.05, 0.25],
} satisfies Record<keyof InteractionQualityConfig, readonly [number, number]>)

export interface InteractionActivity {
  interacting: boolean
  /** performance.now() milliseconds; -Infinity means no valid input yet. */
  lastActivityAt: number
  hidden: boolean
  revision: number
  /** Changes even when no render frame runs during a hidden-tab interval. */
  visibilityRevision: number
}

interface HeldPointer { x: number; y: number; startX: number; startY: number; moved: boolean }

export function createInteractionActivity(): InteractionActivity {
  return { interacting: false, lastActivityAt: -Infinity, hidden: false, revision: 0, visibilityRevision: 0 }
}

/** Event-independent input tracker: hover, clicks and zero-valued wheel events do nothing. */
export class InteractionActivityTracker {
  readonly activity = createInteractionActivity()
  private readonly pointers = new Map<number, HeldPointer>()
  private readonly dragThreshold: number

  constructor(dragThreshold = 4) {
    this.dragThreshold = Number.isFinite(dragThreshold) ? Math.max(1, dragThreshold) : 4
  }

  private touch(nowMs: number) {
    if (!Number.isFinite(nowMs) || this.activity.hidden) return false
    this.activity.lastActivityAt = nowMs
    this.activity.revision++
    return true
  }

  wheel(deltaX: number, deltaY: number, deltaZ: number, nowMs: number) {
    if (![deltaX, deltaY, deltaZ].every(Number.isFinite) || (deltaX === 0 && deltaY === 0 && deltaZ === 0)) return false
    return this.touch(nowMs)
  }

  beginPointer(id: number, x: number, y: number) {
    if (this.activity.hidden || ![id, x, y].every(Number.isFinite)) return
    this.pointers.set(id, { x, y, startX: x, startY: y, moved: false })
  }

  movePointer(id: number, x: number, y: number, nowMs: number) {
    const pointer = this.pointers.get(id)
    if (!pointer || ![x, y, nowMs].every(Number.isFinite) || this.activity.hidden) return false
    if (x === pointer.x && y === pointer.y) return false
    pointer.x = x; pointer.y = y
    // Two held pointers naturally include pinch and two-finger pan; neither activates on touch-down alone.
    pointer.moved ||= Math.hypot(x - pointer.startX, y - pointer.startY) >= this.dragThreshold
    if (!pointer.moved) return false
    this.activity.interacting = true
    return this.touch(nowMs)
  }

  endPointer(id: number, nowMs: number) {
    const pointer = this.pointers.get(id)
    if (!pointer) return false
    this.pointers.delete(id)
    this.activity.interacting = [...this.pointers.values()].some(value => value.moved)
    return pointer.moved ? this.touch(nowMs) : false
  }

  clearPointers(nowMs: number) {
    const wasInteracting = this.activity.interacting
    this.pointers.clear()
    this.activity.interacting = false
    return wasInteracting ? this.touch(nowMs) : false
  }

  setHidden(hidden: boolean) {
    if (hidden === this.activity.hidden) return false
    this.pointers.clear()
    this.activity.interacting = false
    this.activity.hidden = hidden
    this.activity.lastActivityAt = -Infinity
    this.activity.visibilityRevision++
    this.activity.revision++
    return true
  }
}

export interface RenderBudget {
  dpr: number
  baseDpr: number
  particleRatio: number
  bloomIntensity: number
  postEnabled: boolean
  interactionActive: boolean
  recovering: boolean
  monitoringAllowed: boolean
  /** Commit only this value to Canvas DPR; null avoids per-frame React updates. */
  dprCommit: number | null
  frameTimeReset: boolean
  readonly config: Readonly<InteractionQualityConfig>
  /** Internal animation state; keep the same budget object across frames. */
  _dprReduction: number
  _dprTarget: number
  _wasActive: boolean
  _activeSinceMs: number
  _recoverySinceMs: number
  _lastNowMs: number
  _lastCommittedDpr: number
  _lastDprCommitMs: number
  _visibilityRevision: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function configuration(overrides: Partial<InteractionQualityConfig>): Readonly<InteractionQualityConfig> {
  const result = { ...DEFAULT_INTERACTION_QUALITY }
  for (const key of Object.keys(result) as (keyof InteractionQualityConfig)[]) {
    const [min, max] = INTERACTION_QUALITY_RANGES[key]
    const value = overrides[key]
    if (value !== undefined && Number.isFinite(value)) result[key] = clamp(value, min, max)
  }
  return Object.freeze(result)
}

export function createRenderBudget(baseDpr: number, overrides: Partial<InteractionQualityConfig> = {}): RenderBudget {
  const config = configuration(overrides)
  const initialDpr = Number.isFinite(baseDpr) && baseDpr > 0 ? baseDpr : 1
  return {
    dpr: initialDpr, baseDpr: initialDpr, particleRatio: 1, bloomIntensity: config.bloomIntensity,
    postEnabled: config.bloomIntensity > config.postDisableThreshold, interactionActive: false,
    recovering: false, monitoringAllowed: true, dprCommit: null, frameTimeReset: false, config,
    _dprReduction: 0, _dprTarget: 0, _wasActive: false, _activeSinceMs: 0, _recoverySinceMs: 0,
    _lastNowMs: 0, _lastCommittedDpr: initialDpr, _lastDprCommitMs: -Infinity, _visibilityRevision: 0,
  }
}

export interface AdvanceRenderBudget {
  nowMs: number
  deltaSeconds: number
  /** The existing PerformanceMonitor/manual quality output is the sole baseline. */
  baseDpr: number
  /** Pass zero if the existing base profile disables Bloom. */
  baseBloomIntensity?: number
  activity: Readonly<InteractionActivity>
}

function ease(value: number, target: number, deltaSeconds: number, durationMs: number) {
  const next = target + (value - target) * Math.exp(-Math.log(100) * deltaSeconds * 1000 / durationMs)
  return Math.abs(next - target) < 0.0001 ? target : next
}

/** Mutates one ref-held budget; does not allocate buffers or start an animation loop. */
export function advanceRenderBudget(budget: RenderBudget, input: AdvanceRenderBudget): RenderBudget {
  const config = budget.config
  const invalidNow = !Number.isFinite(input.nowMs)
  const now = invalidNow ? budget._lastNowMs : input.nowMs
  const timeReversed = now < budget._lastNowMs
  const visibilityChanged = input.activity.visibilityRevision !== budget._visibilityRevision
  const invalidDelta = !Number.isFinite(input.deltaSeconds) || input.deltaSeconds < 0
    || input.deltaSeconds > RENDER_FRAME_DISCONTINUITY_SECONDS
  budget.frameTimeReset = invalidNow || timeReversed || visibilityChanged || invalidDelta || input.activity.hidden
  // A continuously overloaded renderer still needs to shed work. Only resume/invalid gaps are skipped;
  // ordinary 5–8 FPS frames integrate a bounded step so fallback and recovery remain responsive.
  const delta = budget.frameTimeReset ? 0 : Math.min(input.deltaSeconds, config.maxFrameSeconds)
  budget._lastNowMs = now
  budget._visibilityRevision = input.activity.visibilityRevision
  budget.dprCommit = null
  if (timeReversed) budget._lastDprCommitMs = now - config.dprCommitIntervalMs
  if (Number.isFinite(input.baseDpr) && input.baseDpr > 0) budget.baseDpr = input.baseDpr
  const baselineBloom = input.baseBloomIntensity === undefined || !Number.isFinite(input.baseBloomIntensity)
    ? config.bloomIntensity : clamp(input.baseBloomIntensity, 0, 1.5)
  const age = now - input.activity.lastActivityAt
  const recent = Number.isFinite(age) && age >= 0 && age < config.idleHoldMs
  const active = !input.activity.hidden && (input.activity.interacting || recent)
  if (active && !budget._wasActive) {
    budget._activeSinceMs = Number.isFinite(input.activity.lastActivityAt) ? Math.min(now, input.activity.lastActivityAt) : now
  } else if (!active && budget._wasActive) {
    budget._recoverySinceMs = Number.isFinite(input.activity.lastActivityAt)
      ? Math.min(now, input.activity.lastActivityAt + config.idleHoldMs) : now
  }
  budget.interactionActive = active
  budget._wasActive = active
  if (active && now - budget._activeSinceMs >= config.dprFallbackDelayMs) budget._dprTarget = 1
  else if (!active && now - budget._recoverySinceMs >= config.dprRecoveryDelayMs) budget._dprTarget = 0

  if (!input.activity.hidden) {
    const duration = active ? config.fallbackMs : config.recoveryMs
    budget.particleRatio = ease(budget.particleRatio, active ? config.particleRatio : 1, delta, duration)
    // A gesture dims the album glow instead of extinguishing it: the star's corona is the scene's
    // main light cue, and switching it fully off on every pointer move is exactly the strobe.
    const bloomTarget = active ? baselineBloom * config.interactionBloomRatio : baselineBloom
    budget.bloomIntensity = ease(budget.bloomIntensity, bloomTarget, delta, duration)
    // Whether post-processing exists at all is a property of the base profile, never of the current
    // gesture. Unmounting the composer hands rendering back to the default path, and the two paths
    // disagree on antialiasing and on the resolution the scene is actually drawn at.
    budget.postEnabled = baselineBloom > config.postDisableThreshold
    if (bloomTarget === 0 && budget.bloomIntensity <= config.postDisableThreshold) budget.bloomIntensity = 0
    budget._dprReduction = ease(budget._dprReduction, budget._dprTarget, delta,
      budget._dprTarget === 1 ? config.dprFallbackMs : config.dprRecoveryMs)
  }
  // This multiplier cannot raise the request above the current baseline, even after a low-quality switch.
  budget.dpr = budget.baseDpr * (1 - (1 - config.dprMultiplier) * budget._dprReduction)
  budget.recovering = !active && (Math.abs(1 - budget.particleRatio) > 0.003
    || Math.abs(baselineBloom - budget.bloomIntensity) > 0.004 || budget._dprReduction > 0.003)
  budget.monitoringAllowed = !input.activity.hidden && !active && !budget.recovering && !budget.frameTimeReset
  if (!input.activity.hidden && Math.abs(budget.dpr - budget._lastCommittedDpr) >= config.dprCommitThreshold
    && now - budget._lastDprCommitMs >= config.dprCommitIntervalMs) {
    budget.dprCommit = budget.dpr
    budget._lastCommittedDpr = budget.dpr
    budget._lastDprCommitMs = now
  }
  return budget
}
