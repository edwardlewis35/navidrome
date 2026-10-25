import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MusicMenu from './MusicMenu'

const state = vi.hoisted(() => ({ open: true, locale: 'zh-Hans' }))
vi.mock('react-redux', () => ({
  useSelector: (select) =>
    select({ admin: { ui: { sidebarOpen: state.open } } }),
}))
vi.mock('react-admin', () => ({
  useLocale: () => state.locale,
  MenuItemLink: ({ to, primaryText, sidebarIsOpen }) => (
    <a href={to} data-sidebar-open={String(sidebarIsOpen)}>
      {primaryText}
    </a>
  ),
}))
vi.mock('../config', () => ({
  default: {
    enableFavourites: true,
    enableSharing: true,
    devSidebarPlaylists: false,
  },
}))
vi.mock('../common/LibrarySelector', () => ({ default: () => null }))
vi.mock('./PlaylistsSubMenu', () => ({ default: () => null }))
vi.mock('./AdminMusicMenuItems', () => ({ default: () => null }))
vi.mock('../trash/TrashMenuItem', () => ({ default: () => null }))

describe('Cloud Music sidebar radio navigation', () => {
  it.each([true, false])(
    'exposes radio when the sidebar open state is %s',
    (open) => {
      state.open = open
      render(<MusicMenu />)
      expect(screen.getByRole('link', { name: '英语电台' })).toHaveAttribute(
        'href',
        '/radio',
      )
      expect(screen.getByRole('link', { name: '英语电台' })).toHaveAttribute(
        'data-sidebar-open',
        String(open),
      )
    },
  )
})
