import { Match as M } from 'effect'
import { Processor, Runtime } from 'foldkit'

import { fromTransport, makeFileSnapshotLogTransport } from '@foldkit/instant'

import {
  type CountersHandle,
  type CountersTape,
  MemoryTape,
  type StartCountersConfig,
} from './startConfig.js'
import { SyncedCounters } from './synced.js'

const processorOf = (config: StartCountersConfig): string =>
  `${Processor.Host.print(config.host)}-${config.instance}`

const engineFor = (
  config: StartCountersConfig,
  tape: CountersTape,
): Runtime.SyncEngine =>
  M.value(tape).pipe(
    M.withReturnType<Runtime.SyncEngine>(),
    M.tagsExhaustive({
      MemoryTape: () => Runtime.Memory({ processor: processorOf(config) }),
      FileTape: ({ path }) =>
        fromTransport(makeFileSnapshotLogTransport(path), processorOf(config)),
    }),
  )

/**
 * Starts the synced Multiple Counters in a Node Client. The tape
 * defaults to Memory; a File tape keeps the counters between CLI runs.
 *
 * @example
 * ```typescript
 * const handle = startCounters({
 *   host: Processor.Host.Cli(),
 *   instance: newProcessorInstance(),
 *   tape: FileTape({ path: '/tmp/counters.json' }),
 * })
 * ```
 */
export const startCounters = (config: StartCountersConfig): CountersHandle =>
  startCountersOn(engineFor(config, config.tape ?? MemoryTape()), config.host)

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
