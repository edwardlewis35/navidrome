import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route } from 'react-router-dom'
import en from '../i18n/en.json'
import UploadPage from './UploadPage'
const mocks = vi.hoisted(() => ({
  role: 'admin',
  loading: false,
  refresh: vi.fn(),
  provider: {
    getList: vi.fn(),
    uploadMusic: vi.fn(),
    scanUploadedMusic: vi.fn(),
  },
}))
const translate = (key, args = {}) =>
  (key.split('.').reduce((v, p) => v?.[p], en) || key).replace(
    /%\{(\w+)\}/g,
    (m, n) => args[n] ?? m,
  )
vi.mock('react-redux', () => ({
  useSelector: (select) => select({ library: { selectedLibraries: [1] } }),
}))
vi.mock('react-admin', () => ({
  Title: () => null,
  usePermissions: () => ({ permissions: mocks.role, loading: mocks.loading }),
  useDataProvider: () => mocks.provider,
  useTranslate: () => translate,
  useRefresh: () => mocks.refresh,
}))
const show = () =>
  render(
    <MemoryRouter initialEntries={['/upload']}>
      <Route path="/upload">
        <UploadPage />
      </Route>
      <Route exact path="/">
        <div>Home</div>
      </Route>
    </MemoryRouter>,
  )
describe('admin music upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.role = 'admin'
    mocks.loading = false
    mocks.provider.getList.mockResolvedValue({
      data: [{ id: 1, name: 'Current library', path: '/music' }],
    })
    mocks.provider.scanUploadedMusic.mockResolvedValue({
      data: { scanComplete: true },
    })
  })
  it('does not expose uploads to regular users', () => {
    mocks.role = 'regular'
    show()
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(mocks.provider.getList).not.toHaveBeenCalled()
    expect(mocks.provider.uploadMusic).not.toHaveBeenCalled()
  })
  it('distinguishes saved scan errors and retries refresh without reuploading', async () => {
    mocks.provider.uploadMusic.mockResolvedValue({
      data: {
        saved: true,
        scanComplete: false,
        scanError: 'Library scan failed',
      },
    })
    show()
    await screen.findByText('Current library')
    fireEvent.change(screen.getByLabelText('Choose audio files'), {
      target: {
        files: [
          new File(['fLaC fixture'], 'song.flac', { type: 'audio/flac' }),
        ],
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Upload and refresh' }))
    await screen.findByText(/File saved; library refresh unfinished/)
    expect(mocks.provider.uploadMusic).toHaveBeenCalledWith('1', {
      folder: '',
      file: expect.objectContaining({ name: 'song.flac' }),
    })
    expect(
      screen.getByRole('button', { name: 'Upload and refresh' }),
    ).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh library' }))
    await screen.findByText(/Uploaded and library refreshed/)
    expect(mocks.provider.uploadMusic).toHaveBeenCalledOnce()
    expect(mocks.provider.scanUploadedMusic).toHaveBeenCalledWith('1', '')
  })
  it('rejects unsupported and too many files before uploading', async () => {
    show()
    await screen.findByText('Current library')
    fireEvent.change(screen.getByLabelText('Choose audio files'), {
      target: { files: [new File(['bad'], 'script.html')] },
    })
    expect(screen.getByRole('alert').textContent).toContain('at most 25')
    expect(mocks.provider.uploadMusic).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Choose audio files'), {
      target: {
        files: Array.from(
          { length: 26 },
          (_, i) => new File(['fLaC'], `${i}.flac`),
        ),
      },
    })
    expect(mocks.provider.uploadMusic).not.toHaveBeenCalled()
  })
})
