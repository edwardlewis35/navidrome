import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter, Link, Route } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '../i18n/en.json'
import zh from '../../../resources/i18n/zh-Hans.json'
import zhHant from '../../../resources/i18n/zh-Hant.json'
import TrashPage from './TrashPage'
import TrashMenuItem from './TrashMenuItem'

const mocks = vi.hoisted(() => ({
  permissions: 'admin',
  permissionsLoading: false,
  locale: 'en',
  notify: vi.fn(),
  refresh: vi.fn(),
  provider: {
    getSongTrash: vi.fn(),
    restoreSongFromTrash: vi.fn(),
    permanentlyDeleteSongFromTrash: vi.fn(),
    emptySongTrash: vi.fn(),
  },
}))
const translate = (key, options = {}) => {
  const messages = { en, 'zh-Hans': zh, 'zh-Hant': zhHant }
  const value =
    key
      .split('.')
      .reduce((value, part) => value?.[part], messages[mocks.locale]) || key
  return value.replace(/%\{(\w+)\}/g, (match, name) => options[name] ?? match)
}
vi.mock('react-admin', () => ({
  Title: () => null,
  MenuItemLink: ({ to, primaryText }) => <Link to={to}>{primaryText}</Link>,
  usePermissions: () => ({
    permissions: mocks.permissions,
    loading: mocks.permissionsLoading,
  }),
  useTranslate: () => translate,
  useLocale: () => mocks.locale,
  useDataProvider: () => mocks.provider,
  useNotify: () => mocks.notify,
  useRefresh: () => mocks.refresh,
}))

const entry = {
  id: 'trash-uuid',
  mediaFileId: 'song-id',
  title: 'Blue Hours',
  artist: 'Evening Quartet',
  album: 'Nightfall',
  path: 'Jazz/Blue Hours.flac',
  deletedAt: '2026-10-22T08:00:00Z',
  deletedBy: 'admin',
}
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/trash']}>
      <Route path="/trash">
        <TrashPage />
      </Route>
    </MemoryRouter>,
  )

