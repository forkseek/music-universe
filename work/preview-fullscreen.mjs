import { chromium } from '@playwright/test'
const output = 'C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs'
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
try {
  await page.goto('http://127.0.0.1:5188/', { waitUntil: 'networkidle' })
  await page.locator('.scene-loading').waitFor({ state: 'detached', timeout: 45000 })
  await page.evaluate(() => document.fonts.ready)
  await page.getByRole('button', { name: '暂停动画', exact: true }).click()
  await page.screenshot({ path: output + '/music-universe-fullscreen.png' })
  await page.getByRole('button', { name: '沉浸模式', exact: true }).click()
  await page.screenshot({ path: output + '/music-universe-immersive.png' })
  await page.getByRole('button', { name: '显示界面', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: output + '/music-universe-fullscreen-mobile.png' })
  console.log(JSON.stringify({ errors, viewport: await page.locator('.galaxy-viewport').boundingBox(), canvas: await page.locator('canvas').evaluate((element) => ({ width: element.width, height: element.height, ...element.dataset })) }, null, 2))
} finally { await browser.close() }
