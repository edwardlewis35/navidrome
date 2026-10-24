import { useState, useEffect } from 'react'
import { useMediaQuery, withWidth } from '@material-ui/core'
import {
  useShowController,
  ShowContextProvider,
  useRecordContext,
  useShowContext,
  Title as RaTitle,
} from 'react-admin'
import subsonic from '../subsonic'
import AlbumGridView from '../album/AlbumGridView'
import MobileArtistDetails from './MobileArtistDetails'
import DesktopArtistDetails from './DesktopArtistDetails'
import {
  ContinuousReferenceField as ReferenceManyField,
  useResourceRefresh,
  useScrollRestoration,
  Title,
} from '../common/index.js'
import ArtistActions from './ArtistActions'
import { makeStyles } from '@material-ui/core'

const useStyles = makeStyles(
  (theme) => ({
    actions: {
      width: '100%',
      justifyContent: 'flex-start',
      display: 'flex',
      paddingTop: '0.25em',
      paddingBottom: '0.25em',
      paddingLeft: '1em',
      paddingRight: '1em',
      flexWrap: 'wrap',
      overflowX: 'auto',
      [theme.breakpoints.down('xs')]: {
        paddingLeft: '0.5em',
        paddingRight: '0.5em',
        gap: '0.5em',
        justifyContent: 'space-around',
      },
    },
    actionsContainer: {
      paddingLeft: '.75rem',
      [theme.breakpoints.down('xs')]: {
        padding: '.5rem',
      },
    },
  }),
  {
    name: 'NDArtistShow',
  },
)

export const ArtistDetails = (props) => {
  const record = useRecordContext(props)
  const isDesktop = useMediaQuery((theme) => theme.breakpoints.up('sm'), {
    noSsr: true,
  })
  const [artistInfo, setArtistInfo] = useState()

  const biography = artistInfo?.biography || record.biography

  useEffect(() => {
    subsonic
      .getArtistInfo(record.id)
      .then((resp) => resp.json['subsonic-response'])
      .then((data) => {
        if (data.status === 'ok') {
          setArtistInfo(data.artistInfo)
        }
      })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error('error on artist page', e)
      })
    // Keyed on the record, not its id: a refreshed record must re-fetch, or the stale
    // artistInfo state keeps winning the `||` above.
  }, [record])

  const Component = isDesktop ? DesktopArtistDetails : MobileArtistDetails
  return (
    <Component artistInfo={artistInfo} record={record} biography={biography} />
  )
}

const ArtistShowLayout = (props) => {
  const showContext = useShowContext(props)
  const record = useRecordContext()
  const classes = useStyles()
  useResourceRefresh('artist', 'album')
  useScrollRestoration(!!record?.id)

  return (
    <>
      {record && <RaTitle title={<Title subTitle={record.name} />} />}
      {record && <ArtistDetails />}
      {record && (
        <div className={classes.actionsContainer}>
          <ArtistActions record={record} className={classes.actions} />
        </div>
      )}
      {record && (
        <ReferenceManyField
          {...showContext}
          addLabel={false}
          reference="album"
          target="artist_id"
          sort={{ field: 'max_year', order: 'ASC' }}
          filter={{ artist_id: record?.id }}
        >
          <AlbumGridView {...props} />
        </ReferenceManyField>
      )}
    </>
  )
}

const ArtistShow = withWidth()((props) => {
  const controllerProps = useShowController(props)
  return (
    <ShowContextProvider value={controllerProps}>
      <ArtistShowLayout {...controllerProps} />
    </ShowContextProvider>
  )
})

export default ArtistShow
