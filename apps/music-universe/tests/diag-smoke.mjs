// 临时冒烟测试：逐个触发主要交互，记录失败与报错。跑完删除。
import { chromium } from '@playwright/test'

const url = process.env.TEST_URL || 'http://127.0.0.1:5188/'
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.locator('.scene-loading').waitFor({ state: 'detached', timeout: 45000 })
await page.waitForTimeout(1000)

const hudVisible = () => page.evaluate(() => !document.querySelector('.app-shell')?.classList.contains('hud-hidden'))
const ensureHud = async () => { if (!(await hudVisible())) { await page.keyboard.press('h'); await page.waitForTimeout(400) } }
const closeDialogs = async () => {
  for (const sel of ['dialog.editor-dialog[open]', 'dialog.guide-dialog[open]']) {
    if (await page.locator(sel).count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(300) }
  }
  await ensureHud()
}
const check = async (label, fn) => {
  try { await closeDialogs(); const r = await fn(); console.log((r === true ? 'OK   ' : 'FAIL ') + label + (typeof r === 'string' ? ' :: ' + r : '')) }
  catch (e) { console.log('FAIL ' + label + ' :: ' + e.message.split('\n')[0]) }
}
const canvasData = (key) => page.evaluate((k) => document.querySelector('canvas')?.dataset[k], key)

