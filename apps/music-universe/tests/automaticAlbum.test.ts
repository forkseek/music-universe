import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LatestAlbumRequest, PlaybackAlbumResolver, playbackAlbumFromResolution, playingIdentity } from '../src/lib/automaticAlbum.ts'
import type { AlbumResolution, PlayingIdentity } from '../src/lib/automaticAlbum.ts'
import { createAlbumGalaxy } from '../src/lib/generateAlbumGalaxy.ts'
const identity: PlayingIdentity = { provider: 'netease', trackId: '2', albumId: '100', title: 'Second', artist: 'Artist', album: 'Release' }
const resolution = (index = 1): AlbumResolution => ({ album: { provider: 'netease', id: '100', name: 'Release', artist: 'Artist', cover: '/api/music/album/cover?provider=netease&id=100', tracks:
  ['First', 'Second', 'Third'].map((name, i) => ({ provider: 'netease', id: String(i + 1), playbackId: `play-${i}`, name, artist: 'Artist', album: 'Release', albumId: '100', cover: '', duration: 180000, fee: 0, discNumber: 1, trackNumber: i + 1 })) },
  trackId: String(index + 1), trackIndex: index, matchedBy: 'id' })
test('complete album metadata maps to the star and exact ordered planet, with reusable source references', () => {
  const value = playbackAlbumFromResolution(resolution())
  const galaxy = createAlbumGalaxy(value.album, { seed: 'unchanged' })
  assert.equal(galaxy.star.albumCover, '/mw/api/music/album/cover?provider=netease&id=100')
  assert.deepEqual(galaxy.planets.map(p => p.title), ['First', 'Second', 'Third'])
  assert.equal(galaxy.planets[1].id, value.planetId)
  assert.equal(value.album.tracks[1].source?.trackId, '2')
  assert.deepEqual(createAlbumGalaxy(value.album, { seed: 'unchanged' }), galaxy)
})
test('millisecond durations become whole seconds for planet labels and total album time', () => {
  const raw = resolution(); raw.album.tracks[1].duration = 190123
  assert.equal(playbackAlbumFromResolution(raw).album.tracks[1].duration, 190)
})
test('invalid track positions fail instead of highlighting a guessed planet', () => {
  assert.throws(() => playbackAlbumFromResolution({ ...resolution(), trackIndex: 99 }))
  assert.throws(() => playbackAlbumFromResolution({ ...resolution(), trackId: '1' }))
})
test('same album is cached while successive songs keep their own track index', async () => {
  let calls = 0
  const resolver = new PlaybackAlbumResolver(async () => { calls++; return resolution() })
  const first = await resolver.resolve(identity, new AbortController().signal)
  const second = await resolver.resolve({ ...identity, trackId: '3', title: 'Third' }, new AbortController().signal)
  assert.equal(calls, 1); assert.equal(first.trackIndex, 1); assert.equal(second.trackIndex, 2)
  assert.equal(second.album.tracks[2].id, second.planetId)
})
test('metadata for one release is never reused as another release', async () => {
  let calls = 0
  const resolver = new PlaybackAlbumResolver(async () => { calls++; return resolution() })
  await resolver.resolve(identity, new AbortController().signal)
  await resolver.resolve({ ...identity, albumId: 'different-edition' }, new AbortController().signal)
  assert.equal(calls, 2)
})
test('a late response cannot overwrite a newer playback even if the upstream ignores cancellation', async () => {
  const waiting: { resolve: (value: AlbumResolution) => void }[] = []
  const resolver = new PlaybackAlbumResolver(() => new Promise(resolve => waiting.push({ resolve })))
  const latest = new LatestAlbumRequest(), applied: number[] = []
  const old = latest.run(identity, resolver, value => { applied.push(value.trackIndex) })
  const rejected = assert.rejects(old, { name: 'AbortError' })
  const next = latest.run({ ...identity, albumId: '101', trackId: '3' }, resolver, value => { applied.push(value.trackIndex) })
  waiting[1].resolve(resolution(2)); await next
  waiting[0].resolve(resolution(1)); await rejected
  assert.deepEqual(applied, [2])
})
test('a failed fetch leaves the existing scene untouched', async () => {
  const resolver = new PlaybackAlbumResolver(async () => { throw new Error('network') })
  const latest = new LatestAlbumRequest(); let applied = false
  await assert.rejects(latest.run(identity, resolver, () => { applied = true }), /network/)
  assert.equal(applied, false)
})
test('metadata-only files are supported, untagged raw audio is not falsely identified', () => {
  assert.equal(playingIdentity({ id: 'file-a', title: 'filename', artist: '本地音频', album: '', cover: '' }), null)
  assert.equal(playingIdentity({ id: 'url-a', title: 'a.mp3', artist: 'cdn.example', album: '在线音频', cover: '' }), null)
  assert.equal(playingIdentity({ id: 'file-b', title: 'Second', artist: 'Artist', album: 'Release', cover: '' })?.title, 'Second')
})
test('auto-fetched albums above the old 40-track limit keep their complete order', () => {
  const raw = resolution()
  raw.album.tracks = Array.from({ length: 60 }, (_, i) => ({ ...raw.album.tracks[0], id: String(i + 1), name: `Track ${i + 1}`, trackNumber: i + 1 }))
  raw.trackIndex = 49; raw.trackId = '50'
  const mapped = playbackAlbumFromResolution(raw)
  const galaxy = createAlbumGalaxy(mapped.album, { seed: 'complete' })
  assert.equal(galaxy.planets.length, 60); assert.equal(galaxy.planets[49].title, 'Track 50'); assert.equal(galaxy.planets[49].id, mapped.planetId)
})
