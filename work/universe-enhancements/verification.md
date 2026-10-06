# 音乐宇宙增强及解除跟随验证

日期：2026-10-06。源码位于 `C:\Users\IKUN\Documents\Codex\2026-10-04\referenced-chatgpt-conversation-this-is-an-3\outputs\music-universe`。开发页面为 http://127.0.0.1:5188/；大厅入口为 http://127.0.0.1:3002/#hall，通过原 #universe 子页面嵌入。没有新增运行时依赖，没有调整平台认证或更换原播放器输出路径。

## 用户补充：解除跟随归还恒星锚点

按钮/快捷键的 `releaseFollow()` 清除目标并保存手动解除选择；关闭当前跟随详情窗也调用同一入口。`CameraDirector` 从现有 world 矩阵计算恒星世界坐标，更新 navigation 的 center/centerZ。`SpaceCameraController.returnToStarAnchor()` 用独立的 smoothstep 过渡平移相机与注视点，不调用完整 recenter/reset。

- 默认回归时间 0.8 秒，建议可调 .35–1.5 秒。
- 系统减少动态效果下缩短为 .18 秒，建议可调 .08–.25 秒。
- 保留当前缩放距离、方向、FOV、镜头模式和运动预设。回归中滚轮仍可改变距离；恢复跟随可中断回归。
- 真正重置/进入自由镜头的内部解除使用 `releaseFollow(false)`；自动失去目标仍使用原 `suspendFollow()`，不擅自覆盖已有重置或暂停逻辑。

## 检查结果

| 检查 | 结果与范围 |
|---|---|
| 宇宙单元测试 `npm test` | 129 项通过，包含 7 项恒星锚点回归，以及跟随共线、变帧率、回归期间缩放、再次跟随中断、减少动态效果和真实重置边界 |
| 宇宙构建 / 主项目 `build:universe` | TypeScript 与 Vite 构建通过；通过原同步流程发布 |
| 主项目 lint、typecheck、test | 通过；19 个测试文件、171 项通过 |
| 最终发布版本 `test:experience` | 14 组通过，页面运行错误 0；包含解除跟随保留姿态、关闭详情窗返回恒星、手机歌词避让与持续浏览 |
| 最终源码 `test:lyrics` | 11 组通过，页面运行错误 0；覆盖连点切歌、失败重试、旧歌词丢弃、seek、暂停/恢复、本地 LRC、直接 URL 和沉浸状态保持 |
| 实际大厅入口 | 点击专辑宇宙进入 #universe、iframe WebGL 就绪、效果控件可用；155 个清单资源 SHA-256 匹配；页面运行错误 0 |

单元测试和主项目检查完成后，最终只追加了详情窗关闭入口和歌词避让两处 UI 修正；最终构建、发布版本体验测试、源码歌词回归均在这两处修正后通过。下述五分钟开发测试在这两处 UI 修正之前完成；修正后的最终发布版本另通过一分钟连续浏览。

## 可观测数据

- 128Hz 合成音经真实 HTMLAudioElement 播放，低频值 0.16841，恒星光晕尺寸倍率 1.01179。6kHz 合成音高频值 0.00621，星尘倍率 1.00112。音乐开关不会改变原生播放进度，相机不接收频谱参数。
- 暂停前低频 0.16660，暂停后第一次采样仍为 0.08662，再逐渐衰减；没有瞬时归零。浏览器时序可能影响第一次采样的衰减幅度。
- 持续滚轮/拖动时粒子比例 0.4、Bloom 为 0、DPR 0.750；停止后粒子比例恢复 1、Bloom 恢复 0.8、DPR 回到当时自适应基准 0.857。Canvas 保持同一对象，低品质上限未被恢复过程覆盖。
- 近景跟随两行、总览四行；手机字幕不与跟随按钮或展开的效果菜单重叠。实拍浏览器截图已人工检查。
- 运行时切换系统减少动态效果后，自主镜头运动停止，手动缩放与播放继续；偏好恢复后保留用户所选预设。

## 持续浏览

测试环境为无头 Chromium + SwiftShader 软件渲染，使用隔离 API 路由与合成 WAV，不读取/写入真实用户账号。

| 版本 | 采样时长 / 数量 | 几何 / 纹理 / Shader 程序 | 帧订阅 | JS 堆范围 |
|---|---|---|---|---|
| 开发版本（最终两处 UI 修正前） | 303 秒 / 72 次 | 44 / 23 / 27，首末一致 | 29，保持不变 | 约 49.5–79.8MB，有 GC 回落 |
| 最终发布版本 | 63 秒 / 15 次 | 45 / 23 / 29，首末一致 | 29，保持不变 | 约 13.7–19.1MB，有 GC 回落 |

这些结果证明测试场景中 GPU 资源及订阅没有持续增长；不据此宣称任意浏览时长无泄漏。软件渲染不是用户 GPU 的 FPS 测试，音频进度与分析响应不是实体扬声器的听音验收。

## 证据与回滚

- 宇宙源目录 `tests/reports/universe-experience/results.json` 与 `soak.json`：开发测试和五分钟样本。
- 宇宙源目录 `tests/reports/universe-experience/hall/results.json` 与 `soak.json`：最终发布测试和一分钟样本；同目录 mobile.png/overview.png 为截图。
- 宇宙源目录 `tests/reports/immersive-lyrics/results.json`：最后两处 UI 修正后的原歌词/切歌回归。
- 本目录 deployment.json 与 hall-current.png：实际大厅跳转、嵌入就绪与静态文件校验。
- 本目录 scoped.patch、changed-files.json：本次源码改动；backup/universe 保存修改前的既有文件，backup 中另保存初始大厅静态入口和清单。回滚应仅还原本次文件后重新 build:universe，不覆盖其他已有改动。

完整三组需求、实现片段、参数范围和可执行验收清单见宇宙源目录的 UNIVERSE_ENHANCEMENTS.md。
