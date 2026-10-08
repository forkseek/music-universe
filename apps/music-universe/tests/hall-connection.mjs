import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { dismissEntryGuide } from './entry-guide.mjs'

const universe = new URL(process.env.TEST_URL || 'http://127.0.0.1:5188/').href
const hall = new URL(process.env.MUSIC_WORLD_TEST_URL || 'http://127.0.0.1:3002/').href
const output = path.resolve('..')
const candidate = process.env.BROWSER_EXECUTABLE || chromium.executablePath()
const browser = await chromium.launch({ headless: true, executablePath: existsSync(candidate) ? candidate : 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
const errors = []
const checks = []
const failedResources = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => { if (message.type() === 'error') { errors.push(message.text()); const raw = message.location().url; const url = raw ? new URL(raw) : null; console.log('RESOURCE ERROR', url ? url.origin + url.pathname : '(no URL)', 'PAGE', page.url(), message.text()) } })
page.on('response', (response) => { if (response.status() >= 400) { const url = new URL(response.url()); failedResources.push({ status: response.status(), url: url.origin + url.pathname }) } })

async function sceneReady() {
  await page.locator('.scene-loading').waitFor({ state: 'detached', timeout: 45000 })
  await expect(page.locator('canvas')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await dismissEntryGuide(page)
  if (await page.locator('.universe-hud').getAttribute('inert') !== null) await page.keyboard.press('h')
}
async function exportData() {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出星系 JSON', exact: true }).click()
  return JSON.parse(await readFile(await (await pending).path(), 'utf8'))
}
try {
  await page.goto(universe)
  await sceneReady()
  await expect(page.locator('.hall-companion-portrait')).toBeVisible()
  await page.getByRole('button', { name: '展开音乐大厅入口', exact: true }).click()
  await expect(page.locator('.hall-door')).toHaveCount(3)
  await expect(page.getByRole('link', { name: '音乐大厅', exact: true })).toHaveAttribute('href', hall + '#hall')
  const bounds = await page.locator('.galaxy-viewport').boundingBox()
  assert.deepEqual(bounds, { x: 0, y: 0, width: 1600, height: 900 })
  checks.push('Full-screen universe keeps the hall companion and three warm-gold doors in an expandable panel')

  await page.getByRole('button', { name: '打开我的曲库', exact: true }).hover()
  await expect(page.getByRole('tooltip')).toContainText('我的曲库')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  checks.push('Cream cloud hint supports hover and Escape dismissal')
  await page.getByRole('button', { name: '展开音乐大厅入口', exact: true }).click()
  await page.mouse.move(1, 1)
  await page.getByRole('button', { name: '暂停动画', exact: true }).click()
  await expect.poll(async () => {
    const pausedA = await page.locator('.galaxy-viewport').screenshot()
    await page.waitForTimeout(300)
    const pausedB = await page.locator('.galaxy-viewport').screenshot()
    return Buffer.compare(pausedA, pausedB)
  }, { timeout: 10000 }).toBe(0)
  await page.screenshot({ path: path.join(output, 'music-universe-hall-linked.png'), fullPage: true })
  await page.locator('.galaxy-viewport').screenshot({ path: path.join(output, 'music-universe-hall-galaxy.png') })
  checks.push('Updated pilot, portal and planets remain frozen when animation pauses')

  await page.getByRole('button', { name: '编辑专辑', exact: true }).click()
  await page.getByLabel('专辑名称', { exact: true }).fill('THE HALL CONNECTION')
  await page.getByRole('button', { name: '保存并生成', exact: true }).click()
  await sceneReady()
  // 「保存并生成」会为新专辑派生一个新 Seed（replaceAlbum → createGalaxySeed），
  // 因此在保存之后再写入本次要核对的 Seed，往返断言才与实现语义一致。
  await page.getByRole('textbox', { name: '星系 Seed', exact: true }).fill('HALL-VOYAGER-QA')
  await page.getByRole('button', { name: '重新生成', exact: true }).click()
  await sceneReady()
  const first = await exportData()
  await page.getByRole('link', { name: '音乐大厅', exact: true }).click()
  await page.waitForURL(hall + '#hall')
  await expect(page.locator('.mw-hall-ready')).toBeVisible()
  await expect(page.locator('[data-portal="universe"]')).toHaveCount(1)
  await expect(page.locator('[data-testid="hall-universe-entry"]')).toBeVisible()
  await expect(page.getByRole('link', { name: '进入专辑宇宙', exact: true })).toBeVisible()
  await expect(page.locator('.mw-fog-transition')).toHaveCount(0, { timeout: 20000 })
  await page.screenshot({ path: path.join(output, 'music-world-hall-linked.png'), fullPage: true })
  await page.getByRole('link', { name: '进入专辑宇宙', exact: true }).click()
  await page.waitForURL(universe)
  await sceneReady()
  await expect(page.getByRole('textbox', { name: '星系 Seed', exact: true })).toHaveValue('HALL-VOYAGER-QA')
  await expect(page.locator('h1')).toHaveText('THE HALL CONNECTION')
  assert.deepEqual(await exportData(), first)
  checks.push('Live round-trip hall / universe preserves album, cover, tracks and exact seeded galaxy')

  // 三个房间入口改为应用内浮层：点击后不跳转，页面仍是专辑宇宙，浮层承担展示。
  for (const [room, title] of [['world', '音乐电台'], ['library', '我的曲库'], ['journey', '我的旅程']]) {
    await page.getByRole('button', { name: '展开音乐大厅入口', exact: true }).click()
    await page.getByRole('button', { name: '打开' + title, exact: true }).click()
    const panel = page.locator('.companion-rooms.is-open')
    await expect(panel).toBeVisible()
    await expect(panel.locator('.rooms-heading > strong')).toContainText(title)
    await expect(page.getByTestId('companion-room-' + room)).toBeVisible()
    await expect(page.locator('.galaxy-viewport')).toBeVisible()
    assert.equal(new URL(page.url()).origin, new URL(universe).origin, title + ' 浮层不应发生网页跳转')
    await page.getByRole('button', { name: '收起' + title, exact: true }).click()
    await expect(page.locator('.companion-rooms')).not.toHaveClass(/is-open/)
    await expect(page.locator('.mw-fog-transition')).toHaveCount(0)
    await page.getByRole('button', { name: '展开音乐大厅入口', exact: true }).click()
  }
  checks.push('All three doors open in-app floating panels without leaving the universe')

  await page.getByRole('button', { name: '编辑专辑', exact: true }).click()
  await page.getByRole('button', { name: '恢复示例', exact: true }).click()
  await page.getByRole('button', { name: '保存并生成', exact: true }).click()
  await page.getByRole('textbox', { name: '星系 Seed', exact: true }).fill('GLASS-2025')
  await page.getByRole('button', { name: '重新生成', exact: true }).click()
  await sceneReady()
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    const mobile = await page.locator('.galaxy-viewport').boundingBox()
    assert.deepEqual(mobile, { x: 0, y: 0, width, height: 844 })
    if (width === 390) await page.screenshot({ path: path.join(output, 'music-universe-hall-mobile.png'), fullPage: true })
  }
  await page.getByRole('link', { name: '音乐大厅', exact: true }).click()
  await expect(page.locator('.mw-hall-ready')).toBeVisible()
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    const header = await page.locator('.mw-hall-header').boundingBox()
    const brand = await page.locator('.mw-hall-brand').boundingBox()
    const entry = await page.locator('[data-testid="hall-universe-entry"]').boundingBox()
    assert.ok(brand.x >= header.x - 1 && brand.x + brand.width <= header.x + header.width + 1, 'Hall brand stays inside the mobile header')
    assert.ok(entry.x >= 0 && entry.x + entry.width <= width + 1, 'Hall universe entry stays inside the mobile viewport')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Hall page does not overflow horizontally')
  }
  checks.push('Both pages fit narrow screens and the single hall entry stays inside the mobile viewport')
  console.log(JSON.stringify({ checks, errors, failedResources }, null, 2))
  assert.deepEqual(errors, [])
  await writeFile(path.join(output, 'music-universe-hall-link-report.json'), JSON.stringify({ passed: true, checks, errors }, null, 2))
  console.log(JSON.stringify({ passed: true, checks, errors }, null, 2))
} catch (error) {
  await page.screenshot({ path: path.join(output, 'music-universe-hall-link-failure.png'), fullPage: true }).catch(() => {})
  await writeFile(path.join(output, 'music-universe-hall-link-report.json'), JSON.stringify({ passed: false, checks, errors, failedResources, failure: String(error) }, null, 2))
  throw error
} finally { await browser.close() }
