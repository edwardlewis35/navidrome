import { useCallback, useState } from 'react'
import { Link, Redirect } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { Title, useQueryWithStore } from 'react-admin'
import { Button, Typography, makeStyles, useTheme } from '@material-ui/core'
import {
  AlbumOutlined,
  ArrowForward,
  ChevronRight,
  Refresh,
  HeadsetOutlined,
} from '@material-ui/icons'
import { Artwork } from '../common/Artwork'
import { PlayButton } from '../common/PlayButton'
import { useRefreshOnEvents } from '../common/useRefreshOnEvents'
import useMusicText from './useMusicText'
import AIRecommendations from '../ai/AIRecommendations'

const useStyles = makeStyles((theme) => ({
  root: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '0 28px 36px',
    maxWidth: 1480,
    margin: '0 auto',
    color: theme.palette.text.primary,
  },
  tabs: {
    display: 'flex',
    gap: 30,
    borderBottom: `1px solid ${theme.palette.divider}`,
    marginBottom: 28,
    overflowX: 'auto',
    '& a': {
      flexShrink: 0,
      padding: '23px 0 17px',
      color: '#73737e',
      textDecoration: 'none',
      fontSize: 14,
    },
    '& a:first-child': {
      color: '#292932',
      fontSize: 17,
      fontWeight: 700,
      borderBottom: '3px solid #ec4141',
    },
  },
  heroGrid: {
    display: 'grid',
    gridTemplateColumns: '1.8fr 1fr',
    gap: 20,
    marginBottom: 36,
  },
  hero: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 12,
    minHeight: 260,
    padding: '32px 34px',
    boxSizing: 'border-box',
    background: 'linear-gradient(120deg,#f8e8dc 0%,#e9cebb 70%,#d6b8a1 100%)',
    color: '#49372f',
  },
  eyebrow: {
    position: 'relative',
    zIndex: 1,
    fontSize: 10,
    letterSpacing: '2.3px',
    fontWeight: 600,
    margin: '0 0 20px',
    opacity: 0.7,
  },
  heroTitle: {
    position: 'relative',
    zIndex: 1,
    fontSize: 'clamp(23px,2.2vw,36px)',
    fontWeight: 700,
    lineHeight: 1.45,
    letterSpacing: '-.8px',
    whiteSpace: 'pre-line',
    margin: 0,
  },
  description: {
    position: 'relative',
    zIndex: 1,
    fontSize: 12,
    margin: '12px 0 22px',
    opacity: 0.75,
    maxWidth: '65%',
  },
  cta: {
    position: 'relative',
    zIndex: 1,
    borderRadius: 24,
    background: '#49372f',
    color: '#fff',
    fontSize: 12,
    padding: '8px 18px',
    boxShadow: 'none',
    '&:hover': { background: '#62473a' },
  },
  disc: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: '50%',
    right: -48,
    top: 34,
    background:
      'repeating-radial-gradient(circle,#2f2926 0px,#2f2926 2px,#3b3330 3px,#2c2522 4px)',
    boxShadow: '0 18px 40px #59413440',
    transform: 'rotate(-18deg)',
    '&::after': {
      content: '""',
      position: 'absolute',
      inset: '34%',
      borderRadius: '50%',
      background:
        'radial-gradient(circle,#f6e4d6 0 5%,#d58367 6% 70%,#f6d6b3 71%)',
    },
  },
  sideHero: {
    background: 'linear-gradient(125deg,#e8eee9,#d1ded6)',
    color: '#344b41',
    '& $cta': {
      color: '#344b41',
      background: '#ffffffb3',
      '&:hover': { background: '#fff' },
    },
    '& $heroTitle': { fontSize: 27 },
    '& $description': { maxWidth: '100%' },
  },
  ornament: {
    position: 'absolute',
    right: -8,
    top: 25,
    width: 135,
    height: 135,
    border: '1px solid #78938150',
    borderRadius: '50%',
    boxShadow: '0 0 0 18px #94ac9b18,0 0 0 36px #94ac9b14,0 0 0 54px #94ac9b10',
  },
  section: { marginBottom: 32 },
  heading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 19,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: '-.4px',
    display: 'flex',
    alignItems: 'center',
  },
  subtitle: { color: '#9797a0', fontSize: 12, marginTop: 6 },
  more: {
    color: '#9898a2',
    fontSize: 12,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    whiteSpace: 'nowrap',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6,minmax(0,1fr))',
    gap: 20,
  },
  card: {
    position: 'relative',
    minWidth: 0,
    '&:hover $play, &:focus-within $play': {
      opacity: 1,
      transform: 'translateY(0)',
    },
  },
  artworkLink: {
    display: 'block',
    position: 'relative',
    borderRadius: 9,
    overflow: 'hidden',
    background: '#f2f2f4',
    aspectRatio: '1',
    color: '#cccbd0',
    '& > svg': {
      position: 'absolute',
      top: '35%',
      left: '35%',
      width: '30%',
      height: '30%',
    },
  },
  artwork: { width: '100%', height: '100%', position: 'absolute', inset: 0 },
  play: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    background: '#fff',
    color: '#ec4141',
    opacity: 0,
    transform: 'translateY(5px)',
    transition: 'opacity 150ms, transform 150ms',
    boxShadow: '0 3px 12px #0002',
    '&:hover': { background: '#fff0f0' },
  },
  coverWrap: { position: 'relative' },
  albumName: {
    display: 'block',
    color: 'inherit',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 500,
    marginTop: 10,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  artist: {
    fontSize: 11,
    color: '#9797a0',
    marginTop: 5,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  skeleton: { aspectRatio: '1', background: '#f1f1f3', borderRadius: 9 },
  message: {
    padding: '32px 20px',
    textAlign: 'center',
    color: '#9797a0',
    background: '#fafafa',
    borderRadius: 10,
    '& h3': { color: '#52525c', fontSize: 16 },
    '& p': { fontSize: 13 },
  },
  [theme.breakpoints.down('md')]: {
    grid: { gridTemplateColumns: 'repeat(4,minmax(0,1fr))' },
    heroGrid: { gridTemplateColumns: '1.6fr 1fr' },
    hero: { padding: 26 },
    disc: { right: -100, opacity: 0.35 },
    sideHero: { '& $heroTitle': { fontSize: 23 } },
  },
  [theme.breakpoints.down('sm')]: {
    root: { padding: '0 20px 24px' },
    grid: { gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 16 },
    heroGrid: { gap: 14 },
    hero: { minHeight: 245, padding: 22 },
    description: { maxWidth: '80%' },
    disc: { opacity: 0.45 },
    tabs: { gap: 24 },
    play: { opacity: 1, transform: 'none' },
  },
  [theme.breakpoints.down('xs')]: {
    root: { padding: '0 16px 20px' },
    heroGrid: { gridTemplateColumns: '1fr', marginBottom: 28 },
    hero: { minHeight: 238 },
    sideHero: { display: 'none' },
    disc: { right: -25, opacity: 0.18 },
    heroTitle: { fontSize: 27 },
    grid: { gridTemplateColumns: 'repeat(2,minmax(0,1fr))' },
    sectionTitle: { fontSize: 18 },
    tabs: { marginBottom: 20, '& a': { paddingTop: 18 } },
  },
}))

