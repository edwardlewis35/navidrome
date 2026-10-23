# 网络封面接口

接口沿用网页 API 的登录认证，使用 `x-nd-authorization: Bearer <token>`。不会改变 Subsonic / OpenSubsonic 封面或播放接口。

## 搜索

`POST /api/online-cover/search`

```json
{"kind":"song","id":"media-file-id","query":"可选的专辑或歌单名称"}
```

`kind` 支持 `song`、`album`、`playlist`。用户须有权访问对应曲库或歌单。不传 `query` 时采用已有专辑名、歌手、MusicBrainz 发行 ID 或歌单名；自定义搜索词最多 200 个字符。服务向固定 MusicBrainz / Cover Art Archive 地址查询，最多返回 8 个带封面的发行版本。

返回 `query` 和 `candidates`。每个候选包含发行 `id`、`title`、`artist`、`year`（可选）、`previewUrl`、`sourceUrl` 和 `source`。页面只在用户点击搜索时提交请求。

## 保存

`POST /api/online-cover/apply`

```json
{"kind":"song","id":"media-file-id","releaseId":"MusicBrainz-release-UUID"}
```

歌曲和专辑需要管理员权限。歌单需要管理员权限，或歌单所有者且服务器启用 `EnableArtworkUpload`。只能提交发行 UUID，不能提供任意下载地址。

服务从 Cover Art Archive 下载前封面，限制为 5 MiB、1600 万像素并重新编码为 JPEG。歌曲和专辑图片保存到 `DataFolder/artwork/online`，歌单采用原有封面保存流程。音频和标签不会被修改。返回 `{"id":"...","saved":true,"refreshQueued":true}` 后刷新封面缓存。

## 错误和限制

- 未登录返回 401，无写入权限返回 403，不可见或缺失对象返回 404。
- 无效参数或发行 UUID 返回 400。
- 搜索限速、并发占满时返回 429，可以稍后重试。
- 外部目录或下载不可用返回 502，不会误报为“没有结果”。
- MusicBrainz 搜索遵循每秒最多 1 次的约束；不自动批量扫描整个音乐库。

备份数据库时应同时保留数据目录中的 `artwork`。外部图片的可用性和元信息匹配质量由提供方决定。

## 可选封面代理

服务器配置项 `OnlineCoverProxy`（环境变量 `ND_ONLINECOVERPROXY`）默认为空，保持原有 HTTP 客户端行为。需要独立代理时，可以设置 `ND_ONLINECOVERPROXY=http://proxy.example:7891`，重启服务后生效。仅支持带显式端口的 `http://主机:端口` 或 `https://主机:端口`；不接受用户名、密码、路径、查询参数或片段。

该配置只用于服务器向 MusicBrainz、Cover Art Archive 及其允许的 Archive 图片地址发送的封面请求，不影响 AI、GitHub、音乐播放或其他 HTTP 客户端，也不会修改系统代理。浏览器直接加载候选预览图时使用浏览器自身网络。代理配置无效或不可达时，封面请求返回 502，不会静默绕过该代理。已有下载超时、跳转域名、并发和图片大小限制继续生效；调试配置日志不会输出该项原始值。

提供方文档：[MusicBrainz 搜索](https://musicbrainz.org/doc/MusicBrainz_API/Search/ReleaseSearch)、[访问频率](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)、[Cover Art Archive](https://musicbrainz.org/doc/Cover_Art_Archive/API)。
