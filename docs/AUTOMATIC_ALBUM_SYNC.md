# 播放歌曲 → 自动生成所属专辑星系

已接入专辑宇宙 `http://127.0.0.1:5188/`，元数据服务运行于 Music World 的 `3002` 端口。
在音乐搜索里播放歌曲、双击歌曲星球，或使用底部播放器切歌，都会走同一条自动同步链路。

## 实际流程

1. `useAudioPlayback` 接收音源及歌曲元数据，真实 `<audio>` 发出 `playing` 后通知订阅者。
2. `usePlaybackAlbum` 提取歌曲身份，调用可复用的 `PlaybackAlbumResolver`。
3. `POST /api/music/album` 优先用平台歌曲 ID / 专辑 ID 获取专辑封面和完整曲目。
4. 按碟号、曲号整理曲序，先匹配平台歌曲 ID，再使用严格的歌名、歌手、专辑版本匹配。
5. 预加载封面，确认图片能作为 WebGL 纹理使用，再调用 `onResolved`。
6. `App` 更新场景专辑与当前歌曲的星球 ID。恒星材质直接读取新的封面，歌曲按完整曲序生成星球。

自动同步不会调用手动编辑入口 `replaceAlbum`，因此不会停止音频、随机更换 Seed 或重置镜头缩放。
同一专辑切歌只更新当前星球；跨专辑时才替换恒星与整套曲目。

## 文件结构

专辑宇宙前端目录：

```text
src/hooks/useAudioPlayback.ts       真实播放事件、音源与歌曲身份
src/hooks/usePlaybackAlbum.ts       播放事件订阅、异步同步、状态与重试
src/lib/automaticAlbum.ts           可复用 resolver、缓存、取消、DTO → 场景数据
src/lib/audioMetadata.ts            本地 ID3 / MP4 / FLAC / WAV 标签读取
src/lib/musicPlatforms.ts           统一 fetchPlayingAlbum API 客户端
src/lib/generateAlbumGalaxy.ts      独立星系生成器与 Album / Track 数据结构
src/hooks/useAlbumMusic.ts          星球、上一首/下一首复用专辑曲目来源
src/App.tsx                        接入回调、更新恒星与高亮星球
tests/automaticAlbum.test.ts        缓存、曲序、竞态、失败保留场景等验证
```

Music World 后端目录（当前工作区 `C:\path\to\music-world`）：

```text
src/app/api/music/album/route.ts            统一专辑识别入口
src/app/api/music/album/cover/route.ts      同源封面读取，供 3D 纹理使用
src/lib/music/platforms/albums.ts          平台适配、验证、元数据缓存
src/lib/music/platforms/album-matching.ts   曲序整理与严格歌曲匹配
src/lib/music/platforms/types.ts            服务端 DTO
src/lib/music/platforms/catalog.ts          可复用的、按会话归属的播放引用
src/lib/music/providers/radiohand-qq.ts     QQ 专辑详情和完整歌曲列表适配
integrations/mineradio/worker.cjs           网易云 song_detail / album 适配
tests/music-albums.test.ts                  专辑完整性、匹配、缓存及封面验证
```

## 必要数据结构

```ts
interface PlayingIdentity {
  provider?: 'qq' | 'netease' | 'kugou' | 'qishui'
  trackId?: string
  albumId?: string
  title: string
  artist: string
  album: string
  durationMs?: number
  discNumber?: number
  trackNumber?: number
}

interface AlbumResolution {
  album: {
    provider: 'qq' | 'netease' | 'kugou' | 'qishui'
    id: string
    name: string
    artist: string
    cover: string
    year?: number
    tracks: AlbumSong[] // 完整、有序；每项含平台 id、曲名、歌手、毫秒时长、碟号、曲号
  }
  trackId: string
  trackIndex: number // 从 0 开始；界面显示 trackIndex + 1
  matchedBy: 'id' | 'metadata'
}

interface PlaybackAlbum {
  album: Album        // 供现有 generateAlbumGalaxy 使用；曲目时长转换为秒
  planetId: string    // 与 album.tracks[trackIndex].id 严格一致
  trackIndex: number
  matchedBy: 'id' | 'metadata'
}
```

场景的 `Track.source` 保存 `{ provider, trackId, albumId, playbackId }`。
`playbackId` 是后端发放的会话所属播放引用，不是 Cookie 或音频直链；失效后播放器会重新检索。
场景 ID 带平台、专辑、碟号和曲号，避免同名曲目或多碟重复曲号互相覆盖。

