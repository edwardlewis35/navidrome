import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Card,
  CardActions,
  CardContent,
  CircularProgress,
  Grid,
  TextField,
  Typography,
  makeStyles,
} from '@material-ui/core'
import { PlayArrow, RadioOutlined } from '@material-ui/icons'
import { Title, useDataProvider, useLocale, usePermissions } from 'react-admin'
import { useDispatch } from 'react-redux'
import { setTrack } from '../actions'
import { RADIO_PLACEHOLDER_IMAGE } from '../consts'

const useStyles = makeStyles((theme) => ({
  root: { maxWidth: 1200, margin: '24px auto', padding: '0 24px 100px' },
  heading: { fontSize: 26, fontWeight: 700, marginBottom: 12 },
  notice: { color: theme.palette.text.secondary, marginBottom: 24 },
  icon: { fontSize: 42, color: theme.palette.primary.main, marginBottom: 12 },
  card: { height: '100%', display: 'flex', flexDirection: 'column' },
  cardContent: { flex: 1 },
  actions: { flexWrap: 'wrap', gap: 8 },
  error: { color: theme.palette.error.main, marginBottom: 16 },
  settings: { marginTop: 32 },
  form: { display: 'grid', gap: 20 },
}))

const useText = () =>
  useLocale()?.startsWith('zh')
    ? {
        title: '英语电台',
        notice:
          '收听伦敦流行音乐、英国新闻和古典音乐。点击播放后，通过本站播放器收听。',
        play: '播放',
        source: '电台来源',
        loading: '正在读取电台',
        failed: '无法读取电台，请重试。',
        playFailed: '电台暂时无法播放，请重试或检查电台代理设置。',
        retry: '重试',
        settings: '电台代理设置',
        proxy: '电台专用代理地址',
        help: '例如 http://192.168.8.10:7891。留空表示直连，不支持账号和密码。',
        scope: '仅用于这些电台的音频连接，保存后对新播放生效。',
        save: '保存设置',
        saving: '正在保存',
        saved: '已保存，重新点击播放即可使用新设置',
        invalid:
          '请输入完整的 HTTP 或 HTTPS 代理地址和端口，不要包含账号、密码或路径。',
        saveFailed: '无法保存电台设置，请重试。',
        settingsFailed: '无法读取电台代理设置，请重试。',
      }
    : {
        title: 'English radio',
        notice:
          'Listen to London pop, UK news and classical music through this music player.',
        play: 'Play',
        source: 'Station source',
        loading: 'Loading radio stations',
        failed: 'Could not load radio stations. Please retry.',
        playFailed:
          'Could not play this station. Retry or check the radio proxy setting.',
        retry: 'Try again',
        settings: 'Radio proxy settings',
        proxy: 'Radio proxy address',
        help: 'For example, http://192.168.8.10:7891. Leave empty for a direct connection. Credentials are not supported.',
        scope:
          'Used only for these stations. Changes apply to newly started playback.',
        save: 'Save settings',
        saving: 'Saving settings',
        saved: 'Saved. Click Play again to use the new setting.',
        invalid:
          'Enter a complete HTTP or HTTPS proxy address and port, without credentials or a path.',
        saveFailed: 'Could not save radio settings. Please retry.',
        settingsFailed: 'Could not load radio proxy settings. Please retry.',
      }

