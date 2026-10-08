// 临时诊断 2：精确检验「以光标为中心缩放」是否守住指针下的世界点。跑完删除。
import { chromium } from '@playwright/test'

const url = process.env.TEST_URL || 'http://127.0.0.1:5188/'
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

const state = () => page.evaluate(() => {
  const c = document.querySelector('canvas')
  return {
    zoom: +(c?.dataset.zoom ?? 'NaN'),
    renderedZoom: +(c?.dataset.renderedZoom ?? 'NaN'),
    targets: (() => { try { return JSON.parse(c?.dataset.projectedTargets ?? '[]') } catch { return [] } })(),
  }
})

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.locator('.scene-loading').waitFor({ state: 'detached', timeout: 45000 })
// 暂停动画，排除电影漂移和行星公转带来的投影变化
await page.keyboard.press('h')
await page.waitForTimeout(200)
await page.locator('button[aria-label="暂停动画"]').click()
await page.waitForTimeout(1500)

const s0 = await state()
const star0 = s0.targets.find((t) => t.id === '@album-star')
const cx = Math.round(star0.x), cy = Math.round(star0.y)
console.log('paused. zoom', s0.zoom, 'star at', { cx, cy })

await page.mouse.move(cx, cy)
await page.waitForTimeout(150)
await page.mouse.wheel(0, -120)
await page.waitForTimeout(1400)
const s1 = await state()
const star1 = s1.targets.find((t) => t.id === '@album-star')
console.log('zoom-in  -> zoom', s1.zoom, 'renderedZoom', s1.renderedZoom)
console.log('  star drift', { dx: +(star1.x - cx).toFixed(1), dy: +(star1.y - cy).toFixed(1) })

await page.mouse.wheel(0, -120)
await page.waitForTimeout(1400)
const s2 = await state()
const star2 = s2.targets.find((t) => t.id === '@album-star')
console.log('zoom-in2 -> zoom', s2.zoom, 'renderedZoom', s2.renderedZoom)
console.log('  star drift', { dx: +(star2.x - cx).toFixed(1), dy: +(star2.y - cy).toFixed(1) })

// 偏移锚点：把指针放在恒星右侧 300px 处
const ox = cx + 300
await page.mouse.move(ox, cy)
await page.waitForTimeout(150)
const beforeOff = await state()
const starBefore = beforeOff.targets.find((t) => t.id === '@album-star')
await page.mouse.wheel(0, -120)
await page.waitForTimeout(1400)
const afterOff = await state()
const starAfter = afterOff.targets.find((t) => t.id === '@album-star')
// 若以指针为中心缩放，恒星相对指针的位置应随缩放比例放大（远离指针）
const ratio = afterOff.zoom / beforeOff.zoom
const predicted = { x: ox + (starBefore.x - ox) * ratio, y: cy + (starBefore.y - cy) * ratio }
console.log('offset anchor ratio', ratio.toFixed(3))
console.log('  star actual', { x: +starAfter.x.toFixed(1), y: +starAfter.y.toFixed(1) }, 'predicted', { x: +predicted.x.toFixed(1), y: +predicted.y.toFixed(1) })
console.log('  deviation', { dx: +(starAfter.x - predicted.x).toFixed(1), dy: +(starAfter.y - predicted.y).toFixed(1) })

console.log('--- console errors: ' + errors.length + ' ---')
await browser.close()
