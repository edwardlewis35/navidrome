import { useState } from 'react'
import { Link, useHistory } from 'react-router-dom'
import { IconButton, InputBase, makeStyles } from '@material-ui/core'
import { AlbumOutlined, ChevronLeft, Search } from '@material-ui/icons'
import useMusicText from './useMusicText'

const useStyles = makeStyles((theme) => ({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: 24,
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  brand: {
    color: 'inherit',
    textDecoration: 'none',
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: '-0.7px',
    minWidth: 166,
    flexShrink: 0,
  },
  mark: {
    border: '2px solid currentColor',
    borderRadius: '50%',
    padding: 3,
    fontSize: 30,
  },
  search: {
    display: 'flex',
    alignItems: 'center',
    borderRadius: 24,
    background: 'rgba(255,255,255,.17)',
    padding: '0 8px 0 16px',
    width: 290,
    maxWidth: '100%',
    minWidth: 0,
    flexShrink: 1,
    boxSizing: 'border-box',
    height: 36,
    '& input': { color: '#fff', fontSize: 13 },
    '& input::placeholder': { opacity: 0.8, color: '#fff' },
  },
  back: {
    color: 'inherit',
    background: 'rgba(0,0,0,.06)',
    padding: 4,
    flexShrink: 0,
  },
  submit: { color: 'inherit', padding: 6 },
  [theme.breakpoints.down('sm')]: {
    root: { gap: 12 },
    brand: { minWidth: 0, fontSize: 18 },
    search: { width: 220 },
    back: { display: 'none' },
  },
  [theme.breakpoints.down('xs')]: {
    root: { gap: 8 },
    brand: { '& span': { display: 'none' } },
    mark: { fontSize: 27 },
    search: { flex: 1, width: 'auto', maxWidth: 220 },
  },
}))

export default function MusicHeader() {
  const classes = useStyles()
  const text = useMusicText()
  const history = useHistory()
  const [query, setQuery] = useState('')
  const search = (event) => {
    event.preventDefault()
    if (!query.trim()) return
    const params = new URLSearchParams({
      filter: JSON.stringify({ title: query.trim() }),
      page: '1',
    })
    history.push(`/song?${params}`)
  }
  return (
    <div className={classes.root}>
      <Link to="/" className={classes.brand} aria-label="Navidrome">
        <AlbumOutlined className={classes.mark} />
        <span>Navidrome</span>
      </Link>
      <IconButton
        className={classes.back}
        onClick={() => history.goBack()}
        aria-label={text.back}
      >
        <ChevronLeft />
      </IconButton>
      <form className={classes.search} role="search" onSubmit={search}>
        <InputBase
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={text.search}
          inputProps={{ 'aria-label': text.search, maxLength: 200 }}
          fullWidth
        />
        <IconButton
          type="submit"
          className={classes.submit}
          aria-label={text.searchButton}
        >
          <Search fontSize="small" />
        </IconButton>
      </form>
    </div>
  )
}
