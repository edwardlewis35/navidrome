import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AuthContext, DataProviderContext } from 'react-admin'
import { TestContext } from 'ra-test'
import { describe, expect, it, vi } from 'vitest'
import AIRecommendations from '../ai/AIRecommendations'
import { playerReducer } from '../reducers/playerReducer'
import { createAIDataProvider } from './aiDataProvider'

// The provider hook and player reducer stay real. Cover loading is unrelated
// to this test; it must not cause network calls from the generated song fixture.
vi.mock('../common/Artwork', () => ({
  Artwork: ({ title }) => <img alt={title} />,
}))

const daily = {
  configured: true,
  state: 'ready',
  date: '2026-10-25',
  nextRunAt: '2026-10-26T03:00:00+08:00',
  stale: false,
  recommendations: [
    {
      song: {
        id: 'saved-local',
        title: 'Daily local song',
        artist: 'Fixture artist',
      },
      reason: 'Saved musical match',
    },
  ],
  externalRecommendations: [
    {
      title: 'Daily external song',
      artist: 'External fixture artist',
      reason: 'Saved external match',
    },
  ],
}

describe('daily AI recommendations through the real react-admin provider', () => {
  it('fetches only the saved endpoint and preserves existing local playback', async () => {
    let store
    const http = vi.fn(async (url, options) => {
      if (url !== '/api/ai/daily' || options !== undefined)
        throw new Error('The daily page must only read cached results')
      return { json: daily }
    })
    render(
      <AuthContext.Provider
        value={{
          getPermissions: () => Promise.resolve('user'),
          checkError: () => Promise.resolve(),
        }}
      >
        <DataProviderContext.Provider value={createAIDataProvider(http)}>
          <TestContext
            enableReducers
            customReducers={{ player: playerReducer }}
            initialState={{ admin: { ui: { optimistic: false } } }}
          >
            {(context) => {
              store = context.store
              return <AIRecommendations />
            }}
          </TestContext>
        </DataProviderContext.Provider>
      </AuthContext.Provider>,
    )
    await screen.findByText('External fixture artist')
    expect(http).toHaveBeenCalledExactlyOnceWith('/api/ai/daily')
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button', { name: /Analyze/ })).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: 'Play Daily local song' }),
    )
    await waitFor(() => expect(store.getState().player.queue).toHaveLength(1))
    expect(store.getState().player.queue[0]).toMatchObject({
      trackId: 'saved-local',
      song: { title: 'Daily local song' },
    })
    expect(
      screen.queryByRole('button', { name: 'Play Daily external song' }),
    ).toBeNull()
    expect(http).toHaveBeenCalledTimes(1)
  })
})
