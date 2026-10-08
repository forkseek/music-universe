# 专辑宇宙优化与大厅合并

本次改动已应用到本地代码。大厅入口为 http://127.0.0.1:3002/#hall，宇宙子页面为 http://127.0.0.1:3002/#universe。5188 的独立开发入口保留。

界面、构建、桌面和手机交互、本地音频输出已验证。QQ 官方账号授权代码及接口替身测试已完成；本地没有配置 QQ_CONNECT_*，**真实扫码及真实账号昵称/头像尚未验收**。QQ 互联身份授权不提供 QQ 音乐会员或歌曲播放权限。

## 1. 恒星封面拼接

**问题分析：** 原材质在很窄的侧面区域混合两张完整封面，容易出现接缝和人物重影。

**修改方案：** 保留前后半球的清晰封面，侧面采用共享的封面边缘颜色，经过少量纵向模糊与五次平滑插值过渡。连接处两侧使用同一组采样颜色，封面核心、球形结构、现有色调光照和旋转惯性保持原有行为。

**关键代码/配置：**

- [spaceMaterials.ts](C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/src/lib/spaceMaterials.ts)：`createAlbumSurface(cover, options)`。
- [albumSurface.ts](C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/src/lib/albumSurface.ts)：`albumSurfaceConfig()`，统一默认值和有效范围。

```ts
createAlbumSurface(cover, {
  seamWidth: 0.32, // 球面归一化坐标下的过渡带半宽，范围 0.08–0.6
  edgeInset: 0.065, // 封面边缘采样内缩距离，范围 0.01–0.2
  edgeBlur: 0.045, // 侧面颜色的纵向模糊半径，范围 0–0.12
})
// 过渡权重：t³ × (t × (6t − 15) + 10)
```

**验证方式：** `npm run test:rotation` 已通过：实际前后半球旋转、超过 360° 的拖动、释放惯性、暂停、再次抓取制动、减少动态效果偏好、真实手机触摸及双指缩放。检查了前后视图截图。不同封面可继续通过上传和侧向旋转人工检查；明显的左右边缘色差会变成柔和的侧面色带，不会自动补画原封面缺失内容。

## 2. 沉浸模式底部弹窗

**问题分析：** 原先只按鼠标位置立即开关，靠近底部时容易误触，进度拖动、队列操作和关闭时缺少稳定的停留逻辑。

**修改方案：** 鼠标靠近底部停留后展开，离开延迟收起；鼠标进入播放器、拖动进度、键盘操作或打开队列/搜索时保持展开。手机点击底部把手或上滑展开，下滑或点击关闭按钮收起，点击场景也可收起。手动关闭后不会在同一底部位置立刻重开。动画取消回弹，采用平滑移动和淡入淡出。

**关键代码/配置：**

- [useImmersivePlayer.ts](C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/src/hooks/useImmersivePlayer.ts)：计时器、手势、键盘焦点和弹窗状态。
- [App.tsx](C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/src/App.tsx)、[PlayerBar.tsx](C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/src/components/PlayerBar.tsx)、[glass-ui.css](C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/src/glass-ui.css)：把手、关闭按钮及过渡。

```ts
IMMERSIVE_PLAYER_CONFIG = {
  edge: 56,          // 距离窗口底部的触发高度，px
  openDelay: 280,    // 展开前停留，ms
  closeDelay: 900,   // 离开后收起延迟，ms
  swipeDistance: 32 // 手机滑动阈值，px
}
```

动画为 460ms、`cubic-bezier(.22, .8, .25, 1)`。修复了透明进度条遮挡关闭按钮的问题。计时器和监听器在退出沉浸模式或卸载时清理，不进入 3D 每帧循环。

**验证方式：** 桌面测试覆盖短暂掠过不展开、停留展开、离开延迟收起、队列保持和手动关闭；390×844 手机测试使用真实触摸事件验证点击把手、上滑和关闭，并等待动画完成后截图。

## 3. 扫码登录、账号资料与音源边界

**问题分析：** 旧 QQ 流程借用 QQ 音乐网站的应用 ID，并尝试提取其网页登录凭证。确认 QQ 账号后仍无法可靠完成 QQ 音乐授权；QQ 身份凭证与 QQ 音乐播放凭证也被混用。这条流程不能用来满足本次合规接入要求。

