import { useState } from 'react'
import { Button } from '@material-ui/core'
import ImageSearch from '@material-ui/icons/ImageSearch'
import { usePermissions } from 'react-admin'
import OnlineCoverDialog from './OnlineCoverDialog'
import { useCoverText } from './useCoverText'
import config from '../config'

export default function OnlineCoverButton({ kind, record }) {
  const { permissions, loading } = usePermissions()
  const [open, setOpen] = useState(false)
  const text = useCoverText()
  const userId = localStorage.getItem('userId')
  const owner =
    permissions === 'regular' &&
    Boolean(userId) &&
    kind === 'playlist' &&
    record.ownerId === userId &&
    config.enableArtworkUpload
  if (loading || !record.id || (permissions !== 'admin' && !owner)) return null
  return (
    <>
      <Button
        startIcon={<ImageSearch />}
        onClick={() => setOpen(true)}
        size="small"
      >
        {text.title}
      </Button>
      {open && (
        <OnlineCoverDialog
          kind={kind}
          id={record.id}
          initialQuery={record.name || record.album || record.title || ''}
          open
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
