import fs from 'node:fs'
import path from 'node:path'
const root = process.argv[2]
const file = path.join(root, 'src/components/SceneInteraction.tsx')
let code = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n')
code = code.replace(' * 播放歌曲后的「主视角跟随」：每帧把相机中心贴到该星球当前的场景位置上，\n * 于是相机绕着它转，其余天体从画面中掠过。仅在播放中运行，暂停即冻结。', ' * 把当前歌曲星球的真实世界坐标交给镜头：包括公转、星系旋转和 Z 深度。\n * 镜头锁定与动画暂停相互独立；只有用户解除时才停止注视该星球。')
code = code.replace('point.distanceToSquared(new Vector3(...previous.position)) > 1e-12', 'Math.hypot(point.x - previous.position[0], point.y - previous.position[1], point.z - previous.position[2]) > 1e-6')
fs.writeFileSync(file, code)
fs.copyFileSync(path.join(import.meta.dirname, 'tracking.test.ts'), path.join(root, 'tests/playbackFollow.test.ts'))
console.log('Updated tracking comments and installed moving-camera behavior tests')