**修改方案：** QQ 分支改用本应用注册的 QQ 互联 OAuth，扫码界面由 QQ 官方授权页面提供。本项目只接收经校验的授权回调，通过官方接口取得 OpenID、昵称和头像。没有合法应用配置时明确返回未配置状态，不显示虚假的二维码或登录成功。

**关键代码/配置：**

- [qq-oauth.ts](C:/Users/IKUN/Documents/ChatGPT/腾讯黑客松/src/lib/music/providers/qq-oauth.ts)：`startQqOAuth → completeQqOAuth → qqOAuthStatus`；`cancelQqOAuth`、`logoutQqOAuth`。
- [QQ 回调路由](C:/Users/IKUN/Documents/ChatGPT/腾讯黑客松/src/app/api/qq/login/callback/route.ts)：HttpOnly 会话绑定、随机 state 验证和无凭证完成页。
- [头像路由](C:/Users/IKUN/Documents/ChatGPT/腾讯黑客松/src/app/api/qq/avatar/route.ts)：QQ 域名限制、响应类型和大小限制，兼容现有页面安全策略。
- [MusicSearch.tsx](C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/src/components/MusicSearch.tsx) 及 [MusicPlayer.tsx](C:/Users/IKUN/Documents/ChatGPT/腾讯黑客松/src/components/player/MusicPlayer.tsx)：用户点击时打开官方授权窗口，轮询结果，取消/重试/离开时清理请求和窗口。

```text
官方授权页：GET https://graph.qq.com/oauth2.0/authorize
授权码交换：GET https://graph.qq.com/oauth2.0/token
身份识别：  GET https://graph.qq.com/oauth2.0/me
昵称头像：  GET https://graph.qq.com/user/get_user_info
```

授权码、Access Token 和 Refresh Token 不返回给前端。令牌复用现有账号库的 AES-256-GCM 加密保存，账号身份绑定当前会话；登录任务有效期 4 分钟，资料缓存 60 秒，令牌到期前 60 秒开始检查续期，同一账号并发续期合并为一次。注销或取消后的迟到响应不能重新写入账号。兼容官方 JSON、表单文本和 JSONP 数据格式，未执行返回脚本。Next 开发日志跳过授权回调和带播放票据的音频请求，避免记录 URL 中的临时凭证。

在主项目本地 `.env.local` 配置以下**自己的、获准使用的**参数，不要将 App Key 发到聊天或提交到 Git：

```dotenv
QQ_CONNECT_APP_ID=<本应用的 App ID>
QQ_CONNECT_APP_SECRET=<本应用的 App Key>
QQ_CONNECT_REDIRECT_URI=https://<已登记域名>/api/qq/login/callback
APP_ORIGIN=https://<同一已登记域名>
MUSIC_CREDENTIAL_SECRET=<稳定的服务端加密密钥>
```

回调地址必须与官方登记值和访问站点匹配。当前的 127.0.0.1 页面不等于已登记的官方回调环境，需要 QQ 互联允许的开发配置或可访问的登记域名。填写后重启服务。没有设置 `MUSIC_CREDENTIAL_SECRET` 时沿用项目在数据库旁生成的本地密钥文件；迁移数据库时需一起保留该文件，不能随意更换已有加密密钥。

`authorized` 表示 QQ 身份授权；新增 `musicAuthorized: false` 明确表示不能把这枚身份令牌当作 QQ 音乐播放许可。音源需要项目已有的、获授权的平台环境或 SDK。保留本地文件、用户提供的合法音频地址和现有播放错误处理。本次没有新增抓 Cookie、会员绕过或假账号来源，也没有声明所有平台歌曲都可用。

**验证方式：** 12 个 QQ 官方接口替身测试已通过，覆盖缺少配置、回调域名/state/应用身份校验、真实资料字段解析、加密存储、缺失昵称拒绝、重复回调、缓存刷新、取消与过期、并发续期、注销后迟到响应和头像回退。这些测试只证明本地协议与状态逻辑，不能替代第三方真实授权。合并页面的实际本地 WAV 播放测得非零 PCM 输出；独立页面的跟随与音频回归也测得本地和单首在线样本的非零输出。

