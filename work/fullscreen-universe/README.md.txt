# Music Universe · Album Solar System

React + TypeScript + Vite + React Three Fiber / Three.js 专辑星系生成器。3D 场景铺满浏览器窗口，导航、专辑信息与工具浮在画面上。

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

- 画布使用整个窗口的实际宽高，包括桌面、手机竖屏、手机横屏；页面没有纵向滚动或信箱黑边。太阳系数据仍保留 32 × 18 的横向模板。
- 36° 透视镜头随窗口尺寸计算距离。受限的拖动、滚轮缩放和轻微指针视差展现立体关系，曲目保持从左到右的顺序；重置视角回到初始构图。
- 左侧专辑恒星的封面直接由球面 shader 采样，叠加球体明暗、暖金色日冕与星环。
- 深蓝黑的程序化星云、2400 颗具有深度与轻微闪烁的星尘、120 颗后景陨石。背景不跟随用户 Seed 改变，始终衬托主体。
- 程序化环境光给金属、星环和机器人增加反光；HDR Bloom 强调灯泡、眼睛、尾焰与入口光环。环境光与星云不需要外部图片或 HDR 文件。
- 顶部导航、底部 Seed 控制台、曲目索引抽屉与大厅旅伴入口。点选星球可查看曲目详情，并切换上一首 / 下一首。
- 点击右上角「沉浸模式」或按 H 隐藏工具与标签；点击「显示界面」或再按 H 恢复。隐藏工具设为 inert，不能被键盘误聚焦。Esc 收起浮层。
- 浏览器全屏按钮作用于整个应用，进入全屏后仍能操作控制台与编辑器。
- 画面品质可选「自适应 / 精致 / 流畅」。自适应根据渲染表现调整像素比；暂停动画或页面进入后台时停止持续渲染与自动清晰度变化。

手机竖屏完整保留横向曲序，因此星球会比桌面小。横屏更适合观察材质与飞船，曲目索引在两种方向都可用。

## GitHub 参考与工程措施

以下链接是参考来源；界面、布局、程序化材质与机器人造型结合本项目需求实现。

