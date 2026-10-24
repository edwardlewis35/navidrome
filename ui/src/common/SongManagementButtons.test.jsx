import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '../i18n/en.json'
import { SongManagementButtons } from './SongManagementButtons'
const mocks = vi.hoisted(() => ({
  role: 'admin',
  manage: vi.fn(),
  refresh: vi.fn(),
  unselect: vi.fn(),
  notify: vi.fn(),
  context: {},
}))
const translate = (key, args = {}) =>
  (key.split('.').reduce((v, p) => v?.[p], en) || key).replace(
    /%\{(\w+)\}/g,
    (m, n) => args[n] ?? m,
  )
vi.mock('react-admin', () => ({
  useListContext: (props) => ({ ...mocks.context, ...props }),
  usePermissions: () => ({ permissions: mocks.role }),
  useDataProvider: () => ({ manageSongs: mocks.manage }),
  useTranslate: () => translate,
  useRefresh: () => mocks.refresh,
  useUnselectAll: () => mocks.unselect,
  useNotify: () => mocks.notify,
}))
describe('admin selection song management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.role = 'admin'
    mocks.context = {
      selectedIds: ['position1', 'position2'],
      resource: 'playlistTrack',
      data: {
        position1: { mediaFileId: 'media1' },
        position2: { mediaFileId: 'media2' },
      },
    }
    mocks.manage.mockResolvedValue({
      data: {
        completed: 2,
        failed: 0,
        results: [{ status: 'trashed' }, { status: 'trashed' }],
      },
    })
  })
  it('hides actions for regular users and cancels without any request', () => {
    mocks.role = 'regular'
    const { rerender } = render(<SongManagementButtons />)
    expect(screen.queryByRole('button')).toBeNull()
    mocks.role = 'admin'
    rerender(<SongManagementButtons />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Permanently delete selected' }),
    )
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/cannot be undone/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(mocks.manage).not.toHaveBeenCalled()
  })
  it('freezes actual media IDs before selection changes and clears successful selections', async () => {
    const { rerender } = render(<SongManagementButtons />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Move selected to trash' }),
    )
    mocks.context = {
      ...mocks.context,
      selectedIds: ['position3'],
      data: { position3: { mediaFileId: 'unconfirmed-new-song' } },
    }
    rerender(<SongManagementButtons />)
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Move selected to trash',
      }),
    )
    await waitFor(() =>
      expect(mocks.manage).toHaveBeenCalledWith(['media1', 'media2'], 'trash'),
    )
    expect(mocks.unselect).toHaveBeenCalledWith('playlistTrack')
    expect(mocks.refresh).toHaveBeenCalled()
  })
  it('blocks duplicate requests and reports partial and pending work', async () => {
    let finish
    mocks.manage.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    render(<SongManagementButtons />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Permanently delete selected' }),
    )
    const confirm = within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Permanently delete selected',
    })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(mocks.manage).toHaveBeenCalledOnce()
    expect(confirm).toBeDisabled()
    await act(async () =>
      finish({
        data: {
          completed: 1,
          failed: 1,
          results: [
            { status: 'deleted' },
            { status: 'pending', trashId: 'recover-intent' },
          ],
        },
      }),
    )
    expect(mocks.notify.mock.calls[0][0]).toContain(
      'Pending permanent deletions: 1',
    )
    expect(mocks.unselect).toHaveBeenCalled()
    expect(mocks.refresh).toHaveBeenCalled()
  })
})
