import {
  Audible,
  BooksProgram,
  type BoundBooks,
  LibraryStore,
  ScribeTimeline,
  SyncedBooks,
  bindBooks,
  instantTranscriptSource,
  makeInstantLibraryStore,
  makeInstantScribeTimeline,
  newProcessorInstance,
  noReadAloud,
  sharedMadeUpSession,
  startMadeUpBooks,
} from 'books-core-example/browser'
import { Layer } from 'effect'
import { Processor, Runtime } from 'foldkit'
import { Platform } from 'react-native'

import {
  Instant,
  SharedInstantProject,
  accessRequestHeaders,
  withHostedIdentity,
} from '@foldkit/instant/browser'
import { init } from '@instantdb/react-native'

import type { PhoneConnection } from './connection'
import { type Running, phoneResources } from './phoneResources'

type PhoneDatabase = ReturnType<typeof init>

const boundBooksKey = Symbol.for('foldkit.books.expo.boundBooks')
const databaseKey = Symbol.for('foldkit.books.expo.database')

type ExpoGlobals = typeof globalThis & {
  [boundBooksKey]?: Promise<BoundBooks>
  [databaseKey]?: PhoneDatabase
}

const expoGlobals = (): ExpoGlobals => globalThis

const expoHost = (): Processor.Host.Host =>
  Platform.OS === 'ios'
    ? Processor.Host.ExpoIos()
    : Processor.Host.ExpoAndroid()

const startedOnce = (start: () => Promise<BoundBooks>): Promise<BoundBooks> => {
  const globals = expoGlobals()
  const existing = globals[boundBooksKey]
  if (existing !== undefined) {
    return existing
  }
  const started = start()
  globals[boundBooksKey] = started
  return started
}

/**
 * Starts Books once per JavaScript runtime, on the made-up library every
 * Client can open: three titles nobody wrote, with made-up words and a
 * made-up voice. Nobody is signed in and no real library is read. The
 * phone's own services are the same as for a person's library. With
 * `isShared` it is the one made-up session every device that asks for it
 * shares, so the phone, a browser tab and a terminal can be watched
 * moving together; without, it stays on this phone. Fast
 * Refresh runs this module again, so the running Books lives on
 * `globalThis` and is reused.
 *
 * @example
 * ```typescript
 * const books = await startMadeUpExpoBooks()
 * ```
 */
export const startMadeUpExpoBooks = (
  options: Readonly<{ isShared: boolean }> = { isShared: false },
): Promise<BoundBooks> =>
  startedOnce(() => {
    const running: Running = { maybeBooks: undefined }
    const host = expoHost()
    return startMadeUpBooks({
      host,
      resources: phoneResources(running),
      ...(options.isShared
        ? {
            sync: sharedMadeUpSession({
              host,
              instance: newProcessorInstance(),
              database: init({ appId: SharedInstantProject.id }).core,
            }),
          }
        : {}),
    }).then(handle => {
      const books = bindBooks(handle)
      running.maybeBooks = books
      return books
    })
  })

/**
 * The phone's Instant database for the library's app, opened once. It
 * keeps a signed-in person's session on the device, as a browser does, so
 * the next launch needs no sign-in.
 */
export const phoneDatabase = (connection: PhoneConnection): PhoneDatabase => {
  const globals = expoGlobals()
  const existing = globals[databaseKey]
  if (existing !== undefined) {
    return existing
  }
  const created = init({ appId: connection.appId })
  globals[databaseKey] = created
  return created
}

/**
 * Starts Books on a signed-in person's own library, once per JavaScript
 * runtime: the shelf, their place and bookmarks and each title's words
 * from the library's Instant app, what it plays on their Scribe timeline,
 * the Audible import through the site, and the phone's own audio,
 * appearance and sharing. It is the browser's start with the phone's
 * services in place of the browser's. The books read aloud are not on the
 * phone yet. Call it once the person is signed in, with the session the
 * sign-in gave, which a phone presents itself where a browser's cookie
 * would.
 *
 * @example
 * ```typescript
 * const books = await startSignedInExpoBooks(connection)
 * ```
 */
export const startSignedInExpoBooks = (
  connection: PhoneConnection,
  maybeSession?: string,
): Promise<BoundBooks> =>
  startedOnce(() => {
    const running: Running = { maybeBooks: undefined }
    const database = phoneDatabase(connection).core
    const host = expoHost()
    const sync = Instant({
      app: { id: connection.appId },
      processor: host,
      instance: newProcessorInstance(),
      database,
      programLog: BooksProgram.id,
      owner: 'SignedInUser',
    })
    const resources = withHostedIdentity(
      Layer.mergeAll(
        Layer.effect(LibraryStore, makeInstantLibraryStore(database)),
        instantTranscriptSource(database),
        Layer.effect(
          ScribeTimeline,
          makeInstantScribeTimeline(database, {
            origin: connection.sessionOrigin,
          }),
        ),
        Layer.succeed(
          Audible.AudibleImport,
          Audible.httpAudibleImport({
            origin: connection.sessionOrigin,
            headers:
              maybeSession === undefined
                ? {}
                : accessRequestHeaders(maybeSession),
          }),
        ),
        noReadAloud,
        phoneResources(running),
      ),
      database,
      {
        sessionOrigin: connection.sessionOrigin,
        ...(maybeSession === undefined ? {} : { accessToken: maybeSession }),
      },
    )
    const books = bindBooks(
      Runtime.startHandle({ program: SyncedBooks, sync, resources, host }),
    )
    running.maybeBooks = books
    return Promise.resolve(books)
  })
