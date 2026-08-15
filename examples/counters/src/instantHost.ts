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

/** Turns a thrown Instant or attach failure into host chrome text. */
export const describeCountersHostError = (error: unknown): string => {
  if (error instanceof Error && error.message !== '') {
    return error.message
  }
  return 'Instant could not open the Multiple Counters tape.'
}

/** Paints Instant or attach failure. The page must not stay blank. */
export const paintCountersHostFailure = (
  container: HTMLElement,
  error: unknown,
): void => {
  container.replaceChildren()
  const status = document.createElement('p')
  status.textContent = describeCountersHostError(error)
  container.append(status)
}

/** Starts the Foldkit Processor on the live Instant Multiple Counters tape. */
export const startInstantCounters = (appId: string): void => {
  const container = document.getElementById('root')
  if (container === null) {
    throw new Error('Root element not found')
  }
  const started = Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const tape = yield* openBrowserCountersTape(
          appId,
          countersProcessorIds.foldkit,
        )
        if (tape === null) {
          return yield* Effect.fail(
            new Error('Instant has no Multiple Counters demo session.'),
          )
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
          container,
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
  started.then(
    () => undefined,
    error => {
      paintCountersHostFailure(container, error)
    },
  )
}
