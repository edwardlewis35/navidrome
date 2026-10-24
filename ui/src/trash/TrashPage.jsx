import { useEffect, useRef, useState } from 'react'
import {
  Title,
  useDataProvider,
  useNotify,
  usePermissions,
  useRefresh,
  useTranslate,
} from 'react-admin'
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  makeStyles,
} from '@material-ui/core'
import {
  DeleteForever,
  DeleteOutline,
  Refresh,
  Restore,
} from '@material-ui/icons'
import { trashErrorMessage } from './trashErrorMessage'
import { useDateLocale } from '../i18n/useDateLocale'

const useStyles = makeStyles((theme) => ({
  root: { padding: theme.spacing(3), width: '100%', boxSizing: 'border-box' },
  heading: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
    flexWrap: 'wrap',
  },
  toolbar: { display: 'flex', gap: theme.spacing(1), flexWrap: 'wrap' },
  description: {
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(3),
  },
  state: { padding: theme.spacing(5, 2), textAlign: 'center' },
  error: { color: theme.palette.error.main, marginBottom: theme.spacing(2) },
  title: { fontWeight: 600 },
  artist: { color: theme.palette.text.secondary, marginTop: 4 },
  path: { maxWidth: 360, overflowWrap: 'anywhere', fontSize: 12 },
  restore: { whiteSpace: 'nowrap' },
  destructive: { color: theme.palette.error.main, whiteSpace: 'nowrap' },
}))

