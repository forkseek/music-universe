# 公网部署检查与执行方案

检查日期：2026-10-06。当前版本可以构建、大厅能够同源加载 3D 子页；上线前需修正发布包的依赖与密钥隔离，并明确音乐平台能力。推荐先部署单台 Linux 云服务器、本地持久卷、Docker 单实例和 Nginx HTTPS。下面配置为候选模板，不代表已在云端部署成功。

## 已确认的实现及本次验证

- 主项目：Next.js 16.3.8、React 19.3.0、Node 24.x、better-sqlite3、Drizzle；所有 API 是 Node.js 路由，包含音乐 worker 子进程、临时搜索记录、播放票据和登录任务。
- 5188：React + TypeScript + Vite + R3F / Three.js。开发时通过 `/mw` 代理请求 3002；hall 构建的 base 为 `/universe/`，API 直接请求同源 `/api/`。
- 主项目大厅已经使用 `/universe/index.html` 同源 iframe；需要保留父子页面的 CSP、SAMEORIGIN 和 postMessage 源校验。公网不需要开放 5188、3002 或 5173。
- 本次主项目 lint/typecheck 通过，20 个测试文件、174 项通过；星系 130 项通过；星系 hall 构建及隔离目录的 Next 生产构建通过。
- 将 production standalone 复制到项目外临时目录，排除密钥，验证大厅进入 #universe、WebGL canvas 就绪；没有请求开发端口 3002/5188，没有页面运行错误。
- 同源 API 200，外来 Origin 403。隔离测试库导入 Demo、保存世界、停止并重启服务后，读回相同世界。
- 原始独立包的 worker 实际因 MODULE_NOT_FOUND 退出；显式补入生产依赖后，worker 的无账号状态 IPC 测试通过。
- 本机没有 Docker：未执行 Linux 镜像构建、Nginx 配置实测、真实 TLS、云端网络、真人扫码授权或第三方歌曲播放验收。上述隔离运行用 Windows Node 与 Chromium SwiftShader，不能代替 Linux/硬件测试。

## 上线前问题及具体措施

| 优先级 | 已确认的问题 | 处理措施 |
|---|---|---|
| P0 | Next 的文件追踪把本机 `data/.music-vault-key` 带入 standalone；虽然未发现 .env 被带入，现有本机构建目录不能直接整包上传 | 使用新模板从干净源代码在 Linux 构建；构建上下文白名单排除 data、.env、密钥、Windows 模块和调试工作区。运行密钥在服务器生成，仅配置在运行环境/持久化存储 |
| P0 | worker.cjs 已被追踪，但 NeteaseCloudMusicApi、qrcode 没进入 standalone；健康接口只检测 SQLite，音乐可以在健康为绿时失败 | 新 Dockerfile 明确复制 integrations/mineradio 和完整生产 node_modules，设置 MUSIC_INTEGRATION_ROOT。服务器额外检查 worker 和平台接口 |
| P0 功能边界 | 当前配置没有本应用 QQ Connect App ID/App Key/回调地址；QQ 身份授权不包含 QQ 音乐播放权 | 用自己登记的 QQ 网站应用配置官方 OAuth。若需要公开站内播放 QQ 曲目，另取得平台允许的音乐接入方案；不能通过填 App ID 或复制个人 Cookie 获得播放能力 |
| P1 | QQ 播放目前依赖本机 radiohand；`serviceOrigin()` 只允许本机单用户用途。酷狗/汽水登录会校验 Host 为 localhost/127.0.0.1，依赖本机 Electron | 云端 MUSIC_DESKTOP_LOGIN=0、RADIOHAND_API_ORIGIN 留空。不能把服务器窗口或站长账号当成访问者登录。QQ 播放及酷狗/汽水远程登录需要另外设计平台允许的接入，模板没有虚构替代接口 |
| P1 | `npm audit --omit=dev` 报告 high=2，来自 NeteaseCloudMusicApi→node-forge 同一依赖链 | 审查本项目可达调用路径，升级/替换到已核实安全版本或暂不公开该适配器。当前已看到 RSA 加密调用，未证明报告中的签名验证缺陷可从本项目接口利用。不要直接执行 audit fix --force；其建议降级到 4.13.6 未经功能兼容验证 |
| P1 | SQLite 默认 WAL；登录任务、播放票据、限流等保存在单个进程内 | 使用单实例和本地 Docker 持久卷，避免 PM2 cluster/自动多副本。不要把 WAL 库放 NFS/CFS。长期多用户扩容再迁移数据库与任务/票据存储 |
| P1 | APP_ORIGIN 未配置；匿名会话不是跨设备账户恢复体系 | 设为准确 HTTPS origin，Nginx 保留 Host/转发协议；验收 Secure/HttpOnly/SameSite=Lax。换公网域名不会自动携带本机 Cookie，不把开发者的账号或数据库当作公共默认账号 |
| P2 | 大量新增实现和 public/universe 当前尚未被 Git 跟踪，3D 源项目在另一个目录 | 部署当前已审核源码导出包；Git/CI 路线先保存必要文件。不能只推旧 HEAD，也不能指望云端找到 Windows 的 Codex 路径。以后把两个项目纳入同一工作区或固定版本构建流水线 |
| P2 | public 约 168.1MB（160.3MiB），其中 universe 约 19.5MB（18.6MiB）；静态资源清单 187 个且 SHA-256 校验通过，保留了若干旧构建块 | 先保持兼容；发布时使用清洁的版本目录、压缩响应、哈希资源长期缓存、HTML 不缓存。较大媒体可放受控对象存储/CDN；不要在运行目录直接删旧块导致已打开页面动态导入失败 |

