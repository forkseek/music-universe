import { chromium, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

const output = 'C:/path/to/music-universe/previews/'
const browser = await chromium.launch({ executablePath: 'C:/path/to/ms-playwright/chromium-1243/chrome-win64/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const report = { screenshots: [], errors: [] }
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  page.on('pageerror', error => report.errors.push(error.message))
  const capture = async name => {
    await page.screenshot({ path: output + name + '.png' })
    report.screenshots.push(await page.evaluate(name => {
      const box = selector => {
        const element = document.querySelector(selector)
        if (!element) return null
        const r = element.getBoundingClientRect()
        return { x: r.x, y: r.y, width: r.width, height: r.height }
      }
      return { name, url: location.href, viewport: { width: innerWidth, height: innerHeight }, doorway: document.querySelector('[data-testid="hall-universe-entry"], [data-testid="universe-hall-entry"]')?.getAttribute('href'), portal: box('.mw-universe-portal'), caption: box('.mw-hall-caption'), header: box('.mw-hall-header'), canvas: { ...document.querySelector('[data-testid="universe-webgl"]')?.dataset }, horizontalOverflow: document.documentElement.scrollWidth > innerWidth }
    }, name))
  }
  await page.goto('http://127.0.0.1:3002/#hall')
  await expect(page.locator('.mw-hall-ready')).toBeVisible()
  await page.waitForTimeout(900)
  await capture('hall-linked')
  await page.getByRole('link', { name: '进入专辑宇宙', exact: true }).click()
  const canvas = page.getByTestId('universe-webgl')
  await expect.poll(() => canvas.evaluate(c => Number(c.dataset.overviewBlend))).toBeGreaterThan(.995)
  await page.waitForTimeout(1700)
  await capture('universe-linked-overview')
  const planet = await canvas.evaluate(c => JSON.parse(c.dataset.albumScreens)[2])
  await page.mouse.move(planet.x * 1600, planet.y * 900)
  await page.mouse.wheel(0, -80)
  await expect(page.getByTestId('album-title')).toHaveText('Tidal Echo')
  await expect(page.getByRole('button', { name: '下一首', exact: true })).toBeEnabled()
  await page.waitForTimeout(650)
  await capture('universe-linked-focus')
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport)
    await page.goto('http://127.0.0.1:3002/#hall')
    await expect(page.locator('.mw-hall-ready')).toBeVisible()
    await page.waitForTimeout(800)
    await capture('hall-linked-' + viewport.width)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://127.0.0.1:5173/?from=hall')
  await expect.poll(() => page.getByTestId('universe-webgl').evaluate(c => Number(c.dataset.overviewBlend))).toBeGreaterThan(.995)
  await page.waitForTimeout(1700)
  await capture('universe-linked-mobile')
  await page.getByRole('link', { name: '回到音乐大厅', exact: true }).click()
  await expect(page.locator('.mw-hall-ready')).toBeVisible()
  await page.waitForTimeout(1400)
  await capture('hall-linked-return')
  await writeFile(output + 'rooms-inspection.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ screenshots: report.screenshots.map(s => ({ name: s.name, doorway: s.doorway, horizontalOverflow: s.horizontalOverflow })), errors: report.errors }))
} finally { await browser.close() }
