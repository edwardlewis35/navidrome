import { MenuItemLink, usePermissions, useTranslate } from 'react-admin'
import DeleteOutline from '@material-ui/icons/DeleteOutline'

export default function TrashMenuItem(props) {
  const { permissions, loading } = usePermissions()
  const translate = useTranslate()
  if (loading || permissions !== 'admin') return null
  return (
    <MenuItemLink
      {...props}
      to="/trash"
      primaryText={translate('resources.trash.name')}
      leftIcon={<DeleteOutline />}
    />
  )
}