平台能力按当前代码分别判断：网易云有服务器扫码流程，但仍需目标服务器访问测试与真人确认；QQ OAuth 是身份登录，QQ 云端播放尚未成立；酷狗/汽水的本机登录不能迁移给公网用户。本地文件、自有音频及现有 3D 交互可作为公开演示的明确范围。公开展示的音频、封面、背景和 vendored 代码另核对来源与授权，保留 LICENSE/NOTICE。

## 推荐架构

```mermaid
flowchart LR
  Browser[用户浏览器：3D 和原生音频] -->|HTTPS 443| Proxy[Nginx：TLS、限流]
  Proxy -->|127.0.0.1:3000| App[Docker：Next.js 和音乐 API]
  App --> Scene[/universe/ 静态子页]
  App --> Worker[音乐 worker]
  App --> Storage[(本地持久卷：SQLite)]
```

演示起步可选 2 核/4GB Linux 云服务器；构建内存不足时在独立构建机打镜像或提高构建内存。服务器不需要 GPU，3D 在访问者浏览器渲染。实例大小是起点，不是并发性能保证；媒体代理流量和第三方区域限制要在目标节点测试。不建议把当前完整程序只上传 GitHub Pages/静态托管，也不建议把本地 SQLite 直接放临时函数文件系统。

## 已提供的文件

- `deploy/public/Dockerfile`：在 Linux 使用 Node 24 编译原生依赖，跳过 Electron 二进制下载，prune 开发依赖后保留完整生产依赖，以 node 用户运行。
- `deploy/public/Dockerfile.dockerignore`：构建上下文白名单，避免打入本机账号数据和密钥。该文件为 Dockerfile 专用规则。
- `deploy/public/compose.yaml`：只绑定宿主机 127.0.0.1:3000，持久卷、自动重启、健康检查、有限日志大小；公网 origin 和运行密钥必须配置。
- `deploy/public/.env.example`：公开配置示例，未包含真实凭据。
- `deploy/public/nginx.conf`：同源代理、API 每 IP 10r/s/burst30、连接限制、API 不记访问日志、哈希资源缓存；默认是 HTTP 引导配置，需 Certbot 完成 TLS。

上述模板未替换已有 Dockerfile、Compose 或修改业务逻辑。Nginx 的错误日志和监控采集也应脱敏授权 code/token/ticket；不要上传完整敏感请求 URL。若以后加 CDN/多层代理，先明确可信代理 IP 再恢复真实客户端 IP，不能信任任意 X-Forwarded-For。

## 第一步：本机准备当前源码

在 Windows PowerShell：

```powershell
Set-Location -LiteralPath 'C:\Users\IKUN\Documents\ChatGPT\腾讯黑客松'
npm run check
npm run build:universe
node work/public-deployment/export-source.mjs
tar -czf work/public-deployment/music-world-source.tar.gz -C work/public-deployment/source-root .
```

