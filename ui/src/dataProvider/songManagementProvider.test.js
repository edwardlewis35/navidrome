import { describe, it, expect, vi } from 'vitest'
import { createSongManagementProvider } from './songManagementProvider'

describe('administrator song management provider', () => {
  it('posts the confirmed frozen selection and preserves per-song results', async () => {
    const result = {
      completed: 1,
      failed: 1,
      results: [
        { id: 'one', status: 'deleted' },
        { id: 'two', status: 'pending', trashId: 'trash' },
      ],
    }
    const http = vi.fn().mockResolvedValue({ json: result })
    await expect(
      createSongManagementProvider(http).manageSongs(
        ['one', 'two'],
        'permanent',
      ),
    ).resolves.toEqual({ data: result })
    const [url, options] = http.mock.calls[0]
    expect(url).toBe('/api/song/batch')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({
      ids: ['one', 'two'],
      mode: 'permanent',
      confirm: true,
    })
  })
  it('uploads FormData without setting its boundary and encodes the destination', async () => {
    const http = vi
      .fn()
      .mockResolvedValue({ json: { saved: true, scanComplete: false } })
    const file = new File(['fLaC audio'], '歌曲.flac', { type: 'audio/flac' })
    const provider = createSongManagementProvider(http)
    await provider.uploadMusic(1, 'Artist/Album', file)
    const [url, options] = http.mock.calls[0]
    expect(url).toBe('/api/library/1/upload?folder=Artist%2FAlbum')
    expect(options.headers.has('Content-Type')).toBe(false)
    expect(options.body.get('file').name).toBe('歌曲.flac')
    await provider.scanUploadedMusic(1, 'Artist/Album')
    expect(http).toHaveBeenLastCalledWith(
      '/api/library/1/upload/scan?folder=Artist%2FAlbum',
      { method: 'POST' },
    )
  })
})
