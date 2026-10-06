import fs from 'node:fs'
import path from 'node:path'
const file = path.join(process.argv[2], 'src/App.tsx')
let code = fs.readFileSync(file, 'utf8')
const shortcut = "      if (event.code === 'KeyL' && audio.track) { event.preventDefault(); toggleFollow(); return }\n"
if (!code.includes(shortcut)) throw new Error('Follow shortcut not found')
code = code.replace(shortcut, '').replace("      if (element?.closest('button,a')) return", shortcut + "      if (element?.closest('button,a')) return")
fs.writeFileSync(file, code)
console.log('Follow shortcut also works after clicking the follow control')
