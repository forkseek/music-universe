# Music World 开发指令

你正在开发一个名为 **Music World** 的 Web 项目。

它是一个 AI 驱动的音乐探索产品。

用户可以从 QQ 音乐、网易云音乐等平台导入自己的音乐资产，系统将歌曲、艺术家、专辑、流派、年代和情绪转化为一个可交互的 Music World，并通过 AI 生成探索路线 Journey。

---

# 0. 最重要的工程原则

不要把任何音乐平台 API 直接写进业务逻辑。

必须建立统一的：

`Music Provider Adapter Layer`

所有音乐来源先转换成统一数据格式，再进入 Music World。

禁止：

- 抓取用户 Cookie
- 要求用户粘贴 Cookie
- 模拟账号登录
- 逆向平台客户端
- 绕过 OAuth
- 绕过会员限制
- 绕过 DRM
- 获取或转发受限音频直链
- 将第三方非公开 API 当生产接口
- 在没有官方权限时伪造“QQ音乐登录成功”

MVP 只处理：

**音乐元数据和用户音乐资产。**

不处理完整版权音频。

---

# 1. 技术栈

使用：

```text
Next.js
TypeScript
React
Tailwind CSS
Framer Motion
React Flow
d3-force
Zod

后端：
Next.js Route Handlers

数据库：
开发环境 SQLite
ORM 使用 Prisma 或 Drizzle

AI：
Provider 抽象
支持 OpenAI / DeepSeek / Qwen 等模型
```

项目必须可以：

```bash
npm install
npm run dev
```

直接运行。

---

# 2. 项目目录

建立以下结构：

```text
src/

  app/
    page.tsx

    world/
      [worldId]/
        page.tsx

    journey/
      [journeyId]/
        page.tsx

    api/

      providers/
        route.ts

      imports/
        file/
          route.ts

        qqmusic/
          route.ts

      music/
        normalize/
          route.ts

      worlds/
        route.ts

      journeys/
        route.ts

  components/

    import/
      MusicSourceSelector.tsx
      QQMusicConnector.tsx
      PlaylistFileImport.tsx

    world/
      MusicWorld.tsx
      MusicNode.tsx
      MusicEdge.tsx
      MusicCard.tsx

    journey/
      JourneyPanel.tsx
      JourneyPath.tsx

    ai/
      AIGuide.tsx

  lib/

    music/

      providers/
        types.ts
        registry.ts
        qqmusic.ts
        netease.ts
        file.ts
        mock.ts

      normalize/
        track.ts
        artist.ts
        deduplicate.ts

      graph/
        buildGraph.ts
        scoring.ts
        layout.ts

      journey/
        planner.ts

    ai/
      client.ts
      schemas.ts
      prompts.ts

  db/
    schema.ts

  types/
    music.ts
    world.ts
```

---

# 3. Provider 抽象

创建：

```ts
export type MusicProviderId =
  | "qqmusic"
  | "netease"
  | "file"
  | "demo";

export interface MusicProviderCapabilities {
  auth: boolean;
  playlists: boolean;
  recentTracks: boolean;
  likedTracks: boolean;
  playback: boolean;
}

export interface MusicProvider {
  id: MusicProviderId;
  name: string;

  isAvailable(): Promise<boolean>;

  getCapabilities(): MusicProviderCapabilities;

  connect?(): Promise<void>;

  listPlaylists?(): Promise<ProviderPlaylist[]>;

  getPlaylistTracks?(
    playlistId: string
  ): Promise<ProviderTrack[]>;

  getRecentTracks?(): Promise<ProviderTrack[]>;
}
```

业务层永远不能调用：

```ts
qqMusicApi.xxx()
```

而应该调用：

```ts
provider.getPlaylistTracks()
```

---

# 4. 标准 Track 数据结构

所有平台数据统一转换成：

```ts
export interface NormalizedTrack {
  id: string;

  title: string;

  artists: {
    id?: string;
    name: string;
  }[];

  album?: {
    id?: string;
    name: string;
    cover?: string;
  };

  durationMs?: number;

  genre?: string[];

  releaseDate?: string;

  cover?: string;

  source: {
    provider:
      | "qqmusic"
      | "netease"
      | "file"
      | "demo";

    externalId?: string;

    externalUrl?: string;
  };
}
```

禁止把：

```text
QQ Music SongId
网易云 songId
```