function AlbumSection({ title, subtitle, type, refresh, onShuffle }) {
  const classes = useStyles()
  const text = useMusicText()
  const libraries = useSelector((state) => state.library?.selectedLibraries)
  const { data, loading, error, refetch } = useQueryWithStore({
    type: 'getList',
    resource: 'album',
    payload: {
      pagination: { page: 1, perPage: 6 },
      sort: {
        field:
          type === 'random'
            ? 'random'
            : type === 'recentlyPlayed'
              ? 'play_date'
              : 'recently_added',
        order: 'DESC',
      },
      filter: {
        ...(type === 'random' ? { seed: `discover-${refresh}` } : {}),
        ...(type === 'recentlyPlayed' ? { recently_played: true } : {}),
        ...(libraries?.length ? { library_id: libraries } : {}),
      },
      // Refresh both scan events and explicit refreshes without reusing stale results.
      refresh,
    },
  })
  const albums = Object.values(data || {})
  return (
    <section className={classes.section}>
      <div className={classes.heading}>
        <div>
          <Typography component="h2" className={classes.sectionTitle}>
            {title}
            <ChevronRight fontSize="small" />
          </Typography>
          {subtitle && <div className={classes.subtitle}>{subtitle}</div>}
        </div>
        {onShuffle ? (
          <Button
            size="small"
            className={classes.more}
            startIcon={<Refresh fontSize="small" />}
            onClick={onShuffle}
          >
            {text.shuffle}
          </Button>
        ) : (
          <Link className={classes.more} to={`/album/${type}`}>
            {text.more}
            <ChevronRight fontSize="small" />
          </Link>
        )}
      </div>
      {loading ? (
        <div className={classes.grid} aria-busy="true">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className={classes.skeleton} />
          ))}
        </div>
      ) : error ? (
        <div className={classes.message} role="alert">
          <p>{text.error}</p>
          <Button onClick={refetch}>{text.retry}</Button>
        </div>
      ) : albums.length === 0 ? (
        <div className={classes.message}>
          <HeadsetOutlined />
          <h3>{type === 'recentlyPlayed' ? text.noHistory : text.empty}</h3>
          {type !== 'recentlyPlayed' && <p>{text.emptyDescription}</p>}
        </div>
      ) : (
        <div className={classes.grid}>
          {albums.map((album) => (
            <article key={album.id} className={classes.card}>
              <div className={classes.coverWrap}>
                <Link
                  to={`/album/${album.id}/show`}
                  className={classes.artworkLink}
                  aria-label={album.name}
                >
                  <AlbumOutlined />
                  <Artwork
                    record={album}
                    title={album.name}
                    className={classes.artwork}
                  />
                </Link>
                {!album.missing && (
                  <PlayButton
                    record={album}
                    className={classes.play}
                    size="small"
                  />
                )}
              </div>
              <Link
                to={`/album/${album.id}/show`}
                className={classes.albumName}
              >
                {album.name}
              </Link>
              <div className={classes.artist}>{album.artist}</div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function MusicDiscovery() {
  const classes = useStyles()
  const text = useMusicText()
  const [refresh, setRefresh] = useState(0)
  const update = useCallback(async () => setRefresh((value) => value + 1), [])
  useRefreshOnEvents({
    events: ['album', 'song', 'library'],
    onRefresh: update,
  })
  return (
    <div className={classes.root}>
      <Title title={`Navidrome · ${text.discover}`} />
      <nav className={classes.tabs} aria-label={text.discover}>
        <Link to="/">{text.discover}</Link>
        <Link to="/album/recentlyAdded">{text.recentlyAdded}</Link>
        <Link to="/album/mostPlayed">{text.mostPlayed}</Link>
        <Link to="/playlist">{text.playlists}</Link>
        <Link to="/artist">{text.artists}</Link>
      </nav>
      <div className={classes.heroGrid}>
        <section className={classes.hero}>
          <div className={classes.disc} aria-hidden="true" />
          <p className={classes.eyebrow}>{text.heroEyebrow}</p>
          <h1 className={classes.heroTitle}>{text.heroTitle}</h1>
          <p className={classes.description}>{text.heroDescription}</p>
          <Button
            component={Link}
            to="/album/random"
            className={classes.cta}
            endIcon={<ArrowForward fontSize="small" />}
          >
            {text.explore}
          </Button>
        </section>
        <section className={`${classes.hero} ${classes.sideHero}`}>
          <div className={classes.ornament} aria-hidden="true" />
          <p className={classes.eyebrow}>{text.daily}</p>
          <h2 className={classes.heroTitle}>{text.dailyTitle}</h2>
          <p className={classes.description}>{text.dailyDescription}</p>
          <Button
            component={Link}
            to="/album/recentlyPlayed"
            className={classes.cta}
            endIcon={<ArrowForward fontSize="small" />}
          >
            {text.listenAgain}
          </Button>
        </section>
      </div>
      <AIRecommendations />
      <AlbumSection
        title={text.recommended}
        subtitle={text.subtitle}
        type="random"
        refresh={refresh}
        onShuffle={update}
      />
      <AlbumSection
        title={text.recentlyAdded}
        type="recentlyAdded"
        refresh={refresh}
      />
      <AlbumSection
        title={text.recentlyPlayed}
        type="recentlyPlayed"
        refresh={refresh}
      />
    </div>
  )
}

export default function Discover() {
  const theme = useTheme()
  return theme.cloudMusic ? <MusicDiscovery /> : <Redirect to="/album" />
}
