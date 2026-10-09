# Netlify Free + Neon Free

适用分支：`codex/netlify-neon`。网站包含同站点大厅、`/#universe` 和 `/universe/index.html` 的 3D 场景，以及 Next.js 音乐后台。原来的两个本地工程不做覆盖或迁移。

公网地址：[Music Universe](https://music-universe-forkseek.netlify.app/#hall)。站点后台：[music-universe-forkseek](https://app.netlify.com/projects/music-universe-forkseek)。当前部署使用 Netlify Free + Neon Free，不依赖本机保持开机。

## 发布配置

1. 在 Netlify 使用自己的账号登录，选择 **Free**。本次通过官方 Source ZIP Build API 上传 `forkseek/music-universe` 的 `codex/netlify-neon` 分支已提交源码，在 Netlify Linux 环境构建。当前站点未连接 Git 自动发布；GitHub Actions 只验证构建。以后可继续上传审核过的源码 ZIP，或在该站点的持续部署设置中连接此仓库和分支后启用自动发布。
2. 使用仓库中的 `netlify.toml`：Node.js 24，先安装星系前端依赖，再构建前端与 Next.js，发布目录 `.next`。`[[plugins]] package = "@netlify/plugin-nextjs"` 明确启用官方 OpenNext 适配器，不在 `package.json` 固定版本。Source ZIP 构建未自动注入适配器，缺少此声明会将 `.next` 当成静态目录，导致页面和 API 404。
3. 本分支在 Netlify 使用 `npm run build -- --webpack`。这是 Next 官方构建选项，避免本机 Windows 下 Turbopack 输出中的目录符号链接复制权限问题；不修改适配器或关闭系统权限检查。
4. 在 Netlify 站点后台环境变量中设置下表变量。Free 使用默认作用域；单独选择 Functions 作用域需要 Pro，不能为了设置作用域升级付费计划。将数据库连接和加密密钥标记为 secret，并明确设置为 production 环境。凭据不能写入 GitHub、`netlify.toml`、网页代码或 `NEXT_PUBLIC_*` 变量。
5. 首次生产部署成功后，在 **Project configuration → General → Visitor access → Project visibility** 将该站点设为 **Public**。新项目可能默认 Private，此时访客和 API 会返回 Netlify 的 401 登录页面。只改这个站点的访客设置，不修改网站内部账号授权，也不修改团队其他项目。

| 变量 | 值与用途 |
| --- | --- |
| `DATABASE_URL` | 已创建 Neon 项目的 **Direct connection**；关闭 Connection pooling。应用已有最大 3 连接的池，启动迁移需要会话级锁。 |
| `MUSIC_CREDENTIAL_SECRET` | 至少 32 字符的固定随机密钥；后续部署继续使用同一值，避免已保存账号无法解密。 |
| `APP_ORIGIN` | Netlify 实际分配的 `https://…netlify.app` 地址；若换域名，更新它及官方 OAuth 回调登记。 |
| `MUSIC_DESKTOP_LOGIN` | `0`；云端不启动本机 Electron 登录窗口。 |
| `MUSIC_AUDIO_RESPONSE_BYTES` | `4194304`（4 MiB）；原生音频 Range 请求按段读取，单次完整响应不超过 18 MiB。 |
| `NEXT_TELEMETRY_DISABLED` | `1`。 |

QQ 官方身份授权还需要本应用自己的 `QQ_CONNECT_APP_ID`、`QQ_CONNECT_APP_SECRET` 和 `QQ_CONNECT_REDIRECT_URI=https://实际站点/api/qq/login/callback`。没有登记信息时，界面会明确显示未配置，不借用其他应用的身份或假造账号。QQ 身份授权不等于 QQ 音乐播放权益。网易云二维码登录依然需要用户本人在官方 App 确认。

## 云端状态如何保存

`music_runtime_state` 保存按用户、用途、标识隔离的短期状态；AES-256-GCM 加密并校验关联上下文。数据库索引负责过期清理，短事务的 PostgreSQL 锁保护状态转换；平台网络请求不持有数据库事务锁。

| 状态 | 有效期/上限 |
| --- | --- |
| 搜索和专辑播放元数据 | 1 小时，每用户最多 1000 条，整张专辑批量写入。 |
| 普通播放票据 | 15 分钟，每用户 32 条。 |
| 兼容 QQ 播放票据 | 30 分钟，每用户 32 条；只接受已有合法音源授权。 |
| 扫码/OAuth 登录 | 4 分钟，终态最多多保留 10 分钟便于轮询；新登录替换旧登录，取消与保存账号互斥。 |
| QQ 授权码交换 | 原子领取，同一授权码不由两个实例重复兑换；单次平台交互总预算 35 秒。 |
| QQ 刷新令牌 | 30 秒共享租约，交换总预算 20 秒；退出后迟到的资料不能重新保存账号。 |

官方适配器不会执行 Docker 的 `scripts/start.mjs`。迁移文件与音乐 worker 的 1214 个依赖文件通过预构建追踪进入函数包；运行时从应用根目录读取。Windows 本地开发不将 `.netlify` 生成内容纳入代码检查。

## 验证

```sh
npm ci
npm --prefix apps/music-universe ci
npm run check
npm run build -- --webpack
npm run test:cloud-runtime -- --browser
```

`test:cloud-runtime` 创建两个独立生产进程和隔离的 PostgreSQL 协议测试数据库，检查扫码接力、搜索接力、音频票据、退出失效，以及原生浏览器完整播放超过 20 MB 的生成音频和拖动进度读取。`--browser` 额外验证大厅跳转、WebGL、字体和现有自动下一首验收。测试使用明确的模拟平台返回和自制音频，不能证明真实账号或会员授权成功。

Netlify 返回 `ready` 只代表部署流程完成，还需验证实际 HTTPS `/api/health`、`/api/music/session`、搜索、二维码状态、本人真实扫码、可播放音源、歌词、连续切歌以及跨页面访问。当前公网站点的实测结果见 [验证记录](NETLIFY_VALIDATION.md)；真实账号授权与会员权益必须由本人确认。

仓库的 `.github/workflows/netlify-linux.yml` 使用官方 CLI 在 Linux 完成无账号凭据的构建和包内容检查。本机 Windows 的边缘函数打包有路径兼容问题，正式部署使用 Linux 构建；已通过的记录见 [验证说明](NETLIFY_VALIDATION.md)。

## 免费范围与限制

- 当前 Netlify Free 为每月 300 credits，额度是硬上限，用尽会暂停服务；不启用付费计划或自动充值。访问量和音乐流量都会消耗额度，免费不等于无限访问或可用性保证。
- Netlify 的同步/流式函数最多运行 60 秒，流式响应最多 20 MB。本应用设置 4 MiB 的 Range 分段，并限制未分段响应在 18 MiB 内；不对大歌曲静默截断。上游不支持 Range 且音频超过限制时，返回明确错误。
- Netlify 函数请求体有 6 MB 上限，二进制编码后实际可用空间可能更少。当前文件导入单文件最多 2 MiB，建议每批 1 个文件；原本 10 MiB 的大批次导入不适合直接一次提交到此平台。本地音频和 LRC 在浏览器导入，不上传给平台音乐服务。
- Neon Free 会在空闲时缩容，首次访问可能需要唤醒。真实平台的地域限制、版权、会员权益或服务故障不会因部署而消失。
- 后续回滚在 Netlify 选择经过实际验收的版本重新发布。首轮 `6ac867a5350fde0923b7dabc` 缺失后台函数，不可作为正常回滚版本；修复版本 `6ac869e7c681bf2083902db4` 对应源码 `224b36850dae833b1403949415979ec8a8a90e00`。数据库新增表是增量迁移，不删除已有音乐库或账号表。`codex/render-neon` 保留为另一套独立发布配置。

官方资料：[Next.js 适配器](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)、[Functions API](https://docs.netlify.com/build/functions/api/)、[站点公开访问设置](https://docs.netlify.com/manage/security/secure-access-to-sites/project-visibility/)、[免费额度](https://www.netlify.com/pricing/)。
