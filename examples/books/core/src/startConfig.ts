import type { Processor, Runtime } from 'foldkit'

import type { SyncedBooks } from './synced.js'

// START

/** A live synced Books any Client can read, watch, and send to. */
export type BooksHandle = Runtime.SyncedHandle<typeof SyncedBooks.of>

/**
 * A live synced Books started on a Host, as `startBooks` returns it. Its
 * `host` is always there, so telemetry can name the surface it runs on,
 * such as `web-react` or `terminal-tui`.
 */
export type BooksHandleOnHost = Runtime.SyncedHandle<
  typeof SyncedBooks.of,
  Processor.Host.Host
>

const instanceLength = 8

/** Mints a short per-run Processor instance, such as `4f2a9c1e`. */
export const newProcessorInstance = (): string =>
  globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, instanceLength)
