import {
  type BoundBooks,
  type LibraryStoreService,
  type SyncedBooksMessage,
  type SyncedBooksModel,
  briefScreen,
  clockOf,
  loadedTitleOf,
  placeOf,
  suggestedPressesOf,
} from 'books-core-example'
import { Array, Deferred, Duration, Effect, Option, pipe } from 'effect'
import { Interaction, type Processor } from 'foldkit'
import {
  CliDaemonError,
  type CliDaemonFlags,
  type CliDaemonPaintedResult,
  type CliDaemonSurface,
  type HostCommand,
  type TerminalPaintReporting,
  isTerminalViewRequest,
  makeProgramTerminalView,
  paintCommands,
  paintProgram,
  programCliSurface,
  runProgramCommand,
} from 'foldkit/cli'
import { renderScreen } from 'foldkit/renderers'
import * as TranscriptPlayer from 'transcript-player-core-example'

import { booksCommandName } from './settings.js'

// BRIEF

const readyOf = (
  model: SyncedBooksModel,
): Option.Option<Extract<SyncedBooksModel, { _tag: 'Ready' }>> =>
  model._tag === 'Ready' ? Option.some(model) : Option.none()

const hostCommandsOf = (isLoaded: boolean): ReadonlyArray<HostCommand> => [
  { command: 'tui', what: 'Opens the live player here' },
  ...(isLoaded
    ? [{ command: 'stop', what: 'Stops and saves your place' }]
    : []),
  { command: 'actions', what: 'Lists every command' },
  { command: 'login', what: 'Signs in to Cloudflare Access' },
]

const briefWidth = 200

const statusOf = (bound: BoundBooks): string => {
  const status = bound.status()
  return status._tag === 'Ready' ? 'Ready' : status.description
}

/**
 * What a terminal command prints after it runs: Books in a few lines, what
 * is playing, the chapter, the time left, and whether it plays, then the
 * commands to copy for this moment, such as `books pause` while it plays
 * and `books listen 12-rules-for-life` for another title.
 *
 * @example
 * ```typescript
 * paintBrief(bound)
 * // '▶ Playing A New Earth\n…\n\n  books pause   Pauses where it is\n…'
 * ```
 */
export const paintBrief = (bound: BoundBooks): string =>
  Option.match(readyOf(bound.readModel()), {
    onNone: () => statusOf(bound),
    onSome: model =>
      Array.join(
        [
          ...Array.map(
            renderScreen(briefScreen(model), briefWidth).split('\n'),
            line => line.trimEnd(),
          ),
          '',
          ...paintCommands(
            bound,
            booksCommandName,
            suggestedPressesOf(model),
            hostCommandsOf(Option.isSome(loadedTitleOf(model))),
          ),
        ],
        '\n',
      ),
  })

// WRITES

/**
 * The library store's writes as a player watches them, so it can wait for
 * a place to save before it exits: `wrap` counts each write, `count` says
 * how many have started, and `whenDone` resolves once a write after that
 * count has finished and none is in flight, or after `timeoutMs`.
 */
export type LibraryWrites = Readonly<{
  wrap: (store: LibraryStoreService) => LibraryStoreService
  count: () => number
  whenDone: (afterCount: number, timeoutMs: number) => Promise<void>
}>

/**
 * Starts watching the library store's writes.
 *
 * @example
 * ```typescript
 * const writes = trackLibraryWrites()
 * startBooks(signedIn, { host, instance, library: writes.wrap })
 * ```
 */
export const trackLibraryWrites = (): LibraryWrites => {
  const state = {
    started: 0,
    finished: 0,
    waiters: new Set<() => void>(),
  }
  const isQuiet = (afterCount: number): boolean =>
    state.started > afterCount && state.finished === state.started
  const settle = (): void => {
    Array.forEach(Array.fromIterable(state.waiters), waiter => {
      waiter()
    })
  }
  const wrap = (store: LibraryStoreService): LibraryStoreService => ({
    ...store,
    write: write =>
      Effect.acquireUseRelease(
        Effect.sync(() => {
          state.started += 1
        }),
        () => store.write(write),
        () =>
          Effect.sync(() => {
            state.finished += 1
            settle()
          }),
      ),
  })
  const whenDone = (afterCount: number, timeoutMs: number): Promise<void> =>
    new Promise(resolve => {
      const done = (): void => {
        clearTimeout(timer)
        state.waiters.delete(check)
        resolve()
      }
      const check = (): void => {
        if (isQuiet(afterCount)) {
          done()
        }
      }
      const timer = setTimeout(done, timeoutMs)
      state.waiters.add(check)
      check()
    })
  return { wrap, count: () => state.started, whenDone }
}

