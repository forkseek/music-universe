import { orbitBasis, orbitPosition, TAU } from './orbitalMotion'
import type { Orbit } from './orbitalMotion'

export type Vec3 = [number, number, number]
export type Seed = string | number
export type PlanetStyle = 'glass' | 'lava' | 'ice' | 'cloud' | 'grass' | 'metal' | 'disco' | 'ringed' | 'crystal' | 'dark'

export interface TrackSource { provider: import('./musicPlatforms').MusicPlatform; trackId: string; albumId: string; playbackId?: string }
export interface Track {
  source?: TrackSource
  discNumber?: number
  trackNumber?: number
  id: string
  title: string
  duration?: number
  /** 演唱者；逐曲缺失时由专辑级 artist 兜底，用于匹配大众评分来源。 */
  artist?: string
  /** 可选的 0–100 听众评分；缺失时由 planetMetrics 按 seed 确定性派生。 */
  rating?: number
  /** rating 的来源；缺失表示由 seed 确定性派生。 */
  ratingSource?: 'netease'
}

export interface Album {
  source?: Pick<TrackSource, 'provider' | 'albumId'>
  id: string
  name: string
  artist: string
  cover: string
  year?: number
  tracks: Track[]
}

export interface GalaxyPlanet {
  id: string
  index: number
  title: string
  duration?: number
  /** 以下三项由 generateAlbumGalaxy 从 Track 展开，随场景进入详情面板。 */
  artist?: string
  rating?: number
  ratingSource?: 'netease'
  position: Vec3
  scale: number
  style: PlanetStyle
  color: string
  secondaryColor: string
  hasRing: boolean
  ringTilt: number
  moonCount: number
  rotationSpeed: number
  emissiveIntensity: number
  surfaceSeed: number
  phase: number
  orbitIndex: number
  orbitalPhase: number
}

export interface GalaxyOrbit extends Orbit { color: string; opacity: number }
export type NumericRange = readonly [number, number]
export interface GalaxyOptions {
  /** 1..track count; defaults to one orbit per track, ordered inner → outer by album order. */
  orbitCount?: number
  /** Planet size range; each track's duration picks its size inside this range. */
  planetSize?: NumericRange
  /** Preferred inner/outer radii; expanded when necessary to keep bodies apart. */
  orbitRadius?: NumericRange
  inclination?: NumericRange
  /** Inner-orbit speed in rad/s; outer speeds follow radius^-1.5. */
  angularVelocity?: NumericRange
  /** Star size range; the album's total duration picks its size inside this range. */
  starSize?: NumericRange
  colors?: readonly (readonly [string, string])[]
  materials?: readonly PlanetStyle[]
  orbitColor?: string
  orbitOpacity?: number
  /** Stable album metadata supplied by createAlbumGalaxy. */
  albumKey?: string
}

export const DEFAULT_GALAXY_OPTIONS = {
  planetSize: [0.42, 0.7], orbitRadius: [4.2, 11.0], inclination: [0.4, 1.05],
  angularVelocity: [0.2, 0.32], starSize: [2.1, 3.4], orbitColor: '#b89b70', orbitOpacity: 0.22,
} as const

/** 绝对时长基准（秒）：专辑总时长 20–80 分钟映射到恒星尺寸区间。 */
export const ALBUM_DURATION_SECONDS: NumericRange = [20 * 60, 80 * 60]
/** 绝对时长基准（秒）：单曲 1–5 分钟映射到行星尺寸区间。 */
export const TRACK_DURATION_SECONDS: NumericRange = [60, 5 * 60]

/** 把时长映射到 0..1；缺失或非正时长取中点，保证没有时长数据的专辑仍可生成。 */
function durationRatio(seconds: number, reference: NumericRange): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0.5
  return Math.min(1, Math.max(0, (seconds - reference[0]) / (reference[1] - reference[0])))
}

/** 在尺寸区间内按 0..1 比例线性插值：时长越长，对应天体越大。 */
function durationScale(range: NumericRange, seconds: number, reference: NumericRange): number {
  return range[0] + (range[1] - range[0]) * durationRatio(seconds, reference)
}

export interface AlbumGalaxy {
  seed: string
  numericSeed: number
  templateVersion: 'album-solar-system-v2'
  bounds: { width: number; height: number; depth: number }
  star: { position: Vec3; scale: number; albumCover: string; color: string; coronaIntensity: number; rotationSpeed: number }
  orbits: GalaxyOrbit[]
  planets: GalaxyPlanet[]
  backgroundSeed: number
}

export const PLANET_STYLES: PlanetStyle[] = ['glass', 'lava', 'ice', 'cloud', 'grass', 'metal', 'disco', 'ringed', 'crystal', 'dark']

