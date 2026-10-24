import { MenuItemLink, useLocale } from 'react-admin'
import RadioOutlined from '@material-ui/icons/RadioOutlined'

export default function EnglishRadioMenuItem(props) {
  const locale = useLocale()
  return (
    <MenuItemLink
      {...props}
      to="/radio"
      primaryText={locale?.startsWith('zh') ? '英语电台' : 'English radio'}
      leftIcon={<RadioOutlined />}
    />
  )
}
