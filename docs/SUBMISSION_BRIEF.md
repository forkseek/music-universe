# Music World 作品说明草稿

对应赛事：[腾讯音乐首届高校 AI Hackathon](https://join.tencentmusic.com/ai-hackathon/)。建议选择“创新音乐产品”赛道，因为 Music World 是从 0 到 1 的独立网页体验；最终赛道由报名人确认。公开规则与登录限制见[赛事核对记录](CONTEST_REQUIREMENTS.md)。

项目一句话：把多个格式的歌单整理成一份可去重、可追溯的音乐库，再把真实歌曲关系变成可以点击和行走的音乐世界。

问题洞察：跨文件歌单容易出现重复、不同录音版本混淆，已有歌曲也缺少直观的关系入口。用户常能说出“更梦幻一点”这样的探索方向，却难从现有收藏中找到有依据的下一站。

解决方案：用户上传 CSV、JSON、TXT，或载入明确标注的 Demo；系统保存歌曲、艺术家、专辑、歌单与来源，按导入证据建立地图，并从所选节点生成和保存 Journey。点击节点可查看真实元数据和连接依据；点击路线站点可让地图定位。

创新点与可行性：跨来源去重同时保留来源与 Live/Remix 版本；匿名会话隔离和一键删除；60 首歌曲、20 位艺术家的独立 Demo；最多 30 个主要地图节点及有依据的连线；五站真实歌曲路线、逐站解释、路线高亮和详情页。现有完整链路可在本机无密钥运行；结构化模型接口、结果验证和失败回退为后续模型接入留出边界。QQ 音乐官方 H5 SDK 适配层已提供开关、环境检查和分页逻辑，当前仅用 SDK 替身验证。

AI 的当前作用边界：服务端模型接口、输入/输出契约、一次重试、非法 ID/重复/起点校验与失败回退已实现。按当前产品决定，**尚未接入真实模型服务**；“更梦幻一点”等方向由确定性算法匹配导入的流派标签，Guide 当前只解释和推荐库内事实。不能在介绍或视频中写成“真实模型已生成路线”。

技术架构：Next.js 16、React 19、TypeScript、Tailwind CSS、Motion for React、React Flow/d3-force、Zod、SQLite/Drizzle。文件和受控 SDK 数据统一进入 Provider 接口、标准化、去重、音乐库，再进入 Graph/World/Journey；外部平台 ID 不作为内部主键，音乐信号只从显式导入数据推导。服务端配置和持久化条件见 [部署说明](DEPLOYMENT.md)。

验证材料：[D1–D5 阶段记录](D5_GUIDE_QQMUSIC_ACCEPTANCE.md)、[D6 候选版记录](D6_CANDIDATE_ACCEPTANCE.md)、[三分钟演示脚本](DEMO_SCRIPT.md)、[108 秒字幕录屏草稿](artifacts/local-demo-draft.mp4)、[16:9 封面草稿](artifacts/cover-draft.png)、[首页](artifacts/d6-home.png)、[世界地图](artifacts/d6-world-desktop.png)、[关系卡片](artifacts/d6-music-card.png)、[Journey](artifacts/d6-journey-desktop.png)、[开源协议清单](OPEN_SOURCE_NOTICE.md)。

提交前待填写并核实：团队成员及角色分工、代码仓库和评委可访问的 Demo URL、正式配音或最终剪辑的视频、按表单规格确认的封面图，以及表单中的字数/附件限制。官网公布的报名和初赛截止时间是 **2026-10-09 23:59**，但提交表需要登录，无法核实各字段是否必填或格式限制。当前按用户选择先本机演示；`127.0.0.1` 不是评委可访问的 Demo URL。当前文档不填虚构信息或占位链接。
