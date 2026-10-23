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
import { DeleteOutline, Refresh, Restore } from '@material-ui/icons'
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
  },
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
  const [restoreError, setRestoreError] = useState('')
  const [restoring, setRestoring] = useState(null)
  const [version, setVersion] = useState(0)
  const mounted = useRef(true)
  const text = (key) => translate(`resources.trash.${key}`)

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
    if (restoring) return
    setRestoring(entry.id)
    setRestoreError('')
    try {
      await dataProvider.restoreSongFromTrash(entry.id)
      if (!mounted.current) return
      setEntries((current) => current.filter((item) => item.id !== entry.id))
      notify(text('restored'), { type: 'info' })
      refresh()
    } catch (failure) {
      if (mounted.current)
        setRestoreError(trashErrorMessage(failure, text('restoreFailed')))
    } finally {
      if (mounted.current) setRestoring(null)
    }
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
        <Button
          startIcon={<Refresh />}
          disabled={loading || Boolean(restoring)}
          onClick={() => setVersion((value) => value + 1)}
        >
          {text('refresh')}
        </Button>
      </div>
      <Typography className={classes.description}>
        {text('description')}
      </Typography>
      {restoreError && (
        <Typography role="alert" className={classes.error}>
          {restoreError}
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
                          restoring === entry.id ? (
                            <CircularProgress size={16} />
                          ) : (
                            <Restore />
                          )
                        }
                        disabled={Boolean(restoring)}
                        onClick={() => restore(entry)}
                        aria-label={`${text('restore')} ${entry.title}`}
                      >
                        {text('restore')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
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
