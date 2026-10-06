import fs from 'node:fs'
const output = 'C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs'
const interfaceReport = JSON.parse(fs.readFileSync(`${output}/music-universe-browser-report.json`, 'utf8'))
const zoomReport = JSON.parse(fs.readFileSync(`${output}/music-universe-interaction-report.json`, 'utf8'))
if (!interfaceReport.passed || !zoomReport.passed || zoomReport.url !== 'http://127.0.0.1:4188/' || interfaceReport.errors.length || zoomReport.errors.length) throw new Error('Validation incomplete.')
const path = `${output}/music-universe/README.md`
let guide = fs.readFileSync(path, 'utf8')
guide = guide.replace(/^2026-10-04 验证结果：.*$/m, `2026-10-05 连续缩放验证：14 项生成器、编辑器与导航单元测试，${interfaceReport.checks.length} 组界面检查，${zoomReport.checks.length} 组连续缩放浏览器检查通过；生产构建成功。连续缩放检查在 4188 生产预览运行，覆盖指针锚点、小幅与快速滚动、途中反向、距离边界、完整场景与标签保留、暂停时按需渲染，以及真实手机双指开合与取消手势。页面与控制台错误均为 0。大厅关联的 6 组检查已于 2026-10-04 通过，本次保留大厅入口和专辑状态恢复。`)
guide = guide.replace('截图与 JSON 报告位于项目上一级的 outputs 目录：', '连续缩放截图为 music-universe-direct-overview.png、music-universe-direct-focus.png（中间缩放距离）、music-universe-direct-mobile.png；交互报告为 music-universe-interaction-report.json。其他截图与 JSON 报告位于项目上一级的 outputs 目录：')
fs.writeFileSync(path, guide)
console.log(JSON.stringify({ units: 14, interfaceChecks: interfaceReport.checks.length, continuousChecks: zoomReport.checks.length, production: zoomReport.url, errors: zoomReport.errors.length }))