// PLAYER

const saveTimeoutMs = 5_000

const loadedNowOf = (bound: BoundBooks) =>
  Option.flatMap(readyOf(bound.readModel()), loadedTitleOf)

/**
 * Pauses the title playing, if one is, and waits for its place to save,
 * up to five seconds. Says what it stopped, or that nothing was playing.
 * A player runs it before it exits for any reason, so `books stop` and a
 * SIGTERM both keep the place. `maybeClient` is the Host of the client
 * that asked, such as `Cli` for `books stop`, which the Pause is sent for.
 */
export const pausedAndSaved = (
  bound: BoundBooks,
  writes: LibraryWrites,
  maybeClient: Option.Option<Processor.Host.Host> = Option.none(),
) =>
  Effect.gen(function* () {
    const maybeLoaded = loadedNowOf(bound)
    if (Option.isNone(maybeLoaded)) {
      return 'Nothing was playing. The player has stopped.'
    }
    const { title, loaded } = maybeLoaded.value
    const isUnsaved =
      TranscriptPlayer.isSounding(loaded.player) &&
      placeOf(loaded) !== loaded.savedPlaceMs
    const before = writes.count()
    if (TranscriptPlayer.isSounding(loaded.player)) {
      Option.match(maybeClient, {
        onNone: () => bound.press('Pause'),
        onSome: client =>
          Interaction.onBehalfOf(bound, client, () => bound.press('Pause')),
      })
    }
    if (isUnsaved) {
      yield* Effect.promise(() => writes.whenDone(before, saveTimeoutMs))
    }
    return `Stopped ${title.name} at ${clockOf(placeOf(loaded))}. Your place is saved.`
  })

const wordsOf = (token: string): ReadonlyArray<string> =>
  pipe(
    token.split(' '),
    Array.filter(word => word !== ''),
  )

const briefWords: ReadonlySet<string> = new Set(['', 'help', 'show'])

/** The Books player a daemon serves, and the moment `books stop` asks it to end. */
export type BooksPlayer = Readonly<{
  surface: CliDaemonSurface<SyncedBooksModel, SyncedBooksMessage>
  stopped: Effect.Effect<void>
}>

/**
 * The Books player's socket surface. Every command acts on this one
 * player and prints the brief after it runs: `books listen a-new-earth`
 * plays, `books pause` pauses, `books seek-to 1h00m00s` moves. `books` and
 * `books help` print the brief, `books actions` every command, and
 * `books stop` pauses, waits for the place to save, says so, and ends the
 * player. A terminal UI view gets the player's screen, fitted to its
 * terminal, and its keys go through the same Program. Every command and
 * key is sent on behalf of the client that asked, `Cli` for `books pause`
 * and `Tui` for a `books tui` key, so telemetry records what each caused
 * on that client's surface. `onPainted` hears how long each frame took to
 * paint, such as telemetry's `recordRendered`.
 *
 * @example
 * ```typescript
 * const player = makeBooksPlayer(bound, trackLibraryWrites(), {
 *   onPainted: telemetry.recordRendered,
 * })
 * yield* listenCliDaemon({ socketPath, Model, Message, surface: player.surface, until: player.stopped })
 * ```
 */
