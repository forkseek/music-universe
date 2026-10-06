# D5 Guide 与 QQ 适配层阶段记录

日期：2026-10-03（北京时间）。本阶段提前推进，AI 模型和 QQ 官方账户实测均按实际状态分开记录。

## Guide：已有事实可以驱动下一步

`POST /api/guide` 读取当前会话拥有的世界、当前节点、显式收藏/最近播放/流派统计、邻近连接与**当前选定的 Journey**。回答包含 `intent`、`recommendedNodeIds`、`explanation`、`directionSupported` 和证据。可选 `targetNodeId` 指定第二个世界节点：服务端只读取这对节点的已保存直接边，引用对应原因与歌曲证据；无直接边时明确说明，跨世界 ID 返回 404，同一节点返回 400。推荐节点必须真实存在且不重复；“更梦幻一点”只匹配导入数据明确提供的 dream pop、shoegaze、ambient 等标签。点击推荐可聚焦地图；点击“沿这个方向生成 Journey”会从当前节点生成并保存一条新路线，旧路线仍可打开。“不要太吵”在没有响度数据时明确说明无法可靠判断。

Guide 目前运行 `mode=facts`；[模型提示词与 JSON Schema](../src/lib/ai/guide-prompt.ts)已预留，未进行真实 Guide 模型调用。浏览器测试覆盖指定节点对解释、推荐定位、路线改变与高亮、失败后继续探索、加载状态和再次提交；编辑问题或比较目标会取消旧请求，避免旧回答覆盖新问题。单元测试覆盖直接边、无直接边、推荐 ID 校验、跨世界 Journey 拒绝及事实来源。

## QQ：官方文档对应的受控适配

已实现浏览器 SDK 环境与授权状态检查、个人歌单和最近播放转换、30 首分页、`/api/imports/qqmusic` 白名单验证、幂等保存及匿名会话清理。分页检测空页、重复页（包括歌曲顺序变化）、声明总数变化、错误总数、中途 SDK 失败和安全上限；授权在操作中撤销时会更新状态并清空旧歌单选项。普通浏览器或开关关闭时不会显示虚假授权入口。详情和未验证边界见 [QQ 官方适配说明](QQMUSIC_OFFICIAL_ADAPTER.md)。NetEase 仍为 `auth=false`，可使用文件或结构化导入。

SDK **替身**端到端验证：65 首歌曲按页导入，重复提交不增加歌曲，最近播放增加一条独立来源；模拟撤销授权后连接状态立即变为不可用，已导入的库仍能生成世界。另以单元测试覆盖 60 首恰好两页、空歌单、重复页、空页、总数变化和第二页断开。[Guide 回答与操作截图](artifacts/d5-guide-answer.png)、[方向路线截图](artifacts/d5-guide-route.png)、[QQ 替身地图截图](artifacts/d5-qq-sdk-standin.png)。真实腾讯连连项目权限、SDK 注入、授权跳转和实际歌曲数据仍待官方环境验收。

| 验证项 | 结果 | 证据或后续条件 |
| --- | --- | --- |
| Guide 事实解释与方向路线 | 通过 | `tests/ai-journey.test.ts`、`tests/e2e/library.spec.ts`；没有模型密钥仍能保存路线 |
| QQ SDK 替身、分页及授权变化 | 通过 | `tests/qqmusic.test.ts`、`tests/e2e/qqmusic.spec.ts`；只证明适配器逻辑 |
| 真实腾讯连连项目权限、SDK 注入与 QQ 账号授权 | 未验证 | 需要获授权的腾讯连连自定义 H5 面板和实际账号 |
| 网易云账号直连 | 待官方接入 | 当前只开放 CSV/JSON/TXT 文件入口，不显示虚假登录能力 |

本机复验：`npm run check` 通过（99 项单元/集成测试），`npm run build` 与 `npm run storage:check` 通过；默认开关和开启开关各运行一次完整浏览器套件，均为 10 项通过、1 项按开关条件跳过。构建后的 `npm run test:restart` 确认五站方向路线、音乐库和世界跨进程一致，SQLite 完整且无外键违规，见[本次重启证明](artifacts/d5-recheck-restart-proof.json)。上述截图和测试均来自本机，不代表线上部署或真实 QQ 授权。
