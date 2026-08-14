import {
  Message,
  MultipleCountersProgram,
  navigationToPath,
} from 'counters-core-example'
import {
  countersProcessorIds,
  instantCountersResources,
  observeRemoteCountersTape,
  openBrowserCountersTape,
  openCountersTapeRuntime,
} from 'counters-instant-example'
import { Effect } from 'effect'
import { Runtime } from 'foldkit'

import { makeView } from './main'

/** Starts the Foldkit Processor on the live Instant Multiple Counters tape. */
export const startInstantCounters = (appId: string): void => {
  void Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const tape = yield* openBrowserCountersTape(
          appId,
          countersProcessorIds.foldkit,
        )
        if (tape === null) {
          return
        }
        const { runtime, sendClientInput } = yield* openCountersTapeRuntime(
          tape,
          instantCountersResources,
        )
        const historyReconciliation = { isActive: false }
        const initialModelObservation = { isPending: true }
        const view = makeView({
          reconcileNavigationCarrier: () => {
            historyReconciliation.isActive = true
          },
        })
        runtime.observeModel(model => {
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
        })
        yield* Runtime.makeAttachedFoldkitApplication({
          ClientInput: Message,
          container: document.getElementById('root'),
          program: MultipleCountersProgram,
          sendClientInput,
          source: {
            readModel: () => runtime.readModel(),
            subscribe: listener => runtime.observeModel(listener),
          },
          view,
        })
        yield* observeRemoteCountersTape(
          tape,
          runtime,
          countersProcessorIds.foldkit,
        ).pipe(Effect.forkChild)
        return yield* Effect.never
      }),
    ),
  )
}