describe('administrator recoverable song trash', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.permissions = 'admin'
    mocks.permissionsLoading = false
    mocks.locale = 'en'
    mocks.provider.getSongTrash.mockResolvedValue({ data: [entry] })
    mocks.provider.restoreSongFromTrash.mockResolvedValue({
      data: { id: entry.mediaFileId, trashId: entry.id },
    })
    mocks.provider.permanentlyDeleteSongFromTrash.mockResolvedValue({
      data: { id: entry.id, mediaFileId: entry.mediaFileId },
    })
    mocks.provider.emptySongTrash.mockResolvedValue({ data: { deleted: 1 } })
  })

  it.each(['regular', undefined])(
    'guards direct /trash access for %s without a list or restore request',
    (permissions) => {
      mocks.permissions = permissions
      renderPage()
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Only administrators can access Trash.',
      )
      expect(mocks.provider.getSongTrash).not.toHaveBeenCalled()
      expect(mocks.provider.restoreSongFromTrash).not.toHaveBeenCalled()
      expect(
        mocks.provider.permanentlyDeleteSongFromTrash,
      ).not.toHaveBeenCalled()
      expect(mocks.provider.emptySongTrash).not.toHaveBeenCalled()
      expect(screen.queryByRole('button', { name: 'Empty trash' })).toBeNull()
    },
  )

  it('waits for permission resolution before fetching data', () => {
    mocks.permissionsLoading = true
    renderPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(mocks.provider.getSongTrash).not.toHaveBeenCalled()
  })

  it('shows original metadata and restores by trash UUID, then refreshes the library', async () => {
    renderPage()
    expect(await screen.findByText(entry.title)).toBeInTheDocument()
    expect(screen.getByText(entry.path)).toBeInTheDocument()
    expect(screen.getByText('Evening Quartet · Nightfall')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restore Blue Hours' }))
    await waitFor(() =>
      expect(mocks.provider.restoreSongFromTrash).toHaveBeenCalledWith(
        'trash-uuid',
      ),
    )
    expect(await screen.findByText('Trash is empty.')).toBeInTheDocument()
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(mocks.notify).toHaveBeenCalledWith('Song restored', { type: 'info' })
  })

  it('keeps failed restores visible and allows retry without overwriting the destination', async () => {
    mocks.provider.restoreSongFromTrash.mockRejectedValueOnce({
      body: { error: 'Original path already exists' },
    })
    renderPage()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Restore Blue Hours' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Original path already exists',
    )
    expect(screen.getByText(entry.title)).toBeInTheDocument()
    expect(mocks.refresh).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Restore Blue Hours' }))
    expect(await screen.findByText('Trash is empty.')).toBeInTheDocument()
    expect(mocks.provider.restoreSongFromTrash).toHaveBeenCalledTimes(2)
  })

  it('identifies the song and irreversible effect before permanent deletion, and cancel sends nothing', async () => {
    renderPage()
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Delete permanently Blue Hours',
      }),
    )
    const dialog = screen.getByRole('dialog', {
      name: 'Permanently delete this song?',
    })
    expect(within(dialog).getByText(entry.title)).toBeInTheDocument()
    expect(
      within(dialog).getByText(/This cannot be undone/),
    ).toBeInTheDocument()
    expect(mocks.provider.permanentlyDeleteSongFromTrash).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText(entry.title)).toBeInTheDocument()
    expect(mocks.provider.permanentlyDeleteSongFromTrash).not.toHaveBeenCalled()
    expect(mocks.provider.emptySongTrash).not.toHaveBeenCalled()
  })

  it('permanently deletes the confirmed trash UUID and removes its row', async () => {
    renderPage()
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Delete permanently Blue Hours',
      }),
    )
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Delete permanently',
      }),
    )
    expect(await screen.findByText('Trash is empty.')).toBeInTheDocument()
    expect(mocks.provider.permanentlyDeleteSongFromTrash).toHaveBeenCalledOnce()
    expect(mocks.provider.permanentlyDeleteSongFromTrash).toHaveBeenCalledWith(
      entry.id,
    )
    expect(mocks.provider.emptySongTrash).not.toHaveBeenCalled()
    expect(mocks.notify).toHaveBeenCalledWith('Song permanently deleted', {
      type: 'info',
    })
    expect(mocks.refresh).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'Empty trash' })).toBeDisabled()
  })

  it('reloads after failed permanent deletion and lets the administrator retry', async () => {
    mocks.provider.permanentlyDeleteSongFromTrash.mockRejectedValueOnce({
      body: { error: 'Could not remove the audio file' },
    })
    renderPage()
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Delete permanently Blue Hours',
      }),
    )
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Delete permanently',
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not remove the audio file',
    )
    await waitFor(() =>
      expect(mocks.provider.getSongTrash).toHaveBeenCalledTimes(2),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Delete permanently Blue Hours',
      }),
    )
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Delete permanently',
      }),
    )
    expect(await screen.findByText('Trash is empty.')).toBeInTheDocument()
    expect(mocks.provider.permanentlyDeleteSongFromTrash).toHaveBeenCalledTimes(
      2,
    )
  })

  it('shows the full count when emptying trash and cancel makes no deletion request', async () => {
    mocks.provider.getSongTrash.mockResolvedValue({
      data: [entry, { ...entry, id: 'another-trash', title: 'Morning Light' }],
    })
    renderPage()
    await screen.findByText(entry.title)
    fireEvent.click(screen.getByRole('button', { name: 'Empty trash' }))
    const dialog = screen.getByRole('dialog', {
      name: 'Empty trash permanently?',
    })
    expect(
      within(dialog).getByText(/Number of songs to permanently delete: 2/),
    ).toHaveTextContent('This cannot be undone.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mocks.provider.emptySongTrash).not.toHaveBeenCalled()
    expect(mocks.provider.permanentlyDeleteSongFromTrash).not.toHaveBeenCalled()
  })

  it('disables duplicate submission, cancellation and other mutations while emptying', async () => {
    let resolveClear
    mocks.provider.emptySongTrash.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveClear = resolve
      }),
    )
    mocks.provider.getSongTrash
      .mockResolvedValueOnce({ data: [entry] })
      .mockResolvedValue({ data: [] })
    renderPage()
    await screen.findByText(entry.title)
    fireEvent.click(screen.getByRole('button', { name: 'Empty trash' }))
    const dialog = screen.getByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: 'Empty trash' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(confirm).toBeDisabled()
    expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Restore Blue Hours', hidden: true }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', {
        name: 'Delete permanently Blue Hours',
        hidden: true,
      }),
    ).toBeDisabled()
    expect(mocks.provider.emptySongTrash).toHaveBeenCalledOnce()
    expect(mocks.provider.emptySongTrash).toHaveBeenCalledWith([entry.id])
    await act(async () => resolveClear({ data: { deleted: 1 } }))
    expect(await screen.findByText('Trash is empty.')).toBeInTheDocument()
    expect(mocks.notify).toHaveBeenCalledWith(
      'Selected trash entries permanently deleted',
      { type: 'info' },
    )
    expect(mocks.provider.getSongTrash).toHaveBeenCalledTimes(2)
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })

  it('reconciles a partially failed clear and confirms the remaining count before retry', async () => {
    const remaining = {
      ...entry,
      id: 'remaining-trash',
      title: 'Morning Light',
    }
    mocks.provider.getSongTrash
      .mockResolvedValueOnce({ data: [entry, remaining] })
      .mockResolvedValueOnce({ data: [remaining] })
      .mockResolvedValue({ data: [] })
    mocks.provider.emptySongTrash.mockRejectedValueOnce({
      status: 500,
      body: { deleted: 1, error: 'Could not remove a trash file' },
    })
    renderPage()
    await screen.findByText(entry.title)
    fireEvent.click(screen.getByRole('button', { name: 'Empty trash' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Empty trash',
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Songs permanently deleted before the operation stopped: 1. Could not remove a trash file',
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByText(remaining.title)).toBeInTheDocument()
    expect(screen.queryByText(entry.title)).toBeNull()
    expect(mocks.provider.getSongTrash).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Empty trash' }))
    expect(
      within(screen.getByRole('dialog')).getByText(
        /Number of songs to permanently delete: 1/,
      ),
    ).toBeInTheDocument()
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Empty trash',
      }),
    )
    expect(await screen.findByText('Trash is empty.')).toBeInTheDocument()
    expect(mocks.provider.emptySongTrash).toHaveBeenCalledTimes(2)
    expect(mocks.provider.emptySongTrash.mock.calls).toEqual([
      [[entry.id, remaining.id]],
      [[remaining.id]],
    ])
  })

  it('only clears the confirmed IDs and reloads songs newly added to trash', async () => {
    const newlyTrashed = {
      ...entry,
      id: 'new-trash',
      title: 'Added after confirmation',
    }
    mocks.provider.getSongTrash
      .mockResolvedValueOnce({ data: [entry] })
      .mockResolvedValue({ data: [newlyTrashed] })
    renderPage()
    await screen.findByText(entry.title)
    fireEvent.click(screen.getByRole('button', { name: 'Empty trash' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Empty trash',
      }),
    )
    expect(await screen.findByText(newlyTrashed.title)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mocks.provider.emptySongTrash).toHaveBeenCalledWith([entry.id])
    expect(screen.queryByText(entry.title)).toBeNull()
    expect(screen.getByRole('button', { name: 'Empty trash' })).toBeEnabled()
    expect(mocks.notify).toHaveBeenCalledWith(
      'Selected trash entries permanently deleted',
      { type: 'info' },
    )
  })

  it('shows a loading state, retries a failed list and handles an empty trash', async () => {
    let reject
    mocks.provider.getSongTrash.mockReturnValueOnce(
      new Promise((resolve, rejectPromise) => {
        reject = rejectPromise
      }),
    )
    renderPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
    reject(new Error('Trash service unavailable'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Trash service unavailable',
    )
    mocks.provider.getSongTrash.mockResolvedValueOnce({ data: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Trash is empty.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Empty trash' })).toBeDisabled()
    expect(mocks.provider.getSongTrash).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['zh-Hans', '恢复', '永久删除', '永久清空回收站？', '无法恢复'],
    ['zh-Hant', '復原', '永久刪除', '永久清空回收站？', '無法復原'],
  ])(
    'localizes the page and irreversible confirmation for %s',
    async (locale, restoreLabel, deleteLabel, clearTitle, warning) => {
      mocks.locale = locale
      renderPage()
      expect(
        screen.getByRole('heading', { name: '回收站' }),
      ).toBeInTheDocument()
      expect(
        await screen.findByRole('button', {
          name: `${restoreLabel} Blue Hours`,
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: `${deleteLabel} Blue Hours` }),
      ).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: '清空回收站' }))
      const dialog = screen.getByRole('dialog', { name: clearTitle })
      expect(within(dialog).getByText(/1 首歌曲/)).toHaveTextContent(warning)
    },
  )

  it('exposes the navigation entry only to administrators', () => {
    mocks.permissions = 'regular'
    const { rerender } = render(
      <MemoryRouter>
        <TrashMenuItem />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link', { name: 'Trash' })).toBeNull()
    mocks.permissions = 'admin'
    rerender(
      <MemoryRouter>
        <TrashMenuItem />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Trash' })).toHaveAttribute(
      'href',
      '/trash',
    )
    expect(mocks.provider.getSongTrash).not.toHaveBeenCalled()
  })
})
