# 大厅专辑宇宙子页面

当前入口是 `/#hall → /#universe`。宇宙静态资源位于 `/universe/`，无需另开 5188 服务。Vite 源码保留用于独立开发。

```powershell
npm run build:universe
npm run dev -- --port 3002
```

`npm run build` 自动先同步宇宙构建。源码路径可在 `.env.local` 设置 `MUSIC_UNIVERSE_SOURCE`；该目录需包含 `music-universe` 的 package.json。部署时也可携带已生成的 `public/universe` 和构建清单。

QQ 身份登录使用自己注册的 QQ 互联应用。填写服务端 `QQ_CONNECT_APP_ID`、`QQ_CONNECT_APP_SECRET`、`QQ_CONNECT_REDIRECT_URI` 与匹配的 `APP_ORIGIN`，回调路径为 `/api/qq/login/callback`。本地当前没有这些配置，真实扫码没有验收。该授权只获取账号身份，不授予 QQ 音乐歌曲播放权限。

改动分析、配置参数、运行方法、验证证据和回滚说明见[完整报告](C:/path/to/music-universe/INTEGRATION_POLISH.md)。
