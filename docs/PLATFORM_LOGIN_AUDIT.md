# 四个平台登录接口检查与修复

检查日期：2026-10-09。目标站点：<https://music-universe-forkseek.netlify.app/#universe>。

**公网检查发现：网易云可以取得二维码并轮询；QQ 尚未配置本应用的官方授权；酷狗与汽水的现有登录组件只适用于本机应用。** 本次修复了可用性判断、错误提示及 QQ 回调校验，没有将后三个平台标记为已开通。修复已通过本机生产构建及浏览器检查，尚未发布到该 Netlify 站点。

## 线上实测

在独立匿名浏览器会话中先调用 `GET /api/music/session`，再检查四个平台的 `status`、`login`，以及返回登录任务的平台的 `poll`、`cancel`。请求带同源 Origin 与 `x-music-world: 1`。测试没有使用个人账号、Cookie 或应用密钥；生成的测试登录任务已取消。

| 平台 | 状态 / 登录接口 | 本次确认的结果 |
| --- | --- | --- |
| QQ 音乐 | status 200；login 503 `QQ_OFFICIAL_CONFIG_REQUIRED` | 缺少本应用的 QQ Connect App ID、App Key 或登记回调地址；网页登录按钮禁用 |
| 网易云音乐 | status、login、poll、cancel 均 200 | 返回二维码；轮询为 pending；可以取消。没有真人扫码，不能据此宣称已完成账号授权或会员播放验收 |
| 酷狗音乐 | status 200；login 409 `DESKTOP_LOGIN_UNAVAILABLE` | 当前实现需要本机官方登录窗口，公网不可用；状态接口却只提示“连接账号后可按账号权益播放” |
| 汽水音乐 | status 200；login 409 `DESKTOP_LOGIN_UNAVAILABLE` | 虽显示为 qr 模式，二维码组件仍依赖本机 Electron；公网不可用，状态提示也没有解释原因 |

原始结果已脱敏保存在 [live-results.json](artifacts/platform-login-audit-20261009/live-results.json)。仅保存 HTTP 状态、公开错误、布尔状态及二维码是否存在；不保存二维码内容、登录任务 ID、OAuth state 或账号凭据。

## 已完成的代码修复

- 酷狗与汽水的状态查询、开始登录统一调用 `desktopAvailable(request)`。它核对当前请求 Host、配置的 APP_ORIGIN、Netlify 环境、组件是否安装和开关，避免服务器安装了 Electron 时误报远程访问者也能登录；保留本机 IPv4、localhost 与 IPv6 回环访问。
- 未接入公网登录时，状态接口直接说明需要在本机运行应用；已过期的账号同样显示可执行的说明。网页现有状态区域会展示这一提示，登录按钮保持禁用。
- QQ 官方应用配置存在但回调域名不匹配时，两个状态接口都提前返回 `loginAvailable: false` 和 `QQ_CALLBACK_ORIGIN_MISMATCH`。开始登录使用相同校验，避免按钮显示可用、点击后才报错。仍由 APP_ORIGIN 决定反向代理后的公开站点。
- 隔离构建目录从 Git 与 ESLint 输入中排除。此次修复没有加入借用的 App ID、个人 Cookie 或虚假的登录成功状态。

相关实现位于 `src/lib/music/platforms/runtime.ts`、`login.ts`、`src/lib/music/providers/qq-oauth.ts` 及两个状态路由。验证包括新增的远程/代理/组件缺失用例，以及原有授权取消、凭据加密、账号隔离和 QR 生命周期回归。

## 验证结果

- `npm run check` 通过：Lint、TypeScript、21 个测试文件 / 182 项测试。
- Next.js 16.3.8 生产构建通过，静态宇宙资源同步步骤成功。
- 用隔离 SQLite 数据库与独立端口运行生产构建，并设 `MUSIC_DESKTOP_LOGIN=0`、`NETLIFY=true`。网易云的真实二维码、轮询、取消再次返回 200；酷狗与汽水的状态提示和登录错误一致。
- Chromium 加载大厅与实际 3D 子页、切换四个平台，网易云按钮启用，其余按钮禁用；修复后的原因完整显示，页面无脚本错误。结果与截图见 [ui-results.json](artifacts/platform-login-audit-20261009/ui-results.json) 及同目录 `ui-*.png`。
- 以上证明本机修复可构建及相关页面正常，未证明 Netlify 的新版本已上线，也未代替真人手机确认授权。

## 上线仍需的条件

**发布权限：** 当前环境没有检测到 Netlify 发布令牌、关联站点配置或 GitHub 自动部署记录。GitHub 仓库可访问不代表有该站点发布权限；需要由实际站点管理者部署本次修复。使用 [Netlify 官方 Next.js 部署方式](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/) 时，应核对站点连接的仓库与生产分支。

**QQ 配置：** 在本应用已经登记且获准接入的前提下，将以下变量配置在服务端环境；App Key 不进入客户端或聊天记录：

```dotenv
APP_ORIGIN=https://music-universe-forkseek.netlify.app
QQ_CONNECT_APP_ID=<本应用自己的 App ID>
QQ_CONNECT_APP_SECRET=<本应用自己的 App Key>
QQ_CONNECT_REDIRECT_URI=https://music-universe-forkseek.netlify.app/api/qq/login/callback
MUSIC_DESKTOP_LOGIN=0
```

回调需要与 QQ 互联登记一致。[QQ 网站应用接入](https://wiki.connect.qq.com/网站应用接入流程)提供网站身份授权；本项目使用 `get_user_info`，QQ 音乐播放能力另外处理，当前 `musicAuthorized` 仍为 false。

**酷狗 / 汽水：** 现有代码没有适用于这个公网 Web 站点的账号授权接入。打开服务器上的 Electron 窗口无法给访问者登录，需要另行取得并实现适用于 Web 的平台授权方案；不能只改 Host 检查或把 `loginAvailable` 改为 true。

**账号连续性：** 本项目账号保存在本地 SQLite，登录任务保存在进程内。Netlify [函数运行环境是临时的](https://docs.netlify.com/build/functions/overview/)，本次单会话 QR 测试没有覆盖实例切换、冷启动后的会话及授权任务恢复。完整公开账号服务仍需持久数据库与共享任务存储，或采用已提供的单实例持久化服务器方案；参见 [公网部署检查](PUBLIC_DEPLOYMENT_AUDIT.md)。