当成项目内部主键。

项目内部必须使用自己的 UUID。

---

# 5. Track 去重

用户可能同时从：

QQ音乐

网易云音乐

导入同一首歌。

必须进行去重。

优先顺序：

```text
ISRC
↓
歌曲名 + 主艺术家
↓
歌曲名 + 艺术家 + 专辑
```

生成：

```ts
canonicalKey
```

例如：

```text
let down|radiohead
```

标准化时：

- trim
- lowercase
- Unicode normalize
- 移除无意义空格
- 统一 feat./ft.
- 保留原始 metadata

相同歌曲可以对应多个 Source。

例如：

```json
{
  "title": "Let Down",
  "artist": "Radiohead",
  "sources": [
    {
      "provider": "qqmusic",
      "externalId": "xxx"
    },
    {
      "provider": "netease",
      "externalId": "yyy"
    }
  ]
}
```

---

# 6. QQ 音乐 Provider

QQ 音乐官方已经存在特定腾讯 H5 SDK 环境下的音乐能力。

目前已公开的能力包括：

```ts
window.h5PanelSdk.qqMusic.getAuthStatus()

window.h5PanelSdk.qqMusic.goAuthPage()

window.h5PanelSdk.qqMusic.describeSelfSongList()

window.h5PanelSdk.qqMusic.describeSongList()

window.h5PanelSdk.qqMusic.describeRecentPlay()
```

其中：

## 获取个人歌单

```ts
describeSelfSongList()
```

返回内容包含：

```text
DissId
DissName
DissPic
SongNum
CreateTime
UpdateTime
```

## 获取歌单歌曲

```ts
describeSongList({
  DissId,
  Page,
  PageSize
})
```

注意：

```text
PageSize 最大 30
```

必须实现分页。

示例：

```ts
async function fetchAllPlaylistTracks(dissId: number) {
  let page = 0;
  const pageSize = 30;

  const tracks = [];

  while (true) {
    const result =
      await window.h5PanelSdk.qqMusic.describeSongList({
        DissId: dissId,
        Page: page,
        PageSize: pageSize
      });

    tracks.push(...result.SongList);

    if (tracks.length >= result.TotalNum) {
      break;
    }

    page += 1;
  }

  return tracks;
}
```

## 最近播放

使用：

```ts
describeRecentPlay({
  Type: 2,
  UpdateTime: 0
})
```

Type 2 表示歌曲。

---

# 7. QQ Music Provider 必须检测运行环境

普通 Web 浏览器中：

```ts
window.h5PanelSdk
```

通常不存在。

所以必须：

```ts
function hasQQMusicOfficialSDK() {
  return (
    typeof window !== "undefined" &&
    !!window.h5PanelSdk?.qqMusic
  );
}
```

如果不存在：

不要报错。

返回：

```json
{
  "available": false,
  "reason": "OFFICIAL_SDK_NOT_AVAILABLE"
}
```

前端显示：

```text
QQ 音乐官方连接

当前 Demo 环境尚未获得官方 SDK 权限。

你仍可以通过导入歌单文件创建音乐世界。
```

---

# 8. QQMusic Feature Flag

加入：

```env
NEXT_PUBLIC_ENABLE_QQMUSIC=false
```

只有：

```text
ENABLE_QQMUSIC=true
+
官方 SDK 存在
```

才显示真实授权按钮。

否则显示：

```text
Official integration pending
```

不要构造虚假 API。

---

# 9. 网易云音乐 Provider

当前版本不要实现：

```text
网易云账号 OAuth
Cookie 登录
二维码登录代理
非公开接口账号登录
```

因为目前没有可依赖的通用官方第三方 Web OAuth 方案。

创建：

```ts
NeteaseMusicProvider
```

但当前：

```ts
capabilities.auth = false
```

Provider 第一阶段支持：

```text
文件导入
结构化歌单导入
```

如果未来获得官方 API：

只替换：

```text
NeteaseMusicProvider
```

而 Music World 其他代码完全不修改。

---

# 10. 文件导入 Provider

这是 Hackathon MVP 必须确保 100% 可用的 Provider。

支持：

```text
JSON
CSV
TXT
```

CSV 示例：

```csv
title,artist,album
Let Down,Radiohead,OK Computer
Alison,Slowdive,Souvlaki
Starless,King Crimson,Red
```

JSON：

