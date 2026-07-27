import {
  CounterList,
  MultipleCountersProgram,
  OpenedNavigation,
  StaticCounterFactClient,
  modelForNavigation,
  navigationToPath,
  urlToNavigation,
} from 'counters-core-example'
import { Match as M, Option } from 'effect'
import { Runtime } from 'foldkit'
import { type UrlRequest } from 'foldkit/navigation'
import { fromString } from 'foldkit/url'

import { overlay } from '@foldkit/devtools'

import { view } from './main'

const maybeInitialUrl = fromString(window.location.href)
const initialNavigation = Option.isSome(maybeInitialUrl)
  ? urlToNavigation(maybeInitialUrl.value)
  : CounterList.make({})
const historyReconciliation = { isActive: false }

const openedNavigationForRequest = (request: UrlRequest) =>
  M.value(request).pipe(
    M.withReturnType<ReturnType<typeof OpenedNavigation>>(),
    M.tagsExhaustive({
      Internal: ({ url }) =>
        OpenedNavigation({ navigation: urlToNavigation(url) }),
      External: ({ href }) => {
        const maybeUrl = fromString(href)
        return OpenedNavigation({
          navigation: Option.isSome(maybeUrl)
            ? urlToNavigation(maybeUrl.value)
            : CounterList.make({}),
        })
      },
    }),
  )

const application = Runtime.makeFoldkitApplication({
  program: MultipleCountersProgram,
  resources: StaticCounterFactClient,
  start: Runtime.fromModel(modelForNavigation(initialNavigation)),
  view,
  container: document.getElementById('root'),
  routing: {
    onUrlRequest: openedNavigationForRequest,
    onUrlChange: url => {
      historyReconciliation.isActive = true
      return OpenedNavigation({ navigation: urlToNavigation(url) })
    },
  },
  onModel: model => {
    const nextPath = navigationToPath(model.navigation)
    if (window.location.pathname !== nextPath) {
      if (historyReconciliation.isActive) {
        window.history.replaceState({}, '', nextPath)
      } else {
        window.history.pushState({}, '', nextPath)
      }
    }
    historyReconciliation.isActive = false
  },
  devTools: {
    overlay,
  },
})

Runtime.run(application)
