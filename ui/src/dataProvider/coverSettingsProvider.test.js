import { describe, expect, it, vi } from 'vitest'
import { createCoverSettingsProvider } from './coverSettingsProvider'

describe('cover settings provider', () => {
  it('reads and updates the cover-only endpoint using react-admin payloads', async () => {
    const httpClient = vi.fn().mockResolvedValue({
      json: { proxy: 'http://127.0.0.1:7890', source: 'saved' },
    })
    const provider = createCoverSettingsProvider(httpClient)
    await provider.getOnlineCoverSettings()
    expect(httpClient).toHaveBeenLastCalledWith('/api/online-cover/settings')
    const result = await provider.updateOnlineCoverSettings('online-cover', {
      data: { proxy: 'http://127.0.0.1:7890' },
    })
    const [url, options] = httpClient.mock.calls[1]
    expect(url).toBe('/api/online-cover/settings')
    expect(options.method).toBe('PUT')
    expect(options.headers.get('Content-Type')).toBe('application/json')
    expect(JSON.parse(options.body)).toEqual({ proxy: 'http://127.0.0.1:7890' })
    expect(result.data.source).toBe('saved')
  })
})
