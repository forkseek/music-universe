import { readFileSync, writeFileSync } from 'node:fs'
const file = 'C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/tests/browser.mjs'
const source = readFileSync(file, 'utf8')
const updated = source.replace('width: 1600, height: 1000', 'width: 1600, height: 1100')
writeFileSync(file, updated)
