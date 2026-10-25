import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AIRecommendations from './AIRecommendations'

const mocks = vi.hoisted(() => ({
  permissions: 'admin',
  locale: 'en',
  dispatch: vi.fn(),
  provider: {
    getAIDailyRecommendations: vi.fn(),
    getAIStatus: vi.fn(),
    getList: vi.fn(),
    getAIRecommendations: vi.fn(),
  },
}))
vi.mock('react-admin', () => ({
  useLocale: () => mocks.locale,
  usePermissions: () => ({ permissions: mocks.permissions }),
  useDataProvider: () => mocks.provider,
}))
vi.mock('react-redux', () => ({ useDispatch: () => mocks.dispatch }))
vi.mock('../common/Artwork', () => ({
  Artwork: ({ title }) => <img alt={title} />,
}))

const daily = {
  configured: true,
  state: 'ready',
  date: '2026-10-25',
  generatedAt: '2026-10-25T03:00:10+08:00',
  nextRunAt: '2026-10-26T03:00:00+08:00',
  sourcePlaylistName: 'Evening jazz',
  stale: false,
  analysis: 'Warm jazz textures',
  recommendations: [
    {
      song: {
        id: 'song',
        title: 'Local song',
        artist: 'Artist',
        album: 'Album',
      },
      reason: 'Soft harmonies',
    },
  ],
  externalRecommendations: [
    {
      title: 'Come Away With Me',
      artist: 'Norah Jones',
      reason: 'Gentle piano and warm vocals',
    },
  ],
}

const renderCard = () =>
  render(
    <MemoryRouter>
      <AIRecommendations />
    </MemoryRouter>,
  )

const expectNoGeneration = () => {
  expect(mocks.provider.getAIRecommendations).not.toHaveBeenCalled()
  expect(mocks.provider.getList).not.toHaveBeenCalled()
  expect(mocks.provider.getAIStatus).not.toHaveBeenCalled()
  expect(
    screen.queryByRole('button', { name: 'Analyze and recommend' }),
  ).toBeNull()
  expect(screen.queryByRole('combobox')).toBeNull()
}