export function RadioProxySettings() {
  const text = useText()
  const classes = useStyles()
  const provider = useDataProvider()
  const [proxy, setProxy] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const active = useRef(true)
  const busy = useRef(false)
  useEffect(() => {
    active.current = true
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    provider
      .getEnglishRadioSettings()
      .then(({ data }) => {
        if (!cancelled) setProxy(data.proxy || '')
      })
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
  const save = async (event) => {
    event.preventDefault()
    if (busy.current) return
    busy.current = true
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const { data } = await provider.updateEnglishRadioSettings(
        'english-radio',
        { data: { proxy: proxy.trim() } },
      )
      if (active.current) {
        setProxy(data.proxy || '')
        setSaved(true)
      }
    } catch (err) {
      if (active.current)
        setError(err?.status === 400 ? text.invalid : text.saveFailed)
    } finally {
      busy.current = false
      if (active.current) setSaving(false)
    }
  }
  return (
    <Card variant="outlined" className={classes.settings}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {text.settings}
        </Typography>
        {loading ? (
          <CircularProgress size={24} aria-label={text.loading} />
        ) : loadError ? (
          <div role="alert">
            <p>{text.settingsFailed}</p>
            <Button onClick={() => setRetry((value) => value + 1)}>
              {text.retry}
            </Button>
          </div>
        ) : (
          <form onSubmit={save} className={classes.form} autoComplete="off">
            <Typography color="textSecondary">{text.scope}</Typography>
            <TextField
              id="radio-proxy"
              label={text.proxy}
              value={proxy}
              disabled={saving}
              variant="outlined"
              fullWidth
              helperText={text.help}
              inputProps={{ maxLength: 2048, spellCheck: false }}
              onChange={(event) => {
                setProxy(event.target.value)
                setSaved(false)
                setError('')
              }}
            />
            {error && (
              <Typography role="alert" className={classes.error}>
                {error}
              </Typography>
            )}
            <div>
              <Button
                type="submit"
                color="primary"
                variant="contained"
                disabled={saving}
              >
                {saving ? (
                  <CircularProgress size={20} aria-label={text.saving} />
                ) : (
                  text.save
                )}
              </Button>
            </div>
            {saved && <Typography role="status">{text.saved}</Typography>}
          </form>
        )}
      </CardContent>
    </Card>
  )
}

export default function EnglishRadioPage() {
  const text = useText()
  const classes = useStyles()
  const provider = useDataProvider()
  const { permissions, loading: permissionsLoading } = usePermissions()
  const dispatch = useDispatch()
  const [stations, setStations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [playing, setPlaying] = useState('')
  const busy = useRef(false)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    let cancelled = false
    setLoading(true)
    setError('')
    provider
      .getEnglishRadioCatalog()
      .then(({ data }) => {
        if (!cancelled) setStations(data.stations || [])
      })
      .catch(() => {
        if (!cancelled) setError(text.failed)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      active.current = false
    }
  }, [provider, retry, text.failed])

  const play = async (station) => {
    if (busy.current) return
    busy.current = true
    setPlaying(station.id)
    setError('')
    try {
      const { data } = await provider.playEnglishRadio(station.id)
      if (!active.current) return
      dispatch(
        setTrack({
          ...station,
          title: station.name,
          artist: station.name,
          album: 'English radio',
          isRadio: true,
          cover: RADIO_PLACEHOLDER_IMAGE,
          streamUrl: data.streamUrl,
        }),
      )
    } catch {
      if (active.current) setError(text.playFailed)
    } finally {
      busy.current = false
      if (active.current) setPlaying('')
    }
  }

  return (
    <div className={classes.root}>
      <Title title={text.title} />
      <Typography component="h1" className={classes.heading}>
        {text.title}
      </Typography>
      <Typography className={classes.notice}>{text.notice}</Typography>
      {error && (
        <Typography role="alert" className={classes.error}>
          {error}
        </Typography>
      )}
      {loading ? (
        <CircularProgress aria-label={text.loading} />
      ) : stations.length === 0 ? (
        <Button onClick={() => setRetry((value) => value + 1)}>
          {text.retry}
        </Button>
      ) : (
        <Grid container spacing={3}>
          {stations.map((station) => (
            <Grid item xs={12} sm={6} md={4} key={station.id}>
              <Card variant="outlined" className={classes.card}>
                <CardContent className={classes.cardContent}>
                  <RadioOutlined className={classes.icon} />
                  <Typography variant="h6" gutterBottom>
                    {station.name}
                  </Typography>
                  <Typography color="textSecondary">
                    {station.description}
                  </Typography>
                </CardContent>
                <CardActions className={classes.actions}>
                  <Button
                    color="primary"
                    variant="contained"
                    onClick={() => play(station)}
                    disabled={Boolean(playing)}
                    startIcon={
                      playing === station.id ? (
                        <CircularProgress size={18} />
                      ) : (
                        <PlayArrow />
                      )
                    }
                    aria-label={`${text.play} ${station.name}`}
                  >
                    {text.play}
                  </Button>
                  <Button
                    href={station.sourceUrl || station.homePageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {text.source}
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
      {!permissionsLoading && permissions === 'admin' && <RadioProxySettings />}
    </div>
  )
}
