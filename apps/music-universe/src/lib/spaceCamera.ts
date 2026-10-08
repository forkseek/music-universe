import { Euler, MathUtils, PerspectiveCamera, Quaternion, Vector2, Vector3 } from 'three'
import { MAX_SCENE_ZOOM, MIN_SCENE_ZOOM } from './galaxyNavigation'
import type { GalaxyView } from './galaxyNavigation'
import type { getGalaxyFraming } from './sceneFraming'
import { CameraMotionBlend, DEFAULT_CAMERA_MOTION_CONFIG } from './cameraMotion'
import type { CameraMotionConfig, CameraMotionPreset } from './cameraMotion'

type Framing = ReturnType<typeof getGalaxyFraming>
type Mode = 'orbit' | 'free'

export interface CameraFollowTarget {
  id: string
  position: [number, number, number]
  /** In the same world coordinate system as position. */
  starPosition?: [number, number, number]
}

/** An independent axis-acquisition duration; existing gaze and zoom easing stay intact. */
export const DEFAULT_CAMERA_FOLLOW_CONFIG = Object.freeze({ axisAcquireSeconds: 0.8, axisEpsilon: 0.00001 })

/** Anchor translation is separate from the camera reset and preserves its pose. */
export const DEFAULT_CAMERA_ANCHOR_CONFIG = Object.freeze({ returnSeconds: 0.8, reducedReturnSeconds: 0.18 })
export const CAMERA_ANCHOR_RANGES = Object.freeze({ returnSeconds: [0.35, 1.5] as const, reducedReturnSeconds: [0.08, 0.25] as const })

const ANGULAR_DRAG = -Math.log(0.9) * 60
const ANGLE_EASE = -Math.log(0.84) * 60
const RADIUS_EASE = -Math.log(0.9) * 60
const ORBIT_ZOOM_EASE = -Math.log(0.85) * 60
const EPSILON = 0.00005
const FOLLOW_IDLE_DELAY = 1.6
const TARGET_ACQUIRE_SECONDS = 0.8
const clamp = MathUtils.clamp
const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback
const ease = (rate: number, seconds: number) => 1 - Math.exp(-rate * seconds)

interface ResetTween {
  elapsed: number
  position: Vector3
  quaternion: Quaternion
  fov: number
  goalPosition: Vector3
  goalQuaternion: Quaternion
}

interface AnchorReturnTween {
  elapsed: number
  fromCenter: Vector3
  goalCenter: Vector3
}

/** Camera math only: input ownership, pointer lock, and background rendering stay in React. */
export class SpaceCameraController {
  public readonly keys = new Set<string>()
  private framing: Framing
  private mode: Mode = 'orbit'
  private dragging = false
  private moving = false
  private drifting = false
  private userTheta = 0
  private userPhi = 0
  private velocityTheta = 0
  private velocityPhi = 0
  private theta = 0
  private phi = 0
  private radius: number
  private center: Vector3
  private requestedCenter: Vector3
  private trackedId: string | null = null
  private targetElapsed = 0
  private axisActive = false
  private axisElapsed = 0
  private readonly axisDirection = new Vector3()
  private readonly axisPreviousDirection = new Vector3()
  private readonly axisFromOrientation = new Quaternion()
  private readonly axisGoalOrientation = new Quaternion()
  private readonly axisOrientation = new Quaternion()
  private readonly axisTransport = new Quaternion()
  private readonly axisUp = new Vector3(0, 1, 0)
  private readonly forwardAxis = new Vector3(0, 0, 1)
  private readonly targetOffset = new Vector3()
  private cinemaTime = 0
  private followPhase = 0
  private followSpeed = 0
  private requestedFollowSpeed = 0.0045
  private followDelay = 0
  private cinemaTheta = 0
  private cinemaPhi = 0
  private cinemaRadius = 0
  private freePosition = new Vector3()
  private freeVelocity = new Vector3()
  private freeYaw = 0
  private freePitch = 0
  private freeRoll = 0
  private freeFov: number
  private looked = false
  private reset: ResetTween | null = null
  private anchorReturn: AnchorReturnTween | null = null
  private lastView: GalaxyView
  private readonly euler = new Euler(0, 0, 0, 'YXZ')
  private readonly targetVelocity = new Vector3()
  private readonly difference = new Vector3()
  private readonly position = new Vector3()
  private readonly orbitUp = new Vector3(0, 1, 0)
  private orbitRoll = 0
  private readonly rayDirection = new Vector3()
  private readonly anchorCamera: PerspectiveCamera
  private readonly motionBlend: CameraMotionBlend
  private reducedMotion = false

