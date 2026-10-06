# Music World

把 CSV、JSON、TXT 歌单整理成统一、可去重、可追溯来源的歌曲集合，保存到 SQLite，再生成可操作的音乐世界。当前已完成互动播放空间、文件导入、匿名音乐库、60 首 Demo 元数据、可缩放地图、可保存的 Journey 和可操作的 Guide 事实推荐，并预留结构化模型接口与 QQ 官方 H5 SDK 适配层。文件可标记 QQ、网易云、酷狗、汽水或 Spotify 来源；这只是用户声明的元数据，不等于平台账号直连。真实模型服务和 QQ 平台授权尚未接入实测。

## 本地运行

需要 **Node.js 24.x**（本机验证版本 24.18.0）和 npm。本项目没有必填密钥，也不需要先启动数据库。

```powershell
cd "C:\path\to\music-world"
npm install
npm run dev
```

打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。端口被占用时以终端显示的地址为准，或执行 `npm run dev -- --port 3100`。按 `Ctrl+C` 停止。界面使用深色主题，地图全图总览下可通过“快速定位”直接选择并放大节点。

打开 `/#world` 会直接进入互动播放器，可搜索 QQ 音乐歌曲、查看同步歌词、导入本地音频与 LRC 歌词，或播放三首原创试听。QQ 在线播放由单独运行且已授权的 radiohand 服务提供，接入步骤见 [播放器与 radiohand 适配说明](docs/RADIOHAND_PLAYER.md)。

首页点击“体验三种格式样例”，预期 **9 条输入 → 3 首歌曲，合并 6 条，每首保留 3 条来源**。也可一次选择多个自己的歌单文件，点击 `Build My Music World` 整理歌曲集合。

自己的文件先在浏览器预览，点击“保存到我的音乐库”才上传；服务器重新验证并事务保存。导入前可在“文件声明的来源”选择平台，JSON/CSV 中的 `provider` 列也可逐首指定。然后填写世界名称，点击“生成并保存音乐世界”。在地图中点击节点查看艺术家、专辑、流派、来源链接和连接依据，再点击“从此节点生成 5 站 Journey”。路线以橙色虚线亮起；点击站点可让地图定位。点击“打开路线详情”可保存网址并刷新重看。

关系卡片可输入“更梦幻一点”等方向。没有模型配置时，基础算法只会依据已导入的流派标签调整顺序；Journey 会标明实际运行模式并保存方向。连接卡片中的相邻节点可直接点击，进入下一站；AI Guide 事实模式可选择第二个节点解释已保存的直接连接、推荐真实节点、定位地图，并按方向创建新 Journey。没有响度数据时不会猜测“不要太吵”。当前 Guide 暂不调用模型。

三份样例按钮仅做本地预览；“载入 60 首 Demo · 20 位艺术家 · Try Demo”进入独立演示库。三份样例只包含 3 首不同歌曲，生成 Journey 时如实返回 3 站；Demo 和至少 5 首歌的文件可得到 5 站。默认核心探索使用基础算法，不需要 AI Key。

默认数据库是 `data/music-world.db`，首次访问自动创建并应用迁移。不同浏览器通过随机 HttpOnly Cookie 分隔数据，数据库只存 token 哈希；保留同一 Cookie 才能重新访问。清除 Cookie、使用隐私窗口或换设备会进入新库，目前没有账号恢复功能。首页“清空当前会话音乐库”删除此会话的歌曲、来源、导入记录、Demo 副本与派生世界。

“下载结果 JSON”导出导入报告；世界页面可下载完整世界数据。两者都是结果，不是原始歌单输入格式。少量节点默认适配全图；较大音乐世界默认以当前节点为中心，左下角可缩放或适配全图，上方可快速定位；拖动空白处移动地图，拖动节点调整本次浏览位置。未单独显示为主要节点的歌曲仍保存在库中，并可作为 Journey 站点临时出现在地图上。

`.env.example` 是可选配置示例：需要配置时自行复制为 `.env.local`。QQ 开关默认关闭；只有获授权的腾讯连连自定义 H5 面板才应开启，浏览器会再检查 SDK 方法和授权状态，具体边界见 [QQ 适配说明](docs/QQMUSIC_OFFICIAL_ADAPTER.md)。`AI_API_KEY` 只在带 `server-only` 边界的模块读取，不使用 `NEXT_PUBLIC_` 前缀。模型接口采用兼容 Chat Completions 的服务端适配层；之后获得真实服务时再配置 `AI_PROVIDER=openai-compatible`、`AI_MODEL`、`AI_API_KEY` 和以 `/v1` 结尾的 `AI_BASE_URL`。当前没有真实服务调用的验收记录。

