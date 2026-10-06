import fs from 'node:fs'
import path from 'node:path'
const root = process.argv[2]
fs.copyFileSync(path.join(import.meta.dirname, 'axis-lighting.mjs'), path.join(root, 'tests/axis-lighting.mjs'))
// Existing render regression now allows the larger, intentional radial-follow displacement.
const file = path.join(root, 'tests/follow-rendering.mjs')
let source = fs.readFileSync(file, 'utf8')
const backup = path.join(import.meta.dirname, 'before/tests/follow-rendering.mjs')
fs.mkdirSync(path.dirname(backup), { recursive: true })
if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
source = source.replace("  console.log('Started local audio and Follow Mode at device pixel ratio 2')", "  await expect(page.locator('canvas')).toHaveAttribute('data-camera-axis-locked', 'true', { timeout: 15000 })\n  console.log('Started local audio and Follow Mode at device pixel ratio 2')")
source = source.replace('expect(maxCameraStep).toBeLessThan(.5);', 'expect(maxCameraStep).toBeLessThan(4);')
fs.writeFileSync(file, source)
const app = path.join(root, 'src/App.tsx')
source = fs.readFileSync(app, 'utf8')
const oldHint = '播放后镜头会平滑跟随歌曲星球，始终注视它；滚轮缩放和拖动环绕仍可使用。'
const newHint = '播放后镜头会平滑移动到歌曲星球外侧，与星球、恒星保持同一直线并注视星球；滚轮可调整距离。解除跟随后可拖动空白处自由环绕。'
if (!source.includes(oldHint)) throw new Error('Guide text changed')
fs.copyFileSync(app, path.join(import.meta.dirname, 'before/src/App.tsx'))
fs.writeFileSync(app, source.replace(oldHint, newHint))
console.log('Updated browser assertions and the existing follow instructions')
