import fs from 'node:fs'
import path from 'node:path'
const root = process.argv[2]
fs.copyFileSync(path.join(import.meta.dirname, 'playbackFailure.test.ts'), path.join(root, 'tests/playbackFailure.test.ts'))
const source = fs.readFileSync(path.join(import.meta.dirname, 'probe.mjs'), 'utf8')
fs.writeFileSync(path.join(import.meta.dirname, 'after-probe.mjs'), source.replaceAll('/before', '/after'))
console.log('Prepared browser and media failure regression checks')
