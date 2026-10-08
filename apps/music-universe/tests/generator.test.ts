import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_ALBUM } from '../src/data/albums.ts'
import { createAlbumGalaxy, DEFAULT_GALAXY_OPTIONS, GALAXY_TEMPLATE, generateAlbumGalaxy, mulberry32, PLANET_STYLES } from '../src/lib/generateAlbumGalaxy.ts'
import { orbitPosition, TAU, writeOrbitPosition } from '../src/lib/orbitalMotion.ts'
import { getGalaxyFraming } from '../src/lib/sceneFraming.ts'
import { parseTracks, tracksToText } from '../src/lib/albumEditor.ts'

const generate = (seed: string | number) => generateAlbumGalaxy(seed, DEFAULT_ALBUM.cover, DEFAULT_ALBUM.tracks)

test('same seed produces byte-identical serializable galaxy data', () => {
  for (const seed of ['GLASS-2025', '宇宙', 0, -28, '4294967296']) {
    assert.equal(JSON.stringify(generate(seed)), JSON.stringify(generate(seed)))
  }
  assert.deepEqual(generate(42), generate('42'))
})

test('different seeds replace the star, orbits and planets while preserving the cover and decorations', () => {
  const first = generate('one'), second = generate('two')
  assert.notDeepEqual(first.planets, second.planets)
  assert.notDeepEqual(first.star, second.star)
  assert.notDeepEqual(first.orbits, second.orbits)
  assert.equal(first.star.albumCover, second.star.albumCover)
  assert.equal(first.backgroundSeed, second.backgroundSeed)
  assert.notDeepEqual(first.planets.map((p) => p.position), second.planets.map((p) => p.position))
})

test('strict track order and detail ranges hold across 200 seeds and 1–40 tracks', () => {
  for (let seed = 0; seed < 200; seed++) {
    for (const count of [1, 2, 10, 17, 40]) {
      const tracks = Array.from({ length: count }, (_, i) => ({ id: `id-${i}`, title: `track ${i}` }))
      const galaxy = generateAlbumGalaxy(seed, 'cover', tracks)
      assert.deepEqual(galaxy.planets.map((p) => p.id), tracks.map((t) => t.id))
      galaxy.planets.forEach((p, i) => {
        assert.equal(p.index, i)
        const orbit = galaxy.orbits[p.orbitIndex]
        assert.ok(Math.abs(Math.hypot(...p.position.map((value, axis) => value - galaxy.star.position[axis])) - orbit.radius) < 1e-10)
        assert.ok(orbit.radius > galaxy.star.scale + p.scale * 2)
        assert.ok(p.orbitalPhase >= 0 && p.orbitalPhase < TAU)
        assert.ok(p.scale > 0 && p.scale <= 0.76)
        assert.ok(p.moonCount >= 0 && p.moonCount <= 3)
        assert.ok(p.rotationSpeed >= 0.06 && p.rotationSpeed <= 0.22)
        assert.ok(p.emissiveIntensity >= 0.04 && p.emissiveIntensity <= 0.26)
        assert.ok(p.ringTilt >= -0.68 && p.ringTilt <= 0.68)
      })
    }
  }
})

test('album star keeps the cover, and camera framing includes the complete orbital envelope', () => {
  const galaxy = generate('cover-test')
  const { albumCover } = galaxy.star
  assert.equal(albumCover, DEFAULT_ALBUM.cover)
  for (const [width, height] of [[1600, 900], [390, 844], [844, 390]]) {
    const framing = getGalaxyFraming(width, height, galaxy.planets.length, galaxy.bounds)
    assert.ok(framing.viewWidth >= galaxy.bounds.width)
    assert.ok(framing.viewHeight >= galaxy.bounds.height)
  }
})

test('same seed responds to album metadata, cover, track titles and duration', () => {
  const first = createAlbumGalaxy(DEFAULT_ALBUM, { seed: 'SAME' })
  for (const album of [
    { ...DEFAULT_ALBUM, name: 'New album' }, { ...DEFAULT_ALBUM, artist: 'New artist' },
    { ...DEFAULT_ALBUM, cover: 'new-cover' },
    { ...DEFAULT_ALBUM, tracks: DEFAULT_ALBUM.tracks.map(t => ({ ...t, title: `${t.title}!` })) },
    { ...DEFAULT_ALBUM, tracks: DEFAULT_ALBUM.tracks.map(t => ({ ...t, duration: 999 })) },
  ]) assert.notDeepEqual(first.orbits, createAlbumGalaxy(album, { seed: 'SAME' }).orbits)
})

