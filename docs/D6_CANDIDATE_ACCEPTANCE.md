# D6 候选版阶段记录

日期：2026-10-03（北京时间），提前推进 10 月 7 日的视觉与演示检查。此记录用于区分本机通过的内容与仍待外部条件的内容。

## 已实现

- 全站统一夜间配色，歌曲、艺术家、专辑、流派节点保持不同色相；选中节点和橙色 Journey 路线可辨。卡片切换使用 Motion for React 的轻量过渡，并尊重系统减少动态效果设置。
- 30 节点 Demo 采用代表性连线总览；地图上方新增“快速定位节点”，选择后放大并聚焦，解决全图模式文字较小的问题。React Flow 仍提供缩放、拖动、悬停和适配全图。
- 首页文件和 Demo、错误提示、无效数据、空库、少歌曲、路线不足五站、无模型、Guide 请求失败与删除路径均有明确状态或回退。没有实际测得的响度数据时不会回答“安静”程度。

## 本机验证

`npm run check` 通过（97 项单元/集成检查、ESLint、TypeScript）；`npm run build` 正式构建通过。默认 QQ 开关关闭的浏览器套件为 10 项通过、1 项条件跳过；开启开关并注入 SDK **替身**的套件也是 10 项通过、1 项条件跳过。文件导入、重复保存、Demo、快速定位、关系卡片、Journey、Guide、刷新、匿名隔离和删除均被覆盖。Demo 浏览器测试阻止所有第三方 HTTP 请求，仍完成本地完整流程。

`npm run test:restart` 在项目外独立生产包中跨进程读回相同音乐库、30 个 Demo 节点及五站方向路线，SQLite integrity=`ok`、外键违规数 0。它还验证未设置 `APP_ORIGIN` 的本机生产启动可接受实际 Host 的同源操作，并继续拒绝外站来源，详见[重启证明](artifacts/d6-restart-proof.json)。`npm run storage:check` 的写入、WAL、重新打开和完整性检查通过；这只能证明本机目录可用。

浏览器截图按 1280×720 桌面与 390×844 手机视口检查，保存在 [首页](artifacts/d6-home.png)、[世界桌面](artifacts/d6-world-desktop.png)、[世界手机](artifacts/d6-world-mobile.png)、[歌曲卡片](artifacts/d6-music-card.png)、[Journey 桌面](artifacts/d6-journey-desktop.png) 和 [Journey 手机](artifacts/d6-journey-mobile.png)。这些截图来自本地浏览器，不等同云端验收。

`npm audit --omit=dev --audit-level=high` 当前为 0 个生产依赖告警。完整 `npm audit` 报告 5 个 high，链路都在 `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces` 开发依赖中。上游 [braces 公告](https://github.com/advisories/ghsa-vfj7-8cjw-p6xm)目前没有修复版本；不为消除告警而把 Next ESLint 配置降到不匹配的旧主版本。上线前继续跟踪上游修复并避免把外部输入交给开发工具执行。

## 尚待外部验收

用户当前选择先本机演示；已制作[108 秒无配音字幕录屏草稿](artifacts/local-demo-draft.mp4)和[16:9 封面草稿](artifacts/cover-draft.png)。真实 QQ 官方面板权限和数据、公开演示地址、独立试玩反馈、正式视频剪辑和提交表的字段规格仍待确认。真实模型服务按用户要求暂缓。Docker/云端没有在本机实测，若之后发布需重新做持久化和访问检查。赛事官网公开信息见[规则核对](CONTEST_REQUIREMENTS.md)。
