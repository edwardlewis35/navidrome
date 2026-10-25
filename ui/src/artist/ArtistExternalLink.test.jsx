import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TestContext } from 'ra-test'
import ArtistExternalLinks from './ArtistExternalLink'

describe('ArtistExternalLinks', () => {
  const renderLinks = (artistInfo) =>
    render(
      <TestContext>
        <ArtistExternalLinks
          artistInfo={artistInfo}
          record={{ id: 'ar-1', name: 'Björk' }}
        />
      </TestContext>,
    )

  it('omits Last.fm even when the server returns a Last.fm URL and biography', () => {
    renderLinks({
      lastFmUrl: 'https://www.last.fm/music/Bjork',
      biography: 'Read more on <a href="https://www.last.fm/music/Bjork">',
    })
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('retains MusicBrainz links', () => {
    renderLinks({ musicBrainzId: 'mb-artist' })
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'https://musicbrainz.org/artist/mb-artist',
    )
  })

  it('handles missing artist metadata', () => {
    renderLinks(undefined)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
