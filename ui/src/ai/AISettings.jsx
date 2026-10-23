import React, { useEffect, useRef, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
  makeStyles,
} from '@material-ui/core'
import { Title, useDataProvider, usePermissions } from 'react-admin'
import useAIText from './useAIText'

const useStyles = makeStyles((theme) => ({
  root: { maxWidth: 760, margin: '24px auto', padding: '0 20px 40px' },
  form: { display: 'grid', gap: 20 },
  heading: { fontSize: 24, fontWeight: 700, marginBottom: 20 },
  privacy: { color: theme.palette.text.secondary, fontSize: 13 },
  error: { color: theme.palette.error.main },
  actions: { display: 'flex', alignItems: 'center', gap: 16 },
}))

const emptySettings = {
  enabled: false,
  endpoint: '',
  model: '',
  keyConfigured: false,
}

function AdminAISettings() {
  const text = useAIText()
  const classes = useStyles()
  const provider = useDataProvider()
  const [settings, setSettings] = useState(emptySettings)
  const [apiKey, setApiKey] = useState('')
  const [clearKey, setClearKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState(false)
  const [saved, setSaved] = useState(false)
  const [retry, setRetry] = useState(0)
  const active = useRef(true)
  const busy = useRef(false)

  useEffect(() => {
    active.current = true
    let cancelled = false
    setLoading(true)
    setError('')
    setLoadError(false)
    provider
      .getAISettings()
      .then(({ data }) => {
        if (!cancelled) setSettings({ ...emptySettings, ...data })
      })
      .catch(() => {
        if (!cancelled) {
          setError(text.loadError)
          setLoadError(true)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      active.current = false
    }
  }, [provider, retry, text.loadError])

  const save = async (event) => {
    event.preventDefault()
    if (busy.current) return
    busy.current = true
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const { data } = await provider.updateAISettings({
        enabled: settings.enabled,
        endpoint: settings.endpoint.trim(),
        model: settings.model.trim(),
        apiKey: clearKey ? '' : apiKey,
        clearKey,
      })
      if (active.current) {
        setSettings({ ...emptySettings, ...data })
        setApiKey('')
        setClearKey(false)
        setSaved(true)
      }
    } catch {
      if (active.current) setError(text.saveError)
    } finally {
      busy.current = false
      if (active.current) setSaving(false)
    }
  }
  const change = (key, value) => {
    setSettings((previous) => ({ ...previous, [key]: value }))
    setSaved(false)
  }

  return (
    <div className={classes.root}>
      <Title title={text.settings} />
      <Typography component="h1" className={classes.heading}>
        {text.settings}
      </Typography>
      {loading ? (
        <CircularProgress aria-label={text.loading} />
      ) : loadError ? (
        <div role="alert">
          <p>{error}</p>
          <Button onClick={() => setRetry((value) => value + 1)}>
            {text.retry}
          </Button>
        </div>
      ) : (
        <Card variant="outlined">
          <CardContent>
            <form onSubmit={save} className={classes.form} autoComplete="off">
              <Typography className={classes.privacy}>
                {text.privacy}
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    color="primary"
                    checked={settings.enabled}
                    disabled={saving}
                    onChange={(event) =>
                      change('enabled', event.target.checked)
                    }
                  />
                }
                label={text.enabled}
              />
              <TextField
                id="ai-endpoint"
                label={text.endpoint}
                value={settings.endpoint}
                onChange={(event) => change('endpoint', event.target.value)}
                fullWidth
                variant="outlined"
                helperText={text.endpointHelp}
                disabled={saving}
                required={settings.enabled}
                inputProps={{ maxLength: 2048 }}
              />
              <TextField
                id="ai-model"
                label={text.model}
                value={settings.model}
                onChange={(event) => change('model', event.target.value)}
                fullWidth
                variant="outlined"
                disabled={saving}
                required={settings.enabled}
                inputProps={{ maxLength: 128 }}
              />
              <TextField
                id="ai-api-key"
                label={text.apiKey}
                type="password"
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value)
                  setSaved(false)
                }}
                fullWidth
                variant="outlined"
                autoComplete="new-password"
                helperText={
                  settings.keyConfigured ? text.keySaved : text.keyEmpty
                }
                disabled={saving || clearKey}
                inputProps={{ maxLength: 8192 }}
              />
              {settings.keyConfigured && (
                <FormControlLabel
                  control={
                    <Checkbox
                      color="primary"
                      checked={clearKey}
                      disabled={saving}
                      onChange={(event) => {
                        setClearKey(event.target.checked)
                        setSaved(false)
                      }}
                    />
                  }
                  label={text.clearKey}
                />
              )}
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
                    <CircularProgress size={20} aria-label={text.loading} />
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

export default function AISettings() {
  const { permissions, loading } = usePermissions()
  const text = useAIText()
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
  return <AdminAISettings />
}