  constructor(private readonly camera: PerspectiveCamera, framing: Framing, private readonly onModeChange: (mode: Mode) => void, private readonly followConfig: Readonly<{ axisAcquireSeconds: number; axisEpsilon: number }> = DEFAULT_CAMERA_FOLLOW_CONFIG, motionPreset: CameraMotionPreset = 'cruise', motionConfig: Readonly<CameraMotionConfig> = DEFAULT_CAMERA_MOTION_CONFIG, private readonly anchorConfig: Readonly<{ returnSeconds: number; reducedReturnSeconds: number }> = DEFAULT_CAMERA_ANCHOR_CONFIG) {
    if (!Number.isFinite(followConfig.axisAcquireSeconds) || followConfig.axisAcquireSeconds <= 0 || !Number.isFinite(followConfig.axisEpsilon) || followConfig.axisEpsilon <= 0) throw new RangeError('Invalid camera follow parameters')
    for (const [key, value] of Object.entries(anchorConfig)) {
      const range = CAMERA_ANCHOR_RANGES[key as keyof typeof CAMERA_ANCHOR_RANGES]
      if (!Number.isFinite(value) || value < range[0] || value > range[1]) throw new RangeError(`Invalid camera anchor parameter: ${key}`)
    }
    this.framing = framing
    this.motionBlend = new CameraMotionBlend(motionPreset, motionConfig)
    this.radius = framing.distance
    this.center = new Vector3(...framing.target)
    this.requestedCenter = this.center.clone()
    this.lastView = { target: '@album-star', zoom: 1, center: [framing.target[0], framing.target[1]] }
    this.freeFov = framing.fov
    this.anchorCamera = new PerspectiveCamera(framing.fov, camera.aspect, camera.near, camera.far)
    camera.fov = framing.fov
    camera.position.copy(this.center).add(new Vector3(0, 0, framing.distance))
    camera.lookAt(this.center)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
  }

  /** Changes autonomous motion only; zoom, manual pose and follow axis stay intact. */
  setMotionPreset(preset: CameraMotionPreset) { this.motionBlend.setPreset(preset) }

  /**
   * Explicit follow release: translate the camera and its gaze to the star.
   * The caller also updates view.center; no recenter, zoom, mode or FOV reset.
   */
  returnToStarAnchor(starPosition: [number, number, number]) {
    if (!starPosition.every(Number.isFinite) || this.reset) return false
    if (this.mode === 'orbit') {
      // Bake the rendered axis direction into the manual orbit angles. Preserve
      // the transported up vector and current radial drift so neither can jump.
      const renderedRadius = this.bakeOrbitAngles()
      this.cinemaRadius = renderedRadius - this.radius
      this.cinemaTheta = this.cinemaPhi = 0
      this.followPhase = this.followSpeed = 0
      this.axisActive = false
    } else {
      // A freely rotated camera may no longer look at its old orbit center.
      // Acquire its actual forward ray, then translate without changing yaw/roll.
      const distance = Math.max(EPSILON, this.camera.position.distanceTo(this.center))
      this.camera.getWorldDirection(this.difference)
      this.center.copy(this.camera.position).addScaledVector(this.difference, distance)
      this.freePosition.copy(this.camera.position)
    }
    this.trackedId = null
    this.targetElapsed = 0
    this.requestedCenter.set(...starPosition)
    this.anchorReturn = { elapsed: 0, fromCenter: this.center.clone(), goalCenter: new Vector3(...starPosition) }
    this.holdAutomaticMotion()
    this.moving = true
    this.drifting = false
    return true
  }

