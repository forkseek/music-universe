# 部署到腾讯云 CloudBase 云托管

目标是让评委能点开一个公网 HTTPS 地址，而不是 `127.0.0.1`。

## 0. 先看这条：SQLite 的 WAL 跑在 CFS 上是不安全的

这是选云托管时必须先解决的事，不是可选项。

- 本项目的持久层是**单文件 SQLite**，`src/db/connection.ts` 里硬编码了 `journal_mode = WAL`。
- 云托管唯一的持久化手段是 **CFS（文件存储）**，它是网络文件系统。
- SQLite 官方明确说明 **WAL 不能工作在网络文件系统上**：WAL 依赖 `-shm` 共享内存与可靠的 POSIX 建议锁，NFS 类文件系统都不保证，实际表现为**数据库损坏**。

所以容器里的数据库目录必须挂 CFS，且**journal 模式要退回 `DELETE`**。

配套的代码改动**已应用**（`src/db/connection.ts`）：

```ts
const JOURNAL_MODES = ["WAL", "DELETE", "TRUNCATE", "PERSIST"] as const;
export function journalMode(value = process.env.SQLITE_JOURNAL_MODE): string {
  const mode = (value ?? "").trim().toUpperCase();
  if (!mode) return "WAL";
  if (!(JOURNAL_MODES as readonly string[]).includes(mode)) throw new Error(`SQLITE_JOURNAL_MODE 取值非法：仅支持 ${JOURNAL_MODES.join(" / ")}。`);
  return mode;
}
// openDatabase 内：
sqlite.pragma(`journal_mode = ${journalMode()}`);
```

用白名单而不是直接拼接，是为了让环境变量的值永远进不了 SQL 文本；`synchronous = FULL` 保持不变。`SQLITE_JOURNAL_MODE` 未设置时仍返回 `WAL`，**本地开发与现有测试行为一字不变**。

> 如果你不想承担这个风险，备选是"云服务器 + 本地磁盘"：本地磁盘上 WAL 完全正常，代价是要自己运维服务器与 HTTPS。见 `docs/DEPLOYMENT.md` 的"单台 Node.js"一节。

## 1. 需要你先准备

| 项 | 说明 |
|---|---|
| 腾讯云账号 | `tcb login` 会拉起浏览器授权 |
| CloudBase 环境 ID | 形如 `music-world-1gxxxxxx`，控制台"环境 → 环境 ID" |
| CFS 文件存储 Addon | 控制台创建后记下 **Addon 名称**，`volumeMounts` 的 value 要填它 |
| 公网访问域名 | 云托管默认域名或你绑定的自定义域名；**必须带 https://**，用于 `APP_ORIGIN` |

## 2. 部署

主路径（逐个参数都已按 `tcb cloudrun deploy --help` 核对）：

```sh
npx --package @cloudbase/cli@3.8.5 tcb login

npx --package @cloudbase/cli@3.8.5 tcb cloudrun deploy ^
  --env-id <envId> ^
  --service-name music-world ^
  --source . ^
  --port 3000 ^
  --min-num 1 ^
  --max-num 1 ^
  --open-access-types PUBLIC ^
  --wait
```

- `--source .` 指到"含 Dockerfile 的目录"，仓库根目录即是。
- `--port 3000` 对齐 Dockerfile 的 `EXPOSE 3000`；容器内 `server.js` 读 `process.env.PORT`，会跟随云托管注入的值。
- **`--min-num 1 --max-num 1` 必须写死**：SQLite + WAL/`-shm` 不能多副本，扩容会导致并发写与数据损坏。
- PowerShell 下反引号续行，或把命令写成一行。

## 3. 环境变量

`cloudbaserc.json` 是**声明式**写法，从 CLI 内嵌的 `@cloudbase/framework-plugin-container` schema 反推而来（`serviceName` / `servicePath` / `containerPort` / `envVariables` / `volumeMounts` / `minNum` / `maxNum` / `isPublic` 均已核到），但**这条声明式路径我没能验证**：本机没有腾讯云凭据，也没跑过 `tcb deploy`。其中 `version` 字段的合法取值未能从 CLI 中确认，请以官方文档为准。

想稳妥跑通就用第 2 节的 CLI 直连命令（每个参数都对着 `--help` 核过），环境变量在**控制台 → 云托管 → 服务配置 → 环境变量**里逐条添。

| 变量 | 值 | 为什么 |
|---|---|---|
| `APP_ORIGIN` | `https://<公网域名>` | 源站守卫比对它；session cookie 的 `secure` 也由它决定（`http.ts` 判断是否以 `https://` 开头） |
| `DATABASE_PATH` | `/app/data/music-world.db` | 必须落在 CFS 挂载点内；Dockerfile 已把它设为默认值 |
| `SQLITE_JOURNAL_MODE` | `DELETE` | 见第 0 节 |
| `MUSIC_DESKTOP_LOGIN` | `0` | 官方桌面登录窗口只在本机可用；云端必须关掉 |
| `NEXT_PUBLIC_ENABLE_QQMUSIC` | `false` | QQ 能力需在已授权的 H5 面板内启用 |
| `MUSIC_UNIVERSE_SOURCE` | 留空 | 见下节，云端不需要它 |

## 4. 关于 `npm run build` 里的 universe 同步

`build` 会先跑 `scripts/sync-universe.mjs`，它的默认源路径写死了本机的 `../../Codex/2026-10-04/.../music-universe`，**在云构建容器里不存在**。

已验证的兜底行为：只要 `public/universe/index.html` 与 `public/universe/build-manifest.json` 随源码一起上传，脚本会打印

```
Using the already synchronized universe build. Set MUSIC_UNIVERSE_SOURCE to rebuild it.
```

并以 **exit 0** 结束，云端构建不会因此失败。这两个文件当前都在（`public/universe` 共约 18.6 MB），且未被 `.dockerignore` / `.gitignore` 排除。

**若要更新 3D 场景**：先在本机 `music-universe` 里 `npm run build:hall`，再执行本仓库的 `npm run build:universe`，然后把新的 `public/universe` 一起发布。

## 5. 验收清单

部署完成后逐条确认：

```sh
# 站点可达
curl -I https://<公网域名>/
# 健康检查
curl https://<公网域名>/api/health
# 3D 场景子页
curl -I https://<公网域名>/universe/index.html
# 源站守卫：外来 Origin 必须 403
curl -X POST https://<公网域名>/api/imports/demo ^
  -H "Content-Type: application/json" -H "X-Music-World: 1" ^
  -H "Origin: https://evil.example.com" -d "{}"
```

浏览器里再过一遍：

1. 打开首页 → 进入音乐大厅 → 大厅内 `#universe` 能加载 3D 场景（同源 iframe）
2. 载入 Demo 曲库 → 创建/保存一个世界
3. **重启服务**（控制台"重新部署"或改一次环境变量触发重启）→ 再打开同一个世界，数据仍在
   —— 这一步专门验证 CFS 挂载生效，没挂上会在这里丢数据

## 6. 当前已知边界

- **单实例**：见第 2 节，不要开启自动扩缩容。
- **CFS 上的 SQLite 仍有残余风险**：即使改用 `DELETE`，网络文件系统的锁语义仍弱于本地磁盘。演示期可以接受，长期承载真实用户数据建议换本地磁盘的云服务器。
- **CI 未配置**：仓库没有 `.github/workflows`，发布靠手动执行上面的命令。
- **`public/` 体积**：整包约 160 MB（其中 `public/universe` 约 18.6 MB），构建上下文偏大。
