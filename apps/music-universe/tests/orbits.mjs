import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { dismissEntryGuide } from './entry-guide.mjs'

const url = process.env.TEST_URL || 'http://127.0.0.1:5188/'
const output = path.resolve(process.env.TEST_OUTPUT_DIR || '..')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
const checks = [], errors = [], samples = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
const state = () => page.locator('canvas').evaluate(element => ({ ...element.dataset }))
const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]))
async function ready() {
  await page.locator('.scene-loading').waitFor({ state: 'detached', timeout: 45000 })
  await expect(page.locator('canvas')).toHaveAttribute('data-scene-systems', '1')
}
async function exported() {
  const promise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出星系 JSON', exact: true }).click()
  return JSON.parse(await readFile(await (await promise).path(), 'utf8'))
}
async function pause() {
  if ((await state()).playing === 'true') await page.getByRole('button', { name: '暂停动画', exact: true }).click()
  await expect(page.locator('canvas')).toHaveAttribute('data-playing', 'false')
  await expect.poll(async () => (await state()).cameraMoving, { timeout: 20000 }).toBe('false')
}
async function settleResources() {
  // R3F schedules disposal during idle time; draw one frame afterwards for fresh GPU counts.
  await page.waitForTimeout(350)
  await page.getByRole('button', { name: '重置视角', exact: true }).click()
  await expect.poll(async () => (await state()).cameraMoving, { timeout: 20000 }).toBe('false')
  await page.waitForTimeout(100)
  return state()
}
async function saveAlbum(index, count = 4, upload = true) {
  await page.getByRole('button', { name: '编辑专辑', exact: true }).click()
  await page.getByLabel('专辑名称', { exact: true }).fill(`Orbit QA ${index}`)
  await page.getByLabel('歌手 / 艺术家', { exact: true }).fill('Orbit QA Artist')
  await page.getByRole('textbox', { name: '曲目列表', exact: true }).fill(Array.from({ length: count }, (_, i) => `Track ${index}-${i} | 3:02`).join('\n'))
  if (upload) {
    const cover = await page.evaluate(i => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96
      const ctx = canvas.getContext('2d'); ctx.fillStyle = `hsl(${i * 41 % 360} 55% 42%)`; ctx.fillRect(0, 0, 96, 96)
      ctx.fillStyle = '#fff'; ctx.font = '32px sans-serif'; ctx.fillText(String(i), 16, 56)
      return canvas.toDataURL('image/png').split(',')[1]
    }, index)
    await page.getByLabel('上传专辑封面', { exact: true }).setInputFiles({ name: `cover-${index}.png`, mimeType: 'image/png', buffer: Buffer.from(cover, 'base64') })
    await page.locator('.cover-success').waitFor()
  }
  await page.getByRole('button', { name: '保存并生成', exact: true }).click()
  await ready()
  await expect(page.locator('canvas')).toHaveAttribute('data-scene-object-count', String(count + 1))
  await expect(page.locator('.planet-number')).toHaveCount(count)
}

