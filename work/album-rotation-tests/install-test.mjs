import { copyFile } from 'node:fs/promises'

const target = 'C:/path/to/music-universe/tests/rotation.test.ts'
await copyFile(new URL('./rotation.test.ts.txt', import.meta.url), target)
console.log('Installed rotation physics tests in the Music Universe app.')
