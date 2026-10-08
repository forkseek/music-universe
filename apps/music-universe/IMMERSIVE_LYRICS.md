# 沉浸模式音乐星球与歌词

## 现有实现与接入点

本应用使用 React + TypeScript + Vite + React Three Fiber/Three.js。主站 3002 使用 Next.js，5188 通过 `/mw` 代理主站音乐 API；合并页面 `/universe/` 使用同源 API。

- `src/App.tsx`：复用原星球详情框的位置、选中状态、拖动 hook 和相机入口；挂载 `MusicPlanetPanel`、`useTrackLyrics` 与 `LyricConstellation`。
- `src/hooks/useFloatingPanel.ts`：原有鼠标/触摸拖动与视口夹取，不改拖动算法。
- `src/hooks/useAlbumMusic.ts`：原平台登录检查、匹配与音源解析保留；`playTrack(id)` 改为返回 `started | ready | failed | cancelled`。`pendingId` 是同步的切歌游标；新请求取消旧请求，重复请求同一目标幂等。
- `src/hooks/useAudioPlayback.ts`：仍使用一个 `<audio>`，`load/play/pause/toggle/seek` 是原播放控制接口；`AudioTrackInfo.provider + platformTrackId` 标识歌词资源，`playbackInstance` 标识一次播放实例。
- `src/hooks/usePlaybackAlbum.ts`：接收方可返回 `false`，在新歌曲解析期间暂缓旧歌曲的专辑信息，避免更新错误的 `planetId`。

## 浮窗位置与切歌流程

沉浸模式入口会在没有选择时显示当前歌曲对应星球或专辑第一颗星球。浮窗仍可自由拖动/关闭，默认位于右上角；沉浸模式下行星参数折叠，封面、歌名、歌手、状态和播放控制保留。打开浮窗和切歌不会退出沉浸模式。

上一首/下一首按当前浮窗的专辑曲序选择相邻曲目，首尾按钮禁用；原底部播放器的循环跳转规则保留。按下即更新标题及加载状态，按键提供缩放反馈。快速连续点击从最新请求的曲序继续推进，而不是从旧音频位置重复请求。

解析新音源时当前音频继续播放，旧歌词暂时隐藏；获得可用 URL 后在同一个音频元素上替换资源。解析失败保留原音频，恢复其星球、浮窗与注视目标，并显示“重试切歌”。音频加载/浏览器自动播放失败沿用现有错误反馈，可再按播放。用户手动解除镜头跟随后，正常切歌继续保留该选择；双击星球仍按原约定恢复跟随。

## 歌词数据与同步

主站新增接口：`GET /api/music/{provider}/lyrics?id={platformTrackId}`。

```ts
interface MusicLyrics {
  provider: 'qq' | 'netease' | 'kugou' | 'qishui';
  trackId: string;
  lyric: string;       // 原 LRC，保留换行和时间标签
  available: boolean;
  message?: string;
}
interface LyricLine {
  time: number;        // 秒，与 audio.currentTime 同单位
  text: string;        // 安全文本，不使用 innerHTML
}
```

QQ 复用 `radiohandLyric`；网易云复用已安装库的 `lyric`；酷狗复用 `handleKugouLyric`；汽水复用 `handleQishuiLyric`。歌词查询按当前歌曲原平台 ID，不按歌名跨平台猜测。酷狗只有 mix-song ID 而没有歌曲 hash 时明确不可用。服务端保留同源、用户会话、限流及错误脱敏，歌词查询不传账号 Cookie。上游缺少歌词或超时不影响播放。

`src/lib/lyrics.ts` 的 `parseLrc` 支持 BOM、offset 毫秒、多个时间戳、1–3 位小数、乱序标签；相同时间的重复文本去重，允许合并一条翻译，空时间行用于清空间奏字幕。最大 512 KiB、2000 个时间标签，每段文本最大 500 字符。

