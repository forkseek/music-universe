export const ALBUM_TARGET = '@album-star'
export const MIN_SCENE_ZOOM = 0.12
export const MAX_SCENE_ZOOM = 2.8
export const ZOOM_SENSITIVITY = 0.0011
/** Overview hysteresis, rescaled from the hall room's .82–2.8 range to this wider one. */
export const OVERVIEW_ENTER = 1.15
export const OVERVIEW_EXIT = 0.95

/** Hysteresis keeps the overview flag stable while one gesture crosses the threshold. */
export function overviewFor(overviewed: boolean, zoom: number) {
  return overviewed ? zoom > OVERVIEW_EXIT : zoom >= OVERVIEW_ENTER
}

/** Snapping into a planet drops back to the base framing and leaves overview. */
export function snapGalaxyView(view: GalaxyView, target: string): GalaxyView {
  return { ...view, target, zoom: 1 }
}

export interface GalaxyView {
  target: string
  /** Camera distance relative to the complete solar-system framing. */
  zoom: number
  /** Camera and look point share this center on the scene's Z=0 plane. */
  center: [number, number]
}

export function initialGalaxyView(): GalaxyView {
  return { target: ALBUM_TARGET, zoom: 1, center: [0, -0.65] }
}

/** One continuous scale; selecting a song never changes this distance. */
export function zoomGalaxyView(view: GalaxyView, pixels: number, anchor?: [number, number]): GalaxyView {
  if (!Number.isFinite(pixels) || pixels === 0) return view
  const zoom = Math.max(MIN_SCENE_ZOOM, Math.min(MAX_SCENE_ZOOM, view.zoom * Math.exp(Math.max(-160, Math.min(160, pixels)) * ZOOM_SENSITIVITY)))
  if (zoom === view.zoom) return view
  const ratio = zoom / view.zoom
  const validAnchor = anchor?.every(Number.isFinite)
  const center: [number, number] = validAnchor && anchor
    ? [anchor[0] + (view.center[0] - anchor[0]) * ratio, anchor[1] + (view.center[1] - anchor[1]) * ratio]
    : [...view.center]
  return { ...view, zoom, center }
}
