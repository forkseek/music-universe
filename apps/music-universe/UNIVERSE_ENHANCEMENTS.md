# 音乐宇宙：焦点、音乐联动与持续浏览

本次直接修改现有 React 19 + TypeScript + Vite + R3F 9 / Three.js r183 项目；未新增运行时依赖。5188 继续用于开发，3002/#hall 的 #universe 子页面通过原同步脚本发布相同实现。现有播放、歌曲识别、共线跟随及滚轮围绕当前注视点缩放均保留；按用户补充要求，手动解除跟随后锚点平滑移回恒星，保留镜头缩放与方向。

## 1. 强化视觉焦点

### 改动点

- Planet 的命中事件仍写入现有 `navigation.hover`；ProjectLabels 仅突出当前播放曲目的星球和指向的星球。选中一个未播放且未指向的对象，不会额外增加标签。暂停后保留当前曲目标签，保持播放上下文。
- 键盘焦点视作指向。标题按钮及曲目索引仍可键盘操作，焦点边框可见。原标签开关及沉浸模式 U 快捷键继续生效。
- 初始取景距离乘 0.92，封面约放大 8.7%；保持原 FOV、中心、缩放范围和轨道数据。
- 背景照片亮度乘 0.84，星尘颜色亮度乘 0.84。没有改动封面、恒星色调映射及行星光照。

### 实现要点

`src/components/GalaxyScene.tsx` 的 `ProjectLabels` 在已有 R3F 帧中读取 ref，无每帧 React setState。非焦点标签以 CSS opacity 淡出；大型专辑的非焦点标题不再每帧投影。只有当前/指向对象进入投影路径，完整曲序和标题数据仍存在。

```tsx
useFrame(() => {
  const focus = shouldShowPlanetLabel(planetId, playingPlanetId, navigation.hover.current, keyboardFocused)
  element.dataset.focused = String(focus)
  if (!focus) return // 实际代码在 node 循环中 continue
  // 使用现有 localToWorld → project(camera) 计算标签位置
})
```

`src/lib/sceneFraming.ts` 的 `INITIAL_FRAMING_SCALE` 控制首屏接近距离；`src/lib/universeExperience.ts` 的参数统一供标签、背景和音频视觉使用。样式在 `src/universe-experience.css`。

| 参数 | 默认 | 建议范围 | 含义 |
|---|---:|---:|---|
| labelFadeMs | 260ms | 150–450ms | 标签淡入/淡出时间 |
| INITIAL_FRAMING_SCALE | 0.92 | 0.88–1 | 原拟合距离乘数；越小越近，极小值可能裁切外轨 |
| backgroundBrightness | 0.84 | 0.7–1 | 背景照片亮度乘数 |
| starfieldBrightness | 0.84 | 0.7–1 | 背景星尘亮度乘数 |

### 验收标准

- 没有歌曲且鼠标不指向星球时，歌曲标签淡出；播放时突出当前曲目，指向另一颗星球时两颗可见，移出 450ms 内仅保留当前曲目。
- Tab 到标题时焦点和文字可辨认；标签按钮与曲目索引原动作仍可用。
- 首屏封面更易辨认，轨道与曲序不变化，背景不会掩盖封面。

## 2. 让音乐影响宇宙

### 改动点

- 低频只轻推恒星光晕尺寸和透明度；不改变封面曝光、专辑映射光色、真实点光源强度或相机。
- 高频只推动约 8% 的星尘，在现有 Shader 内以小幅位移和亮度变化实现；不创建大量新粒子。
- 暂停、音乐联动关闭或捕获失败后，包络缓慢衰减到零。系统减少动态效果立即关闭可见联动，播放器继续。
- “宇宙效果”提供音乐联动“关闭 / 轻柔 / 增强”，默认轻柔；完整 UI 和沉浸状态都可操作。沉浸时按钮放在底部工具行，避免覆盖音乐星球浮窗的关闭按钮。
- 近景跟随显示当前和下一句两行，其他视角显示四行。进入阈值 0.70、退出 0.84；滞回避免临界缩放时来回闪烁。保留现有 LRC 与 HTMLAudioElement.currentTime 同步逻辑，以及切歌立即清掉旧歌词。歌词布局同时避让右下跟随按钮和展开的效果菜单；菜单、详情窗及播放器位置改变时重新测量安全区。

