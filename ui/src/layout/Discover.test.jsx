import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ThemeProvider, createTheme } from '@material-ui/core/styles'
import { Router } from 'react-router-dom'
import { createMemoryHistory } from 'history'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Discover from './Discover'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getList: vi.fn(),
  dispatch: vi.fn(),
  refreshEvents: vi.fn(),
  state: { library: { selectedLibraries: [] } },
  responses: {},
}))

vi.mock('react-admin', () => ({
  Title: () => null,
  useLocale: () => 'en',
  useQueryWithStore: (query) => mocks.query(query),
  useDataProvider: () => ({ getList: mocks.getList }),
}))
vi.mock('../ai/AIRecommendations', () => ({
  default: () => <section aria-label="AI music" />,
}))
vi.mock('react-redux', () => ({
  useSelector: (selector) => selector(mocks.state),
  useDispatch: () => mocks.dispatch,
}))
vi.mock('../common/Artwork', () => ({
  Artwork: ({ title }) => <img alt={title} />,
}))
vi.mock('../common/useRefreshOnEvents', () => ({
  useRefreshOnEvents: (options) => mocks.refreshEvents(options),
}))

const renderDiscovery = (cloudMusic = true) => {
  const history = createMemoryHistory()
  const result = render(
    <Router history={history}>
      <ThemeProvider theme={createTheme({ cloudMusic })}>
        <Discover />
      </ThemeProvider>
    </Router>,
  )
  return { ...result, history }
}

describe('music discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state = { library: { selectedLibraries: [] } }
    mocks.responses = {}
    mocks.query.mockImplementation(({ payload }) => {
      const response = mocks.responses[payload.sort.field]
      return response || { data: [], loading: false, refetch: vi.fn() }
    })
  })

  it('queries each collection with the selected library and existing API sort/filter names', () => {
    mocks.state.library.selectedLibraries = [
      'library-jazz',
      'library-classical',
    ]
    renderDiscovery()

    const queries = mocks.query.mock.calls.map(([query]) => query)
    expect(queries).toHaveLength(3)
    queries.forEach((query) => {
      expect(query.type).toBe('getList')
      expect(query.resource).toBe('album')
      expect(query.payload.pagination).toEqual({ page: 1, perPage: 6 })
      expect(query.payload.filter.library_id).toEqual([
        'library-jazz',
        'library-classical',
      ])
    })
    expect(queries[0].payload.sort.field).toBe('random')
    expect(queries[0].payload.filter.seed).toBeTruthy()
    expect(queries[1].payload.sort).toEqual({
      field: 'recently_added',
      order: 'DESC',
    })
    expect(queries[2].payload.sort).toEqual({
      field: 'play_date',
      order: 'DESC',
    })
    expect(queries[2].payload.filter.recently_played).toBe(true)
    expect(
      screen.getByRole('button', { name: 'Explore your collection' }),
    ).toHaveAttribute('href', '/album/random')
    expect(
      screen.getByRole('button', { name: 'Listen again' }),
    ).toHaveAttribute('href', '/album/recentlyPlayed')
  })

  it('opens album details and plays through the original song query and player action', async () => {
    const album = {
      id: 'album-1',
      name: 'Blue Hours',
      artist: 'Evening Quartet',
    }
    const song = { id: 'song-1', title: 'First Light' }
    const missingSong = {
      id: 'missing-song',
      title: 'Unavailable',
      missing: true,
    }
    mocks.responses.random = {
      data: [album, { id: 'album-missing', name: 'Offline', missing: true }],
      loading: false,
    }
    mocks.getList.mockResolvedValue({ data: [song, missingSong] })
    const { history } = renderDiscovery()

    // Missing albums remain browsable but cannot start playback.
    expect(screen.getAllByRole('button', { name: 'play' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'play' }))
    await waitFor(() =>
      expect(mocks.dispatch).toHaveBeenCalledWith({
        type: 'PLAYER_PLAY_TRACKS',
        id: song.id,
        data: { [song.id]: song },
      }),
    )
    expect(mocks.getList).toHaveBeenCalledWith('song', {
      pagination: { page: 1, perPage: -1 },
      sort: { field: 'album', order: 'ASC' },
      filter: { album_id: album.id, disc_number: undefined },
    })
    expect(history.location.pathname).toBe('/')

    fireEvent.click(screen.getAllByRole('link', { name: album.name })[0])
    expect(history.location.pathname).toBe('/album/album-1/show')
  })

  it('offers retry on errors and explains empty library and listening history states', () => {
    const refetch = vi.fn()
    mocks.responses.random = {
      error: new Error('Music server unavailable'),
      loading: false,
      refetch,
    }
    renderDiscovery()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load your music. Please try again.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refetch).toHaveBeenCalledOnce()
    expect(
      screen.getByText('Your next favourite is waiting'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Your listening story starts here.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Add music to your configured music folder/),
    ).toBeInTheDocument()
  })

  it('shows loading state instead of claiming an empty library', () => {
    mocks.query.mockReturnValue({ data: [], loading: true })
    const { container } = renderDiscovery()

    expect(container.querySelectorAll('[aria-busy="true"]')).toHaveLength(3)
    expect(screen.queryByText('Your next favourite is waiting')).toBeNull()
  })

  it('refreshes recommendations and all collections after library events', async () => {
    renderDiscovery()
    const initialSeed = mocks.query.mock.calls[0][0].payload.filter.seed

    fireEvent.click(screen.getByRole('button', { name: 'Refresh picks' }))
    let queries = mocks.query.mock.calls.slice(-3).map(([query]) => query)
    expect(queries[0].payload.filter.seed).not.toBe(initialSeed)
    expect(queries.every((query) => query.payload.refresh === 1)).toBe(true)

    const options = mocks.refreshEvents.mock.calls.at(-1)[0]
    expect(options.events).toEqual(['album', 'song', 'library'])
    await act(async () => options.onRefresh())
    queries = mocks.query.mock.calls.slice(-3).map(([query]) => query)
    expect(queries.every((query) => query.payload.refresh === 2)).toBe(true)
  })

  it('preserves the original album landing page when another theme is selected', () => {
    const { history } = renderDiscovery(false)

    expect(history.location.pathname).toBe('/album')
    expect(mocks.query).not.toHaveBeenCalled()
  })
})