  setFraming(framing: Framing) {
    this.framing = framing
    if (this.reset) {
      this.reset.goalPosition.set(...framing.target).add(new Vector3(0, 0, framing.distance))
    }
    if (this.mode === 'orbit' && !this.reset && this.camera.fov !== framing.fov) {
      this.camera.fov = framing.fov
      this.camera.updateProjectionMatrix()
    }
  }

  /** A small fraction of the actual orbital rate keeps the camera unhurried. */
  setOrbitFollowSpeed(orbitalAngularVelocity: number) {
    this.requestedFollowSpeed = clamp(Math.abs(finite(orbitalAngularVelocity, 0.075)) * 0.06, 0.003, 0.0075)
  }

  holdAutomaticMotion() {
    this.followDelay = FOLLOW_IDLE_DELAY
    this.followSpeed = 0
  }

  beginDrag() {
    if (this.mode !== 'orbit' || this.axisActive) return
    this.interruptReset()
    this.holdAutomaticMotion()
    this.dragging = true
    this.velocityTheta = this.velocityPhi = 0
  }

  drag(dx: number, dy: number, seconds: number) {
    if (this.mode !== 'orbit' || !this.dragging || !Number.isFinite(dx) || !Number.isFinite(dy)) return
    const sample = clamp(finite(seconds, 1 / 60), 1 / 120, 0.08)
    const dTheta = -dx * 0.0052
    const dPhi = dy * 0.0052
    this.userTheta += dTheta
    this.userPhi += dPhi
    this.velocityTheta = clamp(dTheta / sample * 0.46, -6.2, 6.2)
    this.velocityPhi = clamp(dPhi / sample * 0.46, -6.2, 6.2)
  }

  endDrag(allowInertia = true) {
    this.dragging = false
    if (!allowInertia) this.velocityTheta = this.velocityPhi = 0
  }

  cancel() {
    this.dragging = false
    this.velocityTheta = this.velocityPhi = 0
    this.freeVelocity.set(0, 0, 0)
    this.keys.clear()
    this.looked = false
  }

  toggleFree() {
    this.axisActive = false
    this.anchorReturn = null
    if (this.mode === 'free') { this.recenter(); return }
    this.reset = null
    this.cancel()
    this.camera.updateMatrixWorld()
    this.freePosition.copy(this.camera.position)
    this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ')
    this.freePitch = this.euler.x
    this.freeYaw = this.euler.y
    this.freeRoll = this.euler.z
    this.freeFov = clamp(this.camera.fov, 26, 72)
    this.mode = 'free'
    this.onModeChange('free')
  }

  recenter() {
    this.axisActive = false
    this.anchorReturn = null
    this.trackedId = null
    this.targetElapsed = 0
    this.cancel()
    this.holdAutomaticMotion()
    const goalPosition = new Vector3(...this.framing.target).add(new Vector3(0, 0, this.framing.distance))
    this.anchorCamera.position.copy(goalPosition)
    this.anchorCamera.up.set(0, 1, 0)
    this.anchorCamera.lookAt(new Vector3(...this.framing.target))
    this.reset = { elapsed: 0, position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone(), fov: this.camera.fov, goalPosition, goalQuaternion: this.anchorCamera.quaternion.clone() }
    this.mode = 'orbit'
    this.onModeChange('orbit')
    this.moving = true
    this.drifting = false
  }

  look(dx: number, dy: number) {
    if (this.mode !== 'free' || !Number.isFinite(dx) || !Number.isFinite(dy)) return
    // 鼠标转向按产品要求反向：横向/纵向都改为画面跟随鼠标移动，而非标准 FPS 视角转动。
    this.freeYaw += dx * 0.00125
    this.freePitch += dy * 0.00125
    this.looked = true
  }

  zoomFree(pixels: number) {
    if (this.mode !== 'free' || !Number.isFinite(pixels)) return
    this.freeFov = clamp(this.freeFov + clamp(pixels, -240, 240) * 0.018, 26, 72)
  }