### 实现要点

原 `<audio>` 自行发声，分析使用捕获副流：

```text
HTMLAudioElement（原生输出保持）
    └─ captureStream / mozCaptureStream
       └─ MediaStreamAudioSourceNode
          └─ AnalyserNode → Gain(0) → AudioContext.destination
```

没有在原媒体元素上安装不可逆的 `createMediaElementSource`，避免合法跨域直链在变成 Web Audio 输入后无法继续原生播放。浏览器不支持 captureStream、受跨域保护或无法解锁时，仅关闭可视化联动；不会声称音频已分析成功。

`src/lib/audioReactivity.ts` 每个媒体元素复用一个 Context/图与 FFT 字节数组；`src/hooks/useAudioAnalysis.ts` 暴露 `sample(delta)` 和 `bandsRef`；原 `primePlayback/load/play` 的同步手势入口只补解锁调用。换源后等 `playing` 再捕获，避免过早绑定上一解码源。

```tsx
const analysis = useAudioAnalysis(audio, {
  strength: MUSIC_EFFECT_LEVELS[effectLevel], // 0 / .35 / .7
  reducedMotion,
})

// GalaxyScene 内的 AudioAnalysisFrame；没有额外永久 rAF。
useFrame((_, delta) => {
  if (analysis.sample(delta)) invalidate()
}, -1.2)

// 恒星组件：暂停时继续读衰减包络，不以 available=false 瞬间归零。
const low = reducedMotion ? 0 : analysis.bandsRef.current.low
const gain = 1 + low * UNIVERSE_EXPERIENCE.haloScaleGain
corona.current?.scale.set(radius * 4.7 * gain, radius * 4.7 * gain, 1)
```

分析调用 `analyser.getByteFrequencyData(bytes)`，按采样率/FFT 得到频段索引，使用 RMS 聚合，去掉 DC、应用噪声门限和帧率无关指数包络。相机组件没有频谱、强度或音频分析参数。

| 参数 | 默认 | 建议范围 | 含义 |
|---|---:|---:|---|
| strength | 0 / .35 / .7，默认 .35 | 0–1 | 视觉联动强度，和音乐音量无关 |
| fftSize | 1024 | 512–4096，2 的幂 | 频谱分辨率/分析开销 |
| lowHz | 20–220Hz | 边界在 20–500Hz 内 | 低频区间 |
| highHz | 4–12kHz | 边界在 1.5–16kHz 内 | 高频区间，受实际 Nyquist 上限限制 |
| lowNoiseFloor / highNoiseFloor | .12 / .06 | 0–.5 | 原始归一化频谱噪声门限；门限后才乘播放音量，避免低音量被误判静音 |
| attackSeconds | .08s | .03–.3s | 响应快慢 |
| releaseSeconds | 1.2s | .4–3s | 包络时间常数；1.2s 后约剩 37%，3.6s 后约剩 5% |
| settleEpsilon | .001 | .0001–.01 | 接近零时停止取帧，避免永久缓释循环 |
| haloScaleGain | .07 | .02–.1 | 低频满值时光晕尺寸最多增加 7% |
| haloOpacityGain | .12 | .04–.2 | 低频满值时透明度增幅，最终 opacity 仍钳制至 1 |
| trebleParticleFraction | .08 | .03–.15 | 高频影响星尘比例 |
| trebleDrift | .12 世界单位 | .03–.25 | 高频满值的最大位移尺度 |
| trebleBrightness | .18 | .05–.3 | 高频满值的亮度增幅 |
| nearEnterZoom / nearExitZoom | .70 / .84 | .5–.8 / .75–1 | 近景进入/退出；退出必须大于进入 |

参数库 `AUDIO_REACTIVITY_DEFAULTS/RANGES` 及 Hook 的 `config` 支持统一调参；`UNIVERSE_EXPERIENCE` 控制可见振幅和歌词阈值。

### 验收标准

