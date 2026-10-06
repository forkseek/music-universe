import fs from 'node:fs'
import path from 'node:path'
const file = path.join(process.argv[2], 'README.md')
let text = fs.readFileSync(file, 'utf8')
text = text.replace('| 双击 / 手机双击星球 | 选择目标并控制场景动画，显示相应的发光环 |', '| 双击 / 手机双击星球 | 播放该曲目并重新启用自动跟随，播放成功后平滑注视对应星球 |\n| L / 右下角跟随按钮 | 解除或恢复对当前歌曲星球的镜头跟随，保留音乐播放 |')
text = text.replace('| 手机双指开合 | 以双指中点为中心连续缩放，并抑制球体拖动与错误双击 |', '| 手机双指开合 | 默认围绕双指中点缩放；锁定歌曲时围绕该星球缩放，并抑制球体拖动与错误双击 |')
text = text.replace('选曲只更新曲目详情，保留缩放距离与镜头中心。', '单击查看曲目详情时保留当前镜头；播放歌曲时使用上述星球跟随机制。')
fs.writeFileSync(file, text)
console.log('README controls now describe continuous zoom and playback tracking consistently')
