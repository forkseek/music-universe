import { chromium, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dismissEntryGuide } from './entry-guide.mjs'

// Isolated API responses and our own generated tone; the browser uses real audio, ended and WebGL.
const url = process.env.UNIVERSE_TEST_URL || 'http://127.0.0.1:5188/'
const output = 'tests/reports/automatic-next'
mkdirSync(output, { recursive: true })
function tone(seconds) {
  const pcm = Buffer.alloc(Math.round(8000 * seconds) * 2)
  for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(900 * Math.sin(i * 2 * Math.PI * 220 / 8000)), i * 2)
  const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(8000, 24)
  header.writeUInt32LE(16000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}
const wav = tone(60), origin = new URL(url).origin, cover = new URL('covers/dont-tap-the-glass.jpg', url).href
const titles = ['Signal', 'Across the night', 'Orbiting your light']
const songs = titles.map((name, i) => ({ provider: 'netease', id: String(201 + i), playbackId: String(201 + i), name,
  artist: 'Test Fixture', album: 'Auto Next', albumId: '901', cover, duration: 60000, fee: 0, discNumber: 1, trackNumber: i + 1 }))
const rawAlbum = { provider: 'netease', id: '901', name: 'Auto Next', artist: 'Test Fixture', cover, tracks: songs }
const planets = songs.map((song, i) => ({ id: `netease:album:901:1:${i + 1}:${i}:${song.id}`, title: song.name, artist: song.artist,
  duration: 60, rating: 80, discNumber: 1, trackNumber: i + 1, source: { provider: 'netease', trackId: song.id, albumId: '901', playbackId: song.playbackId } }))
