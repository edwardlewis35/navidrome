import { Link } from 'react-router-dom'
import { IconButton, makeStyles } from '@material-ui/core'
import {
  AlbumOutlined,
  SkipPrevious,
  SkipNext,
  PlayArrow,
  VolumeUp,
  QueueMusic,
} from '@material-ui/icons'
import useMusicText from './useMusicText'

const useStyles = makeStyles((theme) => ({
  root: {
    position: 'fixed',
    zIndex: 1200,
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    padding: '0 28px',
    boxSizing: 'border-box',
    background: 'rgba(255,255,255,.98)',
    borderTop: '1px solid #eeeef0',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  cover: {
    width: 46,
    height: 46,
    background: '#f4f4f5',
    color: '#b9b9c1',
    borderRadius: 9,
    display: 'grid',
    placeItems: 'center',
  },
  info: {
    flex: 1,
    fontSize: 12,
    color: '#888891',
    minWidth: 0,
    '& a': {
      display: 'block',
      width: 'fit-content',
      color: '#35353e',
      textDecoration: 'none',
      fontSize: 14,
      fontWeight: 600,
      marginBottom: 4,
    },
  },
  controls: { width: '35%', maxWidth: 440 },
  buttons: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    height: 40,
  },
  play: {
    background: '#f9dddd',
    '&.Mui-disabled': { background: '#fbe5e5', color: '#e7a0a0' },
  },
  progress: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 10,
    color: '#b2b2ba',
    '& span': { flex: 1, height: 3, borderRadius: 2, background: '#eeeef0' },
  },
  tools: {
    flex: 1,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 16,
    color: '#aaaab2',
  },
  [theme.breakpoints.down('xs')]: {
    root: { padding: '0 16px', gap: 10, height: 72 },
    info: { '& span': { display: 'none' } },
    controls: { width: 150 },
    tools: { display: 'none' },
  },
}))

export default function MusicIdlePlayer() {
  const classes = useStyles()
  const text = useMusicText()
  return (
    <div className={classes.root} aria-label={text.queue}>
      <div className={classes.cover}>
        <AlbumOutlined />
      </div>
      <div className={classes.info}>
        <Link to="/album">{text.browse}</Link>
        <span>{text.idle}</span>
      </div>
      <div className={classes.controls}>
        <div className={classes.buttons}>
          <IconButton disabled size="small" aria-label={text.previous}>
            <SkipPrevious fontSize="small" />
          </IconButton>
          <IconButton
            disabled
            size="small"
            className={classes.play}
            aria-label={text.play}
          >
            <PlayArrow />
          </IconButton>
          <IconButton disabled size="small" aria-label={text.next}>
            <SkipNext fontSize="small" />
          </IconButton>
        </div>
        <div className={classes.progress}>
          00:00
          <span />
          00:00
        </div>
      </div>
      <div className={classes.tools}>
        <VolumeUp aria-label={text.volume} />
        <QueueMusic aria-label={text.queue} />
      </div>
    </div>
  )
}
