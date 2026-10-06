import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const target = String.raw`C:\path\to\music-universe`
copyFileSync(resolve('work/space-camera/tests/camera.mjs.txt'), resolve(target, 'tests/camera.mjs'))
const packagePath = resolve(target, 'package.json')
const data = JSON.parse(readFileSync(packagePath, 'utf8'))
data.scripts['test:camera'] = 'node tests/camera.mjs'
writeFileSync(packagePath, JSON.stringify(data, null, 2) + '\n')
console.log('Installed camera browser test and package script.')
