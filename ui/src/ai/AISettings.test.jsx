import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AISettings from './AISettings'

const mocks = vi.hoisted(() => ({
  permissions: 'admin',
  provider: { getAISettings: vi.fn(), updateAISettings: vi.fn() },
}))
vi.mock('react-admin', () => ({
  Title: () => null,
  useLocale: () => 'en',
  usePermissions: () => ({ permissions: mocks.permissions, loading: false }),
  useDataProvider: () => mocks.provider,
}))

describe('AI settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.permissions = 'admin'
    mocks.provider.getAISettings.mockResolvedValue({
      data: {
        enabled: true,
        endpoint: 'https://provider.example/v1',
        model: 'fixture',
        keyConfigured: true,
      },
    })
    mocks.provider.updateAISettings.mockResolvedValue({
      data: {
        enabled: true,
        endpoint: 'https://provider.example/v1',
        model: 'new-model',
        keyConfigured: true,
      },
    })
  })
  it('blocks non-admin users before requesting settings', () => {
    mocks.permissions = 'user'
    render(<AISettings />)
    expect(screen.getByRole('alert')).toHaveTextContent('Only administrators')
    expect(mocks.provider.getAISettings).not.toHaveBeenCalled()
  })
  it('never displays a saved key and clears a new key from the form after save', async () => {
    render(<AISettings />)
    const model = await screen.findByLabelText(/Model name/)
    expect(screen.getByLabelText('API key')).toHaveValue('')
    expect(screen.getByText(/A key is saved/)).toBeInTheDocument()
    fireEvent.change(model, { target: { value: 'new-model' } })
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'fixture-new-private-key' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await screen.findByRole('status')
    expect(mocks.provider.updateAISettings).toHaveBeenCalledWith('ai', {
      data: {
        enabled: true,
        endpoint: 'https://provider.example/v1',
        model: 'new-model',
        apiKey: 'fixture-new-private-key',
        clearKey: false,
      },
    })
    expect(screen.getByLabelText('API key')).toHaveValue('')
  })
  it('supports explicit removal without resending the typed key', async () => {
    render(<AISettings />)
    await screen.findByLabelText('API key')
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'unused' },
    })
    fireEvent.click(screen.getByLabelText('Remove saved API key'))
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() =>
      expect(mocks.provider.updateAISettings).toHaveBeenCalled(),
    )
    expect(mocks.provider.updateAISettings.mock.calls[0][1]).toMatchObject({
      data: { apiKey: '', clearKey: true },
    })
  })
  it('shows a retry when loading fails and handles provider errors without exposing response bodies', async () => {
    mocks.provider.getAISettings.mockRejectedValueOnce(
      new Error('private provider details'),
    )
    render(<AISettings />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByLabelText(/Model name/)
    mocks.provider.updateAISettings.mockRejectedValueOnce(
      new Error('sensitive response'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save')
    expect(screen.queryByText(/sensitive response/)).not.toBeInTheDocument()
  })
})
