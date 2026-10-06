# D4 模型接口与回退验收

日期：2026-10-03（北京时间）。本轮按最新指令先做模型接口与预留接入点，未配置真实模型服务。以下把本地模拟响应与真实模型调用严格区分。

## 第一工作段：连接模型

实现方案：`src/lib/ai/contract.ts` 定义统一 `AIProvider.generateJourney(input, signal)`、Zod 输入输出与导出的 JSON Schema；`src/lib/ai/journey.ts` 从当前用户保存的世界和音乐库构造输入。最多送 40 首候选、80 条已有关系，含起点歌曲、用户方向、歌曲标题/艺术家/专辑/显式流派和显式偏好分数。原始来源元数据、外链、会话 Cookie 与密钥不进入模型输入。`src/lib/ai/client.ts` 留有 OpenAI 兼容 Chat Completions 适配器，模型名、地址、密钥仅从服务端环境读取；默认 `AI_PROVIDER=none`。

关键结构（简写）：

```ts
type AIJourneyInput = {
  schemaVersion: 1; worldId: string; startTrackId: string; intent: string; length: number;
  candidates: { id: string; title: string; artists: string[]; album?: string; genres: string[]; preferenceScore: number }[];
  relations: { relation: string; sourceLabel: string; targetLabel: string; reason: string; trackIds: string[] }[];
};
type AIJourneyOutput = { summary: string; stops: { trackId: string; reason: string }[] };
```

核心流程：适配器仅返回原始模型文本，应用先 JSON 解析、再以 Zod 校验，最后检查候选集与起点；只有全部通过才允许保存 `mode=ai`。本地模拟 HTTP 响应验证了端点、服务端认证头和结构化提示词。真实服务地址和密钥尚未提供，因此**实际模型调用未验收**。

## 第二工作段：生成并验证路线

实现方案：世界卡片可输入不超过 120 字的方向，例如“更梦幻一点”。`POST /api/journeys` 在已有起点参数之外接受 `intent`。服务端先准备真实候选，模型调用在数据库事务外完成；保存前重新读取所属世界和音乐库。校验输出站数、首站、歌曲存在、候选归属、重复和每站理由。格式或内容不合格时重试一次；仍失败、服务断线、超时或未配置模型时，保存确定性 Journey。路线详情保留方向和实际 `mode`，地图按已保存歌曲高亮；界面把模型理由标为“模型建议”。

本轮默认无模型时，基础算法仅把已知方向词匹配到**已导入的流派标签**。例如“更梦幻一点”只会给明确标为 dream pop、shoegaze、ambient 的候选加权；没有这些标签时仍生成有效基础路线，不声称听感已被模型分析。

核心代码位置：`src/lib/music/journeys.ts` 的 `createGuidedJourney`、`src/lib/ai/journey.ts` 的 `requestAIJourney`、`src/lib/music/journey/planner.ts` 的真实数据规划器，以及地图卡片和 Journey 面板。路线数量不足 5 首时仍只保存实际歌曲。

## 第三工作段：故障检查与 AI Guide 准备

| 测试输入 | 预期结果 | 验证位置 |
| --- | --- | --- |
| 非法 JSON、结构缺失 | 最多请求两次，随后基础路线 | `tests/ai-journey.test.ts` |
| 不存在歌曲、重复歌曲、错误起点、错误站数 | 拒绝模型输出，基础路线仍可保存 | `tests/ai-journey.test.ts` |
| 连接断开、超时 | 中止/结束模型尝试并保存 5 首不同的真实歌曲 | `tests/ai-journey.test.ts` |
| 无密钥 | 不发模型请求，按显式流派标签调整基础路线并持久化 | 单元测试与 `tests/e2e/library.spec.ts` |
| 浏览器完整操作 | 方向输入 → 五站路线与地图高亮 → Guide 事实回答 → 详情刷新 | `tests/e2e/library.spec.ts` |

AI Guide 已预留服务端输入契约：当前节点、显式导入信号和流派统计、邻近真实节点、最近 Journey、用户问题；未来模型输出契约限定为 `intent`、`recommendedNodeIds`、`explanation`。当前 `POST /api/guide` 只回答可核对的世界事实，返回 `mode=facts`，并按匿名会话校验资源归属。卡片中的 Guide 基础界面可直接试用。

## 本轮验收清单

- [x] 统一模型接口、服务端配置边界、结构化 Journey 输入输出与 JSON Schema：代码检查及契约测试。
- [x] 候选歌曲、已有关系、用户方向进入受限模型输入：契约测试检查 ID、字段与数量。
- [x] 自然语言方向影响基础路线，站点仍来自真实库：单元测试和浏览器测试。
- [x] 格式错误重试一次；未知/重复歌曲、错误起点、断线、超时、无密钥自动回退：故障注入测试。
- [x] 地图高亮、路线模式与方向持久化、Guide 事实界面：浏览器测试与刷新测试。
- [ ] 真实模型调用并验证其调整路线：依用户本轮要求延后，尚无真实服务与密钥，不以模拟响应冒充验收。

本机结果：`npm run check` 通过（86 项单元与集成测试），`npm run test:e2e` 通过（8 项浏览器测试），`npm run build` 通过；构建后的 `npm run test:restart` 确认五站方向路线、音乐库与世界跨进程一致，SQLite 完整且无外键违规。证据：[方向输入、地图高亮与基础路线](artifacts/d4-ai-interface.png)、[Guide 事实预览](artifacts/d4-guide-preview.png)、[跨进程重启结果](artifacts/d4-restart-proof.json)。
