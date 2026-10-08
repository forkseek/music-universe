import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SRGBColorSpace } from 'three'
import { advanceAlbumLight, createAlbumLightState, DEFAULT_ALBUM_LIGHTING_CONFIG as config, extractAlbumTone, mapAlbumToneToLight, sampleAlbumTone } from '../src/lib/albumLighting'

const tone = (rgb: [number, number, number], luminance: number) => ({ dominant: rgb, luminance, samples: 1 })
test('colour extraction ignores transparent pixels and weighs coloured artwork over neutral margins', () => {
  const pixels = new Uint8ClampedArray([
    ...Array(25).fill([255, 255, 255, 255]).flat(),
    ...Array(10).fill([20, 50, 220, 255]).flat(),
    ...Array(100).fill([255, 0, 0, 0]).flat(),
  ])
  const value = extractAlbumTone(pixels)!
  assert.equal(value.samples, 35)
  assert.ok(value.dominant[2] > .8 && value.dominant[0] < .1)
  assert.ok(value.luminance > .6 && value.luminance < .8)
  assert.equal(extractAlbumTone(new Uint8Array([255, 0, 0, 0])), null)
})
test('red/blue/pink keep their hue while chroma and brightness are bounded in sRGB', () => {
  for (const [rgb, hue] of [[[1, 0, 0], 0], [[0, 0, 1], 2 / 3], [[1, .4, .7], 11 / 12]] as const) {
    const light = mapAlbumToneToLight(tone([...rgb], .3))
    const hsl = light.color.getHSL({ h: 0, s: 0, l: 0 }, SRGBColorSpace)
    assert.ok(Math.abs(hsl.h - hue) < .00001)
    assert.ok(hsl.s <= config.maxSaturation + .00001)
    assert.ok(hsl.l >= config.minColorLightness - .00001 && hsl.l <= config.maxColorLightness + .00001)
  }
})
test('all luminances produce monotonic, bounded light power and corona; black/white are safe', () => {
  let previous = 0
  for (let i = -5; i <= 105; i++) {
    const light = mapAlbumToneToLight(tone([.5, .5, .5], i / 100))
    assert.ok(light.intensityScale >= config.minIntensityScale && light.intensityScale <= config.maxIntensityScale)
    assert.ok(light.intensityScale >= previous)
    assert.ok(light.corona >= config.minCorona && light.corona <= config.maxCorona)
    previous = light.intensityScale
  }
  for (const rgb of [[0, 0, 0], [1, 1, 1]] as [number, number, number][]) {
    const light = mapAlbumToneToLight(tone(rgb, rgb[0]))
    assert.ok(light.color.r > 0 && light.color.r < 1)
    assert.equal(light.color.r, light.color.b)
  }
})
test('configuration changes bounds and curve without requiring album-specific tables', () => {
  const options = { minIntensityScale: .9, maxIntensityScale: 1.0, luminanceGamma: 2 }
  const mapped = mapAlbumToneToLight(tone([1, .2, .3], .4), options)
  assert.ok(mapped.intensityScale >= .9 && mapped.intensityScale <= 1)
  assert.notEqual(mapped.intensityScale, mapAlbumToneToLight(tone([1, .2, .3], .4)).intensityScale)
  assert.throws(() => mapAlbumToneToLight(null, { minIntensityScale: 2, maxIntensityScale: 1 }), RangeError)
  assert.throws(() => mapAlbumToneToLight(null, { luminanceGamma: NaN }), RangeError)
})
test('missing/unreadable cover returns a finite bounded fallback', () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData() { throw new DOMException('tainted', 'SecurityError') } }) }) } })
  try { assert.equal(sampleAlbumTone({} as HTMLImageElement), null) }
  finally { if (saved) Object.defineProperty(globalThis, 'document', saved); else Reflect.deleteProperty(globalThis, 'document') }
  const fallback = mapAlbumToneToLight(null)
  assert.equal(fallback.source, 'fallback')
  assert.ok([fallback.color.r, fallback.color.g, fallback.color.b, fallback.intensityScale].every(Number.isFinite))
})
test('crossfade is frame-rate independent, does not overshoot, and includes radius-driven power', () => {
  const a = createAlbumLightState({}, 2), b = createAlbumLightState({}, 2)
  const target = mapAlbumToneToLight(tone([.1, .1, 1], .07))
  for (const [state, fps] of [[a, 30], [b, 144]] as const) {
    const initial = state.intensity
    state.target = target; state.radius = 3.5
    for (let frame = 0; frame < fps; frame++) {
      advanceAlbumLight(state, 1 / fps)
      assert.ok(state.intensity >= initial && state.intensity <= 3.5 * 14 * target.intensityScale)
    }
  }
  assert.ok(Math.abs(a.intensity - b.intensity) < 1e-10)
  assert.ok(Math.abs(a.color.r - b.color.r) < 1e-10)
  const red = mapAlbumToneToLight(tone([1, 0, 0], .2))
  a.target = red
  const before = a.color.clone()
  advanceAlbumLight(a, 1 / 60)
  assert.ok(Math.abs(a.color.r - before.r) < .03)
  for (let i = 0; i < 500; i++) advanceAlbumLight(a, 1 / 60)
  assert.equal(a.color.getHexString(), red.color.getHexString())
  assert.equal(a.intensity, a.radius * a.powerPerRadius * red.intensityScale)
})
