import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { useDataProvider, usePermissions } from 'react-admin'
import {
  Button,
  Card,
  CardContent,
  CircularProgress,
  MenuItem,
  TextField,
  Typography,
  makeStyles,
} from '@material-ui/core'
import { EmojiObjectsOutlined, PlayArrow } from '@material-ui/icons'
import { playTracks } from '../actions'
import { Artwork } from '../common/Artwork'
import useAIText, { aiErrorText } from './useAIText'

const useStyles = makeStyles((theme) => ({
  root: {
    marginBottom: 32,
    borderRadius: 12,
    borderColor: theme.palette.divider,
  },
  content: { padding: 24, '&:last-child': { paddingBottom: 24 } },
  heading: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontWeight: 700,
    fontSize: 20,
    marginBottom: 8,
  },
  description: {
    color: theme.palette.text.secondary,
    fontSize: 13,
    marginBottom: 20,
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
  },
  picker: { minWidth: 230, flex: '1 1 230px', maxWidth: 480 },
  privacy: {
    color: theme.palette.text.secondary,
    fontSize: 12,
    marginTop: 14,
    lineHeight: 1.7,
  },
  status: { marginTop: 16 },
  analysis: { marginTop: 24, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: '16px 0 0',
    display: 'grid',
    gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
    gap: 12,
  },
  song: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    padding: 12,
    background: theme.palette.action.hover,
    borderRadius: 8,
    minWidth: 0,
  },
  art: { width: 52, height: 52, flexShrink: 0, borderRadius: 6 },
  info: { flex: 1, minWidth: 0 },
  songTitle: { fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' },
  artist: {
    color: theme.palette.text.secondary,
    fontSize: 12,
    overflowWrap: 'anywhere',
  },
  reason: { fontSize: 12, marginTop: 5, overflowWrap: 'anywhere' },
  play: { minWidth: 40, padding: 8 },
  [theme.breakpoints.down('xs')]: {
    list: { gridTemplateColumns: '1fr' },
    content: { padding: 18, '&:last-child': { paddingBottom: 18 } },
    heading: { fontSize: 18 },
  },
}))

export default function AIRecommendations() {
  const classes = useStyles()
  const text = useAIText()
  const provider = useDataProvider()
  const { permissions } = usePermissions()
  const dispatch = useDispatch()
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(false)
  const [playlists, setPlaylists] = useState([])
  const [playlistId, setPlaylistId] = useState('')
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [retry, setRetry] = useState(0)
  const active = useRef(true)
  const requesting = useRef(false)

  useEffect(() => {
    active.current = true
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    const load = async () => {
      const { data: status } = await provider.getAIStatus()
      if (cancelled) return
      setConfigured(status.configured)
      if (!status.configured) return
      const entries = []
      let page = 1
      while (!cancelled) {
        const { data, total } = await provider.getList('playlist', {
          pagination: { page, perPage: 100 },
          sort: { field: 'name', order: 'ASC' },
          filter: {},
        })
        entries.push(...data)
        if (data.length < 100 || entries.length >= total) break
        page += 1
      }
      if (!cancelled) {
        setPlaylists(entries)
        setPlaylistId((previous) =>
          entries.some((entry) => entry.id === previous)
            ? previous
            : entries[0]?.id || '',
        )
      }
    }
    load()
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      active.current = false
    }
  }, [provider, retry])

  const analyze = async () => {
    if (requesting.current || !playlistId) return
    requesting.current = true
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const { data } = await provider.getAIRecommendations(playlistId)
      if (active.current) setResult(data)
    } catch (error) {
      if (active.current) setError(aiErrorText(error, text))
    } finally {
      requesting.current = false
      if (active.current) setBusy(false)
    }
  }

  return (
    <Card
      component="section"
      variant="outlined"
      className={classes.root}
      aria-label={text.title}
    >
      <CardContent className={classes.content}>
        <Typography component="h2" className={classes.heading}>
          <EmojiObjectsOutlined color="primary" />
          {text.discoverTitle}
        </Typography>
        <Typography className={classes.description}>
          {text.description}
        </Typography>
        {loading ? (
          <CircularProgress size={24} aria-label={text.loading} />
        ) : loadError ? (
          <div role="alert">
            <p>{text.loadError}</p>
            <Button onClick={() => setRetry((value) => value + 1)}>
              {text.retry}
            </Button>
          </div>
        ) : !configured ? (
          <div>
            <Typography>{text.notConfigured}</Typography>
            {permissions === 'admin' ? (
              <Button component={Link} to="/ai/settings" color="primary">
                {text.settings}
              </Button>
            ) : (
              <Typography className={classes.privacy}>
                {text.askAdmin}
              </Typography>
            )}
          </div>
        ) : playlists.length === 0 ? (
          <Typography>{text.noPlaylists}</Typography>
        ) : (
          <>
            <div className={classes.controls}>
              <TextField
                select
                variant="outlined"
                size="small"
                id="ai-playlist"
                label={text.playlist}
                value={playlistId}
                disabled={busy}
                className={classes.picker}
                onChange={(event) => {
                  setPlaylistId(event.target.value)
                  setResult(null)
                  setError('')
                }}
              >
                {playlists.map((playlist) => (
                  <MenuItem key={playlist.id} value={playlist.id}>
                    {playlist.name}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="contained"
                color="primary"
                disabled={busy || !playlistId}
                onClick={analyze}
              >
                {busy ? text.analyzing : text.analyze}
              </Button>
            </div>
            <Typography className={classes.privacy}>{text.privacy}</Typography>
            <Typography className={classes.privacy}>{text.sampled}</Typography>
            {busy && (
              <div role="status" className={classes.status}>
                <CircularProgress size={22} aria-label={text.analyzing} />
              </div>
            )}
            {error && (
              <div role="alert" className={classes.status}>
                <Typography>{error}</Typography>
                <Button onClick={analyze}>{text.retry}</Button>
              </div>
            )}
            {result && (
              <div aria-live="polite">
                {result.analysis && (
                  <div className={classes.analysis}>
                    <Typography component="h3" variant="subtitle1">
                      {text.analysis}
                    </Typography>
                    <Typography>{result.analysis}</Typography>
                  </div>
                )}
                {result.recommendations?.length ? (
                  <>
                    <Typography
                      component="h3"
                      variant="subtitle1"
                      className={classes.status}
                    >
                      {text.recommendations}
                    </Typography>
                    <ul className={classes.list}>
                      {result.recommendations.map(({ song, reason }) => (
                        <li key={song.id} className={classes.song}>
                          <Artwork
                            record={song}
                            title={song.title}
                            className={classes.art}
                          />
                          <div className={classes.info}>
                            <Typography className={classes.songTitle}>
                              {song.title}
                            </Typography>
                            <Typography className={classes.artist}>
                              {song.artist} · {song.album}
                            </Typography>
                            <Typography className={classes.reason}>
                              {reason}
                            </Typography>
                          </div>
                          <Button
                            className={classes.play}
                            aria-label={`${text.play} ${song.title}`}
                            onClick={() =>
                              dispatch(
                                playTracks({ [song.id]: song }, [song.id]),
                              )
                            }
                          >
                            <PlayArrow />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <Typography className={classes.status}>
                    {text.noCandidates}
                  </Typography>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
