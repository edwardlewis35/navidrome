import { act, renderHook } from '@testing-library/react-hooks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useContinuousList } from './useContinuousList'

const mocks = vi.hoisted(() => ({
  provider: { getList: vi.fn(), getManyReference: vi.fn() },
  version: 0,
  libraries: [],
  liveData: {},
  resource: '',
}))
vi.mock('react-admin', () => ({
  useDataProvider: () => mocks.provider,
  useVersion: () => mocks.version,
}))
vi.mock('react-redux', () => ({
  useSelector: (selector) =>
    selector({
      library: { selectedLibraries: mocks.libraries },
      admin: { resources: { [mocks.resource]: { data: mocks.liveData } } },
    }),
}))

let sequence = 0
const records = (start, count) =>
  Array.from({ length: count }, (_, index) => ({
    id: `song-${start + index}`,
    title: `Song ${start + index}`,
  }))
const controller = () => {
  const first = records(0, 100)
  mocks.resource = `songs-test-${++sequence}`
  return {
    resource: mocks.resource,
    ids: first.map((item) => item.id),
    data: Object.fromEntries(first.map((item) => [item.id, item])),
    total: 205,
    loaded: true,
    loading: false,
    currentSort: { field: 'title', order: 'ASC' },
    filterValues: { title: 'jazz' },
    selectedIds: ['song-4'],
    onSelect: vi.fn(),
    refetch: vi.fn(),
  }
}

