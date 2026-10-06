# 互动播放器与 QQ 音乐登录

## 打开播放器

在音乐大厅点击中央的“音乐电台”，或直接打开 `http://127.0.0.1:3002/#world`。页面直接呈现一屏播放场景：点击唱片或播放键、拖动进度、切歌、调节音量、切换随机与循环，音频频谱会驱动光环与粒子。鼠标移动会改变唱片舞台的视差，点击会触发涟漪。队列、歌词、音源状态和旧的音乐地图分别从浮层进入。

首次进入时会在 QQ 音乐搜索“轻音乐”。在顶部搜索框输入歌曲名或歌手名，按 Enter 或点击箭头，会打开独立的 QQ 音乐搜索结果面板。结果显示歌曲、歌手、专辑、时长和 QQ 音乐入口，每页 12 首，可以加载更多。重新输入关键词会替换当前搜索结果，之前加入播放队列的音乐仍可在队列中找到。连续搜索会取消旧请求，避免旧结果覆盖新结果。

QQ 搜索、封面、歌词在未登录时也可公开读取；在线播放需要账号授权。页面自带三首 80 秒原创器乐，选择“原创试听”可以真实播放。也可以添加本地 MP3、M4A、WAV、OGG、FLAC 等音频，或拖入音频与 LRC 歌词。本地音频只保留在本次浏览器页面的临时内存中，页面关闭后失效。

## 在网页内扫码登录 QQ 音乐

播放器右上角的“QQ 音乐登录”打开“音乐连接”面板，其中提供“扫码登录 QQ 音乐”。点击后会展示 QQ 官方二维码，用手机 QQ 扫码并在手机上确认。页面会持续检查待扫码、已扫码、成功、过期和失败状态；二维码过期后可以刷新，关闭弹窗或离开播放场景会停止检查。

登录成功后，顶部显示昵称和头像，“音乐连接”面板展示昵称、头像及 QQ 音乐用户 ID。用户 ID 取自 QQ 音乐登录响应的 `musicid`，资料取自 QQ 音乐主页接口的 `data.creator.nick/headpic`；资料接口暂时不可用时会显示上次保存的资料并提示。刷新页面、重启服务后，同一浏览器会话仍能恢复账号连接，直到本站会话或 QQ 凭证过期、用户退出登录。

登录后，播放器会用该账号的播放凭证向 QQ 音乐换取播放地址，按账号实际权益在线播放。

后端实现位于 `src/lib/music/providers/qq-account.ts`，走的是 QQ 官方网页扫码链路：

1. `ssl.ptlogin2.qq.com/ptqrshow` 获取二维码与 `qrsig`，并用 `hash33(qrsig)` 得到 `ptqrtoken`；
2. 轮询 `ssl.ptlogin2.qq.com/ptqrlogin` 直到手机确认；
3. 从登录回调提取 `uin/ptsigx` 票据，在 `ssl.ptlogin2.graph.qq.com/check_sig` 按 QQ 互联应用参数取得授权 Cookie，保留跳转中的 Cookie，再向 `graph.qq.com/oauth2.0/authorize` 换取授权码；兼容新版账号的 `pt_oauth_token`，不会因旧 `p_skey` 为空提前中止；
4. 带授权码请求 `u.y.qq.com/cgi-bin/musicu.fcg` 的 `QQConnectLogin.LoginServer.QQLogin`，检查响应码并取得 QQ 音乐 ID 和有效的 QQ 音乐凭证，仅有 QQ 号码不会判为成功；
5. 请求 `c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg` 解析昵称、头像，将账号和资料加密保存；
6. 播放时用 `vkey.GetVkeyServer.CgiGetVkey` 换取该歌曲的播放地址。

对应接口如下，均由本站后端代理上游请求：

