import fs from 'node:fs'
import path from 'node:path'
const root = process.argv[2]
for (const file of ['axisFollow.test.ts', 'albumLighting.test.ts']) fs.copyFileSync(path.join(import.meta.dirname, file), path.join(root, 'tests', file))
console.log('Installed axis and lighting regression tests')