## 专辑宇宙场景

大厅 `/#hall` 的 **专辑宇宙** 轨道标记连接到独立运行的 Hybrid 3D 音乐宇宙 `http://127.0.0.1:5173/?from=hall`。默认全屏显示横向专辑星球与细轨道，不显示导航、标题或播放器。指向星球向上滚轮即可靠近，双击播放对应音乐并出现光环、环绕星尘；再次双击暂停。按 `Esc` 返回 `http://127.0.0.1:3002/?from=universe#hall`。原有七个大厅模块仍正常使用；宇宙完整素材工作台通过 `/?studio=1` 打开。

宇宙源码位于 `C:\path\to\music-universe`。这两个入口需要两边服务同时运行；大厅使用 `3002` 时，可先在本项目终端设置 `$env:PORT='3002'` 与 `$env:APP_ORIGIN='http://127.0.0.1:3002'`，再执行 `npm run build`、`npm start`。大厅的这一场景地址由 `NEXT_PUBLIC_MUSIC_UNIVERSE_ROOM_URL` 配置；更改后重新构建。

## 验证命令

```powershell
npm run check            # ESLint、TypeScript、单元与 SQLite 集成测试
npm run build            # 正式构建
npx playwright install chromium   # 首次浏览器测试时安装测试浏览器
npm run test:e2e         # 自动在 3100 端口启动开发服务并验证桌面/移动页面
npm run test:restart     # 构建后：独立部署包跨进程读回音乐库、世界和 Journey
npm run smoke:local      # 在 npm start 运行时，用一次性匿名会话检查 Demo、Journey、刷新和删除
npm run db:init          # 可选：手动应用迁移并检查数据库完整性
npm run storage:check    # 在 DATABASE_PATH 旁创建临时库，验证写入、WAL 与重新打开
npm run db:generate     # 根据 Drizzle schema 生成迁移 SQL，不连接/修改数据库
```

重现锁定依赖可使用 `npm ci`。自动化测试使用独立临时库，不清理真实用户数据库。部署需单个 Node.js 实例及可持久保存的本地磁盘；提供 Dockerfile、Compose 命名卷和 [部署说明](docs/DEPLOYMENT.md)。目前已验证本机独立生产包及跨进程重启，尚未部署云端或运行 Docker。

## 部署

持久层是单文件 SQLite，因此只能**单实例**运行，并把数据库放在**可持久保存的本地磁盘**上；不要部署到只有临时文件系统的函数平台，也不要把同一个库分散到多台服务器的本地磁盘。完整说明见 [部署说明](docs/DEPLOYMENT.md) 与 [CloudBase 云托管部署](docs/DEPLOY_CLOUDBASE.md)。

### 方式一：单台 Node.js

```powershell
npm ci
npm run build
npm start
```

- 需 Node.js 24.x；以固定服务用户运行，并给数据库父目录写权限。
- `DATABASE_PATH` 指向发布目录之外的固定绝对路径，例如 `/var/lib/music-world/music-world.db`（迁移文件与 WAL 文件同样需要写权限）。
- `APP_ORIGIN` 设为实际入口，如 `https://music.example.com`，不带尾斜杠；服务置于 HTTPS 反向代理之后。
- 精简发布：把 `.next/standalone/`、`public/`、`.next/static/` 复制到同一目录（分别作为发布根、`public/`、`.next/static/`），在该目录执行 `node server.js`。
- 可选自检：`npm run storage:check`（验证目标目录可写、启用 WAL 并可重新打开），`npm run db:init`（手动应用迁移并检查完整性）。

### 方式二：Docker / Compose

```sh
docker compose up --build -d
docker compose exec music-world node scripts/storage-check.mjs
```

默认只绑定宿主机 `127.0.0.1:3000`，数据库落在命名卷 `music-world-data`（容器内 `/app/data/music-world.db`）。公开服务时通过 `APP_ORIGIN` 与反向代理暴露；命名卷的数据生命周期独立于容器，请勿执行会删除卷的清理命令。

### 方式三：腾讯云 CloudBase 云托管

目标形式是单副本 + CFS 挂载，并**必须**把 `SQLITE_JOURNAL_MODE` 设为 `DELETE`——WAL 依赖 `-shm` 共享内存与可靠的文件锁，在 CFS 这类网络文件系统上会导致数据库损坏。