test('all bodies remain on closed tilted orbits, do not collide, and do not mutate seeded data', () => {
  for (const count of [1, 2, 10, 40]) for (const orbitCount of [1, Math.min(count, 6), count]) {
    const tracks = Array.from({ length: count }, (_, i) => ({ id: String(i), title: `Song ${i}` }))
    const galaxy = generateAlbumGalaxy('physics', 'cover', tracks, { orbitCount })
    const original = JSON.stringify(galaxy)
    for (const t of [0, 1, 12, 70, 99999]) {
      const points = galaxy.planets.map(p => orbitPosition(galaxy.orbits[p.orbitIndex], p.orbitalPhase, t, galaxy.star.position))
      galaxy.planets.forEach((p, index) => {
        const orbit = galaxy.orbits[p.orbitIndex]
        const offset = points[index].map((value, axis) => value - galaxy.star.position[axis])
        assert.ok(Math.abs(Math.hypot(...offset) - orbit.radius) < 1e-9)
        // planet.scale 是本体半径：球心相同的两球面最小距离 ≥ 半径差，故 ≥ 两半径之和即为安全。
        for (let j = index + 1; j < count; j++) assert.ok(Math.hypot(...points[index].map((value, axis) => value - points[j][axis])) > p.scale + galaxy.planets[j].scale)
        const closed = orbitPosition(orbit, p.orbitalPhase, TAU / orbit.angularVelocity, galaxy.star.position)
        assert.ok(closed.every((value, axis) => Math.abs(value - p.position[axis]) < 1e-9))
      })
    }
    galaxy.orbits.forEach((orbit, i) => { if (i) assert.ok(orbit.angularVelocity < galaxy.orbits[i - 1].angularVelocity) })
    assert.equal(JSON.stringify(galaxy), original)
  }
})

test('orbital calculation agrees across frame rates and reuses the supplied output', () => {
  const galaxy = generate('frame-independent'), p = galaxy.planets[0], orbit = galaxy.orbits[p.orbitIndex]
  const expected = orbitPosition(orbit, p.orbitalPhase, 12, galaxy.star.position)
  for (const fps of [30, 60, 144]) {
    const target = { x: 0, y: 0, z: 0 }
    let time = 0
    for (let i = 0; i < 12 * fps; i++) { time += 1 / fps; assert.equal(writeOrbitPosition(target, orbit, p.orbitalPhase, time, galaxy.star.position), target) }
    assert.ok([target.x, target.y, target.z].every((value, axis) => Math.abs(value - expected[axis]) < 1e-9))
  }
})

test('custom parameters control orbit count, sizes, radii, inclination, speed, colors and materials', () => {
  const options = { orbitCount: 3, planetSize: [0.3, 0.3] as const, orbitRadius: [8, 20] as const, inclination: [0.4, 0.4] as const, angularVelocity: [0.5, 0.5] as const, starSize: [2, 2] as const, colors: [['#112233', '#445566']] as const, materials: ['ice'] as const, orbitColor: '#abcdef', orbitOpacity: 0.5 }
  const before = JSON.stringify([options, DEFAULT_GALAXY_OPTIONS])
  const galaxy = createAlbumGalaxy(DEFAULT_ALBUM, { seed: 'CUSTOM', ...options })
  assert.equal(galaxy.orbits.length, 3)
  assert.equal(galaxy.star.scale, 2)
  galaxy.planets.forEach(p => { assert.equal(p.scale, 0.3); assert.equal(p.style, 'ice'); assert.equal(p.color, '#112233'); assert.equal(p.secondaryColor, '#445566') })
  galaxy.orbits.forEach(o => { assert.equal(o.inclination, 0.4); assert.equal(o.color, '#abcdef'); assert.equal(o.opacity, 0.5); assert.ok(o.radius >= 8) })
  assert.equal(galaxy.orbits[0].angularVelocity, 0.5)
  assert.equal(JSON.stringify([options, DEFAULT_GALAXY_OPTIONS]), before)
  for (const bad of [{ orbitCount: 0 }, { orbitCount: 11 }, { orbitCount: 1.5 }, { planetSize: [2, 1] as const }, { angularVelocity: [0, 0] as const }, { inclination: [NaN, 0] as const }, { colors: [] }, { materials: [] }, { orbitOpacity: Infinity }, { orbitColor: 'invalid' }]) assert.throws(() => createAlbumGalaxy(DEFAULT_ALBUM, { seed: 'bad', ...bad }))
})

