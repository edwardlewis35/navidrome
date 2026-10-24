import React from 'react'
import PropTypes from 'prop-types'
import { useDispatch } from 'react-redux'
import {
  Button,
  sanitizeListRestProps,
  TopToolbar,
  useRecordContext,
  useTranslate,
  useDataProvider,
  useNotify,
} from 'react-admin'
import { useMediaQuery, makeStyles } from '@material-ui/core'
import PlayArrowIcon from '@material-ui/icons/PlayArrow'
import ShuffleIcon from '@material-ui/icons/Shuffle'
import CloudDownloadOutlinedIcon from '@material-ui/icons/CloudDownloadOutlined'
import { RiPlayListAddFill, RiPlayList2Fill } from 'react-icons/ri'
import PlaylistAddIcon from '@material-ui/icons/PlaylistAdd'
import ShareIcon from '@material-ui/icons/Share'
import {
  playNext,
  addTracks,
  playTracks,
  shuffleTracks,
  openAddToPlaylist,
  openDownloadMenu,
  DOWNLOAD_MENU_ALBUM,
  openShareMenu,
} from '../actions'
import { formatBytes } from '../utils'
import config from '../config'
import { RefreshMetadataButton, ToggleFieldsMenu } from '../common'
import { getCompleteList } from '../common/getCompleteList'

const useStyles = makeStyles({
  toolbar: { display: 'flex', justifyContent: 'space-between', width: '100%' },
})

const AlbumButton = ({ children, ...rest }) => {
  const record = useRecordContext(rest) || {}
  return (
    <Button {...rest} disabled={record.missing || rest.disabled}>
      {children}
    </Button>
  )
}

const AlbumActions = ({
  className,
  ids,
  data,
  record,
  permanentFilter,
  ...rest
}) => {
  const dispatch = useDispatch()
  const dataProvider = useDataProvider()
  const notify = useNotify()
  const [loading, setLoading] = React.useState(false)
  const pending = React.useRef(false)
  const translate = useTranslate()
  const classes = useStyles()
  const isDesktop = useMediaQuery((theme) => theme.breakpoints.up('md'))
  const isNotSmall = useMediaQuery((theme) => theme.breakpoints.up('sm'))

  const dispatchAll = React.useCallback(
    async (action) => {
      if (pending.current) return
      pending.current = true
      setLoading(true)
      try {
        let allData = data
        let allIds = ids
        if (record.songCount && ids.length < record.songCount) {
          const songs = await getCompleteList(dataProvider, 'song', {
            sort: rest.currentSort || { field: 'album', order: 'ASC' },
            filter: { album_id: record.id },
          })
          allData = Object.fromEntries(songs.map((song) => [song.id, song]))
          allIds = songs.map((song) => song.id)
        }
        dispatch(action(allData, allIds))
      } catch (error) {
        notify('ra.page.error', 'warning')
      } finally {
        pending.current = false
        setLoading(false)
      }
    },
    [
      data,
      ids,
      record.id,
      record.songCount,
      dataProvider,
      dispatch,
      notify,
      rest.currentSort,
    ],
  )

  const handlePlay = React.useCallback(() => {
    dispatchAll(playTracks)
  }, [dispatchAll])

  const handlePlayNext = React.useCallback(() => {
    dispatchAll(playNext)
  }, [dispatchAll])

  const handlePlayLater = React.useCallback(() => {
    dispatchAll(addTracks)
  }, [dispatchAll])

  const handleShuffle = React.useCallback(() => {
    dispatchAll(shuffleTracks)
  }, [dispatchAll])

  const handleAddToPlaylist = React.useCallback(() => {
    dispatchAll((songs, songIds) =>
      openAddToPlaylist({
        selectedIds: songIds.filter((id) => !songs[id].missing),
      }),
    )
  }, [dispatchAll])

  const handleShare = React.useCallback(() => {
    dispatch(openShareMenu([record.id], 'album', record.name))
  }, [dispatch, record])

  const handleDownload = React.useCallback(() => {
    dispatch(openDownloadMenu(record, DOWNLOAD_MENU_ALBUM))
  }, [dispatch, record])

  return (
    <TopToolbar className={className} {...sanitizeListRestProps(rest)}>
      <div className={classes.toolbar}>
        <div>
          <AlbumButton
            disabled={loading}
            onClick={handlePlay}
            label={translate('resources.album.actions.playAll')}
          >
            <PlayArrowIcon />
          </AlbumButton>
          <AlbumButton
            disabled={loading}
            onClick={handleShuffle}
            label={translate('resources.album.actions.shuffle')}
          >
            <ShuffleIcon />
          </AlbumButton>
          <AlbumButton
            disabled={loading}
            onClick={handlePlayNext}
            label={translate('resources.album.actions.playNext')}
          >
            <RiPlayList2Fill />
          </AlbumButton>
          <AlbumButton
            disabled={loading}
            onClick={handlePlayLater}
            label={translate('resources.album.actions.addToQueue')}
          >
            <RiPlayListAddFill />
          </AlbumButton>
          <AlbumButton
            disabled={loading}
            onClick={handleAddToPlaylist}
            label={translate('resources.album.actions.addToPlaylist')}
          >
            <PlaylistAddIcon />
          </AlbumButton>
          {config.enableSharing && (
            <AlbumButton
              onClick={handleShare}
              label={translate('ra.action.share')}
            >
              <ShareIcon />
            </AlbumButton>
          )}
          {config.enableDownloads && (
            <AlbumButton
              onClick={handleDownload}
              label={
                translate('ra.action.download') +
                (isDesktop ? ` (${formatBytes(record.size)})` : '')
              }
            >
              <CloudDownloadOutlinedIcon />
            </AlbumButton>
          )}
          <RefreshMetadataButton
            resource="album"
            record={record}
            size="small"
          />
        </div>
        <div>{isNotSmall && <ToggleFieldsMenu resource="albumSong" />}</div>
      </div>
    </TopToolbar>
  )
}

AlbumActions.propTypes = {
  record: PropTypes.object.isRequired,
  selectedIds: PropTypes.arrayOf(PropTypes.number),
}

AlbumActions.defaultProps = {
  record: {},
  selectedIds: [],
}

export default AlbumActions
