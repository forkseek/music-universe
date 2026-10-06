# Music Universe · Album Solar System

React + TypeScript + Vite + React Three Fiber / Three.js 专辑星系生成器。3D 场景铺满浏览器窗口，默认隐藏工具；连续缩放、空白处环绕镜头、专辑恒星 360° 转动和自由飞行可直接操作。按 H 显示导航、专辑编辑与 Seed 工具。

## 运行

需要 Node.js 22.12+；开发环境为 Node.js 24.18，依赖已安装。

```powershell
cd "C:\path\to\music-universe"
npm ci
npm run dev
```

打开 [开发页面](http://127.0.0.1:5188/)。已经运行时直接访问，无需启动第二个实例。

生产构建与预览：

```powershell
npm run build
npm run preview
```

打开 [生产预览](http://127.0.0.1:4188/)。4173 已被另一个应用使用，因此本项目的生产预览固定使用 4188。`dist/` 可部署到静态托管服务。

## 全屏 3D 界面

- 画布使用整个窗口的实际宽高，包括桌面、手机竖屏和手机横屏；页面没有纵向滚动或信箱黑边。太阳系数据仍保留 32 × 18 的横向模板。
- 默认使用 36° 透视镜头，并随窗口尺寸计算初始距离。星系视角下滚轮和双指开合连续缩放，指针或双指中点作为缩放中心；拖动空白处环绕镜头，拖动球体只改变球体朝向。
- 左侧专辑恒星的封面由球面 shader 直接采样。前后半球分别展示封面，后半球修正水平镜像，并在两半球交界处平滑混合。四元数旋转支持连续整圈转动，球体明暗随朝向变化，暖金色日冕与星环衬托主体。
- 背景精确复制自用户提供的 [本地 Space Motion Demo](http://localhost:5180/space-motion-demo.html?v=7)，保存在 `public/media/space-motion-background.png`。透明 Canvas 上叠加 2400 颗具有深度与轻微闪烁的星尘、120 颗后景陨石；原来的程序化星云已移除。背景图跟随镜头姿态产生视差与旋转，不随 Seed 改变。项目运行不依赖 5180 服务。
- 程序化环境光给金属、星环和机器人增加反光；HDR Bloom 强调灯泡、眼睛、尾焰与入口光环。环境光通过本地场景生成，无需外部 HDR 文件。
- 顶部导航、底部 Seed 控制台、曲目索引抽屉与大厅旅伴入口按需展开。显示工具后点选星球可查看曲目详情，并切换上一首 / 下一首。
- 默认隐藏工具与标签。按 H 或点击右下角工具按钮显示；再按 H 或点击「沉浸模式」隐藏。隐藏工具设为 inert。自由镜头下打开工具会先退出自由镜头并平滑回正。
- 浏览器全屏按钮作用于整个应用，进入全屏后仍能操作控制台与编辑器。
- 画面品质可选「自适应 / 精致 / 流畅」。自适应根据渲染表现调整像素比；暂停动画或页面进入后台时停止持续渲染与自动清晰度变化。手动相机操作仍可按需更新。

手机竖屏完整保留横向曲序，因此星球会比桌面小。横屏更适合观察材质与飞船，曲目索引在两种方向都可用。自由飞行的 WASD 等操作面向带键盘的设备；手机保留单指拖动、球体旋转、双击与双指缩放。

## 操作方式

沿用 [ORBIT 页面](http://127.0.0.1:5173/) 的纯场景、拖动、双击与快捷键，缩放改成连续操作，并加入环绕镜头与自由飞行。

| 操作 | 当前页面行为 |
| --- | --- |
| 星系视角：滚轮向上 / 向下 | 以指针为中心连续放大 / 缩小，任意距离都可以停下或反向 |
| 触控板双指开合 | 在场景内连续缩放，处理浏览器发出的 ctrl+wheel |
| 手机双指开合 | 以双指中点为中心连续缩放，并抑制球体拖动与错误双击 |
| 拖动空白处 | 环绕星系镜头，松手后惯性衰减，背景随镜头产生视差与旋转 |
| 拖动专辑恒星 | 封面随真实球体 360° 转动，松手延续惯性，再次抓取立即制动 |
| 拖动歌曲星球 | 只转动球体表面，保留原有小角度限制，星系位置和曲序保持固定 |
| 双击 / 手机双击星球 | 选择目标并控制场景动画，显示相应的发光环 |
| 星系视角：空格 | 播放 / 暂停场景动画与电影式镜头漂移；暂停时仍可缩放和直接拖动 |
| 左 / 右方向键 | 按曲序选择曲目，首尾循环，保留相机距离和中心 |
| R / 右下角自由镜头按钮 | 开启自由镜头；再次操作平滑返回星系视角 |
| 自由镜头：鼠标 | 转向；浏览器允许时锁定鼠标，不允许时使用画布内的鼠标移动 |
| 自由镜头：W / A / S / D | 前 / 左 / 后 / 右移动，Shift 加速 |
| 自由镜头：Space / Ctrl | 上升 / 下降；此时空格用于移动 |
| 自由镜头：Q / E | 左 / 右倾斜镜头 |
| 自由镜头：滚轮 | 平滑调整视野角，范围为 26°–72° |
| K / 双击空白处 / 重置视角 | 用 0.62 秒平滑恢复完整横向星系与正向镜头 |
| H / 右下角工具按钮 | 显示或隐藏专辑工坊、Seed、曲目索引与品质工具；打开时先退出自由镜头 |
| Esc | 自由镜头下平滑回正；其他情况下先关闭编辑器或浮层，纯场景下返回音乐大厅 |

双击星球与星系视角下的空格控制场景动画，专辑尚未关联歌曲音频。输入框、编辑器与普通按钮保留原生键盘操作。相机状态、球体旋转和动画状态不写入 `generateAlbumGalaxy` 的输出；Seed、曲序与 JSON 复现保持独立。

## 镜头与恒星物理

`CameraDirector` 接入独立的 `SpaceCameraController`。控制器仅负责相机数学计算，没有 DOM 或 React 依赖；页面负责鼠标、键盘、指针捕获和背景投影。`sceneInput.ts` 标记球体已经处理的原生事件，空白处拖动才交给相机。拖动恒星或歌曲星球不会同时改变镜头。

星系视角的距离系数连续限制在 0.12–2.8，默认值为 1。滚轮增量按指数累计到期望距离，逐帧使用阻尼追随；快速连续操作和反向滚动立即更新目标。缩放锚点根据期望相机姿态与 Z=0 平面的交点计算，环绕后仍可围绕指针缩放。缩放没有总览 / 近景阈值、星球吸附、过渡锁定或镜头停顿；所有星球、飞船与航线始终处于同一个 3D 场景。

空白处环绕使用按时间积分的拖动惯性与阻尼，兼顾不同帧率。动画开启时叠加轻微的电影式漂移；暂停会冻结漂移偏移，已经发起的手动相机阻尼与缩放仍可收敛。自由镜头具有平滑的移动速度、停止减速、转向、倾斜与视野调整。K、双击空白处或退出自由镜头使用同一条 0.62 秒回正动画。

`albumRotationPhysics.ts` 独立维护恒星的四元数朝向、角速度与拖动角度。恒星没有整圈旋转限制；释放后保留惯性，以 3.2 / 秒的指数阻尼衰减，最大角速度为 6 弧度 / 秒。未抓取时以约 0.025 弧度 / 秒缓慢自转。再次抓取立即制动；失焦、触控取消或双指缩放清除惯性。暂停或启用减少动态效果时停止惯性与自动旋转，用户直接拖动仍有效。歌曲星球继续保留水平 ±0.75、垂直 ±0.20 弧度的拖动范围。

## GitHub 参考与工程措施

以下链接是参考来源；界面、布局、程序化材质与机器人造型结合本项目需求实现。背景图片和镜头操作也参考用户提供的本地 Space Motion Demo。

| 参考 | 本项目采用的措施 | 实际效果 |
| --- | --- | --- |
| [Space Portfolio](https://github.com/Jewgah/space-portfolio) | 参考全窗口宇宙、轻量导航浮层与飞船探索的呈现方式 | 页面以星系为主，工具按需展开 |
| [R3F · Scaling performance](https://github.com/pmndrs/react-three-fiber/blob/master/docs/advanced/scaling-performance.mdx) | 按需渲染、实例化、资源复用与自适应质量 | 暂停时保持冻结帧，操作镜头仍会按需更新 |
| [Drei · Stars 源码](https://github.com/pmndrs/drei/blob/master/src/core/Stars.tsx) | BufferGeometry 点云、着色器控制点尺寸与柔和边缘；使用本项目的 seeded PRNG 替代非确定性随机 | 2400 颗有深度的星尘共用一个点云，不逐颗创建 React 组件 |
| [Drei · PerformanceMonitor](https://github.com/pmndrs/drei/blob/master/docs/performances/performance-monitor.mdx) | 设置性能上下阈值、渐进调整 DPR、设置反复调整后的基线 | 自动模式适应设备；手动模式控制真实画布分辨率 |
| [Drei · Environment](https://github.com/pmndrs/drei/blob/master/docs/staging/environment.mdx) | Lightformer 构建一次性环境光贴图 | 提升金属、环与机器人反光，避免外部 HDR 请求 |
| [React Postprocessing · Bloom](https://github.com/pmndrs/react-postprocessing/blob/master/docs/effects/bloom.mdx) | HDR 发光材质、亮度阈值与 mipmap blur | 暖金色入口和飞船尾焰发光，主体封面保持可辨认 |

120 颗陨石合并为一个 InstancedMesh；星尘合并为一个 Points 对象。3D 渲染器通过 React.lazy 独立加载，基础页面无需等待整个 Three.js 模块执行。

生产构建将页面与 3D 渲染器分为独立模块；具体大小见构建输出。质量上限为桌面 DPR 1.75、窄屏 DPR 1.2，且不会超过设备自身像素比；流畅模式采用更低清晰度。浏览器验收使用 Chromium 软件渲染，验证功能与错误状态，不作为用户显卡帧率保证。

## 专辑与随机生成

默认 DON'T TAP THE GLASS / Tyler, The Creator / 2025，按正式曲序填充 10 首曲目：

Big Poe → Sugar on My Tongue → Sucka Free → Mommanem → Stop Playing With Me → Ring Ring Ring → Don't Tap That Glass / Tweakin' → Don't You Worry Baby → I'll Take Care of You → Tell Me What It Is。

```ts
const galaxy = generateAlbumGalaxy(seed, albumCover, tracks)
```

生成器没有 DOM、React 或 Three.js 依赖。文字 Seed 经 FNV-1a 转成 32 位整数，再交给 mulberry32。它返回可序列化的恒星、星球、边界和飞行路径数据。

`GALAXY_TEMPLATE` 固定恒星尺寸与位置、画面边界、横向曲目槽位和机器人路径。生成器使用原始 `tracks.map`，X 坐标严格递增；随机只改变大小、Y 偏移、轻微 Z 深度、颜色、材质、环、环倾角、卫星数、旋转速度、发光强度与表面纹理。

10 种视觉模板为 glass / lava / ice / cloud / grass / metal / disco / ringed / crystal / dark。默认 10 首曲目覆盖全部模板；随机分配的是材质，曲目数组保持原序。

机器人轨道使用闭合 `CatmullRomCurve3`，通过 `getPointAt` 按弧长移动，通过 `getTangentAt` 调整朝向。歌曲星球、卫星、星尘与飞船使用同一个模拟时间；恒星旋转与相机使用各自的控制器。暂停同时停止自动场景动画和电影式镜头漂移，保留直接拖动、缩放与镜头操作。

场景标签由普通 React 页面元素呈现，并按当前相机和太阳系整体变换投影位置；键盘也可以操作曲目按钮。超过 20 首时场景显示编号，完整标题位于曲目抽屉。选曲只更新曲目详情，保留缩放距离与镜头中心。

## 专辑工坊与更换专辑

顶部「专辑工坊」或专辑信息下方「编辑专辑」可以修改封面、专辑名、歌手和曲目。

- 曲目每行一首，可以使用 `歌曲名 | 3:02`，支持 1–40 首。
- 上传封面在浏览器本地规范为 768 × 768；非正方形图片保留内容并补边。
- URL 输入需要图片允许跨域读取；失败或超时会显示提示。
- 字体、默认封面、大厅头像与 Space Motion 背景随项目保存，默认场景无需访问外网或 5180 服务。
- 可导出专辑和完整星系 JSON，使用同一个 Seed 复现布局与材质。

要长期加入 IGOR、Blonde、OK Computer、Loveless 等专辑，在 `src/data/albums.ts` 添加符合 Album 类型的数据，并把 `explorationSession.ts` 中的默认专辑换成新数据。生成器与渲染器无需修改。当前标签页已有保存状态时会优先恢复它；临时更换专辑可直接使用工坊。

## 与音乐大厅相连

顶部导航和轨道旁的光环返回 [Music World 音乐大厅](http://127.0.0.1:3002/#hall)。左下角旅伴入口展开后，三个光点可进入音乐电台、我的曲库、我的旅程；大厅提供进入专辑星系的入口。

飞船驾驶员沿用大厅的奶油白与橙色机器人、琥珀笑眼、灯泡天线与金色入口。头像使用大厅已有图片，悬停入口显示相同风格的云朵提示。

同一标签页往返时，通过 sessionStorage 保留专辑、封面、曲目与 Seed；存储不可用时仍可编辑和生成。默认大厅为 `http://127.0.0.1:3002/`，部署可通过 `VITE_MUSIC_WORLD_URL` 配置；大厅通过 `NEXT_PUBLIC_MUSIC_UNIVERSE_URL` 配置星系地址，两边变更后分别重新构建。

## 项目结构

```text
music-universe/
├── src/
│   ├── App.tsx                        # 全屏页面、工具浮层、快捷键与状态
│   ├── components/
│   │   ├── GalaxyScene.tsx             # 灯光、星球、飞船与投影标签
│   │   ├── SceneInteraction.tsx         # 镜头输入、球体惯性、双击与光环
│   │   ├── ImmersiveBackground.tsx     # 深度星尘与实例化陨石，Canvas 透明
│   │   ├── AlbumEditor.tsx             # 专辑工坊
│   │   └── HallConnection.tsx          # 大厅旅伴、房间入口和云朵提示
│   ├── hooks/useGalaxyNavigation.ts   # 滚轮、双指缩放、背景与相机接口
│   ├── lib/
│   │   ├── generateAlbumGalaxy.ts      # 固定模板、PRNG 与纯生成函数
│   │   ├── sceneFraming.ts             # 视口到透视镜头的计算、品质类型
│   │   ├── galaxyNavigation.ts         # 连续缩放、距离边界与指针锚点
│   │   ├── albumRotationPhysics.ts     # 四元数、惯性、角速度与指数阻尼
│   │   ├── spaceCamera.ts              # 无 DOM 的环绕、自由飞行与回正控制器
│   │   ├── sceneInput.ts               # 区分球体操作与空白处相机操作
│   │   ├── spaceMaterials.ts           # 前后半球封面、程序化材质、日冕
│   │   ├── albumEditor.ts              # 曲目解析与封面处理
│   │   ├── musicWorld.ts               # 大厅地址与房间入口
│   │   └── explorationSession.ts       # 标签页内专辑与 Seed 恢复
│   ├── data/albums.ts                  # 默认专辑
│   ├── styles.css                     # 全屏背景、自由镜头提示与响应式浮层
│   ├── hall-connection.css
│   └── main.tsx
├── public/
│   ├── covers/dont-tap-the-glass.jpg
│   ├── media/music-world-hall.webp
│   ├── media/space-motion-background.png # 用户提供的本地 Demo 背景精确副本
│   ├── fonts/                         # 本地字体与 OFL 许可证
│   └── favicon.svg
├── tests/
│   ├── generator.test.ts              # 生成器与编辑器
│   ├── navigation.test.ts             # 连续缩放、锚点稳定与异常输入
│   ├── rotation.test.ts               # 整圈转动、惯性、帧率与异常输入
│   ├── spaceCamera.test.ts             # 环绕惯性、自由飞行、漂移与回正
│   ├── browser.mjs                    # 真实 3D 交互、全屏、品质与窄屏
│   ├── interactions.mjs               # 连续缩放、键盘与真实手机触控
│   ├── rotation.mjs                   # 恒星旋转、制动、暂停与触控
│   ├── camera.mjs                     # 空白处环绕、自由飞行、回正与背景
│   └── hall-connection.mjs             # 双向导航、状态恢复与三个房间
├── README.md
├── package.json
├── package-lock.json
├── vite.config.ts
└── dist/                              # 已生成的生产构建
```

## 验证

```powershell
npm test
npm run build
# 5188 已运行时
npm run test:e2e
npm run test:interactions
npm run test:rotation
npm run test:camera
# 两边都运行时
npm run test:hall
# 对生产预览运行浏览器验收
$env:TEST_URL = "http://127.0.0.1:4188/"
npm run test:e2e
npm run test:interactions
npm run test:rotation
npm run test:camera
```

首次使用且没有可用测试浏览器时，可执行 `npx playwright install chromium`。也可通过 `BROWSER_EXECUTABLE` 指定测试浏览器。测试使用新的临时配置，不读取日常浏览器登录资料。

2026-10-05 当前已确认：31 项生成器、编辑器、连续缩放、恒星物理与相机控制器单元测试通过，生产构建成功。本轮背景接入、环绕与自由镜头的浏览器验收正在进行，结果待补充；这里不将尚未完成的浏览器套件列为通过。

此前的连续缩放截图包括 `music-universe-direct-overview.png`、`music-universe-direct-focus.png`（中间缩放距离）、`music-universe-direct-mobile.png`；交互报告为 `music-universe-interaction-report.json`。其他截图与 JSON 报告位于项目上一级的 outputs 目录。这些既有文件应结合各自验证时间阅读，不能替代本轮新增相机功能的验收。

## 示例资源来源

- 曲序、时长与封面：[Apple Music 专辑页面](https://music.apple.com/us/album/dont-tap-the-glass/1827715784) 与 Apple iTunes 公共 lookup 元数据，核对日期 2026-10-04；标题省略 featuring 标注。
- 封面相关权利归原权利人。
- Space Motion 背景来自用户提供的本地 `http://localhost:5180/space-motion-demo.html?v=7` 场景，精确复制为 `public/media/space-motion-background.png`；项目运行仅加载该本地副本，不请求 5180。资源相关权利归原权利人。
- DM Sans 与 Space Grotesk 使用 SIL Open Font License 1.1，完整许可证位于 `public/fonts/`。
- 大厅头像来自本地 Music World 已有场景资源。

本应用生成可视化星系，不包含音乐音频资源或流媒体账号接入。WebGL 不可用时显示封面与说明，专辑编辑仍可用。
