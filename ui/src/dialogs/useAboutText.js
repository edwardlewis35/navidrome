import { useLocale } from 'react-admin'

const en = {
  title: 'Navidrome · Cloud Music',
  app: 'Application',
  appName: 'Cloud Music edition',
  status: 'Service status',
  checking: 'Checking connection…',
  online: 'Connected',
  offline: 'Connection unavailable',
  source: 'Source code',
  issues: 'Feedback',
  compatibility: 'Music client API',
  collection: 'Your collection',
  collectionValue: 'Local music, playlists and playback',
  management: 'Administrator tools',
  managementValue: 'Music upload and recoverable song trash',
}
const zh = {
  title: 'Navidrome · 云音乐',
  app: '应用',
  appName: 'Cloud Music 定制版',
  status: '服务状态',
  checking: '正在检查连接…',
  online: '已连接',
  offline: '暂时无法连接',
  source: '项目源码',
  issues: '问题反馈',
  compatibility: '音乐客户端 API',
  collection: '音乐资料库',
  collectionValue: '本地音乐、歌单与播放',
  management: '管理员工具',
  managementValue: '音乐上传与可恢复的歌曲回收站',
}

export default function useAboutText() {
  return useLocale()?.startsWith('zh') ? zh : en
}