| 本站接口 | 用途 |
| --- | --- |
| `GET /api/qq/session` | 首先建立 HttpOnly 浏览器会话，避免首次请求并发导致会话不一致 |
| `GET /api/qq/login/qr` | 获取二维码、登录批次 ID 和过期时间 |
| `GET /api/qq/login/poll?loginId=…` | 检查该会话和该批次的扫码状态，成功后返回公开用户资料 |
| `GET /api/qq/status` | 恢复保存的登录并刷新用户资料；`refresh=1` 可跳过 60 秒资料缓存 |
| `POST /api/qq/login/logout` | 删除保存的凭证、资料缓存和待扫码状态 |
| `GET /api/qq/search?keywords=晴天&limit=12&page=1` | 返回对应歌曲及是否有下一页 |

二维码绑定本站用户会话和一次登录批次。刷新二维码后，旧批次不能覆盖新批次；同批次并发确认只执行一次凭证交换。回调重定向仅接受 HTTPS QQ 域名，不执行上游返回的 JavaScript。接口要求同源访问和 `X-Music-World: 1` 请求头。

凭证处理：登录得到的 Cookie 使用 AES-256-GCM 加密后只保存在本站 SQLite 数据库（`qq_accounts` 表），不会返回前端或放入 `localStorage`。密钥优先取仅供服务端使用的环境变量 `QQ_CREDENTIAL_SECRET`，未配置时自动在数据库目录生成 `.qq-vault-key`；文件访问由本机账户权限控制。恢复登录需要保留数据库及对应密钥。在“音乐连接”面板点击“退出登录”会删除该账号记录。音频 URL 在服务端只保存在有限时效的内存票据中，浏览器只收到本站的播放地址。

## QQ 音乐搜索与参考工程

搜索优先使用 QQ 音乐 `music.search.SearchCgiService.DoSearchForQQMusicMobile` 的完整歌曲搜索，支持分页，并归一化歌手、专辑、封面、时长及歌曲 ID。登录后，请求使用该会话的服务端凭证；未登录仍可搜索。上游完整搜索临时不可用时，第一页回退到 smartbox 公开建议结果，第二页会明确提示重试。真正的空结果保持为空，不会拿旧搜索结果填充。

