# 播放歌曲时跟随星球

播放成功后，镜头在约 0.8 秒内平滑转向当前歌曲的星球，随后每帧使用它的完整世界坐标作为注视点。星球公转、星系整体旋转、轨道倾角和 Z 轴深度均计入。保持用户当前缩放比例，滚轮与双指缩放以锁定星球为中心，拖动空白处围绕它旋转。

右下角的按钮在沉浸模式和手机上都可操作：点击「解除跟随」保留当前镜头注视点，音乐继续播放；点击「跟随当前歌曲」恢复。键盘 L 执行同样操作。手动解除在当前页面内持续生效，暂停、恢复、切歌或晚到的专辑请求均不会重新锁定。回正或进入自由镜头也会解除。双击星球主动播放时重新启用自动跟随。

新歌曲暂未映射到星球时，镜头先保留原位置；自动专辑识别完成后再跟随。无标签、无法识别的歌曲不会错误地跟随上一首歌的星球。

## 接入位置

- `src/App.tsx`：通过真实音频播放状态、当前 `planetId` 和自动专辑识别结果启用跟随，所有现有播放入口共用此流程；提供按钮和 L 快捷键。
- `src/hooks/useGalaxyNavigation.ts`：维护跟随目标、用户是否允许自动跟随和每帧目标位置。`follow(id)` 锁定；`releaseFollow()` 解除并禁用自动跟随；`suspendFollow()` 暂停锁定但保留用户偏好。
- `src/components/SceneInteraction.tsx`：`CameraFollow` 在模拟公转与星系旋转之后采样世界坐标，再交给 `CameraDirector`。动画暂停时也能锁定静态星球。
- `src/lib/spaceCamera.ts`：纯相机计算。使用有限时长的平滑过渡获取目标，锁定之后直接跟随目标坐标，避免对移动目标持续阻尼所产生的滞后。解除时保留真实渲染中心，包括深度。
- `src/lib/galaxyNavigation.ts`：`GalaxyView.centerZ` 保存锁定或解除后的 3D 注视点深度，不影响现有连续缩放。
- `src/playback-follow.css`：沉浸模式与手机的跟随按钮。

目标数据与渲染层分离：

```ts
interface CameraFollowTarget {
  id: string                  // 当前歌曲对应的星球 ID
  position: [number, number, number] // 世界坐标，已包含父层变换
}

controller.update(dt, view, cinematic, reducedMotion, orbitalDt, followTarget)
```

## 验证

```powershell
npm test
npm run build
npm run test:follow
```

`npm test` 包含 6 项新增镜头行为测试：移动目标保持画面中心、缩放与拖动保持锁定、切歌平滑过渡、解除不跳动且保留 Z 深度、不同帧率表现一致、无效目标与回正处理。

浏览器测试需要前端 5188 和音乐服务 3002 正在运行。测试使用带标签的合成 WAV 触发真实音频播放，实时请求 IGOR 的专辑信息，不伪造播放状态或专辑结果；检查桌面/手机、切歌、解除、暂停/继续、恢复、无标签歌曲与后续识别。截图和数据写入 `tests/reports/playback-follow/`。

本次验证记录见 `playback-camera-verification.json`，预览见 `playback-follow-desktop.png` 和 `playback-follow-mobile.png`。
