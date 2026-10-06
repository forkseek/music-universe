# 互动播放器与 radiohand 接口

## 打开播放器

在音乐大厅点击中央的“音乐电台”，或直接打开 `http://127.0.0.1:3002/#world`。页面直接呈现一屏播放场景：点击唱片或播放键、拖动进度、切歌、调节音量、切换随机与循环，音频频谱会驱动光环与粒子。鼠标移动会改变唱片舞台的视差，点击会触发涟漪。队列、歌词、音源状态和旧的音乐地图分别从浮层进入。

首次进入时会在 QQ 音乐搜索“轻音乐”。在本机未启动 radiohand 时，QQ 搜索和可公开读取的歌词仍可用；在线试听按钮显示需要先连接授权服务，不会把未授权结果描述为已播放。页面自带三首 80 秒原创器乐，选择“原创试听”可以真实播放。也可以添加本地 MP3、M4A、WAV、OGG、FLAC 等音频，或拖入音频与 LRC 歌词。本地音频只保留在本次浏览器页面的临时内存中，页面关闭后失效。

## 接入 radiohand

本项目独立实现了 [Mineradio-paused](https://github.com/XxHuberrr/Mineradio-paused) 的 QQ 音乐接口契约：`/api/qq/search`、`/api/qq/song/url`、`/api/qq/lyric`，并加上连接状态、封面及受会话约束的音频转发接口。QQ 歌曲播放需要 radiohand 在本机运行，并由它报告当前 QQ 账号已完成音乐播放授权。对应账号没有权限的歌曲会给出限制提示和 QQ 音乐歌曲页入口。搜索结果、歌单导入元数据与实际播放权限互不等同。

当 radiohand 已在 `127.0.0.1:3000` 运行且其 QQ 授权已完成时，在 Music World 的 `.env.local` 设置：

```text
APP_ORIGIN=http://127.0.0.1:3002
RADIOHAND_API_ORIGIN=http://127.0.0.1:3000
```

然后重启 Music World 的 `3002` 服务。在播放器点击“音乐连接 → 重新检测连接”，状态应显示“已连接”。这项桥接仅允许本机地址，因为 radiohand 的账号状态属于运行它的这台设备。Music World 不读取或保存平台 Cookie、密码或授权令牌。音频 URL 在服务端只保存在有限时效的内存票据中，浏览器只收到本站的播放地址。

如果 radiohand 尚未运行，保留 `RADIOHAND_API_ORIGIN` 为空即可使用在线搜索、原创试听和本地音乐。QQ 音乐搜索结果只提供歌曲信息；不伪造完整在线播放。这个桥接与项目的腾讯连连 H5 面板元数据导入功能分别配置，后者由 `NEXT_PUBLIC_ENABLE_QQMUSIC` 控制。

## 本项目音频

原创器乐文件由 `node scripts/generate-listening-demos.mjs` 生成，保存于 `public/audio/`。它们与项目已有的 60 首 Demo 元数据不是同一批素材。[参考项目](https://github.com/XxHuberrr/Mineradio-paused)采用 GPL-3.0；这里参考了播放器的交互与接口形状，并使用本项目自己的界面、图形和音频素材。