工程参考 [Mineradio-paused 的 server.js](https://github.com/XxHuberrr/Mineradio-paused/blob/d43de565acabfdc1a9c9820a27e81a98ccbebcef/server.js) 中的用户资料解析、歌曲搜索和登录状态处理。该项目的登录依赖 Electron 窗口与桌面 Cookie 会话；本项目按 Next.js 技术栈实现服务端网页扫码链路和独立 TypeScript 适配器。这里不需要安装 Electron 或启动参考项目，也没有复制它的播放器界面。

网页扫码后的凭证交换还对照了 [QQMusicApi 的 QQ 登录实现](https://github.com/L-1124/QQMusicApi/blob/main/qqmusic_api/modules/login.py)，使用 QQ 互联专用 `check_sig` 域名和第三方应用参数。服务端失败诊断只记录步骤、响应码、域名和 Cookie 字段名，不记录票据、账号、Cookie 值或上游响应体。

2026-10-05 的真实扫码排障确认，账号可返回 `p_skey_forbid`、空的 `p_skey` 和 `pt_oauth_token`。授权行为按 [QQ 官方授权页面](https://graph.qq.com/oauth2.0/show?which=Login&display=pc&response_type=code&client_id=100497308&redirect_uri=https%3A%2F%2Fy.qq.com%2Fportal%2Fwx_redirect.html%3Flogin_type%3D1%26surl%3Dhttps%3A%2F%2Fy.qq.com%2F) 的脚本执行：`p_skey` 为空时使用初值 `5381` 作为 `g_tk`，携带 Cookie 完成官方跳转并继续授权；请求来源与授权页面对齐，仅请求所需的头像与昵称权限 `get_user_info / 1010`。最终仍要求 QQ 音乐返回成功响应及音乐凭证。资料请求的 `g_tk` 使用 QQ 音乐凭证。合并的 `Set-Cookie` 会逐条解析，日期中的逗号不会导致凭证丢失；诊断中的动态 Cookie 名会隐藏账号后缀，授权失败只记录跳转域名、已知路径、参数名和数字错误码。

本适配器用于 `#world` 网页登录和试听，与原有歌单导入的 `QQMusicConnector` SDK 适配器分开，不改变导入、数据库归一化和音乐图谱流程。搜索结果不代表账号具备相应歌曲的播放权限。

主要实现文件：

| 文件 | 职责 |
| --- | --- |
| `src/lib/music/providers/qq-account.ts` | 扫码、QQ 凭证交换、加密保存、资料刷新 |
| `src/lib/music/providers/qq-profile.ts` | 回调安全解析、QQ 音乐密钥检查、公开资料归一化 |
| `src/lib/music/providers/radiohand-qq.ts` | 完整歌曲搜索、分页、匿名回退及音频桥接 |
| `src/lib/music/providers/radiohand-browser.ts` | 浏览器会话初始化和本站 API 调用 |
| `src/components/player/MusicPlayer.tsx` | 原界面中的登录弹层、用户资料、搜索结果 |

## 运行与验证

项目无需新增依赖。开发运行：

```powershell
npm run dev -- --port 3002
```

生产运行（先结束占用 3002 的旧服务）：

```powershell
npm run build
$env:PORT = "3002"
$env:HOSTNAME = "127.0.0.1"
npm start
```

检查代码和网页流程：

```powershell
npm run check
npx playwright test tests/e2e/qq-player.spec.ts
```

`tests/qq-account-login.test.ts` 检查凭证交换、资料归一化、加密保存、从磁盘重启恢复、二维码批次与用户隔离、过期、并发和退出。`tests/qq-player-search.test.ts` 检查完整搜索、分页、空结果、回退和输入校验。`tests/e2e/qq-player.spec.ts` 使用明确的接口测试数据，检查原页面中的扫码确认、资料显示、刷新恢复、退出及桌面/手机搜索。

自动化测试不会替用户扫描真实二维码。真实上游搜索、二维码图片及待扫码状态另外用运行中的页面验证；完整真实账号授权和资料返回需本人手机 QQ 扫码确认。测试数据的成功不等同于已完成真实账号授权。

## 备用：接入 radiohand

如果更习惯使用本机已授权的桌面服务，本项目也保留了 [Mineradio-paused](https://github.com/XxHuberrr/Mineradio-paused) 风格的桥接：`/api/qq/search`、`/api/qq/song/url`、`/api/qq/lyric`，并加上连接状态、封面及受会话约束的音频转发接口。在网页扫码登录不可用时，桥接作为回退路径生效。

当 radiohand 已在 `127.0.0.1:3000` 运行且其 QQ 授权已完成时，在 Music World 的 `.env.local` 设置：

```text
APP_ORIGIN=http://127.0.0.1:3002
RADIOHAND_API_ORIGIN=http://127.0.0.1:3000
```

然后重启 Music World 的 `3002` 服务，并在“音乐连接”面板点击“重新检测连接”。这项桥接仅允许本机地址，因为 radiohand 的账号状态属于运行它的这台设备。状态与播放地址的优先级为：本站扫码登录的账号 > radiohand 桥接 > 未授权提示。搜索结果、歌单导入元数据与实际播放权限互不等同；对应账号没有权限的歌曲会给出限制提示和 QQ 音乐歌曲页入口。

## 本项目音频

原创器乐文件由 `node scripts/generate-listening-demos.mjs` 生成，保存于 `public/audio/`。它们与项目已有的 60 首 Demo 元数据不是同一批素材。[参考项目](https://github.com/XxHuberrr/Mineradio-paused)采用 GPL-3.0；这里参考了播放器的交互与接口形状，并使用本项目自己的界面、图形和音频素材。
