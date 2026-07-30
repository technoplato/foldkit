import { Match as M } from 'effect'
import { Runtime } from 'foldkit'
import { type UrlRequest } from 'foldkit/navigation'
import { toString as urlToString } from 'foldkit/url'
import {
  IssueTrackerProgram,
  OpenedNavigation,
  StaticIssueTrackerResources,
  makeLiveIssueTrackerResources,
  modelForNavigation,
  navigationToPath,
  pathToNavigation,
} from 'issues-core-example'

import { overlay } from '@foldkit/devtools'
import { InstantToolsSchema } from '@foldkit/instant-tools/instant'
import { init } from '@instantdb/core'

import './styles.css'
import { view } from './view.js'

const appId = import.meta.env['VITE_INSTANT_APP_ID']
const resources =
  appId === undefined || appId === ''
    ? StaticIssueTrackerResources
    : makeLiveIssueTrackerResources(init({ appId, schema: InstantToolsSchema }))
const initialNavigation = pathToNavigation(window.location.href)
const historyReconciliation = { isActive: false }

const openedNavigationForRequest = (request: UrlRequest) =>
  M.value(request).pipe(
    M.withReturnType<ReturnType<typeof OpenedNavigation.make>>(),
    M.tagsExhaustive({
      Internal: ({ url }) =>
        OpenedNavigation.make({
          navigation: pathToNavigation(urlToString(url)),
        }),
      External: ({ href }) =>
        OpenedNavigation.make({ navigation: pathToNavigation(href) }),
    }),
  )

const application = Runtime.makeFoldkitApplication({
  container: document.getElementById('root'),
  devTools: { overlay },
  onModel: model => {
    const nextPath = navigationToPath(model.navigation)
    if (window.location.pathname !== nextPath) {
      window.history[
        historyReconciliation.isActive ? 'replaceState' : 'pushState'
      ]({}, '', nextPath)
    }
    historyReconciliation.isActive = false
  },
  program: IssueTrackerProgram,
  resources,
  routing: {
    onUrlChange: url => {
      historyReconciliation.isActive = true
      return OpenedNavigation.make({
        navigation: pathToNavigation(urlToString(url)),
      })
    },
    onUrlRequest: openedNavigationForRequest,
  },
  start: Runtime.fromModel(modelForNavigation(initialNavigation)),
  view,
})

Runtime.run(application)
