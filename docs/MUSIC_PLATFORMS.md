# 音乐平台接入

参考仓库：[XxHuberrr/Mineradio-paused](https://github.com/XxHuberrr/Mineradio-paused)，本次阅读并固定的版本为
`d43de565acabfdc1a9c9820a27e81a98ccbebcef`。

## 参考项目的实际方案

平台范围以代码为准。`server.js` 的 `/api/platform/capabilities` 启用网易云、QQ、酷狗和汽水；
Spotify 的相关路由直接返回 `PROVIDER_REMOVED`，没有纳入本次接入。

| 平台 | 依赖与调用 | 登录、配置 | 参考代码 |
|---|---|---|---|
| 网易云音乐 | NeteaseCloudMusicApi 4.32.0：cloudsearch/search、song_url_v1、user_account/login_status | login_qr_key/create/check；状态码 800 过期、801 待扫、802 待确认、803 成功。无需应用密钥 | package.json、server.js |
| QQ 音乐 | musicu SearchCgiService、账号 profile 接口、账号 vkey 获取音源 | Electron 打开 y.qq.com 官方登录页；收集音乐会话凭证。QQ 网页登录身份和音乐播放凭证分别检查；必要时隐藏窗口预热官方播放器 | desktop/main.js 的 openQQMusicLoginWindow；server.js 的 handleQQSearch/handleQQSongUrl |
| 酷狗音乐 | kugou-api.js：搜索、签名请求、账号信息、音源与会员权益检查 | Electron 官方登录窗口，检查 userid 和播放 token；必要时预热官方个人页 | desktop/main.js 的 openKugouMusicLoginWindow；kugou-api.js |
| 汽水音乐 | qishui-api.js：公开目录/已登录 PC 搜索、账号与会员检查、音源解析 | qishui-auth-v6.js 的官方 Passport Web 二维码创建、轮询与二次验证；qrcode 1.5.4 生成二维码，Electron 承载官方安全资源 | qishui-auth-v6.js、qishui-qr-login.js、qishui-auth-v6/、qishui-audio-decryptor/ |

汽水参考模块另有可选抖音 OpenAPI，需 client key、secret、HTTPS redirect URI；
当前使用参考项目已有的账号扫码方案，不要求配置开发者应用密钥。

## 当前实现

当前入口是 `http://127.0.0.1:5188/` 的“音乐搜索”。默认沉浸浏览时，点击右下角 **H**
或按 H 展开界面，再打开音乐搜索。平台按钮支持切换曲库，连接账号后显示昵称、头像；
歌曲结果支持分页、封面、歌手、时长和播放。搜索面板可关闭，声音仍由现有底部播放器控制。
本地文件和音频直链保留在折叠项内。

网页通过 Vite 的 `/mw` 代理访问 Music World 的 `127.0.0.1:3002` 服务。
后台新增 `/api/music/session`、`/api/music/{provider}/{action}` 和 `/api/music/audio`。
action 包括 status/search/login/poll/cancel/logout/play。

主要代码结构：

```text
腾讯黑客松/
  integrations/mineradio/
    worker.cjs                # 私有 IPC：网易云/酷狗/汽水接口调用
    login.cjs                 # 官方登录窗口、汽水二维码与安全验证
    vendor/                   # 固定版本的原始适配器、许可证与声明
  src/lib/music/platforms/
    types.ts                  # 平台、歌曲、公开用户类型
    runtime.ts                # 后台组件启动与请求超时
    accounts.ts               # 按用户和平台加密保存凭证
    login.ts                  # 登录、轮询、取消、退出、资料解析
    catalog.ts                # 搜索结果规范化与播放权限
    media.ts                  # 音源允许列表、播放票据、音频流与拖动
  src/app/api/music/          # Next 路由入口
  src/db/migrations/0003_light_doorman.sql
  tests/music-platforms.test.ts
music-universe/
  src/components/MusicSearch.tsx
  src/lib/musicPlatforms.ts
  src/music-platforms.css
```

QQ 继续使用当前项目已有的 musicu 搜索与账号音源适配器，新增官方登录窗口取得的音乐凭证
也写入原有加密账号表。因此原有 QQ 账号读取与播放器仍可共用该登录态。
网易云、酷狗、汽水使用新的 platform_accounts 表，凭证以 AES-256-GCM 保存，并绑定用户与平台。
平台 Cookie 不返回网页，也不写入浏览器 localStorage。

搜索结果中的播放 ID 绑定当前用户；音源返回短期本机播放地址，媒体路由支持 Range 和拖动。
汽水格式解码仅使用平台在授权音源响应中返回的密钥。会员、购买权限、试听及地区限制
按平台返回值处理。QQ/酷狗登录窗口中禁用 Node 集成；每次登录使用独立临时会话并在退出时清理。
取消、切换平台和退出登录会结束未完成的登录任务。

## 启动

Music World 服务：

```powershell
Set-Location -LiteralPath 'C:\Users\IKUN\Documents\ChatGPT\腾讯黑客松'
npm install
node node_modules/electron/install.js
npm run build
$env:PORT = '3002'
npm start
```

在另一个终端启动星系：

```powershell
Set-Location -LiteralPath 'C:\Users\IKUN\Documents\Codex\2026-10-04\referenced-chatgpt-conversation-this-is-an-3\outputs\music-universe'
npm install
npm run dev -- --host 127.0.0.1 --port 5188 --strictPort
```

本机 QQ、酷狗和汽水登录需要 Electron 可执行文件；如果初次安装尚未下载，执行上面的
`node node_modules/electron/install.js`。本次使用经过更新的 Electron 42.11.10，沿用参考的 42.x 方案。
`MUSIC_CREDENTIAL_SECRET` 可选，未提供时在 SQLite 文件旁创建本机密钥文件；请连同数据库保管。
远程部署设 `MUSIC_DESKTOP_LOGIN=0`，避免在服务器上弹出本地登录窗口。

## 验证

验证分为自动化、真实公开接口和真人账号授权三部分；模拟凭证不会当成真人登录成功。
构建、类型检查、Lint 和 147 个后台测试已通过。真实浏览器验证四个平台各返回 12 首搜索结果。
网易云歌曲实际播放成功，播放进度持续推进；Range 请求返回 206 和 1024 字节音频，
其他会话访问该播放链接返回 404。网易云和汽水的官方二维码可在网页显示、取消；
390px 手机宽度没有横向溢出，关闭面板返回星系，浏览器未出现脚本错误。
QQ 与酷狗的官方页面在 Electron 中加载成功，并检测到了可见的官方登录入口。
真人账号昵称、头像和会员歌曲仍需用户在手机或官方窗口中完成授权后验证。

原始第三方代码的 GPL-3.0-only LICENSE、NOTICE 和来源版本保留在 vendor/，发布时一并保留。
依赖检查已将 Electron、music-metadata、basic-ftp 更新到相容修订版；网易云包的
node-forge 依赖仍有 npm advisory，此项留在依赖维护记录中。当前组件仅通过私有 IPC
使用所列音乐接口，没有开启该包自带的 HTTP 服务。
