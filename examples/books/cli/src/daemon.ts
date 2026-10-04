#!/usr/bin/env node
/**
 * The Books player: one detached process per Instant app on this machine
 * that holds the Program and its ffplay audio, so `books listen
 * a-new-earth` keeps playing after the command returns, and `books pause`,
 * `books tui`, and every other command act on the same player through
 * its socket. The first command that needs it starts it. `books stop`,
 * the end of the title, or ten minutes with nothing in the player ends
 * it, after its place saves through the same Messages the web saves with.
 * It keeps its own screen and player even while the session mirrors
 * navigation, so a browser never moves it.
 */
import {
  SyncedBooks,
  bindBooks,
  newProcessorInstance,
  startBooks,
  whenLibraryOpened,
} from 'books-core-example'
import { Duration, Effect } from 'effect'
import { Interaction, Processor } from 'foldkit'
import { listenCliDaemon } from 'foldkit/cli'

import { NodeRuntime } from '@effect/platform-node'

import {
  makeBooksPlayer,
  pausedAndSaved,
  refusingSurface,
  trackLibraryWrites,
  whenIdleFor,
  whenTitleFinished,
} from './player.js'
import { booksPlayerSocketPath } from './settings.js'
import { signInFromEnv } from './signIn.js'

const readyTimeoutMs = 20_000

const idleMs = Duration.toMillis(Duration.minutes(10))

const refusalLingers = Duration.seconds(15)

const stopTimeoutMs = 5_000

const serve = Effect.gen(function* () {
  const socketPath = booksPlayerSocketPath()
  const signIn = yield* Effect.promise(signInFromEnv)
  if (signIn._tag === 'Refused') {
    return yield* listenCliDaemon({
      socketPath,
      Model: SyncedBooks.Model,
      Message: SyncedBooks.Message,
      surface: refusingSurface(signIn.reason),
      until: Effect.sleep(refusalLingers),
    })
  }
  const writes = trackLibraryWrites()
  const handle = startBooks(signIn.signedIn, {
    host: Processor.Host.Cli(),
    instance: newProcessorInstance(),
    library: writes.wrap,
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
  const player = makeBooksPlayer(bound, writes)
  return yield* listenCliDaemon({
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
