import { readFileSync, writeFileSync } from 'node:fs'
const file = 'C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/tests/browser.mjs'
const source = readFileSync(file, 'utf8')
const marker = '  const pausedA = await page.locator(\'[data-testid="galaxy-viewport"]\').screenshot()'
if (!source.includes(marker)) throw new Error('Expected pause assertion missing')
writeFileSync(file, source.replace(marker, '  // Let framing settle after full-page capture before comparing frozen frames.\n  await page.waitForTimeout(350)\n' + marker))