  update(seconds: number, view: GalaxyView, cinematic: boolean, reducedMotion: boolean, orbitalSeconds = seconds, followTarget?: CameraFollowTarget | null) {
    const dt = clamp(finite(seconds, 1 / 60), 0, 0.12)
    this.reducedMotion = reducedMotion
    const automaticMotion = this.motionBlend.advance(dt)
    if (reducedMotion) {
      this.velocityTheta = this.velocityPhi = 0
      this.freeVelocity.set(0, 0, 0)
    }
    const cleanView: GalaxyView = {
      target: view.target,
      zoom: clamp(finite(view.zoom, 1), MIN_SCENE_ZOOM, MAX_SCENE_ZOOM),
      center: [finite(view.center[0], this.framing.target[0]), finite(view.center[1], this.framing.target[1])],
      centerZ: finite(view.centerZ ?? 0, 0),
    }
    const target = followTarget?.id && followTarget.position.every(Number.isFinite) && this.mode === 'orbit' ? followTarget : null
    if (target) this.anchorReturn = null
    if (target && this.reset) this.interruptReset()
    const zoomChanged = cleanView.zoom !== this.lastView.zoom
    const viewChanged = zoomChanged || cleanView.center[0] !== this.lastView.center[0] || cleanView.center[1] !== this.lastView.center[1] || cleanView.centerZ !== (this.lastView.centerZ ?? 0)
    const baselineView = Math.abs(cleanView.zoom - 1) < 1e-10 && Math.abs(cleanView.center[0] - this.framing.target[0]) < 1e-10 && Math.abs(cleanView.center[1] - this.framing.target[1]) < 1e-10 && Math.abs(cleanView.centerZ ?? 0) < 1e-10
    // The caller resets its view to the baseline along with recenter(); further input cancels the tween.
    if (this.reset && viewChanged && !baselineView) this.interruptReset()
    this.lastView = cleanView
    this.requestedCenter.set(cleanView.center[0], cleanView.center[1], cleanView.centerZ ?? 0)
    if (this.reset) return this.updateReset(dt)
    const returningAnchor = !!this.anchorReturn
    if (returningAnchor) this.updateAnchorReturn(dt, reducedMotion)
    if (this.mode === 'free') return this.updateFree(dt, reducedMotion)

    const star = target?.starPosition
    const validStar = !!star && star.every(Number.isFinite)
    if (target && validStar) this.axisDirection.set(target.position[0] - star[0], target.position[1] - star[1], target.position[2] - star[2])
    const constrainAxis = !!target && validStar && this.axisDirection.lengthSq() > this.followConfig.axisEpsilon ** 2
    if (this.axisActive && !constrainAxis) this.releaseAxisPose()
    if (constrainAxis && target) {
      this.axisDirection.normalize()
      if (!this.axisActive || this.trackedId !== target.id) {
        // Acquire the new axis from the actual rendered pose, including prior drag/drift.
        this.axisPreviousDirection.copy(this.camera.position).sub(this.center).normalize()
        this.axisFromOrientation.setFromUnitVectors(this.forwardAxis, this.axisPreviousDirection)
        this.axisUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion).normalize()
        this.axisElapsed = 0
        this.axisActive = true
        this.dragging = false
        this.velocityTheta = this.velocityPhi = 0
      }
    }

    if (reducedMotion) this.velocityTheta = this.velocityPhi = 0
    if (!this.dragging) {
      const decay = Math.exp(-ANGULAR_DRAG * dt)
      this.userTheta += this.velocityTheta * (1 - decay) / ANGULAR_DRAG
      if (this.velocityPhi !== 0) this.userPhi += this.velocityPhi * (1 - decay) / ANGULAR_DRAG
      this.velocityTheta *= decay
      this.velocityPhi *= decay
      if (Math.abs(this.velocityTheta) < 0.01) this.velocityTheta = 0
      if (Math.abs(this.velocityPhi) < 0.01) this.velocityPhi = 0
    }

