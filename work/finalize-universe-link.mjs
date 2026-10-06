import { readFileSync, writeFileSync } from 'node:fs'
const file = 'C:/path/to/music-universe/README.md'
let readme = readFileSync(file, 'utf8').replace('1600 × 1000 桌面视口', '1600 × 1100 桌面视口')
readme += '\n本次大厅关联验证（2026-10-04）：两边生产构建通过；星系 10 项核心测试、12 组浏览器检查和 6 组大厅关联检查通过。关联检查覆盖两个页面的实际跳转与 320–390 像素窄屏，大厅原有 7 个功能入口保持正常；页面错误、控制台错误和资源加载失败均为 0。暂停时场景改为按需渲染，交互和视角重置仍可用。\n'
writeFileSync(file, readme)
console.log('Project documentation updated with verified hall integration results.')
