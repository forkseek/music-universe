# 恒星—星球轴向跟随与专辑色调光照

当前运行页面：`http://127.0.0.1:5188/`。实现采用现有 React / TypeScript / Vite / React Three Fiber / Three.js 结构。

## 相机 → 星球 → 恒星

新增的轴向位置规则：

```ts
// 全部为世界坐标；d 沿用现有跟随半径和滚轮缩放。
direction = normalize(planetPosition - starPosition)
cameraPosition = planetPosition + direction * d
camera.lookAt(planetPosition)
```

相机位于星球外侧，星球位于相机和恒星之间。恒星及星球通过同一个世界变换转换坐标，包含星系整体旋转、轨道倾斜、Z 深度和父级变换。锁定后逐帧使用真实位置，不对运动中的星球做延迟滤波。

进入跟随或切换目标时，从当前镜头方向平滑转到该连线：使用原有 smoothstep 风格，默认 0.8 秒。过渡期间不强制瞬间共线，完成后严格共线。原来的视线目标获取、镜头距离与缩放阻尼保留。经过世界 Y 轴附近时平行运输朝上向量，避免固定世界朝上向量导致翻转。

跟随期间，滚轮继续改变距离；空白拖动的环绕角度受到轴线约束。点击“解除跟随”或按 L 后，保留当前镜头姿态并恢复自由环绕。R 自由镜头和 K 回正继续使用原有控制入口。恒星表面旋转不影响其中心与跟随轴线。

`src/lib/spaceCamera.ts` 的 `DEFAULT_CAMERA_FOLLOW_CONFIG` 是调参入口：

| 参数 | 默认值 | 含义 |
| --- | --- | --- |
| `axisAcquireSeconds` | 0.8 秒 | 新轴线方向的平滑获取时间；更大时转向更慢 |
| `axisEpsilon` | 0.00001 | 恒星—星球距离低于此值时不强制归一化轴线 |

也可以在 `SpaceCameraController` 的第四个构造参数传入配置。距离与缩放继续由现有 `framing.distance`、`view.zoom` 和缩放阻尼管理。

```ts
new SpaceCameraController(camera, framing, onModeChange, {
  ...DEFAULT_CAMERA_FOLLOW_CONFIG,
  axisAcquireSeconds: 1.2,
})
```

## 专辑封面驱动恒星光照

复用 `useAlbumTexture()` 已经加载的图片，在图片加载成功时采样一次 64×64 像素，不增加图片请求。量化颜色直方图对彩色内容给予更高权重，减少黑白边框的影响；同时计算透明度加权的线性 RGB 平均亮度。

可复用的数据和函数位于 `src/lib/albumLighting.ts`：

```ts
interface AlbumTone {
  dominant: [number, number, number] // sRGB 主色，每通道 0～1
  luminance: number                 // 线性相对亮度，0～1
  samples: number                   // 有效像素数
}

extractAlbumTone(rgbaPixels)             // 纯像素分析
sampleAlbumTone(loadedImage, sampleSize) // 图片采样；像素读取失败返回 null
mapAlbumToneToLight(tone, options)       // 主色、光强倍率、光晕强度
createAlbumLightState(options, radius)  // 跨专辑保留的可变光照状态
advanceAlbumLight(state, delta)         // 帧率独立的过渡
```

保留主色色相，限制 HSL 饱和度与明度。光强曲线为：

```ts
x = clamp(luminance, 0, 1) ** luminanceGamma
curve = x * x * (3 - 2 * x)
intensityScale = lerp(minIntensityScale, maxIntensityScale, curve)
targetPointPower = starRadius * pointPowerPerRadius * intensityScale
```

同一映射驱动恒星真实点光源、外层光晕及封面球体边缘发光。封面图像仍是恒星核心。过渡状态放在带专辑 generation key 的场景内容之外，切换专辑时从当前颜色和实际光强开始；恒星大小变化引起的光强变化也参与平滑处理。暂停公转时，按需渲染继续完成光照过渡。

`DEFAULT_ALBUM_LIGHTING_CONFIG` 为当前画面的统一调参入口：