- 128Hz 测试音低频明显大于高频，6kHz 测试音高频大于低频；光晕和星尘诊断值随对应频段改变。
- 光晕尺寸始终在原尺寸到 1.07 倍以内；暂停后第一帧不归零，数秒内逐渐静止。
- 关闭效果不暂停音乐、不重置播放进度；开启后同一音源恢复分析。
- 暂停场景动画、解除目标跟随并选择静止后，改变频段不会改变相机的位置/方向。
- 实际平台音源及本地文件继续走原播放器；不支持捕获的浏览器或受保护媒体正常播放并显示中性联动提示。
- 近景跟随两行、总览四行，桌面和手机均不显示旧曲歌词。

## 3. 流畅度和持续浏览

### 改动点

- 复用原 RenderQualityController/PerformanceMonitor 基准 DPR。新 RenderBudget 是临时交互乘数，不能覆盖或提高已选低品质基准。
- 观察 canvas 的拖动、非零滚轮、双指手势。普通 hover、单击、UI 输入不降载；不拦截/接管原手势。
- 先渐减粒子与 Bloom，随后才有限降低 DPR；松手保持 180ms，再平滑恢复。Bloom 淡到不可见才禁用 Composer，恢复时先启用再淡入。
- 暂停交互/恢复期间的 FPS 采样，避免临时慢帧把长效自适应基准锁低。
- 复用粒子几何/材质，以 drawRange 和 InstancedMesh.count 调整数量，不重新创建 GPU 缓冲。Composer 保持同一对象，只有启用状态变化。
- 镜头静止/微动/巡航；默认微动。预设只改变自主运动，不改变当前跟随目标、距离、缩放和手动释放语义。
- 运行时监听系统减少动态效果；暂停自主公转/镜头漂移/释放惯性和歌词粒子，保留手动操作及音乐。隐藏页暂停场景帧，恢复丢弃断续时间。

### 实现要点

`src/lib/interactionQuality.ts` + `src/hooks/useInteractionActivity.ts` 由原控制器每帧推进：

```tsx
const activity = useInteractionActivity(gl.domElement, invalidate)
useFrame((_, delta) => {
  advanceRenderBudget(budget, {
    nowMs: performance.now(), deltaSeconds: delta,
    baseDpr: baseDpr.current, activity: activity.current,
  })
  if (budget.dprCommit !== null) setRenderDpr(budget.dprCommit)
  // 仅在布尔值改变时提交 postEnabled/monitorAllowed React 状态。
  if (budget.interactionActive || budget.recovering) invalidate()
}, -1.4)

// 在现有粒子 useFrame 内，不重新分配 geometry：
geometry.setDrawRange(0, Math.ceil(2400 * budget.particleRatio))
asteroids.current.count = Math.round(120 * budget.particleRatio)
bloom.current.intensity = budget.bloomIntensity

// Canvas 保有唯一 DPR 状态；暂停且没有待完成过渡时按需渲染。
<Canvas dpr={renderDpr} frameloop={moving ? 'always' : 'demand'} />
```

粒子末尾 48 个加入透明过渡，减少 drawRange 改变时的突然显现。持续合法慢帧按 0.12s 限制积分，不会因 5–8 FPS 一直归零而无法减负；超过 1s 断续帧/隐藏恢复才跳过。任何过渡都不驱动相机。

镜头参数来自 `src/lib/cameraMotion.ts`，`SpaceCameraController` 保留累计相位，仅平滑改变后续速度，避免切预设或偏好时跳回基准。

```tsx
const reducedMotion = useReducedMotion() // useSyncExternalStore + matchMedia.change
<CameraDirector {...existingProps} motionPreset={motionPreset} reducedMotion={reducedMotion} />
```

静止是取消自主镜头运动；正在跟随移动歌曲星球时依然保持相机→星球→恒星共线并注视星球。解除跟随约 0.8 秒后停在恒星锚点，可沿用暂停动画固定绝对画面。

