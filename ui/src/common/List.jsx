import React from 'react'
import { ListContextProvider, ListView, useListController } from 'react-admin'
import { Redirect, useLocation } from 'react-router-dom'
import config from '../config'
import { Title } from './index'
import { LIST_BATCH_SIZE, useContinuousList } from './useContinuousList'
import ContinuousListFooter from './ContinuousListFooter'

const ContinuousList = (props) => {
  const controller = useListController({
    ...props,
    filter: props.filter || {},
    perPage: LIST_BATCH_SIZE,
  })
  const continuous = useContinuousList(controller, { filter: props.filter })
  return (
    <ListContextProvider value={continuous.context}>
      <ListView
        {...props}
        {...continuous.context}
        pagination={<ContinuousListFooter {...continuous} />}
      />
    </ListContextProvider>
  )
}

export const List = (props) => {
  const { resource } = props
  const location = useLocation()
  const query = new URLSearchParams(location.search)
  // Old bookmarked or persisted page sizes must not skip the start of a list.
  if (
    query.get('page') !== '1' ||
    query.get('perPage') !== String(LIST_BATCH_SIZE)
  ) {
    query.set('page', '1')
    query.set('perPage', String(LIST_BATCH_SIZE))
    return <Redirect to={{ ...location, search: `?${query}` }} />
  }
  return (
    <ContinuousList
      title={
        <Title
          subTitle={`resources.${resource}.name`}
          args={{ smart_count: 2 }}
        />
      }
      debounce={config.uiSearchDebounceMs}
      {...props}
      perPage={LIST_BATCH_SIZE}
    />
  )
}
