> 历史说明：以下 SQLite/腾讯云内容对应 master 版本。codex/render-neon 发布分支改用 PostgreSQL；当前部署请遵循 [Render + Neon 指南](DEPLOY_RENDER_NEON.md)。

# D2 持久化部署准备

当前已在 Windows / Node 24.18.0 验证独立生产包可启动，数据库自动初始化，并在结束旧进程、启动新进程后读回完全相同的音乐库、世界和五站 Journey。测试把部署包复制到项目外临时目录，不能依赖工作区的 node_modules 或迁移文件。

尚未指定云平台；本机没有 Docker，因此 Docker 构建、容器重建和云端磁盘未实测。交付目标为单台 Node.js 服务器，或单副本 Docker 容器加持久卷。不要在只有临时文件系统的函数平台上直接使用当前 SQLite 配置，也不要把一个库分散到多台服务器的本地磁盘。

## 单台 Node.js

安装 Node 24.x，执行 `npm ci`、`npm run build`。以固定服务用户运行，给数据库父目录写权限。环境变量 `DATABASE_PATH` 应指向应用发布目录之外的固定绝对路径，如 Linux `/var/lib/music-world/music-world.db`；迁移和 WAL 文件都需要写权限。`APP_ORIGIN` 设置为实际入口，例如 `https://music.example.com`，不带尾斜杠。服务置于 HTTPS 反向代理之后。

在项目根目录用 `npm run storage:check` 验证该目录可以写入、启用 WAL 并重新打开。该检查仅创建短暂探针库，不修改用户表，不能代替服务商的磁盘生命周期保证。`npm run db:init` 手动应用迁移并检查 integrity/foreign keys；常规运行首次访问也会自动迁移。

`npm start` 可在完整项目中运行。部署精简包时复制 `.next/standalone/`、`public/` 和 `.next/static/` 到同一发布目录；分别保留为发布根、`public/`、`.next/static/`。切换到该目录，运行 `node server.js`。通过环境变量 PORT/HOSTNAME 指定监听；迁移 SQL 已包含在 standalone，数据库与环境密钥不会打包进去。此复制约定来自项目安装版本的 Next.js `output` 指南。

## Docker Compose

仓库已提供 Dockerfile 和 compose.yaml。Docker 构建在 Linux 内安装相应原生依赖，不复用 Windows node_modules。运行阶段为非 root 用户，数据库固定在 `/app/data/music-world.db`，目录挂载命名卷。

在安装 Docker 的目标主机执行：

```sh
docker compose up --build -d
docker compose exec music-world node scripts/storage-check.mjs
```

默认只绑定宿主机 `127.0.0.1:3000`。本机预览入口为 `http://127.0.0.1:3000`；公开服务时在 Compose `.env` 或进程环境设置 APP_ORIGIN，并由反向代理转发。Next 的 `.env.local` 不会自动成为 Compose 变量源。命名卷的数据生命周期独立于容器，后续启动复用同一卷；不要执行会删除卷的清理命令。[Docker 官方卷说明](https://docs.docker.com/engine/storage/volumes/)

目标环境最终验收：在同一浏览器载入 Demo 并保存世界 → 记录世界 URL → `docker compose restart` → 重新打开 URL → 使用 `docker compose up --force-recreate -d` 重建容器 → 再次打开 URL，核对 60 首歌曲与相同节点。当前未宣称这两次容器验收已经执行。

## 备份和访问入口

使用 SQLite 在线备份机制，或在停止服务、确认没有其他进程使用数据库后备份整个数据目录；不要在 WAL 写入中只复制主 db 文件。发布新版本前先备份，迁移历史不可直接改写。

匿名 Cookie 有效期 30 天，数据库数据不会因服务重启消失，但清除/过期 Cookie 后目前没有账号找回途径。生产日志不得记录 Cookie/token 或原始文件内容。模型密钥只配置在服务端；D2 不调用模型。
