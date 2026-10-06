import { chromium, expect } from '@playwright/test'
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage()
const diagnostics = [], errors = []
page.on('request', request => { if (request.url().includes(':5199') || request.url().includes('/src/liveDiagnostics')) diagnostics.push(new URL(request.url()).pathname) })
page.on('pageerror', error => errors.push(error.message))
try {
  const response = await page.goto('http://127.0.0.1:5188/', { waitUntil: 'domcontentloaded' })
  expect(response.status()).toBe(200)
  await expect(page.locator('canvas')).toHaveAttribute('data-frame-count', /\d+/, { timeout: 45000 })
  const guide = page.getByRole('button', { name: '开始遨游', exact: true })
  if (await guide.isVisible()) await guide.click()
  await expect.poll(() => page.locator('canvas').getAttribute('data-frame-count')).not.toBe('1')
  expect(diagnostics).toEqual([]); expect(errors).toEqual([])
  console.log(JSON.stringify({ pageStatus: 200, sceneReady: true, temporaryDiagnosticRequests: 0, errors }))
} finally { await browser.close() }
