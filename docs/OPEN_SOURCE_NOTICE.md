# 第三方开源依赖记录

依据当前 package-lock.json 生成；锁文件缺少许可字段时核对已安装包的 package.json（包括旧版 licenses 字段）。以下是直接依赖及其协议表达式；[完整清单](THIRD_PARTY_LICENSES.csv)包含直接、传递和可选依赖。清单不等同于特定操作系统的实际运行包，也不能代替核对第三方素材和协议要求。

| 包 | 版本 | 用途 | 协议表达式 |
| --- | --- | --- | --- |
| @electric-sql/pglite | 0.5.8 | 开发 | Apache-2.0 |
| @electric-sql/pglite-socket | 0.2.11 | 开发 | Apache-2.0 |
| @playwright/test | 1.63.0 | 开发 | Apache-2.0 |
| @tailwindcss/postcss | 4.3.3 | 开发 | MIT |
| @types/d3-force | 3.0.10 | 开发 | MIT |
| @types/node | 24.19.1 | 开发 | MIT |
| @types/pg | 8.23.1 | 开发 | MIT |
| @types/react | 19.3.0 | 开发 | MIT |
| @types/react-dom | 19.3.0 | 开发 | MIT |
| @xyflow/react | 12.12.0 | 运行 | MIT |
| csv-parse | 7.0.3 | 运行 | MIT |
| d3-force | 3.0.0 | 运行 | ISC |
| drizzle-kit | 0.31.11 | 开发 | MIT |
| drizzle-orm | 0.45.3 | 运行 | Apache-2.0 |
| electron | 42.11.10 | 开发 | MIT |
| eslint | 9.39.5 | 开发 | MIT |
| eslint-config-next | 16.3.8 | 开发 | MIT |
| motion | 14.0.0 | 运行 | MIT |
| NeteaseCloudMusicApi | 4.32.0 | 运行 | MIT |
| next | 16.3.8 | 运行 | MIT |
| pg | 8.23.1 | 运行 | MIT |
| qrcode | 1.5.4 | 运行 | MIT |
| react | 19.3.0 | 运行 | MIT |
| react-dom | 19.3.0 | 运行 | MIT |
| server-only | 0.0.1 | 运行 | MIT |
| tailwindcss | 4.3.3 | 开发 | MIT |
| tsx | 4.23.15 | 开发 | MIT |
| typescript | 6.0.3 | 开发 | Apache-2.0 |
| vitest | 5.0.3 | 开发 | MIT |
| zod | 4.6.5 | 运行 | MIT |

锁文件共列出 791 个依赖条目，其中直接依赖 30 个。应用内的唱片图形由 CSS 绘制；Demo 只保存歌曲元数据与可核对的页面链接，不复制歌词或音频。若之后加入外部图片、字体、代码或音频，应单独补充来源与许可记录。

赛事公开规则要求如实披露第三方开源框架、代码和对应协议；提交时以[官方规则](https://join.tencentmusic.com/ai-hackathon/)及登录后的实际表单为准。
