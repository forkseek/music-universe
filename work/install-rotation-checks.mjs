import fs from 'node:fs'
const root = 'C:/path/to/music-universe'
fs.copyFileSync('work/album-rotation/rotation.mjs.txt', `${root}/tests/rotation.mjs`)
const path = `${root}/package.json`
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'))
pkg.scripts['test:rotation'] = 'node tests/rotation.mjs'
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n')
const physicsPath = `${root}/src/lib/albumRotationPhysics.ts`
const physics = fs.readFileSync(physicsPath, 'utf8').replace('const delta = Math.min(seconds, 60)', 'const delta = seconds')
fs.writeFileSync(physicsPath, physics)
console.log('Installed browser feature checks and frame-independent analytical physics.')
