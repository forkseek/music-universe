# 免费发布：Render + Neon

此说明对应 `codex/render-neon` 分支。Render 运行同一站点的 Next.js/API 与音乐 worker，Neon 保存 PostgreSQL 数据；专辑宇宙从仓库内 `apps/music-universe` 构建到 `/universe/`。不再需要公网访问本机 5188 或 3002，也不需要付费磁盘。原 `master` 分支和本机 SQLite 数据保持原样。

当前状态：已准备部署配置，云账号、真实 Neon 连接与公网验收需在账号授权后完成。构建/测试通过不能代表已上线，详细本地证据见 `DEPLOYMENT_VALIDATION.md`。

## 1. 注册两个免费账号

- [Render 官方控制台](https://dashboard.render.com/)：选择 GitHub 注册/登录，使用 Hobby 工作区。
- [Neon 官方注册](https://console.neon.tech/signup)：可使用同一个 GitHub 账号，选择 Free。

只在平台官网填写个人信息。不要把密码、数据库连接串、平台 Cookie 或 API Key 发到聊天、GitHub、浏览器代码里。

## 2. 创建 Neon 数据库

1. 创建项目 `music-universe`，选择 Free，地区尽量与 Render 的 Singapore 接近。
2. 使用控制台默认数据库和角色，打开 **Connect**。
3. **关闭 Connection pooling，选择 Direct connection**。本应用已有最多 3 条连接的服务端连接池；迁移需要保持同一连接上的锁。
4. 复制 PostgreSQL connection string；保留 TLS 相关参数。先保存在自己的密码管理器，稍后只粘贴到 Render 的 `DATABASE_URL`。连接地址中不应包含 `-pooler.`。

应用首次访问健康检查时会自动建立 18 张表。此分支不自动上传本机 SQLite 或账号凭证；公网音乐库初始为空，用户可重新导入歌单、选择本地音频并重新授权平台账号。

## 3. 一键创建 Render 服务

[打开已选定发布分支的 Render 部署页](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fforkseek%2Fmusic-universe%2Ftree%2Fcodex%2Frender-neon)

登录后按页面提示授权 Render 读取 `forkseek/music-universe` 仓库。检查只创建一个 Web Service，**Instance type 为 Free**，分支为 `codex/render-neon`。该配置不创建 Render 数据库或付费磁盘。

在 `DATABASE_URL` 填入刚才 Neon 的 **Direct** 连接串，然后开始部署。`MUSIC_CREDENTIAL_SECRET` 会自动生成，用于账号凭证加密；部署后应安全备份，之后更新代码时保留原值。其他必需配置已写在根目录 `render.yaml`。

如果没有识别 Blueprint，可手动 New → Web Service，选择同一仓库与分支，Runtime 选 Node，Region 选 Singapore，Instance type 选 Free：

```text
Build Command: npm ci --include=dev && npm --prefix apps/music-universe ci --include=dev && npm run build
Start Command: npm start
Health Check Path: /api/health
```

手动创建时按 `render.yaml` 补齐所有环境变量，其中 `MUSIC_CREDENTIAL_SECRET` 必须为固定随机值，至少 32 个字符。`APP_ORIGIN` 默认从 Render 自动提供的 `RENDER_EXTERNAL_URL` 获取；绑定自有域名后设为完整 HTTPS 源站地址，无结尾 `/`，然后重启。

## 4. 公网验收

部署成功后，以 Render 实际显示的 `https://…onrender.com` 地址为准，不能凭服务名称猜测网址。

- `/api/health` 返回 `{"ok":true,"storage":"postgresql"}`。
- `/#hall` → 点击专辑宇宙 → `/#universe`，3D 场景、封面、字体、背景正常。
- 本地音频实际可播放；歌曲结束按专辑顺序切换，歌词和跟随状态同步。
- 保存歌单、世界和 Journey，Render 手动重启后保持同一浏览器 Cookie，确认数据仍在。
- 新建隐私窗口不能读到原浏览器音乐库；跨站写请求被拒绝。
- 远程音乐平台分别验证搜索、授权、账号昵称和有权播放的歌曲；搜索结果不代表可播放权限。

## 云端登录与音乐边界

- Render 是无桌面的云服务器，`MUSIC_DESKTOP_LOGIN=0`。不能把服务器的 Electron 登录窗口当作访客本机窗口。网易云页面二维码流程可用，但真实扫码仍需用户确认，并受平台网络/地区限制。
- QQ 官方网站授权需自己的已登记 QQ Connect 应用：在 Render 配置 `QQ_CONNECT_APP_ID`、`QQ_CONNECT_APP_SECRET`、`QQ_CONNECT_REDIRECT_URI`，回调为实际域名的 `/api/qq/login/callback`，须与 QQ 互联登记一致。未配置时应提示不可用；QQ 身份授权不等于 QQ 音乐播放权益。
- 不复制本机凭证，不导入第三方账号，不绕过平台登录、地区、会员或版权限制。云机访问平台失败时，本地音频仍可播放；不能承诺任何第三方音源永久可用。
- 本地 audio/LRC 文件留在用户浏览器；平台媒体地址与播放票据可能过期，Render 休眠或发布会清空内存中的二维码、搜索票据和 worker，唤醒后应刷新或重新发起。

## 免费方案的实际限制

[Render 免费规则](https://render.com/docs/free)明确空闲服务会休眠，首次唤醒有等待；本地文件系统不持久，因此音乐库保存在 Neon。免费实例只有 512 MB 内存、0.1 CPU，不适合高并发音频中转。[出口流量规则](https://render.com/docs/outbound-bandwidth)也适用于音频响应，请在控制台查看剩余额度。不要启用付费升级或付费超额功能来维持“免费”。

Neon 的免费容量、计算时长及地区支持以[官方价格页](https://neon.com/pricing)和创建项目时控制台为准。数据库可自动休眠，连接采用 15 秒超时、失败初始化不永久缓存；健康检查不通过时先查看两端状态和额度，不反复创建空库。

## 代码更新、备份与回滚

- Blueprint 的自动部署关闭，避免每次提交都触发发布；需要更新时在 Render 手动 Deploy latest commit。
- 发布前保存 Neon 数据库备份/导出，并安全保留 `MUSIC_CREDENTIAL_SECRET`。免费计划的恢复窗口不能替代独立备份。
- Render 可回滚应用构建；数据库迁移不会随代码回滚。不要删除线上表或将 SQLite 旧版直接指向 PostgreSQL。
- 原本机工程未被替换。当前云分支不包含本机数据库、个人 `.env.local`、账号凭证或日志。

## 本地发布分支验证

Node.js 24.x。在 `.env.local` 填入独立测试 PostgreSQL 的 Direct 地址与固定密钥后：

```sh
npm ci
npm --prefix apps/music-universe ci
npm run check
npm --prefix apps/music-universe test
npm run build
npm run test:restart
npm run storage:check
npm start
```

`test:restart` 使用仅开发依赖的 PGlite PostgreSQL 引擎及 TCP 协议验证生产包跨进程重启，独立临时库自动清理；不连接真实 Neon。`storage:check` 才检查 `.env.local` 指定的数据库，使用临时表，不修改用户数据。`test:e2e` 需显式提供 `TEST_DATABASE_URL`，应为单独测试库，不能使用生产库。