| 参数 | 默认 | 建议范围 | 含义 |
|---|---:|---:|---|
| particleRatio | .4 | .2–.8 | 交互中保留比例：2400→约960 星尘，120→48 陨石 |
| bloomIntensity | .8→0 | 0–1.5 | 基准 Bloom，交互渐退至零 |
| dprMultiplier | .86 | .65–1 | 交互 DPR 乘数，恢复不超过原基准 |
| idleHoldMs | 180ms | 80–400ms | 停止输入后的保持时间 |
| fallbackMs | 120ms | 60–250ms | 粒子/Bloom 回退约 99% 所需时间 |
| recoveryMs | 800ms | 400–1800ms | 粒子/Bloom 恢复约 99% 所需时间 |
| dprFallbackDelayMs / dprRecoveryDelayMs | 180 / 220ms | 100–500 / 100–700ms | DPR 晚于粒子回退/恢复 |
| dprFallbackMs / dprRecoveryMs | 240 / 1000ms | 120–500 / 600–2000ms | DPR 平滑时间 |
| dprCommitIntervalMs / Threshold | 80ms / .025 | 80–250ms / .025–.1 | 防止逐帧调整渲染目标 |
| postDisableThreshold | .005 | .001–.02 | Bloom 不可见时禁用后处理 |
| maxFrameSeconds | .12s | .05–.25s | 慢帧积分上限；不丢掉连续慢帧 |
| dragThreshold | 4px | 2–10px | 避免轻微点击被当拖动 |
| gentleAmplitude / Speed | .3 / .3 | 0–.5 | 微动相对原自主巡航的幅度/速度 |
| cruiseAmplitude / Speed | 1 / 1 | .5–1.5 | 原自主巡航倍率 |
| transitionSeconds | .7s | .3–1.5s | 镜头预设切换缓停/恢复时间 |

### 验收标准

- 持续拖动/滚轮：粒子先降至约 40%，Bloom 随后关闭，DPR 最多下降 14%；主星球/封面不卸载，Canvas 不重建。
- 输入停止：约 1s 内粒子/Bloom 接近原值，DPR 随后恢复到基准 ±.025；连续重复输入不切换两套画质状态。
- 低品质下交互后不会恢复为高品质；普通指向标签不触发降载。
- 静止预设缓停，微动慢于巡航；切换不跳变，不破坏共线跟随。
- 系统偏好在不刷新时生效；选择的巡航预设在偏好恢复后继续，手动缩放和播放仍正常。
- 持续浏览至少 5 分钟，最后半程 geometry/texture 数量和订阅数不持续增长，音频推进、Canvas 身份保持且没有运行异常。真实硬件另以 60 FPS 为目标，交互 P95 帧耗时 ≤33ms；无头浏览器的软件渲染只能证明功能及资源稳定性，不能证明用户设备 FPS。

## 4. 合并验收清单

- [ ] 播放/指向标签突出，其余淡出；键盘焦点可见。
- [ ] 初始封面接近 8%，背景亮度降低，主体层次清楚。
- [ ] 低频轻推光晕，高频仅影响少量星尘，相机不受频谱影响。
- [ ] 暂停缓释、开关与强度切换不打断原生播放。
- [ ] 近景两行/总览四行，切歌与 seek 同步且无旧歌词。
- [ ] 拖动/滚轮/双指优先削减粒子和后处理，停止后平滑恢复。
- [ ] 低品质恢复上限正确，Canvas/几何复用，持续慢帧能减负。
- [ ] 三种镜头选项及共线目标跟随、释放、手动缩放可用。
- [ ] 解除跟随后锚点平滑回恒星，距离、方位、FOV 和预设不重置，回归过程中可继续滚轮操作。
- [ ] 系统减少动态效果运行时生效，音频继续。
- [ ] 桌面/手机布局安全、连续 5 分钟资源稳定、控制台无运行错误。

## 5. 自测方法

在项目目录运行：

```powershell
cd 'C:\Users\IKUN\Documents\Codex\2026-10-04\referenced-chatgpt-conversation-this-is-an-3\outputs\music-universe'
npm test
npm run build
npm run test:experience
npm run test:lyrics
```

开发服务若未运行，另一个终端 `npm run dev`。浏览器测试使用隔离元数据和真实合成 PCM/WAV，不登录或写入用户账号。

持续浏览：