export const makeBooksPlayer = (
  bound: BoundBooks,
  writes: LibraryWrites,
  reporting: TerminalPaintReporting = {},
): BooksPlayer => {
  const programSurface = programCliSurface(bound, booksCommandName)
  const terminal = makeProgramTerminalView(bound, booksCommandName, reporting)
  const stopped = Effect.runSync(Deferred.make<void>())
  const brief = (): CliDaemonPaintedResult => ({
    stdout: paintBrief(bound),
    exitCode: 0,
  })
  const ran = (
    words: ReadonlyArray<string>,
    flags: CliDaemonFlags,
    client: Processor.Host.Host,
  ): CliDaemonPaintedResult => {
    const result = Interaction.onBehalfOf(bound, client, () =>
      runProgramCommand(bound, booksCommandName, words, flags),
    )
    return {
      stdout: paintBrief(bound),
      exitCode: result.exitCode,
      ...(result.stderr === undefined ? {} : { stderr: result.stderr }),
    }
  }
  const stop = (client: Processor.Host.Host) =>
    Effect.gen(function* () {
      const sentence = yield* pausedAndSaved(bound, writes, Option.some(client))
      yield* Deferred.succeed(stopped, undefined)
      return { stdout: sentence, exitCode: 0 }
    })
  return {
    stopped: Deferred.await(stopped),
    surface: {
      read: programSurface.read,
      run: programSurface.run,
      show: (flags, client) =>
        isTerminalViewRequest(flags)
          ? terminal.paint(flags, client)
          : Effect.sync(brief),
      do: (token, flags, client) => {
        const words = wordsOf(token)
        const head = Option.getOrElse(Array.head(words), () => '')
        if (isTerminalViewRequest(flags)) {
          return terminal.pressKey(flags, client)
        } else if (briefWords.has(head)) {
          return Effect.sync(brief)
        } else if (head === 'actions') {
          return Effect.sync(() => ({
            stdout: paintProgram(bound, booksCommandName),
            exitCode: 0,
          }))
        } else if (head === 'stop') {
          return stop(client)
        } else if (head === 'where') {
          return Effect.sync(() =>
            runProgramCommand(bound, booksCommandName, words, flags),
          )
        } else {
          return Effect.sync(() => ran(words, flags, client))
        }
      },
    },
  }
}

/**
 * A surface that answers every command with why the player could not
 * start, such as a sign-in Cloudflare Access refused, so the command that
 * started it can say so.
 */
export const refusingSurface = (
  reason: string,
): CliDaemonSurface<SyncedBooksModel, SyncedBooksMessage> => {
  const refused = Effect.succeed({ stdout: '', stderr: reason, exitCode: 1 })
  return {
    read: () => Effect.fail(new CliDaemonError({ message: reason })),
    run: () => Effect.fail(new CliDaemonError({ message: reason })),
    show: () => refused,
    do: () => refused,
  }
}

// DONE

const idleCheckEvery = Duration.seconds(30)

/**
 * Completes when the title in the player plays to its end, once its finish
 * is saved, so the player can exit.
 */
export const whenTitleFinished = (bound: BoundBooks, writes: LibraryWrites) =>
  Effect.callback<void>(resume => {
    const state = { wasSounding: false, writesWhileSounding: writes.count() }
    const check = (): void => {
      const maybeLoaded = loadedNowOf(bound)
      const isSounding = Option.exists(maybeLoaded, ({ loaded }) =>
        TranscriptPlayer.isSounding(loaded.player),
      )
      const isAtEnd = Option.exists(
        maybeLoaded,
        ({ title, loaded }) => placeOf(loaded) >= title.durationMs,
      )
      if (state.wasSounding && !isSounding && isAtEnd) {
        stopWatching()
        void writes
          .whenDone(state.writesWhileSounding, saveTimeoutMs)
          .then(() => {
            resume(Effect.void)
          })
      } else if (isSounding) {
        state.writesWhileSounding = writes.count()
      }
      state.wasSounding = isSounding
    }
    const stopWatching = bound.subscribe(check)
    check()
    return Effect.sync(stopWatching)
  })

/**
 * Completes once nothing has been in the player for `idleMs`, so a player
 * started only to print the brief does not stay forever.
 */
export const whenIdleFor = (bound: BoundBooks, idleMs: number) =>
  Effect.gen(function* () {
    const state = { idleSinceMs: Date.now() }
    while (Date.now() - state.idleSinceMs < idleMs) {
      yield* Effect.sleep(idleCheckEvery)
      if (Option.isSome(loadedNowOf(bound))) {
        state.idleSinceMs = Date.now()
      }
    }
  })
