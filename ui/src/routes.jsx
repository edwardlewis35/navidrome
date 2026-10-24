import React from 'react'
import { Route } from 'react-router-dom'
import Personal from './personal/Personal'
import TrashPage from './trash/TrashPage'
import UploadPage from './upload/UploadPage'
import AISettings from './ai/AISettings'
import OnlineCoverSettings from './covers/OnlineCoverSettings'

const routes = [
  <Route exact path="/personal" render={() => <Personal />} key={'personal'} />,
  <Route exact path="/trash" render={() => <TrashPage />} key="trash" />,
  <Route exact path="/upload" render={() => <UploadPage />} key="upload" />,
  <Route
    exact
    path="/covers/settings"
    render={() => <OnlineCoverSettings />}
    key="cover-settings"
  />,
  <Route
    exact
    path="/ai/settings"
    render={() => <AISettings />}
    key="ai-settings"
  />,
]

export default routes