## 新播放入口的接入方式

以后新增播放入口，只需把平台返回的元数据传给现有 `audio.load`，不需要逐首配置专辑：

```ts
const source = await resolveMusic(song)
if (source.playable && source.url) {
  await audio.load(musicWorldMedia(source.url), {
    id: `${song.provider}:${song.id}`,
    provider: song.provider,
    platformTrackId: song.id,
    albumId: song.albumId,
    title: song.name,
    artist: song.artist,
    album: song.album,
    cover: musicWorldMedia(song.cover),
    durationMs: song.duration || undefined,
    trial: source.trial,
  })
}
```

播放器组件订阅一次即可覆盖所有播放入口：

```tsx
const audio = useAudioPlayback()
const sync = usePlaybackAlbum(audio, ({ album, planetId }) => {
  setAlbum(album)
  setSelectedPlanetId(planetId)
  // 更新现有场景；保持当前 Seed、镜头距离，不再重新 load 音频。
})

return <>
  <audio ref={audio.audioRef} />
  <span role="status">{sync.message}</span>
</>
```

非 React 场景可直接复用同一个 resolver：

```ts
const resolver = new PlaybackAlbumResolver(fetchPlayingAlbum)
const latest = new LatestAlbumRequest()
await latest.run(identity, resolver, async (value, signal) => {
  await preloadAlbumCover(value.album.cover, signal)
  signal.throwIfAborted()
  renderAlbum(value.album)
  highlightPlanet(value.planetId)
})
```

## 平台覆盖与边界

- QQ、网易云优先走各自的专辑详情接口，实际校验过封面信息和完整曲序。
- 酷狗、汽水的现有适配器没有提供完整专辑详情，本次自动使用网易云的目录做严格元数据匹配；需要歌名、歌手和专辑版本一致。原音频仍来自用户选择的平台。
- 本地文件通过 [music-metadata](https://github.com/Borewit/music-metadata) 在浏览器读取标签，然后自动检索；本地音频文件不会上传给专辑服务。
- 无标签文件、普通音频直链缺少可确认的歌名/歌手时，会说明无法识别；没有声纹识别，也不会把文件名当作已确认的歌曲身份。
- Live、Remix、Deluxe 等版本标识会保留。重名且无法唯一确认的曲目不会猜测位置。
- 可渲染完整 1–300 首专辑，多于 40 首自动降低渲染品质。上游列表不完整或超出上限时显示错误，保留现有星系，不截断成假专辑。
- 客户端元数据缓存 10 分钟，服务端专辑缓存 15 分钟。快速切歌会取消旧请求，即使上游无法取消也不会覆盖新歌曲。
- 网络或封面失败仅影响专辑同步，音乐继续播放，可点“重新获取”重试。试听与完整播放沿用现有账号权益。

## 运行与验证

保持 Music World 后端的 `npm start`（3002）和专辑宇宙的 `npm run dev`（5188）同时运行。
前端 `/mw` 代理将元数据请求转到 3002，封面以同源 URL 进入恒星纹理。

```powershell
# 专辑宇宙目录
npm test
npm run build

# Music World 后端目录
npm run lint
npm run typecheck
npm test
npm run build
```

浏览器实际结果另存为 `automatic-album-verification.json`；它区分平台真实请求、音频输出和测试夹具，不包含账号凭证。

本次实际验证：

| 场景 | 结果 |
|---|---|
| QQ / 网易云专辑接口 | 两个平台均获取到《DON'T TAP THE GLASS》的封面信息及完整 10 首曲目 |
| 默认星球播放 / 下一首 | Big Poe 定位 01，Sugar On My Tongue 定位 02；同专辑未重复请求专辑详情 |
| 搜索播放 EARFQUAKE | 自动换成 IGOR 封面与完整 12 首曲目，定位 02；浏览器检测到非零音频信号 |
| IGOR 下一首 | 定位 I THINK / 03，复用专辑缓存 |
| 相机连续性 | 跨专辑时场景 generation 未变，仿真时钟继续递增；不重新挂载镜头控制器 |
| 本地标签读取 | 用自生成 WAV 测试夹具读取 RIFF 歌名/歌手/专辑标签；相同文件名换标签后能重新定位。这是标签测试，不是声纹识别 |
| 单元与构建 | 前端 56 项、后端 157 项测试通过；前后端构建与后端 lint 通过 |
