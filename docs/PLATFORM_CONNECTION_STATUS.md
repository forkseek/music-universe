# 五个平台的接入边界（2026-10-03）

参考用户提供的 `Mineradio音乐平台接入协议解读.html` 识别平台与协议，再以本项目的 Web 环境、项目规则和官方文档核对。该 HTML 分析的是 Electron 本机服务，并非这五个平台授予 Music World 的接口权限。这里没有复制其 GPL 源码、Cookie 抓取、私有签名、会员探针、音频代理或解密实现。

| 平台 | 当前可用入口 | 账号直连状态 | 依据与后续条件 |
| --- | --- | --- | --- |
| QQ 音乐 | 用户提供的 CSV/JSON/TXT；条件式官方 H5 SDK 适配器 | 本机普通浏览器不可用，开关默认关闭；有腾讯连连自定义 H5 面板、SDK 方法齐全并完成授权后才可读取个人歌单和最近播放 | [腾讯云音乐服务文档](https://cloud.tencent.com/document/product/1081/67456)；本项目还需实际面板权限验收 |
| 网易云音乐 | 用户提供的 CSV/JSON/TXT 或结构化 JSON | 未接入账号 API | 参考文件依赖第三方 Cookie API；项目规则禁止将该路径冒充官方账号接入 |
| 酷狗音乐 | 用户提供的 CSV/JSON/TXT 或结构化 JSON | 未接入账号 API | [酷狗开放平台](https://open.kugou.com/docs)公开的是需按业务申请的能力；参考文件的盐值签名网关不是本项目的官方授权 |
| 汽水音乐 | 用户提供的 CSV/JSON/TXT 或结构化 JSON | 未接入账号 API | 参考文件中的抖音播放 OAuth scope 不等于汽水歌单读取权限；[抖音开放平台协议](https://open.douyin.com/platform/resource/docs/operation-standard/agreement-protocol/)要求按获批权限使用 |
| Spotify | 用户提供的 CSV/JSON/TXT 或结构化 JSON | 未接入账号 API | [官方 OAuth PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow)存在，但本项目未配置开发者应用、回调与授权；[2026 接口变更](https://developer.spotify.com/documentation/web-api/references/changes/february-2026)和[开发模式限制](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)需按实际账号核对；目前音乐画像/AI 用途还需评估[官方开发者政策](https://developer.spotify.com/policy) |

`GET /api/providers` 报的是**账号直连**可用状态。文件入口的 `fileImport: true` 只表示可以按用户声明的来源保存导出元数据，绝不表示平台已授权。QQ 官方接口只在浏览器侧 SDK 环境内有机会可用，普通浏览器不会被服务端状态误报为已授权。

文件导入区的“文件声明的来源”对整批没有 `provider` 列的记录生效；JSON/CSV 中显式的 `provider` 值可逐行指定，并优先于下拉框。允许 `qqmusic`、`netease`、`kugou`、`qishui`、`spotify` 或 `file`；用户上传的记录一律标记 `importedVia: "file"`。相同歌曲可以合并，同时保留各平台来源；选择不同平台导入相同文件会分别保留来源，重复选择同平台不会反复新增。上传文件不能声明自己是内置 Demo。

```json
[
  { "title": "Let Down", "artist": "Radiohead", "provider": "qqmusic" },
  { "title": "Let Down", "artist": "Radiohead", "provider": "netease" }
]
```

以上只是**格式示例**，不代表已从两个账号读取该歌曲。可附 `externalId`、`playlistExternalId`、`playlistName` 及经白名单验证的歌曲网页 `externalUrl`；不要放 Cookie、访问令牌、音频 URL 或 DRM 数据。当前歌曲网页链接白名单为 QQ、网易云和 Spotify 的明确歌曲页面；其他链接会在报告中提示并丢弃。

要完成真正的账号直连，还需要各平台对**这个 Web 项目和用途**开放可验证接口、开发者应用/授权信息、实际测试账号及运行环境。Spotify 尤其需要先确定持久化音乐库、偏好计算和 AI Guide 的用途与其条款相容；有接口文档并不等于已有使用许可。
