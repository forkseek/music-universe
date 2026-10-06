# 导入契约

## 入口与数据流

`importPlaylistFiles(files: ImportFile[]): ImportReport` 是业务入口：统一注册表 → File Provider → 解码/解析/Zod 校验 → `ProviderTrack[]` → 标准化 → 去重 → 报告。其他 Provider 后续提供相同 `ProviderTrack`，不让业务层依赖音乐平台 API。

`ImportFile` 包含 `name`、`Uint8Array bytes` 和可选 `encoding`。UI 在读取文件前检查大小；库入口再次检查。文件格式由扩展名决定，不信任浏览器的 MIME 猜测。样例按钮调用入口的 `{ demo: true }` 选项，报告带 `isDemo: true`，来源明确标记 provider/importedVia 为 demo，下载后仍可识别且不参与真实偏好信号。

## 资源上限

| 项目 | 上限 |
| --- | --- |
| 单个文件 | 2 MiB（2,097,152 字节） |
| 每批文件 | 10 个，合计 10 MiB |
| 每文件/每批输入记录 | 5,000 条，含错误行，不按去重后数量计算 |
| 文本字段和文件名 | 500 个 JavaScript 字符单元 |
| 外部 URL | 2,048 个字符 |
| 每首艺术家/流派 | 各 20 项 |
| 时长 | 正整数毫秒，最多 24 小时 |

超限文件整体拒绝；批次总量超限则整批拒绝。多个同名文件在一批中拒绝，需重命名以区分来源。字段错误不影响其他有效记录。最多显示前 100 条问题，下载结果包含完整列表。

## 编码与行定位

自动模式接受严格 UTF-8（可带 BOM），识别 UTF-16 LE/BE BOM。GBK/GB18030 必须手动选择 GB18030，不从损坏的 UTF-8 猜测编码。拒绝无效字节、NUL 等控制字符和替换字符；编码选择与 BOM 冲突时报告问题。

CSV 先统一 CRLF/CR 为 LF，支持引号中逗号、换行、双写引号；列数错误定位到记录结束的物理行。JSON `row` 是从 1 开始的数组项，TXT 是物理行。CSV 空白物理行和 TXT 空白行跳过。

JSON 必须是对象数组；损坏的 JSON/CSV 整个文件拒绝，不尝试修补后偷偷导入部分内容。只报安全、可理解的错误，不把原始凭证或整行数据写入错误消息。

## 字段

| 字段 | 含义/规则 |
| --- | --- |
| title | 必需的非空标题 |
| artist / artists | 至少一个；字符串或 JSON 字符串数组；artists 优先 |
| album | 可选专辑名 |
| durationMs | 可选毫秒；CSV 可以是纯数字字符串 |
| genre | 可选字符串，JSON 也支持字符串数组 |
| releaseDate | 可选来源提供的日期文本；D1 不据此推断年代或真伪 |
| version | 可选显式版本；会参与去重保护 |
| isrc | 可选；去除空白/连字符并大写后须匹配 12 位 ISRC 语法；不代表已验证真实录音身份 |
| provider | file / qqmusic / netease / kugou / qishui / spotify，默认 file；文件内值仅为声明来源，不能在上传文件中声明 demo |
| externalId | 可选平台原始 ID，必须是字符串，不作为内部主键 |
| externalUrl | 可选受支持 HTTPS 歌曲网页；不合法时忽略并提示 |
| playlistExternalId / playlistName | 显式歌单来源；未提供时不会虚构一个歌单 |
| liked / recentlyPlayed | 可选布尔；CSV 支持 true/false，不接受模糊真值 |

原始 `metadata` 白名单仅保存 `title`、`artists`、`album`、`durationMs`、`genre`、`releaseDate`、`isrc`、`version`、`liked`、`recentlyPlayed`。从已验证字段显式构建对象；忽略其他键、任意嵌套 metadata、Cookie、token、音频播放地址和 DRM 数据。

只接受 `https://music.163.com/song?id=...`（包括其 hash 形式）、`https://y.qq.com/n/ryqq/songDetail/...` 与 `https://open.spotify.com/track/<22 位 ID>`；只保留歌曲定位必需部分，去除额外 query/hash。文件名、行号、声明 Provider、外部 ID 和安全网页地址放在 `TrackSource`，不混入原始 metadata。可用 `sourceProvider` 为整批缺失 `provider` 的行声明来源；显式逐行值优先，且同一文件按不同声明来源导入时不会误判为同一来源。