| 参数 | 默认值 | 含义 |
| --- | --- | --- |
| `sampleSize` | 64 | 取色画布边长；采样实现限制为 8～128 |
| `fallbackColor` | `#edbe72` | 图片像素不可读取时的备用光色 |
| `maxSaturation` | 0.72 | 光色饱和度上限，灰度封面保持灰度 |
| `minColorLightness` / `maxColorLightness` | 0.48 / 0.72 | 光色明度范围；不修改封面本身 |
| `minIntensityScale` / `maxIntensityScale` | 0.78 / 1.12 | 相对于原有恒星点光强度的倍率范围 |
| `minCorona` / `maxCorona` | 0.48 / 0.72 | 恒星光晕强度范围 |
| `luminanceGamma` | 0.6 | 亮度曲线形状；数值越大，中低亮度封面的光强越低 |
| `transitionSeconds` | 0.6 秒 | 指数过渡的时间常数；约 1.8 秒完成 95% 的变化 |
| `pointPowerPerRadius` | 14 | 原有恒星半径与点光强度的比例 |

映射函数也支持局部参数，便于未来接入用户设置：

```ts
const profile = mapAlbumToneToLight(tone, {
  minIntensityScale: 0.85,
  maxIntensityScale: 1.05,
  luminanceGamma: 0.8,
})
```

当前场景使用统一默认配置，修改该配置即可调整所有专辑表现，没有为 IGOR、Blonde 等专辑建立独立硬编码颜色表。

## 修改文件

文件均相对于本项目目录：

| 文件 | 修改内容 |
| --- | --- |
| `src/lib/spaceCamera.ts` | 轴向参数、获取过渡、共线位置、朝上向量运输、保持姿态解除 |
| `src/components/SceneInteraction.tsx` | 采集恒星与星球的世界坐标，复用已有跟随引用 |
| `src/hooks/useAlbumTexture.ts` | 复用加载图片取色，传递色调回调 |
| `src/lib/albumLighting.ts` | 新增可复用的色调提取、曲线映射和光照过渡 |
| `src/components/GalaxyScene.tsx` | 持久光照状态、真实点光、外层光晕、跨专辑过渡 |
| `src/lib/spaceMaterials.ts` | 将封面边缘固定颜色改为可更新的光色与强度 uniform |
| `src/App.tsx` | 更新已有操作指南中的跟随说明 |
| `tests/axisFollow.test.ts` / `tests/albumLighting.test.ts` | 共线、极点、帧率、颜色及亮度边界回归 |
| `tests/axis-lighting.mjs` | 浏览器验证上传封面、暂停过渡、公转跟随及缩放/解除 |
| `tests/follow-rendering.mjs` | 原有渲染回归适配径向跟随；等待轴线获取完成后采样 |
| `package.json` | 新增 `test:axis-lighting` 检查入口 |

完整 diff 见同目录 `axis-lighting.patch`，当前运行代码已应用这些修改。

## 验证

检查入口（浏览器测试需要 5188 前端、3002 音乐服务运行）：

```powershell
npm test
npm run build
npm run test:axis-lighting
npm run test:follow
npm run test:follow-rendering
```

涵盖：运动中的世界坐标共线、相机/星球/恒星顺序、视线中心、切歌过渡、缩放、解除后自由拖动、垂直方向防翻转、30/144 FPS 一致性、颜色保持、透明像素、黑白封面、亮度边界、异常图片回退、上传红/蓝封面、暂停场景时光照过渡、一次取色和窄屏控制。具体结果见 `axis-lighting-verification.json`。

## 使用边界

- 严格共线意味着跟随时不能同时自由改变环绕角度；解除跟随可自由浏览。
- 方向获取期间保留平滑过渡，完成后才满足精确共线。极端快速公转时，相机随真实轴线运动；更改轴线获取时间只影响进入/切换时的转向。
- 完全重合或无效的恒星坐标使用原有跟随方式，避免无效向量。
- 封面主色是算法估计。多色拼贴可能偏向其中的彩色区域，黑白封面输出受限的中性光色。
- 图片的 CORS 限制可能阻止像素读取，此时使用受限的备用光色；图片本身无法加载时仍遵循原有封面加载错误处理。
- 光强上下限约束的是恒星点光和光晕，最终观感仍由已有全局光照、材质和色调映射共同决定。