`useTrackLyrics` 自动监听歌曲身份，取消前一次查询、校验响应平台与 ID，换曲时在渲染阶段立即隐藏旧歌词。24 条有界内存缓存，平台歌词 10 分钟有效；导入 LRC 只在浏览器处理并绑定到当前曲目。无平台标识的本地文件/URL 也可导入 LRC，导入入口同时在音乐搜索和正在播放的星球浮窗提供。无效导入显示错误并保留已经有效的当前歌曲歌词。

`LyricConstellation` 从真实音频元素的 `currentTime` 二分定位当前行；播放时约 12 次/秒读取，只在行索引变化时更新 React 状态。`seeked/seeking/timeupdate/pause/ratechange` 等事件立即同步，不以页面计时器推算歌曲进度。暂停、向前/向后拖动、倍速均使用同一时间轴。切歌/不可用歌词立即撤掉字幕。

## 参考图视觉与安全区

桌面默认四层：前一句、当前句、下一句、远处下一句；手机及矮屏三层。透明背景、衬线字、暖金当前行、暗淡前后文、轻微透视与颗粒感来自参考图。字幕位于下方中央，测量播放器及可拖动浮窗，碰撞时缩窄移到侧边或上移，并处理底部安全区；不接收指针，不阻挡场景操作。

参考图没有字体文件或动画时间规格，因此使用本地 Georgia/宋体等衬线 fallback。桌面当前行约 25–40 px、上下文 16–25 px；手机当前行 21–27 px、上下文 14 px。主色 `#f7dfbd`，暖金渐变 `#d7b18b → #fff9e7 → #e0b992`，前/后/远行透明度约 `.30/.51/.17`。可在 `src/lyric-constellation.css` 调整字体、字号、行距、透明度、阴影、倾斜和 0.6 秒凝聚动画。

粒子采用短时 Canvas 2D，不增加 WebGL 场景：移动端约 160、桌面约 280 粒，920 ms 换行过渡后停止；动态偏好减少时禁用粒子和进场动画。`--lyric-progress` 驱动当前行的光扫效果。视觉参数不是逐字卡拉 OK 时间戳，普通 LRC 只提供逐行高亮精度。

## 运行与验收

```powershell
# 此项目
npm run dev
npm test
npm run test:lyrics

# 主站目录 C:\Users\IKUN\Documents\ChatGPT\腾讯黑客松
npm run check
npm run build:universe
npm run dev -- --port 3002
```

1. 关闭操作指南，进入沉浸模式；音乐星球浮窗可见、可拖动，可单独关闭。
2. 播放歌曲，点击上一首/下一首；封面、标题、播放状态、歌词与对应星球同步，仍处于沉浸模式。
3. 快速连续点击；最终歌曲为最后请求，主 3D canvas 不卸载，旧音源/歌词响应不能覆盖新状态。
4. 第一首与最后一首浮窗按钮正确禁用；没有音源时显示错误，可重试，原音频仍可播放。
5. 暂停、继续、拖动播放进度向前/向后；歌词跟随实际音频时间。
6. 播放本地音频或 URL，导入包含时间标签的 LRC；字幕正确同步，换歌后不套用其他歌曲的本地歌词。
7. 无歌词的歌曲不显示上一首字幕；错误/超大/无时间标签的导入给出反馈。
8. 手机查看三行，打开底部播放器及拖动浮窗，歌词避让；减少动态偏好关闭粒子。
9. 手动解除相机跟随后再切歌，仍保留自由浏览。

`tests/immersive-lyrics.mjs` 使用隔离的 API 替身和合成 WAV 验证真实浏览器音频/交互，不代表所有第三方平台歌曲均有音源/歌词；主站 `tests/music-lyrics.test.ts` 覆盖平台 ID、超时、取消、有界缓存和响应脱敏。

既有文件改动前备份位于主站 `work/immersive-lyrics/backup/`；本次改动说明及截图、测试结果与备份分开保存，回滚时仅恢复对应文件并删除本次新增文件，随后重新同步 universe 构建。
