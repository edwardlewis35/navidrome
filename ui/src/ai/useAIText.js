import { useLocale } from 'react-admin'

const en = {
  title: 'AI music',
  discoverTitle: 'A new direction for your playlist',
  description:
    'Let AI explore the sound of your playlist and recommend songs from your library.',
  privacy:
    'On your request, playlist names and song titles, artists, albums and genres are sent to your configured AI provider. Audio files, file paths and account details stay here.',
  settings: 'AI settings',
  adminOnly: 'Only administrators can configure AI music.',
  enabled: 'Enable AI music',
  endpoint: 'API address',
  endpointHelp:
    'OpenAI-compatible base URL, for example https://your-provider.example/v1. Public addresses require HTTPS; local providers can use HTTP.',
  model: 'Model name',
  apiKey: 'API key',
  keySaved:
    'A key is saved. Leave blank to keep it. To change providers, enter a new key or remove the saved key.',
  keyEmpty:
    'Optional for a local provider without authentication. The saved key is never returned by the server.',
  clearKey: 'Remove saved API key',
  save: 'Save settings',
  saved: 'AI settings saved',
  loading: 'Loading AI music…',
  loadError: 'Could not load AI music. Try again.',
  saveError:
    'Could not save. Check the API address, model and key. When changing providers, replace or remove the saved key.',
  retry: 'Try again',
  notConfigured: 'AI music is waiting to be configured.',
  askAdmin: 'Ask your administrator to connect an AI provider.',
  playlist: 'Choose a playlist',
  analyze: 'Analyze and recommend',
  analyzing: 'Listening to your taste…',
  noPlaylists:
    'Create a playlist with a few songs to discover recommendations.',
  noCandidates:
    'There are no other playable songs to recommend. Add more music to your library.',
  analysis: 'Your musical taste',
  recommendations: 'Recommended from your library',
  play: 'Play',
  sampled:
    'Recommendations use up to 80 playlist songs and a sample of 200 accessible library songs.',
  not_configured:
    'AI music is not configured. Ask your administrator to check the settings.',
  empty_playlist: 'This playlist has no playable songs you can access.',
  busy: 'AI music is busy. Please wait about 30 seconds and try again.',
  provider_unavailable:
    'Could not connect to the AI provider. Check the settings or try again.',
  invalid_response: 'AI did not return usable local songs. Please try again.',
  playlist_not_found:
    'This playlist is unavailable. Please choose another playlist.',
  ai_error: 'Could not generate recommendations. Please try again.',
}

const zh = {
  title: 'AI 音乐',
  discoverTitle: '从你的歌单，发现新的心动',
  description: '让 AI 分析歌单的音乐偏好，从本地曲库推荐适合你的歌曲。',
  privacy:
    '点击分析后，将向你配置的 AI 服务发送歌单名，以及歌曲的标题、歌手、专辑和曲风。音频文件、文件路径和账号信息不会发送。',
  settings: 'AI 设置',
  adminOnly: '仅管理员可以配置 AI 音乐。',
  enabled: '启用 AI 音乐',
  endpoint: '接口地址',
  endpointHelp:
    '填写 OpenAI 兼容接口的基础地址，例如 https://你的服务/v1。公网地址需使用 HTTPS，本地服务可使用 HTTP。',
  model: '模型名称',
  apiKey: 'API 密钥',
  keySaved:
    '已保存密钥，留空可继续使用。更换服务地址时，请重新填写密钥，或勾选移除已保存的密钥。',
  keyEmpty: '本地免认证服务可留空。已保存的密钥不会由服务器返回。',
  clearKey: '移除已保存的密钥',
  save: '保存设置',
  saved: 'AI 设置已保存',
  loading: '正在加载 AI 音乐…',
  loadError: '暂时无法加载 AI 音乐，请重试。',
  saveError:
    '保存失败，请检查接口地址、模型和密钥。更换服务地址时需要重新填写或移除原密钥。',
  retry: '重试',
  notConfigured: 'AI 音乐等待配置。',
  askAdmin: '请联系管理员连接 AI 服务。',
  playlist: '选择要分析的歌单',
  analyze: '分析歌单并推荐',
  analyzing: '正在分析你的音乐偏好…',
  noPlaylists: '先创建一个歌单，放入几首喜欢的歌，再来发现推荐。',
  noCandidates: '暂无其他可推荐的歌曲，向曲库添加更多音乐后再试。',
  analysis: '你的音乐偏好',
  recommendations: '为你推荐 · 本地曲库',
  play: '播放',
  sampled:
    '每次分析最多参考歌单中的 80 首歌曲，并从可访问曲库中抽取 200 首歌曲作为推荐候选。',
  not_configured: 'AI 服务尚未配置，请联系管理员检查设置。',
  empty_playlist: '这个歌单中暂无你可以访问和播放的歌曲。',
  busy: 'AI 音乐正在处理中，请等待约 30 秒后重试。',
  provider_unavailable: '暂时无法连接 AI 服务，请检查设置或稍后重试。',
  invalid_response: 'AI 未返回有效的本地歌曲推荐，请重试。',
  playlist_not_found: '该歌单已不可用，请重新选择。',
  ai_error: '暂时无法生成推荐，请重试。',
}

export default function useAIText() {
  const locale = useLocale()
  return locale?.startsWith('zh') ? zh : en
}

export const aiErrorText = (error, text) => {
  const message = text[error?.body?.error]
  return typeof message === 'string' ? message : text.ai_error
}
