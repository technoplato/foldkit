import { type Processor, Runtime } from 'foldkit'
import { localSnapshotFile, localSnapshotPath } from 'foldkit/cli'

import { FoldkitCounterV01, Instant } from '@foldkit/instant'

import { CountersProgram } from './program.js'
import {
  type CountersHandle,
  type StartCountersConfig,
  countersLocalSnapshotKey,
} from './startConfig.js'
import { SyncedCounters } from './synced.js'

/**
 * The engine a Multiple Counters Processor reads and writes: the app's
 * rows on the one Instant project's shared log. A Node Client reads the
 * admin token from its trusted wrapper, `with-counter-v01-env`.
 *
 * @example
 * ```typescript
 * countersEngine({ host: Processor.Host.Cli(), instance: newProcessorInstance() })
 * ```
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

/**
 * Starts the synced Multiple Counters in a Node Client, on Instant from
 * the first run, with this machine's local snapshot in a cache file.
 *
 * @example
 * ```typescript
 * const handle = startCounters({ host: Processor.Host.Cli(), instance: newProcessorInstance() })
 * ```
 */
export const startCounters = (config: StartCountersConfig): CountersHandle =>
  startCountersOn(
    countersEngine(config),
    config.localSnapshot ??
      localSnapshotFile(localSnapshotPath(countersLocalSnapshotKey)),
    config.host,
  )

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
