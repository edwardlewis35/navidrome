import {
  MenuItemLink,
  useLocale,
  usePermissions,
  useTranslate,
} from 'react-admin'
import { CloudUploadOutlined, StarsOutlined } from '@material-ui/icons'

export default function AdminMusicMenuItems(props) {
  const { permissions, loading } = usePermissions()
  const locale = useLocale()
  const translate = useTranslate()
  if (loading || permissions !== 'admin') return null
  return (
    <>
      <MenuItemLink
        {...props}
        to="/upload"
        primaryText={translate('resources.upload.name')}
        leftIcon={<CloudUploadOutlined />}
      />
      <MenuItemLink
        {...props}
        to="/ai/settings"
        primaryText={locale?.startsWith('zh') ? 'AI 音乐' : 'AI music'}
        leftIcon={<StarsOutlined />}
      />
    </>
  )
}
