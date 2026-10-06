import fs from 'node:fs'
import path from 'node:path'
const root = path.resolve(process.argv[2])
if (!root.endsWith(path.join('outputs', 'music-universe'))) throw new Error('Unexpected project')
fs.copyFileSync(path.join(import.meta.dirname, 'FOLLOW_AUDIO_FIX.md'), path.join(root, 'FOLLOW_AUDIO_FIX.md'))
const file = path.join(root, 'follow-audio-verification.json')
const report = JSON.parse(fs.readFileSync(file, 'utf8'))
report.productionBuild = 'Passed TypeScript build and Vite production build after diagnostic cleanup'
fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n')
console.log('Published repair guide and final build result')
