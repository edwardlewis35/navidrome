import { REST_URL } from '../consts'

export const createSongManagementProvider = (httpClient) => ({
  manageSongs: (ids, mode) =>
    httpClient(`${REST_URL}/song/batch`, {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ids, mode, confirm: true }),
    }).then(({ json }) => ({ data: json })),
  uploadMusic: (libraryId, folder, file) => {
    const body = new FormData()
    body.append('file', file)
    return httpClient(
      `${REST_URL}/library/${encodeURIComponent(libraryId)}/upload?folder=${encodeURIComponent(folder || '')}`,
      {
        method: 'POST',
        headers: new Headers({ Accept: 'application/json' }),
        body,
      },
    ).then(({ json }) => ({ data: json }))
  },
  scanUploadedMusic: (libraryId, folder) =>
    httpClient(
      `${REST_URL}/library/${encodeURIComponent(libraryId)}/upload/scan?folder=${encodeURIComponent(folder || '')}`,
      { method: 'POST' },
    ).then(({ json }) => ({ data: json })),
})
