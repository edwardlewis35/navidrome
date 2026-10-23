import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '../i18n/en.json'
import zh from '../../../resources/i18n/zh-Hans.json'
import { SongContextMenu } from './SongContextMenu'

const mocks = vi.hoisted(() => ({
  permissions: 'admin',
  locale: 'en',
  move: vi.fn(),
  notify: vi.fn(),
  refresh: vi.fn(),
  provider: { getPlaylists: vi.fn() },
}))

vi.mock('react-redux', () => ({ useDispatch: () => vi.fn() }))
vi.mock('./LoveButton', () => ({ LoveButton: () => null }))
vi.mock('./playbackActions.js', () => ({ playSimilar: vi.fn() }))
vi.mock('../config', () => ({
  default: { enableDownloads: false, enableExternalServices: false },
}))
vi.mock('react-admin', async (importOriginal) => ({
  ...(await importOriginal()),
  usePermissions: () => ({ permissions: mocks.permissions }),
  useDataProvider: () => ({ ...mocks.provider, moveSongToTrash: mocks.move }),
  useNotify: () => mocks.notify,
  useRefresh: () => mocks.refresh,
  useRedirect: () => vi.fn(),
  useTranslate: () => (key) =>
    key
      .split('.')
      .reduce(
        (value, part) => value?.[part],
        mocks.locale === 'zh-Hans' ? zh : en,
      ) || key,
}))

const song = { id: 'song-1', title: 'Blue Hours', size: 2048 }
const openMenu = () => fireEvent.click(screen.getByRole('button'))
const openConfirmation = async () => {
  openMenu()
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Move to trash' }),
  )
  return screen.findByRole('dialog')
}

describe('administrator song trash action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.permissions = 'admin'
    mocks.locale = 'en'
    mocks.provider.getPlaylists.mockResolvedValue({ data: [] })
    mocks.move.mockResolvedValue({ data: { id: song.id, trashId: 'trash-1' } })
  })

  it.each(['regular', undefined])(
    'hides the destructive action from permission %s without making a trash request',
    async (permissions) => {
      mocks.permissions = permissions
      render(<SongContextMenu record={song} />)
      openMenu()
      await screen.findByRole('menuitem', { name: 'Play Now' })
      expect(
        screen.queryByRole('menuitem', { name: 'Move to trash' }),
      ).toBeNull()
      expect(mocks.move).not.toHaveBeenCalled()
    },
  )

  it('explains shared-folder impact and cancels without sending DELETE or playing the row', async () => {
    const rowClick = vi.fn()
    render(
      <div onClick={rowClick}>
        <SongContextMenu record={song} />
      </div>,
    )
    const dialog = await openConfirmation()
    expect(within(dialog).getByText(song.title)).toBeInTheDocument()
    expect(
      within(dialog).getByText(/Other servers using this same music folder/),
    ).toBeInTheDocument()
    expect(mocks.move).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mocks.move).not.toHaveBeenCalled()
    expect(rowClick).not.toHaveBeenCalled()
  })

  it.each([
    { record: song, expected: 'song-1' },
    {
      record: { ...song, id: 'playlist-row-8', mediaFileId: 'media-song-2' },
      expected: 'media-song-2',
    },
  ])(
    'moves the underlying song $expected only after confirmation and refreshes the library',
    async ({ record, expected }) => {
      render(<SongContextMenu record={record} />)
      const dialog = await openConfirmation()
      expect(mocks.move).not.toHaveBeenCalled()
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Move to trash' }),
      )
      await waitFor(() => expect(mocks.move).toHaveBeenCalledWith(expected))
      expect(mocks.move).toHaveBeenCalledOnce()
      await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce())
      expect(mocks.notify).toHaveBeenCalledWith('Song moved to trash', {
        type: 'info',
      })
    },
  )

  it('keeps the confirmation open with the server error and allows retry', async () => {
    mocks.move.mockRejectedValueOnce({
      body: { error: 'Music folder is read-only' },
    })
    render(<SongContextMenu record={song} />)
    const dialog = await openConfirmation()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Move to trash' }),
    )
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Music folder is read-only',
    )
    expect(mocks.refresh).not.toHaveBeenCalled()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Move to trash' }),
    )
    await waitFor(() => expect(mocks.move).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce())
  })

  it('localizes the action and confirmation for Chinese', async () => {
    mocks.locale = 'zh-Hans'
    render(<SongContextMenu record={song} />)
    openMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: '移至回收站' }))
    const dialog = await screen.findByRole('dialog', {
      name: '将歌曲移至回收站？',
    })
    expect(
      within(dialog).getByText(/使用同一音乐文件夹的其他服务/),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: '取消' }),
    ).toBeInTheDocument()
  })
})
