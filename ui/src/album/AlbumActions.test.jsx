import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ThemeProvider, createTheme } from '@material-ui/core/styles'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AlbumActions from './AlbumActions'

const { mockConfig, mockPermissions } = vi.hoisted(() => ({
  mockConfig: {
    enableSharing: false,
    enableDownloads: false,
    losslessFormats: 'FLAC,WAV',
  },
  mockPermissions: { value: 'admin' },
}))
vi.mock('../config', () => ({ default: mockConfig }))

vi.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: () => ({}),
}))

const mockRefreshMetadata = vi.fn()
const mockGetList = vi.fn()
const mockDispatch = vi.fn()
const mockNotify = vi.fn()

vi.mock('react-admin', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useNotify: () => mockNotify,
    useDataProvider: () => ({
      refreshMetadata: mockRefreshMetadata,
      getList: mockGetList,
    }),
    usePermissions: () => ({ permissions: mockPermissions.value }),
    useTranslate: () => (x) => x,
  }
})

describe('AlbumActions', () => {
  const record = { id: 'al1', name: 'Album', size: 1024 }
  const refreshLabel = 'resources.album.actions.refresh'

  beforeEach(() => {
    vi.clearAllMocks()
    mockPermissions.value = 'admin'
    mockRefreshMetadata.mockResolvedValue({ data: { id: 'al1' } })
    mockGetList.mockResolvedValue({ data: [], total: 0 })
  })

  const renderAlbumActions = () =>
    render(
      <ThemeProvider theme={createTheme()}>
        <AlbumActions record={record} ids={[]} data={{}} />
      </ThemeProvider>,
    )

  it('refreshes the album metadata for admins', async () => {
    renderAlbumActions()
    fireEvent.click(screen.getByRole('button', { name: refreshLabel }))

    await waitFor(() =>
      expect(mockRefreshMetadata).toHaveBeenCalledWith('album', 'al1'),
    )
  })

  it('hides the action for non-admin users', () => {
    mockPermissions.value = 'regular'
    renderAlbumActions()
    expect(
      screen.queryByRole('button', { name: refreshLabel }),
    ).not.toBeInTheDocument()
  })

  it('plays an entire large album using bounded batches even if only its first screen is loaded', async () => {
    const songs = Array.from({ length: 237 }, (_, index) => ({
      id: `song-${index}`,
      title: `Song ${index}`,
    }))
    mockGetList.mockImplementation((resource, { pagination }) =>
      Promise.resolve({
        data: songs.slice(
          (pagination.page - 1) * pagination.perPage,
          pagination.page * pagination.perPage,
        ),
        total: songs.length,
      }),
    )
    render(
      <ThemeProvider theme={createTheme()}>
        <AlbumActions
          record={{ ...record, songCount: 237 }}
          ids={songs.slice(0, 100).map((song) => song.id)}
          data={Object.fromEntries(
            songs.slice(0, 100).map((song) => [song.id, song]),
          )}
        />
      </ThemeProvider>,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'resources.album.actions.playAll' }),
    )
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledOnce())
    const action = mockDispatch.mock.calls[0][0]
    expect(action.type).toBe('PLAYER_PLAY_TRACKS')
    expect(Object.keys(action.data)).toHaveLength(237)
    expect(action.data['song-236']).toEqual(songs[236])
    expect(
      mockGetList.mock.calls.map(([, params]) => params.pagination),
    ).toEqual([
      { page: 1, perPage: 100 },
      { page: 2, perPage: 100 },
      { page: 3, perPage: 100 },
    ])
    mockGetList.mock.calls.forEach(([resource, params]) => {
      expect(resource).toBe('song')
      expect(params.filter).toEqual({ album_id: record.id })
    })
  })

  it('keeps already complete albums local without fetching them again', async () => {
    const songs = [
      { id: 'one', title: 'First' },
      { id: 'two', title: 'Second' },
    ]
    render(
      <ThemeProvider theme={createTheme()}>
        <AlbumActions
          record={{ ...record, songCount: 2 }}
          ids={songs.map((song) => song.id)}
          data={Object.fromEntries(songs.map((song) => [song.id, song]))}
        />
      </ThemeProvider>,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'resources.album.actions.playAll' }),
    )
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledOnce())
    expect(mockGetList).not.toHaveBeenCalled()
    expect(Object.keys(mockDispatch.mock.calls[0][0].data)).toEqual([
      'one',
      'two',
    ])
  })

  it('reports a failed whole-album request without dispatching a partial queue', async () => {
    mockGetList.mockRejectedValueOnce(new Error('Offline'))
    render(
      <ThemeProvider theme={createTheme()}>
        <AlbumActions
          record={{ ...record, songCount: 237 }}
          ids={[]}
          data={{}}
        />
      </ThemeProvider>,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'resources.album.actions.playAll' }),
    )
    await waitFor(() =>
      expect(mockNotify).toHaveBeenCalledWith('ra.page.error', 'warning'),
    )
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'resources.album.actions.playAll' }),
    ).not.toBeDisabled()
  })
})
