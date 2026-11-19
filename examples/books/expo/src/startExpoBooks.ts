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
import { Layer, Option } from 'effect'
import * as Updates from 'expo-updates'
import { Processor, Runtime, type Telemetry } from 'foldkit'
import { Platform } from 'react-native'
import { enableSchedulerDelegateInvalidation } from 'react-native/src/private/featureflags/ReactNativeFeatureFlags'

import {
  Instant,
  SharedInstantProject,
  accessRequestHeaders,
  withHostedIdentity,
} from '@foldkit/instant/browser'
import {
  type LaidOut,
  attachDevelopmentTelemetry,
  runningCodeOf,
  stallWatch,
  watchUpdates,
} from '@foldkit/react-native/telemetry'
import { init } from '@instantdb/react-native'

import { type PhoneConnection, isTelemetryAsked } from './connection'
import {
  type Running,
  hearPlayerNotes,
  isBooksSilent,
  phoneResources,
} from './phoneResources'
import { traceFiles } from './traceFiles'

type PhoneDatabase = ReturnType<typeof init>

const boundBooksKey = Symbol.for('foldkit.books.expo.boundBooks')
const databaseKey = Symbol.for('foldkit.books.expo.database')

type ExpoGlobals = typeof globalThis & {
  [boundBooksKey]?: Promise<BoundBooks>
  [databaseKey]?: PhoneDatabase
}

const expoGlobals = (): ExpoGlobals => globalThis

const isDevelopmentBuild = (): boolean =>
  Reflect.get(globalThis, '__DEV__') === true

const expoHost = (): Processor.Host.Host =>
  Platform.OS === 'ios'
    ? Processor.Host.ExpoIos()
    : Processor.Host.ExpoAndroid()

type RecordPaint = (render: Telemetry.RenderReport) => void

const paintRecorderKey = Symbol.for('foldkit.books.expo.paintRecorder')

const laidOutKey = Symbol.for('foldkit.books.expo.laidOut')

/**
 * Takes note of a part of the app being laid out, for the record of
 * each time its JavaScript was held. Before Books has started, and with
 * no trace kept, it notes nothing.
 */
export const noteBooksLaidOut = (entry: LaidOut): void => {
  const note: unknown = Reflect.get(globalThis, laidOutKey)
  if (typeof note === 'function') {
    note(entry)
  }
}

/**
 * Records one paint of the app in its telemetry. Before Books has
 * started, and in a build that is not for development, it records
 * nothing.
 */
export const recordBooksPaint: RecordPaint = render => {
  const record: unknown = Reflect.get(globalThis, paintRecorderKey)
  if (typeof record === 'function') {
    record(render)
  }
}

// NOTE: As the web and the terminal do where they start Books, the phone
// attaches the core's telemetry to the Program it starts. On a phone the
// trace goes to what a development build prints, which Metro shows.
const traced = <
  Handle extends Parameters<typeof attachDevelopmentTelemetry>[0],
>(
  handle: Handle,
): Handle => {
  const isAsked = isTelemetryAsked({
    EXPO_PUBLIC_BOOKS_TELEMETRY: process.env.EXPO_PUBLIC_BOOKS_TELEMETRY,
  })
  // NOTE: a development build prints its trace, which the dev server
  // keeps. A build that carries its own code has nobody reading what it
  // prints, so when it is asked to keep a trace it keeps it as files.
  const maybeFiles = isAsked && !isDevelopmentBuild() ? traceFiles() : undefined
  const attached = attachDevelopmentTelemetry(handle, {
    app: 'books',
    note: {
      reactNativeSchedulerGuard: enableSchedulerDelegateInvalidation(),
      sound: isBooksSilent() ? 'silent' : 'loud',
      ...runningCodeOf(Updates),
    },
    // NOTE: newer code is asked for when the app opens and runs from the
    // next open. What came of asking goes in the trace; not reaching the
    // server is ordinary and shows nowhere else.
    laterNotes: say => {
      hearPlayerNotes(say)
      // NOTE: a build that carries its own code cannot time its paints.
      // It can say each time its JavaScript was held, and what was being
      // laid out then.
      Reflect.set(globalThis, laidOutKey, stallWatch({ say }).noteLaidOut)
      watchUpdates({
        latest: Updates.latestContext,
        listen: Updates.addUpdatesStateChangeListener,
        say,
      })
    },
    ...(isAsked ? { isDevelopment: true } : {}),
    ...(maybeFiles === undefined
      ? {}
      : { write: maybeFiles.write, writeNow: maybeFiles.writeNow }),
  })
  Option.match(attached, {
    onNone: () => undefined,
    onSome: telemetry => {
      Reflect.set(globalThis, paintRecorderKey, telemetry.recordRendered)
    },
  })
  return handle
}

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
  options: Readonly<{ isShared: boolean; shelf?: 'Three' | 'Long' }> = {
    isShared: false,
  },
): Promise<BoundBooks> =>
  startedOnce(() => {
    const running: Running = { maybeBooks: undefined }
    const host = expoHost()
    return startMadeUpBooks({
      host,
      resources: phoneResources(running),
      ...(options.shelf === undefined ? {} : { shelf: options.shelf }),
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
      const books = bindBooks(traced(handle))
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
      traced(
        Runtime.startHandle({ program: SyncedBooks, sync, resources, host }),
      ),
    )
    running.maybeBooks = books
    return Promise.resolve(books)
  })
