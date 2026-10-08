# Music Universe / Music World

专辑封面成为恒星，歌曲按曲序化为星球。包含全屏 3D 浏览、播放跟随、同步歌词、本地音频与 LRC、平台搜索和账号授权，以及自动顺序播放下一首。大厅和星系在同一个网站运行，不需要访客连接本机端口。

此发布分支 **codex/netlify-neon** 使用 Next.js 16.3.8、React、Vite/R3F、Drizzle 和 PostgreSQL。原 master 分支及本机工程保留 SQLite；不自动迁移或公开本机数据库和账号凭证。

[Netlify + Neon 部署说明](docs/DEPLOY_NETLIFY_NEON.md) · [本分支验证记录](docs/NETLIFY_VALIDATION.md) · [原 Render 方案](docs/DEPLOY_RENDER_NEON.md)

## 本地运行发布分支

需要 Node.js 24.x 和 PostgreSQL。复制 .env.example 为 .env.local，配置 DATABASE_URL（Neon Direct connection，关闭 Connection pooling）和至少 32 字符的固定 MUSIC_CREDENTIAL_SECRET。不要提交个人环境文件。

~~~sh
npm ci
npm --prefix apps/music-universe ci
npm run dev
~~~

访问 http://127.0.0.1:3000/#hall，点击专辑宇宙进入 /#universe。星系源码在 apps/music-universe；正式构建自动生成 public/universe，音乐 API 使用同站点地址。单独开发星系仍可在 apps/music-universe 执行 npm run dev，并将主服务运行在 3002。

## 验证与正式启动

~~~sh
npm run check
npm --prefix apps/music-universe test
npm run build
npm run test:restart
npm run test:cloud-runtime -- --browser
npm run storage:check
npm start
~~~

单元集成测试使用独立的 PGlite PostgreSQL 引擎；重启测试验证生产包通过 PostgreSQL 协议保留歌单、世界与 Journey。storage:check 检查实际配置的数据库。浏览器整站测试需另行设置 TEST_DATABASE_URL，避免写入生产库。

## 部署与账号

Netlify 配置见根目录 netlify.toml，数据由 Neon 保存。音乐搜索、扫码状态、播放票据和限流使用加密的共享状态表，支持不同云函数实例接力处理请求。APP_ORIGIN 必须配置为实际 HTTPS 站点地址。应用使用 HttpOnly 匿名会话隔离音乐库，清除 Cookie 或换设备不会自动找回原库。

云服务器关闭 Electron 桌面登录。QQ 官方网站授权需自己的 QQ Connect 应用配置，QQ 身份授权不授予音乐版权或会员权限；网易云二维码仍需真实账号确认。平台搜索、可播放权限、实际音源获取是独立步骤。完整边界和免费休眠、额度限制见部署说明。

本分支的部署步骤以 DEPLOY_NETLIFY_NEON.md 为准；Render、CloudBase、SQLite 持久卷等文档保留作历史参考。公网发布和账号授权必须另行验证，不能把本地测试通过视作已经上线。

## 文件格式

CSV（首行为英文小写列名，必需 `title` 和 `artist`）：

```csv
title,artist,album
Let Down,Radiohead,OK Computer
"A Song, Part Two","Artist, Jr.","The ""Quoted"" Album"
```

JSON（顶层是数组，`artist` 字符串或 `artists` 非空数组二选一；同时提供时 `artists` 优先）：

```json
[
  { "title": "Let Down", "artist": "Radiohead", "album": "OK Computer" },
  { "title": "Song", "artists": ["Singer", "Guest"] }
]
```

TXT（每行只有一个两边带空白的 ASCII `-` 分隔符）：

```text
Radiohead - Let Down
Slowdive - Alison
King Crimson - Starless
```

`Artist - Song - Live` 有歧义，会报错而不是猜测；改用 CSV/JSON。`Jay-Z - Re-Record` 没有歧义。空行跳过。

完整契约、字段白名单、限制和去重策略见 [导入契约](docs/IMPORT_CONTRACT.md)。

## 目录与状态

```text
src/app/                       首页、世界/Journey 页和对应 API
src/components/                文件预览、音乐库、交互地图和旅行面板
src/lib/music/providers/       Provider 接口与统一注册表
src/lib/music/import/          编码、验证、解析、批次统计
src/lib/music/normalize/       Unicode、feat.、版本、去重
src/lib/music/signals.ts       只根据显式导入信息计算音乐信号
src/lib/ai/                   服务端适配器、结构化 Journey 契约、回退与 Guide 事实模式
src/lib/music/library.ts       事务保存、幂等导入、当前会话删除
src/lib/music/graph/            有限节点投影与真实关系
src/lib/music/journey/          真实元数据驱动的确定性路线规划
src/lib/music/worlds.ts         世界创建、幂等保存、归属查询
src/lib/music/journeys.ts       路线归属、事务保存和读取
src/lib/music/demo/             60 首核对来源的元数据模板
src/lib/server/                匿名会话、同源请求和错误边界
src/db/                        PostgreSQL 连接、19 张表、自动迁移
src/types/                     Track、Source、MusicWorld
public/samples/                正常、重复、版本、坏文件样例
tests/                        单元、数据库结构和浏览器测试
```

File 和 Demo Provider 在普通浏览器可用。本分支的音乐后台提供网易云扫码、平台搜索和既有音源获取代码；真实可用性仍取决于本人授权、版权及上游服务响应。QQ 身份授权需要自己的官方应用配置，不能替代音乐播放权益；酷狗和汽水的桌面登录在云端关闭；Spotify 没有账号直连。导入文件内的 `provider` 是用户声明来源，不代表平台身份已验证。后台账号凭据和短期播放票据仅加密保存在数据库，不写入客户端、GitHub 或导入曲目；短期状态会过期清理。Demo 的 60 首歌曲来自 20 位艺术家的 20 张专辑，核对链接见 [Demo 来源](docs/DEMO_SOURCES.md)，不冒充用户的收藏或播放历史。

产品暂定：中文为主界面语言；首页文案“让散落的歌单，在这里相遇。”；主演示曲目沿用项目规则中的 Let Down / Alison / Starless。未提供额外用户歌单。

数据库关系见 [数据模型](docs/DATA_MODEL.md)；接口见 [API 契约](docs/API.md)；执行记录见 [D1 验收](docs/D1_ACCEPTANCE.md)、[D2 验收](docs/D2_ACCEPTANCE.md)、[D3 验收](docs/D3_ACCEPTANCE.md)、[D4 接口验收](docs/D4_AI_INTERFACE_ACCEPTANCE.md)、[D5 阶段记录](docs/D5_GUIDE_QQMUSIC_ACCEPTANCE.md)和 [D6 候选版记录](docs/D6_CANDIDATE_ACCEPTANCE.md)。演示与提交准备见[三分钟脚本](docs/DEMO_SCRIPT.md)、[作品说明草稿](docs/SUBMISSION_BRIEF.md)、[赛事规则核对](docs/CONTEST_REQUIREMENTS.md)和[开源依赖记录](docs/OPEN_SOURCE_NOTICE.md)。锁文件协议清单可通过 `npm run licenses:generate` 重新生成。
