import { render, screen } from '@testing-library/react'
import { Router } from 'react-router-dom'
import { createMemoryHistory } from 'history'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { List } from './List'

const mocks = vi.hoisted(() => ({ controller: vi.fn() }))
vi.mock('react-redux', () => ({ useSelector: () => [] }))
vi.mock('react-admin', async (importOriginal) => ({
  ...(await importOriginal()),
  useDataProvider: () => ({}),
  useVersion: () => 0,
  useListController: (props) => mocks.controller(props),
  ListView: ({ children, pagination }) => (
    <div data-testid="continuous-list">
      {children}
      {pagination}
    </div>
  ),
  useTranslate: () => (key) => key,
}))

describe('continuous List integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.controller.mockImplementation((props) => ({
      resource: props.resource,
      currentSort: props.sort,
      filterValues: props.filter || {},
      ids: [],
      data: {},
      total: 0,
      loaded: true,
      loading: false,
      selectedIds: [],
    }))
  })

  it('normalizes old pagination URLs while retaining search, sort and filter', async () => {
    const history = createMemoryHistory({
      initialEntries: [
        '/song?sort=year&order=DESC&filter=%7B%22title%22%3A%22Jazz%22%7D&page=8&perPage=25',
      ],
    })
    render(
      <Router history={history}>
        <List
          resource="song"
          perPage={15}
          pagination={<div>old pagination</div>}
        >
          <div>all songs</div>
        </List>
      </Router>,
    )
    await screen.findByTestId('continuous-list')
    const params = new URLSearchParams(history.location.search)
    expect(params.get('page')).toBe('1')
    expect(params.get('perPage')).toBe('100')
    expect(params.get('sort')).toBe('year')
    expect(params.get('order')).toBe('DESC')
    expect(JSON.parse(params.get('filter'))).toEqual({ title: 'Jazz' })
    expect(screen.queryByText('old pagination')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText('all songs')).toBeInTheDocument()
    mocks.controller.mock.calls.forEach(([props]) =>
      expect(props.perPage).toBe(100),
    )
  })

  it('starts a bare list at its first bounded batch', async () => {
    const history = createMemoryHistory({ initialEntries: ['/album/all'] })
    render(
      <Router history={history}>
        <List resource="album">
          <div>albums</div>
        </List>
      </Router>,
    )
    await screen.findByText('albums')
    expect(history.location.pathname).toBe('/album/all')
    expect(new URLSearchParams(history.location.search).get('perPage')).toBe(
      '100',
    )
  })
})
