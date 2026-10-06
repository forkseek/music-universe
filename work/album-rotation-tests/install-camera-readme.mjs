import { copyFile, readFile } from 'node:fs/promises'

const target = 'C:/path/to/music-universe/README.md'
const source = new URL('./README-camera.md.txt', import.meta.url)
await copyFile(source, target)
const content = await readFile(target, 'utf8')
const checks = ['space-motion-background.png', 'SpaceCameraController', '0.62', '26°–72°', 'albumRotationPhysics.ts', 'test:rotation', 'test:camera', '31 项', '正在进行']
if (!checks.every(check => content.includes(check))) throw new Error('README update verification failed')
if (content.includes('深蓝黑的程序化星云') || content.includes('星云共用模拟时间') || content.includes('单颗球体拖动限制为')) throw new Error('Stale README description remains')
console.log('Updated README only; background, camera controls, star physics, scripts, structure and pending validation are documented.')
