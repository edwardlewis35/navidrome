import { useEffect, useRef } from 'react'
import {
  Button,
  CircularProgress,
  Typography,
  makeStyles,
} from '@material-ui/core'
import { useTranslate } from 'react-admin'

const useStyles = makeStyles((theme) => ({
  root: { minHeight: 64, padding: theme.spacing(2), textAlign: 'center' },
  status: { color: theme.palette.text.secondary, fontSize: 12 },
  error: { color: theme.palette.error.main, marginBottom: theme.spacing(1) },
}))

export default function ContinuousListFooter({
  context,
  hasMore,
  loadingMore,
  error,
  loadMore,
}) {
  const classes = useStyles()
  const translate = useTranslate()
  const sentinel = useRef(null)
  useEffect(() => {
    if (!hasMore || loadingMore || error || !sentinel.current) return
    if (typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) loadMore()
        },
        { rootMargin: '600px' },
      )
      observer.observe(sentinel.current)
      return () => observer.disconnect()
    }
    const check = () => {
      if (
        sentinel.current?.getBoundingClientRect().top <=
        window.innerHeight + 600
      )
        loadMore()
    }
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    check()
    return () => {
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
  }, [hasMore, loadingMore, error, loadMore])

  if (!context.loaded || context.total === 0) return null
  return (
    <div ref={sentinel} className={classes.root}>
      {error && (
        <Typography className={classes.error} role="alert">
          {translate('message.continuousLoadFailed')}
        </Typography>
      )}
      {loadingMore ? (
        <CircularProgress
          size={22}
          aria-label={translate('message.continuousLoading')}
        />
      ) : (
        (hasMore || error) && (
          <Button onClick={loadMore}>
            {translate(
              error ? 'message.continuousRetry' : 'message.continuousLoadMore',
            )}
          </Button>
        )
      )}
      <Typography className={classes.status} aria-live="polite">
        {translate('message.continuousCount', {
          loaded: context.ids.length,
          total: context.total,
        })}
      </Typography>
    </div>
  )
}