```json
[
  {
    "title": "Let Down",
    "artist": "Radiohead",
    "album": "OK Computer"
  }
]
```

TXT：

```text
Radiohead - Let Down
Slowdive - Alison
King Crimson - Starless
```

全部转换成：

```ts
NormalizedTrack[]
```

---

# 11. Demo Provider

创建：

```ts
DemoMusicProvider
```

包含约：

```text
50–100 首歌曲
20–30 位艺术家
```

用于：

比赛展示

自动化测试

无网络 Demo

禁止把 Demo 数据伪装成用户真实数据。

UI 必须标记：

```text
Demo Music Library
```

---

# 12. 导入流程

完整流程：

```text
Music Source
      ↓
Provider
      ↓
ProviderTrack[]
      ↓
Normalizer
      ↓
NormalizedTrack[]
      ↓
Deduplication
      ↓
User Music Library
      ↓
Music Graph
      ↓
Music World
```

实现：

```ts
async function importMusicLibrary(
  provider: MusicProvider
) {
  const rawTracks =
    await collectProviderTracks(provider);

  const normalized =
    normalizeTracks(rawTracks);

  const deduplicated =
    deduplicateTracks(normalized);

  return saveUserMusicLibrary(deduplicated);
}
```

---

# 13. 用户音乐信号

不要只记录“用户有这首歌”。

建立：

```ts
export interface UserTrackSignal {
  trackId: string;

  liked?: boolean;

  playlistCount: number;

  recentlyPlayed?: boolean;

  recentScore?: number;

  sourceCount: number;

  preferenceScore: number;
}
```

简单评分：

```text
Liked                     +5
出现在多个歌单             +2 / 次
最近播放                   +3
多个音乐平台都有收藏        +3
```

最终：

```text
preferenceScore
```

用于决定 Music World 中：

节点大小

节点中心程度

Journey 起点

---

# 14. Music Graph

Graph 结构：

```ts
interface MusicNode {
  id: string;

  type:
    | "track"
    | "artist"
    | "album"
    | "genre";

  label: string;

  weight: number;

  metadata: Record<string, unknown>;
}
```

Edge：

```ts
interface MusicEdge {
  source: string;
  target: string;

  relation:
    | "same_artist"
    | "same_album"
    | "same_genre"
    | "similar_mood"
    | "user_cooccurrence"
    | "influence"
    | "ai_related";

  weight: number;

  reason?: string;
}
```

---

# 15. 第一版 Graph 关系

优先使用确定性数据：

```text
Same Artist
Same Album
Same Genre
用户同一歌单出现
用户多个歌单共同出现
```

AI 只负责补充：

```text
Mood
Style
Theme
Journey explanation
```

不要让 LLM 凭空生成事实性：

```text
某艺术家影响了某艺术家
```

如果无法验证：

使用：

```text
AI related
```

而不是：

```text
Influenced by
```

---

# 16. Music World 生成

输入：

```ts
NormalizedTrack[]
```

输出：

```ts
MusicWorld
```

例如：

```ts
interface MusicWorld {
  id: string;

  name: string;

  nodes: MusicNode[];

  edges: MusicEdge[];

  clusters: MusicCluster[];
}
```

聚类维度：

```text
Genre
Mood
Era
Artist
```

第一版地图保持：

```text
15–30 个主要节点
```

不要一次展示几百首歌。

---

# 17. World UI

第一版使用：

```text
React Flow
+
d3-force
```

实现：

缩放

拖动

Hover

节点点击

路径高亮

不要第一版直接做完整 Three.js 世界。

Three.js 属于 Phase 2。

---

# 18. Journey API

实现：

```http
POST /api/journeys
```

输入：

```json
{
  "worldId": "xxx",
  "startNodeId": "xxx",
  "intent": "更梦幻一点",
  "length": 5
}
```

输出：

```json
{
  "journeyId": "xxx",

  "title": "Into the Dream",

  "nodes": [
    {
      "trackId": "1",
      "reason": "起点"
    },
    {
      "trackId": "2",
      "reason": "空间感更强"
    }
  ]
}
```

LLM 必须输出符合 Zod Schema 的 JSON。

解析失败自动 retry 一次。

再次失败：

使用确定性 Graph 算法生成路线。

---

# 19. AI Guide

输入：

```text
当前节点
用户音乐画像
附近节点
当前 Journey
用户问题
```

例如：

用户：

