import { chromium, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
const output = 'tests/reports/axis-lighting'; mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--mute-audio'], args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 })
const results = [], errors = []
page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(() => {
  window.toneReadbacks = 0
  const original = CanvasRenderingContext2D.prototype.getImageData
  CanvasRenderingContext2D.prototype.getImageData = function (...args) {
    if (this.canvas.width === 64 && this.canvas.height === 64) window.toneReadbacks++
    return original.apply(this, args)
  }
})
const canvas = page.locator('canvas').first()
const state = () => canvas.evaluate(element => {
  const d = element.dataset
  return { axisLocked: d.cameraAxisLocked, target: d.cameraFollowTarget, center: JSON.parse(d.cameraLookCenter || '[]'), star: JSON.parse(d.followStarPosition || 'null'), planet: JSON.parse(d.followPlanetPosition || 'null'), camera: [Number(d.cameraX), Number(d.cameraY), Number(d.cameraZ)], quaternion: JSON.parse(d.cameraQuaternion || '[]'), color: d.albumLightColor, targetColor: d.albumLightTargetColor, scale: Number(d.albumLightScale), intensity: Number(d.starLightIntensity), corona: Number(d.albumLightCorona), source: d.albumToneSource, zoom: Number(d.renderedZoom), frame: Number(d.frameCount), renderLoop: d.renderLoop }
})
const makeCover = async color => Buffer.from((await page.evaluate(color => {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const context = c.getContext('2d'); context.fillStyle = color; context.fillRect(0, 0, 256, 256)
  return c.toDataURL('image/png').split(',')[1]
}, color)), 'base64')
const useCover = async (color, name) => {
  await page.getByRole('button', { name: '专辑工坊', exact: true }).click()
  await page.getByLabel('上传专辑封面', { exact: true }).setInputFiles({ name: name + '.png', mimeType: 'image/png', buffer: await makeCover(color) })
  await expect(page.getByText('封面已载入预览，保存后应用到恒星', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '保存并生成', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-album-tone-source', 'cover')
}
const chunk = (id, data) => { const head = Buffer.alloc(8); head.write(id); head.writeUInt32LE(data.length, 4); return Buffer.concat([head, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]) }
const taggedWav = () => {
  const fmt = Buffer.alloc(16); fmt.writeUInt16LE(1, 0); fmt.writeUInt16LE(1, 2); fmt.writeUInt32LE(22050, 4); fmt.writeUInt32LE(44100, 8); fmt.writeUInt16LE(2, 12); fmt.writeUInt16LE(16, 14)
  const pcm = Buffer.alloc(22050 * 120 * 2)
  for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(500 * Math.sin(i / 22050 * Math.PI * 440)), i * 2)
  const info = Buffer.concat([Buffer.from('INFO'), ...Object.entries({ INAM: 'EARFQUAKE', IART: 'Tyler, The Creator', IPRD: 'IGOR' }).map(([id, text]) => chunk(id, Buffer.from(text + '\0')))])
  const payload = Buffer.concat([Buffer.from('WAVE'), chunk('fmt ', fmt), chunk('LIST', info), chunk('data', pcm)])
  const head = Buffer.alloc(8); head.write('RIFF'); head.writeUInt32LE(payload.length, 4); return Buffer.concat([head, payload])
}
const vecSub = (a, b) => a.map((value, i) => value - b[i])
const length = v => Math.hypot(...v)
function assertAxis(s) {
  const a = vecSub(s.camera, s.planet), b = vecSub(s.planet, s.star)
  const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  expect(length(cross) / length(a) / length(b)).toBeLessThan(.000001)
  expect(a.reduce((sum, value, i) => sum + value * b[i], 0)).toBeGreaterThan(0)
  expect(length(vecSub(s.center, s.planet))).toBeLessThan(.000002)
}
try {
  await page.goto('http://127.0.0.1:5188/', { waitUntil: 'domcontentloaded' })
  await expect(canvas).toHaveAttribute('data-frame-count', /\d+/, { timeout: 45000 })
  const guide = page.getByRole('button', { name: '开始遨游', exact: true }); if (await guide.isVisible()) await guide.click()
  if (await page.getByRole('button', { name: '显示界面', exact: true }).isVisible()) await page.getByRole('button', { name: '显示界面', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-album-tone-source', 'cover', { timeout: 20000 })
  const initial = await state()
  await useCover('#ff0000', 'red-cover')
  await expect.poll(async () => /^#d[a-c]2[3-6]2[3-6]$/i.test((await state()).targetColor), { timeout: 20000 }).toBe(true)
  await expect.poll(async () => { const s = await state(); return s.color === s.targetColor }, { timeout: 15000 }).toBe(true)
  const red = await state(), reads = await page.evaluate(() => window.toneReadbacks)
  expect(red.scale).toBeGreaterThanOrEqual(.78); expect(red.scale).toBeLessThanOrEqual(1.12)
  await page.screenshot({ path: output + '/red-cover.png' })
  await page.getByRole('button', { name: '暂停动画', exact: true }).click()
  await page.evaluate(() => {
    window.lightFrames = []; window.recordLight = true
    const record = () => { if (!window.recordLight) return; const d = document.querySelector('canvas').dataset; window.lightFrames.push({ at: performance.now(), color: d.albumLightColor, targetColor: d.albumLightTargetColor, intensity: Number(d.starLightIntensity) }); requestAnimationFrame(record) }; requestAnimationFrame(record)
  })
  await useCover('#0000ff', 'blue-cover')
  await expect.poll(async () => /^#2[3-6]2[3-6]d[a-c]$/i.test((await state()).targetColor), { timeout: 20000 }).toBe(true)
  await expect.poll(async () => { const s = await state(); return s.color === s.targetColor }, { timeout: 15000 }).toBe(true)
  const blue = await state()
  expect(blue.intensity).toBeLessThan(red.intensity)
  expect(blue.renderLoop).toBe('demand')
  const transition = await page.evaluate(() => { window.recordLight = false; return window.lightFrames })
  const intermediate = transition.filter(frame => frame.targetColor === blue.targetColor && frame.color !== blue.color && frame.color !== red.color)
  expect(intermediate.length).toBeGreaterThan(5)
  const maxPowerStep = Math.max(...transition.slice(1).map((frame, i) => Math.abs(frame.intensity - transition[i].intensity)))
  expect(maxPowerStep).toBeLessThan(Math.abs(red.intensity - blue.intensity) * .3)
  const readCount = await page.evaluate(() => window.toneReadbacks)
  expect(readCount).toBe(reads + 1)
  results.push({ coverExtractionFromRealTexture: true, red, blue, smoothWhileAnimationPaused: true, intermediateFrames: intermediate.length, maxPowerStep, perCoverReadbacks: 1, initial })
  await page.screenshot({ path: output + '/blue-cover.png' })
  await page.getByRole('button', { name: '继续动画', exact: true }).click()

  await page.getByRole('button', { name: '音乐搜索', exact: true }).click()
  await page.getByTestId('music-search-file').setInputFiles({ name: 'axis-follow.wav', mimeType: 'audio/wav', buffer: taggedWav() })
  await expect(page.getByTestId('album-sync-status')).toHaveAttribute('data-state', 'ready', { timeout: 60000 })
  await page.getByRole('button', { name: '关闭音乐搜索', exact: true }).click()
  await page.keyboard.press('h')
  // Editing an album deliberately disables automatic follow in the existing product.
  const restoreFollow = page.getByRole('button', { name: '跟随当前歌曲', exact: true })
  if (await restoreFollow.isVisible()) await restoreFollow.click()
  await expect(canvas).toHaveAttribute('data-camera-axis-locked', 'true', { timeout: 15000 })
  await page.evaluate(() => {
    window.axisFrames = []; window.axisDone = false; const start = performance.now()
    const record = () => {
      const d = document.querySelector('canvas').dataset
      window.axisFrames.push({ star: JSON.parse(d.followStarPosition), planet: JSON.parse(d.followPlanetPosition), camera: [Number(d.cameraX), Number(d.cameraY), Number(d.cameraZ)], center: JSON.parse(d.cameraLookCenter), quaternion: JSON.parse(d.cameraQuaternion) })
      if (performance.now() - start < 4000) requestAnimationFrame(record)
      else window.axisDone = true
    }; requestAnimationFrame(record)
  })
  await expect.poll(() => page.evaluate(() => window.axisDone), { timeout: 15000 }).toBe(true)
  const frames = await page.evaluate(() => window.axisFrames)
  expect(frames.length).toBeGreaterThan(10)
  frames.forEach(assertAxis)
  expect(length(vecSub(frames.at(-1).planet, frames[0].planet))).toBeGreaterThan(.1)
  results.push({ livePlaybackCoaxialFollow: true, frames: frames.length, first: frames[0], last: frames.at(-1) })
  const beforeZoom = await state()
  // The upper-right song information window consumes its own scrolling.
  await page.mouse.move(300, 100); await page.mouse.wheel(0, -120)
  await expect.poll(async () => (await state()).zoom).toBeLessThan(beforeZoom.zoom - .05)
  assertAxis(await state())
  await page.mouse.move(200, 220); await page.mouse.down(); await page.mouse.move(280, 240, { steps: 8 }); await page.mouse.up()
  assertAxis(await state())
  await page.screenshot({ path: output + '/axis-follow.png' })
  await page.getByRole('button', { name: '解除跟随', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-camera-follow-target', '')
  await expect(canvas).toHaveAttribute('data-camera-axis-constrained', 'false')
  const released = await state()
  await page.mouse.move(220, 210); await page.mouse.down(); await page.mouse.move(290, 245, { steps: 8 }); await page.mouse.up()
  await expect.poll(async () => length(vecSub((await state()).camera, released.camera))).toBeGreaterThan(1)
  expect(await page.getByTestId('audio-engine').evaluate(a => a.paused)).toBe(false)
  results.push({ zoomAndDragRespectAxis: true, releaseRestoresManualOrbitAndKeepsAudio: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '跟随当前歌曲', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-camera-axis-locked', 'true', { timeout: 15000 })
  assertAxis(await state())
  results.push({ narrowViewportAxisFollow: true, errors })
  expect(errors).toEqual([])
} catch (error) {
  process.exitCode = 1; results.push({ failure: error.message, state: await state().catch(() => null), errors })
  await page.screenshot({ path: output + '/failure.png' }).catch(() => {})
} finally {
  console.log(JSON.stringify(results, null, 2)); writeFileSync(output + '/results.json', JSON.stringify(results, null, 2)); await browser.close()
}
