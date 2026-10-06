# D2 API 契约

所有个人资源按 HttpOnly `music_world_session` Cookie 归属；客户端不得指定 userId。响应使用 `Cache-Control: private, no-store`。写操作需要 `X-Music-World: 1`，浏览器 Origin 必须匹配 `APP_ORIGIN`（未配置时匹配请求 URL Origin）。没有会话或请求其他会话的世界返回相同 404。

| 方法与路径 | 输入 | 返回 |
| --- | --- | --- |
| GET /api/providers | 无 | Provider 能力/可用状态；没有登录密钥 |
| GET /api/library | scope=library（默认）或 demo | tracks、playlists、signals、worlds、imports、counts；首次建立会话 |
| POST /api/imports/file | multipart：1–10 个 files，可选 encoding、sourceProvider（file/qqmusic/netease/kugou/qishui/spotify） | importId、reused、addedTracks、addedSources、report；sourceProvider 是用户声明，不是账号授权 |
| POST /api/imports/qqmusic | 开关开启时的 JSON：kind=playlist（playlist.externalId/name）或 kind=recent；tracks 只含标题、艺术家、专辑、时长、externalId、可选歌曲网页 URL，最多 5,000 条 | 与文件导入相同的保存结果；关闭时 403；服务端不接收 SDK Cookie、播放链接或原始响应 |
| POST /api/imports/demo | 无 | 保存独立 Demo 副本，同上；首次可建立会话 |
| POST /api/music/normalize | 原始 JSON 歌曲对象数组 | ImportReport，仅验证，不保存歌曲；首次可建立会话 |
| POST /api/worlds | JSON：name，scope 可选 | world、reused；空库 422 |
| GET /api/worlds/:id | 世界 UUID | MusicWorld，含节点、边、解释、证据、群组、歌曲数量 |
| POST /api/journeys | JSON：worldId，startNodeId 或 startTrackId 二选一；可选 intent（1–120 字）；length 只能为 5 或省略 | MusicJourney，含 1–5 个真实歌曲站点、理由及实际 mode |
| GET /api/journeys/:id | 路线 UUID | 当前会话的 MusicJourney，含可展示的歌曲摘要；跨会话 404 |
| POST /api/guide | JSON：worldId、nodeId、question（1–240 字），可选当前 journeyId | 当前节点的事实解释、可聚焦的真实节点 ID、方向支持状态与证据；当前 mode=facts |
| DELETE /api/library | 无 | deleted=true；清空当前会话两个 scope 和所有派生世界，保留匿名会话 |
| GET /api/health | 无 | ok、storage、persistentPathConfigured；不泄露数据库路径 |

`GET /api/library` 实际歌曲字段为 `tracks`，没有音频资源。`persistentPathConfigured` 仅代表显式配置过路径，不证明托管商承诺保留磁盘。

单行/文件解析问题在成功的 ImportReport 中返回 `errors`，业务可同时保留有效部分；非法请求 400、来源拒绝 403、资源超限 413/409、空库 422。其他失败返回 500 通用中文提示，不回传 SQL、服务端路径或堆栈。

世界 JSON 是可供下一阶段地图读取的完整数据，所有 edge.source/target 均引用本世界节点；evidence.trackIds 引用所属音乐库真实歌曲。只使用 same_artist、same_album、same_genre、user_cooccurrence；不生成相似心情、历史影响或 AI 事实。

Journey 的 startNodeId 必须是保存世界中的主节点 UUID；从地图增补的路线歌曲继续出发时，使用当前库中的 startTrackId。两者只可提供一个。艺术家、专辑和流派节点会从已保存的关联歌曲选实际起点。路线不足 5 首时返回实际数量与原因；前端据 `requestedLength=5` 标明不足。`mode=deterministic` 表示本次由基础算法生成，`mode=ai` 仅在模型输出通过结构与真实歌曲校验后保存。橙色虚线只表示访问顺序，不表示歌曲之间已验证的相似性或影响关系。

可选 intent 会保存到 Journey。没有模型配置或调用失败时，基础算法仅把已识别方向映射到曲库明确的流派标签；例如“更梦幻一点”可优先考虑已标为 dream pop、shoegaze、ambient 的歌曲，不推断未导入的声音特征。Guide 当前返回 `mode=facts`、`intent`、`recommendedNodeIds`、`directionSupported`、`explanation` 和依据；推荐节点经保存世界的节点集校验，客户端可聚焦节点或用方向创建新 Journey。未来模型输出只允许 intent、recommendedNodeIds、explanation 三个语义字段，并须再次验证推荐节点归属。
