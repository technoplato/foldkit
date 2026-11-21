#!/usr/bin/env node
/**
 * The Books player, a Background Processor: one detached process per
 * Instant app on this machine that holds the Program and its ffplay
 * audio, so `books listen a-tin-comet` keeps playing after the command
 * returns, and `books pause`,
 * `books tui`, and every other command act on the same player through
 * its socket. The first command that needs it starts it. `books stop`,
 * the end of the title, or ten minutes with nothing in the player ends
 * it, after its place saves through the same Messages the web saves with.
 * It follows the session's navigation like a browser: while the session
 * mirrors, a browser's move lands on it and its own moves land on the
 * browsers, and `books keep-navigation-local` gives each its own again.
 * Its telemetry, every Message, Command, and terminal frame, goes to
 * `~/Library/Logs/foldkit/telemetry/books-terminal-cli.ndjson` with
 * `"role":"daemon"` on every line. What a `books tui` view's keys cause
 * there records `"surface":"terminal-tui"`, and what a one-shot command
 * causes records `"surface":"terminal-cli"`. Read it with
 * `foldkit telemetry books`.
 */
import {
  MessageWire,
  SyncedBooks,
  bindBooks,
  newProcessorInstance,
  sharedMadeUpSession,
  startBooks,
  startMadeUpBooks,
  whenLibraryOpened,
} from 'books-core-example'
import { Duration, Effect, Option } from 'effect'
import { Interaction, Processor, Runtime, Telemetry } from 'foldkit'
import {
  followProgramTail,
  listenBackgroundProcessor,
  terminalSystemAppearance,
} from 'foldkit/cli'
import { fileSink } from 'foldkit/telemetry/node'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { NodeRuntime } from '@effect/platform-node'

import {
  makeBooksPlayer,
  pausedAndSaved,
  refusingSurface,
  trackLibraryWrites,
  whenIdleFor,
  whenTitleFinished,
} from './player.js'
import {
  appVersionOf,
  booksPlayerSocketPath,
  buildOf,
  isMadeUpSessionShared,
  madeUpContrastOf,
  madeUpEmailOf,
  madeUpNameOf,
  madeUpShelfOf,
} from './settings.js'
import { signInFromEnv } from './signIn.js'

const readyTimeoutMs = 20_000

const idleMs = Duration.toMillis(Duration.minutes(10))

const refusalLingers = Duration.seconds(15)

const stopTimeoutMs = 5_000

const daemonScriptPath = fileURLToPath(import.meta.url)

// NOTE: What this player was built from, read once as it starts: when
// `books` is updated under a running player the file is newer than this,
// and a command can tell the player is the older one.
const builtAtStart = buildOf(daemonScriptPath)

const appVersionAtStart = appVersionOf(daemonScriptPath)

const serve = Effect.gen(function* () {
  const socketPath = booksPlayerSocketPath()
  // NOTE: The made-up library signs nobody in and reads no real library;
  // its telemetry goes to a folder of its own, never beside his.
  const isMadeUp = madeUpNameOf() !== undefined
  const signIn = isMadeUp ? undefined : yield* Effect.promise(signInFromEnv)
  if (signIn !== undefined && signIn._tag === 'Refused') {
    return yield* listenBackgroundProcessor({
      socketPath,
      Model: SyncedBooks.Model,
      Message: SyncedBooks.Message,
      surface: refusingSurface(signIn.reason),
      until: Effect.sleep(refusalLingers),
    })
  }
  const writes = trackLibraryWrites()
  // NOTE: The made-up library's log lives in this process, so this player
  // serves it to `books tail` as the `log` topic. A real library's log is
  // read from Instant by `books tail` itself.
  const maybeMadeUpEngine = isMadeUp
    ? Option.some(
        isMadeUpSessionShared()
          ? sharedMadeUpSession({
              host: Processor.Host.Cli(),
              instance: newProcessorInstance(),
            })
          : Runtime.Memory({
              processor: `${Processor.Host.print(Processor.Host.Cli())}-${newProcessorInstance()}`,
            }),
      )
    : Option.none()
  const madeUpEmail = madeUpEmailOf()
  const daemonClientMetadata: Runtime.ClientMetadata = {
    ...(appVersionAtStart === '' ? {} : { appVersion: appVersionAtStart }),
    ...(isMadeUp && madeUpEmail !== undefined
      ? { userEmail: madeUpEmail }
      : {}),
  }
  const handle =
    signIn === undefined
      ? yield* Effect.promise(() =>
          startMadeUpBooks({
            host: Processor.Host.Cli(),
            library: writes.wrap,
            resources: terminalSystemAppearance(Effect.sync(madeUpContrastOf)),
            shelf: madeUpShelfOf(),
            clientMetadata: daemonClientMetadata,
            ...Option.match(maybeMadeUpEngine, {
              onNone: () => ({}),
              onSome: sync => ({ sync }),
            }),
          }),
        )
      : startBooks(signIn.signedIn, {
          host: Processor.Host.Cli(),
          instance: newProcessorInstance(),
          library: writes.wrap,
          clientMetadata: daemonClientMetadata,
        })
  const telemetry = Telemetry.attach(handle, {
    app: 'books',
    role: 'daemon',
    sink: isMadeUp
      ? fileSink({ directory: join(tmpdir(), 'foldkit-books-made-up') })
      : fileSink(),
  })
  yield* Effect.addFinalizer(() =>
    Effect.promise(() =>
      Promise.race([
        handle.stop(),
        new Promise(resolve => setTimeout(resolve, stopTimeoutMs)),
      ]),
    ),
  )
  const bound = bindBooks(handle)
  yield* Effect.addFinalizer(() => Effect.asVoid(pausedAndSaved(bound, writes)))
  yield* Effect.promise(() =>
    Interaction.whenSettled(bound, readyTimeoutMs).then(
      () => whenLibraryOpened(handle, readyTimeoutMs),
      () => whenLibraryOpened(handle, readyTimeoutMs),
    ),
  )
  const player = makeBooksPlayer(
    bound,
    writes,
    { onPainted: telemetry.recordRendered },
    builtAtStart,
    Option.match(maybeMadeUpEngine, {
      onNone: () => ({}),
      onSome: engine => ({
        log: () => followProgramTail(engine, MessageWire),
      }),
    }),
  )
  return yield* listenBackgroundProcessor({
    socketPath,
    Model: SyncedBooks.Model,
    Message: SyncedBooks.Message,
    surface: player.surface,
    until: Effect.raceAll([
      player.stopped,
      whenTitleFinished(bound, writes),
      whenIdleFor(bound, idleMs),
    ]),
  })
})

NodeRuntime.runMain(
  Effect.scoped(serve).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        process.exit(0)
      }),
    ),
  ),
)
