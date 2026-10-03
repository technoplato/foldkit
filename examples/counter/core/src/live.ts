import { Runtime } from 'foldkit'
import { localSnapshotFile, localSnapshotPath } from 'foldkit/cli'

import { FoldkitCounterV01, resolveInstantSyncEngine } from '@foldkit/instant'

import {
  type CounterHandle,
  type StartCounterConfig,
  counterLocalSnapshotKey,
} from './startConfig.js'
import { SyncedCounter } from './synced.js'

export { FoldkitCounterV01, InstantSnapshotLogSchema } from '@foldkit/instant'

/**
 * The sync engine a Node Counter runs on, chosen as `startCounter`
 * chooses it, for a host that reads the log without running the Counter,
 * such as `counter tail`.
 *
 * @example
 * ```typescript
 * counterEngine({ host: Processor.Host.Cli(), instance: newProcessorInstance() })
 * ```
 */
export const counterEngine = (config: StartCounterConfig): Runtime.SyncEngine =>
  engineFor(config)

const engineFor = (config: StartCounterConfig): Runtime.SyncEngine =>
  config.tape === 'Memory'
    ? Runtime.Memory({ processor: `memory-${config.instance}` })
    : resolveInstantSyncEngine({
        app: FoldkitCounterV01,
        processor: config.host,
        instance: config.instance,
      })

const localSnapshotFor = (
  config: StartCounterConfig,
): Runtime.LocalSnapshotStore | undefined => {
  const isInstantTape =
    config.tape !== 'Memory' &&
    process.env['COUNTER_TAPE'] !== 'memory' &&
    process.env['COUNTER_TAPE_PATH'] === undefined
  if (!isInstantTape) {
    return undefined
  } else if (config.localSnapshot !== undefined) {
    return config.localSnapshot
  } else {
    return localSnapshotFile(localSnapshotPath(counterLocalSnapshotKey))
  }
}

/**
 * Starts the synced Counter on Node. Without `tape: 'Memory'`, the
 * environment chooses: `COUNTER_TAPE=memory` keeps the count in this
 * process, `COUNTER_TAPE_PATH` uses a file tape, and otherwise the Processor
 * joins the shared Instant tape. On the Instant tape it keeps a local
 * snapshot in `~/.cache/foldkit/foldkit-counter-v01.json`, so a new run
 * folds only the rows written since the last one.
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
  startCounterOn(engineFor(config), localSnapshotFor(config))

/** Starts the synced Counter on an engine the caller built. */
export const startCounterOn = (
  sync: Runtime.SyncEngine,
  localSnapshot?: Runtime.LocalSnapshotStore,
): CounterHandle =>
  Runtime.startHandle({
    program: SyncedCounter,
    sync,
    ...(localSnapshot === undefined ? {} : { localSnapshot }),
  })
