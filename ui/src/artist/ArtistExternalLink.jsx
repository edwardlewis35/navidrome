import React from 'react'
import { useTranslate } from 'react-admin'
import { IconButton, Tooltip, Link } from '@material-ui/core'

import MusicBrainz from '../icons/MusicBrainz'
import { intersperse } from '../utils'
import { makeStyles } from '@material-ui/core/styles'

const useStyles = makeStyles({
  linkBar: {
    minHeight: '1.875em',
  },
})

const ArtistExternalLinks = ({ artistInfo, record }) => {
  const classes = useStyles()
  const translate = useTranslate()
  let linkButtons = []

  const addLink = (url, title, icon) => {
    const translatedTitle = translate(title)
    const link = (
      <Link href={url} target="_blank" rel="noopener noreferrer">
        <Tooltip title={translatedTitle}>
          <IconButton size={'small'} aria-label={translatedTitle}>
            {icon}
          </IconButton>
        </Tooltip>
      </Link>
    )
    const id = linkButtons.length
    linkButtons.push(<span key={`link-${record.id}-${id}`}>{link}</span>)
  }

  artistInfo?.musicBrainzId &&
    addLink(
      `https://musicbrainz.org/artist/${artistInfo.musicBrainzId}`,
      'message.openIn.musicbrainz',
      <MusicBrainz className="musicbrainz-icon" />,
    )

  return <div className={classes.linkBar}>{intersperse(linkButtons, ' ')}</div>
}

export default ArtistExternalLinks
