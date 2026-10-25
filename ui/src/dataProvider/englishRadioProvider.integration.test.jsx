import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AuthContext, DataProviderContext, useDataProvider } from 'react-admin'
import { TestContext } from 'ra-test'
import { describe, expect, it, vi } from 'vitest'
import { createEnglishRadioProvider } from './englishRadioProvider'

function Actions() {
  const provider = useDataProvider()
  return (
    <button
      onClick={async () => {
        await provider.getEnglishRadioCatalog()
        await provider.getEnglishRadioSettings()
        await provider.updateEnglishRadioSettings('english-radio', {
          data: { proxy: 'http://127.0.0.1:7891' },
        })
        await provider.playEnglishRadio('heart-london')
      }}
    >
      Run
    </button>
  )
}

describe('English radio through the real react-admin provider hook', () => {
  it('preserves proxy payloads and station IDs without exposing playback tickets', async () => {
    const http = vi.fn().mockResolvedValue({
      json: {
        stations: [],
        proxy: '',
        streamUrl: '/api/english-radio/stream/heart-london',
      },
    })
    render(
      <AuthContext.Provider value={{ checkError: () => Promise.resolve() }}>
        <DataProviderContext.Provider value={createEnglishRadioProvider(http)}>
          <TestContext initialState={{ admin: { ui: { optimistic: false } } }}>
            <Actions />
          </TestContext>
        </DataProviderContext.Provider>
      </AuthContext.Provider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(http).toHaveBeenCalledTimes(4))
    expect(http.mock.calls.map(([url]) => url)).toEqual([
      '/api/english-radio/catalog',
      '/api/english-radio/settings',
      '/api/english-radio/settings',
      '/api/english-radio/play/heart-london',
    ])
    expect(JSON.parse(http.mock.calls[2][1].body)).toEqual({
      proxy: 'http://127.0.0.1:7891',
    })
    expect(http.mock.calls[3][1]).toEqual({ method: 'POST' })
  })
})
