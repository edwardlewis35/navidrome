import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  AuthContext,
  DataProviderContext,
  TranslationProvider,
  useDataProvider,
} from 'react-admin'
import { TestContext } from 'ra-test'
import jsonServerProvider from 'ra-data-json-server'
import { describe, expect, it, vi } from 'vitest'
import OnlineCoverDialog from '../covers/OnlineCoverDialog'
import AISettings from '../ai/AISettings'
import UploadPage from '../upload/UploadPage'
import en from '../i18n/en.json'
import { createOnlineCoverProvider } from './onlineCoverProvider'
import { createAIDataProvider } from './aiDataProvider'
import { createSongManagementProvider } from './songManagementProvider'
import { createCoverSettingsProvider } from './coverSettingsProvider'

const releaseId = 'b84ee12a-09ef-421b-82de-0441a926375b'
const authProvider = {
  getPermissions: () => Promise.resolve('admin'),
  checkError: () => Promise.resolve(),
}
const i18nProvider = {
  getLocale: () => 'en',
  changeLocale: () => Promise.resolve(),
  translate: (key, options = {}) => {
    const value = key.split('.').reduce((result, part) => result?.[part], en)
    return (typeof value === 'string' ? value : key).replace(
      /%\{(\w+)\}/g,
      (match, name) => options[name] ?? match,
    )
  },
}

// Keep react-admin's real hook, argument parsing, Redux dispatch and provider
// proxy in this path. Only the final HTTP client is replaced; these regressions
// cannot be caught by mocking useDataProvider or calling a factory directly.
const renderWithProvider = (provider, children) =>
  render(
    <AuthContext.Provider value={authProvider}>
      <DataProviderContext.Provider value={provider}>
        <TestContext
          initialState={{
            admin: { ui: { optimistic: false } },
            library: { selectedLibraries: [1] },
          }}
        >
          <TranslationProvider i18nProvider={i18nProvider}>
            {children}
          </TranslationProvider>
        </TestContext>
      </DataProviderContext.Provider>
    </AuthContext.Provider>,
  )

function ProviderAction({ action }) {
  const provider = useDataProvider()
  return <button onClick={() => action(provider)}>Run</button>
}

const textFromFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsText(file)
  })

describe('music management through the real react-admin data provider hook', () => {
  it('sends edited search words and the selected release UUID from the real cover dialog', async () => {
    const candidate = {
      id: releaseId,
      title: 'Matching public release',
      artist: 'Fixture artist',
      previewUrl: `https://coverartarchive.org/release/${releaseId}/front-250`,
      sourceUrl: `https://musicbrainz.org/release/${releaseId}`,
    }
    const http = vi.fn(async (url) => ({
      json: url.endsWith('/search')
        ? { candidates: [candidate] }
        : { id: 'fixture-song', saved: true, refreshQueued: true },
    }))
    const onClose = vi.fn()
    renderWithProvider(
      createOnlineCoverProvider(http),
      <OnlineCoverDialog
        kind="song"
        id="fixture-song"
        initialQuery="Original album"
        open
        onClose={onClose}
      />,
    )
    fireEvent.change(screen.getByLabelText('Album or playlist name'), {
      target: { value: '  Edited album words  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search covers' }))
    await screen.findByText(candidate.title)
    expect(JSON.parse(http.mock.calls[0][1].body)).toEqual({
      kind: 'song',
      id: 'fixture-song',
      query: 'Edited album words',
    })
    const apply = screen.getByRole('button', { name: 'Use this cover' })
    await waitFor(() => expect(apply).toBeEnabled())
    fireEvent.click(apply)
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(http).toHaveBeenCalledTimes(2)
    expect(http.mock.calls[1][0]).toBe('/api/online-cover/apply')
    expect(JSON.parse(http.mock.calls[1][1].body)).toEqual({
      kind: 'song',
      id: 'fixture-song',
      releaseId,
    })
  })

  it('preserves a real audio File and subdirectory when the upload page uses a string library ID', async () => {
    const http = vi.fn(async (url) =>
      url.startsWith('/api/library?')
        ? {
            headers: new Headers({ 'X-Total-Count': '1' }),
            json: [{ id: 1, name: 'Fixture library', path: '/music' }],
          }
        : { json: { saved: true, scanComplete: true } },
    )
    const provider = {
      ...jsonServerProvider('/api', http),
      ...createSongManagementProvider(http),
    }
    renderWithProvider(provider, <UploadPage />)
    await screen.findByText('Fixture library')
    fireEvent.change(screen.getByLabelText('Existing subfolder (optional)'), {
      target: { value: 'Fixture/Album' },
    })
    const file = new File(['fLaC fixture audio bytes'], '歌曲.flac', {
      type: 'audio/flac',
    })
    fireEvent.change(screen.getByLabelText('Choose audio files'), {
      target: { files: [file] },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Upload and refresh' }))
    await screen.findByText(/Uploaded and library refreshed/)
    const [url, options] = http.mock.calls.find(([url]) =>
      url.includes('/upload?'),
    )
    expect(url).toBe('/api/library/1/upload?folder=Fixture%2FAlbum')
    expect(options.headers.has('Content-Type')).toBe(false)
    const uploaded = options.body.get('file')
    expect(uploaded).toBeInstanceOf(File)
    expect(uploaded.name).toBe(file.name)
    expect(uploaded.type).toBe(file.type)
    expect(await textFromFile(uploaded)).toBe('fLaC fixture audio bytes')
  })

  it.each([true, false])(
    'persists AI enabled=%s from the real settings form instead of treating it as hook options',
    async (enabled) => {
      const initial = {
        enabled: !enabled,
        endpoint: 'https://provider.example/v1',
        model: 'fixture-model',
        keyConfigured: true,
      }
      const http = vi.fn(async (_url, options) => ({
        json: options?.method === 'PUT' ? { ...initial, enabled } : initial,
      }))
      renderWithProvider(createAIDataProvider(http), <AISettings />)
      const toggle = await screen.findByLabelText('Enable AI music')
      fireEvent.click(toggle)
      expect(toggle.checked).toBe(enabled)
      fireEvent.change(screen.getByLabelText('API key'), {
        target: { value: 'fixture-not-a-real-key' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
      await screen.findByText('AI settings saved')
      const writes = http.mock.calls.filter(
        ([, options]) => options?.method === 'PUT',
      )
      expect(writes).toHaveLength(1)
      expect(writes[0][0]).toBe('/api/ai/settings')
      expect(JSON.parse(writes[0][1].body)).toEqual({
        enabled,
        endpoint: initial.endpoint,
        model: initial.model,
        apiKey: 'fixture-not-a-real-key',
        clearKey: false,
      })
      expect(screen.getByLabelText('API key')).toHaveValue('')
    },
  )

  it('preserves the dedicated cover proxy settings payload through the same hook', async () => {
    const proxy = 'http://proxy.example:7891'
    const http = vi.fn().mockResolvedValue({ json: { proxy } })
    renderWithProvider(
      createCoverSettingsProvider(http),
      <ProviderAction
        action={(provider) =>
          provider.updateOnlineCoverSettings('online-cover', {
            data: { proxy },
          })
        }
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(http).toHaveBeenCalledOnce())
    expect(http.mock.calls[0][0]).toBe('/api/online-cover/settings')
    expect(JSON.parse(http.mock.calls[0][1].body)).toEqual({ proxy })
  })
})
