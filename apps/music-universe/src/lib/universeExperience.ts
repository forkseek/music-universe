/** Shared visual limits; none of these values affect audio volume or camera position. */
export const UNIVERSE_EXPERIENCE = {
  labelFadeMs: 260,
  backgroundBrightness: 0.84,
  starfieldBrightness: 0.84,
  haloScaleGain: 0.07,
  haloOpacityGain: 0.12,
  trebleDrift: 0.12,
  trebleBrightness: 0.18,
  trebleParticleFraction: 0.08,
  nearEnterZoom: 0.70,
  nearExitZoom: 0.84,
} as const

export const MUSIC_EFFECT_LEVELS = { off: 0, subtle: 0.35, full: 0.7 } as const
export type MusicEffectLevel = keyof typeof MUSIC_EFFECT_LEVELS
export type LyricViewMode = 'near' | 'overview'

export function shouldShowPlanetLabel(id: string, playingId: string | null, hoverId: string | null, keyboardFocused = false) {
  return id === playingId || id === hoverId || keyboardFocused
}

/** Two thresholds prevent repeated layout switches around the close-up boundary. */
export function nextLyricViewMode(current: LyricViewMode, following: boolean, zoom: number): LyricViewMode {
  if (!following || !Number.isFinite(zoom)) return 'overview'
  if (current === 'near') return zoom >= UNIVERSE_EXPERIENCE.nearExitZoom ? 'overview' : 'near'
  return zoom <= UNIVERSE_EXPERIENCE.nearEnterZoom ? 'near' : 'overview'
}
