import { chromium } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

const output = 'C:/path/to/music-universe/previews/'
const browser = await chromium.launch({ executablePath: 'C:/path/to/ms-playwright/chromium-1243/chrome-win64/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:3002/#hall', { waitUntil: 'domcontentloaded' })
  await page.locator('.mw-hall-ready').waitFor({ timeout: 30000 })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: output + 'hall-reference.png' })
  const labels = await page.locator('.mw-hall-header, .mw-hall-caption, .mw-hall-portals').allTextContents()
  console.log(JSON.stringify({ labels, errors }))
  await writeFile(output + 'hall-reference.json', JSON.stringify({ url: page.url(), labels, errors }, null, 2) + '\n')
} finally { await browser.close() }
