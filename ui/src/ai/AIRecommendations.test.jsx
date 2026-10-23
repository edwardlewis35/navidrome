import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AIRecommendations from './AIRecommendations'

const mocks = vi.hoisted(() => ({
  permissions: 'admin',
  dispatch: vi.fn(),
  provider: {
    getAIStatus: vi.fn(),
    getList: vi.fn(),
    getAIRecommendations: vi.fn(),
  },
}))
vi.mock('react-admin', () => ({
  useLocale: () => 'en',
  usePermissions: () => ({ permissions: mocks.permissions }),
  useDataProvider: () => mocks.provider,
}))
vi.mock('react-redux', () => ({ useDispatch: () => mocks.dispatch }))
vi.mock('../common/Artwork', () => ({
  Artwork: ({ title }) => <img alt={title} />,
}))

const renderCard = () =>
  render(
    <MemoryRouter>
      <AIRecommendations />
    </MemoryRouter>,
  )

describe('AI music recommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.permissions = 'admin'
    mocks.provider.getAIStatus.mockResolvedValue({ data: { configured: true } })
    mocks.provider.getList.mockResolvedValue({
      data: [{ id: 'playlist', name: 'Evening jazz' }],
      total: 1,
    })
    mocks.provider.getAIRecommendations.mockResolvedValue({
      data: {
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
      },
    })
  })
  it('shows a configuration link only for administrators', async () => {
    mocks.provider.getAIStatus.mockResolvedValue({
      data: { configured: false },
    })
    const { unmount } = renderCard()
    expect(
      await screen.findByRole('button', { name: 'AI settings' }),
    ).toHaveAttribute('href', '/ai/settings')
    expect(mocks.provider.getList).not.toHaveBeenCalled()
    unmount()
    mocks.permissions = 'user'
    renderCard()
    expect(
      await screen.findByText(
        'Ask your administrator to connect an AI provider.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'AI settings' }),
    ).not.toBeInTheDocument()
  })
  it('calls AI only after an explicit click, then plays the returned local song through existing player actions', async () => {
    renderCard()
    const button = await screen.findByRole('button', {
      name: 'Analyze and recommend',
    })
    expect(mocks.provider.getAIRecommendations).not.toHaveBeenCalled()
    expect(
      screen.getByText(/Audio files, file paths and account details stay here/),
    ).toBeInTheDocument()
    fireEvent.click(button)
    await screen.findByText('Warm jazz textures')
    expect(mocks.provider.getAIRecommendations).toHaveBeenCalledExactlyOnceWith(
      'playlist',
    )
    expect(screen.getByText('Soft harmonies')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Play Local song' }))
    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PLAYER_PLAY_TRACKS' }),
    )
  })
  it('renders model output as text and never interprets generated HTML', async () => {
    mocks.provider.getAIRecommendations.mockResolvedValue({
      data: {
        analysis: '<img src=x onerror=alert(1)>',
        recommendations: [
          {
            song: { id: 'song', title: '<script>unsafe</script>' },
            reason: '<a href="javascript:alert(1)">reason</a>',
          },
        ],
      },
    })
    renderCard()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Analyze and recommend' }),
    )
    expect(
      await screen.findByText('<img src=x onerror=alert(1)>'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'reason' }),
    ).not.toBeInTheDocument()
    expect(document.querySelector('script')).toBeNull()
  })
  it('blocks duplicate clicks, displays a bounded retry message and does not leak raw provider details', async () => {
    let reject
    mocks.provider.getAIRecommendations.mockImplementation(
      () =>
        new Promise((resolve, rejectPromise) => {
          reject = rejectPromise
        }),
    )
    renderCard()
    const button = await screen.findByRole('button', {
      name: 'Analyze and recommend',
    })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(mocks.provider.getAIRecommendations).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('button', { name: 'Listening to your taste…' }),
    ).toBeDisabled()
    reject({ body: { error: 'busy', secret: 'private' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('30 seconds')
    expect(screen.queryByText('private')).not.toBeInTheDocument()
    mocks.provider.getAIRecommendations.mockResolvedValueOnce({
      data: { recommendations: [] },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByText(/There are no other playable songs/),
    ).toBeInTheDocument()
  })
  it('shows empty playlists and recoverable initial-load errors', async () => {
    mocks.provider.getAIStatus.mockRejectedValueOnce(new Error('offline'))
    mocks.provider.getList.mockResolvedValue({ data: [], total: 0 })
    renderCard()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() =>
      expect(screen.getByText(/Create a playlist/)).toBeInTheDocument(),
    )
  })
})
