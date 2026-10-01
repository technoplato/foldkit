import { Runtime } from 'foldkit'

import { FoldkitCounterV01, resolveInstantSyncEngine } from '@foldkit/instant'

import { type CounterHandle, type StartCounterConfig } from './startConfig.js'
import { SyncedCounter } from './synced.js'

export { FoldkitCounterV01, InstantSnapshotLogSchema } from '@foldkit/instant'

const engineFor = (config: StartCounterConfig): Runtime.SyncEngine =>
  config.tape === 'Memory'
    ? Runtime.Memory({ processor: `memory-${config.instance}` })
    : resolveInstantSyncEngine({
        app: FoldkitCounterV01,
        processor: config.host,
        instance: config.instance,
      })

/**
 * Starts the synced Counter on Node. Without `tape: 'Memory'`, the
 * environment chooses: `COUNTER_TAPE=memory` keeps the count in this
 * process, `COUNTER_TAPE_PATH` uses a file tape, and otherwise the Processor
 * joins the shared Instant tape.
 *
 * @example
 * ```typescript
 * const handle = startCounter({
 *   host: Processor.Host.Cli(),
 *   instance: newProcessorInstance(),
 * })
 * ```
 */
export const startCounter = (config: StartCounterConfig): CounterHandle =>
  startCounterOn(engineFor(config))

/** Starts the synced Counter on an engine the caller built. */
export const startCounterOn = (sync: Runtime.SyncEngine): CounterHandle =>
  Runtime.startHandle({ program: SyncedCounter, sync })
