import { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import {
  useDataProvider,
  usePermissions,
  useRefresh,
  useTranslate,
  Title,
} from 'react-admin'
import {
  Button,
  Card,
  CardContent,
  CircularProgress,
  MenuItem,
  TextField,
  Typography,
} from '@material-ui/core'
import CloudUploadIcon from '@material-ui/icons/CloudUpload'
import { Redirect } from 'react-router-dom'
import { trashErrorMessage } from '../trash/trashErrorMessage'

const MAX_FILES = 25
const MAX_SIZE = 512 * 1024 * 1024
const AUDIO =
  /\.(mp3|flac|ogg|opus|oga|wav|aif|aiff|aifc|m4a|m4b|mp4|alac|aac|ape|wv|dsf|dff|wma)$/i

export const UploadContent = () => {
  const provider = useDataProvider()
  const translate = useTranslate()
  const refresh = useRefresh()
  const selectedLibraries = useSelector(
    (state) => state.library?.selectedLibraries || [],
  )
  const [libraries, setLibraries] = useState([])
  const [libraryId, setLibraryId] = useState('')
  const [folder, setFolder] = useState('')
  const [files, setFiles] = useState([])
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef(null)
  const inFlight = useRef(false)
  const text = (key, args) => translate(`resources.upload.${key}`, args)
  useEffect(() => {
    let mounted = true
    provider
      .getList('library', {
        pagination: { page: 1, perPage: 100 },
        sort: { field: 'name', order: 'ASC' },
        filter: {},
      })
      .then(({ data }) => {
        if (!mounted) return
        const local = data.filter(
          (library) =>
            !library.path.includes('://') || library.path.startsWith('file://'),
        )
        setLibraries(local)
        const selected = local.find(
          (library) =>
            selectedLibraries.length === 1 &&
            String(library.id) === String(selectedLibraries[0]),
        )
        if (selected || local.length === 1)
          setLibraryId(String((selected || local[0]).id))
      })
      .catch(
        (failure) =>
          mounted &&
          setError(
            trashErrorMessage(
              failure,
              translate('resources.upload.loadFailed'),
            ),
          ),
      )
    return () => {
      mounted = false
    }
    // The initial target follows the current library selection. Subsequent edits
    // are explicit and remain stable while the upload form is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, translate])

  const chooseFiles = (event) => {
    const next = Array.from(event.target.files || [])
    event.target.value = ''
    if (
      next.length > MAX_FILES ||
      next.some((file) => file.size > MAX_SIZE || !AUDIO.test(file.name))
    ) {
      setError(text('limits'))
      return
    }
    setFiles(next)
    setResults([])
    setError('')
  }
  const upload = async () => {
    if (inFlight.current || !libraryId || !files.length) return
    inFlight.current = true
    setBusy(true)
    setError('')
    const snapshot = { libraryId, folder, files: [...files] }
    const nextResults = []
    for (const file of snapshot.files) {
      try {
        const { data } = await provider.uploadMusic(snapshot.libraryId, {
          folder: snapshot.folder,
          file,
        })
        nextResults.push({
          name: file.name,
          saved: data.saved,
          scanComplete: data.scanComplete,
          error: data.scanError || data.warnings?.join('; '),
        })
      } catch (failure) {
        nextResults.push({
          name: file.name,
          saved: false,
          error: trashErrorMessage(failure, text('failed')),
        })
      }
      setResults([...nextResults])
    }
    // Never silently resend files already saved to disk after a scan failure.
    setFiles(snapshot.files.filter((file, index) => !nextResults[index].saved))
    refresh()
    setBusy(false)
    inFlight.current = false
  }
  const rescan = async () => {
    if (inFlight.current || !libraryId) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      await provider.scanUploadedMusic(libraryId, folder)
      setResults((items) =>
        items.map((item) =>
          item.saved ? { ...item, scanComplete: true, error: '' } : item,
        ),
      )
      refresh()
    } catch (failure) {
      setError(trashErrorMessage(failure, text('scanFailed')))
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }
  return (
    <Card style={{ maxWidth: 900, margin: '24px auto' }}>
      <Title title={text('name')} />
      <CardContent
        style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
      >
        <Typography variant="h5">{text('name')}</Typography>
        <Typography color="textSecondary">{text('description')}</Typography>
        <TextField
          id="upload-library"
          select
          label={text('library')}
          value={libraryId}
          onChange={(e) => {
            setLibraryId(e.target.value)
            setResults([])
          }}
          disabled={busy}
          variant="outlined"
          fullWidth
        >
          {libraries.map((library) => (
            <MenuItem key={library.id} value={String(library.id)}>
              {library.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          id="upload-folder"
          label={text('folder')}
          helperText={text('folderHelp')}
          value={folder}
          onChange={(e) => {
            setFolder(e.target.value)
            setResults([])
          }}
          disabled={busy}
          variant="outlined"
          fullWidth
        />
        <input
          ref={input}
          type="file"
          multiple
          accept="audio/*,.flac,.ape,.wv,.dsf,.dff"
          aria-label={text('choose')}
          onChange={chooseFiles}
          disabled={busy}
          style={{ display: 'none' }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Button
            variant="outlined"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {text('choose')}
          </Button>
          <Button
            color="primary"
            variant="contained"
            disabled={busy || !libraryId || !files.length}
            onClick={upload}
            startIcon={
              busy ? <CircularProgress size={16} /> : <CloudUploadIcon />
            }
          >
            {busy ? text('uploading') : text('start')}
          </Button>
          <Button disabled={busy || !libraryId} onClick={rescan}>
            {text('scan')}
          </Button>
        </div>
        <Typography variant="body2">
          {text('selected', { count: files.length })}
        </Typography>
        {files.length > 0 && (
          <ul>
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`}>{file.name}</li>
            ))}
          </ul>
        )}
        {error && (
          <Typography role="alert" color="error">
            {error}
          </Typography>
        )}
        <div aria-live="polite">
          {results.map((result, index) => (
            <Typography
              key={`${result.name}-${index}`}
              color={
                result.saved && result.scanComplete ? 'textPrimary' : 'error'
              }
            >
              {result.name}:{' '}
              {result.saved
                ? text(result.scanComplete ? 'complete' : 'saved')
                : text('failed')}
              {result.error && ` — ${result.error}`}
            </Typography>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

const UploadPage = () => {
  const { permissions, loading } = usePermissions()
  if (loading) return <CircularProgress />
  return permissions === 'admin' ? <UploadContent /> : <Redirect to="/" />
}
export default UploadPage
