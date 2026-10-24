import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EnglishRadioMenuItem from './EnglishRadioMenuItem'

const state = vi.hoisted(() => ({ locale: 'en' }))
vi.mock('react-admin', () => ({
  useLocale: () => state.locale,
  MenuItemLink: ({ to, primaryText }) => <a href={to}>{primaryText}</a>,
}))

describe('English radio navigation', () => {
  it.each([
    ['en', 'English radio'],
    ['zh-Hans', '英语电台'],
  ])('links to the listening page in %s', (locale, label) => {
    state.locale = locale
    render(<EnglishRadioMenuItem />)
    expect(screen.getByRole('link', { name: label })).toHaveAttribute(
      'href',
      '/radio',
    )
  })
})