export const STYLE_LABELS: Record<PlanetStyle, string> = {
  glass: '琉璃', lava: '熔岩', ice: '冰川', cloud: '云海', grass: '森林',
  metal: '金属', disco: '迪斯科', ringed: '星环', crystal: '水晶', dark: '暗物质',
}

// UI decorations keep the original visual language; orbital layout is generated.
export const GALAXY_TEMPLATE = {
  width: 32,
  height: 18,
  starPosition: [-11.0, 0.7, 0] as Vec3,
  starScale: 2.65,
  trackStartX: -5.7,
  trackEndX: 13.4,
}

const PALETTES: Record<PlanetStyle, [string, string][]> = {
  glass: [['#83dfca', '#116776'], ['#d2c1f7', '#5c5b9a']],
  lava: [['#ec794d', '#341419'], ['#e6ae6a', '#611e2c']],
  ice: [['#b6d9e6', '#407a99'], ['#d5dcf2', '#626bb2']],
  cloud: [['#dbc8ae', '#877091'], ['#bdc6ea', '#545a91']],
  grass: [['#8bb995', '#193f3c'], ['#b4c79c', '#3b5752']],
  metal: [['#c9b5a1', '#4c5870'], ['#aebfcc', '#465869']],
  disco: [['#dba3c4', '#647fbd'], ['#adc4c8', '#8661a5']],
  ringed: [['#e6c597', '#987161'], ['#b4ccda', '#556485']],
  crystal: [['#aca3db', '#475d98'], ['#8cc9c6', '#395777']],
  dark: [['#8384a8', '#1c273d'], ['#bd9075', '#28304a']],
}

