import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { dismissEntryGuide } from './entry-guide.mjs'

const url = process.env.TEST_URL || 'http://127.0.0.1:5188/'
const hall = process.env.MUSIC_WORLD_TEST_URL || 'http://127.0.0.1:3002/'
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const output = path.resolve('..')
const errors = [], checks = []
function trackErrors(target) {
  target.on('pageerror', error => errors.push(error.message))
  target.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
}
trackErrors(page)
const state = (target = page) => target.locator('canvas').evaluate(element => ({ ...element.dataset }))
async function settle(target = page) {
  await expect.poll(async () => (await state(target)).cameraMoving, { timeout: 15000 }).toBe('false')
  await target.waitForTimeout(100)
}
async function ready(target = page) {
  await target.locator('.scene-loading').waitFor({ state: 'detached', timeout: 45000 })
  await expect(target.locator('canvas')).toHaveAttribute('data-view-mode', 'continuous')
  await settle(target)
  await dismissEntryGuide(target)
}
async function point(id, target = page) { return JSON.parse((await state(target)).projectedTargets).find(item => item.id === id) }
async function requestedZoom(value, target = page) {
  await expect.poll(async () => Math.abs(Number((await state(target)).zoom) - value), { timeout: 10000 }).toBeLessThan(.00015)
}
async function wheel(pixels, target = page) {
  const before = Number((await state(target)).zoom)
  const expected = Math.max(.12, Math.min(2.8, before * Math.exp(Math.max(-160, Math.min(160, pixels)) * .0011)))
  await target.mouse.wheel(0, pixels)
  await requestedZoom(expected, target)
  return expected
}
async function burst(deltas, coordinate, target = page) {
  const before = Number((await state(target)).zoom)
  const expected = deltas.reduce((zoom, pixels) => Math.max(.12, Math.min(2.8, zoom * Math.exp(Math.max(-160, Math.min(160, pixels)) * .0011))), before)
  await target.locator('canvas').evaluate((canvas, { deltas, coordinate }) => {
    for (const deltaY of deltas) canvas.dispatchEvent(new WheelEvent('wheel', { deltaY, clientX: coordinate.x, clientY: coordinate.y, bubbles: true, cancelable: true }))
  }, { deltas, coordinate })
  await requestedZoom(expected, target)
  return expected
}
async function showTools() {
  if (await page.locator('.universe-hud').getAttribute('inert') !== null) await page.keyboard.press('h')
  await expect(page.locator('.universe-hud')).not.toHaveAttribute('inert', '')
}
async function hideTools() {
  if (await page.locator('.universe-hud').getAttribute('inert') === null) await page.keyboard.press('h')
  await expect(page.locator('.universe-hud')).toHaveAttribute('inert', '')
}
async function resetView() {
  const hidden = await page.locator('.universe-hud').getAttribute('inert') !== null
  await showTools()
  await page.getByRole('button', { name: '重置视角', exact: true }).click()
  await requestedZoom(1)
  await settle()
  if (hidden) await hideTools()
}
async function exportData() {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出星系 JSON', exact: true }).click()
  return JSON.parse(await readFile(await (await pending).path(), 'utf8'))
}
function sameCamera(before, after, tolerance = .03) {
  for (const axis of ['cameraX', 'cameraY', 'cameraZ']) assert.ok(Math.abs(Number(after[axis]) - Number(before[axis])) < tolerance, `${axis} changed unexpectedly`)
}
try {
  await page.goto(url, { waitUntil: 'networkidle' })
  await ready()
  // 默认已改为显示工具界面，这里显式进入沉浸模式，保持用例原意。
  await hideTools()
  await expect(page.locator('.universe-hud')).toHaveAttribute('inert', '')
  await expect(page.locator('.scene-label-layer')).toHaveCount(0)
  await expect.poll(async () => (await state()).sceneMode, { timeout: 10000 }).toBe('immersive')
  assert.equal((await state()).sceneObjectCount, '11')
  assert.equal((await state()).flightVisible, 'true')
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: path.join(output, 'music-universe-direct-overview.png') })
  checks.push('Default full-screen scene uses one continuous camera and retains all eleven album / track objects')

  await page.keyboard.press('Space')
  await expect(page.locator('canvas')).toHaveAttribute('data-playing', 'false')
  await settle()
  // Camera drift is frozen by pause; start precision zoom checks from the recentered baseline.
  await resetView()
  const originalTargets = JSON.parse((await state()).projectedTargets)
  const chosen = originalTargets[3]
  const centeredView = await state()
  const assertCentered = data => {
    assert.equal(data.viewCenterX, centeredView.viewCenterX)
    assert.equal(data.viewCenterY, centeredView.viewCenterY)
    assert.ok(Math.abs(Number(data.cameraX) - Number(centeredView.cameraX)) < .0001)
    assert.ok(Math.abs(Number(data.cameraY) - Number(centeredView.cameraY)) < .0001)
  }
  await page.mouse.move(180, 220)
  await wheel(160); await wheel(160); await settle()
  const overviewPlanet = await point(chosen.id)
  await page.mouse.move(overviewPlanet.x, overviewPlanet.y)
  await expect(page.locator('canvas')).toHaveAttribute('data-hover-target', chosen.id)
  await wheel(-120); await settle()
  assertCentered(await state())
  assert.equal((await state()).focusTarget, '@album-star')
  checks.push('Zooming in over an overviewed song remains incremental and never snaps or changes the selected song')
  await resetView()
  await page.mouse.move(chosen.x, chosen.y)
  await wheel(-120)
  await settle()
  const notch = await point(chosen.id)
  assert.equal((await state()).focusTarget, '@album-star')
  assert.ok(notch.radius > chosen.radius && notch.radius < chosen.radius * 1.3)
  assertCentered(await state())
  assert.equal((await state()).viewMode, 'continuous')
  checks.push('One wheel notch enlarges around the fixed view center without panning, selecting or jumping to a planet')

  let previous = Number((await state()).zoom)
  for (let index = 0; index < 12; index++) {
    const next = await wheel(-12)
    assert.ok(next < previous && previous - next < .02)
    assert.equal((await state()).viewMode, 'continuous')
    assert.equal((await state()).sceneObjectCount, '11')
    assert.equal((await state()).flightVisible, 'true')
    previous = next
  }
  await settle()
  checks.push('Small trackpad deltas accumulate monotonically with no view stages or disappearing scene objects')

  const burstAnchor = await point(chosen.id)
  const beforeBurst = await state()
  const burstZoom = await burst(Array(24).fill(-20), burstAnchor)
  assert.ok(burstZoom < Number(beforeBurst.zoom) * .6)
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-moving', 'true')
  const reverseZoom = await burst([80], burstAnchor)
  assert.ok(reverseZoom > burstZoom)
  await settle()
  assertCentered(await state())
  assert.ok(Math.abs(Number((await state()).renderedZoom) - reverseZoom) < .002)
  checks.push('Rapid wheel bursts consume every delta and accept a reversal during easing while preserving the fixed view center')

  await page.screenshot({ path: path.join(output, 'music-universe-direct-focus.png') })
  await resetView()
  const beforeDrag = await state()
  const close = await point(chosen.id)
  await page.mouse.move(close.x, close.y)
  await page.mouse.down()
  await page.mouse.move(close.x + 140, close.y + 50, { steps: 10 })
  await page.mouse.up()
  const afterDrag = await state()
  assert.ok(Number(afterDrag.surfaceYaw) > .5)
  assert.ok(Number(afterDrag.surfacePitch) > .05)
  sameCamera(beforeDrag, afterDrag)
  checks.push('Dragging a sphere rotates its surface while preserving the continuous camera pose and planet positions')

  await page.mouse.dblclick(close.x, close.y, { delay: 100 })
  await expect(page.locator('canvas')).toHaveAttribute('data-playing', 'true')
  await expect(page.locator('canvas')).toHaveAttribute('data-focus-target', chosen.id)
  await page.keyboard.press('Space')
  await expect(page.locator('canvas')).toHaveAttribute('data-playing', 'false')
  await settle()
  const framesBefore = Number((await state()).frameCount)
  await page.mouse.move(close.x, close.y)
  await wheel(80)
  await settle()
  const framesAfter = Number((await state()).frameCount)
  assert.ok(framesAfter > framesBefore)
  await page.waitForTimeout(350)
  assert.equal(Number((await state()).frameCount), framesAfter)
  const first = await page.locator('canvas').screenshot()
  await page.waitForTimeout(250)
  assert.equal(Buffer.compare(first, await page.locator('canvas').screenshot()), 0)
  checks.push('Double-clicking a planet plays that track and locks the camera onto it; Space pauses, then demand rendering stops with identical frames')

  await showTools()
  await expect(page.locator('.planet-number')).toHaveCount(10)
  await burst(Array(24).fill(160), { x: 800, y: 450 })
  await settle()
  assert.equal(Number((await state()).zoom), 2.8)
  await expect(page.locator('.planet-number')).toHaveCount(10)
  assert.equal((await state()).sceneObjectCount, '11')
  assert.equal((await state()).flightVisible, 'true')
  await burst(Array(30).fill(-160), { x: 800, y: 450 })
  await settle()
  assert.equal(Number((await state()).zoom), .12)
  await expect(page.locator('.planet-number')).toHaveCount(10)
  assert.equal((await state()).sceneObjectCount, '11')
  assert.equal((await state()).flightVisible, 'true')
  checks.push('Crossing the entire zoom range never unmounts track labels or hides planets, the hall gate and flight path')

  await resetView()
  const row = JSON.parse((await state()).projectedTargets).slice(1)
  // projectedTargets 按曲序返回（恒星之后依次为 index 0..n-1），方向键契约只要求
  // 「按曲序循环、保持相机」；v2 星系每首曲目各占一条轨道，初始相位由 Seed 生成，
  // 因此不再假设行星在屏幕上从左到右排列。
  await hideTools()
  const beforeKeys = await state()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('canvas')).toHaveAttribute('data-focus-target', row[0].id)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('canvas')).toHaveAttribute('data-focus-target', row[1].id)
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('canvas')).toHaveAttribute('data-focus-target', row[0].id)
  await settle()
  sameCamera(beforeKeys, await state())
  checks.push('Left / right keys retain track order and update inspection metadata without moving or resizing the camera')

  await showTools()
  const beforeTools = await exportData()
  const beforeInput = await state()
  await page.getByRole('textbox', { name: '星系 Seed', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Space')
  assert.equal((await state()).focusTarget, beforeInput.focusTarget)
  assert.equal((await state()).playing, 'false')
  await page.getByRole('button', { name: '编辑专辑', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.editor-dialog')).toHaveCount(0)
  assert.ok(page.url().startsWith(url))
  await page.getByRole('button', { name: '曲目索引', exact: true }).click()
  const beforeInspect = await state()
  await page.getByRole('button', { name: '查看 Tell Me What It Is', exact: true }).click()
  await expect(page.locator('canvas')).toHaveAttribute('data-focus-target', row[9].id)
  await settle()
  sameCamera(beforeInspect, await state())
  await hideTools()
  await page.locator('canvas').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('canvas')).toHaveAttribute('data-focus-target', row[0].id)
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('canvas')).toHaveAttribute('data-focus-target', row[9].id)
  await showTools()
  assert.deepEqual(await exportData(), beforeTools)
  checks.push('Tool inputs and dialog keys remain native; ordered inspection wraps and camera gestures preserve seeded export data')

  await hideTools()
  await page.keyboard.press('Escape')
  await page.waitForURL(new URL('#hall', hall).href)
  await expect(page.locator('.mw-hall-ready')).toBeVisible({ timeout: 30000 })
  checks.push('Escape in the pure scene returns to the real Music World hall')

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 })
  const mobile = await context.newPage()
  trackErrors(mobile)
  await mobile.goto(url, { waitUntil: 'networkidle' })
  await ready(mobile)
  const star = await point('@album-star', mobile)
  const session = await context.newCDPSession(mobile)
  const tap = async () => {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: star.x, y: star.y, id: 1 }] })
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  await tap(); await mobile.waitForTimeout(100); await tap()
  await expect(mobile.locator('canvas')).toHaveAttribute('data-playing', 'true')
  await mobile.waitForTimeout(450)
  await tap(); await mobile.waitForTimeout(100); await tap()
  await expect(mobile.locator('canvas')).toHaveAttribute('data-playing', 'false')
  await settle(mobile)
  const pinchBefore = await state(mobile)
  const midpoint = { x: 195, y: 380 }
  const pinch = async distance => session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: midpoint.x - distance / 2, y: midpoint.y, id: 1 }, { x: midpoint.x + distance / 2, y: midpoint.y, id: 2 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: midpoint.x - 40, y: midpoint.y, id: 1 }, { x: midpoint.x + 40, y: midpoint.y, id: 2 }] })
  await pinch(100)
  await expect.poll(async () => Number((await state(mobile)).zoom)).toBeLessThan(Number(pinchBefore.zoom))
  const expanded = Number((await state(mobile)).zoom)
  await pinch(90)
  await expect.poll(async () => Number((await state(mobile)).zoom)).toBeGreaterThan(expanded)
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  await settle(mobile)
  const pinchAfter = await state(mobile)
  assert.equal(pinchAfter.playing, 'false')
  assert.equal(pinchAfter.surfaceYaw, pinchBefore.surfaceYaw)
  assert.equal(pinchAfter.surfacePitch, pinchBefore.surfacePitch)
  assert.equal(pinchAfter.sceneObjectCount, '11')
  assert.equal(pinchAfter.flightVisible, 'true')
  assert.equal(pinchAfter.viewMode, 'continuous')
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight), false)
  await mobile.screenshot({ path: path.join(output, 'music-universe-direct-mobile.png') })
  checks.push('Real touch supports continuous two-way pinch and cancellation without surface rotation, duplicate playback or page overflow')
  await context.close()

  assert.deepEqual(errors, [])
  await writeFile(path.join(output, 'music-universe-interaction-report.json'), JSON.stringify({ url, passed: true, checks, errors }, null, 2))
  console.log(JSON.stringify({ passed: true, checks, errors }, null, 2))
} catch (error) {
  await page.screenshot({ path: path.join(output, 'music-universe-interaction-failure.png') }).catch(() => {})
  await writeFile(path.join(output, 'music-universe-interaction-report.json'), JSON.stringify({ url, passed: false, checks, errors, failure: String(error) }, null, 2))
  throw error
} finally { await browser.close() }
