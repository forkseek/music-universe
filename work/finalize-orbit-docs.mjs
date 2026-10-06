import fs from 'node:fs'

const root = 'C:/path/to/music-universe'
const path = `${root}/README.md`
let source = fs.readFileSync(path, 'utf8')
source = source.replace('点选星球可查看曲目详情，并切换上一首 / 下一首。', '显示工具后点选星球可查看曲目详情，并切换上一首 / 下一首。')
source = source.replace('抵达期间忽略同一轮触控板的剩余滚动，避免镜头刚靠近又被拉走。', '抵达期间忽略同一轮触控板的剩余滚动，避免镜头刚靠近又被拉走；详情中的上一首 / 下一首在镜头抵达后恢复可用。')
source = source.replace('直接交互报告为 music-universe-interaction-report.json，手机验收', '9 组直接交互检查也在 4188 生产预览中全部通过，报告为 music-universe-interaction-report.json；手机验收')
fs.writeFileSync(path, source)
console.log('Updated verified operation guide and production validation.')
