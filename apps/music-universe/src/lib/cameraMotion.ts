export type CameraMotionPreset = 'still' | 'gentle' | 'cruise'

export interface CameraMotionConfig {
  /** Multipliers of the existing cinematic drift, never of the user's pose. */
  gentleAmplitude: number
  gentleSpeed: number
  cruiseAmplitude: number
  cruiseSpeed: number
  transitionSeconds: number
}

/** gentle is the UI default; the controller retains cruise for existing callers. */
export const DEFAULT_CAMERA_MOTION_PRESET: CameraMotionPreset = 'gentle'
export const DEFAULT_CAMERA_MOTION_CONFIG: Readonly<CameraMotionConfig> = Object.freeze({
  gentleAmplitude: 0.3,
  gentleSpeed: 0.3,
  cruiseAmplitude: 1,
  cruiseSpeed: 1,
  transitionSeconds: 0.7,
})

/** Suggested tuning limits: keep the long-running cruise unhurried. */
export const CAMERA_MOTION_RANGES = Object.freeze({
  gentleAmplitude: [0, 0.5] as const,
  gentleSpeed: [0, 0.5] as const,
  cruiseAmplitude: [0.5, 1.5] as const,
  cruiseSpeed: [0.5, 1.5] as const,
  transitionSeconds: [0.3, 1.5] as const,
})

const smoothstep = (value: number) => value * value * (3 - 2 * value)
const smoothstepIntegral = (value: number) => value ** 3 - 0.5 * value ** 4

/**
 * Blends velocity/amplitude only. The accumulated orbit angle is owned by the
 * camera, so changing preset never rescales that angle or restores a baseline.
 * averageSpeed integrates the transition exactly across differing frame rates.
 */
export class CameraMotionBlend {
  public preset: CameraMotionPreset
  public readonly value: { amplitude: number; speed: number; averageSpeed: number; transitioning: boolean }
  private fromAmplitude: number
  private fromSpeed: number
  private toAmplitude: number
  private toSpeed: number
  private elapsed: number

  constructor(preset: CameraMotionPreset = 'cruise', private readonly config: Readonly<CameraMotionConfig> = DEFAULT_CAMERA_MOTION_CONFIG) {
    for (const [key, value] of Object.entries(config)) {
      const range = CAMERA_MOTION_RANGES[key as keyof CameraMotionConfig]
      if (!Number.isFinite(value) || value < range[0] || value > range[1]) throw new RangeError(`Invalid camera motion parameter: ${key}`)
    }
    this.preset = preset
    const factors = this.factors(preset)
    this.fromAmplitude = this.toAmplitude = factors.amplitude
    this.fromSpeed = this.toSpeed = factors.speed
    this.elapsed = config.transitionSeconds
    this.value = { ...factors, averageSpeed: factors.speed, transitioning: false }
  }

  setPreset(preset: CameraMotionPreset) {
    if (preset === this.preset) return
    const factors = this.factors(preset)
    this.preset = preset
    this.fromAmplitude = this.value.amplitude
    this.fromSpeed = this.value.speed
    this.toAmplitude = factors.amplitude
    this.toSpeed = factors.speed
    this.elapsed = 0
    this.value.transitioning = true
  }

  advance(seconds: number) {
    const dt = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
    const duration = this.config.transitionSeconds
    const fromProgress = Math.min(1, this.elapsed / duration)
    this.elapsed = Math.min(duration, this.elapsed + dt)
    const progress = this.elapsed / duration
    const amount = smoothstep(progress)
    this.value.amplitude = progress === 1 ? this.toAmplitude : this.fromAmplitude + (this.toAmplitude - this.fromAmplitude) * amount
    this.value.speed = progress === 1 ? this.toSpeed : this.fromSpeed + (this.toSpeed - this.fromSpeed) * amount
    if (dt > 0) {
      const activeSeconds = (progress - fromProgress) * duration
      const integral = this.fromSpeed * activeSeconds + (this.toSpeed - this.fromSpeed) * duration * (smoothstepIntegral(progress) - smoothstepIntegral(fromProgress))
      this.value.averageSpeed = (integral + this.toSpeed * Math.max(0, dt - activeSeconds)) / dt
    } else this.value.averageSpeed = this.value.speed
    this.value.transitioning = progress < 1
    return this.value
  }

  private factors(preset: CameraMotionPreset) {
    if (preset === 'still') return { amplitude: 0, speed: 0 }
    if (preset === 'gentle') return { amplitude: this.config.gentleAmplitude, speed: this.config.gentleSpeed }
    if (preset === 'cruise') return { amplitude: this.config.cruiseAmplitude, speed: this.config.cruiseSpeed }
    throw new RangeError('Invalid camera motion preset')
  }
}
