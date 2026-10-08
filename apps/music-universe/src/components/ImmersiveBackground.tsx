import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, InstancedMesh, Object3D, ShaderMaterial } from 'three'
import { mulberry32 } from '../lib/generateAlbumGalaxy'
import type { AudioBands } from '../lib/audioReactivity'
import type { RenderBudget } from '../lib/interactionQuality'
import { UNIVERSE_EXPERIENCE } from '../lib/universeExperience'

type TimeRef = RefObject<number>
interface BackgroundProps { seed: number; time: TimeRef; budget: RenderBudget; bands: RefObject<AudioBands>; reducedMotion: boolean }
const STAR_COUNT = 2400

function StarField({ seed, time, budget, bands, reducedMotion }: BackgroundProps) {
  const { gl } = useThree()
  const geometry = useMemo(() => {
    const random = mulberry32(seed)
    const positions: number[] = [], colors: number[] = [], sizes: number[] = [], phases: number[] = [], indices: number[] = [], reactive: number[] = []
    const color = new Color()
    for (let i = 0; i < STAR_COUNT; i++) {
      positions.push((random() - 0.5) * 210, (random() - 0.5) * 170, -8 - random() * 120)
      color.setHSL(0.57 + random() * 0.1, random() * 0.18, 0.46 + random() * 0.4)
      if (i % 13 === 0) color.set('#dcc392')
      colors.push(color.r, color.g, color.b)
      sizes.push(0.8 + random() * 1.8 + (i % 77 === 0 ? 1.5 : 0))
      phases.push(random() * Math.PI * 2)
      indices.push(i)
      reactive.push(i % Math.round(1 / UNIVERSE_EXPERIENCE.trebleParticleFraction) === 0 ? 1 : 0)
    }
    const result = new BufferGeometry()
    result.setAttribute('position', new Float32BufferAttribute(positions, 3))
    result.setAttribute('color', new Float32BufferAttribute(colors, 3))
    result.setAttribute('aSize', new Float32BufferAttribute(sizes, 1))
    result.setAttribute('aPhase', new Float32BufferAttribute(phases, 1))
    result.setAttribute('aIndex', new Float32BufferAttribute(indices, 1))
    result.setAttribute('aReactive', new Float32BufferAttribute(reactive, 1))
    return result
  }, [seed])
  const material = useMemo(() => new ShaderMaterial({
    transparent: true, depthWrite: false, vertexColors: true, blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uDpr: { value: 1 }, uCount: { value: STAR_COUNT }, uHigh: { value: 0 },
      uBrightness: { value: UNIVERSE_EXPERIENCE.starfieldBrightness }, uDrift: { value: UNIVERSE_EXPERIENCE.trebleDrift }, uTrebleBrightness: { value: UNIVERSE_EXPERIENCE.trebleBrightness } },
    vertexShader: `
      attribute float aSize; attribute float aPhase; attribute float aIndex; attribute float aReactive;
      uniform float uTime; uniform float uDpr; uniform float uCount; uniform float uHigh;
      uniform float uBrightness; uniform float uDrift; uniform float uTrebleBrightness;
      varying vec3 vColor; varying float vTwinkle;
      void main() {
        vColor = color * uBrightness * (1.0 + aReactive * uHigh * uTrebleBrightness);
        vTwinkle = (0.68 + 0.22 * sin(uTime * 0.45 + aPhase)) * smoothstep(-48.0, 0.0, uCount - aIndex);
        vec3 drift = vec3(sin(aPhase + uTime * 1.4), cos(aPhase + uTime * 1.1), 0.0) * aReactive * uHigh * uDrift;
        vec4 eye = modelViewMatrix * vec4(position + drift, 1.0);
        gl_PointSize = clamp(aSize * uDpr * 70.0 / max(30.0, -eye.z), 0.9, 4.5 * uDpr);
        gl_Position = projectionMatrix * eye;
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vTwinkle;
      void main() {
        float radius = length(gl_PointCoord - vec2(0.5));
        float alpha = exp(-radius * radius * 18.0) * (1.0 - smoothstep(0.22, 0.5, radius));
        gl_FragColor = vec4(vColor * vTwinkle, alpha * 0.88);
        #include <colorspace_fragment>
      }`,
  }), [])
  useFrame(() => {
    const count = STAR_COUNT * budget.particleRatio
    geometry.setDrawRange(0, Math.ceil(count))
    material.uniforms.uCount.value = count
    const high = reducedMotion ? 0 : bands.current.high
    material.uniforms.uHigh.value = high
    material.uniforms.uTime.value = time.current
    material.uniforms.uDpr.value = gl.getPixelRatio()
    gl.domElement.dataset.starParticleCount = String(Math.ceil(count))
    gl.domElement.dataset.audioDustGain = (1 + high * UNIVERSE_EXPERIENCE.trebleBrightness).toFixed(5)
  })
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  return <points geometry={geometry} material={material} name="seeded-depth-starfield" />
}

function AsteroidBelt({ seed, budget }: { seed: number; budget: RenderBudget }) {
  const asteroids = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    if (!asteroids.current) return
    const random = mulberry32(seed + 19)
    const dummy = new Object3D()
    for (let i = 0; i < 120; i++) {
      dummy.position.set(-14 + i * 0.25, 4.2 + Math.sin(i * 0.046) * 1.05 + random() * 0.55, -4 - random() * 3)
      dummy.rotation.set(random() * 6, random() * 6, random() * 6)
      dummy.scale.setScalar(0.022 + random() * 0.06)
      dummy.updateMatrix()
      asteroids.current.setMatrixAt(i, dummy.matrix)
    }
    asteroids.current.instanceMatrix.needsUpdate = true
    asteroids.current.computeBoundingSphere()
  }, [seed])
  useFrame(() => { if (asteroids.current) asteroids.current.count = Math.max(1, Math.round(120 * budget.particleRatio)) })
  return <instancedMesh ref={asteroids} args={[undefined, undefined, 120]} name="instanced-asteroid-belt">
    <icosahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#797466" roughness={0.88} metalness={0.14} />
  </instancedMesh>
}

export default function ImmersiveBackground(props: BackgroundProps) {
  return <group><StarField {...props} /><AsteroidBelt seed={props.seed} budget={props.budget} /></group>
}
