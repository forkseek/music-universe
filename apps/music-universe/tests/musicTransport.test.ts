import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MusicRequestError, musicWorldRequest } from '../src/lib/musicWorldTransport.ts'
import { MusicReadCache } from '../src/lib/musicReadCache.ts'

test('only declared reads retry one transient service failure', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => ++calls === 1 ? new Response('', { status: 503 }) : Response.json({ songs: [] }))
  assert.deepEqual(await musicWorldRequest('/api/music/netease/search', { retryRead: true }), { songs: [] })
  assert.equal(calls, 2)
})
test('playback writes and authorization failures are never retried', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('', { status: 503 }) })
  await assert.rejects(musicWorldRequest('/api/music/netease/play', { method: 'POST' }), MusicRequestError)
  assert.equal(calls, 1)
  t.mock.restoreAll(); calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ error: { message: 'Rights required', code: 'AUTH_REQUIRED' } }, { status: 403 }) })
  await assert.rejects(musicWorldRequest('/api/music/netease/search', { retryRead: true }), { code: 'AUTH_REQUIRED' })
  assert.equal(calls, 1)
})
test('a request deadline actually cancels the network operation', async t => {
  let aborted = false
  t.mock.method(globalThis, 'fetch', async (_url, init) => new Promise<Response>((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => { aborted = true; reject(init!.signal!.reason) }, { once: true })
  }))
  await assert.rejects(musicWorldRequest('/api/music/album', { timeoutMs: 10 }), { code: 'SERVICE_TIMEOUT' })
  assert.equal(aborted, true)
})
test('user cancellation during retry backoff cannot restart an old song request', async t => {
  let calls = 0
  const controller = new AbortController()
  t.mock.method(globalThis, 'fetch', async () => { calls++; setTimeout(() => controller.abort(), 10); throw new TypeError('network') })
  await assert.rejects(musicWorldRequest('/api/music/album', { signal: controller.signal, retryRead: true }), { name: 'AbortError' })
  assert.equal(calls, 1)
})
test('repeat searches reuse fresh results; refresh and expiration still fetch', async () => {
  const cache = new MusicReadCache(), signal = new AbortController().signal
  let calls = 0
  const fetchValue = async () => ++calls
  assert.equal(await cache.read('netease:search:ten', 60000, fetchValue, signal), 1)
  assert.equal(await cache.read('netease:search:ten', 60000, fetchValue, signal), 1)
  assert.equal(await cache.read('netease:search:ten', 60000, fetchValue, signal, true), 2)
  await cache.read('expired', -1, fetchValue)
  await cache.read('expired', -1, fetchValue)
  assert.equal(calls, 4)
})
test('an old account response cannot repopulate the cache after logout', async () => {
  const cache = new MusicReadCache()
  let resolve!: (value: string) => void
  const pending = cache.read('status', 60000, () => new Promise<string>(done => { resolve = done }))
  cache.clear(); resolve('old-user'); await pending
  assert.equal(await cache.read('status', 60000, async () => 'new-user'), 'new-user')
})
