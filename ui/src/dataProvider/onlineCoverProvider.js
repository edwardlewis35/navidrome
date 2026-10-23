import { REST_URL } from '../consts'

export const createOnlineCoverProvider = (httpClient) => ({
  searchOnlineCovers: (kind, id, query) =>
    httpClient(`${REST_URL}/online-cover/search`, {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ kind, id, query }),
    }).then(({ json }) => ({ data: json })),
  applyOnlineCover: (kind, id, releaseId) =>
    httpClient(`${REST_URL}/online-cover/apply`, {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ kind, id, releaseId }),
    }).then(({ json }) => ({ data: json })),
})
