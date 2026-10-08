import { Euler, Quaternion, Vector3 } from 'three'

export const ANGULAR_DAMPING = 3.2
export const MAX_ANGULAR_SPEED = 6
const REST_SPEED = 0.0001

export interface AngularBody {
  orientation: Quaternion
  velocity: Vector3
  angles: { yaw: number; pitch: number }
  elapsed: number
  deltaRotation: Quaternion
  dragEuler: Euler
  axis: Vector3
}

export function createAngularBody(): AngularBody {
  return { orientation: new Quaternion(), velocity: new Vector3(), angles: { yaw: 0, pitch: 0 }, elapsed: 0, deltaRotation: new Quaternion(), dragEuler: new Euler(0, 0, 0, 'YXZ'), axis: new Vector3() }
}

export function stopAngularBody(body: AngularBody) { body.velocity.set(0, 0, 0) }

/** Pointer movement rotates a fixed sphere; its center never moves. */
export function dragAngularBody(body: AngularBody, yawDelta: number, pitchDelta: number, seconds: number) {
  if (!Number.isFinite(yawDelta) || !Number.isFinite(pitchDelta)) return
  const yaw = Math.max(-Math.PI * 4, Math.min(Math.PI * 4, yawDelta))
  const pitch = Math.max(-Math.PI * 4, Math.min(Math.PI * 4, pitchDelta))
  const sample = Number.isFinite(seconds) && seconds > 0 ? Math.max(1 / 240, Math.min(0.1, seconds)) : 1 / 60
  body.deltaRotation.setFromEuler(body.dragEuler.set(pitch, yaw, 0, 'YXZ'))
  body.orientation.premultiply(body.deltaRotation).normalize()
  body.angles.yaw += yaw
  body.angles.pitch += pitch
  body.axis.set(pitch / sample, yaw / sample, 0).clampLength(0, MAX_ANGULAR_SPEED)
  body.velocity.lerp(body.axis, 1 - Math.exp(-sample * 24)).clampLength(0, MAX_ANGULAR_SPEED)
}

/** Holding still, cancelling, or pausing must never create a delayed fling. */
export function releaseAngularBody(body: AngularBody, secondsSinceMove: number, allowInertia: boolean) {
  if (!allowInertia || !Number.isFinite(secondsSinceMove) || secondsSinceMove > 0.12) { stopAngularBody(body); return }
  body.velocity.multiplyScalar(Math.exp(-Math.max(0, secondsSinceMove - 0.035) * 18))
}

export interface AngularStepOptions {
  active: boolean
  dragging: boolean
  reducedMotion: boolean
  autoSpeed: number
}

/** Analytical angular drag keeps inertia consistent across different frame rates. */
export function advanceAngularBody(body: AngularBody, seconds: number, options: AngularStepOptions) {
  if (!options.active || options.reducedMotion) { stopAngularBody(body); return false }
  if (options.dragging || !Number.isFinite(seconds) || seconds <= 0) return false
  const delta = seconds
  body.elapsed += delta
  let moving = false
  const speed = body.velocity.length()
  if (speed > REST_SPEED) {
    const decay = Math.exp(-ANGULAR_DAMPING * delta)
    const angle = speed * (1 - decay) / ANGULAR_DAMPING
    body.axis.copy(body.velocity).multiplyScalar(1 / speed)
    body.deltaRotation.setFromAxisAngle(body.axis, angle)
    body.orientation.premultiply(body.deltaRotation).normalize()
    body.angles.yaw += body.axis.y * angle
    body.angles.pitch += body.axis.x * angle
    body.velocity.multiplyScalar(decay)
    moving = true
  } else stopAngularBody(body)
  const autoSpeed = Number.isFinite(options.autoSpeed) ? Math.max(-0.12, Math.min(0.12, options.autoSpeed)) : 0
  if (autoSpeed !== 0) {
    body.deltaRotation.setFromAxisAngle(body.axis.set(0, 1, 0), autoSpeed * delta)
    body.orientation.premultiply(body.deltaRotation).normalize()
    body.angles.yaw += autoSpeed * delta
    moving = true
  }
  return moving
}