## 标准化与身份

- 内部歌曲/来源记录生成 UUID；平台 externalId 保留为独立字符串。
- 展示文本执行 NFKC、空白折叠、trim、移除零宽噪声，保留来源大小写；匹配键另行转为小写并统一常见引号。
- `Song (feat. Guest)`、`Song featuring Guest` 与 `Singer ft. Guest` 提取统一的客串艺术家列表。不会按 `&`、`/` 或逗号随意拆开乐队名称。原文仍在来源 metadata。
- `canonicalKey` 使用带版本号的 JSON 元组编码，避免标题里的 `|` 造成拼接碰撞；包括规范化标题、主艺术家、排序后的客串艺术家、版本标记。
- canonicalKey 是候选索引，**不是唯一键**；ISRC 也不是数据库唯一键。冲突记录可以拥有相同键。

## 去重规则

1. 优先对比 ISRC，但版本、艺术家及显著时长冲突时保留独立记录。两个非空且不同的 ISRC 不合并。
2. ISRC 缺失时用严格的规范化标题与艺术家集合；不做编辑距离或“相似标题”模糊吞并。
3. 出现多个候选时用专辑名作为补充证据；仍有歧义则保留独立记录。不要求所有同曲在不同合辑里专辑相同。
4. 标题或专辑中的 Live、Remix、Mix、Remastered、Acoustic、Instrumental、现场等版本标记及显式 version 参与保护；未标注版本不自动解释为已验证的录音室版本。共享 ISRC 时也要求主艺术家与客串艺术家证据一致。
5. 已知时长的全组最大差值不得超过 `max(2000ms, 最短时长×1%)`，防止逐条接近造成传递误合并。
6. 先处理 ISRC/时长更完整的记录，避免无 ISRC 的弱记录把两个不同 ISRC 连接成一首。无法判断的独立记录不会伪称已解决。
7. 合并保留所有来源，持久化时保留现有 UUID，不合并两条已经保存且独立的冲突身份。浏览器预览的来源键包含文件名；D2 保存层以文件内容 SHA-256 替代文件名，因此同扩展名的文件改名重传也不会增加记录。

该策略倾向少合并；没有提供任何版本/时长/ISRC 信息的完全同名同艺术家录音，无法凭文件识别未知差异。

## 统计

`totalRecords`：成功解析到的候选行/项；不包括 CSV 表头和空白行。无法解析整个文件时为 0（未知，并不代表文件里肯定没有歌曲），文件级错误仍返回。

`validRecords`：验证通过的输入条数；`invalidRecords = totalRecords - validRecords`；`mergedRecords = validRecords - uniqueTracks`；`uniqueTracks` 为最终集合大小。错误列表按问题返回，同一行可能有多个字段错误，因此错误列表长度不等于无效记录数。部分文件损坏时，其他合法文件仍可形成预览。

## 真实信号

只有显式 `liked` / `recentlyPlayed` 才构成证据；未知或相互矛盾时保留 undefined/数据库 NULL。不同歌单按 Provider+playlistExternalId 去重计数。普通文件不会自动视为收藏、最近播放或歌单成员。Demo 记录不参与真实用户偏好计算。

评分：明确收藏 +5；明确最近播放 +3；同曲在额外歌单中每个 +2；两个实际声明平台均明确收藏再 +3。`sourceCount` 只是不同声明 Provider 的个数，不能单独证明“多平台收藏”。

## D2 保存与幂等

前端上传原始文件，服务端重复执行全部解析/标准化/去重校验，不接受客户端生成的用户 ID 或歌曲 UUID。导入记录存安全报告，不存原始文件字节或任意额外 metadata。全部无效的文件返回可读问题并记录 failed；混合输入只保存有效部分。

批次键包含版本、scope、排序后的文件内容哈希、扩展名、编码。同批次内容重传复用原导入记录；改文件名不影响该键，改扩展名或编码会重新解析。旧文件与新文件混合上传时，来源指纹阻止旧来源再次落库。修改内容后的文件视为新证据，但歌曲、歌单及其成员仍去重；不会把来源次数冒充播放次数。无显式歌单 ID 的普通文件不自动创建歌单。

每个 scope 最多 5,000 首歌曲、20,000 条来源、200 条导入记录、50 个世界。世界名最多 100 字符。无变化同名世界复用原记录。请求体流式计数，文件上传最多 10 MiB + 256 KiB multipart 开销，随后再次验证实际文件大小；世界 JSON 请求最多 64 KiB。
