import { Match as M } from 'effect'
import { Processor, Runtime } from 'foldkit'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { fromTransport, makeFileSnapshotLogTransport } from '@foldkit/instant'

import {
  type CountersHandle,
  type CountersTape,
  FileTape,
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

const defaultTapePath = join(tmpdir(), 'foldkit-multiple-counters.json')

/**
 * The tape a Node Client reads from its environment, so every terminal on
 * this machine shares one file by default: `COUNTERS_TAPE=memory` keeps
 * the counters in one process, and `COUNTERS_TAPE_PATH` names the file.
 *
 * @example
 * ```typescript
 * countersTapeOf({ COUNTERS_TAPE_PATH: '/tmp/counters.json' })
 * // FileTape({ path: '/tmp/counters.json' })
 * ```
 */
export const countersTapeOf = (
  env: Readonly<Record<string, string | undefined>>,
): CountersTape => {
  const path = env['COUNTERS_TAPE_PATH']
  if (env['COUNTERS_TAPE'] === 'memory') {
    return MemoryTape()
  } else if (path !== undefined && path !== '') {
    return FileTape({ path })
  } else {
    return FileTape({ path: defaultTapePath })
  }
}

/**
 * The engine a Multiple Counters Processor reads and writes, for a Client
 * that reads the log without running the Program, such as `counters tail`.
 */
export const countersEngine = (
  config: StartCountersConfig,
): Runtime.SyncEngine => engineFor(config, config.tape ?? MemoryTape())

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
  startCountersOn(countersEngine(config), config.host)

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
