import { Schema as S } from 'effect'
import { type Processor, type Runtime } from 'foldkit'
import { ts } from 'foldkit/schema'

import { type App } from './app.js'

/** Live synced Multiple Counters any Client can read, watch, and send to. */
export type CountersHandle = Runtime.SyncedHandle<typeof App>

/** Keeps the counters in this process. */
export const MemoryTape = ts('MemoryTape')
/** Keeps the counters in a file every process on this machine reads. */
export const FileTape = ts('FileTape', { path: S.String })

/**
 * Where the counters live. Memory keeps them in one process; a File keeps
 * them between CLI runs and shares them with every process that reads the
 * same path.
 */
export const CountersTape = S.Union([MemoryTape, FileTape])
/** Where the counters live. */
export type CountersTape = typeof CountersTape.Type

/**
 * How one Multiple Counters Processor starts. `instance` tells two runs
 * on one Host apart, `react-4f2a9c1e`.
 *
 * @example
 * ```typescript
 * startCounters({ host: Processor.Host.Cli(), instance: newProcessorInstance(), tape: FileTape({ path: '/tmp/counters.json' }) })
 * ```
 */
export type StartCountersConfig = Readonly<{
  host: Processor.Host.Host
  instance: string
  tape?: CountersTape
}>

const instanceLength = 8

/** Mints a short per-run Processor instance, such as `4f2a9c1e`. */
export const newProcessorInstance = (): string =>
  globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, instanceLength)
