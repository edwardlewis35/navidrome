import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OnlineCoverSettings from './OnlineCoverSettings'

const mocks = vi.hoisted(() => ({
  permissions: 'admin',
  loading: false,
  provider: {
    getOnlineCoverSettings: vi.fn(),
    updateOnlineCoverSettings: vi.fn(),
  },
}))
vi.mock('react-admin', () => ({
  Title: () => null,
  useLocale: () => 'en',
  usePermissions: () => mocks,
  useDataProvider: () => mocks.provider,
}))

describe('cover proxy settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.permissions = 'admin'
    mocks.loading = false
    mocks.provider.getOnlineCoverSettings.mockResolvedValue({
      data: { proxy: 'http://192.168.8.10:7891', source: 'server' },
    })
    mocks.provider.updateOnlineCoverSettings.mockImplementation(
      (_resource, { data }) =>
        Promise.resolve({ data: { ...data, source: 'saved' } }),
    )
  })

  it.each(['user', undefined])(
    'does not load settings for %s',
    (permissions) => {
      mocks.permissions = permissions
      render(<OnlineCoverSettings />)
      expect(screen.getByRole('alert')).toHaveTextContent('Only administrators')
      expect(mocks.provider.getOnlineCoverSettings).not.toHaveBeenCalled()
    },
  )

  it('waits for permissions', () => {
    mocks.loading = true
    render(<OnlineCoverSettings />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(mocks.provider.getOnlineCoverSettings).not.toHaveBeenCalled()
  })

  it('loads the server default and saves a trimmed cover-only override', async () => {
    render(<OnlineCoverSettings />)
    const field = await screen.findByLabelText('Cover proxy address')
    expect(field).toHaveValue('http://192.168.8.10:7891')
    expect(screen.getByText(/server cover proxy setting/)).toBeInTheDocument()
    fireEvent.change(field, { target: { value: ' http://127.0.0.1:7890 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.')
    expect(mocks.provider.updateOnlineCoverSettings).toHaveBeenCalledWith(
      'online-cover',
      { data: { proxy: 'http://127.0.0.1:7890' } },
    )
    expect(screen.queryByText(/server cover proxy setting/)).toBeNull()
  })

  it('saves an explicit empty proxy for direct connections', async () => {
    render(<OnlineCoverSettings />)
    fireEvent.change(await screen.findByLabelText('Cover proxy address'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await screen.findByRole('status')
    expect(mocks.provider.updateOnlineCoverSettings).toHaveBeenCalledWith(
      'online-cover',
      { data: { proxy: '' } },
    )
  })

  it('retries failed loads and reports validation errors without leaking responses', async () => {
    mocks.provider.getOnlineCoverSettings.mockRejectedValueOnce(
      new Error('internal'),
    )
    render(<OnlineCoverSettings />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByLabelText('Cover proxy address')
    mocks.provider.updateOnlineCoverSettings.mockRejectedValueOnce({
      status: 400,
      body: 'sensitive-response',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'without credentials',
    )
    expect(screen.queryByText('sensitive-response')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