export function hashSeed(seed: Seed): number {
  const value = String(seed).trim()
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function checkedRange(name: string, value: NumericRange, min: number, max: number): NumericRange {
  if (value.length !== 2 || !value.every(Number.isFinite) || value[0] < min || value[1] > max || value[0] > value[1]) throw new Error(`${name} 参数范围无效。`)
  return value
}

/** Pure, DOM-free and serializable. Same seed + album + options = same galaxy. */
export function generateAlbumGalaxy(seed: Seed, albumCover: string, tracks: readonly Track[], options: GalaxyOptions = {}): AlbumGalaxy {
  const normalizedSeed = String(seed).trim()
  if (!normalizedSeed || (typeof seed === 'number' && !Number.isFinite(seed))) throw new Error('请输入有效的 Seed。')
  if (tracks.length < 1 || tracks.length > 300) throw new Error('曲目数量需要在 1–300 首之间。')
  if (tracks.some((track) => !track.id || !track.title.trim()) || new Set(tracks.map((track) => track.id)).size !== tracks.length) {
    throw new Error('每首曲目需要唯一 ID 和非空标题。')
  }
  const settings = { ...DEFAULT_GALAXY_OPTIONS, ...options }
  // 每首单曲各占一条轨道，半径按专辑顺序由内到外依次递增；显式传入 orbitCount 时仍可让多首共轨。
  const orbitCount = options.orbitCount ?? tracks.length
  if (!Number.isInteger(orbitCount) || orbitCount < 1 || orbitCount > tracks.length) throw new Error('轨道数量应为 1 到曲目数之间的整数。')
  const planetSize = checkedRange('行星尺寸', settings.planetSize, 0.05, 3)
  const orbitRadius = checkedRange('轨道半径', settings.orbitRadius, 0.1, 200)
  const inclination = checkedRange('倾角', settings.inclination, -Math.PI / 2, Math.PI / 2)
  const angularVelocity = checkedRange('角速度', settings.angularVelocity, 0.001, 3)
  const starSize = checkedRange('恒星尺寸', settings.starSize, 0.2, 10)
  const validColor = (color: string) => /^#[\da-f]{6}$/i.test(color)
  if (!validColor(settings.orbitColor) || !Number.isFinite(settings.orbitOpacity) || settings.orbitOpacity < 0 || settings.orbitOpacity > 1) throw new Error('轨道颜色或透明度无效。')
  if (options.colors && (!options.colors.length || options.colors.some(pair => pair.length !== 2 || !pair.every(validColor)))) throw new Error('配色需要非空的十六进制颜色对。')
  if (options.materials && (!options.materials.length || options.materials.some(style => !PLANET_STYLES.includes(style)))) throw new Error('请选择有效的行星材质。')
  // Hash large cover data once, without retaining another copy in the output.
  const albumFingerprint = hashSeed(JSON.stringify([options.albumKey ?? '', hashSeed(albumCover), tracks.map(t => [t.id, t.title, t.duration ?? null])]))
  const numericSeed = hashSeed(`${normalizedSeed}:${albumFingerprint}`)
  const random = mulberry32(numericSeed)
  const range = (min: number, max: number) => min + random() * (max - min)
  // Album total duration decides the star size; each track's duration decides its planet size.
  const albumSeconds = tracks.reduce((total, track) => total + (track.duration ?? 0), 0)
  // Shuffle a material bag, never the tracks: ten tracks get all ten templates.
  const styles = [...(options.materials ?? PLANET_STYLES)]
  for (let i = styles.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[styles[i], styles[j]] = [styles[j], styles[i]]
  }
  const star = {
    position: [range(-0.6, 0.6), range(0.15, 0.8), 0] as Vec3,
    scale: durationScale(starSize, albumSeconds, ALBUM_DURATION_SECONDS), albumCover,
    color: ['#edbe72', '#e6c794', '#efb18a'][Math.floor(random() * 3)],
    coronaIntensity: range(0.5, 0.8), rotationSpeed: range(0.018, 0.033),
  }
  const planets = tracks.map((track, index): GalaxyPlanet => {
    const style = styles[index % styles.length]
    const palettes = options.colors ?? PALETTES[style]
    const palette = palettes[Math.floor(random() * palettes.length)]
    return {
      ...track,
      index,
      position: [0, 0, 0],
      scale: durationScale(planetSize, track.duration ?? 0, TRACK_DURATION_SECONDS),
      style,
      color: palette[0],
      secondaryColor: palette[1],
      hasRing: style === 'ringed' || random() < 0.26,
      ringTilt: range(-0.68, 0.68),
      moonCount: Math.floor(random() * 4),
      rotationSpeed: range(0.06, 0.22),
      emissiveIntensity: range(0.04, 0.26),
      surfaceSeed: Math.floor(random() * 4294967296),
      phase: range(0, Math.PI * 2),
      orbitIndex: index % orbitCount,
      orbitalPhase: 0,
    }
  })
  const orbits: GalaxyOrbit[] = []
  let previousReach = 0
  const innerSpeed = range(...angularVelocity)
  for (let index = 0; index < orbitCount; index++) {
    const members = planets.filter(planet => planet.orbitIndex === index)
    // planet.scale 是本体半径。轨道允许在 3D 中交错，径向壳因此只需保证相邻壳上
    // 任意两颗行星在任意时刻都不相交：径差 ≥ 两颗半径之和 + 安全余量。
    // （球心相同的两球面上任意两点距离 ≥ 半径差，与倾角无关，故该条件充分。）
    const reach = Math.max(...members.map(planet => planet.scale))
    const preferred = orbitRadius[0] + (orbitRadius[1] - orbitRadius[0]) * index / Math.max(1, orbitCount - 1) + range(0, 0.28)
    const clearance = index === 0 ? star.scale * 1.35 + reach + 0.5 : orbits[index - 1].radius + previousReach + reach + 0.3
    const chordRadius = members.length > 1 ? (reach * 2 + 0.25) / Math.sin(Math.PI / members.length) : 0
    const radius = Math.max(preferred, clearance, chordRadius)
    const tilt = range(...inclination), node = range(-0.28, 0.28)
    const orbit: GalaxyOrbit = {
      radius, inclination: tilt, ascendingNode: node,
      angularVelocity: innerSpeed * ((orbits[0]?.radius ?? radius) / radius) ** 1.5,
      ...orbitBasis(tilt, node), color: settings.orbitColor, opacity: settings.orbitOpacity,
    }
    orbits.push(orbit)
    const phase = range(0, TAU)
    members.forEach((planet, slot) => {
      planet.orbitalPhase = (phase + slot * TAU / members.length) % TAU
      planet.position = orbitPosition(orbit, planet.orbitalPhase, 0, star.position)
    })
    previousReach = reach
  }
  const extents: Vec3 = [0, 0, 0]
  orbits.forEach(orbit => {
    for (const axis of [0, 1, 2] as const) extents[axis] = Math.max(extents[axis], Math.abs(star.position[axis]) + orbit.radius * Math.hypot(orbit.axisU[axis], orbit.axisV[axis]) + planetSize[1] * 2)
  })
  return {
    seed: normalizedSeed,
    numericSeed,
    templateVersion: 'album-solar-system-v2',
    bounds: { width: Math.max(32, extents[0] * 2), height: Math.max(18, extents[1] * 2 + 2), depth: extents[2] * 2 },
    star, planets, orbits,
    // Decorative space stays fixed; randomization is confined to planet details.
    backgroundSeed: 77031,
  }
}

/** Recommended album-level entry point. Metadata changes also change the system. */
export function createAlbumGalaxy(album: Album, { seed, ...options }: GalaxyOptions & { seed: Seed }): AlbumGalaxy {
  return generateAlbumGalaxy(seed, album.cover, album.tracks, { ...options, albumKey: JSON.stringify([album.id, album.name, album.artist, album.year ?? null]) })
}

/** Randomness is introduced at the user action, then persisted for exact replay. */
export function createGalaxySeed(): string {
  return `MU-${Array.from(crypto.getRandomValues(new Uint32Array(2)), value => value.toString(36).toUpperCase()).join('-')}`
}
