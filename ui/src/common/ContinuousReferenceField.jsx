import { cloneElement } from 'react'
import {
  ListContextProvider,
  ReferenceManyField,
  useListContext,
  useRecordContext,
} from 'react-admin'
import { LIST_BATCH_SIZE, useContinuousList } from './useContinuousList'
import ContinuousListFooter from './ContinuousListFooter'

const ReferenceContent = ({ children, filter, reference }) => {
  const controller = useListContext()
  const continuous = useContinuousList(controller, { filter, reference })
  return (
    <ListContextProvider value={continuous.context}>
      {cloneElement(children, continuous.context)}
      <ContinuousListFooter {...continuous} />
    </ListContextProvider>
  )
}

export const ContinuousReferenceField = ({ children, ...props }) => {
  const record = useRecordContext(props)
  const reference = { target: props.target, id: record?.[props.source || 'id'] }
  return (
    <ReferenceManyField {...props} perPage={LIST_BATCH_SIZE} pagination={null}>
      <ReferenceContent filter={props.filter} reference={reference}>
        {children}
      </ReferenceContent>
    </ReferenceManyField>
  )
}
