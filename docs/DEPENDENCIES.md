> 历史说明：以下 SQLite/腾讯云内容对应 master 版本。codex/render-neon 发布分支改用 PostgreSQL；当前部署请遵循 [Render + Neon 指南](DEPLOY_RENDER_NEON.md)。

# 依赖兼容核对

核对日期：2026-10-02。本机 Node 24.18.0、npm 11.16.0。所有直接依赖精确锁定，完整解析结果见 package-lock.json。

| 依赖 | 版本 / 选择原因 |
| --- | --- |
| Next.js / eslint-config-next | 16.3.8 / 16.3.8；版本一致 |
| React / React DOM | 19.3.0 / 19.3.0；满足 Next peer 范围 |
| TypeScript | 6.0.3；严格模式，通过 Next 构建检查 |
| Tailwind / PostCSS plugin | 4.3.3 / 4.3.3 |
| Zod | 4.6.5，校验导入边界 |
| csv-parse | 7.0.3，浏览器 ESM 同步解析，完整 CSV 引号支持 |
| Drizzle ORM / Kit | 0.45.3 / 0.31.11；SQLite schema 与迁移生成 |
| better-sqlite3 / 类型 | 13.0.3 / 9.6.0；D2 同步事务驱动，本机 SQLite 3.53.4，独立生产包实测可加载 |
| @xyflow/react | 12.12.0；D3 地图拖动、缩放、节点与连线 |
| d3-force / 类型 | 3.0.0 / 3.0.10；D3 固定种子的有限节点布局 |
| tsx | 4.23.15；手动数据库初始化脚本使用，开发依赖 |
| ESLint | 9.39.5；Next 使用的 react/jsx-a11y 插件 peer 仍限制至 9，故暂不升级到 10；npm 标记 9 已结束维护，后续应随兼容插件一起升级 |
| Vitest | 5.0.3；Node 要求覆盖 24.x |
| Playwright | 1.63.0；仅开发测试依赖 |

Drizzle Kit 的旧 ESM loader 间接依赖存在已知 esbuild 开发服务器漏洞，使用**只针对 `@esbuild-kit/core-utils` 的 esbuild 0.25.12 override** 修正，未强行降级 Drizzle。迁移生成、内存 SQLite 测试与 npm audit 验证该组合。

D3 已安装 React Flow 与 d3-force 并替换 D2 静态 SVG 概览。Framer Motion 尚未用于当前阶段。Node 版本范围限制为 24.x，以保持当前验证组合。本机 Windows x64 使用随 SQLite 驱动附带的原生二进制，无需数据库服务；其他平台需有相应二进制或构建工具，Docker 构建阶段已提供工具链。依赖安装、生产构建、ESLint、TypeScript、测试和 npm audit 均通过；云端镜像尚未实跑。

核对来源：[Next.js 安装和手动配置](https://nextjs.org/docs/app/getting-started/installation)、[Tailwind 的 Next.js 配置](https://tailwindcss.com/docs/installation/framework-guides/nextjs)、[Vitest 入门](https://vitest.dev/guide/)、[CSV Parse 参数](https://csv.js.org/parse/options/)、[Drizzle Schema](https://orm.drizzle.team/docs/sql-schema-declaration)、[Drizzle 约束](https://orm.drizzle.team/docs/indexes-constraints)。版本与 peer/engine 范围同时通过 npm registry 实际查询；当前仓库锁文件和实测结果优先于未来变化的文档示例。
