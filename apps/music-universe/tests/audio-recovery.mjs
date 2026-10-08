import { chromium, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
const output = 'tests/reports/audio-recovery'; mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--mute-audio'], args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const results = [], errors = [], playRequests = []
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => { if (request.url().endsWith('/api/music/netease/play')) playRequests.push(request.method()) })
await page.addInitScript(() => {
  const native = HTMLMediaElement.prototype.play
  window.permissionProbe = { primeCalls: 0, realCalls: 0, denied: false }
  HTMLMediaElement.prototype.play = function (...args) {
    if (this.src.startsWith('data:audio/wav')) { window.permissionProbe.primeCalls++; return native.apply(this, args) }
    window.permissionProbe.realCalls++
    if (!window.permissionProbe.denied) {
      window.permissionProbe.denied = true
      return Promise.reject(new DOMException('Simulated browser permission rejection', 'NotAllowedError'))
    }
    return native.apply(this, args)
  }
})
try {
  await page.goto('http://127.0.0.1:5188/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas')).toHaveAttribute('data-frame-count', /\d+/, { timeout: 45000 })
  const guide = page.getByRole('button', { name: '开始遨游', exact: true })
  if (await guide.isVisible()) await guide.click()
  if (await page.getByRole('button', { name: '显示界面', exact: true }).isVisible()) await page.getByRole('button', { name: '显示界面', exact: true }).click()
  await page.getByRole('button', { name: '音乐搜索', exact: true }).click()
  await page.getByRole('button', { name: '网易云音乐', exact: true }).click()
  await page.getByTestId('music-search-input').fill('EARFQUAKE Tyler The Creator')
  await page.getByTestId('music-search-submit').click()
  const result = page.getByTestId('music-search-result').filter({ has: page.locator('strong', { hasText: /^EARFQUAKE$/i }) }).filter({ hasText: 'IGOR' }).first()
  await expect(result).toBeVisible({ timeout: 60000 })
  await result.getByTestId('music-search-play').click()
  await expect(page.getByTestId('music-search-audio-error')).toContainText('再点击一次播放', { timeout: 30000 })
  expect(await page.getByTestId('audio-engine').evaluate(audio => audio.paused)).toBe(true)
  const before = playRequests.length
  await result.getByTestId('music-search-play').click()
  await expect.poll(() => page.getByTestId('audio-engine').evaluate(audio => !audio.paused && audio.currentTime > .15), { timeout: 20000 }).toBe(true)
  expect(playRequests.length).toBe(before)
  results.push({ deniedAutoplayRetriesResolvedSourceWithoutApiAwait: true, platformRequests: before, probe: await page.evaluate(() => window.permissionProbe) })

  const signal = await page.evaluate(async () => {
    const context = new AudioContext(), analyser = context.createAnalyser(); analyser.fftSize = 2048
    context.createMediaElementSource(document.querySelector('audio')).connect(analyser); analyser.connect(context.destination); await context.resume()
    window.permissionAudio = { context, analyser }
  })
  void signal
  const rms = () => page.evaluate(() => { const a = window.permissionAudio.analyser, x = new Float32Array(a.fftSize); a.getFloatTimeDomainData(x); return Math.sqrt(x.reduce((sum, v) => sum + v * v, 0) / x.length) })
  await expect.poll(rms, { timeout: 15000 }).toBeGreaterThan(.0001)
  results.push({ platformOutputsAudioAfterRetry: true, rms: await rms() })

  // Real HTTP resource error; do not overwrite it with a generic paused state.
  await page.route('**/debug-broken-audio.mp3', route => route.fulfill({ status: 404, body: 'missing', contentType: 'text/plain' }))
  await page.locator('.music-platform-local summary').click()
  await page.getByRole('textbox', { name: '音频地址', exact: true }).fill('http://127.0.0.1:5188/debug-broken-audio.mp3')
  await page.getByRole('button', { name: '引入音频地址', exact: true }).click()
  await expect(page.getByTestId('music-search-audio-error')).toContainText(/地址不可用|下载中断/, { timeout: 15000 })
  expect(await page.getByTestId('audio-engine').evaluate(audio => audio.paused)).toBe(true)
  results.push({ missingRemoteUrlReportsNativeResourceError: true })
  expect(errors).toEqual([])
} catch (error) {
  process.exitCode = 1; results.push({ failure: error.message, errors, probe: await page.evaluate(() => window.permissionProbe).catch(() => null) })
  await page.screenshot({ path: output + '/permission-failure.png' }).catch(() => {})
} finally {
  writeFileSync(output + '/permission-results.json', JSON.stringify(results, null, 2)); console.log(JSON.stringify(results)); await browser.close()
}
