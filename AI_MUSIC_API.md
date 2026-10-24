# AI 音乐

发现音乐页可以选择可访问的歌单，主动分析音乐偏好并推荐本地歌曲。管理员在「AI 音乐」页面 `/app/#/ai/settings` 配置 OpenAI 兼容的接口地址、模型名和可选 API 密钥。地址可以是基础路径（例如 `https://your-provider.example/v1`）或完整的 `/chat/completions` 地址。真实服务需要管理员自行配置，本项目不会预置第三方密钥，也不会在浏览页面时自动调用模型。

## 数据与播放

只有点击「分析歌单并推荐」才会发送请求。发送给所配置服务的内容包含歌单名，最多 80 首可播放歌单歌曲的标题、歌手、专辑、曲风，以及最多 200 首可访问本地候选歌曲的相同信息。不会发送音频、文件路径、账号、播放凭据或整份数据库。

模型输出只作为偏好分析和推荐理由显示，按普通文本渲染。歌曲只能来自本次经过权限过滤的本地候选集合；虚构 ID、重复歌曲、原歌单已有歌曲、回收站、缺失或无权访问的歌曲不会作为播放推荐。返回之前再次读取推荐歌曲。点击播放继续使用既有播放器与播放 API，Subsonic/OpenSubsonic 协议没有变更。候选不够时应添加本地音乐，而非把模型生成的外部链接当作可播放音乐。

## 配置与凭据

公网接口地址必须使用 HTTPS；localhost、私有 IP 和局域网主机名可以使用 HTTP。地址禁止内嵌用户名/密码、查询参数和片段。服务不跟随重定向，防止带密钥请求被转发到其他地址。管理员配置的本地服务必须能够从 Navidrome 容器内访问；容器里的 `localhost` 指容器本身。

密钥使用独立随机 AES-GCM 密钥加密，数据库 property 中只存密文。加密密钥保存在 DataFolder 的 `.ai-credentials-key`，通过 0600 临时文件、排他硬链接发布和同步写入。备份/迁移时须同时保留数据库与该文件；不要公开该文件。设置 API 永远不会返回明文或密文密钥，仅返回 `keyConfigured`。密钥输入留空表示保留原密钥，`clearKey: true` 表示移除。更换接口地址时，须明确重新填写密钥或选择移除，避免把原服务的密钥发送到新地址。

## 原生 API

以下接口都位于 `/api`，要求已登录的原生会话；配置读写还要求管理员权限。

- `GET /ai/status` → `{ "configured": false }`，普通用户仅能看到是否就绪。
- `GET /ai/settings` → `{ "enabled": false, "endpoint": "", "model": "", "keyConfigured": false }`，管理员读取。
- `PUT /ai/settings`，管理员发送 `{ "enabled": true, "endpoint": "https://your-provider.example/v1", "model": "your-model", "apiKey": "...", "clearKey": false }`，返回上述公开设置。
- `POST /ai/recommendations`，发送 `{ "playlistId": "可访问歌单ID" }` → `{ "analysis": "...", "sourceCount": 20, "candidateCount": 100, "recommendations": [{ "song": { "id": "已验证本地歌曲ID", "title": "..." }, "reason": "..." }] }`。`song` 是当前用户能访问的现有歌曲记录，供原有播放器使用。

请求 JSON 拒绝未知字段与尾随 JSON。配置/推荐输入最多 16 KiB，模型输入最多 192 KiB，响应最多 256 KiB。每次模型调用最长 45 秒，输出最多 1600 token；全服务最多同时调用 1 次，每用户调用至少间隔 30 秒。没有候选时返回空推荐，不调用模型。

错误仅返回稳定错误码，例如 `not_configured`、`empty_playlist`、`busy`、`provider_unavailable`、`invalid_response`；不会返回第三方响应正文、密钥或接口 URL。测试只使用独立的模拟 HTTP 服务，不产生真实付费调用。
