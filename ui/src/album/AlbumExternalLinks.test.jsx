import React from 'react'
import { render, screen } from '@testing-library/react'
import { TestContext } from 'ra-test'
import AlbumExternalLinks from './AlbumExternalLinks'

describe('AlbumExternalLinks', () => {
  it('retains MusicBrainz without offering a Last.fm link', () => {
    render(
      <TestContext>
        <AlbumExternalLinks
          record={{
            id: 'album-1',
            name: 'Album',
            albumArtist: 'Artist',
            mbzAlbumId: 'mb-album',
          }}
        />
      </TestContext>,
    )
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'https://musicbrainz.org/release/mb-album',
    )
  })
})
