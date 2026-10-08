import test from 'node:test'
import assert from 'node:assert/strict'
import { nextAlbumTrack } from '../src/lib/albumPlayback'
import { NextTrackPreloader, NEXT_TRACK_PRELOAD } from '../src/lib/nextTrackPreload'
import type { Album } from '../src/lib/generateAlbumGalaxy'
import type { AudioTrackInfo } from '../src/hooks/useAudioPlayback'

const album: Album = { id: 'album', name: 'Album', artist: 'Artist', cover: '', tracks: ['a', 'b', 'c'].map((id, i) => ({
  id, title: id, source: { provider: 'netease', trackId: String(i + 1), playbackId: id },
})) }
const playing = (planetId?: string): AudioTrackInfo => ({ id: 'playing', title: '', artist: '', album: '', cover: '', planetId })
const response = () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/wav' } })
const resolved = (id: string) => ({ url: `/audio/${id}`, info: { id } })
const fetcher = (f: (url: string) => Response | Promise<Response>) => (async (input: string | URL | Request) => f(String(input))) as typeof fetch

test('automatic next preserves album order, wraps like the manual player and does not guess an unrelated file', () => {
  assert.equal(nextAlbumTrack(album, playing('a'))?.id, 'b')
  assert.equal(nextAlbumTrack(album, playing('c'))?.id, 'a')
  assert.equal(nextAlbumTrack(album, { ...playing(), provider: 'netease', platformTrackId: '2' })?.id, 'c')
  assert.equal(nextAlbumTrack(album, playing('unrelated')), undefined)
  assert.equal(nextAlbumTrack({ ...album, tracks: [] }, playing()), undefined)
  assert.equal(nextAlbumTrack({ ...album, tracks: [album.tracks[0]] }, playing('a'))?.id, 'a')
})

test('repeated time updates resolve and download once; consumed bytes become a playable owned URL', async () => {
  let resolutions = 0, downloads = 0
  const preloader = new NextTrackPreloader(undefined, fetcher(() => { downloads++; return response() }))
  const resolve = async () => { resolutions++; return resolved('b') }
  const first = preloader.prepare('b', resolve)
  assert.equal(preloader.prepare('b', resolve), first)
  await first
  const source = preloader.take('b')!
  try {
    assert.equal(resolutions, 1); assert.equal(downloads, 1)
    assert.equal(source.objectUrl, true); assert.equal(source.info.id, 'b')
    assert.deepEqual(new Uint8Array(await (await fetch(source.url)).arrayBuffer()), new Uint8Array([1, 2, 3]))
    assert.equal(preloader.take('b'), undefined)
  } finally { URL.revokeObjectURL(source.url) }
})

test('late preparation cannot replace a newer song, even if an adapter ignores cancellation', async () => {
  let release!: (value: ReturnType<typeof resolved>) => void
  let cancelled!: AbortSignal
  const downloads: string[] = []
  const preloader = new NextTrackPreloader(undefined, fetcher(url => { downloads.push(url); return response() }))
  const old = preloader.prepare('old', signal => { cancelled = signal; return new Promise(resolve => { release = resolve }) })
  await preloader.prepare('new', async () => resolved('new'))
  release(resolved('old')); await old
  assert.equal(cancelled.aborted, true)
  assert.deepEqual(downloads, ['/audio/new'])
  const source = preloader.take('new')!
  try { assert.equal(source.info.id, 'new') } finally { URL.revokeObjectURL(source.url) }
})

test('expired preparation is discarded instead of loading a stale ticket', async () => {
  let clock = 0
  const preloader = new NextTrackPreloader(undefined, fetcher(response), () => clock)
  await preloader.prepare('b', async () => resolved('b'))
  clock = NEXT_TRACK_PRELOAD.ttlMs + 1
  assert.equal(preloader.take('b'), undefined)
})

test('failed buffering retains the resolved stream and does not fail current playback', async () => {
  const preloader = new NextTrackPreloader(undefined, fetcher(() => { throw new Error('offline') }))
  await preloader.prepare('b', async () => resolved('b'))
  assert.deepEqual(preloader.take('b'), resolved('b'))
})

test('oversized and non-audio responses fall back to streaming without retaining their bytes', async () => {
  for (const headers of [{ 'Content-Type': 'audio/wav', 'Content-Length': '100' }, { 'Content-Type': 'text/html' }, { 'Content-Type': 'audio/wav' }]) {
    const preloader = new NextTrackPreloader({ ...NEXT_TRACK_PRELOAD, maxBytes: 2 }, fetcher(() => new Response(new Uint8Array([1, 2, 3]), { headers })))
    await preloader.prepare('b', async () => resolved('b'))
    assert.deepEqual(preloader.take('b'), resolved('b'))
  }
})

test('manual consumption can use a resolved source immediately and cancels an unfinished download', async () => {
  let release!: (value: Response) => void
  let cancelled!: AbortSignal
  const request = (async (_input, init) => { cancelled = init!.signal!; return new Promise<Response>(resolve => { release = resolve }) }) as typeof fetch
  const preloader = new NextTrackPreloader(undefined, request)
  const preparation = preloader.prepare('b', async () => resolved('b'))
  await Promise.resolve()
  assert.deepEqual(preloader.take('b'), resolved('b'))
  assert.equal(cancelled.aborted, true)
  release(response()); await preparation
  assert.equal(preloader.take('b'), undefined)
})
