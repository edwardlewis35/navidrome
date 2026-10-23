# 网易云风格界面分支

专用分支：`codex/netease-music-ui`。此分支在 Navidrome 上提供网易云音乐风格的界面，音乐管理、播放和 Subsonic API 仍由 Navidrome 提供。

## 界面

默认使用 **Cloud Music** 主题：红色顶栏、浅灰侧栏、白色内容区、发现音乐首页、圆角专辑封面和底部播放器。首页直接读取当前用户有权限访问的曲库，包含随机推荐、新入库专辑和最近播放；顶栏搜索会跳转到歌曲搜索结果。新界面提供中英文文案并跟随当前语言设置。

列表支持连续滚动加载，移除页码和“15/25/50 条”选择，保留搜索、筛选、排序与多选。专辑歌曲、歌单歌曲和歌手专辑也使用同样的滚动方式。

已有用户的主题选择会保留。升级后如果仍显示旧界面，请在用户菜单的偏好设置中选择 **Cloud Music**。可以设置 `ND_DEFAULTTHEME="Cloud Music"` 指定默认主题，设置 `ND_DEFAULTLANGUAGE=zh-Hans` 指定默认语言。其他主题仍可在偏好设置中切换。

## Docker 安装

镜像：`ghcr.io/edwardlewis35/navidrome:netease-ui`，支持 `linux/amd64` 和 `linux/arm64`。

在仓库目录中，将 `NAVIDROME_MUSIC_PATH` 设置为音乐文件夹的绝对路径：

```sh
export NAVIDROME_MUSIC_PATH=/your/music/folder
docker compose -f docker-compose.netease.yml pull
docker compose -f docker-compose.netease.yml up -d
```

浏览器访问 <http://localhost:4533>，首次打开时创建管理员账户。音乐目录允许写入，以便管理员移动和恢复歌曲。数据库、回收站、封面缓存和设置保存在 `./netease-data`；可以使用 `NAVIDROME_DATA_PATH` 指定其他数据目录。

更新镜像后，重新执行上述 `pull` 和 `up -d` 命令即可。

如果要替换已有 Navidrome，请先备份数据，再让 `NAVIDROME_DATA_PATH` 指向原数据目录，并停止旧容器，避免同时打开同一数据库。

## 管理员回收站

管理员可在歌曲菜单选择“移至回收站”，确认后音乐文件会保存到独立的 `DataFolder/song-trash` 目录，并从正常曲库隐藏。在侧栏“回收站”中可恢复到原位置；目标位置已有文件时会提示冲突并保留回收副本。普通用户无权调用删除、回收站列表或恢复 API。

管理员可以在回收站永久删除单首歌曲，或点击“清空回收站”，确认不可恢复的提示后执行。清空只处理打开确认弹窗时显示的歌曲，之后新移入的歌曲会保留。永久删除会移除回收站中的音频及本服务的歌曲记录和关联引用，无法通过回收站恢复；独立备份中的副本不受影响。对应 API 需要管理员权限和明确的 JSON 确认，详见 [SONG_TRASH_API.md](SONG_TRASH_API.md)。

回收站没有自动过期。请保留并备份数据目录中的回收站；它保存的是音乐文件本体。如果多个服务共用一个音乐目录，移动与恢复文件会同时影响这些服务对该歌曲的访问。歌词、封面等伴随文件保持原位。

接口说明见 [SONG_TRASH_API.md](SONG_TRASH_API.md)。

## 歌曲管理和上传

歌曲列表、专辑和歌单均支持多选。管理员可以将选中歌曲移至回收站，或在确认后直接永久删除。歌单中的操作针对歌曲本体，因此也会影响这首歌在其他歌单中的可用性；仅移除歌单条目仍使用原来的歌单操作。批量任务逐首返回结果，部分失败时会保留成功结果并说明失败原因。

管理员侧栏提供“上传音乐”。选择当前曲库和已有子目录后可上传音频，文件保存后自动扫描并刷新数据库。已有同名文件不会被覆盖。如果文件已保存但扫描失败，可以单独重试刷新，无需重复上传。接口和支持格式见 [MUSIC_MANAGEMENT_API.md](MUSIC_MANAGEMENT_API.md)。

## AI 推荐

管理员在“AI 设置”中填写 OpenAI 兼容服务地址、模型和密钥，并启用推荐。密钥加密保存在本服务的数据目录，页面只返回是否已配置；备份数据库时也应保留 `.ai-credentials-key`。发现音乐页面可以选择有权限访问的歌单，点击分析后获得理由和可直接播放的本地歌曲推荐。

只有主动分析时才会请求 AI 服务；请求包含有限的歌名、歌手、专辑和流派信息。推荐限定在当前用户可访问的本地曲库，并排除歌单内已有歌曲。服务未配置、失败或没有候选时，页面会明确提示。接口与限制见 [AI_MUSIC_API.md](AI_MUSIC_API.md)。

## 网络封面

专辑、歌单和歌曲菜单提供“搜索网络封面”。打开弹窗后可修改搜索词，点击搜索才会向 [MusicBrainz / Cover Art Archive](https://musicbrainz.org/doc/Cover_Art_Archive/API) 查询，选择结果后再保存。默认使用专辑或歌单名以及歌曲元信息，不保证所有歌曲都有匹配结果。

管理员可以保存歌曲和专辑封面；歌单所有者在允许上传封面时也可以设置自己的歌单封面。封面保存在数据目录，不修改音频标签。备份时应保留 `artwork` 目录。

## 精简入口和客户端兼容

移除网页中的网络电台、Last.fm 和插件入口，默认关闭 Last.fm 与插件运行；关于页面显示当前版本、服务信息和本分支链接。搜索框与侧栏留有独立间距，歌单子项按当前歌单同步高亮。

保留 Subsonic / OpenSubsonic 的认证、曲库查询、播放、封面和歌单核心接口，兼容 Amcfy Music 等现有客户端。新增管理功能使用 `/api` 接口，不改变播放接口的参数或响应协议。

## 自动构建

推送到 `codex/netease-music-ui` 后，GitHub Actions 的 **NetEase UI Docker image** 工作流会：

1. 检查前端格式、代码质量、测试和生产构建，并验证后端恢复、权限、曲库可见性及扫描测试。
2. 在原生 AMD64 和 ARM64 runner 上使用仓库 `Dockerfile` 构建完整镜像。
3. 分别验证程序启动、`/ping` 和打包后的网页。
4. 两个平台验证通过后，发布多架构 `netease-ui` 标签和对应提交的 `sha-<前7位提交号>` 标签。

也可以在 GitHub Actions 中手动运行该工作流，并选择此分支。工作流使用 GitHub 自动提供的 `GITHUB_TOKEN` 和 `packages: write` 权限，不需要 Docker Hub 账户或密码。

工作流入口：[GitHub Actions](https://github.com/edwardlewis35/navidrome/actions/workflows/netease-ui-image.yml)。镜像入口：[GitHub Packages](https://github.com/edwardlewis35/navidrome/pkgs/container/navidrome)。

如果 fork 尚未启用 Actions，需先在仓库 Actions 页面启用。如果镜像包已有权限限制，需在包设置中授权此仓库访问；新建 GHCR 包可能默认为私有，需要将其可见性设为公开后才能匿名拉取。
