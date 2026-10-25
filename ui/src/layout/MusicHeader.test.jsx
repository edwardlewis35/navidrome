import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { Router } from 'react-router-dom'
import { createMemoryHistory } from 'history'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MusicHeader from './MusicHeader'

const mocks = vi.hoisted(() => ({ locale: 'en' }))

vi.mock('react-admin', () => ({ useLocale: () => mocks.locale }))

const renderHeader = (initialEntries = ['/']) => {
  const history = createMemoryHistory({ initialEntries })
  render(
    <Router history={history}>
      <MusicHeader />
    </Router>,
  )
  return history
}

describe('music header', () => {
  beforeEach(() => {
    mocks.locale = 'en'
  })

  it('submits trimmed Unicode and reserved characters as a song title filter', () => {
    const history = renderHeader(['/album/recentlyAdded'])
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search songs in your library' }),
      { target: { value: '  夜曲 & Jazz / #1  ' } },
    )
    fireEvent.submit(screen.getByRole('search'))

    expect(history.location.pathname).toBe('/song')
    const query = new URLSearchParams(history.location.search)
    expect(JSON.parse(query.get('filter'))).toEqual({
      title: '夜曲 & Jazz / #1',
    })
    expect(query.get('page')).toBe('1')
  })

  it('keeps the current page when submitting blank input', () => {
    const history = renderHeader(['/artist'])
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '   ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(history.location.pathname).toBe('/artist')
    expect(history.length).toBe(1)
  })

  it('uses browser history for back and returns home through the brand link', () => {
    const history = renderHeader(['/artist', '/album/recentlyAdded'])
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))
    expect(history.location.pathname).toBe('/artist')

    fireEvent.click(screen.getByRole('link', { name: 'Navidrome' }))
    expect(history.location.pathname).toBe('/')
  })

  it('localizes accessible search controls for Chinese', () => {
    mocks.locale = 'zh-Hans'
    const history = renderHeader()
    const input = screen.getByRole('textbox', { name: '搜索曲库中的歌曲' })
    expect(input).toHaveAttribute('placeholder', '搜索曲库中的歌曲')
    expect(input).toHaveAttribute('maxlength', '200')
    fireEvent.change(input, { target: { value: '周杰伦' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))

    expect(history.location.pathname).toBe('/song')
    expect(
      JSON.parse(new URLSearchParams(history.location.search).get('filter')),
    ).toEqual({ title: '周杰伦' })
  })
})
