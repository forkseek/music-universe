export type OrbitVector = [number, number, number]

export interface Orbit {
  radius: number
  inclination: number
  ascendingNode: number
  /** Radians per second. Shared by all bodies on this orbit. */
  angularVelocity: number
  axisU: OrbitVector
  axisV: OrbitVector
}

export const TAU = Math.PI * 2

/** Orthonormal basis for a circle tilted out of the XY plane. */
export function orbitBasis(inclination: number, ascendingNode: number): Pick<Orbit, 'axisU' | 'axisV'> {
  const c = Math.cos(ascendingNode), s = Math.sin(ascendingNode)
  return { axisU: [c, s, 0], axisV: [-s * Math.cos(inclination), c * Math.cos(inclination), Math.sin(inclination)] }
}

/** Allocation-free analytic orbit, independent of rendering and frame rate. */
export function writeOrbitPosition(target: { x: number; y: number; z: number }, orbit: Orbit, phase: number, seconds: number, center: readonly number[]) {
  const angle = (phase + seconds * orbit.angularVelocity) % TAU
  const x = Math.cos(angle) * orbit.radius, y = Math.sin(angle) * orbit.radius
  target.x = center[0] + orbit.axisU[0] * x + orbit.axisV[0] * y
  target.y = center[1] + orbit.axisU[1] * x + orbit.axisV[1] * y
  target.z = center[2] + orbit.axisU[2] * x + orbit.axisV[2] * y
  return target
}

/** Serializable initial/sample position; use writeOrbitPosition in the render loop. */
export function orbitPosition(orbit: Orbit, phase: number, seconds: number, center: readonly number[]): OrbitVector {
  const point = writeOrbitPosition({ x: 0, y: 0, z: 0 }, orbit, phase, seconds, center)
  return [point.x, point.y, point.z]
}
