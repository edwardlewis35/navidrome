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

提供方文档：[MusicBrainz 搜索](https://musicbrainz.org/doc/MusicBrainz_API/Search/ReleaseSearch)、[访问频率](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)、[Cover Art Archive](https://musicbrainz.org/doc/Cover_Art_Archive/API)。
