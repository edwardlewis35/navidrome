import { describe, expect, it, vi } from 'vitest'
import { createOnlineCoverProvider } from './onlineCoverProvider'
describe('online cover provider', () => {
  it('posts only the selected entity and explicit search words', async () => {
    const candidates = [{ id: 'release-uuid', title: 'Album' }]
    const http = vi.fn().mockResolvedValue({ json: { candidates } })
    const provider = createOnlineCoverProvider(http)
    await expect(
      provider.searchOnlineCovers('song', 'song/id', 'Album words'),
    ).resolves.toEqual({ data: { candidates } })
    const [url, options] = http.mock.calls[0]
    expect(url).toBe('/api/online-cover/search')
    expect(options.method).toBe('POST')
    expect(options.headers.get('Content-Type')).toBe('application/json')
    expect(JSON.parse(options.body)).toEqual({
      kind: 'song',
      id: 'song/id',
      query: 'Album words',
    })
  })
  it('applies a release ID without forwarding a candidate image URL or metadata', async () => {
    const http = vi
      .fn()
      .mockResolvedValue({ json: { id: 'playlist-one', saved: true } })
    const provider = createOnlineCoverProvider(http)
    await expect(
      provider.applyOnlineCover('playlist', 'playlist-one', 'release-uuid'),
    ).resolves.toEqual({ data: { id: 'playlist-one', saved: true } })
    const [url, options] = http.mock.calls[0]
    expect(url).toBe('/api/online-cover/apply')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({
      kind: 'playlist',
      id: 'playlist-one',
      releaseId: 'release-uuid',
    })
    expect(options.body).not.toContain('http')
  })
  it('propagates API and network failures so the dialog can stay open and retry', async () => {
    const error = { status: 403, body: { error: 'Cannot update' } }
    const http = vi.fn().mockRejectedValue(error)
    const provider = createOnlineCoverProvider(http)
    await expect(provider.searchOnlineCovers('album', 'a', '')).rejects.toBe(
      error,
    )
    await expect(provider.applyOnlineCover('album', 'a', 'r')).rejects.toBe(
      error,
    )
  })
})