| 参考 | 本项目采用的措施 | 实际效果 |
| --- | --- | --- |
| [Space Portfolio](https://github.com/Jewgah/space-portfolio) | 参考全窗口宇宙、轻量导航浮层与飞船探索的呈现方式 | 页面以星系为主，工具按需展开 |
| [R3F · Scaling performance](https://github.com/pmndrs/react-three-fiber/blob/master/docs/advanced/scaling-performance.mdx) | 按需渲染、实例化、资源复用与自适应质量 | 暂停时保持冻结帧，操作镜头仍会按需更新 |
| [Drei · Stars 源码](https://github.com/pmndrs/drei/blob/master/src/core/Stars.tsx) | BufferGeometry 点云、着色器控制点尺寸与柔和边缘；使用本项目的 seeded PRNG 替代非确定性随机 | 2400 颗有深度的星尘共用一个点云，不逐颗创建 React 组件 |
| [Drei · PerformanceMonitor](https://github.com/pmndrs/drei/blob/master/docs/performances/performance-monitor.mdx) | 设置性能上下阈值、渐进调整 DPR、设置反复调整后的基线 | 自动模式适应设备；手动模式控制真实画布分辨率 |
| [Drei · Environment](https://github.com/pmndrs/drei/blob/master/docs/staging/environment.mdx) | Lightformer 构建一次性环境光贴图 | 提升金属、环与机器人反光，避免外部 HDR 请求 |
| [React Postprocessing · Bloom](https://github.com/pmndrs/react-postprocessing/blob/master/docs/effects/bloom.mdx) | HDR 发光材质、亮度阈值与 mipmap blur | 暖金色入口和飞船尾焰发光，主体封面保持可辨认 |

120 颗陨石合并为一个 InstancedMesh；星尘合并为一个 Points 对象。3D 渲染器通过 React.lazy 独立加载，基础页面无需等待整个 Three.js 模块执行。

本次生产构建：页面 JS 约 227.24 kB（gzip 73.38 kB），3D 模块约 1092.51 kB（gzip 297.63 kB）。质量上限为桌面 DPR 1.75、窄屏 DPR 1.2，且不会超过设备自身像素比；流畅模式采用更低清晰度。浏览器验收使用 Chromium 软件渲染，验证功能与错误状态，不作为用户显卡帧率保证。

## 专辑与随机生成

默认 DON'T TAP THE GLASS / Tyler, The Creator / 2025，按正式曲序填充 10 首曲目：

Big Poe → Sugar on My Tongue → Sucka Free → Mommanem → Stop Playing With Me → Ring Ring Ring → Don't Tap That Glass / Tweakin' → Don't You Worry Baby → I'll Take Care of You → Tell Me What It Is。

```ts
const galaxy = generateAlbumGalaxy(seed, albumCover, tracks)
```

生成器没有 DOM、React 或 Three.js 依赖。文字 Seed 经 FNV-1a 转成 32 位整数，再交给 mulberry32。它返回可序列化的恒星、星球、边界和飞行路径数据。

GALAXY_TEMPLATE 固定恒星尺寸与位置、画面边界、横向曲目槽位和机器人路径。生成器使用原始 tracks.map，X 坐标严格递增；随机只改变大小、Y 偏移、轻微 Z 深度、颜色、材质、环、环倾角、卫星数、旋转速度、发光强度与表面纹理。

10 种视觉模板为 glass / lava / ice / cloud / grass / metal / disco / ringed / crystal / dark。默认 10 首曲目覆盖全部模板；随机分配的是材质，曲目数组保持原序。

机器人轨道使用闭合 CatmullRomCurve3，通过 getPointAt 按弧长移动，通过 getTangentAt 调整朝向。星球、卫星、恒星、飞船与星云共用模拟时间，暂停同时冻结所有动画。

场景标签由普通 React 页面元素呈现，并按当前相机和太阳系整体变换投影位置；键盘也可以操作曲目按钮。超过 20 首时场景显示编号，完整标题位于曲目抽屉。

默认最多 20 首时水平旋转范围 ±0.12 弧度，垂直倾角 ±0.055 弧度；超过 20 首时进一步限制镜头。相机距离限制在初始距离的 0.94–1.13 倍，禁止平移。

## 专辑工坊与更换专辑

顶部「专辑工坊」或专辑信息下方「编辑专辑」可以修改封面、专辑名、歌手和曲目。

- 曲目每行一首，可以使用 `歌曲名 | 3:02`，支持 1–40 首。
- 上传封面在浏览器本地规范为 768 × 768；非正方形图片保留内容并补边。
- URL 输入需要图片允许跨域读取；失败或超时会显示提示。
- 字体、默认封面与大厅头像随项目保存，默认场景无需访问外网。
- 可导出专辑和完整星系 JSON，使用同一个 Seed 复现布局与材质。

要长期加入 IGOR、Blonde、OK Computer、Loveless 等专辑，在 src/data/albums.ts 添加符合 Album 类型的数据，并把 explorationSession.ts 中的默认专辑换成新数据。生成器与渲染器无需修改。当前标签页已有保存状态时会优先恢复它；临时更换专辑可直接使用工坊。

## 与音乐大厅相连

顶部导航和轨道旁的光环返回 [Music World 音乐大厅](http://127.0.0.1:3002/#hall)。左下角旅伴入口展开后，三个光点可进入音乐电台、我的曲库、我的旅程；大厅提供进入专辑星系的入口。

飞船驾驶员沿用大厅的奶油白与橙色机器人、琥珀笑眼、灯泡天线与金色入口。头像使用大厅已有图片，悬停入口显示相同风格的云朵提示。

同一标签页往返时，通过 sessionStorage 保留专辑、封面、曲目与 Seed；存储不可用时仍可编辑和生成。默认大厅为 http://127.0.0.1:3002/，部署可通过 VITE_MUSIC_WORLD_URL 配置；大厅通过 NEXT_PUBLIC_MUSIC_UNIVERSE_URL 配置星系地址，两边变更后分别重新构建。

## 项目结构

```text
music-universe/
├── src/
│   ├── App.tsx                        # 全屏页面、工具浮层、抽屉与状态
│   ├── components/
│   │   ├── GalaxyScene.tsx             # 透视镜头、灯光、星球、飞船与投影标签
│   │   ├── ImmersiveBackground.tsx     # 星云 shader、深度星尘与实例化陨石
│   │   ├── AlbumEditor.tsx             # 专辑工坊
│   │   └── HallConnection.tsx          # 大厅旅伴、房间入口和云朵提示
│   ├── lib/
│   │   ├── generateAlbumGalaxy.ts      # 固定模板、PRNG 与纯生成函数
│   │   ├── sceneFraming.ts             # 视口到透视镜头的计算、品质类型
│   │   ├── spaceMaterials.ts           # 球面封面、程序化材质、日冕
│   │   ├── albumEditor.ts              # 曲目解析与封面处理
│   │   ├── musicWorld.ts               # 大厅地址与房间入口
│   │   └── explorationSession.ts       # 标签页内专辑与 Seed 恢复
│   ├── data/albums.ts                  # 默认专辑
│   ├── styles.css                     # 全屏布局与响应式浮层
│   ├── hall-connection.css
│   └── main.tsx
├── public/
│   ├── covers/dont-tap-the-glass.jpg
│   ├── media/music-world-hall.webp
│   ├── fonts/                         # 本地字体与 OFL 许可证
│   └── favicon.svg
├── tests/
│   ├── generator.test.ts              # 生成器与编辑器
│   ├── browser.mjs                    # 真实 3D 交互、全屏、品质与窄屏
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
# 两边都运行时
npm run test:hall
# 对生产预览运行完整浏览器验收
$env:TEST_URL = "http://127.0.0.1:4188/"
npm run test:e2e
```

首次使用且没有可用测试浏览器时，可执行 npx playwright install chromium。也可通过 BROWSER_EXECUTABLE 指定测试浏览器。测试使用新的临时配置，不读取日常浏览器登录资料。

2026-10-04 验证结果：10 项算法与编辑器测试、14 组浏览器检查、6 组大厅关联检查通过；生产构建成功。浏览器验收覆盖 1600 × 900 桌面、390 / 320 × 844 手机竖屏及 844 × 390 横屏，包括真实球体点选、受限镜头、冻结帧、Seed 复现、封面上传与 URL、抽屉、沉浸模式、画布真实清晰度、浏览器全屏、17 首曲目标签排版与大厅往返。页面与控制台错误均为 0。

截图与 JSON 报告位于项目上一级的 outputs 目录：music-universe-fullscreen.png、music-universe-immersive.png、music-universe-fullscreen-mobile.png、music-universe-browser-report.json、music-universe-hall-link-report.json。

## 示例资源来源

- 曲序、时长与封面：[Apple Music 专辑页面](https://music.apple.com/us/album/dont-tap-the-glass/1827715784) 与 Apple iTunes 公共 lookup 元数据，核对日期 2026-10-04；标题省略 featuring 标注。
- 封面相关权利归原权利人。
- DM Sans 与 Space Grotesk 使用 SIL Open Font License 1.1，完整许可证位于 public/fonts/。
- 大厅头像来自本地 Music World 已有场景资源。

本应用生成可视化星系，不包含音乐音频资源或流媒体账号接入。WebGL 不可用时显示封面与说明，专辑编辑仍可用。
