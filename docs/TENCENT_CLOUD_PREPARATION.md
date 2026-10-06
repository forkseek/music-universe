# 腾讯云服务器准备清单

适用于当前 Music World 音乐网站：大厅与专辑宇宙一起部署，使用 Node 24、Docker 单实例、Nginx HTTPS 和服务器本地磁盘上的 SQLite。准备日期：2026-10-06。当前还没有创建或连接云服务器。

## 1. 登录腾讯云并创建轻量应用服务器

打开 [轻量应用服务器控制台](https://console.cloud.tencent.com/lighthouse)，用自己的账号登录，按页面提示完成实名认证，然后选择“新建”。

建议配置如下。这是演示阶段的起步配置，实际构建内存、访问速度和音乐接口可用性需要在目标服务器验证。

| 项目 | 建议值 |
| --- | --- |
| 产品 | 轻量应用服务器 Lighthouse |
| 系统镜像 | Ubuntu Server 24.04 LTS，64 位；若购买页仅提供 22.04 LTS，也可使用 |
| CPU / 内存 | 2 核 / 4GB 起 |
| 系统盘 | 60GB 起，使用服务器磁盘保存数据库 |
| 台数 | 1 台 |
| 初次购买时长 | 1 个月，验证后再决定长期套餐 |
| 实例名称 | music-world |

地域按用途选择：

- **先做公网演示**：可选中国香港。官方价格文档中的香港锐驰型 Linux 套餐，2 核 / 4GB / 60GB，参考价 95 元/月；以付款页面的实际配置、价格和续费规则为准。
- **主要面向国内用户长期使用**：可选广州或上海，域名正式发布前办理 ICP 备案。官方价格文档中的大陆入门型 Linux 套餐，2 核 / 4GB / 60GB，参考价 65 元/月；以付款页面为准。

香港服务器网站无需 ICP 备案，但访问质量和音乐平台的地域限制要实际测试，不能把网站能打开等同于所有第三方音源能播放。大陆节点使用域名对外发布需要完成备案；可以先进行部署与服务器内部验证。

来源：[创建 Linux 实例](https://cloud.tencent.com/document/product/1207/44548)、[官方价格总览](https://cloud.tencent.com/document/product/1207/73452)、[ICP备案要求](https://cloud.tencent.com/document/product/243/19630)。

## 2. 导入本机已准备的 SSH 公钥

已为本项目生成专用 Ed25519 密钥对。私钥保存在本机，文件访问权限限制到当前 Windows 用户和 SYSTEM，已通过公私钥匹配检查，并由所在目录的 .gitignore 排除。部署源码压缩包不包含该密钥目录。

需要导入腾讯云的只有这个公钥文件：

```text
C:\Users\IKUN\Documents\ChatGPT\腾讯黑客松\work\public-deployment\ssh\tencent-music-world.pub
```

在本机 PowerShell 运行下面这条命令，可以把**公钥**复制到剪贴板：

```powershell
Get-Content -Raw -LiteralPath 'C:\Users\IKUN\Documents\ChatGPT\腾讯黑客松\work\public-deployment\ssh\tencent-music-world.pub' | Set-Clipboard
```

在控制台的“SSH 密钥”中选择“创建密钥”：

1. 所属地域与新服务器相同。
2. 创建方式选择“使用已有公钥”。
3. 名称填写 `music_world_deploy`，公钥栏粘贴完整一行。
4. 创建后将密钥绑定到新实例，选择在线绑定，Ubuntu 用户选择 `ubuntu`。

如创建实例时已提供选择已有 SSH 密钥的入口，也可以直接选择此密钥。公钥可以用于导入；私钥、账号密码、腾讯云 SecretKey 不需要发到聊天里。

来源：[管理 SSH 密钥](https://cloud.tencent.com/document/product/1207/44573)、[绑定实例密钥](https://cloud.tencent.com/document/product/1207/54228)。

## 3. 配置实例防火墙

在服务器详情的“防火墙”页核对下面规则：

| 协议 / 端口 | 来源 | 用途 |
| --- | --- | --- |
| TCP 80 | 所有 IPv4：`0.0.0.0/0` | HTTP 和 HTTPS 证书验证 |
| TCP 443 | 所有 IPv4：`0.0.0.0/0` | HTTPS 网站访问 |
| TCP 22 | 当前电脑的公网 IP | SSH 上传和部署 |

控制台支持选择“当前登录 IP”。电脑网络变化后，可能需要更新 22 端口来源。当前部署配置把应用端口 3000 绑定在服务器的 127.0.0.1，只由 Nginx 对外提供访问；开发端口 3002、5188 不需要公网放行。

来源：[管理实例防火墙](https://cloud.tencent.com/document/product/1207/44577)。

## 4. 返回部署所需信息

准备好后，在聊天中提供：

```text
公网 IP：
地域：
系统版本：
SSH 公钥是否已绑定到 ubuntu：
域名：已有域名填写名称，没有则填写“暂时没有”
```

暂时没有域名，也可以先创建服务器并完成构建和内部健康检查。正式 HTTPS 访问和 QQ 网站登录回调需要后续确定域名与对应配置；大陆节点还需完成域名备案流程。

收到信息后，继续验证 SSH 连接、Linux 构建、持久化数据库、音乐 worker 依赖、Nginx、HTTPS，以及大厅进入专辑宇宙的实际效果。会使用当前干净部署包，保持本机开发服务。

## 5. 当前发布材料和音乐能力边界

- 源码包：`work/public-deployment/music-world-source.tar.gz`，已复核 1214 个导出文件与源码一致，排除了本机运行凭据、数据库和 Windows node_modules。
- Linux 镜像与启动配置：`deploy/public/Dockerfile`、`deploy/public/compose.yaml`。
- 完整部署与回滚说明：[PUBLIC_DEPLOYMENT_AUDIT.md](./PUBLIC_DEPLOYMENT_AUDIT.md)。

本机已通过构建和隔离生产验证，但 Linux 容器、云端 TLS 和目标地域的真实音乐授权还未验证。当前 QQ 网站身份登录需要本应用自己的 QQ Connect 配置，身份登录不自动授予 QQ 音乐播放权限；依赖本机 Electron 的登录方式不能直接迁移为公网用户登录。公网音源能力按实际授权与服务器测试结果验收。
