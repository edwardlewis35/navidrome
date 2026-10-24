import { REST_URL } from '../consts'

export const createEnglishRadioProvider = (httpClient) => ({
  getEnglishRadioCatalog: () =>
    httpClient(`${REST_URL}/english-radio/catalog`).then(({ json }) => ({
      data: json,
    })),
  getEnglishRadioSettings: () =>
    httpClient(`${REST_URL}/english-radio/settings`).then(({ json }) => ({
      data: json,
    })),
  updateEnglishRadioSettings: (_resource, { data }) =>
    httpClient(`${REST_URL}/english-radio/settings`, {
      method: 'PUT',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    }).then(({ json }) => ({ data: json })),
  playEnglishRadio: (id) =>
    httpClient(`${REST_URL}/english-radio/play/${encodeURIComponent(id)}`, {
      method: 'POST',
    }).then(({ json }) => ({ data: json })),
})
