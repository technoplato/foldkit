import { Schema as S } from 'effect'
import { type Processor, type Runtime } from 'foldkit'

import type { InstantSnapshotLogDatabase } from '@foldkit/instant/snapshot-log'

import { type App } from './app.js'

/** A live synced Counter any Client can read, watch, and send to. */
export type CounterHandle = Runtime.SyncedHandle<typeof App>

/**
 * Which tape a Counter Processor runs on. Memory keeps the count in this
 * process; Instant shares it with every other Processor.
 */
export const CounterTape = S.Literals(['Instant', 'Memory'])
/** Which tape a Counter Processor runs on. */
export type CounterTape = typeof CounterTape.Type

/**
 * How one Counter Processor starts. `instance` must be unique per run so
 * two tabs of the same host never share navigation (Q107). A native Client
 * passes the Instant `database` it opened with `@instantdb/react-native`.
 *
 * @example
 * ```typescript
 * startCounter({
 *   host: Processor.Host.React(),
 *   instance: newProcessorInstance(),
 *   tape: 'Instant',
 * })
 * ```
 */
export type StartCounterConfig = Readonly<{
  host: Processor.Host.Host
  instance: string
  tape?: CounterTape
  database?: InstantSnapshotLogDatabase
}>

const instanceLength = 8

/** Mints a short per-run Processor instance, such as `4f2a9c1e`. */
export const newProcessorInstance = (): string =>
  globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, instanceLength)
