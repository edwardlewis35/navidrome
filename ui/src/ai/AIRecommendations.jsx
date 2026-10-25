import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { useDataProvider, useLocale, usePermissions } from 'react-admin'
import {
  Button,
  Card,
  CardContent,
  CircularProgress,
  Typography,
  makeStyles,
} from '@material-ui/core'
import { EmojiObjectsOutlined, PlayArrow } from '@material-ui/icons'
import { playTracks } from '../actions'
import { Artwork } from '../common/Artwork'
import useAIText from './useAIText'

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

const nextRunLabel = (value, locale) => {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale?.startsWith('zh') ? 'zh-CN' : 'en-GB', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

export default function AIRecommendations() {
  const classes = useStyles()
  const text = useAIText()
  const locale = useLocale()
  const provider = useDataProvider()
  const { permissions } = usePermissions()
  const dispatch = useDispatch()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [result, setResult] = useState(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    provider
      .getAIDailyRecommendations()
      .then(({ data }) => {
        if (!cancelled) setResult(data)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [provider, retry])

  // Refresh only the saved result. The page never starts a model request.
  useEffect(() => {
    if (!result || loading || result.state === 'disabled') return undefined
    const delay = result.state === 'pending' || result.stale ? 60000 : 300000
    const timer = window.setInterval(
      () => setRetry((value) => value + 1),
      delay,
    )
    return () => window.clearInterval(timer)
  }, [result, loading])

  const disabled = result?.state === 'disabled' || result?.configured === false
  const localSongs = result?.recommendations || []
  const externalSongs = result?.externalRecommendations || []
  const nextRun = nextRunLabel(result?.nextRunAt, locale)

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
          {text.dailyTitle}
        </Typography>
        <Typography className={classes.description}>
          {text.dailyDescription}
        </Typography>
        {loading && !result ? (
          <CircularProgress size={24} aria-label={text.loading} />
        ) : loadError ? (
          <div role="alert">
            <p>{text.dailyLoadError}</p>
            <Button onClick={() => setRetry((value) => value + 1)}>
              {text.retry}
            </Button>
          </div>
        ) : disabled ? (
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
        ) : (
          <>
            <Typography className={classes.privacy}>
              {text.dailySchedule}
            </Typography>
            {nextRun && (
              <Typography className={classes.privacy}>
                {text.dailyNextRun}{' '}
                <time dateTime={result.nextRunAt}>{nextRun}</time>
              </Typography>
            )}
            {result?.state === 'pending' ? (
              <Typography role="status" className={classes.status}>
                {text.dailyPending}
              </Typography>
            ) : result?.state === 'failed' ? (
              <Typography role="alert" className={classes.status}>
                {text.dailyFailed}
              </Typography>
            ) : result?.state === 'ready' ? (
              <div aria-live="polite">
                {result.stale && (
                  <Typography role="status" className={classes.status}>
                    {text.dailyStale}
                  </Typography>
                )}
                {result.date && (
                  <Typography className={classes.privacy}>
                    {text.dailyDate}{' '}
                    <time dateTime={result.generatedAt || result.date}>
                      {result.date}
                    </time>
                  </Typography>
                )}
                {result.sourcePlaylistName && (
                  <Typography className={classes.privacy}>
                    {text.dailySource} {result.sourcePlaylistName}
                  </Typography>
                )}
                {result.analysis && (
                  <div className={classes.analysis}>
                    <Typography component="h3" variant="subtitle1">
                      {text.analysis}
                    </Typography>
                    <Typography>{result.analysis}</Typography>
                  </div>
                )}
                {localSongs.length > 0 && (
                  <>
                    <Typography
                      component="h3"
                      variant="subtitle1"
                      className={classes.status}
                    >
                      {text.recommendations}
                    </Typography>
                    <ul className={classes.list}>
                      {localSongs.map(({ song, reason }) => (
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
                              {[song.artist, song.album]
                                .filter(Boolean)
                                .join(' · ')}
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
                )}
                {externalSongs.length > 0 && (
                  <>
                    <Typography
                      component="h3"
                      variant="subtitle1"
                      className={classes.status}
                    >
                      {text.externalRecommendations}
                    </Typography>
                    <Typography className={classes.privacy}>
                      {text.externalHelp}
                    </Typography>
                    <ul className={classes.list}>
                      {externalSongs.map(({ title, artist, reason }) => (
                        <li
                          key={JSON.stringify([title, artist])}
                          className={classes.song}
                        >
                          <div className={classes.info}>
                            <Typography
                              component="h4"
                              className={classes.songTitle}
                            >
                              {title}
                            </Typography>
                            <Typography className={classes.artist}>
                              {artist}
                            </Typography>
                            {reason && (
                              <Typography className={classes.reason}>
                                {reason}
                              </Typography>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {localSongs.length === 0 && externalSongs.length === 0 && (
                  <Typography className={classes.status}>
                    {text.dailyEmpty}
                  </Typography>
                )}
              </div>
            ) : (
              <Typography role="status" className={classes.status}>
                {text.dailyPending}
              </Typography>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
