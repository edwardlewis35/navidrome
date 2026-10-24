import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OnlineCoverButton from './OnlineCoverButton'
const mocks = vi.hoisted(() => ({
  permissions: 'regular',
  loading: false,
  enableUpload: true,
  dialog: vi.fn(),
}))
vi.mock('react-admin', () => ({
  usePermissions: () => ({
    permissions: mocks.permissions,
    loading: mocks.loading,
  }),
  useLocale: () => 'en',
}))
vi.mock('../config', () => ({
  default: {
    get enableArtworkUpload() {
      return mocks.enableUpload
    },
  },
}))
vi.mock('./OnlineCoverDialog', () => ({
  default: (props) => {
    mocks.dialog(props)
    return props.open ? (
      <div role="dialog">
        <button onClick={props.onClose}>Dismiss cover dialog</button>
      </div>
    ) : null
  },
}))
describe('online cover button permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('userId', 'owner')
    mocks.permissions = 'regular'
    mocks.loading = false
    mocks.enableUpload = true
  })
  it.each(['album', 'song', 'playlist'])(
    'allows administrators to edit %s covers even when owner uploads are disabled',
    (kind) => {
      mocks.permissions = 'admin'
      mocks.enableUpload = false
      render(
        <OnlineCoverButton
          kind={kind}
          record={{ id: 'entity', name: 'Name' }}
        />,
      )
      expect(
        screen.getByRole('button', { name: 'Find a cover online' }),
      ).toBeInTheDocument()
    },
  )
  it('allows an eligible playlist owner and opens the correct target', () => {
    render(
      <OnlineCoverButton
        kind="playlist"
        record={{ id: 'playlist', ownerId: 'owner', name: 'Owned playlist' }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Find a cover online' }))
    expect(mocks.dialog.mock.calls.at(-1)[0]).toEqual(
      expect.objectContaining({
        kind: 'playlist',
        id: 'playlist',
        initialQuery: 'Owned playlist',
        open: true,
      }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss cover dialog' }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it.each([
    { kind: 'playlist', ownerId: 'other', enable: true },
    { kind: 'playlist', ownerId: 'owner', enable: false },
    { kind: 'album', ownerId: 'owner', enable: true },
    { kind: 'song', ownerId: 'owner', enable: true },
  ])('hides ineligible controls: %j', ({ kind, ownerId, enable }) => {
    mocks.enableUpload = enable
    render(<OnlineCoverButton kind={kind} record={{ id: 'entity', ownerId }} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(mocks.dialog).not.toHaveBeenCalled()
  })
  it('hides while permissions load or entity ID is missing', () => {
    mocks.permissions = 'admin'
    mocks.loading = true
    const { rerender } = render(
      <OnlineCoverButton kind="album" record={{ id: 'album' }} />,
    )
    expect(screen.queryByRole('button')).toBeNull()
    mocks.loading = false
    rerender(<OnlineCoverButton kind="album" record={{}} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('never treats absent account IDs as ownership', () => {
    localStorage.clear()
    mocks.permissions = undefined
    render(
      <OnlineCoverButton
        kind="playlist"
        record={{ id: 'playlist', ownerId: null }}
      />,
    )
    expect(screen.queryByRole('button')).toBeNull()
  })
})
