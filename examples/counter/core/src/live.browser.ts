import { Runtime } from 'foldkit'

import { FoldkitCounterV01, Instant } from '@foldkit/instant/browser'

import {
  type CounterHandle,
  type StartCounterConfig,
  counterLocalSnapshotKey,
} from './startConfig.js'
import { SyncedCounter } from './synced.js'

export {
  FoldkitCounterV01,
  InstantSnapshotLogSchema,
} from '@foldkit/instant/browser'

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
    return Instant({
      app: FoldkitCounterV01,
      processor: config.host,
      instance: config.instance,
    })
  }
}

const browserStorage = (): Storage | undefined =>
  typeof window === 'undefined' ? undefined : window.localStorage

const localSnapshotFor = (
  config: StartCounterConfig,
): Runtime.LocalSnapshotStore | undefined => {
  const storage = browserStorage()
  if (config.tape === 'Memory') {
    return undefined
  } else if (config.localSnapshot !== undefined) {
    return config.localSnapshot
  } else if (storage !== undefined) {
    return Runtime.LocalSnapshot.webStorage(storage, counterLocalSnapshotKey)
  } else {
    return undefined
  }
}

/**
 * Starts the synced Counter in a browser or Expo Client. The tape defaults
 * to Instant. A browser keeps its local snapshot in `localStorage`, so a
 * reload paints the last count at once and folds only the rows since.
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
  startCounterOn(engineFor(config), localSnapshotFor(config))

/**
 * Starts the synced Counter on an engine the caller built, with an
 * optional local snapshot store.
 */
export const startCounterOn = (
  sync: Runtime.SyncEngine,
  localSnapshot?: Runtime.LocalSnapshotStore,
): CounterHandle =>
  Runtime.startHandle({
    program: SyncedCounter,
    sync,
    ...(localSnapshot === undefined ? {} : { localSnapshot }),
  })
