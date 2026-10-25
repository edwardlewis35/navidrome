import { LIST_BATCH_SIZE } from './useContinuousList'

// Whole-album actions still operate on the entire album, even when only its
// first screen has rendered. Keep each metadata request bounded as well.
export const getCompleteList = async (dataProvider, resource, params) => {
  const records = []
  const seen = new Set()
  for (let page = 1; ; page += 1) {
    const response = await dataProvider.getList(resource, {
      ...params,
      pagination: { page, perPage: LIST_BATCH_SIZE },
    })
    const previousCount = records.length
    response.data.forEach((record) => {
      if (!seen.has(record.id)) {
        seen.add(record.id)
        records.push(record)
      }
    })
    if (
      response.data.length < LIST_BATCH_SIZE ||
      records.length >= response.total
    )
      return records
    if (records.length === previousCount)
      throw new Error('List request did not advance')
  }
}
