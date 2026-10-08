export interface AlbumSurfaceConfig {
  /** Half width of the blend belt in normalized sphere coordinates. */
  seamWidth: number
  /** Distance of edge samples from the image border. */
  edgeInset: number
  /** Vertical blur radius of the low frequency seam color, in UV units. */
  edgeBlur: number
}

export const ALBUM_SURFACE_CONFIG: Readonly<AlbumSurfaceConfig> = Object.freeze({
  seamWidth: .32, edgeInset: .065, edgeBlur: .045,
})

export function albumSurfaceConfig(options: Partial<AlbumSurfaceConfig> = {}): AlbumSurfaceConfig {
  const bounded = (value: number | undefined, fallback: number, min: number, max: number) =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, value!)) : fallback
  return {
    seamWidth: bounded(options.seamWidth, ALBUM_SURFACE_CONFIG.seamWidth, .08, .6),
    edgeInset: bounded(options.edgeInset, ALBUM_SURFACE_CONFIG.edgeInset, .01, .2),
    edgeBlur: bounded(options.edgeBlur, ALBUM_SURFACE_CONFIG.edgeBlur, 0, .12),
  }
}