```powershell
$env:UNIVERSE_SOAK_SECONDS = '300'
npm run test:experience
Remove-Item Env:UNIVERSE_SOAK_SECONDS
```

生产子页面同步及测试：

```powershell
cd 'C:\Users\IKUN\Documents\ChatGPT\腾讯黑客松'
npm run build:universe
cd 'C:\Users\IKUN\Documents\Codex\2026-10-04\referenced-chatgpt-conversation-this-is-an-3\outputs\music-universe'
$env:UNIVERSE_TEST_URL = 'http://127.0.0.1:3002/universe/index.html'
npm run test:experience
Remove-Item Env:UNIVERSE_TEST_URL
```

人工测试：播放授权可用的平台歌曲或导入本地音频，打开“宇宙效果”，切换强度，观察光晕/星尘；暂停看缓释。开启实际跟随并连续缩放，观察歌词两行/四行。拖动/滚轮时在 DevTools Elements 观察 canvas 的 `data-particle-ratio`、`data-post-enabled`、`data-render-dpr`，停止后恢复。Rendering 面板模拟 prefers-reduced-motion: reduce，无需刷新，确认自主运动停止、手动操作和播放继续。再在用户真实设备 Performance 面板采样 30 秒拖动/缩放，核对 P95 与长期稳定性。

测试输出 `tests/reports/universe-experience/` 包含画面、结果与持续浏览样本；`tests/reports/immersive-lyrics/` 包含原切歌/歌词回归记录。具体本次实测数字见工作区 `work/universe-enhancements/verification.md`。

## 回滚及风险

既有源码变更前备份在 `C:\Users\IKUN\Documents\ChatGPT\腾讯黑客松\work\universe-enhancements\backup\universe\`。工作区另保存 scoped.patch，便于逐文件查看，不覆盖其他既有改动。回滚先按 patch 还原本次文件，再重新 build:universe 同步子页面。

Safari/受保护或跨域媒体可能不支持捕获，音频仍原生播放，联动降级。新 Context 仅分析，不承诺自动获得第三方权限。实体扬声器和真实设备 FPS 需要人工验收；浏览器中播放进度与波形采样证明代码路径，不等同于实体听音。初始镜头接近在极窄长屏或超大专辑可能裁切部分外轨，可把 INITIAL_FRAMING_SCALE 调回 1。

## 补充：解除跟随只归还锚点

`src/hooks/useGalaxyNavigation.ts` 的 `releaseFollow()` 先清除跟随目标，再调用 `cameraActions.returnToStarAnchor()`。`SceneInteraction.tsx` 使用现有 `world` 及 `galaxy.star.position` 获取真实恒星世界坐标，`navigation.setAnchor(point)` 同步原 view 状态。`SpaceCameraController.returnToStarAnchor(point)` 用独立 smoothstep 过渡平移注视点和相机，不调用 `recenter`。参数入口 `DEFAULT_CAMERA_ANCHOR_CONFIG`：正常回归 `returnSeconds=0.8s`（建议 .35–1.5s），减少动态效果时 `reducedReturnSeconds=.18s`（建议 .08–.25s）。

保留用户当前缩放距离、轨道方向、FOV、镜头模式和预设；滚轮在锚点回归中仍可改变距离。真正“重置视角”和进入自由镜头的内部解除调用 `releaseFollow(false)`，自动失去目标调用 `suspendFollow()`，各自原动作保持。手动取消后 `followEnabled=false`，后续播放/专辑识别不会擅自重新接管，用户可按 L 或按钮恢复。

验收：先随歌曲星球公转并调近镜头，点击解除、按 L，或关闭当前跟随的音乐星球详情窗；中心在约 0.8 秒内移回恒星，星球不再锁在画面中央，当前距离和方向不跳回首屏。回归中滚轮仍连续，之后播放另一首也保持用户解除选择，恢复跟随/完整重置仍可用。

参考：[R3F 性能指南](https://r3f.docs.pmnd.rs/advanced/scaling-performance)、[MDN 减少动态效果](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)、[MDN captureStream](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/captureStream)、[W3C Media Capture from DOM Elements](https://w3c.github.io/mediacapture-fromelement/)。