test('default ten tracks receive all ten visual templates', () => {
  for (const seed of ['IGOR', 'BLONDE', 'loveless']) assert.deepEqual(new Set(generate(seed).planets.map((p) => p.style)), new Set(PLANET_STYLES))
})

test('generator never mutates album inputs or shared template', () => {
  const before = JSON.stringify([DEFAULT_ALBUM, GALAXY_TEMPLATE])
  const galaxy = generate('test')
  galaxy.star.position[0] = 300
  assert.equal(JSON.stringify([DEFAULT_ALBUM, GALAXY_TEMPLATE]), before)
})

test('PRNG is deterministic and bounded', () => {
  const a = mulberry32(28), b = mulberry32(28)
  for (let i = 0; i < 1000; i++) { const value = a(); assert.equal(value, b()); assert.ok(value >= 0 && value < 1) }
})

test('invalid inputs fail clearly', () => {
  assert.throws(() => generate(' '))
  assert.throws(() => generate(Infinity))
  assert.throws(() => generateAlbumGalaxy(1, '', []))
  assert.throws(() => generateAlbumGalaxy(1, '', [{ id: 'a', title: '' }]))
  assert.throws(() => generateAlbumGalaxy(1, '', [{ id: 'a', title: 'A' }, { id: 'a', title: 'B' }]))
})

test('track editor roundtrips titles and durations in order', () => {
  const parsed = parseTracks(tracksToText(DEFAULT_ALBUM.tracks))
  assert.deepEqual(parsed.map(({ title, duration }) => ({ title, duration })), DEFAULT_ALBUM.tracks.map(({ title, duration }) => ({ title, duration })))
  const repeated = parseTracks('Repeat\r\n\r\nRepeat | 3:02')
  assert.notEqual(repeated[0].id, repeated[1].id)
  assert.equal(repeated[1].duration, 182)
})

test('track editor rejects empty albums and invalid durations', () => {
  assert.throws(() => parseTracks('  '))
  assert.throws(() => parseTracks('Song | 3:99'))
  assert.throws(() => parseTracks(' | 3:02'))
  assert.throws(() => parseTracks(Array.from({ length: 41 }, (_, i) => `Song ${i}`).join('\n')))
})

test('album duration sizes the star, track duration sizes its planet, and songs sit inner → outer in album order', () => {
  const withDurations = (seconds: (index: number) => number) => DEFAULT_ALBUM.tracks.map((track, index) => ({ ...track, duration: seconds(index) }))
  const short = createAlbumGalaxy({ ...DEFAULT_ALBUM, tracks: withDurations(() => 100) }, { seed: 'DURATION' })
  const long = createAlbumGalaxy({ ...DEFAULT_ALBUM, tracks: withDurations(() => 320) }, { seed: 'DURATION' })
  const varied = createAlbumGalaxy({ ...DEFAULT_ALBUM, tracks: withDurations((index) => 60 + index * 25) }, { seed: 'DURATION' })
  // 专辑总时长越大，恒星越大，且始终落在 starSize 区间内
  assert.ok(long.star.scale > short.star.scale)
  assert.ok(short.star.scale >= DEFAULT_GALAXY_OPTIONS.starSize[0] && long.star.scale <= DEFAULT_GALAXY_OPTIONS.starSize[1])
  // 单曲时长越大，对应星球越大；更长者不会更小
  assert.ok(long.planets.every((planet, index) => planet.scale > short.planets[index].scale))
  varied.planets.forEach((planet, index) => {
    if (index) assert.ok(planet.scale > varied.planets[index - 1].scale)
    // 每首单曲各占一条轨道，轨道序号即专辑顺序
    assert.equal(planet.orbitIndex, index)
  })
  assert.equal(varied.orbits.length, varied.planets.length)
  varied.orbits.forEach((orbit, index) => { if (index) assert.ok(orbit.radius > varied.orbits[index - 1].radius) })
})