function AdminTrashList() {
  const classes = useStyles()
  const translate = useTranslate()
  const locale = useDateLocale()
  const dataProvider = useDataProvider()
  const notify = useNotify()
  const refresh = useRefresh()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [pending, setPending] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const [version, setVersion] = useState(0)
  const mounted = useRef(true)
  const busy = useRef(false)
  const text = (key, options) => translate(`resources.trash.${key}`, options)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    dataProvider
      .getSongTrash()
      .then(({ data }) => {
        if (active) setEntries(data)
      })
      .catch((failure) => {
        if (active)
          setError(
            trashErrorMessage(failure, translate('resources.trash.loadFailed')),
          )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [dataProvider, translate, version])

  const restore = async (entry) => {
    if (busy.current) return
    busy.current = true
    setPending({ type: 'restore', id: entry.id })
    setActionError('')
    try {
      await dataProvider.restoreSongFromTrash(entry.id)
      if (!mounted.current) return
      setEntries((current) => current.filter((item) => item.id !== entry.id))
      notify(text('restored'), { type: 'info' })
      refresh()
    } catch (failure) {
      if (mounted.current)
        setActionError(trashErrorMessage(failure, text('restoreFailed')))
    } finally {
      busy.current = false
      if (mounted.current) setPending(null)
    }
  }

  const permanentlyDelete = async () => {
    if (!confirmation || busy.current) return
    const { type, entry, ids } = confirmation
    busy.current = true
    setPending({ type, id: entry?.id })
    setActionError('')
    try {
      if (type === 'clear') {
        await dataProvider.emptySongTrash(ids)
      } else {
        await dataProvider.permanentlyDeleteSongFromTrash(entry.id)
      }
      if (!mounted.current) return
      setEntries((current) =>
        current.filter((item) =>
          type === 'clear' ? !ids.includes(item.id) : item.id !== entry.id,
        ),
      )
      notify(text(type === 'clear' ? 'emptied' : 'permanentlyDeleted'), {
        type: 'info',
      })
      if (type === 'clear') setVersion((value) => value + 1)
      refresh()
    } catch (failure) {
      if (!mounted.current) return
      const message = trashErrorMessage(
        failure,
        text(type === 'clear' ? 'emptyFailed' : 'permanentDeleteFailed'),
      )
      const deleted = failure?.body?.deleted
      setActionError(
        type === 'clear' && Number.isInteger(deleted) && deleted > 0
          ? `${text('partiallyEmptied', { count: deleted })} ${message}`
          : message,
      )
      // A failed request may already have removed entries. Reload the server's
      // current state before offering another destructive operation.
      setVersion((value) => value + 1)
    } finally {
      busy.current = false
      if (mounted.current) {
        setPending(null)
        setConfirmation(null)
      }
    }
  }

  const closeConfirmation = () => {
    if (!busy.current) setConfirmation(null)
  }

  const formatDate = (value) => {
    const date = new Date(value)
    if (Number.isNaN(date.valueOf())) return '—'
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
  }

  return (
    <div className={classes.root}>
      <Title title={text('name')} />
      <div className={classes.heading}>
        <Typography variant="h5" component="h1">
          {text('name')}
        </Typography>
        <div className={classes.toolbar}>
          <Button
            startIcon={<Refresh />}
            disabled={loading || Boolean(pending)}
            onClick={() => setVersion((value) => value + 1)}
          >
            {text('refresh')}
          </Button>
          <Button
            className={classes.destructive}
            startIcon={<DeleteForever />}
            disabled={
              loading || Boolean(error) || Boolean(pending) || !entries.length
            }
            onClick={() =>
              setConfirmation({
                type: 'clear',
                count: entries.length,
                ids: entries.map((entry) => entry.id),
              })
            }
          >
            {text('emptyTrash')}
          </Button>
        </div>
      </div>
      <Typography className={classes.description}>
        {text('description')}
      </Typography>
      {actionError && (
        <Typography role="alert" className={classes.error}>
          {actionError}
        </Typography>
      )}
      <Paper variant="outlined">
        {loading ? (
          <div className={classes.state} role="status">
            <CircularProgress size={28} aria-label={text('loading')} />
          </div>
        ) : error ? (
          <div className={classes.state} role="alert">
            <Typography className={classes.error}>{error}</Typography>
            <Button onClick={() => setVersion((value) => value + 1)}>
              {text('retry')}
            </Button>
          </div>
        ) : entries.length === 0 ? (
          <div className={classes.state}>
            <DeleteOutline color="disabled" />
            <Typography>{text('empty')}</Typography>
          </div>
        ) : (
          <TableContainer>
            <Table aria-label={text('name')}>
              <TableHead>
                <TableRow>
                  <TableCell>{text('fields.song')}</TableCell>
                  <TableCell>{text('fields.path')}</TableCell>
                  <TableCell>{text('fields.deletedAt')}</TableCell>
                  <TableCell>{text('fields.deletedBy')}</TableCell>
                  <TableCell align="right">{text('fields.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <div className={classes.title}>{entry.title}</div>
                      <div className={classes.artist}>
                        {[entry.artist, entry.album]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </TableCell>
                    <TableCell className={classes.path}>{entry.path}</TableCell>
                    <TableCell>{formatDate(entry.deletedAt)}</TableCell>
                    <TableCell>{entry.deletedBy}</TableCell>
                    <TableCell align="right">
                      <Button
                        className={classes.restore}
                        color="primary"
                        startIcon={
                          pending?.type === 'restore' &&
                          pending.id === entry.id ? (
                            <CircularProgress size={16} />
                          ) : (
                            <Restore />
                          )
                        }
                        disabled={Boolean(pending)}
                        onClick={() => restore(entry)}
                        aria-label={`${text('restore')} ${entry.title}`}
                      >
                        {text('restore')}
                      </Button>
                      <Button
                        className={classes.destructive}
                        startIcon={<DeleteForever />}
                        disabled={Boolean(pending)}
                        onClick={() =>
                          setConfirmation({ type: 'delete', entry })
                        }
                        aria-label={`${text('permanentDelete')} ${entry.title}`}
                      >
                        {text('permanentDelete')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
      <Dialog
        open={Boolean(confirmation)}
        onClose={closeConfirmation}
        disableEscapeKeyDown={Boolean(pending)}
        aria-labelledby="trash-purge-title"
        aria-describedby="trash-purge-description"
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle id="trash-purge-title">
          {text(
            confirmation?.type === 'clear'
              ? 'emptyConfirmTitle'
              : 'permanentDeleteConfirmTitle',
          )}
        </DialogTitle>
        <DialogContent>
          {confirmation?.entry && (
            <Typography className={classes.title} gutterBottom>
              {confirmation.entry.title}
            </Typography>
          )}
          <DialogContentText id="trash-purge-description">
            {confirmation?.type === 'clear'
              ? text('emptyConfirmDescription', { count: confirmation.count })
              : text('permanentDeleteConfirmDescription')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeConfirmation} disabled={Boolean(pending)}>
            {text('cancel')}
          </Button>
          <Button
            onClick={permanentlyDelete}
            color="secondary"
            variant="contained"
            disabled={Boolean(pending)}
            startIcon={
              pending ? <CircularProgress size={16} /> : <DeleteForever />
            }
          >
            {text(
              confirmation?.type === 'clear' ? 'emptyTrash' : 'permanentDelete',
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}

export default function TrashPage() {
  const { permissions, loading } = usePermissions()
  const translate = useTranslate()
  const classes = useStyles()
  if (loading)
    return (
      <div className={classes.state} role="status">
        <CircularProgress
          size={28}
          aria-label={translate('resources.trash.loading')}
        />
      </div>
    )
  if (permissions !== 'admin')
    return (
      <Typography className={classes.root} role="alert">
        {translate('resources.trash.accessDenied')}
      </Typography>
    )
  return <AdminTrashList />
}