describe('continuous list loading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mocks.version = 0
    mocks.libraries = []
    mocks.liveData = {}
  })

  it('appends bounded batches in order, keeps selection and stops at the final record', async () => {
    mocks.provider.getList
      .mockResolvedValueOnce({ data: records(100, 100), total: 205 })
      .mockResolvedValueOnce({ data: records(200, 5), total: 205 })
    const base = controller()
    const { result } = renderHook(() =>
      useContinuousList(base, { filter: { seed: 'stable-roll' } }),
    )
    await act(async () => result.current.loadMore())
    expect(mocks.provider.getList).toHaveBeenLastCalledWith(base.resource, {
      pagination: { page: 2, perPage: 100 },
      sort: base.currentSort,
      filter: { title: 'jazz', seed: 'stable-roll' },
    })
    expect(result.current.context.ids).toHaveLength(200)
    expect(result.current.context.ids.slice(98, 102)).toEqual([
      'song-98',
      'song-99',
      'song-100',
      'song-101',
    ])
    expect(result.current.context.selectedIds).toBe(base.selectedIds)
    await act(async () => result.current.loadMore())
    expect(result.current.context.ids).toHaveLength(205)
    expect(result.current.hasMore).toBe(false)
    await act(async () => result.current.loadMore())
    expect(mocks.provider.getList).toHaveBeenCalledTimes(2)
  })

  it('deduplicates overlaps without losing existing rows', async () => {
    mocks.provider.getList.mockResolvedValue({
      data: records(99, 100),
      total: 205,
    })
    const base = controller()
    const { result } = renderHook(() => useContinuousList(base))
    await act(async () => result.current.loadMore())
    expect(result.current.context.ids).toHaveLength(199)
    expect(new Set(result.current.context.ids).size).toBe(199)
  })

  it('keeps optimistic favourite and metadata updates live on appended rows', async () => {
    mocks.provider.getList.mockResolvedValue({
      data: records(100, 100),
      total: 205,
    })
    const base = controller()
    const { result, rerender } = renderHook(() => useContinuousList(base))
    await act(async () => result.current.loadMore())
    mocks.liveData = {
      'song-140': { id: 'song-140', title: 'Updated title', starred: true },
    }
    rerender()
    expect(result.current.context.data['song-140']).toEqual(
      mocks.liveData['song-140'],
    )
    expect(result.current.context.ids).toHaveLength(200)
  })

  it('ignores duplicate triggers and discards a stale response when the search changes', async () => {
    let resolve
    mocks.provider.getList.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const base = controller()
    const { result, rerender } = renderHook(
      ({ value }) => useContinuousList(value),
      { initialProps: { value: base } },
    )
    let pending
    act(() => {
      pending = result.current.loadMore()
      result.current.loadMore()
    })
    expect(mocks.provider.getList).toHaveBeenCalledOnce()
    expect(result.current.loadingMore).toBe(true)
    const replacement = {
      ...base,
      filterValues: { title: 'classical' },
      ids: ['new-search'],
      data: { 'new-search': { id: 'new-search' } },
    }
    rerender({ value: replacement })
    await act(async () => {
      resolve({ data: records(100, 100), total: 205 })
      await pending
    })
    expect(result.current.context.ids).toEqual(['new-search'])
    expect(result.current.loadingMore).toBe(false)
  })

  it('preserves rows after errors and retries exactly the failed batch', async () => {
    mocks.provider.getList
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce({ data: records(100, 100), total: 205 })
    const base = controller()
    const { result } = renderHook(() => useContinuousList(base))
    await act(async () => result.current.loadMore())
    expect(result.current.error.message).toBe('Offline')
    expect(result.current.context.ids).toEqual(base.ids)
    await act(async () => result.current.loadMore())
    expect(
      mocks.provider.getList.mock.calls.map(
        ([, params]) => params.pagination.page,
      ),
    ).toEqual([2, 2])
    expect(result.current.context.ids).toHaveLength(200)
    expect(result.current.error).toBeNull()
  })

  it('can return to a query while its obsolete request is still pending', async () => {
    const requests = []
    mocks.provider.getList.mockImplementation(
      () => new Promise((resolve) => requests.push(resolve)),
    )
    const base = controller()
    const { result, rerender } = renderHook(
      ({ value }) => useContinuousList(value),
      { initialProps: { value: base } },
    )
    let obsolete
    let fresh
    act(() => {
      obsolete = result.current.loadMore()
    })
    rerender({ value: { ...base, filterValues: { title: 'different' } } })
    rerender({ value: base })
    act(() => {
      fresh = result.current.loadMore()
    })
    expect(mocks.provider.getList).toHaveBeenCalledTimes(2)
    await act(async () => {
      requests[0]({ data: records(100, 100), total: 205 })
      await obsolete
      requests[1]({
        data: records(100, 100).map((record) => ({
          ...record,
          title: 'Fresh',
        })),
        total: 205,
      })
      await fresh
    })
    expect(result.current.context.data['song-140'].title).toBe('Fresh')
    expect(result.current.context.ids).toHaveLength(200)
  })

  it.each(['sort', 'library', 'refresh', 'identity'])(
    'resets appended rows after %s changes',
    async (change) => {
      mocks.provider.getList.mockResolvedValue({
        data: records(100, 100),
        total: 205,
      })
      const base = controller()
      const { result, rerender } = renderHook(
        ({ value }) => useContinuousList(value),
        { initialProps: { value: base } },
      )
      await act(async () => result.current.loadMore())
      expect(result.current.context.ids).toHaveLength(200)
      let next = base
      if (change === 'sort')
        next = { ...base, currentSort: { field: 'year', order: 'DESC' } }
      if (change === 'library') mocks.libraries = ['another-library']
      if (change === 'refresh') mocks.version += 1
      if (change === 'identity') localStorage.setItem('userId', 'another-user')
      rerender({ value: next })
      expect(result.current.context.ids).toEqual(base.ids)
    },
  )

  it('clears appended rows on local refetch and reloads without duplication', async () => {
    mocks.provider.getList.mockResolvedValue({
      data: records(100, 100),
      total: 205,
    })
    const base = controller()
    const { result } = renderHook(() => useContinuousList(base))
    await act(async () => result.current.loadMore())
    act(() => result.current.context.refetch())
    expect(base.refetch).toHaveBeenCalledOnce()
    expect(result.current.context.ids).toEqual(base.ids)
    await act(async () => result.current.loadMore())
    expect(result.current.context.ids).toHaveLength(200)
    expect(
      mocks.provider.getList.mock.calls.map(
        ([, params]) => params.pagination.page,
      ),
    ).toEqual([2, 2])
  })

  it('retains appended batches when returning from a detail page', async () => {
    mocks.provider.getList.mockResolvedValue({
      data: records(100, 100),
      total: 205,
    })
    const base = controller()
    const first = renderHook(() => useContinuousList(base))
    await act(async () => first.result.current.loadMore())
    first.unmount()
    const returned = renderHook(() => useContinuousList(base))
    expect(returned.result.current.context.ids).toHaveLength(200)
    expect(returned.result.current.context.data['song-140'].title).toBe(
      'Song 140',
    )
    expect(mocks.provider.getList).toHaveBeenCalledOnce()
  })

  it('loads reference lists with the original parent identity and relation filter', async () => {
    mocks.provider.getManyReference.mockResolvedValue({
      data: records(100, 100),
      total: 205,
    })
    const base = controller()
    const { result } = renderHook(() =>
      useContinuousList(base, {
        reference: { target: 'playlist_id', id: 'playlist-7' },
        filter: { playlist_id: 'playlist-7' },
      }),
    )
    await act(async () => result.current.loadMore())
    expect(mocks.provider.getManyReference).toHaveBeenCalledWith(
      base.resource,
      {
        target: 'playlist_id',
        id: 'playlist-7',
        pagination: { page: 2, perPage: 100 },
        sort: base.currentSort,
        filter: { title: 'jazz', playlist_id: 'playlist-7' },
      },
    )
    expect(mocks.provider.getList).not.toHaveBeenCalled()
  })
})
