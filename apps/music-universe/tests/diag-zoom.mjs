// 临时诊断：定位「光标缩放」与相关交互的异常。跑完删除。
import { chromium } from '@playwright/test'

const url = process.env.TEST_URL || 'http://127.0.0.1:5188/'
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

const canvasState = () => page.evaluate(() => {
  const c = document.querySelector('canvas')
  return {
    zoom: +(c?.dataset.zoom ?? 'NaN'),
    renderedZoom: +(c?.dataset.renderedZoom ?? 'NaN'),
    cameraMode: c?.dataset.cameraMode,
    cameraMoving: c?.dataset.cameraMoving,
    fov: +(c?.dataset.cameraFov ?? 'NaN'),
    cursor: document.body.style.cursor,
    canvasCursor: c?.style.cursor,
    hudHidden: document.querySelector('.app-shell')?.classList.contains('hud-hidden'),
    drawer: !!document.querySelector('.music-search-drawer'),
    targets: (() => { try { return JSON.parse(c?.dataset.projectedTargets ?? '[]') } catch { return [] } })(),
  }
})

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.locator('.scene-loading').waitFor({ state: 'detached', timeout: 45000 })
await page.waitForTimeout(1200)

const before = await canvasState()
console.log('initial zoom', before.zoom, 'renderedZoom', before.renderedZoom, 'mode', before.cameraMode)
const star = before.targets.find((t) => t.id === '@album-star')
console.log('star screen', star && { x: Math.round(star.x), y: Math.round(star.y), r: +star.radius.toFixed(1) })

// 选一个靠近某颗行星的点作为缩放锚点
const planet = before.targets.filter((t) => t.id !== '@album-star').sort((a, b) => b.radius - a.radius)[0]
const ax = Math.round(planet.x + planet.radius * 1.6)
const ay = Math.round(planet.y)
console.log('anchor planet', planet.id, 'anchor point', { ax, ay })

await page.mouse.move(ax, ay)
await page.waitForTimeout(120)
await page.mouse.wheel(0, -240)
await page.waitForTimeout(900)
const afterIn = await canvasState()
const p1 = afterIn.targets.find((t) => t.id === planet.id)
console.log('after zoom-in zoom', afterIn.zoom, 'renderedZoom', afterIn.renderedZoom)
console.log('  planet screen before', { x: Math.round(planet.x), y: Math.round(planet.y) }, '-> after', p1 && { x: Math.round(p1.x), y: Math.round(p1.y) })
console.log('  cursor(body/canvas)', JSON.stringify(afterIn.cursor), JSON.stringify(afterIn.canvasCursor))

await page.mouse.wheel(0, 240)
await page.waitForTimeout(900)
const afterOut = await canvasState()
const p2 = afterOut.targets.find((t) => t.id === planet.id)
console.log('after zoom-out zoom', afterOut.zoom, 'renderedZoom', afterOut.renderedZoom)
console.log('  planet screen', p2 && { x: Math.round(p2.x), y: Math.round(p2.y) })

// 悬停行星：光标是否变为 grab
const hoverPlanet = afterOut.targets.filter((t) => t.id !== '@album-star').sort((a, b) => b.radius - a.radius)[0]
await page.mouse.move(Math.round(hoverPlanet.x), Math.round(hoverPlanet.y))
await page.waitForTimeout(250)
const hoverState = await canvasState()
console.log('hover planet cursor body=' + JSON.stringify(hoverState.cursor) + ' canvas=' + JSON.stringify(hoverState.canvasCursor))

// 拖动空白处：光标是否 grabbing
await page.mouse.move(60, 700)
await page.mouse.down()
await page.mouse.move(140, 700, { steps: 4 })
await page.waitForTimeout(150)
const dragState = await page.evaluate(() => ({ body: document.body.style.cursor, canvas: document.querySelector('canvas')?.style.cursor }))
console.log('dragging cursor', JSON.stringify(dragState))
await page.mouse.up()
await page.waitForTimeout(150)
const upState = await page.evaluate(() => ({ body: document.body.style.cursor, canvas: document.querySelector('canvas')?.style.cursor }))
console.log('after drag cursor', JSON.stringify(upState))

// 滚轮是否在行星上「吸附/跳变」——检查 overview 状态
console.log('overview attr', await page.evaluate(() => document.querySelector('canvas')?.dataset.overview))

console.log('--- console errors: ' + errors.length + ' ---')
for (const e of errors.slice(0, 20)) console.log('  ' + e)
await browser.close()
