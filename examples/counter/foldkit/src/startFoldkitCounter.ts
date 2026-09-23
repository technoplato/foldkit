import {
  SyncedCounter,
  type SyncedCounterModel,
  bindCounter,
  newProcessorInstance,
  startCounter,
  syncPolicyOf,
} from 'counter-core-example'
import { Effect, Exit, Option, Scope } from 'effect'
import { Interaction, Processor, Runtime } from 'foldkit'
import { type Document } from 'foldkit/html'

/**
 * Starts the Foldkit HTML Counter: one synced Counter, a Foldkit view
 * attached to it, and document keys routed through the generic
 * interaction. `?sync=shared-domain` keeps the menu on this tab.
 */
export const startFoldkitCounter = (
  view: (model: SyncedCounterModel) => Document,
): void => {
  const container = document.getElementById('root')
  if (container === null) {
    throw new Error('Root element not found')
  }
  const searchParams = new URLSearchParams(window.location.search)
  const handle = startCounter({
    host: Processor.Host.Foldkit(),
    instance: newProcessorInstance(),
    tape: import.meta.env.VITE_COUNTER_TAPE === 'memory' ? 'Memory' : 'Instant',
    ...Option.match(syncPolicyOf(searchParams.get('sync') ?? ''), {
      onNone: () => ({}),
      onSome: policy => ({ policy }),
    }),
  })
  const bound = bindCounter(handle)
  const scope = Effect.runSync(Scope.make())
  Effect.runFork(
    Runtime.makeAttachedFoldkitApplication({
      ClientInput: Interaction.Gesture,
      container,
      program: SyncedCounter,
      sendClientInput: gesture => {
        Interaction.applyGesture(bound, gesture)
      },
      source: {
        readModel: handle.readModel,
        subscribe: listener =>
          handle.subscribe(() => {
            listener(handle.readModel())
          }),
      },
      view,
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
  const stopKeys = Interaction.listenToDocumentKeys(bound, document)
  const hot = import.meta.hot
  if (hot !== undefined) {
    hot.dispose(() => {
      stopKeys()
      Effect.runFork(Scope.close(scope, Exit.void))
      void handle.stop()
    })
  }
}