    const desiredRadius = this.framing.distance * cleanView.zoom
    const zooming = zoomChanged || Math.abs(this.radius - desiredRadius) > EPSILON
    if (zoomChanged || this.dragging) this.holdAutomaticMotion()
    this.followDelay = Math.max(0, this.followDelay - dt)
    this.theta += (this.userTheta - this.theta) * ease(ANGLE_EASE, dt)
    this.phi += (this.userPhi - this.phi) * ease(ANGLE_EASE, dt)
    const zoomEase = ease(ORBIT_ZOOM_EASE, dt)
    this.radius += (desiredRadius - this.radius) * zoomEase
    if (target) {
      this.requestedCenter.set(...target.position)
      if (this.trackedId !== target.id) {
        this.trackedId = target.id
        this.targetElapsed = 0
        this.targetOffset.copy(this.center).sub(this.requestedCenter)
        this.holdAutomaticMotion()
      }
      this.targetElapsed = Math.min(TARGET_ACQUIRE_SECONDS, this.targetElapsed + dt)
      const progress = reducedMotion ? 1 : this.targetElapsed / TARGET_ACQUIRE_SECONDS
      // Fade a fixed acquisition offset, rather than damping the moving target itself.
      // Once acquired, position and gaze use the same world-space planet point every frame.
      const remaining = 1 - progress * progress * (3 - 2 * progress)
      this.center.copy(this.requestedCenter).addScaledVector(this.targetOffset, remaining)
    } else {
      this.trackedId = null
      this.targetElapsed = 0
      if (!returningAnchor) this.center.lerp(this.requestedCenter, zoomEase)
    }
    const settling = Math.abs(this.theta - this.userTheta) > EPSILON || Math.abs(this.phi - this.userPhi) > EPSILON || Math.abs(this.radius - desiredRadius) > EPSILON || this.center.distanceTo(this.requestedCenter) > EPSILON
    this.moving = this.dragging || settling || this.velocityTheta !== 0 || this.velocityPhi !== 0
    if (!this.moving) { this.theta = this.userTheta; this.phi = this.userPhi; this.radius = desiredRadius; this.center.copy(this.requestedCenter) }