本次已创建候选源码导出；再次执行 exporter 会拒绝覆盖，避免把旧发布物与新文件混合。源码包保留最新 public/universe，可以在 Linux 没有外部星系源码时使用同步脚本的已验证缓存分支。导出不含数据库、运行 .env、密钥、工作区输出或 Windows node_modules；.npmrc 有认证项时导出会拒绝，应改用构建秘密注入。

拥有服务器后，用自己的用户名和服务器 IP 上传这个包：

```powershell
scp work/public-deployment/music-world-source.tar.gz ubuntu@YOUR_SERVER_IP:/tmp/music-world-source.tar.gz
```

YOUR_SERVER_IP、域名和登录用户都是待填值，当前没有建立云端连接、创建付费资源或上传文件。

## 第二步：服务器、域名与配置

选择带本地持久磁盘的 Ubuntu 云服务器，安装 Docker Engine + Compose 插件，参照官方 Ubuntu 安装说明。域名 A 记录指向该实例；只在确实配置 IPv6 后才设 AAAA。开放 80/443，SSH 限制到管理来源，不开放 3000/3002/5188。中国大陆节点按服务商要求先完成网站备案，见官方备案说明。

在 Ubuntu 终端，解包到你有写权限的新目录，例如 `~/music-world`：

```bash
mkdir -p ~/music-world
cd ~/music-world
tar -xzf /tmp/music-world-source.tar.gz
umask 077
cp deploy/public/.env.example deploy/public/.env
python3 - <<'PY'
from pathlib import Path
import secrets
p = Path('deploy/public/.env')
p.write_text(p.read_text().replace('REPLACE_WITH_RANDOM_SECRET', secrets.token_hex(32)))
PY
nano deploy/public/.env
```

把 DOMAIN 改成自己的完整主机名，例如 music.your-domain.com，**不加 https://、端口或斜杠**；RELEASE_TAG 使用每次发布不同的版本号。生成密钥的步骤仅适用于新数据库，密钥生成后要稳定保管。迁移已有加密账号数据时必须保留原加密方式和密钥；不能用新随机值替换后期待旧凭据仍可读。

核心最终配置：

```dotenv
DOMAIN=music.your-domain.com
RELEASE_TAG=20261006-01
MUSIC_CREDENTIAL_SECRET=<服务器生成且长期保管的值>
NEXT_PUBLIC_ENABLE_QQMUSIC=false
```

Compose 自动生成 APP_ORIGIN=https://DOMAIN；DATABASE_PATH=/app/data/music-world.db、SQLITE_JOURNAL_MODE=WAL、MUSIC_DESKTOP_LOGIN=0 已固定。QQ Connect 有自己已登记的应用后再填三个 QQ_CONNECT 变量，其中回调必须为 `https://你的域名/api/qq/login/callback`，并与 QQ 互联登记一致。`NEXT_PUBLIC_ENABLE_QQMUSIC` 是另外的授权 H5 SDK 导入开关，不能把它当成 QQ OAuth 或音乐播放的开关。

## 第三步：构建、启动、HTTPS

从解包后的项目根目录执行：

```bash
docker compose --env-file deploy/public/.env -f deploy/public/compose.yaml -p music-world-public up --build -d
docker compose --env-file deploy/public/.env -f deploy/public/compose.yaml -p music-world-public ps
docker compose --env-file deploy/public/.env -f deploy/public/compose.yaml -p music-world-public exec music-world node scripts/storage-check.mjs
curl http://127.0.0.1:3000/api/health
```

只有 health 为绿不足以验收音乐。还应检查镜像内两个模块能 resolve，命令不输出账号：

```bash
docker compose --env-file deploy/public/.env -f deploy/public/compose.yaml -p music-world-public exec music-world node -e 'for(const m of ["NeteaseCloudMusicApi","qrcode"]) console.log(m,Boolean(require.resolve(m)))'
```

安装并配置宿主机 Nginx：

```bash
sudo apt-get update
sudo apt-get install -y nginx
nano deploy/public/nginx.conf
sudo cp deploy/public/nginx.conf /etc/nginx/sites-available/music-world
sudo ln -s /etc/nginx/sites-available/music-world /etc/nginx/sites-enabled/music-world
sudo nginx -t
sudo systemctl reload nginx
```

在 nano 中先把 server_name 的 music.example.com 换成与 DOMAIN 相同的域名；若符号链接已存在，复用而不重复创建。按照 Certbot 的官方 Nginx/Ubuntu 安装方式安装 Certbot，然后执行：

