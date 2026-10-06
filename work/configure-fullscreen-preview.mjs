import fs from 'node:fs/promises'
const app = 'C:/path/to/music-universe'
const file = app + '/package.json'
const pkg = JSON.parse(await fs.readFile(file, 'utf8'))
pkg.scripts.preview = 'vite preview --host 127.0.0.1 --port 4188 --strictPort'
await fs.writeFile(file, JSON.stringify(pkg, null, 2) + '\n')
console.log('Production preview uses the available dedicated port 4188.')
