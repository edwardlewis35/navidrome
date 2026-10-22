# 网易云风格界面分支

专用分支：`codex/netease-music-ui`。此分支在 Navidrome 上提供网易云音乐风格的界面，音乐管理、播放和 Subsonic API 仍由 Navidrome 提供。

## 界面

默认使用 **Cloud Music** 主题：红色顶栏、浅灰侧栏、白色内容区、发现音乐首页、圆角专辑封面和底部播放器。首页直接读取当前用户有权限访问的曲库，包含随机推荐、新入库专辑和最近播放；顶栏搜索会跳转到歌曲搜索结果。新界面提供中英文文案并跟随当前语言设置。

已有用户的主题选择会保留。升级后如果仍显示旧界面，请在用户菜单的偏好设置中选择 **Cloud Music**。可以设置 `ND_DEFAULTTHEME="Cloud Music"` 指定默认主题，设置 `ND_DEFAULTLANGUAGE=zh-Hans` 指定默认语言。其他主题仍可在偏好设置中切换。

## Docker 安装

镜像：`ghcr.io/edwardlewis35/navidrome:netease-ui`，支持 `linux/amd64` 和 `linux/arm64`。

在仓库目录中，将 `NAVIDROME_MUSIC_PATH` 设置为音乐文件夹的绝对路径：

```sh
export NAVIDROME_MUSIC_PATH=/your/music/folder
docker compose -f docker-compose.netease.yml pull
docker compose -f docker-compose.netease.yml up -d
```

浏览器访问 <http://localhost:4533>，首次打开时创建管理员账户。音乐目录以只读方式挂载。数据库、封面缓存和设置保存在 `./netease-data`；可以使用 `NAVIDROME_DATA_PATH` 指定其他数据目录。

更新镜像后，重新执行上述 `pull` 和 `up -d` 命令即可。

如果要替换已有 Navidrome，请先备份数据，再让 `NAVIDROME_DATA_PATH` 指向原数据目录，并停止旧容器，避免同时打开同一数据库。

## 自动构建

推送到 `codex/netease-music-ui` 后，GitHub Actions 的 **NetEase UI Docker image** 工作流会：

1. 检查前端格式、代码质量、测试和生产构建。
2. 在原生 AMD64 和 ARM64 runner 上使用仓库 `Dockerfile` 构建完整镜像。
3. 分别验证程序启动、`/ping` 和打包后的网页。
4. 两个平台验证通过后，发布多架构 `netease-ui` 标签和对应提交的 `sha-<前7位提交号>` 标签。

也可以在 GitHub Actions 中手动运行该工作流，并选择此分支。工作流使用 GitHub 自动提供的 `GITHUB_TOKEN` 和 `packages: write` 权限，不需要 Docker Hub 账户或密码。

工作流入口：[GitHub Actions](https://github.com/edwardlewis35/navidrome/actions/workflows/netease-ui-image.yml)。镜像入口：[GitHub Packages](https://github.com/edwardlewis35/navidrome/pkgs/container/navidrome)。

如果 fork 尚未启用 Actions，需先在仓库 Actions 页面启用。如果镜像包已有权限限制，需在包设置中授权此仓库访问；新建 GHCR 包可能默认为私有，需要将其可见性设为公开后才能匿名拉取。
