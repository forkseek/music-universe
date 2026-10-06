import fs from 'node:fs/promises'
const app = 'C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe'
const packageFile = app + '/package.json'
const pkg = JSON.parse(await fs.readFile(packageFile,'utf8'))
pkg.scripts['test:interactions'] = 'node tests/interactions.mjs'
await fs.writeFile(packageFile,JSON.stringify(pkg,null,2)+'\n')
const file = app + '/README.md'
let readme = await fs.readFile(file,'utf8')
readme = readme.replace('3D 场景铺满浏览器窗口，导航、专辑信息与工具浮在画面上。', '3D 场景铺满浏览器窗口，默认采用与 5173 页面相同的纯场景交互；按 H 显示导航、专辑编辑与 Seed 工具。')
readme = readme.replace('- 36° 透视镜头随窗口尺寸计算距离。受限的拖动、滚轮缩放和轻微指针视差展现立体关系，曲目保持从左到右的顺序；重置视角回到初始构图。', '- 36° 透视镜头随窗口尺寸计算距离。滚轮在总览与近景之间切换，指向星球向上滚动可平滑靠近；近景拖动只改变球体朝向。重置视角返回完整横向星系。')
readme = readme.replace('- 点击右上角「沉浸模式」或按 H 隐藏工具与标签；点击「显示界面」或再按 H 恢复。隐藏工具设为 inert，不能被键盘误聚焦。Esc 收起浮层。', '- 默认隐藏工具与标签。按 H 或点击右下角工具按钮显示；再按 H 或点击「沉浸模式」隐藏。隐藏工具设为 inert。纯场景下 Esc 返回音乐大厅；编辑器与工具浮层优先处理关闭操作。')
readme = readme.replace('页面 JS 约 227.24 kB（gzip 73.38 kB），3D 模块约 1092.51 kB（gzip 297.63 kB）', '页面与 3D 渲染器分为独立模块；具体大小见构建输出')
readme = readme.replace('默认最多 20 首时水平旋转范围 ±0.12 弧度，垂直倾角 ±0.055 弧度；超过 20 首时进一步限制镜头。相机距离限制在初始距离的 0.94–1.13 倍，禁止平移。', '镜头使用独立 CameraDirector 平滑靠近与退回，不再通过拖动旋转整个星系。单颗球体拖动限制为水平 ±0.75、垂直 ±0.20 弧度。缩放倍率限制在 0.82–2.8，总览进入与退出阈值分别为 1.72 / 1.42，避免触控板在边界反复切换。')
readme = readme.replace('│   │   ├── GalaxyScene.tsx             # 透视镜头、灯光、星球、飞船与投影标签', '│   │   ├── GalaxyScene.tsx             # 灯光、星球、飞船与投影标签\n│   │   ├── SceneInteraction.tsx         # 镜头导演、球体拖动、双击与光环')
readme = readme.replace('│   ├── lib/', '│   ├── hooks/useGalaxyNavigation.ts   # 原生滚轮、双指缩放与视图状态\n│   ├── lib/')
readme = readme.replace('│   │   ├── sceneFraming.ts             # 视口到透视镜头的计算、品质类型', '│   │   ├── sceneFraming.ts             # 视口到透视镜头的计算、品质类型\n│   │   ├── galaxyNavigation.ts         # 缩放阈值、视图规则与本次事件命中')
readme = readme.replace('│   └── hall-connection.mjs             # 双向导航、状态恢复与三个房间', '│   ├── interactions.mjs               # 滚轮、球体拖动、键盘与真实手机触控\n│   ├── navigation.test.ts             # 模式滞回与异常滚轮输入\n│   └── hall-connection.mjs             # 双向导航、状态恢复与三个房间')
readme = readme.replace('npm run test:e2e\n# 两边都运行时', 'npm run test:e2e\nnpm run test:interactions\n# 两边都运行时')
readme = readme.replace('10 项算法与编辑器测试、14 组浏览器检查、6 组大厅关联检查通过', '12 项算法、编辑器与导航测试，14 组浏览器检查，9 组直接交互检查，6 组大厅关联检查通过')
readme = readme.replace('受限镜头、冻结帧', '总览与近景、独立球体旋转、冻结帧')
const section = `
## 复刻 5173 的操作方式

参考页面：[ORBIT 全屏交互](http://127.0.0.1:5173/)。已实际验证该页面的滚轮、拖动、双击与键盘行为，再移植到当前专辑星系。

| 操作 | 当前页面行为 |
| --- | --- |
| 指向星球，滚轮向上 | 以本次射线命中的星球为目标，平滑靠近；支持专辑恒星和歌曲星球 |
| 滚轮向下 | 拉远，越过阈值后回到完整星系总览 |
| 近景拖动星球 | 只转动球体表面，其他星球的模板位置保持不变 |
| 双击 / 手机双击星球 | 选择该目标并控制场景动画，显示相应的发光环 |
| 空格 | 播放 / 暂停场景动画 |
| 左 / 右方向键 | 按曲序切换，首尾循环；镜头在暂停状态下仍可移动 |
| 手机双指开合 | 靠近 / 拉远；与双击、球体拖动分别处理 |
| H / 右下角工具按钮 | 显示或隐藏专辑工坊、Seed、曲目索引与画面品质工具 |
| Esc | 先关闭编辑器或浮层；纯场景下返回音乐大厅 |

默认双击与空格控制场景动画，专辑尚未关联歌曲音频。相机状态、球体拖动角度与动画状态不写入 generateAlbumGalaxy 的输出；Seed、曲序与 JSON 复现保持独立。

滚轮命中按每次事件重新射线检测，离开星球后不会使用旧悬停目标。抵达期间忽略同一轮触控板的剩余滚动，避免镜头刚靠近又被拉走。双击时短暂停稳镜头；拖动超过阈值不会被当作点击。输入框、编辑器与普通按钮保留原生键盘操作。

新增截图：music-universe-direct-overview.png、music-universe-direct-focus.png、music-universe-direct-mobile.png。直接交互报告为 music-universe-interaction-report.json，手机验收通过 Chromium 的真实触控输入验证双击与双指缩放。
`
readme = readme.replace('## 示例资源来源', section+'\n## 示例资源来源')
await fs.writeFile(file,readme)
console.log('Documented reference interaction mapping, gesture boundaries and keyboard controls.')
