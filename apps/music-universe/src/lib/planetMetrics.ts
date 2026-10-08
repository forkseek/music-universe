import { TRACK_DURATION_SECONDS } from './generateAlbumGalaxy'
import type { Track } from './generateAlbumGalaxy'
import { TAU } from './orbitalMotion'

export type MetricRange = readonly [number, number]

/** 点击星球时，由该星球的歌曲数据推导出的展示属性。 */
export interface PlanetMetrics {
  /** 歌曲时长（秒）；缺失时为 null。 */
  durationSeconds: number | null
  /** 0–100 评分：真实评分优先，否则由 seed + 曲目确定性派生。 */
  rating: number
  /** 星球半径，与 GalaxyPlanet.scale 同单位，因此面板数值就是 3D 里的实际半径。 */
  size: number
  /** 直径（千米）。 */
  diameter: number
  /** 公转周期（秒）。 */
  orbitalPeriod: number
  /** 自转周期（秒）。 */
  rotationPeriod: number
  /** 公转角速度（rad/s），由公转周期推导。 */
  angularVelocity: number
  /** 自转角速度（rad/s），由自转周期推导。 */
  rotationSpeed: number
  /** 重量（相对地球质量）。 */
  mass: number
}

/**
 * 展示尺度常量。size 与 DEFAULT_GALAXY_OPTIONS.planetSize 对齐，
 * 所以面板里的半径与星球在 3D 中的实际半径一致。
 */
export const PLANET_METRIC_RANGES = {
  size: [0.42, 0.7] as MetricRange,
  /** 半径 → 直径（千米）换算系数：0.42–0.7 对应约 5,460–9,100 km。 */
  diameterKilometres: 13_000,
  orbitalPeriod: [30, 90] as MetricRange,
  rotationPeriod: [30, 100] as MetricRange,
  mass: [0.2, 12.8] as MetricRange,
} as const

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const interpolate = (range: MetricRange, ratio: number) => range[0] + (range[1] - range[0]) * ratio

/** 缺失或非法时长取中点，保证没有时长数据的曲目仍能推导出属性。 */
function durationRatio(seconds: number | undefined): number {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return 0.5
  return clamp01((seconds - TRACK_DURATION_SECONDS[0]) / (TRACK_DURATION_SECONDS[1] - TRACK_DURATION_SECONDS[0]))
}

/** FNV-1a：把曲目标识散列成稳定的 0..1 值，因此同一星系反复点击结果不变。 */
function hashRatio(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967296
}

type RatingSource = Pick<Track, 'id' | 'title' | 'rating'>
type MetricSource = Pick<Track, 'id' | 'title' | 'duration' | 'rating'>

/** 有真实评分就用真实评分；否则用 seed + 曲目确定性派生，缺失时也能"模拟"出评分。 */
export function resolvePlanetRating(track: RatingSource, seed: string | number): number {
  if (typeof track.rating === 'number' && Number.isFinite(track.rating)) return Math.round(Math.min(100, Math.max(0, track.rating)))
  return Math.round(hashRatio(`${seed}:${track.id}:${track.title}`) * 100)
}

/** 歌曲时长 → 尺寸 / 直径 / 公转周期 / 自转周期；评分 → 重量。 */
export function derivePlanetMetrics(track: MetricSource, seed: string | number): PlanetMetrics {
  const duration = typeof track.duration === 'number' && Number.isFinite(track.duration) && track.duration > 0 ? track.duration : undefined
  const rating = resolvePlanetRating(track, seed)
  const ratio = durationRatio(duration)
  const size = interpolate(PLANET_METRIC_RANGES.size, ratio)
  const orbitalPeriod = interpolate(PLANET_METRIC_RANGES.orbitalPeriod, ratio)
  const rotationPeriod = interpolate(PLANET_METRIC_RANGES.rotationPeriod, ratio)
  return {
    durationSeconds: duration ?? null,
    rating,
    size,
    diameter: size * 2 * PLANET_METRIC_RANGES.diameterKilometres,
    orbitalPeriod,
    rotationPeriod,
    angularVelocity: TAU / orbitalPeriod,
    rotationSpeed: TAU / rotationPeriod,
    mass: interpolate(PLANET_METRIC_RANGES.mass, rating / 100),
  }
}
