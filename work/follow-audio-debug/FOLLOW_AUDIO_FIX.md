# 跟随画面与音频播放修复

已修改并运行当前 5188 前端：React + TypeScript + Vite + React Three Fiber / Three.js。音乐搜索与音源解析仍使用已有的 3002 服务，共用一个原生 HTMLAudioElement。

## 1. 问题定位与修复方案概述

### 跟随模式频闪

确认存在两个像素比管理入口：Canvas 的 `dpr={[1, 1.5]}` 与 RenderQualityController 的 `setDpr()`。检查当前安装的 R3F 实现发现，Canvas 再次提交配置时会恢复自身请求的 DPR；播放进度更新会触发 React 提交。这会与性能控制器的降采样冲突，造成画布缓冲区反复调整。

排查中捕获过一次画布尺寸先降至 1044×696、随后返回 1800×1200，以及一次镜头回到初始位置的跳变。后续修改前采样并未持续复现，因此这些记录不能证明所有频闪都由同一原因造成。代码同时存在每次渲染创建相机配置对象的风险。

修复：相机使用生命周期内稳定的 PerspectiveCamera 实例；DPR 使用同一个 React 状态作为 Canvas 与性能控制器的共同配置。保留原来的跟随、公转、缩放、拖动和用户解除跟随逻辑。

### 音乐无声

实际检查发现默认 Windows 输出音量只有 5%～6%，未静音；已调至 30%，输出设备与静音设置保持原值。这是影响所有音源的一项实际环境因素，但不能单凭低音量解释全部播放失败。

在现场浏览器记录及独立 Chromium 测试中，也观察到音频真实播放、未静音、页面音量 0.8，因此没有将“所有接口都失败”作为结论。另确认两项代码缺陷：

- 平台 URL 解析、本地标签读取发生在异步操作后，首次播放可能失去浏览器用户手势许可。之前点击同一搜索结果重试又会先请求接口，无法保证直接重试已经准备好的音源。
- `play()` 拒绝后统一设置暂停和通用提示，可能覆盖原生资源/解码错误；读取元数据也可能过早标记正在播放。

修复：在用户操作中同步用同一个音频元素准备播放；被浏览器阻止时保留已经解析的音源，下一次点击直接调用播放；保留原生 MediaError；元数据加载不再等同于播放成功。静音准备音频不会启动歌曲识别与镜头跟随，也不会修改用户音量。

本次实机记录没有捕获 NotAllowedError；此恢复分支通过故障注入验证，不能当作已经确认的现场错误。

## 2. 具体代码修改

所有路径相对于本项目目录 `C:\Users\IKUN\Documents\Codex\2026-10-04\referenced-chatgpt-conversation-this-is-an-3\outputs\music-universe`。

| 文件 | 修改 |
| --- | --- |
| `src/components/GalaxyScene.tsx` | 持久相机对象；DPR 统一交给 Canvas 状态管理 |
| `src/hooks/useAudioPlayback.ts` | 用户手势准备播放、blocked 状态、即时重试、保留原生错误、过滤准备音频事件 |
| `src/hooks/useAlbumMusic.ts` | 星球播放在请求平台音源前准备播放许可 |
| `src/components/MusicSearch.tsx` | 搜索结果被阻止后直接重试现有音源；打开文件选择器前准备播放 |
| `src/lib/playbackFailure.ts` | 可复用的资源、网络、解码及播放许可错误分类 |
| `tests/playbackFailure.test.ts` | 原生错误与播放许可分支测试 |
| `tests/audio-recovery.mjs` | 拒绝自动播放后重试、真实平台音频信号、404 URL 测试 |
| `tests/follow-rendering.mjs` | 高 DPR 连续跟随、相机实例/重置、缓冲区变化、三类音源信号测试 |
| `package.json` | 新增上述两个测试入口 |

关键相机修改：

```diff
- camera={{ position: [0, -0.65, 34], fov: 36, near: 0.1, far: ... }}
- dpr={[1, 1.5]}
+ const [camera] = useState(() => new PerspectiveCamera(36, 1, 0.1, 400))
+ const [renderDpr, setRenderDpr] = useState(() => Math.min(window.devicePixelRatio || 1, 1.31))
+ camera={camera}
+ dpr={renderDpr}
```

上面是概念性摘录。完整可应用的逐文件 diff 见同目录 `follow-audio-fix.patch`，当前运行代码已经包含这些修改，无须再次应用。

直接重试分支：

```ts
if (audio.blocked && audio.getTrack()?.id === `${song.provider}:${song.id}`) {
  void audio.play()
  return
}
audio.primePlayback()
// 再执行原来的平台解析请求。
```

## 3. 验证步骤

已完成：

- TypeScript 检查和生产构建通过，66 项单元测试通过。
- DPR 2 下连续跟随采样：相机 1 个、控制器 1 个、重置 0 次；仅一次正常性能调整引起的缓冲区尺寸变化。没有记录到回到初始位置的跳变。
- `test:follow` 通过：播放后跟随、缩放、拖动、解除/恢复、暂停继续、切歌、390px 窄屏控制、无标签歌曲不跟随旧星球。
- 原生音频链连接分析器及输出目的地：本地 WAV RMS 0.0433，平台实时网易云歌曲 RMS 0.0075，URL WAV RMS 0.0432，均非零。URL 成功测试使用受控 HTTP 响应；平台搜索和播放使用真实服务。
- 注入一次 NotAllowedError 后再次点击播放成功，平台解析请求仍为一次；404 音频地址显示原生资源错误。未捕获页面 JavaScript 错误。
- 临时诊断模块、导入和本地收集进程已清理。

复查页面：

1. 刷新 `http://127.0.0.1:5188/`，关闭操作指南，播放一首歌曲。
2. 连续浏览，滚轮缩放、拖动环绕，点击“解除跟随”再恢复。
3. 分别测试本地文件、可直接访问的音频 URL，以及音乐搜索结果。被浏览器拦截时再点击播放一次；无效地址应显示明确错误。

在项目目录运行检查（5188 前端、3002 音乐服务需运行）：

```powershell
npm test
npm run build
npm run test:follow
npm run test:audio-recovery
npm run test:follow-rendering
```

结果摘要见 `follow-audio-verification.json`。浏览器测试不带自动播放放行参数；音频验证移除了测试浏览器默认的静音参数。

## 4. 回归风险与注意事项

- 本次系统音量调整影响默认输出设备上的其他应用；可通过系统音量滑块恢复。
- 检查已证明浏览器音频解码链有非零信号，尚不能替代现场确认实体扬声器、耳机连接、宿主页签静音及每应用音量。
- 实时平台回归验证使用网易云。其他平台的账号授权、会员、版权、地区及 URL 有效期限制依旧遵循已有服务；无法播放时应按实际错误检查，不保证每个平台每首歌曲可用。
- 移动浏览器的播放许可可能仍要求第二次明确点击；直接重试路径已提供。
- GPU/驱动差异可能造成不同的视觉表现；现有自适应画质保留，DPR 可正常缓慢调整，避免双重管理引起反复恢复。
