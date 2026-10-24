import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OnlineCoverDialog from './OnlineCoverDialog'
import { MemoryRouter } from 'react-router-dom'
const mocks = vi.hoisted(() => ({
  provider: { searchOnlineCovers: vi.fn(), applyOnlineCover: vi.fn() },
  notify: vi.fn(),
  refresh: vi.fn(),
  permissions: 'regular',
  permissionsLoading: false,
}))
vi.mock('react-admin', () => ({
  useDataProvider: () => mocks.provider,
  useNotify: () => mocks.notify,
  useRefresh: () => mocks.refresh,
  useLocale: () => 'en',
  usePermissions: () => ({
    permissions: mocks.permissions,
    loading: mocks.permissionsLoading,
  }),
}))
const cover = {
  id: 'release-one',
  title: 'Matching release',
  artist: 'Fixture artist',
  year: '2020',
  previewUrl: 'https://coverartarchive.org/release/fixture/front-250',
  sourceUrl: 'https://musicbrainz.org/release/fixture',
}
const props = () => ({
  kind: 'playlist',
  id: 'playlist-one',
  initialQuery: 'My playlist',
  open: true,
  onClose: vi.fn(),
})
const search = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Search covers' }))
describe('online cover selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.permissions = 'regular'
    mocks.permissionsLoading = false
    mocks.provider.searchOnlineCovers.mockResolvedValue({
      data: { candidates: [cover] },
    })
    mocks.provider.applyOnlineCover.mockResolvedValue({ data: { saved: true } })
  })
  it('opens and closes without sending metadata or requesting the catalogue', () => {
    const settings = props()
    render(<OnlineCoverDialog {...settings} />)
    expect(
      screen.getByRole('textbox', { name: 'Album or playlist name' }),
    ).toHaveValue('My playlist')
    expect(
      screen.getByText(/Search sends the name and artist to MusicBrainz/),
    ).toBeInTheDocument()
    expect(mocks.provider.searchOnlineCovers).not.toHaveBeenCalled()
    expect(mocks.provider.applyOnlineCover).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(settings.onClose).toHaveBeenCalledOnce()
    expect(mocks.provider.searchOnlineCovers).not.toHaveBeenCalled()
  })
  it('searches metadata only after explicit submission, accepts edited words and applies the selected release ID', async () => {
    const settings = props()
    render(<OnlineCoverDialog {...settings} />)
    search()
    await screen.findByText('Matching release')
    expect(mocks.provider.searchOnlineCovers).toHaveBeenCalledWith('playlist', {
      id: 'playlist-one',
      query: '',
    })
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Album or playlist name' }),
      { target: { value: '  Different album  ' } },
    )
    search()
    await waitFor(() =>
      expect(mocks.provider.searchOnlineCovers).toHaveBeenLastCalledWith(
        'playlist',
        { id: 'playlist-one', query: 'Different album' },
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Use this cover' }))
    await waitFor(() => expect(settings.onClose).toHaveBeenCalledOnce())
    expect(mocks.provider.applyOnlineCover).toHaveBeenCalledOnce()
    expect(mocks.provider.applyOnlineCover).toHaveBeenCalledWith('playlist', {
      id: 'playlist-one',
      releaseId: cover.id,
    })
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(mocks.notify).toHaveBeenCalledWith(
      'Cover saved; refreshing artwork',
      { type: 'info' },
    )
  })
  it('shows search and save failures, permits retry and stays open after failures', async () => {
    mocks.provider.searchOnlineCovers.mockRejectedValueOnce(
      new Error('offline'),
    )
    mocks.provider.applyOnlineCover.mockRejectedValueOnce(
      new Error('save failed'),
    )
    const settings = props()
    render(<OnlineCoverDialog {...settings} />)
    search()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cover catalogue is unavailable. Please retry later.',
    )
    expect(settings.onClose).not.toHaveBeenCalled()
    search()
    await screen.findByText('Matching release')
    fireEvent.click(screen.getByRole('button', { name: 'Use this cover' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save the cover. Please retry.',
    )
    expect(settings.onClose).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Use this cover' }))
    await waitFor(() => expect(settings.onClose).toHaveBeenCalledOnce())
    expect(mocks.provider.applyOnlineCover).toHaveBeenCalledTimes(2)
  })
  it('blocks duplicate searches, duplicate applies and dismissals while pending', async () => {
    let finishSearch
    mocks.provider.searchOnlineCovers.mockReturnValueOnce(
      new Promise((resolve) => {
        finishSearch = resolve
      }),
    )
    const settings = props()
    render(<OnlineCoverDialog {...settings} />)
    search()
    fireEvent.submit(
      screen
        .getByRole('textbox', { name: 'Album or playlist name' })
        .closest('form'),
    )
    expect(mocks.provider.searchOnlineCovers).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Search covers' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
    await act(async () => finishSearch({ data: { candidates: [cover] } }))
    let finishApply
    mocks.provider.applyOnlineCover.mockReturnValueOnce(
      new Promise((resolve) => {
        finishApply = resolve
      }),
    )
    const apply = screen.getByRole('button', { name: 'Use this cover' })
    fireEvent.click(apply)
    fireEvent.click(apply)
    expect(mocks.provider.applyOnlineCover).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
      code: 'Escape',
    })
    expect(settings.onClose).not.toHaveBeenCalled()
    await act(async () => finishApply({ data: { saved: true } }))
    expect(settings.onClose).toHaveBeenCalledOnce()
  })
  it('ignores stale searches when the target changes and resets the visible query', async () => {
    let finish
    mocks.provider.searchOnlineCovers.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const settings = props()
    const { rerender } = render(<OnlineCoverDialog {...settings} />)
    search()
    rerender(
      <OnlineCoverDialog
        {...settings}
        id="playlist-two"
        initialQuery="Other playlist"
      />,
    )
    await act(async () => finish({ data: { candidates: [cover] } }))
    expect(screen.queryByText('Matching release')).toBeNull()
    expect(
      screen.getByRole('textbox', { name: 'Album or playlist name' }),
    ).toHaveValue('Other playlist')
    expect(mocks.provider.searchOnlineCovers).toHaveBeenCalledOnce()
  })

  it.each([
    [400, 'Search again and choose a cover.'],
    [429, 'Cover service is busy.'],
    [502, 'Could not connect to the cover service.'],
  ])(
    'uses safe messages for status %s without exposing provider details',
    async (status, message) => {
      mocks.provider.searchOnlineCovers.mockRejectedValueOnce({
        status,
        message: 'private-provider-response',
        body: { error: 'private-provider-response' },
      })
      render(<OnlineCoverDialog {...props()} />)
      search()
      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(
        screen.queryByText(/private-provider-response/),
      ).not.toBeInTheDocument()
    },
  )

  it.each([
    ['admin', false, true],
    ['admin', true, false],
    ['regular', false, false],
  ])(
    'shows the proxy settings link only for loaded admin permissions',
    async (permissions, loading, visible) => {
      mocks.permissions = permissions
      mocks.permissionsLoading = loading
      render(
        <MemoryRouter>
          <OnlineCoverDialog {...props()} />
        </MemoryRouter>,
      )
      const link = screen.queryByRole('link', { name: 'Cover proxy settings' })
      if (visible) expect(link).toHaveAttribute('href', '/covers/settings')
      else expect(link).not.toBeInTheDocument()
    },
  )
})
