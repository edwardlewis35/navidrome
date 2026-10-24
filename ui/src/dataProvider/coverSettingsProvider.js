import { REST_URL } from '../consts'

export const createCoverSettingsProvider = (httpClient) => ({
  getOnlineCoverSettings: () =>
    httpClient(`${REST_URL}/online-cover/settings`).then(({ json }) => ({
      data: json,
    })),
  updateOnlineCoverSettings: (_resource, { data }) =>
    httpClient(`${REST_URL}/online-cover/settings`, {
      method: 'PUT',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    }).then(({ json }) => ({ data: json })),
})
