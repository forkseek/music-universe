import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_ALBUM } from '../src/data/albums.ts'
import { derivePlanetMetrics, PLANET_METRIC_RANGES, resolvePlanetRating } from '../src/lib/planetMetrics.ts'
import { TAU } from '../src/lib/orbitalMotion.ts'

test('duration drives size, diameter, orbital period and rotation period', () => {
  const short = derivePlanetMetrics({ id: 'a', title: 'A', duration: 60 }, 'SEED')
  const long = derivePlanetMetrics({ id: 'a', title: 'A', duration: 300 }, 'SEED')
  assert.ok(long.size > short.size)
  assert.ok(long.diameter > short.diameter)
  assert.ok(long.orbitalPeriod > short.orbitalPeriod)
  assert.ok(long.rotationPeriod > short.rotationPeriod)
  // 周期与角速度互为倒数，UI 展示的数值与场景实际转速必须一致。
  assert.ok(Math.abs(short.angularVelocity * short.orbitalPeriod - TAU) < 1e-12)
  assert.ok(Math.abs(long.rotationSpeed * long.rotationPeriod - TAU) < 1e-12)
})

test('metrics stay inside their documented ranges, including when durations are missing', () => {
  for (const duration of [undefined, 0, -5, Number.NaN, 1, 60, 182, 300, 900]) {
    const metrics = derivePlanetMetrics({ id: 'x', title: 'X', duration: duration as number | undefined }, 'RANGE')
    assert.ok(metrics.size >= PLANET_METRIC_RANGES.size[0] - 1e-9 && metrics.size <= PLANET_METRIC_RANGES.size[1] + 1e-9)
    assert.ok(metrics.orbitalPeriod >= PLANET_METRIC_RANGES.orbitalPeriod[0] - 1e-9 && metrics.orbitalPeriod <= PLANET_METRIC_RANGES.orbitalPeriod[1] + 1e-9)
    assert.ok(metrics.rotationPeriod >= PLANET_METRIC_RANGES.rotationPeriod[0] - 1e-9 && metrics.rotationPeriod <= PLANET_METRIC_RANGES.rotationPeriod[1] + 1e-9)
    assert.ok(metrics.mass >= PLANET_METRIC_RANGES.mass[0] - 1e-9 && metrics.mass <= PLANET_METRIC_RANGES.mass[1] + 1e-9)
    assert.ok(Number.isFinite(metrics.diameter) && metrics.diameter > 0)
  }
  // 缺失时长取中点，与 generateAlbumGalaxy 的 durationRatio 回退保持一致。
  assert.equal(derivePlanetMetrics({ id: 'x', title: 'X' }, 'RANGE').durationSeconds, null)
})

test('a real rating drives mass; the simulated rating stays deterministic and bounded', () => {
  const light = derivePlanetMetrics({ id: 'a', title: 'A', duration: 120, rating: 0 }, 'SEED')
  const heavy = derivePlanetMetrics({ id: 'a', title: 'A', duration: 120, rating: 100 }, 'SEED')
  assert.equal(light.rating, 0)
  assert.equal(heavy.rating, 100)
  assert.ok(heavy.mass > light.mass)
  // 超出范围的评分被夹取，而不是让重量溢出。
  assert.equal(resolvePlanetRating({ id: 'a', title: 'A', rating: -20 }, 'SEED'), 0)
  assert.equal(resolvePlanetRating({ id: 'a', title: 'A', rating: 400 }, 'SEED'), 100)
  for (const track of DEFAULT_ALBUM.tracks) {
    const rating = resolvePlanetRating(track, 'MU-TEST')
    assert.ok(Number.isInteger(rating) && rating >= 0 && rating <= 100)
    assert.equal(rating, resolvePlanetRating(track, 'MU-TEST'))
  }
})

test('the same song and seed always produce the same metrics', () => {
  for (const track of DEFAULT_ALBUM.tracks) {
    assert.deepEqual(derivePlanetMetrics(track, 'REPLAY'), derivePlanetMetrics(track, 'REPLAY'))
  }
  // 不同曲目在同一星系里不会撞出同一份派生结果。
  const ratings = new Set(DEFAULT_ALBUM.tracks.map((track) => resolvePlanetRating(track, 'REPLAY')))
  assert.ok(ratings.size > 1)
})
