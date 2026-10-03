import { type Processor, type Runtime } from 'foldkit'

import type { InstantSnapshotLogDatabase } from '@foldkit/instant/snapshot-log'

import { type App } from './app.js'

/** Live synced Multiple Counters any Client can read, watch, and send to. */
export type CountersHandle = Runtime.SyncedHandle<typeof App>

/**
 * How one Multiple Counters Processor starts. Every Processor shares the
 * one Instant project's log, under the app `multiple-counters`.
 * `instance` tells two runs on one Host apart, `react-4f2a9c1e`. A native
 * Client passes the `database` it opened with `@instantdb/react-native`.
 * `localSnapshot` keeps this device's fold of the log so a reload paints
 * at once; a browser defaults to `localStorage` and a terminal host to a
 * file.
 *
 * @example
 * ```typescript
 * startCounters({ host: Processor.Host.Cli(), instance: newProcessorInstance() })
 * ```
 */
export type StartCountersConfig = Readonly<{
  host: Processor.Host.Host
  instance: string
  database?: InstantSnapshotLogDatabase
  localSnapshot?: Runtime.LocalSnapshotStore
}>

/** The key one device keeps the Multiple Counters' local snapshot under. */
export const countersLocalSnapshotKey = 'foldkit-multiple-counters'

const instanceLength = 8

/** Mints a short per-run Processor instance, such as `4f2a9c1e`. */
export const newProcessorInstance = (): string =>
  globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, instanceLength)
