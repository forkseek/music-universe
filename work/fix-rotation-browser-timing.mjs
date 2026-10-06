import fs from 'node:fs'
const path = 'C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/tests/rotation.mjs'
let source = fs.readFileSync(path, 'utf8')
source = source.replace("  const pinchAfter = await state(mobile)", "  await expect(mobile.locator('canvas')).toHaveAttribute('data-star-dragging', 'false')\n  const pinchAfter = await state(mobile)")
fs.writeFileSync(path, source)
console.log('Touch completion waits for the scheduled demand-rendered frame.')
