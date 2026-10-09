import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AlbumCoverLoader } from '../src/lib/albumCover.ts'

class ImageFixture {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  crossOrigin = ''
  naturalWidth = 1600
  naturalHeight = 1600
  src = ''
  ready() { this.onload?.() }
  fail() { this.onerror?.() }
}
const path = (id: number) => `/api/music/album/cover?provider=netease&id=${id}`
const fixture = (options = {}) => {
  const images: ImageFixture[] = []
  const loader = new AlbumCoverLoader({ retryDelayMs: 1, ...options }, () => {
    const image = new ImageFixture(); images.push(image); return image as unknown as HTMLImageElement
  })
  return { loader, images }
}
const signal = () => new AbortController().signal

test('recognition hands the same decoded artwork to the star without a second image request', async () => {
  const { loader, images } = fixture()
  const pending = loader.load(path(1), signal()); images[0].ready()
  const image = await pending
  assert.equal(loader.peek(path(1)), image)
  assert.equal(await loader.load(path(1), signal()), image)
  assert.equal(images.length, 1)
})
test('a transient image failure recovers once and does not cache the failed image', async () => {
  const { loader, images } = fixture()
  const pending = loader.load(path(1), signal()); images[0].fail()
  await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal(images.length, 2); images[1].ready()
  assert.equal(await pending, images[1]); assert.equal(loader.peek(path(1)), images[1])
})
test('a stalled image has a bounded deadline, leaving the old scene usable', async () => {
  const { loader } = fixture({ attempts: 1, timeoutMs: 10 })
  await assert.rejects(loader.load(path(1), signal()), /超时/)
  assert.equal(loader.peek(path(1)), undefined)
})
test('cancelling an old song prevents retries and late artwork from entering the handoff', async () => {
  const { loader, images } = fixture(), controller = new AbortController()
  const pending = loader.load(path(1), controller.signal)
  const rejected = assert.rejects(pending, { name: 'AbortError' })
  const oldLoad = images[0].onload
  controller.abort(); oldLoad?.(); await rejected
  assert.equal(images.length, 1); assert.equal(loader.peek(path(1)), undefined)
})
test('the image cache is bounded and never retains uploaded covers', async () => {
  const { loader, images } = fixture({ capacity: 2 })
  for (let id = 1; id <= 3; id++) { const pending = loader.load(path(id), signal()); images.at(-1)!.ready(); await pending }
  assert.equal(loader.peek(path(1)), undefined)
  assert.equal(loader.peek(path(3)), images[2])
  for (const url of ['blob:fixture-upload', 'data:image/png;base64,fixture']) {
    const pending = loader.load(url, signal()); images.at(-1)!.ready(); await pending
    assert.equal(loader.peek(url), undefined)
  }
})
