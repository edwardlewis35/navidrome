import { REST_URL } from '../consts'

export const createAIDataProvider = (httpClient) => ({
  getAIStatus: () =>
    httpClient(`${REST_URL}/ai/status`).then(({ json }) => ({ data: json })),
  getAISettings: () =>
    httpClient(`${REST_URL}/ai/settings`).then(({ json }) => ({ data: json })),
  updateAISettings: (data) =>
    httpClient(`${REST_URL}/ai/settings`, {
      method: 'PUT',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    }).then(({ json }) => ({ data: json })),
  getAIRecommendations: (playlistId) =>
    httpClient(`${REST_URL}/ai/recommendations`, {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ playlistId }),
    }).then(({ json }) => ({ data: json })),
})
