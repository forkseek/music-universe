import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
const target = String.raw`C:\path\to\music-universe`
for (const relative of ['src/lib/spaceCamera.ts', 'tests/spaceCamera.test.ts']) {
  const destination = resolve(target, relative)
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(resolve('work/space-camera', relative + '.txt'), destination)
}
console.log('Installed camera controller and its unit tests.')
