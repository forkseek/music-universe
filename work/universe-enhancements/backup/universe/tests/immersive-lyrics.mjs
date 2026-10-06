import { chromium, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dismissEntryGuide } from './entry-guide.mjs'

// API fixtures exercise real React state, HTMLAudioElement, LRC parsing and WebGL.
// They are deliberately isolated from user accounts and production music data.
const url = process.env.UNIVERSE_TEST_URL || 'http://127.0.0.1:5188/'
const output = 'tests/reports/immersive-lyrics' + (url.includes('3002') ? '/hall' : '')
mkdirSync(output, { recursive: true })
const pcm = Buffer.alloc(8000 * 60 * 2)
for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(800 * Math.sin(i * 2 * Math.PI * 220 / 8000)), i * 2)
const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8)
header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(8000, 24)
header.writeUInt32LE(16000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40)
const wav = Buffer.concat([header, pcm])
const cover = new URL(url).origin + (url.includes('3002') ? '/universe' : '') + '/covers/dont-tap-the-glass.jpg'
const titles = ['Signal', 'Across the night', 'Orbiting your light', 'Silent sky']
const songs = titles.map((name, i) => ({ provider: 'netease', id: String(101 + i), playbackId: String(101 + i), name, artist: 'Test Fixture', album: 'Test Constellation', albumId: '900', cover, duration: 60_000, fee: 0, discNumber: 1, trackNumber: i + 1 }))
const rawAlbum = { provider: 'netease', id: '900', name: 'Test Constellation', artist: 'Test Fixture', cover, tracks: songs }
const planets = songs.map((song, i) => ({ id: `netease:album:900:1:${i + 1}:${i}:${song.id}`, title: song.name, artist: song.artist, duration: 60, rating: 80, discNumber: 1, trackNumber: i + 1, source: { provider: 'netease', trackId: song.id, albumId: '900', playbackId: song.playbackId } }))
const initial = { seed: 'lyric-test', album: { id: 'netease:album:900', name: rawAlbum.name, artist: rawAlbum.artist, cover, tracks: planets } }
const lyric = id => `[00:00.00]${id} signals fade behind us\n[00:02.00]${id} drifting through the night\n[00:05.00]${id} orbiting your light\n[00:10.00]${id} stars answer in silence\n[00:20.00]${id} into the universe`
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = [], results = []
let failId = '', slowId = '', delayedLyric = '', unavailableId = ''
let releaseLyric, releaseSource
page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(value => { sessionStorage.setItem('music-universe:exploration:v1', JSON.stringify(value)); localStorage.setItem('music-universe:platform', 'netease') }, initial)
await page.route('**/fixture-audio/*', route => {
  const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/)
  const start = range ? Number(range[1]) : 0, end = range?.[2] ? Number(range[2]) : wav.length - 1
  return route.fulfill({ status: range ? 206 : 200, contentType: 'audio/wav', headers: {
    'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1),
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {}),
  }, body: wav.subarray(start, end + 1) })
})
await page.route('**/api/music/**', async route => {
  const request = route.request(), address = new URL(request.url()), action = address.pathname.split('/').at(-1)
  const send = value => route.fulfill({ json: value }).catch(() => {})
  if (action === 'session') return send({ id: 'isolated-test' })
  if (action === 'status') return send({ provider: 'netease', authorized: true, message: '', loginAvailable: false, loginMode: 'qr' })
  if (action === 'search') return send({ songs: [], query: address.searchParams.get('q'), provider: 'netease', page: 1, hasMore: false })
  if (action === 'album') {
    const id = request.postDataJSON().trackId
    return send({ album: rawAlbum, trackId: id, trackIndex: songs.findIndex(song => song.id === id), matchedBy: 'id' })
  }
  if (action === 'play') {
    const id = request.postDataJSON().playbackId
    if (id === slowId) await new Promise(resolve => { releaseSource = resolve })
    return send({ playable: id !== failId, url: id === failId ? '' : `${new URL(url).origin}/fixture-audio/${id}.wav`, message: id === failId ? 'Fixture unavailable' : '' })
  }
  if (action === 'lyrics') {
    const id = address.searchParams.get('id')
    if (id === delayedLyric) await new Promise(resolve => { releaseLyric = resolve })
    return send({ provider: 'netease', trackId: id, lyric: id === unavailableId ? '' : lyric(id), available: id !== unavailableId })
  }
  return send({})
})
const audio = page.getByTestId('audio-engine'), card = page.getByTestId('music-planet-panel')
const current = page.getByTestId('lyric-current'), next = page.getByRole('button', { name: '下一颗歌曲星球' }), previous = page.getByRole('button', { name: '上一颗歌曲星球' })
const waitSong = async (index) => {
  await expect(page.locator('.app-shell')).toHaveAttribute('data-playing-planet', planets[index].id)
  await expect.poll(() => audio.evaluate(el => !el.paused && el.readyState >= 2)).toBe(true)
  await expect(card).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByTestId('album-sync-status')).toHaveAttribute('data-state', 'ready')
}
const overlap = (a, b) => a && b && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
try {
  await page.goto(url)
  const scene = page.locator('.galaxy-viewport canvas').first()
  await expect(scene).toHaveAttribute('data-frame-count', /\d+/, { timeout: 60000 })
  await dismissEntryGuide(page)
  await page.getByRole('button', { name: '沉浸模式', exact: true }).click()
  await expect(card).toBeVisible()
  await scene.evaluate(el => { window.__originalGalaxyCanvas = el })
  await expect(previous).toBeDisabled()
  await page.getByRole('button', { name: '播放星球歌曲', exact: true }).click()
  await waitSong(0)
  await expect(current).toContainText('101')
  results.push({ immersivePanelVisible: true, realAudioPlaying: true, firstBoundaryDisabled: true })

  slowId = '102'
  await next.click()
  await expect(card).toHaveAttribute('aria-busy', 'true')
  await expect.poll(() => typeof releaseSource).toBe('function')
  await expect(page.getByTestId('planet-song-title')).toHaveText(titles[1])
  expect(await audio.evaluate(el => !el.paused && el.src.endsWith('101.wav'))).toBe(true)
  await expect(current).toHaveCount(0)
  await next.click()
  await waitSong(2)
  await expect(current).toContainText('103')
  releaseSource(); releaseSource = undefined
  await page.waitForTimeout(350)
  await waitSong(2)
  expect(await scene.evaluate(el => el === window.__originalGalaxyCanvas)).toBe(true)
  results.push({ rapidNextLastWins: true, oldAudioRetainedDuringResolve: true, oldLyricsHiddenDuringSwitch: true, galaxyCanvasRetained: true })
  slowId = ''

  await audio.evaluate(el => { el.pause(); el.currentTime = 6 })
  await expect(current).toHaveText('103 orbiting your light')
  await page.waitForTimeout(350)
  await expect(current).toHaveText('103 orbiting your light')
  await audio.evaluate(el => { el.currentTime = 2.5; el.playbackRate = 1.5 })
  await expect(current).toHaveText('103 drifting through the night')
  await page.getByRole('button', { name: '播放星球歌曲', exact: true }).click()
  await expect.poll(() => audio.evaluate(el => el.currentTime)).toBeGreaterThan(2.5)
  await page.screenshot({ path: `${output}/desktop.png` })
  results.push({ seekForwardBackward: true, pauseUsesAudioClock: true, resumeWorks: true })

  delayedLyric = '104'
  await next.click(); await waitSong(3)
  await expect.poll(() => typeof releaseLyric).toBe('function')
  await expect(current).toHaveCount(0)
  await previous.click(); await waitSong(2)
  await expect(current).toContainText('103')
  releaseLyric(); releaseLyric = undefined
  await page.waitForTimeout(350)
  await expect(current).toContainText('103')
  delayedLyric = ''
  results.push({ delayedPreviousSongLyricsDiscarded: true })

  failId = '104'
  await next.click()
  await expect(card.getByRole('alert')).toContainText('未能加载')
  await expect(card).toHaveAttribute('data-planet-id', planets[2].id)
  expect(await audio.evaluate(el => !el.paused && el.src.endsWith('103.wav'))).toBe(true)
  failId = ''; unavailableId = '104'
  await card.getByRole('button', { name: '重试切歌' }).click()
  await waitSong(3)
  await expect(next).toBeDisabled()
  await expect(current).toHaveCount(0)
  await expect(card).toContainText('暂无同步歌词')
  results.push({ failedSwitchKeepsCurrentSong: true, retryWorks: true, noLyricsHidesOldSong: true, lastBoundaryDisabled: true })

  await card.getByLabel('导入当前歌曲的 LRC 歌词').setInputFiles({ name: 'local.lrc', mimeType: 'text/plain', buffer: Buffer.from('[00:00.00]LOCAL first\n[00:02.00]LOCAL light\n[00:05.00]LOCAL orbit\n[00:20]LOCAL sky') })
  await audio.evaluate(el => { el.pause(); el.currentTime = 3 })
  await expect(current).toHaveText('LOCAL light')
  await card.getByLabel('导入当前歌曲的 LRC 歌词').setInputFiles({ name: 'invalid.lrc', mimeType: 'text/plain', buffer: Buffer.from('no timestamps') })
  await expect(card.getByRole('alert')).toContainText('未找到有效')
  await expect(current).toHaveText('LOCAL light')
  await previous.click(); await waitSong(2)
  await expect(current).toContainText('103')
  results.push({ localImportSynchronized: true, invalidImportKeepsValidLyrics: true, importBoundToItsSong: true })

  await page.getByRole('button', { name: '解除跟随', exact: true }).click()
  await previous.click(); await waitSong(1)
  await expect(scene).toHaveAttribute('data-camera-follow-target', '')
  await expect(page.locator('.app-shell')).toHaveClass(/hud-hidden/)
  await expect(current).toContainText('102')
  results.push({ manualCameraReleasePreserved: true, immersionSurvivesSwitch: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await audio.evaluate(el => { el.pause(); el.currentTime = 6 })
  await expect(current).toHaveText('102 orbiting your light')
  await page.getByRole('button', { name: '展开播放器', exact: true }).click()
  await expect(page.locator('#immersive-player')).toHaveAttribute('aria-hidden', 'false')
  await page.waitForTimeout(500)
  const captionBox = await page.getByTestId('lyric-caption').boundingBox(), cardBox = await card.boundingBox(), playerBox = await page.locator('.player-shell').boundingBox()
  expect(overlap(captionBox, cardBox)).toBeFalsy(); expect(overlap(captionBox, playerBox)).toBeFalsy()
  expect(captionBox.y).toBeGreaterThanOrEqual(0); expect(captionBox.x).toBeGreaterThanOrEqual(0)
  expect(captionBox.x + captionBox.width).toBeLessThanOrEqual(391)
  await expect(page.locator('.lyric-row-distant')).toBeHidden()
  await expect(page.locator('.lyric-dust')).toBeHidden()
  await page.screenshot({ path: `${output}/mobile.png` })
  results.push({ mobileSafeLayout: true, mobileThreeRows: true, reducedMotionRespected: true })

  const dragBox = await card.boundingBox()
  await page.mouse.move(dragBox.x + 18, dragBox.y + 24); await page.mouse.down()
  await page.mouse.move(36, 445, { steps: 8 }); await page.mouse.up()
  await page.waitForTimeout(450)
  expect(overlap(await card.boundingBox(), await page.getByTestId('lyric-caption').boundingBox())).toBeFalsy()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-playing-planet', planets[1].id)
  results.push({ draggingRepositionsLyricsWithoutSwitching: true })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.keyboard.press('h')
  await page.getByRole('button', { name: '音乐搜索', exact: true }).click()
  await page.getByTestId('music-search-file').setInputFiles({ name: 'unidentified.wav', mimeType: 'audio/wav', buffer: wav })
  await expect(page.getByTestId('music-search-now-title')).toHaveText('unidentified')
  await expect.poll(() => audio.evaluate(el => !el.paused)).toBe(true)
  const search = page.getByTestId('music-search-drawer')
  await search.getByLabel('导入当前歌曲的 LRC 歌词').setInputFiles({ name: 'local-file.lrc', mimeType: 'text/plain', buffer: Buffer.from('[00:00]FILE start\n[00:02]FILE synced') })
  await page.getByRole('button', { name: '关闭音乐搜索', exact: true }).click()
  await page.keyboard.press('h')
  await audio.evaluate(el => { el.pause(); el.currentTime = 3 })
  await expect(current).toHaveText('FILE synced')
  results.push({ untaggedLocalFileSupportsLrc: true })

  await page.keyboard.press('h')
  await page.getByRole('button', { name: '音乐搜索', exact: true }).click()
  await page.getByText('本地文件与音频地址', { exact: true }).click()
  await page.getByRole('textbox', { name: '音频地址', exact: true }).fill(`${new URL(url).origin}/fixture-audio/direct.wav`)
  await page.getByRole('button', { name: '引入音频地址', exact: true }).click()
  await expect(page.getByTestId('music-search-now-title')).toHaveText('direct.wav')
  await expect(search.getByRole('status').filter({ hasText: '此音频暂无平台歌词' })).toBeVisible()
  await search.getByLabel('导入当前歌曲的 LRC 歌词').setInputFiles({ name: 'local-url.lrc', mimeType: 'text/plain', buffer: Buffer.from('[00:00]URL start\n[00:02]URL synced') })
  await page.getByRole('button', { name: '关闭音乐搜索', exact: true }).click()
  await page.keyboard.press('h')
  await audio.evaluate(el => { el.pause(); el.currentTime = 3 })
  await expect(current).toHaveText('URL synced')
  results.push({ directUrlSupportsLrcWithoutReusingFileLyrics: true })

  expect(errors).toEqual([])
  writeFileSync(`${output}/results.json`, JSON.stringify({ url, fixture: 'synthetic WAV, isolated API routes', results, errors }, null, 2))
  console.log(JSON.stringify({ passed: results.length, results, errors }, null, 2))
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {})
  console.error(error); process.exitCode = 1
} finally { await browser.close() }
