import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  CircularProgress,
  TextField,
  Typography,
  makeStyles,
} from '@material-ui/core'
import { Title, useDataProvider, useLocale, usePermissions } from 'react-admin'

const useStyles = makeStyles((theme) => ({
  root: { maxWidth: 760, margin: '24px auto', padding: '0 20px 40px' },
  form: { display: 'grid', gap: 20 },
  heading: { fontSize: 24, fontWeight: 700, marginBottom: 20 },
  notice: { color: theme.palette.text.secondary },
  error: { color: theme.palette.error.main },
  actions: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
}))

const useText = () =>
  useLocale()?.startsWith('zh')
    ? {
        title: '封面设置',
        proxy: '封面专用代理地址',
        help: '例如 http://192.168.8.10:7891。留空表示直连，不支持账号和密码。',
        scope: '代理仅用于封面搜索和图片下载。保存后立即生效，重启后保留。',
        source: '当前使用服务器预设的封面代理配置，可在此覆盖。',
        save: '保存设置',
        saved: '已保存，新的封面请求将使用此设置',
        invalid:
          '请输入完整的 HTTP 或 HTTPS 代理地址和端口，不要包含账号、密码或路径。',
        failed: '保存失败，请检查代理地址后重试。',
        loadError: '无法读取封面设置，请重试。',
        retry: '重试',
        loading: '正在读取封面设置',
        saving: '正在保存',
        adminOnly: '只有管理员可以修改封面设置。',
      }
    : {
        title: 'Cover settings',
        proxy: 'Cover proxy address',
        help: 'For example, http://192.168.8.10:7891. Leave empty for a direct connection. Credentials are not supported.',
        scope:
          'This proxy is used for cover searches and image downloads only. Changes apply immediately and survive restarts.',
        source:
          'The server cover proxy setting is in use. You can override it here.',
        save: 'Save settings',
        saved: 'Saved. New cover requests will use this setting.',
        invalid:
          'Enter a complete HTTP or HTTPS proxy address and port, without credentials or a path.',
        failed: 'Could not save. Check the proxy address and retry.',
        loadError: 'Could not load cover settings. Please retry.',
        retry: 'Try again',
        loading: 'Loading cover settings',
        saving: 'Saving settings',
        adminOnly: 'Only administrators can change cover settings.',
      }

function AdminCoverSettings() {
  const text = useText()
  const classes = useStyles()
  const provider = useDataProvider()
  const [proxy, setProxy] = useState('')
  const [source, setSource] = useState('')
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
      .getOnlineCoverSettings()
      .then(({ data }) => {
        if (!cancelled) {
          setProxy(data.proxy || '')
          setSource(data.source)
        }
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
      const { data } = await provider.updateOnlineCoverSettings(
        'online-cover',
        {
          data: { proxy: proxy.trim() },
        },
      )
      if (active.current) {
        setProxy(data.proxy || '')
        setSource(data.source)
        setSaved(true)
      }
    } catch (err) {
      if (active.current)
        setError(err.status === 400 ? text.invalid : text.failed)
    } finally {
      busy.current = false
      if (active.current) setSaving(false)
    }
  }

  return (
    <div className={classes.root}>
      <Title title={text.title} />
      <Typography component="h1" className={classes.heading}>
        {text.title}
      </Typography>
      {loading ? (
        <CircularProgress aria-label={text.loading} />
      ) : loadError ? (
        <div role="alert">
          <p>{text.loadError}</p>
          <Button onClick={() => setRetry((value) => value + 1)}>
            {text.retry}
          </Button>
        </div>
      ) : (
        <Card variant="outlined">
          <CardContent>
            <form onSubmit={save} className={classes.form} autoComplete="off">
              <Typography className={classes.notice}>{text.scope}</Typography>
              {source === 'server' && (
                <Typography className={classes.notice}>
                  {text.source}
                </Typography>
              )}
              <TextField
                id="cover-proxy"
                label={text.proxy}
                value={proxy}
                onChange={(event) => {
                  setProxy(event.target.value)
                  setSaved(false)
                  setError('')
                }}
                fullWidth
                variant="outlined"
                helperText={text.help}
                disabled={saving}
                inputProps={{ maxLength: 2048, spellCheck: false }}
              />
              {error && (
                <Typography role="alert" className={classes.error}>
                  {error}
                </Typography>
              )}
              <div className={classes.actions}>
                <Button
                  variant="contained"
                  color="primary"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? (
                    <CircularProgress size={20} aria-label={text.saving} />
                  ) : (
                    text.save
                  )}
                </Button>
                {saved && <Typography role="status">{text.saved}</Typography>}
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default function OnlineCoverSettings() {
  const { permissions, loading } = usePermissions()
  const text = useText()
  const classes = useStyles()
  if (loading)
    return (
      <div className={classes.root}>
        <CircularProgress aria-label={text.loading} />
      </div>
    )
  if (permissions !== 'admin')
    return (
      <Typography role="alert" className={classes.root}>
        {text.adminOnly}
      </Typography>
    )
  return <AdminCoverSettings />
}
