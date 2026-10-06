import fs from 'node:fs'
import path from 'node:path'
const root = process.argv[2]
fs.copyFileSync(path.join(import.meta.dirname, 'axis-lighting.mjs'), path.join(root, 'tests/axis-lighting.mjs'))
const packagePath = path.join(root, 'package.json'), backup = path.join(import.meta.dirname, 'before/package.json')
fs.copyFileSync(packagePath, backup)
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
pkg.scripts['test:axis-lighting'] = 'node tests/axis-lighting.mjs'
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n')
console.log('Prepared browser colour-transition and axis-follow regression')
