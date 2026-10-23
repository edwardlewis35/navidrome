import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ContinuousListFooter from './ContinuousListFooter'
import en from '../i18n/en.json'

vi.mock('react-admin', () => ({
  useTranslate:
    () =>
    (key, args = {}) => {
      const message =
        key.split('.').reduce((value, part) => value?.[part], en) || key
      return message.replace(
        /%\{(\w+)\}/g,
        (match, name) => args[name] ?? match,
      )
    },
}))

let observers
let top
const options = () => ({
  context: { ids: ['one', 'two'], total: 203, loaded: true },
  hasMore: true,
  loadingMore: false,
  error: null,
  loadMore: vi.fn(),
})

describe('continuous loading scroll trigger', () => {
  beforeEach(() => {
    observers = []
    top = 2000
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ top }),
    )
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback, config) {
          this.callback = callback
          this.config = config
          this.observe = vi.fn()
          this.disconnect = vi.fn()
          observers.push(this)
        }
      },
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('automatically loads when the viewport approaches the footer above the fixed player', () => {
    const props = options()
    render(<ContinuousListFooter {...props} />)
    expect(observers[0].config).toEqual({ rootMargin: '600px' })
    expect(observers[0].observe).toHaveBeenCalledOnce()
    act(() => observers[0].callback([{ isIntersecting: false }]))
    expect(props.loadMore).not.toHaveBeenCalled()
    act(() => observers[0].callback([{ isIntersecting: true }]))
    expect(props.loadMore).toHaveBeenCalledOnce()
    expect(screen.getByText('2 of 203 items loaded')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('falls back to window scrolling without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const props = options()
    render(<ContinuousListFooter {...props} />)
    expect(props.loadMore).not.toHaveBeenCalled()
    top = 100
    fireEvent.scroll(window)
    expect(props.loadMore).toHaveBeenCalledOnce()
  })

  it('pauses automatic loading on errors and offers an explicit retry', () => {
    const props = options()
    render(<ContinuousListFooter {...props} error={new Error('offline')} />)
    expect(observers).toHaveLength(0)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load more items.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(props.loadMore).toHaveBeenCalledOnce()
  })

  it('disconnects the observer while loading and after the final batch', () => {
    const props = options()
    const { rerender } = render(<ContinuousListFooter {...props} />)
    rerender(<ContinuousListFooter {...props} loadingMore />)
    expect(observers[0].disconnect).toHaveBeenCalledOnce()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    rerender(<ContinuousListFooter {...props} hasMore={false} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(observers).toHaveLength(1)
  })
})
