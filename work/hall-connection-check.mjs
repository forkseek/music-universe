import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const universe = 'http://127.0.0.1:5188/'
const hall = 'http://127.0.0.1:3002/'
const output = 'C:/path/to/universe-workspace'
const candidate = chromium.executablePath()
const browser = await chromium.launch({ headless: true, executablePath: existsSync(candidate) ? candidate : 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 })
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
  await expect(page.locator('.hall-door')).toHaveCount(3)
  await expect(page.getByRole('link', { name: '音乐大厅', exact: true })).toHaveAttribute('href', hall + '#hall')
  const bounds = await page.locator('.galaxy-viewport').boundingBox()
  assert.ok(Math.abs(bounds.width / bounds.height - 16 / 9) < .005)
  checks.push('Shared hall companion, three warm-gold doors and unchanged 16:9 composition')

  await page.getByRole('link', { name: '前往我的曲库', exact: true }).hover()
  await expect(page.getByRole('tooltip')).toContainText('我的曲库')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  checks.push('Cream cloud hint supports hover and Escape dismissal')
  await page.mouse.move(1, 1)
  await page.getByRole('button', { name: '暂停动画', exact: true }).click()
  await page.waitForTimeout(600)
  const pausedA = await page.locator('.galaxy-viewport').screenshot()
  await page.waitForTimeout(300)
  const pausedB = await page.locator('.galaxy-viewport').screenshot()
  assert.equal(Buffer.compare(pausedA, pausedB), 0)
  await page.screenshot({ path: path.join(output, 'music-universe-hall-linked.png'), fullPage: true })
  await page.locator('.galaxy-viewport').screenshot({ path: path.join(output, 'music-universe-hall-galaxy.png') })
  checks.push('Updated pilot, portal and planets remain frozen when animation pauses')

  await page.getByRole('textbox', { name: '星系 Seed', exact: true }).fill('HALL-VOYAGER-QA')
  await page.getByRole('button', { name: '重新生成', exact: true }).click()
  await page.getByRole('button', { name: '编辑专辑', exact: true }).click()
  await page.getByLabel('专辑名称', { exact: true }).fill('THE HALL CONNECTION')
  await page.getByRole('button', { name: '保存并生成', exact: true }).click()
  await sceneReady()
  const first = await exportData()
  await page.getByRole('link', { name: '音乐大厅', exact: true }).click()
  await page.waitForURL(hall + '#hall')
  await expect(page.locator('.mw-hall-ready')).toBeVisible()
  await expect(page.locator('[data-portal]')).toHaveCount(7)
  await expect(page.getByRole('link', { name: '进入专辑星系', exact: true })).toBeVisible()
  await expect(page.locator('.mw-fog-transition')).toHaveCount(0, { timeout: 20000 })
  await page.screenshot({ path: path.join(output, 'music-world-hall-linked.png'), fullPage: true })
  await page.getByRole('link', { name: '进入专辑星系', exact: true }).click()
  await page.waitForURL(universe)
  await sceneReady()
  await expect(page.getByRole('textbox', { name: '星系 Seed', exact: true })).toHaveValue('HALL-VOYAGER-QA')
  await expect(page.locator('h1')).toHaveText('THE HALL CONNECTION')
  assert.deepEqual(await exportData(), first)
  checks.push('Live round-trip hall / universe preserves album, cover, tracks and exact seeded galaxy')

  for (const [room, title] of [['world', '音乐电台'], ['library', '我的曲库'], ['journey', '我的旅程']]) {
    await page.getByRole('link', { name: '前往' + title, exact: true }).click()
    await page.waitForURL(hall + '#' + room)
    await expect(page.locator('.mw-portal-app')).toHaveAttribute('data-module', room)
    await expect(page.locator('.mw-module-current strong')).toHaveText(title)
    await page.getByRole('button', { name: '回到音乐大厅', exact: true }).click()
    await expect(page.locator('.mw-hall-ready')).toBeVisible()
    await expect(page.locator('.mw-fog-transition')).toHaveCount(0, { timeout: 20000 })
    await page.getByRole('link', { name: '进入专辑星系', exact: true }).click()
    await page.waitForURL(universe)
    await sceneReady()
  }
  checks.push('All three doors reach the actual Music World room and return through the hall')

  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    const mobile = await page.locator('.galaxy-viewport').boundingBox()
    assert.ok(Math.abs(mobile.width / mobile.height - 16 / 9) < .005)
    if (width === 390) await page.screenshot({ path: path.join(output, 'music-universe-hall-mobile.png'), fullPage: true })
  }
  await page.getByRole('link', { name: '音乐大厅', exact: true }).click()
  await expect(page.locator('.mw-hall-ready')).toBeVisible()
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    const header = await page.locator('.mw-hall-header').boundingBox()
    const entry = await page.getByRole('link', { name: '进入专辑星系', exact: true }).boundingBox()
    const replay = await page.getByRole('button', { name: '重新唤醒', exact: false }).boundingBox()
    assert.ok(entry.x >= header.x && replay.x + replay.width <= header.x + header.width + 1, 'Hall actions stay within mobile header')
    assert.ok(entry.x + entry.width < replay.x, 'Hall buttons do not overlap')
  }
  checks.push('Both pages fit narrow screens and hall entry buttons remain separate')
  console.log(JSON.stringify({ checks, errors, failedResources }, null, 2))
  assert.deepEqual(errors, [])
  await writeFile(path.join(output, 'music-universe-hall-link-report.json'), JSON.stringify({ passed: true, checks, errors }, null, 2))
  console.log(JSON.stringify({ passed: true, checks, errors }, null, 2))
} catch (error) {
  await page.screenshot({ path: path.join(output, 'music-universe-hall-link-failure.png'), fullPage: true }).catch(() => {})
  await writeFile(path.join(output, 'music-universe-hall-link-report.json'), JSON.stringify({ passed: false, checks, errors, failedResources, failure: String(error) }, null, 2))
  throw error
} finally { await browser.close() }
