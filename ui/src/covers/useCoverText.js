import { useLocale } from 'react-admin'

export const useCoverText = () => {
  const locale = useLocale()
  const zh = locale?.startsWith('zh')
  return zh
    ? {
        title: '从网络匹配封面',
        search: '搜索封面',
        query: '专辑或歌单名称',
        close: '关闭',
        notice:
          '搜索将把名称和歌手信息发送给 MusicBrainz，结果来自 Cover Art Archive。请选择匹配的封面。',
        apply: '使用这张封面',
        empty: '没有找到可用封面，可以修改名称后重试。',
        error: '封面目录暂时不可用，请稍后重试。',
        saved: '封面已保存，正在刷新显示',
        failed: '保存封面失败，请重试。',
        source: '查看来源',
        searching: '正在搜索封面',
      }
    : {
        title: 'Find a cover online',
        search: 'Search covers',
        query: 'Album or playlist name',
        close: 'Close',
        notice:
          'Search sends the name and artist to MusicBrainz. Covers come from Cover Art Archive. Choose a matching result.',
        apply: 'Use this cover',
        empty: 'No covers found. Try a different name.',
        error: 'Cover catalogue is unavailable. Please retry later.',
        saved: 'Cover saved; refreshing artwork',
        failed: 'Could not save the cover. Please retry.',
        source: 'View source',
        searching: 'Searching for covers',
      }
}
