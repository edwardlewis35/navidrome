import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAIDataProvider } from './aiDataProvider'

describe('AI data provider', () => {
  const httpClient = vi.fn()
  const provider = createAIDataProvider(httpClient)
  beforeEach(() => {
    httpClient.mockReset()
    httpClient.mockResolvedValue({ json: { configured: true } })
  })
  it('reads readiness and masked settings from native endpoints', async () => {
    await expect(provider.getAIStatus()).resolves.toEqual({
      data: { configured: true },
    })
    await provider.getAISettings()
    expect(httpClient.mock.calls).toEqual([
      ['/api/ai/status'],
      ['/api/ai/settings'],
    ])
  })
  it('reads saved daily recommendations without a request body or mutation', async () => {
    httpClient.mockResolvedValue({
      json: { state: 'ready', date: '2026-10-25', recommendations: [] },
    })
    await expect(provider.getAIDailyRecommendations()).resolves.toEqual({
      data: { state: 'ready', date: '2026-10-25', recommendations: [] },
    })
    expect(httpClient).toHaveBeenCalledExactlyOnceWith('/api/ai/daily')
  })
  it('sends configuration only to the settings endpoint and keeps only the server response', async () => {
    const settings = {
      enabled: true,
      endpoint: 'https://provider.example/v1',
      model: 'fixture',
      apiKey: 'test-private',
      clearKey: false,
    }
    httpClient.mockResolvedValue({
      json: { enabled: true, keyConfigured: true },
    })
    const result = await provider.updateAISettings('ai', { data: settings })
    expect(httpClient).toHaveBeenCalledWith('/api/ai/settings', {
      method: 'PUT',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(settings),
    })
    expect(result).toEqual({ data: { enabled: true, keyConfigured: true } })
    expect(JSON.stringify(result)).not.toContain('test-private')
  })
  it('requests recommendations by playlist ID without passing browser metadata or credentials', async () => {
    await provider.getAIRecommendations('playlist-1')
    expect(httpClient).toHaveBeenCalledWith('/api/ai/recommendations', {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ playlistId: 'playlist-1' }),
    })
  })
})
