import React from 'react'
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import AdminMusicMenuItems from './AdminMusicMenuItems'

const state = vi.hoisted(() => ({
  permissions: 'admin',
  loading: false,
  locale: 'en',
}))
vi.mock('react-admin', () => ({
  usePermissions: () => state,
  useLocale: () => state.locale,
  useTranslate: () => (key) =>
    key === 'resources.upload.name' ? 'Upload music' : key,
  MenuItemLink: ({ to, primaryText }) => <a href={to}>{primaryText}</a>,
}))

describe('administrator music navigation', () => {
  beforeEach(() =>
    Object.assign(state, {
      permissions: 'admin',
      loading: false,
      locale: 'en',
    }),
  )

  it('links administrators to upload and AI settings', () => {
    render(<AdminMusicMenuItems />)
    expect(screen.getByRole('link', { name: 'Upload music' })).toHaveAttribute(
      'href',
      '/upload',
    )
    expect(screen.getByRole('link', { name: 'AI music' })).toHaveAttribute(
      'href',
      '/ai/settings',
    )
  })

  it.each(['user', undefined])(
    'hides administrator links for %s',
    (permissions) => {
      state.permissions = permissions
      render(<AdminMusicMenuItems />)
      expect(screen.queryByRole('link')).toBeNull()
    },
  )

  it('waits for permissions before showing links', () => {
    state.loading = true
    render(<AdminMusicMenuItems />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('localizes AI music for Chinese', () => {
    state.locale = 'zh-Hans'
    render(<AdminMusicMenuItems />)
    expect(screen.getByRole('link', { name: 'AI 音乐' })).toHaveAttribute(
      'href',
      '/ai/settings',
    )
  })
})
