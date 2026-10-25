# 英语网络电台

登录后从侧栏「英语电台」进入，可收听 Heart London、LBC News UK、Classic FM、Capital London、Smooth London、Radio X UK、Gold Radio 和 Heart 80s，共 8 个电台。点击「电台来源」可以查看各台官方收听说明。

管理员在同一页面的「电台代理设置」中填写 HTTP 或 HTTPS 代理地址及端口，例如 `http://192.168.8.10:7891`。不支持代理账号、密码或 URL 路径。留空表示直连。

设置保存在本服务数据库内，重启保留，对新开始的播放立即生效。正在收听时修改设置，需要重新点击播放。该代理仅用于固定目录中的电台音频连接，不影响封面、AI 或本地音乐播放。

## 音源

最初 3 个音源在 2026-10-24 通过 HTTPS GET 验证。新增的 5 个音源在 2026-10-25 从 nanopct6 经电台代理逐一验证：返回 HTTPS 200 和 `audio/mpeg`，读取 8 KiB 样本，FFprobe 确认为 MP3。`icy-name` 与各电台对应，其中 Gold Radio 的流名称为 `Gold UK`。音频源由广播机构运营，后续可能调整。

| 电台 | 公开音源 | 官方说明 |
| --- | --- | --- |
| Heart London | `https://media-ice.musicradio.com/HeartLondonMP3` | [Heart 官方收听说明](https://www.heart.co.uk/radio/how-to-listen/getting-started/) |
| LBC News UK | `https://media-ice.musicradio.com/LBCUKMP3` | [LBC 官方收听说明](https://www.lbc.co.uk/radio/how-to-listen/) |
| Classic FM | `https://media-ice.musicradio.com/ClassicFMMP3` | [Classic FM 官方收听说明](https://www.classicfm.com/radio/how-to-listen/) |
| Capital London | `https://media-ice.musicradio.com/CapitalMP3` | [Capital London 官方页面](https://www.capitalfm.com/london/) |
| Smooth London | `https://media-ice.musicradio.com/SmoothLondonMP3` | [Smooth 官方收听说明](https://www.smoothradio.com/radio/how-to-listen/) |
| Radio X UK | `https://media-ice.musicradio.com/RadioXUKMP3` | [Radio X 官方收听说明](https://www.radiox.co.uk/radio/how-to-listen/) |
| Gold Radio | `https://media-ice.musicradio.com/GoldMP3` | [Gold Radio 官方收听说明](https://www.goldradio.com/radio/how-to-listen/) |
| Heart 80s | `https://media-ice.musicradio.com/Heart80sMP3` | [Heart 80s 官方收听说明](https://www.heart.co.uk/80s/radio/how-to-listen/) |

## 本地管理接口

以下路径均相对于配置的 BaseURL 路径。目录与播放票据需要现有登录认证；设置需要管理员权限。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/english-radio/catalog` | 返回固定电台目录及官方来源链接；不会连接音频源 |
| GET | `/api/english-radio/settings` | 管理员读取 `{ "proxy": "" }` |
| PUT | `/api/english-radio/settings` | 管理员保存 `{ "proxy": "http://host:port" }`；空字符串明确直连 |
| POST | `/api/english-radio/play/{id}` | 签发该台的播放 Cookie，返回 `{ "streamUrl": "/api/english-radio/stream/heart-london" }` |
| GET | `/api/english-radio/stream/{id}` | 校验窄范围播放 Cookie 后转发实时音频 |

播放 Cookie 为随机生成、HttpOnly、SameSite Strict，并限定于该台路径；15 分钟内可建立连接。票据不会放入 URL、JSON 响应或请求日志。已建立的连接可持续收听，播放器断开会取消上游连接。暂停较久或服务重启后，请从电台页重新点击播放。

代理服务只接受固定目录的 8 个电台 ID，拒绝客户端指定 URL，且只允许固定官方 HTTPS 主机与路径的跳转。每用户最多两条、服务最多 16 条并发音频连接。连接与响应头等待有限时，实时音频主体没有短总时限。

现有 Subsonic/OpenSubsonic 电台和音乐播放接口保持原有契约。
