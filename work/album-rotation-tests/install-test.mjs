import { copyFile } from 'node:fs/promises'

const target = 'C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/tests/rotation.test.ts'
await copyFile(new URL('./rotation.test.ts.txt', import.meta.url), target)
console.log('Installed rotation physics tests in the Music Universe app.')
