import { chromium, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dismissEntryGuide } from './entry-guide.mjs'

// Own tone/artwork fixtures exercise real native playback, GPU uploads and cancellation.
const url = process.env.UNIVERSE_TEST_URL || 'http://127.0.0.1:5191/'
const output = 'tests/reports/album-cover-sync'; mkdirSync(output, { recursive: true })
const origin = new URL(url).origin, demoCover = new URL('covers/dont-tap-the-glass.jpg', url).href
const songs = ['First', 'Second', 'Latest'].map((name, index) => ({ provider: 'netease', id: String(701 + index), playbackId: String(701 + index),
  name, artist: 'Fixture Artist', album: `Cover ${901 + index}`, albumId: String(901 + index), cover: demoCover, duration: 90000, fee: 0, discNumber: 1, trackNumber: 1 }))
const pcm = Buffer.alloc(8000 * 90 * 2)
for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(900 * Math.sin(i * 2 * Math.PI * 220 / 8000)), i * 2)
const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8)
header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(8000, 24)
header.writeUInt32LE(16000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40)
const wav = Buffer.concat([header, pcm]), browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [], results = []
let searchCalls = 0, releaseFirstAlbum, releaseSecondAlbum, releaseFailedSelection
const albumCalls = {}, coverCalls = {}
page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(() => {
  localStorage.setItem('music-universe:platform', 'netease'); sessionStorage.removeItem('music-universe:exploration:v1')
  window.coverUploads = []; window.coverChanges = []; window.coverImageRequests = []
  const OriginalImage = window.Image
  window.Image = class extends OriginalImage {
    set src(value) { if (value.includes('/album/cover')) window.coverImageRequests.push(value); super.src = value }
    get src() { return super.src }
  }
  for (const type of [window.WebGLRenderingContext, window.WebGL2RenderingContext].filter(Boolean)) {
    for (const method of ['texImage2D', 'texSubImage2D']) {
      const original = type.prototype[method]
      type.prototype[method] = function (...args) {
        const image = args.find(value => value instanceof HTMLImageElement && value.src.includes('/album/cover'))
        if (image) window.coverUploads.push({ url: image.src, width: image.naturalWidth })
        return original.apply(this, args)
      }
    }
  }
})
await page.route('**/fixture-cover-tone.wav', route => {
  const match = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/)
  const start = match ? Number(match[1]) : 0, end = match?.[2] ? Math.min(Number(match[2]), wav.length - 1) : wav.length - 1
  return route.fulfill({ status: match ? 206 : 200, contentType: 'audio/wav', headers: { 'Accept-Ranges': 'bytes',
    'Content-Length': String(end - start + 1), ...(match ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {}) }, body: wav.subarray(start, end + 1) })
})
await page.route('**/api/ratings', route => route.fulfill({ json: { ratings: {}, degraded: true } }))
await page.route('**/api/music/**', async route => {
  const request = route.request(), address = new URL(request.url()), action = address.pathname.split('/').at(-1)
  const send = value => route.fulfill({ json: value }).catch(() => {})
  if (action === 'session') return send({ ok: true })
  if (action === 'status') return send({ provider: 'netease', authorized: false, loginAvailable: false, message: '' })
  if (action === 'search') {
    if (address.searchParams.get('q') !== 'Cover test') {
      await new Promise(resolve => { releaseFailedSelection = resolve })
      return send({ songs: [], provider: 'netease', page: 1 })
    }
    searchCalls++
    if (searchCalls === 1) return route.fulfill({ status: 503, json: { error: { message: 'Transient fixture failure' } } })
    return send({ songs, provider: 'netease', page: 1, query: 'Cover test', hasMore: false })
  }
  if (action === 'play') return send({ playable: true, url: `${origin}/fixture-cover-tone.wav` })
  if (action === 'album') {
    const song = songs.find(song => song.id === request.postDataJSON().trackId)
    albumCalls[song.albumId] = (albumCalls[song.albumId] || 0) + 1
    if (song.albumId === '901' && albumCalls['901'] === 1) await new Promise(resolve => { releaseFirstAlbum = resolve })
    if (song.albumId === '902') await new Promise(resolve => { releaseSecondAlbum = resolve })
    return send({ album: { provider: 'netease', id: song.albumId, name: song.album, artist: song.artist,
      cover: `/api/music/album/cover?provider=netease&id=${song.albumId}`, tracks: [song] }, trackId: song.id, trackIndex: 0, matchedBy: 'id' })
  }
  if (action === 'cover') {
    const id = address.searchParams.get('id'); coverCalls[id] = (coverCalls[id] || 0) + 1
    if (id === '901' && coverCalls[id] === 1) return route.fulfill({ status: 502, body: 'transient image failure' })
    const color = id === '901' ? '#74b5e7' : '#dc789f'
    return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="${color}"/><circle cx="300" cy="300" r="170" fill="#152b45"/><text x="300" y="330" fill="#fff" font-size="70" text-anchor="middle">${id}</text></svg>` })
  }
  if (action === 'lyrics') return send({ available: false, lyric: '' })
  return send({})
})
const canvas = page.locator('.galaxy-viewport canvas').first(), audio = page.getByTestId('audio-engine')
const ready = async id => {
  await expect(page.locator('.app-shell')).toHaveAttribute('data-album-id', `netease:album:${id}`)
  await expect(page.getByTestId('album-sync-status')).toHaveAttribute('data-state', 'ready')
  await expect(canvas).toHaveAttribute('data-star-cover-url', new RegExp(`id=${id}$`))
  await expect(canvas).toHaveAttribute('data-star-cover-ready', 'true')
  await expect.poll(() => page.evaluate(id => window.coverUploads.some(image => image.url.endsWith(`id=${id}`) && image.width === 600), id)).toBe(true)
}
try {
  await page.goto(url); await expect(canvas).toHaveAttribute('data-frame-count', /\d+/, { timeout: 60000 }); await dismissEntryGuide(page)
  await expect(canvas).toHaveAttribute('data-star-cover-ready', 'true')
  const originalCover = await canvas.getAttribute('data-star-cover-url')
  await canvas.evaluate(el => {
    window.originalCoverCanvas = el
    new MutationObserver(() => { window.coverChanges.push({ url: el.dataset.starCoverUrl, ready: el.dataset.starCoverReady }) }).observe(el, { attributes: true, attributeFilter: ['data-star-cover-url', 'data-star-cover-ready'] })
  })
  await page.getByRole('button', { name: '音乐搜索', exact: true }).click()
  await page.getByTestId('music-search-input').fill('Cover test'); await page.getByTestId('music-search-submit').click()
  await expect(page.getByTestId('music-search-result')).toHaveCount(3)
  expect(searchCalls).toBe(2)
  await page.getByTestId('music-search-play').first().click()
  await expect.poll(() => audio.evaluate(el => !el.paused && el.readyState >= 2)).toBe(true)
  await expect.poll(() => typeof releaseFirstAlbum).toBe('function')
  await page.getByRole('button', { name: '关闭音乐搜索', exact: true }).click()
  await page.getByRole('button', { name: '沉浸模式', exact: true }).click()
  await page.getByRole('button', { name: '播放星球歌曲', exact: true }).click()
  await expect.poll(() => typeof releaseFailedSelection).toBe('function')
  releaseFirstAlbum(); releaseFirstAlbum = undefined
  await expect.poll(() => coverCalls['901']).toBeGreaterThanOrEqual(2)
  await expect(page.getByTestId('album-sync-status')).toHaveCount(0)
  await expect(canvas).toHaveAttribute('data-star-cover-url', originalCover)
  releaseFailedSelection(); releaseFailedSelection = undefined
  await ready('901')
  expect(await page.evaluate(() => window.coverImageRequests.filter(url => url.endsWith('id=901')).length)).toBe(2)
  expect(albumCalls['901']).toBe(1)
  await expect(page.locator('.app-shell')).toHaveClass(/hud-hidden/)
  expect(await audio.evaluate(el => !el.paused)).toBe(true)
  results.push({ deferredMatchRecoversAfterFailedSelection: true, transientCoverRecovers: true, singleDecodedImageHandedToGPU: true, immersionAndPlaybackPreserved: true })

  await page.keyboard.press('h'); await page.getByRole('button', { name: '音乐搜索', exact: true }).click()
  await page.getByTestId('music-search-input').fill('Cover test'); await page.getByTestId('music-search-submit').click()
  await expect(page.getByTestId('music-search-result')).toHaveCount(3)
  expect(searchCalls).toBe(2)
  await page.getByTestId('music-search-play').nth(1).click()
  await expect.poll(() => typeof releaseSecondAlbum).toBe('function')
  await page.getByTestId('music-search-play').nth(2).click(); await ready('903')
  releaseSecondAlbum(); releaseSecondAlbum = undefined; await page.waitForTimeout(350)
  await expect(canvas).toHaveAttribute('data-star-cover-url', /id=903$/)
  await expect(page.getByTestId('music-search-now-title')).toHaveText('Latest')
  await page.getByTestId('music-search-play').first().click(); await ready('901')
  expect(albumCalls['901']).toBe(1)
  expect(await page.evaluate(() => window.coverImageRequests.filter(url => url.endsWith('id=901')).length)).toBe(2)
  const state = await page.evaluate(() => ({ emptyTextures: window.coverChanges.filter(value => !value.url || value.ready !== 'true'),
    canvasUnchanged: document.querySelector('.galaxy-viewport canvas') === window.originalCoverCanvas, gpuUploads: window.coverUploads.length }))
  expect(state.emptyTextures).toEqual([]); expect(state.canvasUnchanged).toBe(true)
  // Canvas contains inert fallback HTML even when WebGL is available.
  await expect(page.locator('.galaxy-viewport > .scene-fallback')).toHaveCount(0); expect(errors).toEqual([])
  results.push({ repeatedSearchUsesCache: true, latestSongWins: true, warmAlbumRestoresWithoutRefetch: true, noEmptyTextureTransition: true, actualGPUUploads: state.gpuUploads, canvasUnchanged: true })
  await page.screenshot({ path: output + '/success.png' })
} catch (error) {
  process.exitCode = 1; results.push({ failure: error.message, errors, albumCalls, coverCalls, searchCalls })
  await page.screenshot({ path: output + '/failure.png' }).catch(() => {})
} finally {
  releaseFirstAlbum?.(); releaseSecondAlbum?.(); releaseFailedSelection?.()
  writeFileSync(output + '/results.json', JSON.stringify(results, null, 2)); console.log(JSON.stringify(results, null, 2)); await browser.close()
}
