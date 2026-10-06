import { chromium, expect } from '@playwright/test'
const browser = await chromium.launch({ executablePath: 'C:/path/to/ms-playwright/chromium-1243/chrome-win64/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:5173/')
  const canvas = page.getByTestId('universe-webgl')
  await expect.poll(() => canvas.evaluate(c => Number(c.dataset.projectedOverviewBlend))).toBeGreaterThan(.995)
  await page.evaluate(() => {
    window.__travelEvents = []
    for (const type of ['pointerdown', 'pointerup', 'dblclick']) document.addEventListener(type, e => window.__travelEvents.push({ type, x: e.clientX, y: e.clientY, detail: e.detail, audioPaused: document.querySelector('audio').paused, track: document.querySelector('canvas').dataset.currentTrack }), true)
  })
  const position = async () => canvas.evaluate(c => JSON.parse(c.dataset.albumScreens)[2])
  const start = await position()
  await page.mouse.move(start.x * 1440, start.y * 900)
  await page.mouse.wheel(0, -80)
  await expect(canvas).toHaveAttribute('data-transitioning', 'true')
  await expect.poll(() => canvas.evaluate(c => Number(c.dataset.projectedOverviewBlend))).toBeLessThan(.4)
  const before = await canvas.evaluate(c => ({ ...c.dataset }))
  const target = await position()
  await page.screenshot({ path: 'work/double-travel-before.png' })
  await page.mouse.dblclick(target.x * 1440, target.y * 900, { delay: 75 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'work/double-travel-after.png' })
  const after = await page.evaluate(() => ({ events: window.__travelEvents, trace: document.querySelector('canvas').dataset.planetDoubleTrace, canvas: { ...document.querySelector('canvas').dataset }, audio: { src: document.querySelector('audio').currentSrc, paused: document.querySelector('audio').paused, time: document.querySelector('audio').currentTime } }))
  console.log(JSON.stringify({ before, target, after, errors }))
} finally { await browser.close() }
