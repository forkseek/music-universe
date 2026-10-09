# 公网专辑封面缓存隔离修复

2026-10-09，发布分支 `codex/netlify-neon`。针对网易云公网封面串图。

## 已确认原因

修复前，专辑 6548、92895788 及无效平台参数都返回同一个 443,749 字节的 JPEG，SHA-256 为 `8d7dd16cdbf312cf64e154d65608c76cf5405505524fffa6c5eec4401e7406a2`。网易云原始专辑数据与封面分别正确；在独立诊断缓存变体中，92895788 能返回其自己的 928,632 字节图片。

Netlify Next Runtime 5.16.2 为响应生成的 `Netlify-Vary` 只包括 `__nextDataReq` / `_rsc` 等框架参数。原封面接口使用 `provider` / `id` 查询参数，但未主动声明它们，同时返回 24 小时公开缓存，导致同路径不同专辑的响应共用缓存。前次验证检查了单专辑加载和绑定 URL，漏掉跨专辑图片内容验证。

## 修改

- 返回新的 `/api/music/album/cover/v2/netease/{id}` 地址，专辑身份进入 URL 路径，同时避开浏览器已经缓存的旧地址。曲目封面与恒星使用同一地址。
- 旧查询接口保留，并在成功、错误响应中一致声明 `Netlify-Vary: query=provider|id`。适配器会合并框架参数和业务参数。
- 浏览器图片缓存改为 5 分钟；Netlify CDN 仍缓存 24 小时并复用 durable cache。添加封面缓存标签和专辑身份响应头，保留加载性能与可诊断性。
- 错误返回 `no-store`，避免无效参数或平台失败污染图片缓存。平台来源与专辑 ID 校验、封面文件限制、原有播放器和 GPU 纹理交接逻辑保留。
- 发布后使用官方站点缓存清除 API 清除旧 CDN 缓存。新路径负责避开无法从服务端清除的浏览器缓存。

方案遵循 [Netlify 缓存变体与清除规则](https://docs.netlify.com/build/caching/caching-overview/)。没有新增依赖、数据库迁移或凭据配置。

完整 Source ZIP 的约 151 MB 素材上传曾超时。发布包可只上传源码与媒体校验清单，云端构建从本项目公开仓库的固定提交恢复原有 `public/audio` / `public/media` 文件，逐文件校验 SHA-256。清单未提供时，普通本地构建不下载任何文件。所有原有素材保持完整，不影响运行时请求或视觉；不向 GitHub 传输 Netlify 凭据。完整源码包仍可用于回退发布方式。

## 验证与回滚

`npm run check`、`npm run build -- --webpack`；星系运行 `UNIVERSE_TEST_URL` 对应预览或公网地址的 `npm run test:album-cover`。`node scripts/verify-album-covers.mjs` 默认检查公网站点，也可用 `MUSIC_TEST_ORIGIN` 指向隔离生产服务。

新增验证实际比较《黑白灰》和《folklore (deluxe version)》的原始网易云图片与新接口、热缓存、旧接口的 SHA-256；检查两张专辑图片不同、曲目封面一致、无效身份返回 400 且不缓存。该检查使用真实公开元数据与图片，不能替代本人扫码授权或真实账号完整音频播放验证。

实际发布与验收结果记录在 `NETLIFY_VALIDATION.md`。保留上一部署；本次没有数据库变更，但回滚到旧代码会重新出现其缓存配置问题。
