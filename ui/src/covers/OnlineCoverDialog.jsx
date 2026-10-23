import { useEffect, useRef, useState } from 'react'
import { useDataProvider, useNotify, useRefresh } from 'react-admin'
import { useCoverText } from './useCoverText'
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  TextField,
  Typography,
  makeStyles,
} from '@material-ui/core'

const useStyles = makeStyles((theme) => ({
  notice: {
    marginBottom: theme.spacing(2),
    color: theme.palette.text.secondary,
  },
  search: {
    display: 'flex',
    gap: theme.spacing(1),
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: theme.spacing(3),
  },
  input: { flex: '1 1 240px' },
  result: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 8,
    overflow: 'hidden',
    padding: theme.spacing(1.5),
    height: '100%',
    boxSizing: 'border-box',
  },
  image: {
    width: '100%',
    height: 160,
    objectFit: 'contain',
    background: theme.palette.action.hover,
    borderRadius: 4,
  },
  meta: { margin: theme.spacing(1, 0), minHeight: 45 },
  error: { color: theme.palette.error.main },
  status: { textAlign: 'center', padding: theme.spacing(3) },
}))

export default function OnlineCoverDialog({
  kind,
  id,
  initialQuery = '',
  open,
  onClose,
}) {
  const text = useCoverText()
  const classes = useStyles()
  const dataProvider = useDataProvider()
  const notify = useNotify()
  const refresh = useRefresh()
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)
  const request = useRef(0)
  const busyRef = useRef(false)

  useEffect(() => {
    request.current += 1
    busyRef.current = false
    setBusy(null)
    setQuery(initialQuery)
    setResults(null)
    setError('')
    return () => {
      request.current += 1
    }
  }, [open, id, kind, initialQuery])

  const search = async (event) => {
    event?.preventDefault()
    if (busyRef.current || !id) return
    const token = ++request.current
    busyRef.current = true
    setBusy('search')
    setError('')
    try {
      const { data } = await dataProvider.searchOnlineCovers(
        kind,
        id,
        query.trim() === initialQuery.trim() ? '' : query.trim(),
      )
      if (request.current === token) setResults(data.candidates || [])
    } catch {
      if (request.current === token) setError(text.error)
    } finally {
      if (request.current === token) {
        busyRef.current = false
        setBusy(null)
      }
    }
  }

  const apply = async (cover) => {
    if (busyRef.current) return
    const token = ++request.current
    busyRef.current = true
    setBusy(cover.id)
    setError('')
    try {
      await dataProvider.applyOnlineCover(kind, id, cover.id)
      if (request.current !== token) return
      notify(text.saved, { type: 'info' })
      refresh()
      onClose()
    } catch {
      if (request.current === token) setError(text.failed)
    } finally {
      if (request.current === token) {
        busyRef.current = false
        setBusy(null)
      }
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => !busyRef.current && onClose()}
      maxWidth="md"
      fullWidth
      aria-labelledby="online-cover-title"
    >
      <DialogTitle id="online-cover-title">{text.title}</DialogTitle>
      <DialogContent>
        <Typography className={classes.notice}>{text.notice}</Typography>
        <form className={classes.search} onSubmit={search}>
          <TextField
            id="online-cover-query"
            label={text.query}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            inputProps={{ maxLength: 200 }}
            className={classes.input}
            disabled={Boolean(busy)}
          />
          <Button
            type="submit"
            color="primary"
            variant="contained"
            disabled={Boolean(busy)}
          >
            {text.search}
          </Button>
        </form>
        {error && (
          <Typography role="alert" className={classes.error}>
            {error}
          </Typography>
        )}
        {busy === 'search' && (
          <div role="status" className={classes.status}>
            <CircularProgress size={26} aria-label={text.searching} />
          </div>
        )}
        {results?.length === 0 && <Typography>{text.empty}</Typography>}
        <Grid container spacing={2}>
          {results?.map((cover) => (
            <Grid item xs={12} sm={6} md={4} key={cover.id}>
              <div className={classes.result}>
                <img
                  className={classes.image}
                  src={cover.previewUrl}
                  alt={cover.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <div className={classes.meta}>
                  <Typography variant="subtitle2">{cover.title}</Typography>
                  <Typography variant="caption">
                    {[cover.artist, cover.year].filter(Boolean).join(' · ')}
                  </Typography>
                </div>
                <Button
                  size="small"
                  color="primary"
                  onClick={() => apply(cover)}
                  disabled={Boolean(busy)}
                >
                  {busy === cover.id ? (
                    <CircularProgress size={16} />
                  ) : (
                    text.apply
                  )}
                </Button>
                <Button
                  size="small"
                  href={cover.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {text.source}
                </Button>
              </div>
            </Grid>
          ))}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={Boolean(busy)}>
          {text.close}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