const initial = { seed: 'automatic-next-test', album: { id: 'netease:album:901', name: rawAlbum.name, artist: rawAlbum.artist, cover, tracks: planets } }
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = [], results = [], plays = [], downloads = []
let failId = '', holdId = '', releaseSource
page.on('pageerror', error => errors.push(error.message))
page.on('requestfinished', request => { if (request.url().includes('/fixture-auto-audio/')) downloads.push(request.url()) })
await page.addInitScript(value => {
  sessionStorage.setItem('music-universe:exploration:v1', JSON.stringify(value)); localStorage.setItem('music-universe:platform', 'netease')
  window.autoNextEvents = []
  for (const type of ['playing', 'ended']) document.addEventListener(type, event => {
    if (event.target instanceof HTMLAudioElement && !event.target.src.startsWith('data:')) window.autoNextEvents.push({ type, at: performance.now(), src: event.target.src })
  }, true)
}, initial)
await page.route('**/fixture-auto-audio/*', route => {
  const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/)
  const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1
  return route.fulfill({ status: range ? 206 : 200, contentType: 'audio/wav', headers: { 'Accept-Ranges': 'bytes',
    'Content-Length': String(end - start + 1), ...(range ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {}) }, body: wav.subarray(start, end + 1) })
})
await page.route('**/api/ratings', route => route.fulfill({ json: { source: 'fixture', ratings: {}, degraded: true } }))
await page.route('**/api/music/**', async route => {
  const request = route.request(), address = new URL(request.url()), action = address.pathname.split('/').at(-1)
  const send = value => route.fulfill({ json: value }).catch(() => {})
  if (action === 'session') return send({ ok: true })
  if (action === 'status') return send({ provider: 'netease', authorized: true, message: '', loginAvailable: false, loginMode: 'qr' })
  if (action === 'search') return send({ songs: [], query: address.searchParams.get('q'), provider: 'netease', page: 1, hasMore: false })
  if (action === 'album') {
    const id = request.postDataJSON().trackId
    if (!songs.some(song => song.id === id)) return route.fulfill({ status: 404, json: { error: { message: 'No fixture album' } } })
    return send({ album: rawAlbum, trackId: id, trackIndex: songs.findIndex(song => song.id === id), matchedBy: 'id' })
  }
  if (action === 'play') {
    const id = request.postDataJSON().playbackId; plays.push(id)
    if (id === holdId) await new Promise(resolve => { releaseSource = resolve })
    return send({ playable: id !== failId, url: id === failId ? '' : `${origin}/fixture-auto-audio/${id}.wav`, message: id === failId ? 'Fixture unavailable' : '' })
  }
  if (action === 'lyrics') {
    const id = address.searchParams.get('id')
    return send({ provider: 'netease', trackId: id, lyric: `[00:00]${id} current song\n[00:45]${id} nearing the stars\n[00:59]${id} last line`, available: true })
  }
  return send({})
})
const audio = page.getByTestId('audio-engine'), card = page.getByTestId('music-planet-panel'), scene = page.locator('.galaxy-viewport canvas').first()
const waitSong = async index => {
  await expect(page.locator('.app-shell')).toHaveAttribute('data-playing-planet', planets[index].id)
  await expect.poll(() => audio.evaluate(el => !el.paused && el.readyState >= 2)).toBe(true)
  await expect(card).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByTestId('lyric-current')).toContainText(songs[index].id)
}
const finish = () => audio.evaluate(el => { el.currentTime = el.duration - .08 }) // Native ended, not a simulated completion.
try {
  await page.goto(url)
  await expect(scene).toHaveAttribute('data-frame-count', /\d+/, { timeout: 60000 })
  await dismissEntryGuide(page)
  await page.getByRole('button', { name: '沉浸模式', exact: true }).click()
  await scene.evaluate(el => { window.originalAutoNextCanvas = el })
  await page.getByRole('button', { name: '播放星球歌曲', exact: true }).click(); await waitSong(0)
  await audio.evaluate(el => { el.currentTime = 43 })
  await expect.poll(() => downloads.filter(url => url.endsWith('/202.wav')).length).toBe(1)
  await page.waitForTimeout(150)
  expect(await audio.evaluate(el => el.src.endsWith('/201.wav') && !el.paused)).toBe(true)
  await expect(page.getByTestId('lyric-current')).toContainText('201')
  await finish(); await waitSong(1)
  expect(await audio.evaluate(el => el.src.startsWith('blob:'))).toBe(true)
  expect(plays.filter(id => id === '202')).toHaveLength(1)
  expect(await scene.evaluate(el => el === window.originalAutoNextCanvas)).toBe(true)
  await expect(scene).toHaveAttribute('data-camera-follow-target', planets[1].id)
  await expect(page.locator('.app-shell')).toHaveClass(/hud-hidden/)
  const gapMs = await page.evaluate(() => {
    const ended = window.autoNextEvents.findIndex(e => e.type === 'ended'), next = window.autoNextEvents.slice(ended + 1).find(e => e.type === 'playing')
    return next.at - window.autoNextEvents[ended].at
  })
  expect(gapMs).toBeLessThan(500)
  results.push({ naturalEndAdvancesInOrder: true, nextAudioBufferedAsBlob: true, resolveOnce: true, lyricsAndCameraSynchronized: true, canvasAndImmersionPreserved: true, gapMs })

  // A failed upcoming source neither interrupts the current track nor loops past the failure.
  failId = '203'; await audio.evaluate(el => { el.currentTime = 43 })
  await expect.poll(() => plays.filter(id => id === '203').length).toBe(1)
  await page.waitForTimeout(200)
  expect(await audio.evaluate(el => !el.paused)).toBe(true)
  await expect(page.getByTestId('lyric-current')).toContainText('202')
  await finish()
  await expect(card.getByRole('alert')).toContainText('未能加载')
  expect(await audio.evaluate(el => el.ended && el.paused)).toBe(true)
  const count = plays.length
  await audio.evaluate(el => { el.dispatchEvent(new Event('ended')); el.dispatchEvent(new Event('ended')) })
  await page.waitForTimeout(250)
  expect(plays.length).toBe(count)
  failId = ''; await card.getByRole('button', { name: '重试切歌' }).click(); await waitSong(2)
  results.push({ failedPrefetchLeavesCurrentPlaying: true, failedAutoNextStopsWithRetry: true, duplicateEndedDoesNotSkip: true, retryWorks: true })

  await page.getByRole('button', { name: '解除跟随', exact: true }).click()
  await expect(scene).toHaveAttribute('data-camera-follow-target', '')
  const previousDownloads = downloads.filter(url => url.endsWith('/201.wav')).length
  await audio.evaluate(el => { el.currentTime = 43 })
  await expect.poll(() => downloads.filter(url => url.endsWith('/201.wav')).length).toBeGreaterThan(previousDownloads)
  await page.waitForTimeout(150); await finish(); await waitSong(0)
  await expect(scene).toHaveAttribute('data-camera-follow-target', '')
  results.push({ lastTrackWrapsToFirst: true, manualFollowReleasePreserved: true })

  // A user selection in flight wins over the old song finishing.
  holdId = '202'
  await page.getByRole('button', { name: '下一颗歌曲星球', exact: true }).click()
  await expect.poll(() => typeof releaseSource).toBe('function')
  const beforeEnd = plays.length
  await finish(); await page.waitForTimeout(250)
  expect(plays.length).toBe(beforeEnd)
  releaseSource(); releaseSource = undefined; holdId = ''; await waitSong(1)
  results.push({ manualNextWinsOverSimultaneousEnd: true })

  await audio.evaluate(el => { el.pause(); el.currentTime = el.duration - .08 })
  await page.waitForTimeout(300)
  await expect(page.locator('.app-shell')).toHaveAttribute('data-playing-planet', planets[1].id)
  expect(await audio.evaluate(el => el.paused)).toBe(true)
  results.push({ pauseDoesNotAdvance: true })

  await page.keyboard.press('h'); await page.getByRole('button', { name: '音乐搜索', exact: true }).click()
  await page.getByTestId('music-search-file').setInputFiles({ name: 'unidentified.wav', mimeType: 'audio/wav', buffer: tone(.7) })
  await expect(page.getByTestId('music-search-now-title')).toHaveText('unidentified')
  await expect.poll(() => audio.evaluate(el => el.ended && el.paused)).toBe(true)
  await page.waitForTimeout(250)
  await expect(page.getByTestId('music-search-now-title')).toHaveText('unidentified')
  results.push({ unidentifiedLocalFileDoesNotStartUnrelatedAlbum: true })
  expect(errors).toEqual([])
} catch (error) {
  process.exitCode = 1; results.push({ failure: error.message, errors, plays, downloads })
  await page.screenshot({ path: output + '/failure.png' }).catch(() => {})
} finally {
  releaseSource?.()
  writeFileSync(output + '/results.json', JSON.stringify(results, null, 2)); console.log(JSON.stringify(results, null, 2))
  await browser.close()
}
