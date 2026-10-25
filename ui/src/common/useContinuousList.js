import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDataProvider, useVersion } from 'react-admin'
import { useSelector } from 'react-redux'

export const LIST_BATCH_SIZE = 100
const snapshots = new Map()
const MAX_SNAPSHOTS = 8

const emptySnapshot = (key) => ({
  key,
  ids: [],
  data: {},
  nextPage: 2,
  complete: false,
  loadingMore: false,
  error: null,
})
const restoreSnapshot = (key) => snapshots.get(key) || emptySnapshot(key)
const saveSnapshot = (value) => {
  snapshots.delete(value.key)
  snapshots.set(value.key, { ...value, loadingMore: false, error: null })
  if (snapshots.size > MAX_SNAPSHOTS)
    snapshots.delete(snapshots.keys().next().value)
}

export const useContinuousList = (
  controller,
  { filter = {}, reference } = {},
) => {
  const dataProvider = useDataProvider()
  const version = useVersion()
  const libraries = useSelector((state) => state.library?.selectedLibraries)
  const liveRecords = useSelector(
    (state) => state.admin?.resources?.[controller.resource]?.data,
  )
  const [revision, setRevision] = useState(0)
  const key = JSON.stringify([
    localStorage.getItem('userId'),
    localStorage.getItem('role'),
    controller.resource,
    controller.currentSort,
    controller.filterValues,
    filter,
    reference,
    libraries,
    version,
    revision,
  ])
  const activeKey = useRef(key)
  const generation = useRef(0)
  if (activeKey.current !== key) {
    activeKey.current = key
    generation.current += 1
  }
  const inFlight = useRef(null)
  const [snapshot, setSnapshot] = useState(() => restoreSnapshot(key))
  const current = snapshot.key === key ? snapshot : restoreSnapshot(key)
  useEffect(() => {
    setSnapshot(restoreSnapshot(key))
  }, [key])
  useEffect(
    () => () => {
      generation.current += 1
    },
    [],
  )

  const ids = useMemo(
    () => [...new Set([...(controller.ids || []), ...current.ids])],
    [controller.ids, current.ids],
  )
  const data = useMemo(
    () =>
      Object.fromEntries(
        ids.map((id) => [
          id,
          liveRecords?.[id] || controller.data?.[id] || current.data[id],
        ]),
      ),
    [ids, liveRecords, current.data, controller.data],
  )
  const hasMore = Boolean(
    controller.loaded &&
    !controller.loading &&
    !controller.error &&
    !current.complete &&
    ids.length < controller.total,
  )

  const loadMore = useCallback(async () => {
    if (
      !hasMore ||
      (inFlight.current?.key === key &&
        inFlight.current.generation === generation.current)
    )
      return
    const request = { key, generation: generation.current }
    inFlight.current = request
    setSnapshot({ ...current, loadingMore: true, error: null })
    try {
      const params = {
        pagination: { page: current.nextPage, perPage: LIST_BATCH_SIZE },
        sort: controller.currentSort,
        filter: { ...controller.filterValues, ...filter },
      }
      const response = reference
        ? await dataProvider.getManyReference(controller.resource, {
            ...params,
            ...reference,
          })
        : await dataProvider.getList(controller.resource, params)
      if (
        activeKey.current !== key ||
        generation.current !== request.generation
      )
        return
      const added = response.data.map((record) => record.id)
      const nextIds = [...new Set([...ids, ...added])]
      const next = {
        key,
        ids: [...new Set([...current.ids, ...added])],
        data: {
          ...current.data,
          ...Object.fromEntries(
            response.data.map((record) => [record.id, record]),
          ),
        },
        nextPage: current.nextPage + 1,
        complete:
          response.data.length < LIST_BATCH_SIZE ||
          nextIds.length >= (response.total ?? controller.total) ||
          nextIds.length === ids.length,
        loadingMore: false,
        error: null,
      }
      saveSnapshot(next)
      setSnapshot(next)
    } catch (error) {
      if (
        activeKey.current === key &&
        generation.current === request.generation
      )
        setSnapshot({ ...current, loadingMore: false, error })
    } finally {
      if (inFlight.current === request) inFlight.current = null
    }
  }, [
    controller.resource,
    controller.currentSort,
    controller.filterValues,
    controller.total,
    current,
    dataProvider,
    filter,
    hasMore,
    ids,
    key,
    reference,
  ])

  const baseRefetch = controller.refetch
  const refetch = useCallback(() => {
    setRevision((value) => value + 1)
    return baseRefetch?.()
  }, [baseRefetch])

  return {
    context: { ...controller, ids, data, refetch },
    loadingMore: current.loadingMore,
    error: current.error,
    hasMore,
    loadMore,
  }
}
