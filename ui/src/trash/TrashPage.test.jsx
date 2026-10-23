import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Link, Route } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '../i18n/en.json'
import zh from '../../../resources/i18n/zh-Hans.json'
import TrashPage from './TrashPage'
import TrashMenuItem from './TrashMenuItem'

const mocks = vi.hoisted(() => ({
  permissions: 'admin',
  permissionsLoading: false,
  locale: 'en',
  notify: vi.fn(),
  refresh: vi.fn(),
  provider: { getSongTrash: vi.fn(), restoreSongFromTrash: vi.fn() },
}))
const translate = (key) =>
  key
    .split('.')
    .reduce(
      (value, part) => value?.[part],
      mocks.locale === 'zh-Hans' ? zh : en,
    ) || key
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
    vi.clearAllMocks()
    mocks.permissions = 'admin'
    mocks.permissionsLoading = false
    mocks.locale = 'en'
    mocks.provider.getSongTrash.mockResolvedValue({ data: [entry] })
    mocks.provider.restoreSongFromTrash.mockResolvedValue({
      data: { id: entry.mediaFileId, trashId: entry.id },
    })
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
    expect(mocks.provider.getSongTrash).toHaveBeenCalledTimes(2)
  })

  it('localizes the page and restoration controls for Chinese', async () => {
    mocks.locale = 'zh-Hans'
    renderPage()
    expect(screen.getByRole('heading', { name: '回收站' })).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: '恢复 Blue Hours' }),
    ).toBeInTheDocument()
    expect(screen.getByText('原文件路径')).toBeInTheDocument()
  })

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
