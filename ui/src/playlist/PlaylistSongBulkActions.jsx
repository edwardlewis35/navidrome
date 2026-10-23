import React, { Fragment, useEffect } from 'react'
import {
  BulkDeleteButton,
  useUnselectAll,
  ResourceContextProvider,
} from 'react-admin'
import { MdOutlinePlaylistRemove } from 'react-icons/md'
import PropTypes from 'prop-types'
import { SongManagementButtons } from '../common/SongManagementButtons'

// Replace original resource with "fake" one for removing tracks from playlist
const PlaylistSongBulkActions = ({
  playlistId,
  resource,
  onUnselectItems,
  readOnly,
  ...rest
}) => {
  const unselectAll = useUnselectAll()
  useEffect(() => {
    unselectAll('playlistTrack')
  }, [unselectAll])

  const mappedResource = `playlist/${playlistId}/tracks`
  return (
    <ResourceContextProvider value={mappedResource}>
      <Fragment>
        {!readOnly && (
          <BulkDeleteButton
            {...rest}
            label={'ra.action.remove'}
            icon={<MdOutlinePlaylistRemove />}
            resource={mappedResource}
            onClick={onUnselectItems}
          />
        )}
        <SongManagementButtons
          {...rest}
          resource="playlistTrack"
          onUnselectItems={onUnselectItems}
        />
      </Fragment>
    </ResourceContextProvider>
  )
}

PlaylistSongBulkActions.propTypes = {
  playlistId: PropTypes.string.isRequired,
}

export default PlaylistSongBulkActions