```sh
npx --package @cloudbase/cli@3.8.5 tcb login
npx --package @cloudbase/cli@3.8.5 tcb cloudrun deploy --env-id <envId> --service-name music-world --source . --port 3000 --min-num 1 --max-num 1 --open-access-types PUBLIC --wait
```

`--min-num 1 --max-num 1` 必须写死，禁止自动扩缩容。仓库根目录另提供 `cloudbaserc.json`（声明式写法，尚未实测）。逐参数说明与验收清单见 [CloudBase 云托管部署](docs/DEPLOY_CLOUDBASE.md)。

### 关键环境变量

| 变量 | 用途 | 生产取值 |
| --- | --- | --- |
| `DATABASE_PATH` | SQLite 文件位置 | 持久磁盘上的绝对路径，如 `/app/data/music-world.db` |
| `APP_ORIGIN` | 源站守卫与 Cookie `secure` 判定 | `https://<公网域名>`，不带尾斜杠 |
| `SQLITE_JOURNAL_MODE` | SQLite journal 模式 | 网络文件系统（CFS/NFS）用 `DELETE`；本地磁盘用默认 `WAL` |
| `MUSIC_DESKTOP_LOGIN` | 本机 Electron 登录窗口 | 远程部署设为 `0` |
| `NEXT_PUBLIC_ENABLE_QQMUSIC` | QQ 能力开关 | 默认 `false`，仅在已授权的 H5 面板内启用 |
| `MUSIC_CREDENTIAL_SECRET` | 凭证加密密钥（仅服务端） | 生产显式配置；留空则在 `DATABASE_PATH` 旁生成 |

其余可选变量见 [.env.example](.env.example)；`AI_*` 与 `QQ_CONNECT_*` 未配置时程序仍可正常运行。

### 上线前检查

```sh
curl -I https://<公网域名>/
curl https://<公网域名>/api/health
curl -I https://<公网域名>/universe/index.html
```

浏览器中再确认：进入音乐大厅 → `#universe` 能加载 3D 场景 → 载入 Demo 并保存世界 → **重启服务**后重新打开同一个世界，数据仍在（验证持久卷已生效）。发布新版本前先用 SQLite 在线备份机制，或停机后备份整个数据目录；不要在 WAL 写入过程中只复制主 `.db` 文件。

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
src/db/                        SQLite 连接、16 张表、自动迁移
src/types/                     Track、Source、MusicWorld
public/samples/                正常、重复、版本、坏文件样例
tests/                        单元、数据库结构和浏览器测试
```

File 和 Demo Provider 在普通浏览器可用；QQ 仅在开关开启且官方 H5 面板 SDK 报告已授权时开放适配流程，本机只完成 SDK 替身测试。网易云、酷狗、汽水、Spotify 的账号直连仍不可用，但可导入用户提供的文件并保留对应来源，详见[五平台接入边界](docs/PLATFORM_CONNECTION_STATUS.md)。导入文件内的 `provider` 是用户声明来源，不代表平台身份已验证。不会保存音乐平台 Cookie、登录凭证或音频直链。Demo 的 60 首歌曲来自 20 位艺术家的 20 张专辑，核对链接见 [Demo 来源](docs/DEMO_SOURCES.md)，不冒充用户的收藏或播放历史。

产品暂定：中文为主界面语言；首页文案“让散落的歌单，在这里相遇。”；主演示曲目沿用项目规则中的 Let Down / Alison / Starless。未提供额外用户歌单。

数据库关系见 [数据模型](docs/DATA_MODEL.md)；接口见 [API 契约](docs/API.md)；执行记录见 [D1 验收](docs/D1_ACCEPTANCE.md)、[D2 验收](docs/D2_ACCEPTANCE.md)、[D3 验收](docs/D3_ACCEPTANCE.md)、[D4 接口验收](docs/D4_AI_INTERFACE_ACCEPTANCE.md)、[D5 阶段记录](docs/D5_GUIDE_QQMUSIC_ACCEPTANCE.md)和 [D6 候选版记录](docs/D6_CANDIDATE_ACCEPTANCE.md)。演示与提交准备见[三分钟脚本](docs/DEMO_SCRIPT.md)、[作品说明草稿](docs/SUBMISSION_BRIEF.md)、[赛事规则核对](docs/CONTEST_REQUIREMENTS.md)和[开源依赖记录](docs/OPEN_SOURCE_NOTICE.md)。锁文件协议清单可通过 `npm run licenses:generate` 重新生成。
