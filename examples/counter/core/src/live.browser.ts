import { type Processor, Runtime } from 'foldkit'

import { Instant, SharedInstantProject } from '@foldkit/instant/browser'

import { type CounterHandle, type StartCounterConfig } from './startConfig.js'
import { SyncedCounter } from './synced.js'

export {
  SharedInstantProject,
  InstantSnapshotLogSchema,
} from '@foldkit/instant/browser'

const engineFor = (config: StartCounterConfig): Runtime.SyncEngine => {
  if (config.tape === 'Memory') {
    return Runtime.Memory({ processor: `memory-${config.instance}` })
  } else if (config.database !== undefined) {
    return Instant({
      app: SharedInstantProject,
      processor: config.host,
      instance: config.instance,
      database: config.database,
    })
  } else {
    return Instant({
      app: SharedInstantProject,
      processor: config.host,
      instance: config.instance,
    })
  }
}

const localSnapshotFor = (
  config: StartCounterConfig,
): Runtime.LocalSnapshotStore | undefined =>
  config.tape === 'Memory' ? undefined : config.localSnapshot

/**
 * Starts the synced Counter in a browser or Expo Client. The tape defaults
 * to Instant. The Instant sync engine automatically supplies a local snapshot
 * store (IndexedDB in browsers, AsyncStorage in React Native), so a reload
 * paints the last count at once and folds only the rows since.
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
  startCounterOn(engineFor(config), localSnapshotFor(config), config.host)

/**
 * Starts the synced Counter on an engine the caller built, with an
 * optional local snapshot store.
 */
export const startCounterOn = (
  sync: Runtime.SyncEngine,
  localSnapshot?: Runtime.LocalSnapshotStore,
  host?: Processor.Host.Host,
): CounterHandle =>
  Runtime.startHandle({
    program: SyncedCounter,
    sync,
    ...(localSnapshot === undefined ? {} : { localSnapshot }),
    ...(host === undefined ? {} : { host }),
  })
