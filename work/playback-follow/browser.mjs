import { chromium, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

// Synthetic tagged audio exercises the real HTMLAudioElement and live album metadata.
// No autoplay override or mocked music/album endpoint is used.
const chunk = (id, data) => {
  const header = Buffer.alloc(8); header.write(id); header.writeUInt32LE(data.length, 4)
  return Buffer.concat([header, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)])
}
const taggedAudio = title => {
  const fmt = Buffer.alloc(16)
  fmt.writeUInt16LE(1, 0); fmt.writeUInt16LE(1, 2); fmt.writeUInt32LE(22050, 4)
  fmt.writeUInt32LE(44100, 8); fmt.writeUInt16LE(2, 12); fmt.writeUInt16LE(16, 14)
  const pcm = Buffer.alloc(22050 * 120 * 2)
  for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(500 * Math.sin(i / 22050 * 220 * Math.PI * 2)), i * 2)
  const info = Buffer.concat([Buffer.from('INFO'), ...Object.entries({ INAM: title, IART: 'Tyler, The Creator', IPRD: 'IGOR' }).map(([id, value]) => chunk(id, Buffer.from(value + '\0')))])
  const data = Buffer.concat([Buffer.from('WAVE'), chunk('fmt ', fmt), ...(title ? [chunk('LIST', info)] : []), chunk('data', pcm)])
  const header = Buffer.alloc(8); header.write('RIFF'); header.writeUInt32LE(data.length, 4)
  return Buffer.concat([header, data])
}
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const results = [], errors = []
page.on('pageerror', error => errors.push(error.message))
mkdirSync('work/playback-follow/review', { recursive: true })
const canvas = page.locator('canvas')
const snapshot = () => canvas.evaluate(element => {
  const d = element.dataset, rect = element.getBoundingClientRect()
  const projected = JSON.parse(d.projectedTargets || '[]').find(item => item.id === d.cameraFollowTarget)
  return { target: d.cameraFollowTarget, locked: d.cameraTargetLocked, zoom: Number(d.zoom), renderedZoom: Number(d.renderedZoom),
    camera: [Number(d.cameraX), Number(d.cameraY), Number(d.cameraZ)], quaternion: JSON.parse(d.cameraQuaternion || '[]'),
    center: JSON.parse(d.cameraLookCenter || '[]'), planet: JSON.parse(d.followPlanetPosition || 'null'),
    projectedError: projected ? Math.hypot(projected.x - rect.width / 2, projected.y - rect.height / 2) : null,
    time: Number(d.simulationTime), mode: d.cameraMode }
})
const upload = async title => {
  if (!await page.getByTestId('music-search-drawer').isVisible()) await page.getByRole('button', { name: '音乐搜索', exact: true }).click()
  await page.getByTestId('music-search-file').setInputFiles({ name: 'follow-fixture.wav', mimeType: 'audio/wav', buffer: taggedAudio(title) })
  await expect(page.getByTestId('music-search-now-title')).toHaveText(title, { timeout: 15000 })
  await expect(page.getByTestId('album-sync-status')).toHaveAttribute('data-state', 'ready', { timeout: 60000 })
  await expect(page.getByTestId('album-sync-status')).toContainText(title)
  await page.getByRole('button', { name: '关闭音乐搜索', exact: true }).click()
}
const locked = async () => {
  await expect.poll(async () => (await snapshot()).locked, { timeout: 15000 }).toBe('true')
  await expect.poll(async () => (await snapshot()).projectedError, { timeout: 15000 }).toBeLessThan(.2)
  const s = await snapshot()
  expect(s.target).toBe(await page.locator('.app-shell').getAttribute('data-playing-planet'))
  expect(Math.hypot(...s.center.map((value, index) => value - s.planet[index]))).toBeLessThan(.000002)
  return s
}
const sceneWait = async seconds => {
  const start = (await snapshot()).time
  await expect.poll(async () => (await snapshot()).time, { timeout: 30000 }).toBeGreaterThan(start + seconds)
}

