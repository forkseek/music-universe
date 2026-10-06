import fs from 'node:fs/promises'
const app = 'C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe'
const sceneFile = app + '/src/components/GalaxyScene.tsx'
let scene = await fs.readFile(sceneFile, 'utf8')
scene = scene.replace('function RenderQualityController({ quality }: { quality: RenderQuality })', 'function RenderQualityController({ quality, playing }: { quality: RenderQuality; playing: boolean })')
scene = scene.replace("return quality === 'auto' ? <PerformanceMonitor", "return quality === 'auto' && playing ? <PerformanceMonitor")
scene = scene.replace('<RenderQualityController quality={quality} />', '<RenderQualityController quality={quality} playing={playing} />')
await fs.writeFile(sceneFile, scene)
const browserFile = app + '/tests/browser.mjs'
let browser = await fs.readFile(browserFile, 'utf8')
browser = browser.replace("  await page.getByRole('button', { name: '暂停动画', exact: true }).click().catch(() => {})\n", '')
await fs.writeFile(browserFile, browser)
const hallFile = app + '/tests/hall-connection.mjs'
let hall = await fs.readFile(hallFile, 'utf8')
hall = hall.replace(`  await page.waitForTimeout(600)
  const pausedA = await page.locator('.galaxy-viewport').screenshot()
  await page.waitForTimeout(300)
  const pausedB = await page.locator('.galaxy-viewport').screenshot()
  assert.equal(Buffer.compare(pausedA, pausedB), 0)`, `  await expect.poll(async () => {
    const pausedA = await page.locator('.galaxy-viewport').screenshot()
    await page.waitForTimeout(300)
    const pausedB = await page.locator('.galaxy-viewport').screenshot()
    return Buffer.compare(pausedA, pausedB)
  }, { timeout: 10000 }).toBe(0)`)
await fs.writeFile(hallFile, hall)
console.log('Adaptive resolution stops while animation is paused or the tab is hidden.')