官方参考：[授权码获取令牌](https://wiki.connect.qq.com/使用authorization_code获取access_token)、[获取用户资料](https://wiki.connect.qq.com/get_user_info)、[获取 OpenID](https://wiki.connect.qq.com/获取用户openid_oauth2-0)。腾讯连连 H5 音乐 SDK 的运行环境要求参见[官方文档](https://cloud.tencent.com/document/product/1081/67456)。

## 4. 页面合并与动画

**问题分析：** 原大厅入口直接打开另一个端口，导致跳转体验和部署割裂；资源路径、会话和页面安全策略也需要适配同站点运行。

**修改方案：** 大厅进入 `/#universe` 子页面，宇宙的 Vite 构建同步到主站 `/universe/`，以同站点全屏 iframe 运行。源码仍分开维护，保留既有 Three.js、播放器和视角逻辑；运行合并页面时不依赖 5188 服务。

**关键代码/配置：**

- [AlbumUniverseRoom.tsx](C:/Users/IKUN/Documents/ChatGPT/腾讯黑客松/src/components/home/AlbumUniverseRoom.tsx)、[StagedHome.tsx](C:/Users/IKUN/Documents/ChatGPT/腾讯黑客松/src/components/home/StagedHome.tsx)：子页面路由、挂载和加载反馈。
- [SceneTransition.tsx](C:/Users/IKUN/Documents/ChatGPT/腾讯黑客松/src/components/home/SceneTransition.tsx)、[album-universe.css](C:/Users/IKUN/Documents/ChatGPT/腾讯黑客松/src/app/album-universe.css)：深蓝/暖金轨道过渡与加载动画，宇宙往返和加载层没有可见小字。
- [useHallEmbedding.ts](C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/src/hooks/useHallEmbedding.ts)：场景准备完成通知及返回大厅消息。父页面验证消息来源窗口、origin 和路由白名单。
- [sync-universe.mjs](C:/Users/IKUN/Documents/ChatGPT/腾讯黑客松/scripts/sync-universe.mjs)：构建、同步、字体 URL 适配及 SHA-256 资源清单。
- [deployment.ts](C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/src/lib/deployment.ts)：合并环境直接访问同站点 API，独立开发环境继续走 `/mw` 代理。

只有 `/universe/` 静态子页面允许同站点嵌入；主页面原有 CSP 与禁止嵌入策略保留。子页面允许现有图片和媒体来源，并允许播放器解锁权限所需的内置 WAV。加载超过 45 秒显示重试/返回图标。可见加载层无文字，辅助技术使用 aria 标签。减少动态效果偏好继续生效。

**验证方式：** 生产构建成功；开发和生产浏览器测试覆盖大厅进入、全屏尺寸、默认封面/字体/背景加载、准备完成后淡出、返回大厅、伪造消息拒绝，以及两种页面安全头差异。退出子页面时卸载播放器，与原离开页面行为一致。

## 5. JSON 与请求复用

**问题分析：** 专辑恢复、历史记录和不同音乐请求各自解析/存储 JSON，损坏数据或服务返回 HTML 时容易打断流程。

**修改方案：** 复用经过形状校验的 JSON 存储，限制大小，缓存未改变的解析结果，跳过重复存储写入；统一网络 JSON 和错误响应处理，合并并发会话创建。只对可安全重试的 GET 在会话失效时恢复一次，不自动重复登录或播放写入操作。

**关键代码/配置：**

- [json.ts](C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/src/lib/json.ts)：`createJsonStore<T>(storage, key, guard, maxChars)`、`jsonRecord()`。
- [explorationSession.ts](C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/src/lib/explorationSession.ts)、[playHistory.ts](C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/src/lib/playHistory.ts)：复用存储，保留原数据键。
- [musicWorldTransport.ts](C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/src/lib/musicWorldTransport.ts)：`musicWorldRequest<T>()`，服务不可达时提供可读错误。

默认 JSON 上限为 8 Mi 字符，历史记录上限为 512 Ki 字符/60 条，恢复专辑校验 1–300 首曲目和唯一 ID。计时器、请求和材质仍按组件生命周期清理。本次未增加运行时依赖。

**验证方式：** 新增 3 个 JSON 测试覆盖损坏、错误形状、超长数据、缓存命中、重复写入、外部存储变更和存储不可用。宇宙总计 80 个单元测试通过，主站 153 个测试通过，主站 lint/TypeScript 检查通过。没有进行全项目性能基准测试，因此不声明帧率提升百分比。

## 运行与重新构建

Node 24 与现有锁文件兼容。依赖已存在，本次没有安装额外包。

```powershell
Set-Location 'C:\Users\IKUN\Documents\ChatGPT\腾讯黑客松'
npm run build:universe
npm run dev -- --port 3002
```

打开 http://127.0.0.1:3002/#hall。修改宇宙源码后重新运行 `build:universe`；单独开发可在宇宙目录运行 `npm run dev`，访问 5188。

完整生产运行：

```powershell
Set-Location 'C:\Users\IKUN\Documents\ChatGPT\腾讯黑客松'
npm run build
$env:PORT='3002'
npm run start
```

开始生产服务前停止占用同一端口的开发服务。`npm run build` 自动包含宇宙同步；部署到另一机器时设置 `.env.local` 的 `MUSIC_UNIVERSE_SOURCE` 为实际宇宙源码位置，或携带已同步且有清单的 `public/universe`。

## 测试证据与回滚

- [生产界面和本地音频测试结果](C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/tests/reports/universe-polish/production/results.json)
- [旋转回归结果](C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/tests/reports/universe-polish/music-universe-rotation-report.json)
- [跟随与音频回归结果](C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/tests/reports/follow-rendering/after-results.json)
- [主站本次改动 diff](C:/Users/IKUN/Documents/ChatGPT/腾讯黑客松/work/universe-polish/main.patch)
- [宇宙本次改动 diff](C:/Users/IKUN/Documents/ChatGPT/腾讯黑客松/work/universe-polish/universe.patch)
- [回滚脚本](C:/Users/IKUN/Documents/ChatGPT/腾讯黑客松/work/universe-polish/rollback.ps1)、[改动清单](C:/Users/IKUN/Documents/ChatGPT/腾讯黑客松/work/universe-polish/rollback-manifest.json)

两个 diff 共包含 53 个本次源文件改动，已通过反向应用检查。回滚脚本默认只预览，已验证全部目标路径及 SHA-256；没有执行实际回滚。它只恢复本次修改前的源文件、删除本次新增源文件，发现后续修改会停止；不修改数据库、账号密钥、原有其他改动或生成资源。

```powershell
Set-Location 'C:\Users\IKUN\Documents\ChatGPT\腾讯黑客松'
# 预览
& '.\work\universe-polish\rollback.ps1'
# 确需回滚时，先停止相关服务，然后执行并重新构建
& '.\work\universe-polish\rollback.ps1' -Apply
```

## 剩余验证与注意事项

1. 必须有可用的官方 QQ 应用、登记回调域名及真实手机确认，才能验收扫码、真实昵称/头像、刷新和注销。旧借用应用的二维码不再适用。
2. QQ 账号登录不等于 QQ 音乐播放授权。会员歌曲、地区限制和第三方服务不可用都不能通过换身份凭证解决；需要平台允许的实际音源环境。
3. 合并后浏览器存储属于 3002 站点，原 5188 的 sessionStorage 不自动搬迁；同站点后续探索状态仍按原逻辑保存。
4. 宇宙源码修改需要重新同步构建才会出现在 3002；5188 仍支持即时开发更新。旧哈希资源暂时保留，避免已打开页面的延迟加载失效。
5. 本次截图和手势测试使用 Chromium/软件 WebGL，未实测 iOS Safari 或每一种远程封面。远程资源仍受 CORS、网络和音频格式支持限制。

整体结果：保留原有宇宙和音乐交互，改善球面侧缝、沉浸播放器，并以动画衔接大厅同站点子页面；JSON 和请求处理可复用。账号代码完成合法官方身份授权适配，真实授权与获许可的平台播放需要对应的外部配置后验收。
