import { copyFile } from 'node:fs/promises'
import path from 'node:path'

const source = path.resolve('work/continuous-zoom-tests')
const target = 'C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe'
for (const filename of ['navigation.test.ts', 'interactions.mjs']) {
  await copyFile(path.join(source, `${filename}.txt`), path.join(target, 'tests', filename))
}
console.log('Installed continuous-zoom navigation and interaction checks')
