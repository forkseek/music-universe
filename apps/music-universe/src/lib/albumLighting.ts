import { Color, MathUtils, SRGBColorSpace } from 'three'

export interface AlbumTone {
  /** Dominant colour in sRGB, with channels between 0 and 1. */
  dominant: [number, number, number]
  /** Mean relative luminance of the opaque artwork, in linear RGB. */
  luminance: number
  samples: number
}

export interface AlbumLightingConfig {
  sampleSize: number
  fallbackColor: string
  maxSaturation: number
  minColorLightness: number
  maxColorLightness: number
  minIntensityScale: number
  maxIntensityScale: number
  minCorona: number
  maxCorona: number
  luminanceGamma: number
  /** Exponential transition time constant; about 95% settled after three times this. */
  transitionSeconds: number
  /** Preserve the existing radius-scaled point light power. */
  pointPowerPerRadius: number
}

/** Central tuning entry: no album-specific colour table. */
export const DEFAULT_ALBUM_LIGHTING_CONFIG: Readonly<AlbumLightingConfig> = Object.freeze({
  sampleSize: 64,
  fallbackColor: '#edbe72',
  maxSaturation: 0.72,
  minColorLightness: 0.48,
  maxColorLightness: 0.72,
  minIntensityScale: 0.78,
  maxIntensityScale: 1.12,
  minCorona: 0.48,
  maxCorona: 0.72,
  luminanceGamma: 0.6,
  transitionSeconds: 0.6,
  pointPowerPerRadius: 14,
})

const linear = (v: number) => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
const clamp = MathUtils.clamp

/** Quantized dominant-colour histogram; coloured artwork outweighs white/black margins. */
export function extractAlbumTone(pixels: ArrayLike<number>): AlbumTone | null {
  const bins = new Map<number, { weight: number; r: number; g: number; b: number }>()
  let luminance = 0, opacity = 0, samples = 0
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const alpha = clamp(pixels[i + 3] / 255, 0, 1)
    if (alpha < 0.1) continue
    const r = clamp(pixels[i] / 255, 0, 1), g = clamp(pixels[i + 1] / 255, 0, 1), b = clamp(pixels[i + 2] / 255, 0, 1)
    if (![r, g, b, alpha].every(Number.isFinite)) continue
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    const saturation = max > 0 ? (max - min) / max : 0
    const lightness = (max + min) / 2
    const weight = alpha * (0.12 + 0.88 * saturation) * (0.2 + 0.8 * Math.sin(Math.PI * lightness))
    const key = (Math.min(7, Math.floor(r * 8)) << 6) | (Math.min(7, Math.floor(g * 8)) << 3) | Math.min(7, Math.floor(b * 8))
    const bin = bins.get(key) ?? { weight: 0, r: 0, g: 0, b: 0 }
    bin.weight += weight; bin.r += r * weight; bin.g += g * weight; bin.b += b * weight
    bins.set(key, bin)
    luminance += alpha * (0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b))
    opacity += alpha; samples++
  }
  if (!samples) return null
  let dominant = { weight: 0, r: 0, g: 0, b: 0 }
  for (const bin of bins.values()) if (bin.weight > dominant.weight) dominant = bin
  return { dominant: [dominant.r / dominant.weight, dominant.g / dominant.weight, dominant.b / dominant.weight], luminance: luminance / opacity, samples }
}

/** Uses the already-loaded cover; no extra fetch and no per-frame pixel readback. */
export function sampleAlbumTone(image: HTMLImageElement, sampleSize = DEFAULT_ALBUM_LIGHTING_CONFIG.sampleSize): AlbumTone | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = clamp(Math.round(sampleSize), 8, 128)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return extractAlbumTone(context.getImageData(0, 0, canvas.width, canvas.height).data)
  } catch {
    // A cross-origin image may render yet deny pixel reads. Keep a bounded fallback.
    return null
  }
}

export interface AlbumLightTarget {
  color: Color
  intensityScale: number
  corona: number
  source: 'cover' | 'fallback'
}

