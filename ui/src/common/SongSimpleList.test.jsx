import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SongSimpleList } from './SongSimpleList'
const mocks = vi.hoisted(() => ({ dispatch: vi.fn() }))
vi.mock('react-redux', () => ({ useDispatch: () => mocks.dispatch }))
vi.mock('react-admin', () => ({
  sanitizeListRestProps: () => ({}),
  useTranslate: () => () => 'Select song',
}))
vi.mock('./index', () => ({
  DurationField: () => null,
  SongContextMenu: () => null,
  RatingField: () => null,
}))
vi.mock('../config', () => ({ default: { enableStarRating: false } }))
describe('mobile song selection', () => {
  it('selects independently without playing the row and reflects selection state', () => {
    const toggle = vi.fn()
    const props = {
      data: { s1: { id: 's1', title: 'One', artist: 'Artist' } },
      ids: ['s1'],
      total: 1,
      hasBulkActions: true,
      onToggleItem: toggle,
      selectedIds: [],
    }
    const { rerender } = render(<SongSimpleList {...props} />)
    const checkbox = screen.getByRole('checkbox', { name: 'Select song One' })
    fireEvent.click(checkbox)
    expect(toggle).toHaveBeenCalledWith('s1')
    expect(mocks.dispatch).not.toHaveBeenCalled()
    rerender(<SongSimpleList {...props} selectedIds={['s1']} />)
    expect(screen.getByRole('checkbox')).toBeChecked()
  })
})
