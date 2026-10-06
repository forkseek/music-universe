import fs from 'node:fs'

const root = 'C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe'
const path = `${root}/src/App.tsx`
let source = fs.readFileSync(path, 'utf8')
const replacements = [
  ['disabled={selected.index === 0}', 'disabled={selected.index === 0 || navigation.view.transitioning}'],
  ['disabled={selected.index === galaxy.planets.length - 1}', 'disabled={selected.index === galaxy.planets.length - 1 || navigation.view.transitioning}'],
]
for (const [before, after] of replacements) {
  if (!source.includes(before)) throw new Error(`Missing transition control: ${before}`)
  source = source.replace(before, after)
}
fs.writeFileSync(path, source)
console.log('Track controls wait for camera arrival before another journey.')
