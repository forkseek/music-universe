import { readFileSync, writeFileSync } from 'node:fs'
const file = 'C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/src/components/GalaxyScene.tsx'
const source = readFileSync(file, 'utf8')
const before = '    <Canvas orthographic camera='
if (!source.includes(before)) throw new Error('Expected Canvas missing')
writeFileSync(file, source.replace(before, '    <Canvas frameloop={props.playing ? \'always\' : \'demand\'} orthographic camera='))
console.log('Paused scenes render on interaction only; animation clock stays frozen.')
