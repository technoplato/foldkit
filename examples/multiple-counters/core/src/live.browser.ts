import { Processor, Runtime } from 'foldkit'

import { type CountersHandle, type StartCountersConfig } from './startConfig.js'
import { SyncedCounters } from './synced.js'

/**
 * Starts the synced Multiple Counters in a browser or Expo Client, on a
 * Memory tape in this tab. A File tape is for Node Clients.
 *
 * @example
 * ```typescript
 * const handle = startCounters({ host: Processor.Host.React(), instance: newProcessorInstance() })
 * ```
 */
export const startCounters = (config: StartCountersConfig): CountersHandle =>
  startCountersOn(
    Runtime.Memory({
      processor: `${Processor.Host.print(config.host)}-${config.instance}`,
    }),
    config.host,
  )

/** Starts the synced Multiple Counters on an engine the caller built. */
export const startCountersOn = (
  sync: Runtime.SyncEngine,
  host?: Processor.Host.Host,
): CountersHandle =>
  Runtime.startHandle({
    program: SyncedCounters,
    sync,
    ...(host === undefined ? {} : { host }),
  })
