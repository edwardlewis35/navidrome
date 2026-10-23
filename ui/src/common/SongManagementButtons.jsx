import { useRef, useState } from 'react'
import {
  useDataProvider,
  useListContext,
  usePermissions,
  useRefresh,
  useTranslate,
  useUnselectAll,
  useNotify,
} from 'react-admin'
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Typography,
} from '@material-ui/core'
import DeleteOutlineIcon from '@material-ui/icons/DeleteOutline'
import DeleteForeverIcon from '@material-ui/icons/DeleteForever'
import { trashErrorMessage } from '../trash/trashErrorMessage'

export const SongManagementButtons = (props) => {
  const context = useListContext(props)
  const { selectedIds = [], data = {}, resource = 'song' } = context
  const { permissions, loading } = usePermissions()
  const translate = useTranslate()
  const provider = useDataProvider()
  const refresh = useRefresh()
  const unselectAll = useUnselectAll()
  const notify = useNotify()
  const [selection, setSelection] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const text = (key, args) =>
    translate(`resources.musicManagement.${key}`, args)
  if (permissions !== 'admin' || loading) return null

  const open = (mode) => {
    // Playlist IDs identify positions, not songs. Freeze the actual media IDs
    // from the visible records when the confirmation opens.
    const ids = [
      ...new Set(selectedIds.map((id) => data[id]?.mediaFileId || id)),
    ]
    const invalid =
      ids.length > 250 ||
      (resource === 'playlistTrack' &&
        selectedIds.some((id) => !data[id]?.mediaFileId))
    setSelection({ ids, mode, invalid })
    setError(invalid ? text('selectionInvalid') : '')
  }
  const confirm = async () => {
    if (
      inFlight.current ||
      !selection ||
      selection.invalid ||
      permissions !== 'admin'
    )
      return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const { data: result } = await provider.manageSongs(
        selection.ids,
        selection.mode,
      )
      const pending =
        result.results?.filter((item) => item.status === 'pending').length || 0
      notify(
        text('result', {
          completed: result.completed,
          failed: result.failed,
          pending,
        }),
        {
          type: result.failed ? 'warning' : 'info',
          multiLine: true,
          duration: result.failed ? 10000 : 5000,
        },
      )
      if (result.completed > 0 || pending > 0) {
        unselectAll(resource)
        props.onUnselectItems?.()
      }
      setSelection(null)
      refresh()
    } catch (failure) {
      setError(trashErrorMessage(failure, text('failed')))
      refresh()
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  return (
    <>
      <Button
        className={props.className}
        disabled={!selectedIds.length || busy}
        onClick={() => open('trash')}
        startIcon={<DeleteOutlineIcon />}
      >
        {text('moveSelected')}
      </Button>
      <Button
        className={props.className}
        disabled={!selectedIds.length || busy}
        onClick={() => open('permanent')}
        startIcon={<DeleteForeverIcon />}
      >
        {text('deleteSelected')}
      </Button>
      <Dialog
        open={Boolean(selection)}
        onClose={() => !busy && setSelection(null)}
        disableEscapeKeyDown={busy}
        aria-labelledby="song-management-title"
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle id="song-management-title">
          {text(
            selection?.mode === 'permanent' ? 'permanentTitle' : 'trashTitle',
          )}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {text(
              selection?.mode === 'permanent'
                ? 'permanentDescription'
                : 'trashDescription',
              { count: selection?.ids.length || 0 },
            )}
          </DialogContentText>
          {error && (
            <Typography role="alert" color="error">
              {error}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setSelection(null)}>
            {translate('resources.trash.cancel')}
          </Button>
          <Button
            color="primary"
            disabled={busy || selection?.invalid}
            onClick={confirm}
            startIcon={busy ? <CircularProgress size={16} /> : undefined}
          >
            {text(
              selection?.mode === 'permanent'
                ? 'deleteSelected'
                : 'moveSelected',
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
