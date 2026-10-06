# D1 完成记录

日期：2026-10-02（北京时间）。范围：D1-01 至 D1-14；这是数据导入基础阶段验收，不代表完整 Music World MVP 已完成。

## 实现清单

| 任务 | 结果与证据 |
| --- | --- |
| D1-01 | Next.js 16.3.8 / React 19.3.0 / TypeScript / Tailwind；ESLint、Vitest、Playwright；精确版本与 package-lock.json |
| D1-02 | src/app、components、lib/music、lib/ai、db、types；中文首页和可操作的导入预览 |
| D1-03 | 四类 Provider、ProviderTrack、ProviderPlaylist、能力、可用原因及统一注册表；只读状态接口 |
| D1-04 | NormalizedTrack、TrackSource、ISRC、canonicalKey、版本证据、元数据白名单；内部 UUID 独立于 externalId |
| D1-05 | .env.example；QQ 开关默认 false；模型配置带 server-only，运行无需密钥 |
| D1-06 | CSV/JSON/TXT 统一转换；TXT 明确分隔规则，歧义行报告错误 |
| D1-07 | UTF-8/BOM/UTF-16/显式 GB18030，CSV 引号/逗号/换行、必填验证、文件/批次/字段上限 |
| D1-08 | 空白、Unicode NFKC、匹配键大小写、feat./ft. 归一；展示保留大小写，来源保留白名单原文 |
| D1-09 | ISRC/标题艺术家/专辑证据去重、多来源、幂等；Live/Remix/专辑版本/时长/ISRC 冲突保护 |
| D1-10 | 总记录、有效记录、无效记录、合并数、最终歌曲数与文件/行级问题列表；可下载 JSON |
| D1-11 | 三格式合法样例、重复/版本/空文件/损坏 JSON/损坏 CSV/TXT 歧义/引号/错误行样例 |
| D1-12 | 单元测试、浏览器多文件测试验证合法结果、跨来源合并与版本保护 |
| D1-13 | SQLite + Drizzle 16 表、索引/复合外键、初始迁移；内存数据库执行验证；真实音乐信号计算 |
| D1-14 | README、导入契约、数据模型、依赖说明；实际 npm install、npm run dev、build 与浏览器验证 |

## 实测结果

- `npm install`：完成，无缺失或无效 peer 依赖；`npm ls --depth=0` 正常。
- `npm run check`：ESLint 零警告、TypeScript 通过，**57 / 57** 单元与数据库结构测试通过。
- `npm run build`：正式构建成功；首页和 `/api/providers` 正常生成。
- `npm run test:e2e`：**3 / 3** Chromium 测试通过，包含实际开发服务器启动、桌面导入/展开来源/下载、坏文件与不同版本、390px 移动布局和 Provider API。
- `npm run dev`：默认端口 3000 启动成功，首页 HTTP 200，包含正确首页文案。
- SQLite：16 张表的迁移在内存库成功执行，外键检查通过；跨用户专辑引用被拒绝，相同 canonicalKey 的独立录音可保存，用户级级联删除不影响其他用户。
- 三个主演示文件：**9 条有效输入 → 3 首歌曲，合并 6 条；每首保留 CSV、JSON、TXT 三条来源**。
- 混合 `versions.json + broken.csv + ambiguous.txt + empty.txt`：保留 5 首歌曲，同时返回 CSV 损坏、TXT 歧义、空文件错误。
- 5,000 条重复 TXT 的本机上限探测：5,000 有效输入 → 1 首、4,999 合并、5,000 条来源；最终算法约 **101 ms**（Node 单次探测，不是所有设备的性能保证）。
- `npm audit`：**0 个已知漏洞**。ESLint 9 为满足现有 Next 插件 peer 范围暂留，维护状态说明见 DEPENDENCIES.md。
- 首页桌面与移动截图经人工视图检查；移动页面无整体水平溢出，歌曲表格可在自身容器横向滚动。

页面证据：[桌面导入预览](artifacts/d1-import-preview.png)、[移动导入预览](artifacts/d1-import-mobile.png)。

## 已明确的产品选择

中文主界面；首页文案“让散落的歌单，在这里相遇。”；保留 `Build My Music World` 核心 CTA，并说明当前是整理歌曲集合的第一步。主演示采用项目规则中的 Let Down、Alison、Starless。样例按钮在界面和导出结果中标记 Demo，不视作真实用户资产。

## 次日边界

当前预览在浏览器内处理，刷新清空；应用未连接数据库。迁移已准备但未应用到真实用户库。匿名会话、持久化导入/删除 API、50–100 首 Demo 库、Graph、World、Journey、模型调用与官方平台授权均仍属于后续日程。

QQ SDK 缺失不会崩溃；开关或 SDK 存在也不会伪称授权成功。没有实际调用 QQ/网易非公开 API 或任何模型服务。
