import { chromium, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

const output = 'C:/path/to/music-universe/previews/'
const browser = await chromium.launch({ executablePath: 'C:/path/to/ms-playwright/chromium-1243/chrome-win64/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const report = { screenshots: [], errors: [] }
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  page.on('pageerror', error => report.errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()) })
  const canvas = page.getByTestId('universe-webgl')
  const overview = async () => {
    await expect.poll(() => canvas.evaluate(c => Number(c.dataset.projectedOverviewBlend))).toBeGreaterThan(.995)
    await expect.poll(() => canvas.evaluate(c => JSON.parse(c.dataset.albumScreens).every(p => p.x > .08 && p.x < .92))).toBe(true)
  }
  const point = async index => {
    const planet = await canvas.evaluate((c, index) => JSON.parse(c.dataset.albumScreens)[index], index)
    const viewport = page.viewportSize()
    return { x: planet.x * viewport.width, y: planet.y * viewport.height }
  }
  const double = async index => { const p = await point(index); await page.mouse.dblclick(p.x, p.y, { delay: 75 }) }
  const capture = async name => {
    await page.screenshot({ path: output + name + '.png' })
    report.screenshots.push(await page.evaluate(name => ({ name, url: location.href, viewport: { width: innerWidth, height: innerHeight }, audio: { src: document.querySelector('audio').currentSrc, paused: document.querySelector('audio').paused, time: document.querySelector('audio').currentTime }, canvas: { ...document.querySelector('[data-testid="universe-webgl"]').dataset }, visibleUiComponents: document.querySelectorAll('header, nav, h1, h2, aside, button, a, input').length, overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight }), name))
  }
  await page.goto('http://127.0.0.1:5173/')
  await overview()
  await capture('immersive-overview')
  await double(2)
  await expect.poll(() => page.locator('audio').evaluate(a => !a.paused && a.currentSrc.endsWith('/audio/tidal-echo.wav'))).toBe(true)
  await expect.poll(() => canvas.evaluate(c => JSON.parse(c.dataset.playbackEffects)[2].strength)).toBeGreaterThan(.98)
  await capture('immersive-playing')
  const target = await point(2)
  await page.mouse.move(target.x, target.y); await page.mouse.wheel(0, -80)
  await expect(canvas).toHaveAttribute('data-view-mode', 'focus')
  await expect(canvas).toHaveAttribute('data-focus-album', '')
  await expect.poll(() => canvas.evaluate(c => Number(c.dataset.projectedOverviewBlend))).toBeLessThan(.001)
  await capture('immersive-focus-playing')
  await double(2)
  await expect.poll(() => page.locator('audio').evaluate(a => a.paused)).toBe(true)
  await expect.poll(() => canvas.evaluate(c => JSON.parse(c.dataset.playbackEffects).every(e => !e.visible))).toBe(true)
  await capture('immersive-paused')
  for (const viewport of [{ width: 390, height: 844 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport)
    await page.goto('http://127.0.0.1:5173/')
    await overview()
    await expect(canvas).toHaveAttribute('data-projected-width', String(viewport.width))
    await double(1)
    await expect.poll(() => page.locator('audio').evaluate(a => !a.paused && a.currentSrc.endsWith('/audio/blue-hour.wav'))).toBe(true)
    await expect.poll(() => canvas.evaluate(c => JSON.parse(c.dataset.playbackEffects)[1].strength)).toBeGreaterThan(.98)
    await capture('immersive-playing-' + viewport.width)
  }
  await writeFile(output + 'immersive-inspection.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ screenshots: report.screenshots.map(s => ({ name: s.name, ui: s.visibleUiComponents, playing: !s.audio.paused, overflow: s.overflow, calls: s.canvas.renderCalls })), errors: report.errors }))
} finally { await browser.close() }
