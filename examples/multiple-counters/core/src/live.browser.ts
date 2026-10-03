import { type Processor, Runtime } from 'foldkit'

import { FoldkitCounterV01, Instant } from '@foldkit/instant/browser'

import { CountersProgram } from './program.js'
import {
  type CountersHandle,
  type StartCountersConfig,
  countersLocalSnapshotKey,
} from './startConfig.js'
import { SyncedCounters } from './synced.js'

/**
 * The engine a browser or Expo Processor reads and writes: the app's rows
 * on the one Instant project's shared log.
 */
export const countersEngine = (
  config: StartCountersConfig,
): Runtime.SyncEngine =>
  Instant({
    app: FoldkitCounterV01,
    processor: config.host,
    instance: config.instance,
    programLog: CountersProgram.id,
    ...(config.database === undefined ? {} : { database: config.database }),
  })

const browserStorage = (): Storage | undefined =>
  typeof window === 'undefined' ? undefined : window.localStorage

const localSnapshotFor = (
  config: StartCountersConfig,
): Runtime.LocalSnapshotStore | undefined => {
  const storage = browserStorage()
  if (config.localSnapshot !== undefined) {
    return config.localSnapshot
  } else if (storage !== undefined) {
    return Runtime.LocalSnapshot.webStorage(storage, countersLocalSnapshotKey)
  } else {
    return undefined
  }
}

/**
 * Starts the synced Multiple Counters in a browser or Expo Client, on
 * Instant from the first run. A browser keeps its local snapshot in
 * `localStorage`, so a reload paints the last counts at once.
 *
 * @example
 * ```typescript
 * const handle = startCounters({ host: Processor.Host.React(), instance: newProcessorInstance() })
 * ```
 */
export const startCounters = (config: StartCountersConfig): CountersHandle =>
  startCountersOn(countersEngine(config), localSnapshotFor(config), config.host)

/** Starts the synced Multiple Counters on an engine the caller built. */
export const startCountersOn = (
  sync: Runtime.SyncEngine,
  localSnapshot?: Runtime.LocalSnapshotStore,
  host?: Processor.Host.Host,
): CountersHandle =>
  Runtime.startHandle({
    program: SyncedCounters,
    sync,
    ...(localSnapshot === undefined ? {} : { localSnapshot }),
    ...(host === undefined ? {} : { host }),
  })
