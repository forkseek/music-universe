import { chromium } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', (message) => { if (message.type() === 'error') { const location = message.location(); const url = location.url ? new URL(location.url) : null; console.log('BROWSER ERROR', message.text(), url ? url.origin + url.pathname : location) } })
try {
  await page.goto('http://127.0.0.1:5188/')
  await page.locator('.scene-loading').waitFor({ state: 'detached', timeout: 45000 })
  await page.getByRole('button', { name: '暂停动画', exact: true }).click()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ fullPage: true })
  await page.locator('.galaxy-viewport').screenshot()
  await page.waitForTimeout(350)
  const a = await page.locator('.galaxy-viewport').screenshot()
  const canvasA = await page.locator('canvas').evaluate((element) => element.toDataURL())
  const labelsA = await page.locator('.planet-number, .star-caption').evaluateAll((elements) => elements.map((element) => element.style.transform))
  await page.waitForTimeout(150)
  const b = await page.locator('.galaxy-viewport').screenshot()
  const canvasB = await page.locator('canvas').evaluate((element) => element.toDataURL())
  const labelsB = await page.locator('.planet-number, .star-caption').evaluateAll((elements) => elements.map((element) => element.style.transform))
  await writeFile('work/paused-a.png', a); await writeFile('work/paused-b.png', b)
  const pa = await sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const pb = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let changed = 0, maxDelta = 0, minX = 9999, minY = 9999, maxX = 0, maxY = 0
  for (let i = 0; i < pa.data.length; i += 4) {
    let delta = 0
    for (let channel = 0; channel < 3; channel++) delta = Math.max(delta, Math.abs(pa.data[i + channel] - pb.data[i + channel]))
    if (delta) { changed++; maxDelta = Math.max(maxDelta, delta); const pixel = i / 4; const x = pixel % pa.info.width, y = Math.floor(pixel / pa.info.width); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) }
  }
  console.log(JSON.stringify({ identicalPng: Buffer.compare(a, b) === 0, canvasEqual: canvasA === canvasB, changedPixels: changed, ratio: changed / (pa.info.width * pa.info.height), maxDelta, bounds: { minX, minY, maxX, maxY }, labelsEqual: JSON.stringify(labelsA) === JSON.stringify(labelsB) }, null, 2))
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' })
  const c = await page.locator('.galaxy-viewport').screenshot()
  await page.waitForTimeout(150)
  const d = await page.locator('.galaxy-viewport').screenshot()
  console.log('Without smooth page scrolling', Buffer.compare(c, d) === 0)
  for (const room of ['hall', 'world', 'library', 'journey']) {
    console.log('OPEN ROOM', room)
    await page.goto('http://127.0.0.1:3002/#' + room)
    await page.waitForTimeout(1800)
  }
} finally { await browser.close() }
