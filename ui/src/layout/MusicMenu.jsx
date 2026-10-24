import { useState } from 'react'
import { useSelector } from 'react-redux'
import { MenuItemLink } from 'react-admin'
import { Divider, makeStyles } from '@material-ui/core'
import {
  ExploreOutlined,
  AlbumOutlined,
  PersonOutline,
  MusicNoteOutlined,
  FavoriteBorder,
  History,
  QueueMusic,
  Tune,
  ShareOutlined,
} from '@material-ui/icons'
import LibrarySelector from '../common/LibrarySelector'
import PlaylistsSubMenu from './PlaylistsSubMenu'
import useMusicText from './useMusicText'
import config from '../config'
import TrashMenuItem from '../trash/TrashMenuItem'
import AdminMusicMenuItems from './AdminMusicMenuItems'
import EnglishRadioMenuItem from '../radio/EnglishRadioMenuItem'

const useStyles = makeStyles({
  root: {
    padding: '24px 12px 100px',
    boxSizing: 'border-box',
    width: 224,
    '& a': {
      borderRadius: 6,
      marginBottom: 4,
      minHeight: 43,
      fontSize: 14,
      color: '#5a5a63',
    },
    '& .MuiListItemIcon-root': { minWidth: 36, color: 'inherit' },
    '& .MuiDivider-root': { margin: '20px 8px' },
    '& .MuiChip-root': { minWidth: 0, maxWidth: '100%', fontSize: 12 },
  },
  closed: { width: 55, padding: '24px 4px 100px' },
  active: {
    '&&': { color: '#ec4141', backgroundColor: '#fce8e8', fontWeight: 600 },
  },
  caption: {
    color: '#a1a1a8',
    fontSize: 11,
    letterSpacing: '.8px',
    margin: '24px 16px 12px',
  },
  footer: {
    margin: '28px 16px 0',
    color: '#b0b0b7',
    fontSize: 10,
    letterSpacing: '.5px',
  },
})

export default function MusicMenu() {
  const classes = useStyles()
  const text = useMusicText()
  const open = useSelector((state) => state.admin.ui.sidebarOpen)
  const [state, setState] = useState({
    menuPlaylists: true,
    menuSharedPlaylists: true,
  })
  const item = (to, label, icon, exact = false) => (
    <MenuItemLink
      to={to}
      primaryText={label}
      leftIcon={icon}
      sidebarIsOpen={open}
      activeClassName={classes.active}
      exact={exact}
    />
  )
  return (
    <nav
      className={`${classes.root} ${!open ? classes.closed : ''}`}
      aria-label={text.library}
    >
      {item('/', text.discover, <ExploreOutlined />, true)}
      {item('/album/all', text.albums, <AlbumOutlined />, true)}
      {item('/artist', text.artists, <PersonOutline />)}
      {item('/song', text.songs, <MusicNoteOutlined />)}
      {open && <p className={classes.caption}>{text.personal}</p>}
      {config.enableFavourites &&
        item('/album/starred', text.favourites, <FavoriteBorder />)}
      {item('/album/recentlyPlayed', text.recentlyPlayed, <History />)}
      {item('/playlist', text.playlists, <QueueMusic />, true)}
      {config.enableSharing && item('/share', text.shares, <ShareOutlined />)}
      <EnglishRadioMenuItem
        sidebarIsOpen={open}
        activeClassName={classes.active}
      />
      <Divider />
      {open && <LibrarySelector />}
      {config.devSidebarPlaylists && open && (
        <PlaylistsSubMenu
          state={state}
          setState={setState}
          sidebarIsOpen={open}
        />
      )}
      {item('/personal', text.preferences, <Tune />)}
      <AdminMusicMenuItems
        sidebarIsOpen={open}
        activeClassName={classes.active}
      />
      <TrashMenuItem sidebarIsOpen={open} activeClassName={classes.active} />
      {open && <p className={classes.footer}>NAVIDROME · {text.online}</p>}
    </nav>
  )
}
