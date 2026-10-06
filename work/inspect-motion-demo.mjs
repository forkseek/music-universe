import { chromium } from '@playwright/test'
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  await page.goto('http://localhost:5180/space-motion-demo.html?v=7', { waitUntil: 'networkidle' })
  await page.waitForTimeout(250)
  const before = await page.locator('#backdrop').evaluate(element => ({ transform: element.style.transform, image: getComputedStyle(element).backgroundImage }))
  await page.mouse.move(850, 480); await page.mouse.down(); await page.mouse.move(1080, 510, { steps: 8 }); await page.mouse.up()
  await page.waitForTimeout(400)
  const orbit = await page.locator('#readout').innerText()
  await page.keyboard.press('r'); await page.keyboard.down('d'); await page.waitForTimeout(350); await page.keyboard.up('d')
  await page.keyboard.down('q'); await page.waitForTimeout(300); await page.keyboard.up('q')
  const free = await page.locator('#backdrop').evaluate(element => element.style.transform)
  await page.screenshot({ path: 'work/space-motion-reference.png' })
  await page.keyboard.press('k'); await page.waitForTimeout(750)
  console.log(JSON.stringify({ before, orbit, free, after: await page.locator('#readout').innerText(), pointerLocked: await page.evaluate(() => !!document.pointerLockElement) }, null, 2))
} finally { await browser.close() }
