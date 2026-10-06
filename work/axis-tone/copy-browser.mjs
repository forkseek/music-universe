import fs from 'node:fs'
import path from 'node:path'
const root = process.argv[2]
fs.copyFileSync(path.join(import.meta.dirname, 'axis-lighting.mjs'), path.join(root, 'tests/axis-lighting.mjs'))