```text
更梦幻一点
```

AI 不重新生成整个数据库。

只返回：

```json
{
  "intent": "dreamier",
  "recommendedNodeIds": [],
  "explanation": ""
}
```

---

# 20. Playback

第一版禁止代理完整歌曲音频。

Music World 负责：

```text
Explore
Discover
Understand
```

音乐平台负责：

```text
Play
```

Track Card 提供：

```text
Open in source platform
```

如果 source 存在 externalUrl：

```ts
<a
  href={track.source.externalUrl}
  target="_blank"
  rel="noopener noreferrer"
>
  Open in QQ Music
</a>
```

---

# 21. 数据库

至少包含：

```text
User

MusicSource

ImportSession

Track

TrackSource

Artist

Album

Playlist

PlaylistTrack

UserTrackSignal

MusicWorld

MusicNode

MusicEdge

Journey

JourneyNode
```

---

# 22. 隐私

不要保存：

```text
QQ Cookie
网易云 Cookie
会员 token
播放 URL
DRM 数据
```

只保存：

```text
歌曲 metadata
Provider external ID
歌单信息
用户主动导入的音乐关系
```

提供：

```http
DELETE /api/library
```

允许删除全部导入数据。

---

# 23. API

实现：

```text
GET
/api/providers

POST
/api/imports/file

POST
/api/imports/qqmusic

POST
/api/music/normalize

POST
/api/worlds

GET
/api/worlds/:id

POST
/api/journeys

GET
/api/journeys/:id
```

---

# 24. Provider 状态 API

GET：

```text
/api/providers
```

返回：

```json
[
  {
    "id": "qqmusic",
    "available": false,
    "official": true,
    "capabilities": {
      "auth": true,
      "playlists": true,
      "recentTracks": true
    }
  },

  {
    "id": "netease",
    "available": false,
    "official": false,
    "capabilities": {
      "auth": false
    }
  },

  {
    "id": "file",
    "available": true
  },

  {
    "id": "demo",
    "available": true
  }
]
```

---

# 25. 首页

首页核心 CTA：

```text
Build My Music World
```

下面显示：

```text
QQ Music
Connect

NetEase Cloud Music
Import Playlist

Upload Playlist

Try Demo
```

但只有真正可用的 Provider 显示：

```text
Connect
```

没有官方权限时显示：

```text
Coming with official integration
```

---

# 26. 用户体验

第一条完整链路必须优先完成：

```text
导入歌曲
↓
生成 Music World
↓
点击一个节点
↓
生成 Journey
↓
路径在地图亮起
```

在这条流程跑通之前：

不要做：

登录系统

社交

复杂 3D

音乐护照

成就系统

评论

UGC

移动 App

---

# 27. 测试

必须覆盖：

### Provider

QQ SDK 不存在时页面不能 crash。

### Pagination

QQ Music 歌单超过 30 首时能够继续分页。

### Normalization

不同 Provider 同一首歌曲能够合并。

### Import

CSV / JSON / TXT 可以导入。

### Graph

100 首歌曲能够生成有限数量 World Node。

### AI

LLM 返回非法 JSON 时存在 fallback。

### Offline

没有 AI API Key 时：

Demo World 仍然可以工作。

---

# 28. 完成标准

MVP 完成必须满足：

```text
用户进入首页
↓
选择 Demo 或导入音乐
↓
系统构建音乐库
↓
生成音乐地图
↓
地图可探索
↓
点击艺术家或歌曲
↓
显示关系解释
↓
点击 Start Journey
↓
生成 5 个节点路线
↓
地图路径高亮
```

除此之外全部属于第二阶段。

---

# 29. 开发顺序

严格按照：

```text
1 Provider Interface

2 File Provider

3 Normalizer

4 Deduplication

5 Database

6 Music Graph

7 Music World UI

8 Journey

9 AI Guide

10 QQ Music Official Adapter

11 UI Polish
```

不要先做复杂动画。

先保证完整闭环。

---

# 30. 最终原则

项目架构必须保证：

今天使用：

```text
File Provider
```

未来拿到 TME 权限后加入：

```text
QQMusicProvider
```

再未来加入：

```text
NeteaseProvider
SpotifyProvider
AppleMusicProvider
```

都不需要修改：

```text
Music Graph
Music World
Journey
AI Guide
```

Music World 必须是：

**音乐平台无关的音乐探索层。**