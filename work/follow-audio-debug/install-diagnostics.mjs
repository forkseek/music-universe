import fs from 'node:fs'
import path from 'node:path'
const root = process.argv[2]
fs.copyFileSync(path.join(import.meta.dirname, 'liveDiagnostics.ts'), path.join(root, 'src/liveDiagnostics.ts'))
const file = path.join(root, 'src/App.tsx')
const source = fs.readFileSync(file, 'utf8')
if (!source.includes("import './liveDiagnostics'")) fs.writeFileSync(file, "import './liveDiagnostics'\n" + source)
console.log('Installed temporary diagnostics without restarting the audio element')
