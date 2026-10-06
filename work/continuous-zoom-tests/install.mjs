import { copyFile } from 'node:fs/promises'
import path from 'node:path'

const source = path.resolve('work/continuous-zoom-tests')
const target = 'C:/path/to/music-universe'
for (const filename of ['navigation.test.ts', 'interactions.mjs']) {
  await copyFile(path.join(source, `${filename}.txt`), path.join(target, 'tests', filename))
}
console.log('Installed continuous-zoom navigation and interaction checks')
