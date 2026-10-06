import { chromium, expect } from '@playwright/test'
const output = 'C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs'
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror',error => errors.push(error.message))
page.on('console',message => { if (message.type() === 'error') errors.push(message.text()) })
const read = () => page.locator('canvas').evaluate(element => ({ ...element.dataset }))
async function settle() { await expect.poll(async () => (await read()).cameraMoving,{ timeout:10000 }).toBe('false') }
async function target(id) { return JSON.parse((await read()).projectedTargets).find(item => item.id === id) }
try {
  await page.goto('http://127.0.0.1:5188/', { waitUntil:'networkidle' })
  await page.locator('.scene-loading').waitFor({ state:'detached' })
  await settle()
  const initial = await read()
  await page.screenshot({ path:output + '/music-universe-direct-overview.png' })
  const point = JSON.parse(initial.projectedTargets)[3]
  await page.mouse.move(point.x,point.y)
  await page.mouse.wheel(0,-500)
  await expect.poll(async () => (await read()).viewMode).toBe('focus')
  await settle()
  const focused = await read()
  await page.screenshot({ path:output + '/music-universe-direct-focus.png' })
  const close = await target(point.id)
  await page.mouse.move(close.x,close.y)
  await page.mouse.down()
  await page.mouse.move(close.x+150,close.y+30,{steps:10})
  await page.mouse.up()
  const dragged = await read()
  await page.mouse.dblclick(close.x,close.y,{ delay:100 })
  await page.waitForTimeout(200)
  const doubleA = await read()
  await page.mouse.dblclick(close.x,close.y,{ delay:100 })
  await page.waitForTimeout(600)
  const doubleB = await read()
  await page.keyboard.press('ArrowRight')
  await settle()
  const skipped = await read()
  await page.mouse.move(800,700)
  for(let i=0;i<4;i++) { await page.mouse.wheel(0,500); await page.waitForTimeout(150) }
  await settle()
  const returned = await read()
  console.log(JSON.stringify({errors,initial,focused,dragged,doubleA,doubleB,skipped,returned},null,2))
} finally { await browser.close() }
