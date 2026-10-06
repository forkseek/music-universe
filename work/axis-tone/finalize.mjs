import fs from 'node:fs'
import path from 'node:path'
const root = process.argv[2]
const file = path.join(root, 'src/components/GalaxyScene.tsx')
let code = fs.readFileSync(file, 'utf8')
const before = '  useEffect(() => () => { surface.dispose(); atmosphere.dispose(); glow.dispose() }, [surface, atmosphere, glow])'
if (!code.includes(before)) throw new Error('Album material cleanup changed')
code = code.replace(before, '  useEffect(() => () => surface.dispose(), [surface])\n  useEffect(() => () => { atmosphere.dispose(); glow.dispose() }, [atmosphere, glow])')
fs.writeFileSync(file, code)
fs.copyFileSync(path.join(import.meta.dirname, 'AXIS_LIGHTING.md'), path.join(root, 'AXIS_LIGHTING.md'))
console.log('Preserved the light materials across automatic cover changes; published implementation guide')
