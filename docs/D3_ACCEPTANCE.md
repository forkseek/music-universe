# D3 验收记录

日期：2026-10-03（北京时间）。

首页的文件、Try Demo 和创建世界入口可用；来源卡片只显示实际可用的 File/Demo，QQ/网易账号连接保持待接入。世界页使用 React Flow 绘制节点/连线和 d3-force 固定种子布局，支持缩放、平移、拖动、悬停、节点点击与适配全图。歌曲卡片显示艺术家、专辑、流派、已提供的年份、关系依据；安全的歌曲网页链接才出现平台按钮。

确定性规划器从当前主节点找到真实歌曲，按明确的同艺术家、同专辑、同流派、歌单共现与用户导入信号生成最多 5 个不重复站点。没有关系时明确标注探索跳转；库不足 5 首时返回实际数量。路线事务保存，提供独立详情页，橙色虚线显示顺序；站点点击可定位。整个流程在 `AI_PROVIDER=none` / 无 AI Key 条件下运行。

验收路径：文件上传 → 保存 → 生成世界 → 点击歌曲 → 生成 Journey → 路径亮起 → 打开详情页 → 刷新；Demo 从“Try Demo”进入同样路径。三首样例返回三站，另一份五首文件歌单与 60 首 Demo 返回五站。浏览器验证桌面/手机、关系卡片、来源链接、站点定位和跨会话 404；手机调整宽度后五个站点仍在地图视野内。

2026-10-03 验证：`npm run check` 通过（73 项测试），`npm run test:e2e` 通过（7 项浏览器流程），`npm run build` 成功，`npm audit --omit=dev --audit-level=high` 未发现漏洞。`npm run test:restart` 在隔离的生产包中停止并重启进程后，读回同一份音乐库、世界和五站 Journey；SQLite 完整性为 `ok`，外键违规为 0。`npm run storage:check` 验证目标目录可写、WAL 与重新打开。云端持久卷尚未实测。

截图：[五站地图与路线详情](artifacts/d3-journey-desktop.png)、[手机版 Journey](artifacts/d3-journey-mobile.png)。持久化证据：[重启验证结果](artifacts/d3-restart-proof.json)。
