import { chromium, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
const output = 'tests/reports/follow-rendering'
mkdirSync(output, { recursive: true })
const chunk = (id, data) => { const header = Buffer.alloc(8); header.write(id); header.writeUInt32LE(data.length, 4); return Buffer.concat([header, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]) }
const wav = (tagged = true) => {
  const fmt = Buffer.alloc(16)
  fmt.writeUInt16LE(1, 0); fmt.writeUInt16LE(1, 2); fmt.writeUInt32LE(22050, 4); fmt.writeUInt32LE(44100, 8); fmt.writeUInt16LE(2, 12); fmt.writeUInt16LE(16, 14)
  const pcm = Buffer.alloc(22050 * 90 * 2)
  for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(2500 * Math.sin(i / 22050 * Math.PI * 2 * 440)), i * 2)
  const info = Buffer.concat([Buffer.from('INFO'), ...Object.entries({ INAM: 'EARFQUAKE', IART: 'Tyler, The Creator', IPRD: 'IGOR' }).map(([id, value]) => chunk(id, Buffer.from(value + '\0')))])
  const data = Buffer.concat([Buffer.from('WAVE'), chunk('fmt ', fmt), ...(tagged ? [chunk('LIST', info)] : []), chunk('data', pcm)])
  const header = Buffer.alloc(8); header.write('RIFF'); header.writeUInt32LE(data.length, 4); return Buffer.concat([header, data])
}
const browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--mute-audio'], args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 })
const errors = [], requests = [], results = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)) })
page.on('response', response => { if (response.url().includes('/api/music/') && response.status() >= 400) requests.push({ path: new URL(response.url()).pathname, status: response.status() }) })
await page.addInitScript(() => {
  window.debugAudio = { events: [], playCalls: [], bufferChanges: [], frames: [] }
  const original = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function (...args) {
    const call = { at: performance.now(), active: navigator.userActivation.isActive, source: this.src.startsWith('blob:') ? 'blob' : 'url', muted: this.muted, volume: this.volume }
    window.debugAudio.playCalls.push(call)
    return original.apply(this, args).then(value => { call.result = 'playing'; return value }, error => { call.result = error.name; throw error })
  }
  document.addEventListener('DOMContentLoaded', () => {
    const bind = () => {
      const audio = document.querySelector('audio'), canvas = document.querySelector('canvas')
      if (audio && !audio.dataset.debugBound) {
        audio.dataset.debugBound = 'true'
        for (const event of ['playing', 'pause', 'waiting', 'error', 'volumechange', 'emptied', 'loadstart']) audio.addEventListener(event, () => window.debugAudio.events.push({ event, at: performance.now(), muted: audio.muted, volume: audio.volume, time: audio.currentTime, error: audio.error?.code }))
      }
      if (canvas && !canvas.dataset.debugBound) {
        canvas.dataset.debugBound = 'true'
        new MutationObserver(() => window.debugAudio.bufferChanges.push({ at: performance.now(), width: canvas.width, height: canvas.height })).observe(canvas, { attributes: true, attributeFilter: ['width', 'height'] })
      }
    }
    new MutationObserver(bind).observe(document.documentElement, { subtree: true, childList: true }); bind()
  })
})
const snapshot = () => page.evaluate(() => {
  const a = document.querySelector('audio'), c = document.querySelector('canvas')
  return { audio: { paused: a.paused, muted: a.muted, volume: a.volume, time: a.currentTime, ready: a.readyState, error: a.error?.code }, canvas: { width: c.width, height: c.height, ...c.dataset }, debug: window.debugAudio }
})
try {
  await page.goto('http://127.0.0.1:5188/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas')).toHaveAttribute('data-frame-count', /\d+/, { timeout: 45000 })
  const guide = page.getByRole('button', { name: '开始遨游', exact: true })
  if (await guide.isVisible()) await guide.click()
  if (await page.getByRole('button', { name: '显示界面', exact: true }).isVisible()) await page.getByRole('button', { name: '显示界面', exact: true }).click()
  await page.getByRole('button', { name: '音乐搜索', exact: true }).click()
  await page.getByTestId('music-search-file').setInputFiles({ name: 'before-probe.wav', mimeType: 'audio/wav', buffer: wav() })
  await expect(page.getByTestId('album-sync-status')).toHaveAttribute('data-state', 'ready', { timeout: 60000 })
  await page.getByRole('button', { name: '关闭音乐搜索', exact: true }).click()
  await page.keyboard.press('h')
  console.log('Started local audio and Follow Mode at device pixel ratio 2')
  await page.evaluate(async () => {
    const loaded = performance.getEntriesByType('resource').find(entry => entry.name.includes('/src/lib/spaceCamera.ts'))
    const { SpaceCameraController } = await import(loaded?.name || '/src/lib/spaceCamera.ts')
    const original = SpaceCameraController.prototype.update, identities = new WeakMap()
    let serial = 0
    SpaceCameraController.prototype.update = function (...args) {
      if (!identities.has(this)) identities.set(this, ++serial)
      window.debugController = { id: identities.get(this), camera: this.camera.uuid, resetting: !!this.reset }
      return original.apply(this, args)
    }
  })
  await page.evaluate(() => {
    window.debugAudio.bufferChanges = []
    const started = performance.now()
    const sample = () => {
      const canvas = document.querySelector('canvas'), d = canvas.dataset
      window.debugAudio.frames.push({ at: performance.now(), width: canvas.width, height: canvas.height, zoom: d.renderedZoom, target: d.cameraFollowTarget, camera: [d.cameraX, d.cameraY, d.cameraZ], center: d.cameraLookCenter, controller: window.debugController })
      if (performance.now() - started < 12000) requestAnimationFrame(sample)
    }; requestAnimationFrame(sample)
  })
  await expect.poll(() => page.evaluate(() => window.debugAudio.frames.at(-1)?.at - window.debugAudio.frames[0]?.at), { timeout: 20000 }).toBeGreaterThan(11500)
  const local = await snapshot()
  expect(local.audio.paused).toBe(false)
  const controllers = [...new Set(local.debug.frames.map(frame => frame.controller?.id).filter(Boolean))]
  const cameras = [...new Set(local.debug.frames.map(frame => frame.controller?.camera).filter(Boolean))]
  const resets = local.debug.frames.filter(frame => frame.controller?.resetting).length
  const maxCameraStep = Math.max(...local.debug.frames.slice(1).map((frame, index) => Math.hypot(...frame.camera.map((value, axis) => Number(value) - Number(local.debug.frames[index].camera[axis])))))
  const maxCenterStep = Math.max(...local.debug.frames.slice(1).map((frame, index) => {
    const center = JSON.parse(frame.center), previous = JSON.parse(local.debug.frames[index].center)
    return Math.hypot(...center.map((value, axis) => value - previous[axis]))
  }))
  expect(controllers.length).toBe(1); expect(cameras.length).toBe(1); expect(resets).toBe(0)
  expect(local.debug.bufferChanges.length).toBeLessThanOrEqual(2)
  expect(maxCameraStep).toBeLessThan(.5); expect(maxCenterStep).toBeLessThan(.5)
  results.push({ case: 'follow continuity', controllers: controllers.length, cameras: cameras.length, resets, maxCameraStep, maxCenterStep, bufferChanges: local.debug.bufferChanges.length })
  results.push({ case: 'local tagged WAV and follow at DPR 2', ...local })
  console.log(JSON.stringify({ localAudio: local.audio, bufferChanges: local.debug.bufferChanges.length, sizes: [...new Set(local.debug.frames.map(f => `${f.width}x${f.height}`))] }))
  // Measure decoded audio after routing it to an analyser AND the output destination.
  const pcm = await page.evaluate(async () => {
    const context = new AudioContext(), analyser = context.createAnalyser(); analyser.fftSize = 2048
    context.createMediaElementSource(document.querySelector('audio')).connect(analyser); analyser.connect(context.destination)
    await context.resume(); window.audioProbe = { context, analyser }
    await new Promise(resolve => setTimeout(resolve, 200))
    const data = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(data)
    return { rms: Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length), state: context.state }
  })
  results.push({ case: 'local decoded audio output', ...pcm }); console.log(JSON.stringify(pcm))
  expect(pcm.state).toBe('running'); expect(pcm.rms).toBeGreaterThan(.0001)
  await page.screenshot({ path: output + '/after.png' })
  // Platform music, including the default planet playback flow.
  await page.keyboard.press('h')
  await page.getByRole('button', { name: '下一首', exact: true }).click()
  await expect.poll(() => page.getByTestId('audio-engine').evaluate(a => !a.paused && a.readyState >= 2), { timeout: 60000 }).toBe(true)
  const platform = await snapshot()
  const platformSignal = () => page.evaluate(() => {
    const analyser = window.audioProbe.analyser, data = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(data)
    return Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length)
  })
  await expect.poll(platformSignal, { timeout: 15000 }).toBeGreaterThan(.0001)
  const platformPcm = await platformSignal()
  results.push({ case: 'platform music', audio: platform.audio, rms: platformPcm, playCalls: platform.debug.playCalls })
  console.log(JSON.stringify({ platform: platform.audio, rms: platformPcm, errors, requests }))
  await page.getByRole('button', { name: '音乐搜索', exact: true }).click()
  await page.route('**/debug-valid-audio.wav', route => route.fulfill({ status: 200, body: wav(false), contentType: 'audio/wav' }))
  await page.locator('.music-platform-local summary').click()
  await page.getByRole('textbox', { name: '音频地址', exact: true }).fill('http://127.0.0.1:5188/debug-valid-audio.wav')
  await page.getByRole('button', { name: '引入音频地址', exact: true }).click()
  await expect.poll(() => page.getByTestId('audio-engine').evaluate(a => !a.paused && a.currentTime > .15), { timeout: 15000 }).toBe(true)
  await expect.poll(platformSignal, { timeout: 15000 }).toBeGreaterThan(.0001)
  results.push({ case: 'remote URL controlled WAV fixture', audio: (await snapshot()).audio, rms: await platformSignal() })
  expect(errors).toEqual([])
} catch (error) {
  results.push({ failure: error.message, state: await snapshot().catch(() => null), errors, requests }); process.exitCode = 1
  console.log(JSON.stringify({ failure: error.message, errors, requests }))
} finally {
  writeFileSync(output + '/after-results.json', JSON.stringify({ results, errors, requests }, null, 2)); await browser.close()
}