await check('按 H 显示/隐藏工具', async () => {
  const a = await hudVisible(); await page.keyboard.press('h'); await page.waitForTimeout(300)
  const b = await hudVisible(); await page.keyboard.press('h'); await page.waitForTimeout(300)
  const c = await hudVisible()
  return a !== b && b !== c ? true : `${a} ${b} ${c}`
})
await check('使用指南', async () => {
  await page.locator('button[aria-label="使用指南"]').click(); await page.waitForTimeout(300)
  const open = await page.locator('dialog.guide-dialog[open]').count()
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  return open === 1 && (await page.locator('dialog.guide-dialog[open]').count()) === 0 ? true : `open=${open}`
})
await check('专辑工坊', async () => {
  await page.locator('button[aria-label="专辑工坊"]').click(); await page.waitForTimeout(300)
  const open = await page.locator('dialog.editor-dialog[open]').count()
  await page.locator('button[aria-label="关闭专辑编辑"]').click(); await page.waitForTimeout(300)
  return open === 1 && (await page.locator('dialog.editor-dialog[open]').count()) === 0 ? true : `open=${open}`
})
await check('曲目索引 + 点选曲目', async () => {
  await page.locator('button[aria-label="曲目索引"]').click(); await page.waitForTimeout(400)
  const n = await page.locator('.track-card').count()
  await page.locator('.track-card').first().click(); await page.waitForTimeout(600)
  const detail = await page.locator('.planet-detail').count()
  const metrics = await page.locator('[data-testid="planet-metrics"]').count()
  return n === 10 && detail === 1 && metrics === 1 ? true : `cards=${n} detail=${detail} metrics=${metrics}`
})
await check('画面品质菜单', async () => {
  await page.locator('.quality-trigger').click(); await page.waitForTimeout(250)
  const n = await page.locator('.quality-menu button').count()
  await page.locator('.quality-trigger').click(); await page.waitForTimeout(200)
  return n === 3 ? true : `options=${n}`
})
await check('旅伴面板', async () => {
  await page.locator('.companion-trigger').click(); await page.waitForTimeout(500)
  const n = await page.locator('.hall-panel').count()
  await page.locator('.companion-trigger').click(); await page.waitForTimeout(300)
  return n === 1 ? true : `panel=${n}`
})
await check('播放/暂停（按钮）', async () => {
  const before = await canvasData('playing')
  await page.locator('button[aria-label="暂停动画"], button[aria-label="继续动画"]').first().click(); await page.waitForTimeout(300)
  const after = await canvasData('playing')
  return before !== after ? true : `playing stayed ${after}`
})
await check('标签开关', async () => {
  const before = await page.locator('.planet-label').count()
  await page.locator('button[aria-label="标签"]').click(); await page.waitForTimeout(400)
  const after = await page.locator('.planet-label').count()
  await page.locator('button[aria-label="标签"]').click(); await page.waitForTimeout(200)
  return before !== after ? true : `labels ${before} -> ${after}`
})
await check('重置视角', async () => {
  await page.mouse.move(300, 700); await page.mouse.wheel(0, -300); await page.waitForTimeout(700)
  await page.locator('button[aria-label="重置视角"]').click(); await page.waitForTimeout(1200)
  const z = await canvasData('zoom')
  return Math.abs(z - 1) < 0.02 ? true : `zoom=${z}`
})
await check('随机生成 Seed', async () => {
  const before = await page.evaluate(() => document.querySelector('#seed-input')?.value)
  await page.locator('.random-button').click(); await page.waitForTimeout(700)
  const after = await page.evaluate(() => document.querySelector('#seed-input')?.value)
  return before !== after ? true : `seed unchanged ${after}`
})
await check('音乐搜索 打开/Esc 关闭', async () => {
  await page.locator('button[aria-label="音乐搜索"]').click(); await page.waitForTimeout(500)
  const open = await page.locator('.music-search-drawer').count()
  await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  return open === 1 && (await page.locator('.music-search-drawer').count()) === 0 ? true : `open=${open}`
})
await check('音乐搜索：关键词搜索', async () => {
  await page.locator('button[aria-label="音乐搜索"]').click(); await page.waitForTimeout(400)
  const input = page.locator('.music-search-drawer input').first()
  await input.fill('周杰伦'); await input.press('Enter'); await page.waitForTimeout(3000)
  const rows = await page.locator('.music-search-drawer li, .music-search-drawer .music-search-result').count()
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  return rows > 0 ? true : 'no results'
})
await check('自由镜头 R + 滚轮(FOV) + Esc 回正', async () => {
  await page.keyboard.press('r'); await page.waitForTimeout(400)
  const fov0 = +(await canvasData('cameraFov'))
  await page.mouse.move(800, 450); await page.mouse.wheel(0, -200); await page.waitForTimeout(600)
  const fov1 = +(await canvasData('cameraFov'))
  await page.keyboard.press('Escape'); await page.waitForTimeout(1000)
  const mode = await canvasData('cameraMode')
  return fov0 !== fov1 && mode === 'orbit' ? true : `fov ${fov0}->${fov1} mode=${mode}`
})
await check('空格 播放/暂停', async () => {
  const before = await canvasData('playing')
  await page.keyboard.press('Space'); await page.waitForTimeout(300)
  const after = await canvasData('playing')
  return before !== after ? true : `playing stayed ${after}`
})
await check('方向键切换曲目', async () => {
  const before = await canvasData('focusTarget')
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(600)
  const after = await canvasData('focusTarget')
  return before !== after ? true : `focus stayed ${after}`
})
await check('滚轮在曲目索引面板上是否误缩放场景', async () => {
  await page.locator('button[aria-label="曲目索引"]').click(); await page.waitForTimeout(400)
  const z0 = +(await canvasData('zoom'))
  const box = await page.locator('.track-index').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + 30)
  await page.mouse.wheel(0, -200); await page.waitForTimeout(700)
  const z1 = +(await canvasData('zoom'))
  await page.locator('button[aria-label="曲目索引"]').click(); await page.waitForTimeout(200)
  return Math.abs(z1 - z0) < 1e-6 ? true : `zoom changed ${z0} -> ${z1}`
})
await check('滚轮在音乐搜索抽屉上是否误缩放场景', async () => {
  await page.locator('button[aria-label="音乐搜索"]').click(); await page.waitForTimeout(400)
  const z0 = +(await canvasData('zoom'))
  const box = await page.locator('.music-search-drawer').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -200); await page.waitForTimeout(700)
  const z1 = +(await canvasData('zoom'))
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  return Math.abs(z1 - z0) < 1e-6 ? true : `zoom changed ${z0} -> ${z1}`
})

console.log('--- console errors: ' + errors.length + ' ---')
for (const e of errors.slice(0, 30)) console.log('  ' + e)
await browser.close()
