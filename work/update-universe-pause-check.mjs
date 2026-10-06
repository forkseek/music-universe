import { readFileSync, writeFileSync } from 'node:fs'
const file = 'C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/tests/browser.mjs'
const source = readFileSync(file, 'utf8')
const previous = `  // Let framing settle after full-page capture before comparing frozen frames.
  await page.waitForTimeout(350)
  const pausedA = await page.locator('[data-testid="galaxy-viewport"]').screenshot()
  const pausedB = await page.locator('[data-testid="galaxy-viewport"]').screenshot()
  assert.equal(Buffer.compare(pausedA, pausedB), 0)`
const next = `  // Canvas framing and GPU rendering may finish after the full-page capture.
  // Require identical frozen frames, allowing the asynchronous render to settle.
  let pausedA
  await expect.poll(async () => {
    pausedA = await page.locator('[data-testid="galaxy-viewport"]').screenshot()
    await page.waitForTimeout(150)
    const pausedB = await page.locator('[data-testid="galaxy-viewport"]').screenshot()
    return Buffer.compare(pausedA, pausedB)
  }, { timeout: 10000 }).toBe(0)`
if (!source.includes(previous)) throw new Error('Expected pause check missing')
writeFileSync(file, source.replace(previous, next).replace('Buffer.compare(pausedB, moving)', 'Buffer.compare(pausedA, moving)'))
