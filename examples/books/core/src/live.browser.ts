import { Layer } from 'effect'
import { type Processor, Runtime } from 'foldkit'

import {
  Instant,
  makeInstantCoreProgramLogTransport,
  withHostedIdentity,
} from '@foldkit/instant/browser'
import { init } from '@instantdb/core'

import { htmlAudioOutput } from './audio.browser.js'
import { makeInstantLibraryStore } from './instantLibrary.js'
import { LibraryStore } from './library.js'
import { BooksProgram } from './program.js'
import { SyncedBooks } from './synced.js'

/** How a browser Books Processor starts: its Instant app, host, and instance. */
export type StartBooksConfig = Readonly<{
  appId: string
  host: Processor.Host.Host
  instance: string
}>

/** A live synced Books any Client can read, watch, and send to. */
export type BooksHandle = Runtime.SyncedHandle<typeof SyncedBooks.of>

const instanceLength = 8

/** Mints a short per-run Processor instance, such as `4f2a9c1e`. */
export const newProcessorInstance = (): string =>
  globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, instanceLength)

/**
 * Starts Books in a browser on the Instant app that holds the library.
 * The resources sign in as the Cloudflare Access member first, then read
 * the shelf, write progress and bookmarks as that member, and play through
 * the browser's audio. The program log keeps only this member's rows.
 *
 * @example
 * ```typescript
 * const handle = startBooks({ appId: import.meta.env.VITE_INSTANT_APP_ID, host: Processor.Host.React(), instance: newProcessorInstance() })
 * ```
 */
export const startBooks = (config: StartBooksConfig): BooksHandle => {
  const database = init({ appId: config.appId })
  const sync = Instant({
    app: { id: config.appId },
    processor: config.host,
    instance: config.instance,
    transport: makeInstantCoreProgramLogTransport(database, BooksProgram.id, {
      owner: 'SignedInUser',
    }),
  })
  const resources = withHostedIdentity(
    Layer.merge(
      Layer.effect(LibraryStore, makeInstantLibraryStore(database)),
      htmlAudioOutput,
    ),
    database,
  )
  return Runtime.startHandle({
    program: SyncedBooks,
    sync,
    resources,
    host: config.host,
  })
}
