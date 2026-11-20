import { type Processor, Runtime } from 'foldkit'

import { SharedInstantProject, Instant } from '@foldkit/instant/browser'

import { CountersProgram } from './program.js'
import {
  type CountersHandle,
  type StartCountersConfig,
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
    app: SharedInstantProject,
    processor: config.host,
    instance: config.instance,
    programLog: CountersProgram.id,
    ...(config.database === undefined ? {} : { database: config.database }),
  })

/**
 * Starts the synced Multiple Counters in a browser or Expo Client, on
 * Instant from the first run. The Instant sync engine automatically supplies
 * a local snapshot store (IndexedDB in browsers, AsyncStorage in React Native),
 * so a reload paints the last counts at once.
 *
 * @example
 * ```typescript
 * const handle = startCounters({ host: Processor.Host.React(), instance: newProcessorInstance() })
 * ```
 */
export const startCounters = (config: StartCountersConfig): CountersHandle =>
  startCountersOn(countersEngine(config), config.localSnapshot, config.host)

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
