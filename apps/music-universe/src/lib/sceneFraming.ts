export type RenderQuality = 'auto' | 'high' | 'low'

/** A modest 8% approach improves cover readability without changing zoom semantics. */
export const INITIAL_FRAMING_SCALE = 0.92

/** Fit the complete orbit envelope, including perspective depth, in the viewport. */
export function getGalaxyFraming(width: number, height: number, planetCount = 10, bounds?: { width: number; height: number; depth: number }) {
  const safeWidth = Number.isFinite(width) ? Math.max(1, width) : 1
  const safeHeight = Number.isFinite(height) ? Math.max(1, height) : 1
  const aspect = safeWidth / safeHeight
  const fov = 36
  const fitWidth = bounds ? Math.max(bounds.width * 1.12, (bounds.height + 3) * aspect) : 34
  const baseWidth = Math.max(fitWidth, (safeHeight < 520 ? 23 : 21) * aspect)
  const distance = (baseWidth / (2 * Math.tan(fov * Math.PI / 360) * aspect) + (bounds?.depth ?? 0) * 0.5) * INITIAL_FRAMING_SCALE
  const viewWidth = distance * 2 * Math.tan(fov * Math.PI / 360) * aspect
  return {
    fov, distance, viewWidth, viewHeight: viewWidth / aspect,
    target: [0, -0.65, 0] as [number, number, number],
    minDistance: distance * 0.94, maxDistance: distance * 1.13,
    yaw: planetCount > 20 ? 0.045 : 0.12,
    pitch: planetCount > 20 ? 0.014 : 0.055,
  }
}
