import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { dismissEntryGuide } from './entry-guide.mjs'

const url = process.env.TEST_URL || 'http://127.0.0.1:5188/'
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const output = path.resolve(process.env.TEST_OUTPUT_DIR || '..'), errors = [], checks = []
function trackErrors(target) {
  target.on('pageerror', error => errors.push(error.message))
  target.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
}
trackErrors(page)
const state = (target = page) => target.locator('canvas').evaluate(element => ({ ...element.dataset }))
const quaternion = (value) => JSON.parse(value.starQuaternion)
const difference = (a, b) => Math.min(Math.hypot(...a.map((value, i) => value - b[i])), Math.hypot(...a.map((value, i) => value + b[i])))
async function ready(target = page) {
  await target.goto(url, { waitUntil: 'networkidle' })
  await target.locator('.scene-loading').waitFor({ state: 'detached', timeout: 45000 })
  await dismissEntryGuide(target)
  await expect(target.locator('canvas')).toHaveAttribute('data-star-artwork-mapping', 'paired-hemispheres')
  await expect(target.locator('canvas')).toHaveAttribute('data-camera-moving', 'false')
}
async function star(target = page) { return JSON.parse((await state(target)).projectedTargets).find(node => node.id === '@album-star') }
async function pause(target = page) {
  if ((await state(target)).playing === 'true') await target.keyboard.press('Space')
  await expect(target.locator('canvas')).toHaveAttribute('data-playing', 'false')
}
async function play(target = page) {
  if ((await state(target)).playing !== 'true') await target.keyboard.press('Space')
  await expect(target.locator('canvas')).toHaveAttribute('data-playing', 'true')
}
async function flick(target = page) {
  const center = await star(target)
  await target.mouse.move(center.x, center.y)
  await target.mouse.down()
  await target.mouse.move(center.x + 145, center.y + 35, { steps: 6 })
  await target.mouse.up()
  await expect.poll(async () => Number((await state(target)).starAngularSpeed)).toBeGreaterThan(0.1)
}
try {
  await ready()
  await pause()
  const center = await star()
  await page.screenshot({ path: path.join(output, 'music-universe-star-front.png') })
  await page.mouse.move(center.x, center.y)
  await page.mouse.down()
  await page.mouse.move(center.x + Math.PI / .008, center.y, { steps: 20 })
  await page.mouse.up()
  await expect(page.locator('canvas')).toHaveAttribute('data-star-dragging', 'false')
  await page.screenshot({ path: path.join(output, 'music-universe-star-rear.png') })
  checks.push('Album artwork remains on both spherical hemispheres during an actual half-turn')

  const before = await state()
  await page.mouse.move(center.x, center.y)
  await page.mouse.down()
  await page.mouse.move(center.x + 920, center.y + 125, { steps: 32 })
  await page.mouse.up()
  const turned = await state()
  assert.ok(Number(turned.starYaw) - Number(before.starYaw) > Math.PI * 2)
  assert.ok(Number(turned.starPitch) - Number(before.starPitch) > .6)
  assert.ok(Math.abs(Math.hypot(...quaternion(turned)) - 1) < 1e-8)
  assert.equal(turned.cameraX, before.cameraX)
  assert.equal(turned.cameraZ, before.cameraZ)
  assert.equal(Number(turned.starAngularSpeed), 0)
  checks.push('Unrestricted mouse drag crosses a full revolution and tilts the star while preserving the camera and layout')

  await play()
  const auto = quaternion(await state())
  await page.waitForTimeout(400)
  assert.ok(difference(auto, quaternion(await state())) > .001)
  await flick()
  const released = await state()
  await page.waitForTimeout(220)
  const drifting = await state()
  const elapsed = Number(drifting.starSimulationTime) - Number(released.starSimulationTime)
  const expectedInertia = Number(released.starAngularSpeed) * (1 - Math.exp(-3.2 * elapsed)) / 3.2
  const automaticOnly = Math.sin(.025 * elapsed / 2)
  assert.ok(elapsed > 0)
  assert.ok(difference(quaternion(released), quaternion(drifting)) > automaticOnly + Math.sin(expectedInertia / 2) * .3, 'Released rotation must exceed automatic drift, using the actual simulated time and release speed')
  assert.ok(Number(drifting.starAngularSpeed) > 0)
  assert.ok(Number(drifting.starAngularSpeed) < Number(released.starAngularSpeed))
  checks.push('Gentle automatic rotation and release inertia change real mesh orientation while angular speed decays')

  await page.mouse.move(center.x, center.y)
  await page.mouse.down()
  await expect(page.locator('canvas')).toHaveAttribute('data-star-dragging', 'true')
  await expect.poll(async () => Number((await state()).starAngularSpeed)).toBe(0)
  const held = quaternion(await state())
  await page.waitForTimeout(200)
  assert.ok(difference(held, quaternion(await state())) < 1e-8)
  await page.mouse.up()
  checks.push('Re-grabbing immediately brakes inertia and holds the star steady')

  await flick()
  await pause()
  await expect.poll(async () => Number((await state()).starAngularSpeed)).toBe(0)
  const frozen = quaternion(await state())
  await page.waitForTimeout(200)
  assert.ok(difference(frozen, quaternion(await state())) < 1e-8)
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-moving', 'false', { timeout: 20000 })
  await expect.poll(async () => {
    const frames = (await state()).frameCount
    await page.waitForTimeout(200)
    return (await state()).frameCount === frames
  }, { timeout: 10000 }).toBe(true)
  await play()
  await page.mouse.move(center.x, center.y)
  await page.mouse.down()
  await page.mouse.move(center.x + 55, center.y + 20, { steps: 3 })
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(page.locator('canvas')).toHaveAttribute('data-star-dragging', 'false')
  await expect.poll(async () => Number((await state()).starAngularSpeed)).toBe(0)
  await page.mouse.up()
  await pause()
  checks.push('Pause freezes and clears momentum; loss of focus releases pointer capture without a delayed fling')

  const reduced = await browser.newContext({ viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce' })
  const reducedPage = await reduced.newPage()
  trackErrors(reducedPage)
  await ready(reducedPage)
  const reducedStar = await star(reducedPage)
  const reducedBefore = await state(reducedPage)
  await reducedPage.mouse.move(reducedStar.x, reducedStar.y)
  await reducedPage.mouse.down()
  await reducedPage.mouse.move(reducedStar.x + 110, reducedStar.y, { steps: 5 })
  await reducedPage.mouse.up()
  assert.ok(difference(quaternion(reducedBefore), quaternion(await state(reducedPage))) > .05)
  await play(reducedPage)
  const reducedHold = quaternion(await state(reducedPage))
  await reducedPage.waitForTimeout(200)
  assert.ok(difference(reducedHold, quaternion(await state(reducedPage))) < 1e-8)
  assert.equal(Number((await state(reducedPage)).starAngularSpeed), 0)
  await reduced.close()
  checks.push('Reduced-motion preference permits direct manipulation without autonomous rotation or release inertia')

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 })
  const mobile = await mobileContext.newPage()
  trackErrors(mobile)
  await ready(mobile)
  await pause(mobile)
  const mobileStar = await star(mobile)
  const session = await mobileContext.newCDPSession(mobile)
  const touch = (type, touchPoints) => session.send('Input.dispatchTouchEvent', { type, touchPoints })
  const mobileBefore = await state(mobile)
  for (let round = 0; round < 6; round++) {
    await touch('touchStart', [{ x: mobileStar.x, y: mobileStar.y, id: 1 }])
    for (let step = 1; step <= 12; step++) await touch('touchMove', [{ x: mobileStar.x + step * 13, y: mobileStar.y, id: 1 }])
    await touch('touchEnd', [])
  }
  assert.ok(Number((await state(mobile)).starYaw) - Number(mobileBefore.starYaw) > Math.PI * 2)
  const pinchBefore = await state(mobile)
  await touch('touchStart', [{ x: mobileStar.x - 16, y: mobileStar.y, id: 1 }, { x: mobileStar.x + 16, y: mobileStar.y, id: 2 }])
  await touch('touchMove', [{ x: mobileStar.x - 24, y: mobileStar.y, id: 1 }, { x: mobileStar.x + 24, y: mobileStar.y, id: 2 }])
  await touch('touchEnd', [])
  await expect.poll(async () => Number((await state(mobile)).zoom)).toBeLessThan(Number(pinchBefore.zoom))
  await expect(mobile.locator('canvas')).toHaveAttribute('data-star-dragging', 'false')
  const pinchAfter = await state(mobile)
  assert.ok(difference(quaternion(pinchBefore), quaternion(pinchAfter)) < 1e-8)
  assert.equal(Number(pinchAfter.starAngularSpeed), 0)
  assert.equal(pinchAfter.starDragging, 'false')
  assert.equal(pinchAfter.playing, 'false')
  await expect(mobile.locator('canvas')).toHaveAttribute('data-camera-moving', 'false')
  await mobile.screenshot({ path: path.join(output, 'music-universe-star-mobile.png') })
  await mobileContext.close()
  checks.push('Real mobile touch rotates beyond 360 degrees and pinch zoom preserves orientation without accidental inertia or playback')

  assert.deepEqual(errors, [])
  await writeFile(path.join(output, 'music-universe-rotation-report.json'), JSON.stringify({ url, passed: true, checks, errors }, null, 2))
  console.log(JSON.stringify({ passed: true, checks, errors }, null, 2))
} catch (error) {
  await page.screenshot({ path: path.join(output, 'music-universe-rotation-failure.png') }).catch(() => {})
  await writeFile(path.join(output, 'music-universe-rotation-report.json'), JSON.stringify({ url, passed: false, checks, errors, failure: String(error) }, null, 2))
  throw error
} finally { await browser.close() }