try {
  await page.goto('http://127.0.0.1:5188/', { waitUntil: 'domcontentloaded' })
  await expect(canvas).toHaveAttribute('data-frame-count', /\d+/, { timeout: 45000 })
  await page.getByRole('button', { name: '显示界面', exact: true }).click()
  await upload('EARFQUAKE')
  const first = await locked()
  expect(await page.getByTestId('audio-engine').evaluate(audio => audio.paused)).toBe(false)
  await page.keyboard.press('h')
  await expect(page.getByTestId('planet-follow-control')).toBeVisible()
  await sceneWait(2)
  const moved = await locked()
  expect(Math.hypot(...moved.planet.map((value, index) => value - first.planet[index]))).toBeGreaterThan(.02)
  results.push({ automaticPlaybackFollow: true, input: 'synthetic tagged WAV; live IGOR album metadata', first, moved })

  await page.mouse.move(1100, 270); await page.mouse.wheel(0, -120)
  await expect.poll(async () => (await snapshot()).renderedZoom).toBeLessThan(moved.renderedZoom - .04)
  const zoomed = await locked()
  results.push({ zoomPreservesMovingLookPoint: true, zoomed })

  // Drag empty space: camera rotates around the locked planet and keeps it centered.
  await page.mouse.move(240, 220); await page.mouse.down()
  await page.mouse.move(295, 243, { steps: 12 }); await page.mouse.up()
  const dragged = await locked()
  expect(Math.hypot(...dragged.quaternion.map((value, index) => value - zoomed.quaternion[index]))).toBeGreaterThan(.01)
  results.push({ dragKeepsLock: true, dragged })

  await page.getByRole('button', { name: '解除跟随', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-camera-follow-target', '')
  const released = await snapshot()
  await sceneWait(.6)
  const afterRelease = await snapshot()
  expect(Math.hypot(...released.center.map((value, index) => value - afterRelease.center[index]))).toBeLessThan(.000002)
  expect(await page.getByTestId('audio-engine').evaluate(audio => audio.paused)).toBe(false)
  results.push({ releaseFreezes3DLookPointAndKeepsAudio: true, released, afterRelease })

  // Resume must not silently re-lock a manually released camera.
  // Return focus to the scene; Space on a focused button activates that button natively.
  await canvas.focus()
  await page.keyboard.press('Space')
  await expect.poll(() => page.getByTestId('audio-engine').evaluate(audio => audio.paused)).toBe(true)
  await page.keyboard.press('Space')
  await expect.poll(() => page.getByTestId('audio-engine').evaluate(audio => audio.paused)).toBe(false)
  await sceneWait(.4)
  await expect(canvas).toHaveAttribute('data-camera-follow-target', '')
  results.push({ pauseResumeRetainsRelease: true })

  await page.keyboard.press('h')
  await upload('I THINK')
  await sceneWait(.5)
  await expect(canvas).toHaveAttribute('data-camera-follow-target', '')
  results.push({ newSongRetainsManualRelease: true, trackIndex: await page.locator('.app-shell').getAttribute('data-playing-index') })
  await page.keyboard.press('h')
  await page.keyboard.press('l')
  const resumed = await locked()
  expect(resumed.target).not.toBe(first.target)
  results.push({ keyboardRestoresCurrentSong: true, resumed })
  await page.keyboard.press('l')
  await expect(canvas).toHaveAttribute('data-camera-follow-target', '')
  await page.getByRole('button', { name: '跟随当前歌曲', exact: true }).click()
  await locked()

  // Same album, different song: the camera automatically tracks the new ID at the existing zoom.
  await page.keyboard.press('h')
  await upload('EARFQUAKE')
  const switched = await locked()
  expect(switched.target).toBe(first.target)
  expect(switched.zoom).toBe(zoomed.zoom)
  results.push({ switchingTracksRetargetsAutomatically: true, switched })
  await page.keyboard.press('h')
  await page.screenshot({ path: 'work/playback-follow/review/follow-desktop.png' })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('planet-follow-control')).toBeVisible()
  const box = await page.getByTestId('planet-follow-control').boundingBox()
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390)
  await locked()
  await page.screenshot({ path: 'work/playback-follow/review/follow-mobile.png' })
  await page.getByRole('button', { name: '解除跟随', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-camera-follow-target', '')
  results.push({ mobileControlAccessible: true, errors })

  // An untagged new song has no matching planet; it must not follow the previous song.
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: '跟随当前歌曲', exact: true }).click()
  await locked()
  await page.keyboard.press('h')
  await page.getByRole('button', { name: '音乐搜索', exact: true }).click()
  await page.getByTestId('music-search-file').setInputFiles({ name: 'untagged-fixture.wav', mimeType: 'audio/wav', buffer: taggedAudio(null) })
  await expect(page.getByTestId('album-sync-status')).toHaveAttribute('data-state', 'unidentified', { timeout: 15000 })
  await expect(canvas).toHaveAttribute('data-camera-follow-target', '')
  expect(await page.getByTestId('audio-engine').evaluate(audio => audio.paused)).toBe(false)
  results.push({ unidentifiedSongDoesNotTrackPreviousPlanet: true })
  await page.getByRole('button', { name: '关闭音乐搜索', exact: true }).click()
  await upload('I THINK')
  await locked()
  results.push({ resolvedNextSongRestoresAutomaticFollow: true })
  expect(errors).toEqual([])
} catch (error) {
  process.exitCode = 1
  results.push({ failure: error.message, state: await snapshot().catch(() => null), errors,
    status: await page.getByTestId('album-sync-status').textContent().catch(() => null) })
  await page.screenshot({ path: 'work/playback-follow/review/failure.png' }).catch(() => {})
} finally {
  writeFileSync('work/playback-follow/review/results.json', JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
  await browser.close()
}
