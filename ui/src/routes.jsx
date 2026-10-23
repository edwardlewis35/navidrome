import React from 'react'
import { Route } from 'react-router-dom'
import Personal from './personal/Personal'
import TrashPage from './trash/TrashPage'

const routes = [
  <Route exact path="/personal" render={() => <Personal />} key={'personal'} />,
  <Route exact path="/trash" render={() => <TrashPage />} key="trash" />,
]

export default routes