    const following = cinematic && !reducedMotion && !zooming && !this.moving && this.followDelay === 0 && (automaticMotion.speed > 0 || automaticMotion.transitioning)
    if (following) {
      // Hold the existing offsets while zoom eases; zeroing them would itself
      // move the picture. Resume the slow drift from this exact pose afterward.
      const orbitStep = clamp(finite(orbitalSeconds, dt), 0, 0.12)
      this.cinemaTime += orbitStep * automaticMotion.averageSpeed
      const speedDecay = Math.exp(-2.4 * orbitStep)
      // Integrate the speed ramp analytically so low and high frame rates agree.
      this.followPhase += (this.requestedFollowSpeed * orbitStep + (this.followSpeed - this.requestedFollowSpeed) * (1 - speedDecay) / 2.4) * automaticMotion.averageSpeed
      this.followSpeed = this.requestedFollowSpeed + (this.followSpeed - this.requestedFollowSpeed) * speedDecay
      const attenuation = (this.dragging ? 0.25 : 1) * automaticMotion.amplitude
      const driftEase = ease(ANGLE_EASE, dt)
      // Do not multiply followPhase: it is the previously rendered orientation.
      this.cinemaTheta += (this.followPhase + Math.sin(this.cinemaTime * 0.08) * 0.004 * attenuation - this.cinemaTheta) * driftEase
      this.cinemaPhi += (Math.sin(this.cinemaTime * 0.08 * 0.75 + 1) * 0.010 * attenuation - this.cinemaPhi) * driftEase
      this.cinemaRadius += (Math.sin(this.cinemaTime * 0.08 * 0.5 + 2) * 0.080 * attenuation - this.cinemaRadius) * ease(RADIUS_EASE, dt)
    }
    // Pause, still, and reduced motion freeze offsets at the rendered pose.
    // Resetting them to zero would teleport a camera that has already cruised.
    this.drifting = following
    if (this.axisActive) {
      this.axisElapsed = reducedMotion ? this.followConfig.axisAcquireSeconds : Math.min(this.followConfig.axisAcquireSeconds, this.axisElapsed + dt)
      const progress = reducedMotion ? 1 : this.axisElapsed / this.followConfig.axisAcquireSeconds
      const amount = progress * progress * (3 - 2 * progress)
      this.axisGoalOrientation.setFromUnitVectors(this.forwardAxis, this.axisDirection)
      this.axisOrientation.copy(this.axisFromOrientation).slerp(this.axisGoalOrientation, amount)
      this.position.copy(this.forwardAxis).applyQuaternion(this.axisOrientation).normalize()
      // C = P + d normalize(P - S): viewed from C the order is camera, planet, star.
      this.camera.position.copy(this.center).addScaledVector(this.position, this.radius + this.cinemaRadius)
      // Parallel-transport the up vector so passing the world Y axis cannot flip the view.
      this.axisTransport.setFromUnitVectors(this.axisPreviousDirection, this.position)
      this.axisUp.applyQuaternion(this.axisTransport).normalize()
      this.camera.up.copy(this.axisUp)
      this.axisPreviousDirection.copy(this.position)
      if (progress < 1) this.moving = true
    } else {
      this.sphericalPosition(this.center, this.theta + this.cinemaTheta, this.phi + this.cinemaPhi, this.radius + this.cinemaRadius, this.camera.position)
      // Keep the horizon up continuous through both poles, so a vertical drag can never
      // stick, jump or flip over while the view keeps orbiting freely.
      this.orbitUpAt(this.theta + this.cinemaTheta, this.phi + this.cinemaPhi, this.camera.up)
    }
    this.camera.lookAt(this.center)
    if (this.camera.fov !== this.framing.fov) { this.camera.fov = this.framing.fov; this.camera.updateProjectionMatrix() }
    this.camera.updateMatrixWorld()
    return { moving: this.moving, drifting: this.drifting }
  }

  getLookCenter(): [number, number, number] { return [this.center.x, this.center.y, this.center.z] }

  getState() {
    const center = this.mode === 'free' || this.reset ? this.requestedCenter : this.center
    this.difference.copy(this.camera.position).sub(center)
    const radius = this.difference.length()
    this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ')
    return {
      mode: this.mode,
      theta: this.mode === 'orbit' && !this.reset && !this.axisActive ? this.theta + this.cinemaTheta : radius > EPSILON ? Math.atan2(this.difference.x, this.difference.z) : 0,
      phi: this.mode === 'orbit' && !this.reset && !this.axisActive ? this.phi + this.cinemaPhi : radius > EPSILON ? Math.asin(clamp(this.difference.y / radius, -1, 1)) : 0,
      radius,
      roll: this.mode === 'free' ? this.freeRoll : this.euler.z,
      dragging: this.dragging,
      moving: this.moving,
      drifting: this.drifting,
      followPhase: this.followPhase,
      followSpeed: this.reducedMotion ? 0 : this.followSpeed * this.motionBlend.value.speed,
      motionPreset: this.motionBlend.preset,
      motionAmplitude: this.motionBlend.value.amplitude,
      motionSpeed: this.motionBlend.value.speed,
      motionTransitioning: this.motionBlend.value.transitioning,
      reducedMotion: this.reducedMotion,
      returningToStarAnchor: !!this.anchorReturn,
      following: this.drifting && this.mode === 'orbit',
      trackingTarget: this.mode === 'orbit' ? this.trackedId : null,
      targetLocked: this.mode === 'orbit' && this.trackedId !== null && this.center.distanceTo(this.requestedCenter) < EPSILON && (!this.axisActive || this.axisElapsed >= this.followConfig.axisAcquireSeconds),
      axisConstrained: this.axisActive,
      axisLocked: this.axisActive && this.axisElapsed >= this.followConfig.axisAcquireSeconds,
    }
  }

  /** Intersect the look point's depth plane using the requested pose, independently of damping. */
  projectAnchor(view: GalaxyView, ndc: Vector2): [number, number] | undefined {
    if (this.mode !== 'orbit' || !Number.isFinite(ndc.x) || !Number.isFinite(ndc.y)) return undefined
    const center = this.position.set(finite(view.center[0], 0), finite(view.center[1], this.framing.target[1]), finite(view.centerZ ?? 0, 0))
    const radius = this.framing.distance * clamp(finite(view.zoom, 1), MIN_SCENE_ZOOM, MAX_SCENE_ZOOM)
    this.anchorCamera.fov = this.framing.fov
    this.anchorCamera.aspect = this.camera.aspect
    this.anchorCamera.updateProjectionMatrix()
    this.sphericalPosition(center, this.userTheta + this.cinemaTheta, this.userPhi + this.cinemaPhi, radius + this.cinemaRadius, this.anchorCamera.position)
    this.orbitUpAt(this.userTheta + this.cinemaTheta, this.userPhi + this.cinemaPhi, this.anchorCamera.up)
    this.anchorCamera.lookAt(center)
    this.anchorCamera.updateMatrixWorld()
    this.rayDirection.set(ndc.x, ndc.y, 0.5).unproject(this.anchorCamera).sub(this.anchorCamera.position).normalize()
    if (Math.abs(this.rayDirection.z) < 1e-8) return undefined
    const distance = (center.z - this.anchorCamera.position.z) / this.rayDirection.z
    if (!Number.isFinite(distance) || distance < 0) return undefined
    this.position.copy(this.anchorCamera.position).addScaledVector(this.rayDirection, distance)
    return [this.position.x, this.position.y]
  }

  private releaseAxisPose() {
    // Preserve the exact rendered pose and zoom when the user releases follow.
    this.axisActive = false
    this.radius = this.bakeOrbitAngles()
    this.followPhase = this.followSpeed = 0
    this.cinemaTheta = this.cinemaPhi = this.cinemaRadius = 0
  }

  /** Bake the rendered pose into orbit angles, carrying its roll so the pose is reproduced exactly. */
  private bakeOrbitAngles() {
    this.difference.copy(this.camera.position).sub(this.center)
    const renderedRadius = this.difference.length()
    this.userTheta = this.theta = Math.atan2(this.difference.x, this.difference.z)
    this.userPhi = this.phi = Math.asin(clamp(this.difference.y / Math.max(EPSILON, renderedRadius), -1, 1))
    // An axis-follow pose is rolled. Recover that roll from the rendered up vector so
    // releasing follow reproduces the exact orientation instead of snapping the horizon.
    this.orbitUpAt(this.theta, this.phi, this.orbitUp)
    this.orbitRoll = Math.atan2(this.camera.up.x * -Math.cos(this.theta) + this.camera.up.z * Math.sin(this.theta), this.camera.up.dot(this.orbitUp))
    this.velocityTheta = this.velocityPhi = 0
    return renderedRadius
  }

  /**
   * Horizon up for an orbit pose: the world up projected onto the view plane, then rolled by the
   * carried roll. Unlike projecting the world up directly it stays continuous through both poles.
   */
  private orbitUpAt(theta: number, phi: number, out: Vector3) {
    const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi), sinTheta = Math.sin(theta), cosTheta = Math.cos(theta)
    const cosRoll = Math.cos(this.orbitRoll), sinRoll = Math.sin(this.orbitRoll)
    return out.set(
      -sinPhi * sinTheta * cosRoll - cosTheta * sinRoll,
      cosPhi * cosRoll,
      -sinPhi * cosTheta * cosRoll + sinTheta * sinRoll,
    )
  }

  private sphericalPosition(center: Vector3, theta: number, phi: number, radius: number, out: Vector3) {
    const cosPhi = Math.cos(phi)
    return out.set(center.x + radius * cosPhi * Math.sin(theta), center.y + radius * Math.sin(phi), center.z + radius * cosPhi * Math.cos(theta))
  }

  private interruptReset() {
    if (!this.reset) return
    this.reset = null
    this.center.copy(this.requestedCenter)
    this.radius = this.bakeOrbitAngles()
    this.followPhase = this.followSpeed = 0
    this.cinemaTheta = this.cinemaPhi = this.cinemaRadius = 0
  }

  private updateReset(dt: number) {
    const reset = this.reset!
    reset.elapsed += dt
    const progress = Math.min(1, reset.elapsed / 0.62)
    const amount = 1 - Math.pow(1 - progress, 3)
    this.camera.position.copy(reset.position).lerp(reset.goalPosition, amount)
    this.camera.quaternion.copy(reset.quaternion).slerp(reset.goalQuaternion, amount)
    this.camera.fov = reset.fov + (this.framing.fov - reset.fov) * amount
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld()
    this.moving = progress < 1
    this.drifting = false
    if (!this.moving) {
      this.reset = null
      this.camera.up.set(0, 1, 0)
      this.userTheta = this.theta = this.userPhi = this.phi = 0
      this.orbitRoll = 0
      this.radius = this.framing.distance
      this.center.set(...this.framing.target)
      this.requestedCenter.copy(this.center)
      this.followPhase = this.followSpeed = 0
      this.cinemaTheta = this.cinemaPhi = this.cinemaRadius = 0
      this.freeRoll = 0
    }
    return { moving: this.moving, drifting: this.drifting }
  }

  private updateAnchorReturn(dt: number, reducedMotion: boolean) {
    const anchor = this.anchorReturn!
    // setAnchor supplies the goal in the same view used by wheel/pinch input.
    // Updating that goal keeps pinch anchors usable without restarting the tween.
    anchor.goalCenter.copy(this.requestedCenter)
    const duration = reducedMotion ? this.anchorConfig.reducedReturnSeconds : this.anchorConfig.returnSeconds
    anchor.elapsed = Math.min(duration, anchor.elapsed + dt)
    const progress = anchor.elapsed / duration
    const amount = progress * progress * (3 - 2 * progress)
    this.position.copy(this.center)
    this.center.copy(anchor.fromCenter).lerp(anchor.goalCenter, amount)
    if (this.mode === 'free') this.freePosition.add(this.difference.copy(this.center).sub(this.position))
    if (progress === 1) this.anchorReturn = null
  }

  private updateFree(dt: number, reducedMotion: boolean) {
    this.targetVelocity.set(
      (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0),
      (this.keys.has('Space') ? 1 : 0) - (this.keys.has('ControlLeft') || this.keys.has('ControlRight') ? 1 : 0),
      (this.keys.has('KeyS') ? 1 : 0) - (this.keys.has('KeyW') ? 1 : 0),
    )
    if (this.targetVelocity.lengthSq() > 0) {
      this.euler.set(this.freePitch, this.freeYaw, 0, 'YXZ')
      this.targetVelocity.normalize().applyEuler(this.euler).multiplyScalar(this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 6.2 : 2.35)
    }
    const rate = this.targetVelocity.lengthSq() > 0 ? 8.2 : 13.5
    const decay = Math.exp(-rate * dt)
    if (reducedMotion) {
      // Keep WASD responsive, but stop immediately when keys are released.
      this.freePosition.addScaledVector(this.targetVelocity, dt)
      this.freeVelocity.set(0, 0, 0)
    } else {
      this.difference.copy(this.freeVelocity).sub(this.targetVelocity)
      this.freePosition.addScaledVector(this.targetVelocity, dt).addScaledVector(this.difference, (1 - decay) / rate)
      this.freeVelocity.copy(this.targetVelocity).addScaledVector(this.difference, decay)
    }
    if (this.targetVelocity.lengthSq() === 0 && this.freeVelocity.lengthSq() < 0.00000004) this.freeVelocity.set(0, 0, 0)
    const rollDirection = (this.keys.has('KeyQ') ? 1 : 0) - (this.keys.has('KeyE') ? 1 : 0)
    this.freeRoll = clamp(this.freeRoll + rollDirection * dt * 0.9, -Math.PI, Math.PI)
    const fovMoving = Math.abs(this.camera.fov - this.freeFov) > EPSILON
    this.camera.fov += (this.freeFov - this.camera.fov) * ease(RADIUS_EASE, dt)
    if (!fovMoving) this.camera.fov = this.freeFov
    this.camera.position.copy(this.freePosition)
    this.camera.quaternion.setFromEuler(this.euler.set(this.freePitch, this.freeYaw, this.freeRoll, 'YXZ'))
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld()
    this.moving = !!this.anchorReturn || this.looked || this.targetVelocity.lengthSq() > 0 || this.freeVelocity.lengthSq() > 0 || rollDirection !== 0 || fovMoving
    this.looked = false
    this.drifting = false
    return { moving: this.moving, drifting: this.drifting }
  }
}
