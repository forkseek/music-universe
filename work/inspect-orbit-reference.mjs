import { chromium } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: 'work/orbit-reference-overview.png' })
  const snapshot = await page.locator('body').ariaSnapshot()
  await writeFile('work/orbit-reference-overview.txt', snapshot)
  console.log(JSON.stringify({ title: await page.title(), snapshot, errors }, null, 2))
} finally { await browser.close() }
