import fs from 'node:fs'
const root = 'C:/path/to/music-universe'
const app = `${root}/src/App.tsx`
let source = fs.readFileSync(app, 'utf8')
source = source.replace('在总览中指向星球向上滚动，镜头会平滑靠近它。近景拖动只旋转球体；向下滚动回到总览。手机支持双击和双指缩放。', '滚轮或双指开合连续放大缩小，镜头平滑追随操作，可随时停下或反向。指针所在位置是缩放中心，拖动星球只旋转球体。')
fs.writeFileSync(app, source)

const readme = `${root}/README.md`
let guide = fs.readFileSync(readme, 'utf8')
guide = guide.replace('默认采用与 5173 页面相同的纯场景交互', '默认采用纯场景交互与连续缩放')
guide = guide.replace('滚轮在总览与近景之间切换，指向星球向上滚动可平滑靠近；近景拖动只改变球体朝向。', '滚轮和双指开合在统一的距离尺度上连续缩放，指针或双指中点作为缩放中心；拖动只改变球体朝向。')
guide = guide.replace('镜头使用独立 CameraDirector 平滑靠近与退回，不再通过拖动旋转整个星系。单颗球体拖动限制为水平 ±0.75、垂直 ±0.20 弧度。缩放倍率限制在 0.82–2.8，总览进入与退出阈值分别为 1.72 / 1.42，避免触控板在边界反复切换。', '镜头使用独立 CameraDirector 和唯一的距离公式，距离系数连续限制在 0.12–2.8，默认值为 1。滚轮增量按指数累计到期望距离，逐帧使用与帧率无关的阻尼追随；快速连续操作和反向滚动立即更新目标。指针锚点根据期望相机计算，避免连续输入被镜头滞后放大成漂移。完整星系、飞船与航线始终存在，不按距离切换场景或自动隐藏。选曲只更新曲目详情，保留缩放距离与镜头中心。单颗球体拖动限制为水平 ±0.75、垂直 ±0.20 弧度。')
guide = guide.replace('# 镜头导演、球体拖动、双击与光环', '# 连续镜头、球体拖动、双击与光环')
guide = guide.replace('# 缩放阈值、视图规则与本次事件命中', '# 连续缩放、距离边界与指针锚点')
guide = guide.replace('# 模式滞回与异常滚轮输入', '# 连续缩放、锚点稳定与异常输入')
const start = guide.indexOf('## 复刻 5173 的操作方式')
const end = guide.indexOf('## 示例资源来源', start)
if (start < 0 || end < 0) throw new Error('Missing interaction guide section.')
guide = guide.slice(0, start) + `## 连续缩放的操作方式

沿用 [ORBIT 页面](http://127.0.0.1:5173/) 的纯场景、拖动、双击与快捷键，缩放按本次要求改成连续操作。

| 操作 | 当前页面行为 |
| --- | --- |
| 滚轮向上 / 向下 | 以指针为中心连续放大 / 缩小，任意距离都可以停下或反向 |
| 触控板双指开合 | 在场景内连续缩放，处理浏览器发出的 ctrl+wheel |
| 拖动星球 | 只转动球体表面，星系模板保持原有位置与曲序 |
| 双击 / 手机双击星球 | 选择目标并控制场景动画，显示相应的发光环 |
| 空格 | 播放 / 暂停场景动画，暂停时缩放仍能平滑运行 |
| 左 / 右方向键 | 按曲序选择曲目，首尾循环，保留相机距离和中心 |
| 手机双指开合 | 以双指中点为中心连续缩放，避免同时触发球体拖动或双击 |
| H / 右下角工具按钮 | 显示或隐藏专辑工坊、Seed、曲目索引与画面品质工具 |
| 重置视角 | 平滑恢复完整横向星系 |
| Esc | 先关闭编辑器或浮层；纯场景下返回音乐大厅 |

双击与空格控制场景动画，专辑尚未关联歌曲音频。相机状态、球体拖动角度与动画状态不写入 generateAlbumGalaxy 的输出；Seed、曲序与 JSON 复现保持独立。

缩放没有总览 / 近景阈值、星球吸附、过渡锁定或镜头停顿。所有滚轮和双指增量立即累积；移动过程使用单一相机模型，星球、机器人与航线保持在同一个 3D 场景。暂停动画时相机按需渲染到稳定位置，随后停止持续渲染。输入框、编辑器与普通按钮保留原生键盘操作。

` + guide.slice(end)
fs.writeFileSync(readme, guide)
console.log('Updated in-app gestures and continuous zoom implementation guide.')
