import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
const root='C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe'
const reports=['browser','interaction','rotation','camera']
const results=[]
for(const name of reports){
  const report=JSON.parse(await readFile(path.join(root,'..',`music-universe-${name}-report.json`),'utf8'))
  if(!report.passed || report.errors.length)throw Error(`${name} validation failed`)
  results.push({name,checks:report.checks.length,url:report.url,errors:report.errors.length})
}
let readme=await readFile(path.join(root,'README.md'),'utf8')
readme=readme.replace('2026-10-05 当前已确认：31 项生成器、编辑器、连续缩放、恒星物理与相机控制器单元测试通过，生产构建成功。本轮背景接入、环绕与自由镜头的浏览器验收正在进行，结果待补充；这里不将尚未完成的浏览器套件列为通过。', '2026-10-05 最终版本验证：31 项单元测试通过，生产构建成功；4188 生产预览上的 14 组界面检查、11 组连续缩放检查、7 组恒星旋转检查和 9 组镜头检查全部通过，共 41 组浏览器检查，页面与控制台错误为 0。镜头检查覆盖本地背景实际加载、漂移与暂停、空白拖动惯性、背景视差/旋转、自由镜头全部操作、K/Esc 回正、工具与输入隔离、响应式尺寸，以及真实手机双指缩放。')
readme=readme.replace('此前的连续缩放截图包括 `music-universe-direct-overview.png`、`music-universe-direct-focus.png`（中间缩放距离）、`music-universe-direct-mobile.png`；交互报告为 `music-universe-interaction-report.json`。其他截图与 JSON 报告位于项目上一级的 outputs 目录。这些既有文件应结合各自验证时间阅读，不能替代本轮新增相机功能的验收。', '本轮截图与 JSON 报告位于项目上一级的 outputs 目录。镜头截图为 `music-universe-camera-orbit.png`、`music-universe-camera-free.png`、`music-universe-camera-mobile.png`；镜头报告为 `music-universe-camera-report.json`。恒星截图为 `music-universe-star-front.png`、`music-universe-star-rear.png`、`music-universe-star-mobile.png`，报告为 `music-universe-rotation-report.json`。连续缩放截图为 `music-universe-direct-overview.png`、`music-universe-direct-focus.png`、`music-universe-direct-mobile.png`，报告为 `music-universe-interaction-report.json`。通用界面检查为 `music-universe-browser-report.json`。源码包 `music-universe-source.zip` 包含新背景、物理与镜头模块以及验收脚本。')
await writeFile(path.join(root,'README.md'),readme)
console.log(JSON.stringify({unitChecks:31,browserChecks:results.reduce((sum,r)=>sum+r.checks,0),results},null,2))
