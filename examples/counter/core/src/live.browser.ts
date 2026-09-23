import { Effect } from 'effect'
import { Runtime, type Synchronization } from 'foldkit'

import { FoldkitCounterV01, Instant } from '@foldkit/instant/browser'

import { type CounterHandle, type StartCounterConfig } from './startConfig.js'
import { SyncedCounter } from './synced.js'

export {
  FoldkitCounterV01,
  InstantSnapshotLogSchema,
} from '@foldkit/instant/browser'

// NOTE: the browser engine boots from an empty snapshot so the page paints
// immediately, even offline. The Message log catches the count up through
// the subscription, so Ready can briefly show 0 before Instant answers.
const bootWithoutWaiting = (
  engine: Runtime.SyncEngine,
): Runtime.SyncEngine => ({
  processor: engine.processor,
  read: () => Effect.succeed({ snapshot: undefined, messages: [] }),
  subscribe: enqueue =>
    engine.subscribe(enqueue).pipe(Effect.forkScoped, Effect.asVoid),
  write: engine.write,
})

const engineFor = (config: StartCounterConfig): Runtime.SyncEngine => {
  if (config.tape === 'Memory') {
    return Runtime.Memory({ processor: `memory-${config.instance}` })
  } else if (config.database !== undefined) {
    return Instant({
      app: FoldkitCounterV01,
      processor: config.host,
      instance: config.instance,
      database: config.database,
    })
  } else {
    return bootWithoutWaiting(
      Instant({
        app: FoldkitCounterV01,
        processor: config.host,
        instance: config.instance,
      }),
    )
  }
}

/**
 * Starts the synced Counter in a browser or Expo Client. The tape defaults
 * to Instant.
 *
 * @example
 * ```typescript
 * const handle = startCounter({
 *   host: Processor.Host.React(),
 *   instance: newProcessorInstance(),
 * })
 * ```
 */
export const startCounter = (config: StartCounterConfig): CounterHandle =>
  startCounterOn(engineFor(config), config.policy)

/** Starts the synced Counter on an engine the caller built. */
export const startCounterOn = (
  sync: Runtime.SyncEngine,
  policy?: Synchronization.SessionPolicy,
): CounterHandle =>
  Runtime.startHandle({
    program: SyncedCounter,
    sync,
    ...(policy === undefined ? {} : { policy }),
  })
