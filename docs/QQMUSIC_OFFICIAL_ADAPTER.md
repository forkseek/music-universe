# QQ 音乐官方 H5 适配边界

核对日期：2026-10-03。适配依据为[腾讯云「物联网开发平台 · 音乐服务」官方文档](https://cloud.tencent.com/document/product/1081/67456)，该文档描述的是**腾讯连连自定义 H5 面板**里的 `window.h5PanelSdk.qqMusic`，不是普通网页通用的 QQ 音乐登录 API。官方文档列出 `getAuthStatus()`、`goAuthPage()`、`describeSelfSongList()`、`describeSongList()` 和 `describeRecentPlay()`；未授权时，需授权的接口可报 `InvalidParameterValue.OAuthClientNotExist`。

已核对的接口约束：`describeSongList({ DissId, Page, PageSize })` 的 `Page` 从 **0** 开始，`PageSize` 最多 **30**；歌曲列表提供 `SongId`、标题、歌手、专辑与时长等元数据。`describeRecentPlay({ Type: 2, UpdateTime: 0 })` 可读取歌曲页最近播放。公开的歌单歌曲结构不承诺提供可打开的歌曲网页，因此适配器不会从 SongId 猜造播放页，也不会存储 SDK 响应里的音频链接。

当前实现：

- `NEXT_PUBLIC_ENABLE_QQMUSIC=false` 为默认值。开关关闭、浏览器缺少 SDK、SDK 方法不全、授权未完成或检查失败时，页面给出各自原因；文件和 Demo 入口一直可用。
- 开关开启且当前面板 SDK 返回已授权时，浏览器适配器读取个人歌单，以 30 首分页并检测重复页（含重排）、空页、总数变化、上限和异常；最近播放单独转换。操作中授权状态变化会更新界面并清除旧歌单。导入只发送歌曲、歌手、专辑、时长、平台歌曲 ID 和歌单信息等白名单元数据，不发送 Cookie、会员凭证、原始 SDK 响应或音频直链。
- `POST /api/imports/qqmusic` 再次限制大小、字段、来源网页与当前会话，统一标准化、去重并事务保存。平台 `SongId` 只进入来源的 `externalId`，内部歌曲仍用 UUID。重复批次和同一歌单内的同一官方歌曲来源不会重复增加。
- 地图只显示有代表性的少量连接；完整关系证据仍保存在世界中并可下载。

**尚未验证**：当前没有获授权的腾讯连连 H5 面板和真实 QQ 音乐账户环境，故没有真实 SDK 调用、授权跳转、字段漂移或平台权限实测。服务端也无法仅凭客户端上传的元数据证明其确实来自 SDK；页面只陈述“当前面板报告已授权”，不把替身测试称为官方接入验收。启用前应在获授权的官方面板核对项目权限、可用域名、真实响应及平台使用条款。

本地替身检查可在 PowerShell 中运行：

```powershell
$env:NEXT_PUBLIC_ENABLE_QQMUSIC='true'
npm run test:e2e -- -g 'QQ SDK stand-in'
```

这项测试在浏览器注入**测试替身**，验证 65 首歌分三页、重复导入、最近播放、授权撤销反馈以及 15–30 个地图主节点；它不是官方服务可用证明。普通浏览器测试和关闭开关的 API 拒绝测试由默认 `npm run test:e2e` 覆盖。真实环境启用时，须在构建或启动 Next.js 前配置开关；不要把模型密钥放入 `NEXT_PUBLIC_` 变量。