```bash
sudo certbot --nginx -d music.your-domain.com --redirect
sudo certbot renew --dry-run
```

证书依赖有效 DNS 和 80/443 可达；需先完成这两项。HTTP 阶段只作引导，正式使用 HTTPS，避免 Secure Cookie 和源站校验不匹配。公网入口为 `https://你的域名/#hall`，星系仍在 `#universe`，无需另建 5188 服务。不要执行会把运行密钥展开打印的 Compose config/完整环境日志。

## 第四步：上线验收

```bash
curl -I https://music.your-domain.com/
curl https://music.your-domain.com/api/health
curl -I https://music.your-domain.com/universe/index.html
```

- [ ] 外部网络/手机流量访问 #hall，入口进入 #universe；刷新和返回大厅正常。
- [ ] 浏览器 Network 没有 localhost/127.0.0.1、5188/3002、/mw 请求；无混合内容、CSP 和 WebGL 错误。
- [ ] 用户点击播放后，自有测试音频可听，暂停/进度拖动、切歌、字幕、跟随/解除及减少动态效果正常。
- [ ] 最终用户 Cookie 为 Secure、HttpOnly、SameSite=Lax，API 同源访问成功，外来 Origin 被拒绝。
- [ ] 上传/导入 Demo、保存世界后重启并重建容器，同一浏览器读回同一数据；持久卷没有被删除。
- [ ] 音乐 worker、平台搜索、歌词和有权限的音频在目标服务器实际可用；真人在官方页面确认扫码，不能以模拟凭证或“身份已连接”冒充音乐可播放。
- [ ] QQ 无配置、无音乐授权、版权/会员限制及远程桌面登录不可用时有清晰状态，不共用站长账号、不以替代曲冒充平台曲目。
- [ ] 每次发布使用新镜像标签；数据库在线备份和加密密钥可恢复，API 限流、日志脱敏及磁盘/带宽监控有效。
- [ ] 两条依赖警报经过调用链审查或安全替换，第三方资源和 vendored 代码保留许可说明。

## 维护、备份和扩容

SQLite 写入 WAL 时不能只复制主 db 文件作热备份。使用 better-sqlite3 在线 backup API，或停服确认无写入后备份数据；备份导出到独立存储，同时安全保存原密钥/运行配置。不要将命名卷视作异地备份，不执行 `docker compose down -v`。固定使用同一个 Compose project name music-world-public，避免换目录时另建空卷。

每次发布先备份，再构建新 RELEASE_TAG。回滚用之前保留的镜像标签并以 `up -d --no-build` 启动；涉及数据库迁移还要检查旧版本兼容，必要时按备份恢复，不能只换镜像后假定 schema 自动降级。

已有 CloudBase 文档提出 CFS + DELETE。切成 DELETE 只绕过 WAL 的共享内存限制，不证明网络文件系统锁语义安全；这条路径没有云端验证。当前优先本地磁盘单实例；需要 CloudBase 弹性实例时先迁移到其支持的持久数据库，并外置登录/票据/限流状态。

## 检查证据与文档来源

本地记录在 `work/public-deployment/audit.json`、dependency-audit.json、production-smoke.json、isolated-production.png、export-manifest.json。本次未部署公网。现有 docs/DEPLOYMENT.md 与 DEPLOY_CLOUDBASE.md 部分内容早于音乐平台/QQ OAuth 更新，需结合本检查使用，不能视为整套音乐能力已验证。

依据：[Next.js 自托管](https://nextjs.org/docs/app/guides/self-hosting)、[Docker 构建上下文](https://docs.docker.com/build/concepts/context/)、[Docker 持久卷](https://docs.docker.com/engine/storage/volumes/)、[Ubuntu Docker 安装](https://docs.docker.com/engine/install/ubuntu/)、[Nginx 反向代理](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)、[Nginx 限流](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html)、[Certbot 安装](https://certbot.eff.org/instructions?ws=nginx&os=snap)、[SQLite WAL 限制](https://sqlite.org/wal.html)、[QQ 网站应用接入](https://wiki.connect.qq.com/网站应用接入流程)、[腾讯云备案说明](https://cloud.tencent.com/document/product/243/19630)、[node-forge 安全公告](https://github.com/advisories/GHSA-86w9-cpqp-85rv)。
