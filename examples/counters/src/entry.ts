import {
  MultipleCountersProgram,
  StaticCounterFactClient,
  navigationToPath,
} from 'counters-core-example'
import { Runtime } from 'foldkit'

import { overlay } from '@foldkit/devtools'

import { startInstantCounters } from './instantHost'
import { makeView } from './main'

const instantAppId = import.meta.env.VITE_INSTANT_APP_ID

if (typeof instantAppId === 'string' && instantAppId !== '') {
  startInstantCounters(instantAppId)
} else {
  const [initialModel] = MultipleCountersProgram.init()
  const historyReconciliation = { isActive: false }
  const initialModelObservation = { isPending: true }

  const view = makeView({
    reconcileNavigationCarrier: () => {
      historyReconciliation.isActive = true
    },
  })

  const application = Runtime.makeFoldkitApplication({
    program: MultipleCountersProgram,
    resources: StaticCounterFactClient,
    start: Runtime.fromModel(initialModel),
    view,
    container: document.getElementById('root'),
    onModel: model => {
      if (initialModelObservation.isPending) {
        initialModelObservation.isPending = false
        return
      }
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
}
