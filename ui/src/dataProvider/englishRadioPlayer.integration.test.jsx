import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AuthContext, DataProviderContext } from 'react-admin'
import { TestContext } from 'ra-test'
import { describe, expect, it, vi } from 'vitest'
import EnglishRadioPage from '../radio/EnglishRadioPage'
import { playerReducer } from '../reducers/playerReducer'
import { createEnglishRadioProvider } from './englishRadioProvider'

const station = {
  id: 'heart-london',
  name: 'Heart London',
  description: 'London pop',
  sourceUrl: 'https://www.heart.co.uk/london/',
}

const renderRadio = (role = 'admin') => {
  let store
  const http = vi.fn(async (url, options) => {
    if (url.endsWith('/catalog')) return { json: { stations: [station] } }
    if (url.endsWith('/settings'))
      return { json: options ? JSON.parse(options.body) : { proxy: '' } }
    if (url.endsWith('/play/heart-london'))
      return { json: { streamUrl: '/api/english-radio/stream/heart-london' } }
    throw new Error('Unexpected fixture endpoint')
  })
  render(
    <AuthContext.Provider
      value={{
        getPermissions: () => Promise.resolve(role),
        checkError: () => Promise.resolve(),
      }}
    >
      <DataProviderContext.Provider value={createEnglishRadioProvider(http)}>
        <TestContext
          enableReducers
          customReducers={{ player: playerReducer }}
          initialState={{ admin: { ui: { optimistic: false } } }}
        >
          {(context) => {
            store = context.store
            return <EnglishRadioPage />
          }}
        </TestContext>
      </DataProviderContext.Provider>
    </AuthContext.Provider>,
  )
  return { http, getStore: () => store }
}

describe('English radio through the real react-admin provider and music player', () => {
  it('saves the dedicated proxy and puts the same-origin stream into the existing player', async () => {
    const { http, getStore } = renderRadio()
    const proxy = await screen.findByLabelText('Radio proxy address')
    fireEvent.change(proxy, { target: { value: ' http://127.0.0.1:7890 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await screen.findByRole('status')
    const update = http.mock.calls.find(
      ([, options]) => options?.method === 'PUT',
    )
    expect(update[0]).toBe('/api/english-radio/settings')
    expect(JSON.parse(update[1].body)).toEqual({
      proxy: 'http://127.0.0.1:7890',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Play Heart London' }))
    await waitFor(() =>
      expect(getStore().getState().player.queue).toHaveLength(1),
    )
    expect(getStore().getState().player.queue[0]).toMatchObject({
      trackId: 'heart-london',
      isRadio: true,
      musicSrc: '/api/english-radio/stream/heart-london',
      song: { title: 'Heart London' },
    })
    expect(
      http.mock.calls.filter(([, options]) => options?.method === 'POST'),
    ).toEqual([['/api/english-radio/play/heart-london', { method: 'POST' }]])
  })

  it('lets a regular listener play without reading administrator proxy settings', async () => {
    const { http, getStore } = renderRadio('user')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Play Heart London' }),
    )
    await waitFor(() =>
      expect(getStore().getState().player.queue).toHaveLength(1),
    )
    expect(screen.queryByLabelText('Radio proxy address')).toBeNull()
    expect(http.mock.calls.some(([url]) => url.endsWith('/settings'))).toBe(
      false,
    )
  })
})