/** Smooth luminance curve with bounded colour saturation, lightness and light power. */
export function mapAlbumToneToLight(tone: AlbumTone | null, options: Partial<AlbumLightingConfig> = {}): AlbumLightTarget {
  const config = { ...DEFAULT_ALBUM_LIGHTING_CONFIG, ...options }
  for (const [name, value] of Object.entries(config)) if (typeof value === 'number' && !Number.isFinite(value)) throw new RangeError(`Invalid lighting parameter: ${name}`)
  if (config.minColorLightness < 0 || config.maxColorLightness > 1 || config.minColorLightness > config.maxColorLightness || config.maxSaturation < 0 || config.maxSaturation > 1 || config.minIntensityScale < 0 || config.maxIntensityScale < config.minIntensityScale || config.minCorona < 0 || config.maxCorona > 1 || config.maxCorona < config.minCorona || config.luminanceGamma <= 0 || config.transitionSeconds <= 0 || config.pointPowerPerRadius <= 0) throw new RangeError('Invalid album lighting bounds')
  const valid = tone && tone.dominant.every(Number.isFinite) && Number.isFinite(tone.luminance)
  const color = valid ? new Color().setRGB(...tone.dominant.map(v => clamp(v, 0, 1)) as [number, number, number], SRGBColorSpace) : new Color(config.fallbackColor)
  const hsl = color.getHSL({ h: 0, s: 0, l: 0 }, SRGBColorSpace)
  color.setHSL(hsl.h, Math.min(hsl.s, config.maxSaturation), clamp(hsl.l, config.minColorLightness, config.maxColorLightness), SRGBColorSpace)
  const x = Math.pow(clamp(valid ? tone.luminance : 0.35, 0, 1), config.luminanceGamma)
  const curve = x * x * (3 - 2 * x)
  return { color, intensityScale: MathUtils.lerp(config.minIntensityScale, config.maxIntensityScale, curve), corona: MathUtils.lerp(config.minCorona, config.maxCorona, curve), source: valid ? 'cover' : 'fallback' }
}

export interface AlbumLightState {
  color: Color
  intensityScale: number
  corona: number
  radius: number
  powerPerRadius: number
  intensity: number
  target: AlbumLightTarget
}

export function createAlbumLightState(options: Partial<AlbumLightingConfig> = {}, radius = 1): AlbumLightState {
  const target = mapAlbumToneToLight(null, options)
  const powerPerRadius = options.pointPowerPerRadius ?? DEFAULT_ALBUM_LIGHTING_CONFIG.pointPowerPerRadius
  return { color: target.color.clone(), intensityScale: target.intensityScale, corona: target.corona, radius, powerPerRadius, intensity: radius * powerPerRadius * target.intensityScale, target }
}

/** Interpolate in linear RGB, independently of frame rate and playback pause state. */
export function advanceAlbumLight(state: AlbumLightState, seconds: number, transitionSeconds = DEFAULT_ALBUM_LIGHTING_CONFIG.transitionSeconds): boolean {
  if (!Number.isFinite(seconds) || seconds <= 0) return false
  const amount = 1 - Math.exp(-Math.min(seconds, 0.12) / Math.max(0.01, transitionSeconds))
  state.color.lerp(state.target.color, amount)
  state.intensityScale = MathUtils.lerp(state.intensityScale, state.target.intensityScale, amount)
  state.corona = MathUtils.lerp(state.corona, state.target.corona, amount)
  const goalPower = state.radius * state.powerPerRadius * state.target.intensityScale
  state.intensity = MathUtils.lerp(state.intensity, goalPower, amount)
  const error = Math.max(Math.abs(state.color.r - state.target.color.r), Math.abs(state.color.g - state.target.color.g), Math.abs(state.color.b - state.target.color.b), Math.abs(state.intensityScale - state.target.intensityScale), Math.abs(state.corona - state.target.corona), Math.abs(state.intensity - goalPower) / Math.max(1, goalPower))
  if (error < 0.0001) {
    state.color.copy(state.target.color); state.intensityScale = state.target.intensityScale; state.corona = state.target.corona
    state.intensity = goalPower
    return false
  }
  return true
}