try {
  await page.goto(url, { waitUntil: 'networkidle' })
  await ready()
  await dismissEntryGuide(page)
  await pause()
  await page.getByRole('textbox', { name: '星系 Seed', exact: true }).fill('ORBIT-REPLAY')
  await page.getByRole('button', { name: '重新生成', exact: true }).click()
  await ready()
  const initial = await exported()
  const baseline = await state()
  assert.equal(initial.galaxy.orbits.length, 10)
  assert.equal(baseline.sceneObjectCount, '11')
  assert.equal(baseline.orbitCount, '10')
  assert.equal(baseline.simulationTime, '0.000000')
  assert.deepEqual(JSON.parse(baseline.orbitalPositions), initial.galaxy.planets.map(p => p.position))
  await page.screenshot({ path: path.join(output, 'music-universe-orbits-desktop.png') })
  checks.push('Default album renders one cover star, ten orbital paths and ten planets at reproducible initial phases')

  await page.getByRole('button', { name: '继续动画', exact: true }).click()
  await expect.poll(async () => Number((await state()).simulationTime), { timeout: 25000 }).toBeGreaterThan(1)
  const moving = await state(), points = JSON.parse(moving.orbitalPositions), elapsed = Number(moving.simulationTime)
  initial.galaxy.planets.forEach((planet, i) => {
    const orbit = initial.galaxy.orbits[planet.orbitIndex]
    assert.ok(distance(points[i], planet.position) > 0.02, `Planet ${i} must orbit, not only spin`)
    assert.ok(Math.abs(distance(points[i], initial.galaxy.star.position) - orbit.radius) < 1e-8)
    const chord = 2 * orbit.radius * Math.abs(Math.sin(orbit.angularVelocity * elapsed / 2))
    assert.ok(Math.abs(distance(points[i], planet.position) - chord) < 1e-5)
  })
  await pause()
  const frozen = await state()
  await page.waitForTimeout(450)
  assert.equal((await state()).simulationTime, frozen.simulationTime)
  assert.equal((await state()).orbitalPositions, frozen.orbitalPositions)
  assert.equal((await state()).renderLoop, 'demand')
  assert.deepEqual(await exported(), initial)
  const projected = JSON.parse(frozen.projectedTargets).slice(1)
  const labels = await page.locator('.planet-number').evaluateAll(elements => elements.map(e => ({ x: +e.dataset.centerX, y: +e.dataset.centerY })))
  projected.forEach((point, index) => assert.ok(Math.hypot(point.x - labels[index].x, point.y - labels[index].y) < 0.05))
  checks.push('Every planet moves on its own orbit at the expected angular speed; labels follow; pause freezes motion and export data remains immutable')

  await page.getByRole('button', { name: '重新生成', exact: true }).click()
  await ready()
  assert.deepEqual(await exported(), initial)
  assert.deepEqual(JSON.parse((await state()).orbitalPositions), initial.galaxy.planets.map(p => p.position))
  checks.push('Reusing the seed resets all phases and reproduces the entire generated system')

  await page.locator('canvas').evaluate(canvas => { canvas.dataset.testIdentity = 'original-canvas' })
  let previous = initial
  for (let index = 0; index < 12; index++) {
    await saveAlbum(index)
    const next = await exported()
    assert.notEqual(next.galaxy.seed, previous.galaxy.seed)
    assert.notDeepEqual(next.galaxy.star, previous.galaxy.star)
    assert.notDeepEqual(next.galaxy.orbits, previous.galaxy.orbits)
    assert.equal(next.galaxy.star.albumCover, next.album.cover)
    assert.equal(next.galaxy.planets.length, 4)
    const data = await settleResources()
    assert.equal(data.testIdentity, 'original-canvas')
    assert.equal(data.sceneSystems, '1')
    assert.equal(data.sceneObjectCount, '5')
    assert.equal(data.orbitCount, '4')
    assert.equal(data.simulationTime, '0.000000')
    samples.push({ index, ...JSON.parse(data.gpuResources), subscribers: +data.frameSubscribers })
    previous = next
  }
  const tail = samples.slice(3)
  assert.equal(new Set(tail.map(s => s.textures)).size, 1, 'Unique uploaded covers must not accumulate GPU textures')
  assert.equal(new Set(tail.map(s => s.subscribers)).size, 1, 'Old useFrame callbacks must unsubscribe')
  assert.ok(Math.max(...tail.map(s => s.geometries)) - Math.min(...tail.map(s => s.geometries)) <= 24, 'Geometry counts stay bounded despite randomized moons and rings')
  assert.ok(Math.max(...tail.map(s => s.programs)) - Math.min(...tail.map(s => s.programs)) <= 4)
  checks.push('Twelve distinct uploaded albums replace the whole system inside the same Canvas; texture, geometry, shader and frame subscription counts stay bounded')

  await page.reload({ waitUntil: 'networkidle' })
  await ready(); await dismissEntryGuide(page); await pause()
  assert.deepEqual(await exported(), previous)
  checks.push('Reload restores the last album and saved seed exactly')

  await page.getByRole('button', { name: '继续动画', exact: true }).click()
  await expect.poll(async () => Number((await state()).simulationTime), { timeout: 25000 }).toBeGreaterThan(.2)
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')) })
  await expect(page.locator('canvas')).toHaveAttribute('data-playing', 'false')
  const hidden = await state()
  await page.waitForTimeout(450)
  assert.equal((await state()).simulationTime, hidden.simulationTime)
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')) })
  await expect(page.locator('canvas')).toHaveAttribute('data-playing', 'true')
  await expect.poll(async () => Number((await state()).simulationTime), { timeout: 15000 }).toBeGreaterThan(Number(hidden.simulationTime))
  for (let i = 0; i < 6; i++) {
    const before = await state()
    await page.getByRole('button', { name: '随机生成', exact: true }).dispatchEvent('click')
    await expect.poll(async () => Number((await state()).generation), { timeout: 15000 }).toBeGreaterThan(Number(before.generation))
    assert.equal((await state()).sceneSystems, '1')
  }
  await ready(); await pause()
  const rapid = await settleResources()
  assert.equal(JSON.parse(rapid.gpuResources).textures, samples.at(-1).textures)
  assert.equal(+rapid.frameSubscribers, samples.at(-1).subscribers)
  assert.equal(rapid.sceneObjectCount, '5')
  checks.push('Visibility events stop and resume simulation; six rapid replacements with identical track IDs retain one system and stable GPU resources/subscriptions')

  await saveAlbum(40, 40, false)
  await page.getByRole('button', { name: '继续动画', exact: true }).click()
  await expect.poll(async () => Number((await state()).simulationTime), { timeout: 30000 }).toBeGreaterThan(.3)
  assert.equal((await state()).sceneObjectCount, '41')
  await pause()
  await saveAlbum(1, 1, false)
  assert.equal((await state()).sceneObjectCount, '2')
  assert.equal((await state()).orbitCount, '1')
  checks.push('Forty-track and single-track albums replace the prior scene without leftover objects')

  await page.getByRole('button', { name: '编辑专辑', exact: true }).click()
  await page.getByRole('button', { name: '恢复示例', exact: true }).click()
  await page.getByRole('button', { name: '保存并生成', exact: true }).click()
  await ready()
  const beforeResize = Number((await state()).frameCount)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(async () => Number((await state()).frameCount), { timeout: 25000 }).toBeGreaterThan(beforeResize + 1)
  await expect.poll(async () => (await state()).cameraMoving, { timeout: 25000 }).toBe('false')
  const mobileTargets = JSON.parse((await state()).projectedTargets)
  mobileTargets.forEach(point => assert.ok(point.x - point.radius >= 0 && point.x + point.radius <= 390 && point.y - point.radius >= 0 && point.y + point.radius <= 844, `Visible mobile body: ${point.id}`))
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight), false)
  await page.screenshot({ path: path.join(output, 'music-universe-orbits-mobile.png') })
  checks.push('Portrait viewport preserves the existing UI, fits the orbital system and has no page overflow')
  assert.deepEqual(errors, [])
  await writeFile(path.join(output, 'music-universe-orbits-report.json'), JSON.stringify({ url, passed: true, checks, samples, errors }, null, 2))
  console.log(JSON.stringify({ passed: true, checks, samples, errors }, null, 2))
} catch (error) {
  await page.screenshot({ path: path.join(output, 'music-universe-orbits-failure.png') }).catch(() => {})
  await writeFile(path.join(output, 'music-universe-orbits-report.json'), JSON.stringify({ url, passed: false, checks, samples, errors, failure: String(error) }, null, 2))
  throw error
} finally { await browser.close() }
