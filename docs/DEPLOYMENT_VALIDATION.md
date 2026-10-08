# Render 发布分支验证记录

验证日期：2026-10-08。本文件记录本地结果，不表示已创建 Render/Neon 资源或取得公网网址。

## 已完成

- 根工程 ESLint、TypeScript 检查通过。
- 完整主程序测试 176 项通过；随后新增 501 首批量导入边界测试，数据库相关 18 项复验通过（当前合计 177 项）。覆盖 PostgreSQL 迁移、外键/用户隔离、回滚、歌单去重、账号加密、QQ OAuth 状态与歌词 API 回归。平台调用在单元测试中使用明确的 fixture，并非真实账号扫码证明。
- 星系前端 137 项测试通过，包含自动下一首、曲序、预缓冲、切歌竞争、歌词、镜头与减少动态效果。
- `npm run build` 同时构建 Vite `/universe/` 资源和 Next.js 正式服务，成功完成。
- `render.yaml` 通过 Render 官方 JSON Schema 的 draft2020 校验，服务显式设置 `plan: free`；不存在付费磁盘或 Render 数据库定义。
- PostgreSQL `pg` 生产连接池、自动迁移、重复连接与临时表读写自检，在独立 PGlite TCP PostgreSQL 协议环境中通过。
- 独立生产包导入三种歌单格式、创建世界和 Journey，随后重启应用并重新打开测试数据库，精确读回原有数据；重复导入复用记录，跨站写请求返回 403，匿名 token 仅存哈希。
- 真实浏览器验证正式站点的大厅入口和同域 iframe 星系；WebGL、字体和资源正常，无页面异常或站内资源失败。
- 在同一正式服务上，浏览器用生成的测试音验证自动下一首、预缓冲、失败重试、重复 ended 事件、末首循环、手动操作优先和暂停不切歌，全部通过；歌词、镜头及同一个 Canvas 保持同步。测试音切换间隔约 234 ms，该数字不代表真实平台网络延迟。

测试证据保存在本地 `test-results/` 及 `apps/music-universe/tests/reports/`，这些输出不发布到 GitHub。PGlite 与其 TCP 工具均为开发依赖，不是云端数据库替代品；不包含在星系客户端或生产数据库路径中。

## 公网账号授权后仍需验证

- Render 实际分配的 HTTPS 地址、真实 Neon TLS 连接、休眠唤醒、云端重启后的数据保留。
- 使用真实手机完成平台授权，验证昵称头像、搜索和用户有权播放的音源。未配置 QQ Connect 应用时不能宣称 QQ 扫码/音乐授权已完成。
- Render 512 MB 免费实例的真实内存占用、worker 网络可达性和出口额度；本机测试不能替代该验证。
- Dockerfile/Compose 已同步 PostgreSQL 配置，但本机没有 Docker 引擎，因此未做容器构建验收。Render 使用 Node Runtime，不依赖 Docker。

## 依赖审计

`npm audit --omit=dev` 当前报告 2 个 High 条目，来自同一 `NeteaseCloudMusicApi → node-forge` 依赖链，并非两处已确认可利用的业务漏洞。上游 [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) 涉及 RSA PKCS#1 v1.5 签名验证；本工程已检查到的网易云调用使用公钥加密，没有发现签名验证调用，但这不构成完整安全证明。

核查时官方 registry 的 node-forge 最新版本仍为 1.4.0。未使用强制降级或未验证替换去掩盖审计项；需跟踪上游修复后更新锁定版本并复验平台接口。新增 PostgreSQL/PGlite 依赖没有增加生产审计条目。已有 Mineradio/vendor 许可与 NOTICE 保留，并重新生成了直接及传递依赖许可清单。
