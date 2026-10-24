import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EnglishRadioPage from './EnglishRadioPage'

const mocks = vi.hoisted(() => ({
  permissions: 'user',
  dispatch: vi.fn(),
  provider: {
    getEnglishRadioCatalog: vi.fn(),
    getEnglishRadioSettings: vi.fn(),
    updateEnglishRadioSettings: vi.fn(),
    playEnglishRadio: vi.fn(),
  },
}))
vi.mock('react-admin', () => ({
  Title: () => null,
  useDataProvider: () => mocks.provider,
  usePermissions: () => ({ permissions: mocks.permissions, loading: false }),
  useLocale: () => 'en',
}))
vi.mock('react-redux', () => ({ useDispatch: () => mocks.dispatch }))

describe('English radio page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.permissions = 'user'
    mocks.provider.getEnglishRadioCatalog.mockResolvedValue({
      data: {
        stations: [
          {
            id: 'heart-london',
            name: 'Heart London',
            description: 'London pop',
            homePageUrl: 'https://www.heart.co.uk/london/',
            sourceUrl:
              'https://www.heart.co.uk/radio/how-to-listen/getting-started/',
          },
        ],
      },
    })
    mocks.provider.playEnglishRadio.mockResolvedValue({
      data: { streamUrl: '/music/api/english-radio/stream/heart-london' },
    })
    mocks.provider.getEnglishRadioSettings.mockResolvedValue({
      data: { proxy: '' },
    })
    mocks.provider.updateEnglishRadioSettings.mockImplementation(
      (_resource, { data }) => Promise.resolve({ data }),
    )
  })

  it('only opens audio after a click and uses the existing radio player', async () => {
    render(<EnglishRadioPage />)
    const play = await screen.findByRole('button', {
      name: 'Play Heart London',
    })
    expect(mocks.provider.playEnglishRadio).not.toHaveBeenCalled()
    expect(mocks.dispatch).not.toHaveBeenCalled()
    expect(mocks.provider.getEnglishRadioSettings).not.toHaveBeenCalled()
    expect(
      screen.getByRole('link', { name: 'Station source' }),
    ).toHaveAttribute(
      'href',
      'https://www.heart.co.uk/radio/how-to-listen/getting-started/',
    )
    fireEvent.click(play)
    await waitFor(() => expect(mocks.dispatch).toHaveBeenCalled())
    expect(mocks.provider.playEnglishRadio).toHaveBeenCalledWith('heart-london')
    expect(mocks.dispatch.mock.calls[0][0]).toMatchObject({
      data: {
        isRadio: true,
        id: 'heart-london',
        streamUrl: '/music/api/english-radio/stream/heart-london',
      },
    })
  })

  it('exposes radio-only proxy settings to administrators', async () => {
    mocks.permissions = 'admin'
    render(<EnglishRadioPage />)
    const proxy = await screen.findByLabelText('Radio proxy address')
    fireEvent.change(proxy, { target: { value: ' http://192.168.8.10:7891 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.')
    expect(mocks.provider.updateEnglishRadioSettings).toHaveBeenCalledWith(
      'english-radio',
      { data: { proxy: 'http://192.168.8.10:7891' } },
    )
    expect(mocks.provider.playEnglishRadio).not.toHaveBeenCalled()
  })

  it('reports failures without dispatching a broken stream', async () => {
    mocks.provider.playEnglishRadio.mockRejectedValueOnce(
      new Error('internal details'),
    )
    render(<EnglishRadioPage />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Play Heart London' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not play')
    expect(screen.queryByText(/internal details/)).toBeNull()
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })
})