describe('saved daily AI music recommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.permissions = 'admin'
    mocks.locale = 'en'
    mocks.provider.getAIDailyRecommendations.mockResolvedValue({ data: daily })
  })
  afterEach(() => vi.useRealTimers())

  it('reads saved daily picks on mount without generating AI or listing playlists', async () => {
    renderCard()
    expect(await screen.findByText(daily.analysis)).toBeInTheDocument()
    expect(
      mocks.provider.getAIDailyRecommendations,
    ).toHaveBeenCalledExactlyOnceWith()
    expect(
      screen.getByRole('heading', { name: 'Your daily music picks' }),
    ).toBeInTheDocument()
    expect(screen.getByText('2026-10-25')).toHaveAttribute(
      'datetime',
      daily.generatedAt,
    )
    expect(screen.getByText(/Inspired by playlist:/)).toHaveTextContent(
      'Evening jazz',
    )
    expect(screen.getByText('26/10/2026, 03:00')).toHaveAttribute(
      'datetime',
      daily.nextRunAt,
    )
    expectNoGeneration()
  })

  it('plays saved local recommendations through existing player actions', async () => {
    renderCard()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Play Local song' }),
    )
    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PLAYER_PLAY_TRACKS',
        id: 'song',
      }),
    )
    expectNoGeneration()
  })

  it('shows external song titles, artists and reasons without external play buttons', async () => {
    mocks.provider.getAIDailyRecommendations.mockResolvedValue({
      data: { ...daily, recommendations: [] },
    })
    renderCard()
    expect(
      await screen.findByRole('heading', { name: 'Come Away With Me' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Norah Jones')).toBeInTheDocument()
    expect(screen.getByText('Gentle piano and warm vocals')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Play / })).toBeNull()
    expectNoGeneration()
  })

  it('shows configuration only to administrators and hides cached results when disabled', async () => {
    mocks.provider.getAIDailyRecommendations.mockResolvedValue({
      data: { ...daily, state: 'disabled', configured: false },
    })
    const { unmount } = renderCard()
    expect(
      await screen.findByRole('button', { name: 'AI settings' }),
    ).toHaveAttribute('href', '/ai/settings')
    expect(screen.queryByText(daily.analysis)).toBeNull()
    expect(screen.queryByText('Local song')).toBeNull()
    unmount()
    mocks.permissions = 'user'
    renderCard()
    expect(
      await screen.findByText(
        'Ask your administrator to connect an AI provider.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'AI settings' })).toBeNull()
    expectNoGeneration()
  })

  it('shows first-generation waiting and the next run time without an analysis action', async () => {
    mocks.provider.getAIDailyRecommendations.mockResolvedValue({
      data: {
        ...daily,
        state: 'pending',
        recommendations: [],
        externalRecommendations: [],
      },
    })
    renderCard()
    expect(await screen.findByRole('status')).toHaveTextContent(
      'prepared in the background',
    )
    expect(screen.queryByText(daily.analysis)).toBeNull()
    expect(screen.getByText('26/10/2026, 03:00')).toBeInTheDocument()
    expectNoGeneration()
  })

  it('keeps showing valid saved picks when the current daily update is stale', async () => {
    mocks.provider.getAIDailyRecommendations.mockResolvedValue({
      data: {
        ...daily,
        date: '2020-01-02',
        generatedAt: '2020-01-02T03:00:00+08:00',
        stale: true,
      },
    })
    renderCard()
    expect(await screen.findByRole('status')).toHaveTextContent(
      'last saved picks',
    )
    expect(screen.getByText(daily.analysis)).toBeInTheDocument()
    expect(screen.getByText('2020-01-02')).toHaveAttribute(
      'datetime',
      '2020-01-02T03:00:00+08:00',
    )
    expect(
      screen.getByRole('button', { name: 'Play Local song' }),
    ).toBeInTheDocument()
    expectNoGeneration()
  })

  it('shows background failure without exposing raw provider details or triggering a new call', async () => {
    mocks.provider.getAIDailyRecommendations.mockResolvedValue({
      data: { ...daily, state: 'failed', error: 'private provider response' },
    })
    renderCard()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'next daily update',
    )
    expect(screen.queryByText('private provider response')).toBeNull()
    expect(screen.queryByText(daily.analysis)).toBeNull()
    expectNoGeneration()
  })

  it('retries failed reads using GET only and never sends a generation request', async () => {
    mocks.provider.getAIDailyRecommendations.mockRejectedValueOnce(
      new Error('private provider detail'),
    )
    renderCard()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load your saved daily picks',
    )
    expect(screen.queryByText('private provider detail')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText(daily.analysis)
    expect(mocks.provider.getAIDailyRecommendations).toHaveBeenCalledTimes(2)
    expectNoGeneration()
  })

  it('renders cached model output as plain text', async () => {
    mocks.provider.getAIDailyRecommendations.mockResolvedValue({
      data: {
        ...daily,
        analysis: '<img src=x onerror=alert(1)>',
        recommendations: [],
        externalRecommendations: [
          {
            title: '<script>new song</script>',
            artist: '<b>New artist</b>',
            reason: '<a href="https://unexpected.example">reason</a>',
          },
        ],
      },
    })
    renderCard()
    expect(
      await screen.findByText('<img src=x onerror=alert(1)>'),
    ).toBeInTheDocument()
    expect(screen.getByText('<script>new song</script>')).toBeInTheDocument()
    expect(screen.getByText('<b>New artist</b>')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'reason' })).toBeNull()
    expect(document.querySelector('script')).toBeNull()
  })

  it.each([
    ['pending', false, 60000],
    ['ready', true, 60000],
    ['ready', false, 300000],
  ])(
    'refreshes the saved result for %s, stale=%s and stops after unmount',
    async (state, stale, delay) => {
      vi.useFakeTimers()
      mocks.provider.getAIDailyRecommendations.mockResolvedValue({
        data: { ...daily, state, stale },
      })
      let rendered
      await act(async () => {
        rendered = renderCard()
      })
      expect(mocks.provider.getAIDailyRecommendations).toHaveBeenCalledTimes(1)
      await act(async () => {
        vi.advanceTimersByTime(delay)
      })
      expect(mocks.provider.getAIDailyRecommendations).toHaveBeenCalledTimes(2)
      rendered.unmount()
      await act(async () => {
        vi.advanceTimersByTime(delay * 2)
      })
      expect(mocks.provider.getAIDailyRecommendations).toHaveBeenCalledTimes(2)
      expectNoGeneration()
    },
  )

  it('handles an empty saved result without inventing playable tracks', async () => {
    mocks.provider.getAIDailyRecommendations.mockResolvedValue({
      data: { ...daily, recommendations: [], externalRecommendations: [] },
    })
    renderCard()
    expect(
      await screen.findByText(
        'No saved songs are available to display. Your next daily picks will appear here.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Play / })).toBeNull()
  })

  it('shows the daily schedule and cached results in Chinese', async () => {
    mocks.locale = 'zh-Hans'
    renderCard()
    expect(
      await screen.findByRole('heading', { name: '每日为你精选' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('后台每天北京时间 03:00 自动更新。'),
    ).toBeInTheDocument()
    expect(screen.getByText(/2026\/10\/26/)).toHaveTextContent('03:00')
    expect(
      screen.getByRole('heading', { name: '为你推荐 · 曲库之外' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '播放 Local song' }),
    ).toBeInTheDocument()
    expectNoGeneration()
  })
})
