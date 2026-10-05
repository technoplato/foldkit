import { type Context, Effect, Layer, Option } from 'effect'
import { type Processor, Runtime } from 'foldkit'
import { localSnapshotFile, localSnapshotPath } from 'foldkit/cli'
import { dirname, join } from 'node:path'
import {
  fetchPreviewSource,
  localReadingSource,
  thingsDirectoryFromEnv,
} from 'read-aloud-core-example'
import { ffplayAudioOutput } from 'transcript-player-core-example'

import {
  Instant,
  type ProgramLogDatabase,
  ensureHostedInstantSession,
  makeInstantCoreProgramLogTransport,
  makeNodeInstantDatabase,
} from '@foldkit/instant'

import { makeInstantLibraryStore } from './instantLibrary.js'
import { instantTranscriptSource } from './instantTranscript.js'
import { LibraryStore } from './library.js'
import { BooksProgram } from './program.js'
import { terminalLinkSharing } from './share.node.js'
import type { BooksHandle, BooksHandleOnHost } from './startConfig.js'
import { SyncedBooks } from './synced.js'

// START

/** The mint a terminal signs in through by default: the hosted reader. */
export const defaultBooksOrigin = 'https://books.pisspoursoftware.xyz'

/**
 * Where a terminal Books finds the library and its sign-in: the Instant
 * app that holds the library, and the reader whose mint turns a Cloudflare
 * Access login into an Instant session. On this machine the local reader,
 * `http://localhost:5200`, mints without a login.
 */
export type BooksConnection = Readonly<{
  appId: string
  sessionOrigin: string
}>

/**
 * The connection a terminal's environment names: `BOOKS_INSTANT_APP_ID`
 * and `FOLDKIT_HOSTED_IDENTITY_ORIGIN`, the hosted reader by default. None
 * without an app id. `scripts/with-books-access` sets both, and the Access
 * token beside them.
 */
export const booksConnectionFromEnv = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): Option.Option<BooksConnection> =>
  Option.map(
    Option.filter(
      Option.fromNullishOr(env['BOOKS_INSTANT_APP_ID']),
      appId => appId.trim() !== '',
    ),
    appId => ({
      appId: appId.trim(),
      sessionOrigin:
        env['FOLDKIT_HOSTED_IDENTITY_ORIGIN']?.trim() || defaultBooksOrigin,
    }),
  )

/** Why a terminal Books could not open, when there is no connection. */
export const noConnectionSentence =
  'Books does not know which Instant app holds your library. Run it as `books`, which reads the app from ~/.config/knophy-host/books/books.env, or set BOOKS_INSTANT_APP_ID.'

/** Why a terminal Books could not sign in. */
export const notSignedInSentence =
  'Books could not sign you in. Run `books login` to sign in to Cloudflare Access, then try again.'

/** A terminal Books signed in as the Access member, on its Instant app. */
export type SignedInBooks = Readonly<{
  appId: string
  email: string
  sessionOrigin: string
  database: ProgramLogDatabase
}>

const isLoopbackOrigin = (origin: string): boolean =>
  origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')

const publicOriginOf = (sessionOrigin: string): string =>
  isLoopbackOrigin(sessionOrigin) ? defaultBooksOrigin : sessionOrigin

const stateDirectoryOf = (appId: string): string =>
  join(dirname(localSnapshotPath('foldkit-books')), 'books', appId)

/**
 * Opens the library's Instant app with this machine's saved session, or
 * signs in through the mint: a Cloudflare Access login from the
 * environment, or none on this machine. The session is kept in a file, so
 * the next run needs no login. None when nobody could be signed in.
 *
 * @example
 * ```typescript
 * const maybeSignedIn = await signInToBooks({ appId, sessionOrigin: 'http://localhost:5200' })
 * ```
 */
export const signInToBooks = async (
  connection: BooksConnection,
): Promise<Option.Option<SignedInBooks>> => {
  const database = makeNodeInstantDatabase(
    connection.appId,
    stateDirectoryOf(connection.appId),
  )
  const member = await ensureHostedInstantSession(database, {
    sessionOrigin: connection.sessionOrigin,
  })
  return Option.flatMap(Option.fromNullishOr(member), signedIn =>
    Option.map(Option.fromNullishOr(signedIn.email), email => ({
      appId: connection.appId,
      email,
      sessionOrigin: connection.sessionOrigin,
      database,
    })),
  )
}

/** The engine a terminal Books reads and writes: the member's own log. */
export const booksEngine = (
  signedIn: SignedInBooks,
  config: Readonly<{ host: Processor.Host.Host; instance: string }>,
): Runtime.SyncEngine =>
  Instant({
    app: { id: signedIn.appId },
    processor: config.host,
    instance: config.instance,
    transport: makeInstantCoreProgramLogTransport(
      signedIn.database,
      BooksProgram.id,
      { owner: 'SignedInUser' },
    ),
  })

/** The library store's reads and writes, as a host may wrap them. */
export type LibraryStoreService = Context.Service.Shape<typeof LibraryStore>

/**
 * How a terminal starts Books: the Host it runs on, its instance, and,
 * for a host that must know when the library has saved, such as a player
 * that exits after `books stop`, a wrapper around the library store.
 */
export type StartBooksConfig = Readonly<{
  host: Processor.Host.Host
  instance: string
  library?: (store: LibraryStoreService) => LibraryStoreService
}>

/**
 * Starts Books in a terminal as the signed-in member: the shelf and the
 * words from Instant, the audio through ffplay, the books read aloud from
 * Scribe's logs on this machine, and this machine's fold of the log in a
 * file, so the next run paints at once.
 *
 * @example
 * ```typescript
 * const handle = startBooks(signedIn, { host: Processor.Host.Tui(), instance: newProcessorInstance() })
 * ```
 */
export const startBooks = (
  signedIn: SignedInBooks,
  config: StartBooksConfig,
): BooksHandleOnHost =>
  Runtime.startHandle({
    program: SyncedBooks,
    sync: booksEngine(signedIn, config),
    resources: Layer.mergeAll(
      Layer.effect(
        LibraryStore,
        Effect.map(
          makeInstantLibraryStore(signedIn.database),
          config.library ?? (store => store),
        ),
      ),
      ffplayAudioOutput,
      instantTranscriptSource(signedIn.database),
      terminalLinkSharing(publicOriginOf(signedIn.sessionOrigin)),
      localReadingSource(thingsDirectoryFromEnv()),
      fetchPreviewSource,
    ),
    localSnapshot: localSnapshotFile(
      join(stateDirectoryOf(signedIn.appId), 'snapshot.json'),
    ),
    host: config.host,
  })

const shelfPollMs = 100

/**
 * Waits until the library has opened, or could not, so a one-shot command
 * paints the shelf instead of "Opening your library…". Gives up after
 * `timeoutMs` and paints what there is.
 *
 * @example
 * ```typescript
 * await whenLibraryOpened(handle, 15_000)
 * ```
 */
export const whenLibraryOpened = (
  handle: BooksHandle,
  timeoutMs: number,
): Promise<void> =>
  new Promise(resolve => {
    const startedAtMs = Date.now()
    const check = (): void => {
      const model = handle.readModel()
      const isOpened =
        model._tag === 'Ready' && model.library._tag !== 'ShelfLoading'
      if (isOpened || Date.now() - startedAtMs >= timeoutMs) {
        resolve()
      } else {
        setTimeout(check, shelfPollMs)
      }
    }
    check()
  })
