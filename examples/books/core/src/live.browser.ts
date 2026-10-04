import { Layer } from 'effect'
import { type Processor, Runtime } from 'foldkit'
import { htmlAudioOutput } from 'transcript-player-core-example/browser'

import {
  Instant,
  makeInstantCoreProgramLogTransport,
  withHostedIdentity,
} from '@foldkit/instant/browser'
import { init } from '@instantdb/core'

import { makeInstantLibraryStore } from './instantLibrary.js'
import { instantTranscriptSource } from './instantTranscript.js'
import { LibraryStore } from './library.js'
import { BooksProgram } from './program.js'
import { browserLinkSharing } from './share.browser.js'
import { type BooksHandle } from './startConfig.js'
import { SyncedBooks } from './synced.js'

/** How a browser Books Processor starts: its Instant app, host, and instance. */
export type StartBooksConfig = Readonly<{
  appId: string
  host: Processor.Host.Host
  instance: string
}>

/**
 * Starts Books in a browser on the Instant app that holds the library.
 * The resources sign in as the Cloudflare Access member first, then read
 * the shelf, write progress and bookmarks as that member, play through
 * the browser's audio, and read each title's words as it plays. The program log keeps only this member's rows.
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
    Layer.mergeAll(
      Layer.effect(LibraryStore, makeInstantLibraryStore(database)),
      htmlAudioOutput,
      instantTranscriptSource(database),
      browserLinkSharing,
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
