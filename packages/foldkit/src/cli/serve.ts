/// <reference types="node" />
import { Deferred, Duration, Effect, Schema as S, Stream } from 'effect'

import {
  type BindableProgram,
  type BoundInteraction,
  type ProgramHandle,
  bind,
  whenSettled,
} from '../interaction/bind.js'
import { Cli, type Host } from '../processor/host.js'
import type { ProgramSchema } from '../program/program.js'
import type { SyncEngine } from '../runtime/syncEngine.js'
import { startCliDaemonServer } from './listen.js'
import {
  DEFAULT_IDLE_GRACE_MS,
  type Heard,
  IDLE_CHECK_EVERY_MS,
  type Quiet,
  isGraceOver,
  quietAfter,
  quietSince,
} from './liveness.js'
import {
  type CliDaemonError,
  type CliDaemonPaintedResult,
  type CliDaemonSurface,
} from './protocol.js'
import {
  type CliFollowings,
  followTopicOf,
  programCliSurface,
  programFollowings,
} from './surface.js'
import { followProgramTail } from './tail.js'

// PROCESSOR

/**
 * A Program a terminal can host: what binds to a handle, with the Schemas
 * its Model and Messages travel as. `Program.compose.sync` makes one,
 * such as `SyncedCounter`.
 */
export type TerminalProgram<Model, Message> = BindableProgram<Model, Message> &
  Readonly<{
    Model: ProgramSchema<Model>
    Message: ProgramSchema<Message>
  }>

/**
 * What a host says about its Program, and all it says: the Program, and
 * how to start it on a Host. The rest is optional, for what no
 * declaration can know yet.
 *
 * - `keepsAlive` reads the Model for work that must outlive a command, in
 *   words a person can read, `['The Lantern Keeper is in the player']`.
 *   While it names any, the Background Processor stays up.
 * - `beforeStop` runs while the Program is still running, before the
 *   Processor stops for any reason, such as pausing and waiting for a
 *   place to save. What it resolves with is printed by `stop`.
 * - `log` names the sync engine and the Message Schema `tail` reads the
 *   log with, a line for each Message from every device. It is asked
 *   for when a view first follows the log, so a host nobody tails opens
 *   no second connection.
 * - `followings` are the Program's own topics to follow beside `screen`,
 *   such as Books' `words`.
 * - `surface` replaces what is painted and run, for a host whose commands
 *   are more than its Program's, such as a player. It is given the
 *   Program's own surface to answer the rest with.
 */
export type TerminalProcessor<Model, Message> = Readonly<{
  program: TerminalProgram<Model, Message>
  start: (host: Host) => ProgramHandle<Model, Message>
  keepsAlive?: (model: Model) => ReadonlyArray<string>
  beforeStop?: (
    bound: BoundInteraction<Model, Message>,
  ) => Promise<string | undefined>
  log?: () => Readonly<{ engine: SyncEngine; wire: S.Decoder<unknown> }>
  followings?: (bound: BoundInteraction<Model, Message>) => CliFollowings
  surface?: (
    bound: BoundInteraction<Model, Message>,
    programSurface: CliDaemonSurface<Model, Message>,
  ) => CliDaemonSurface<Model, Message>
}>

/**
 * What {@link serveTerminal} needs beside the Processor: the command's
 * name, the socket its commands reach it on, what it was built from, and
 * how long it waits with nothing to do before it stops.
 */
export type ServeTerminalOptions<Model, Message> = Readonly<{
  name: string
  socketPath: string
  build: string
  idleMs?: number
  processor: TerminalProcessor<Model, Message>
}>

// WORDS

/** The word that stops a Background Processor, `counter stop`. */
export const stopWord = 'stop'

/** The word a command asks a Background Processor what it was built from with. */
export const buildWord = 'background-build'

/** The flag a stopped Processor's answer carries. */
export const stoppedOutcome = 'Stopped'

const READY_TIMEOUT_MS = 20_000

const CAUGHT_UP_TIMEOUT_MS = 10_000

const STOP_TIMEOUT_MS = 5_000

const isStopped = (answer: unknown): boolean =>
  typeof answer === 'object' &&
  answer !== null &&
  'flags' in answer &&
  typeof answer.flags === 'object' &&
  answer.flags !== null &&
  'outcome' in answer.flags &&
  answer.flags.outcome === stoppedOutcome

const withinMs = <A>(promise: Promise<A>, limitMs: number): Promise<void> =>
  Promise.race([
    promise.then(
      () => undefined,
      () => undefined,
    ),
    new Promise<void>(resolve => {
      setTimeout(resolve, limitMs)
    }),
  ])

type CatchesUp = Readonly<{ whenCaughtUp: () => Promise<unknown> }>

const catchesUp = (handle: object): handle is CatchesUp =>
  'whenCaughtUp' in handle && typeof handle.whenCaughtUp === 'function'

// IDLE

/**
 * Completes once a Background Processor has had nothing to do for
 * `idleMs`: no work `heard` names, no view attached, and no command, read
 * every few seconds by the rule in `liveness.ts`. A Processor races it
 * with being told to stop.
 *
 * @example
 * ```typescript
 * yield* untilIdle({
 *   idleMs: DEFAULT_IDLE_GRACE_MS,
 *   heard: () => ({ reasons: titleInPlayer(bound), followers: 0, askedAtMs: 0 }),
 * })
 * ```
 */
export const untilIdle = (
  options: Readonly<{
    idleMs: number
    heard: () => Omit<Heard, 'nowMs'>
  }>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    let quiet: Quiet = quietSince(Date.now())
    while (!isGraceOver(quiet, Date.now(), options.idleMs)) {
      yield* Effect.sleep(
        Duration.millis(Math.min(IDLE_CHECK_EVERY_MS, options.idleMs)),
      )
      quiet = quietAfter(quiet, { ...options.heard(), nowMs: Date.now() })
    }
  })

// SERVE

/**
 * Runs a Program as its terminal's Background Processor until it is told
 * to stop or has had nothing to do for the grace: starts it on the `Cli`
 * Host, listens on the socket at once and answers once the Program is
 * settled and has caught up with its log, paints and runs every command
 * through the Program's own declarations, serves `screen` and `log` to
 * follow, and on the way out runs `beforeStop`, stops the Program, and
 * removes the socket. `terminal` calls it in the process it starts for
 * this; a host never calls it itself.
 *
 * @example
 * ```typescript
 * await serveTerminal({
 *   name: 'counter',
 *   socketPath,
 *   build,
 *   processor: {
 *     program: SyncedCounter,
 *     start: host => startCounter({ host, instance: newProcessorInstance() }),
 *   },
 * })
 * ```
 */
export const serveTerminal = <Model, Message>(
  options: ServeTerminalOptions<Model, Message>,
): Promise<void> => {
  const { name, processor } = options
  const idleMs = options.idleMs ?? DEFAULT_IDLE_GRACE_MS
  const state: {
    askedAtMs: number
    followers: number
    hasRunBeforeStop: boolean
  } = { askedAtMs: Date.now(), followers: 0, hasRunBeforeStop: false }

  const serve = Effect.gen(function* () {
    const stopping = yield* Deferred.make<void>()
    const askToStop = (): void => {
      Deferred.doneUnsafe(stopping, Effect.void)
    }
    process.once('SIGTERM', askToStop)
    process.once('SIGINT', askToStop)

    const handle = processor.start(Cli())
    const bound = bind(processor.program, handle)

    // NOTE: The socket listens before the Program is ready, and every
    // answer waits for it. A command that arrives while a slow log is
    // read waits here, in the Processor that is already starting, where
    // otherwise it would give up and start a second one.
    const ready = whenSettled(bound, READY_TIMEOUT_MS).then(
      () =>
        catchesUp(handle)
          ? withinMs(handle.whenCaughtUp(), CAUGHT_UP_TIMEOUT_MS)
          : undefined,
      () => undefined,
    )
    const whenReady = Effect.promise(() => ready)

    const beforeStop = (): Promise<string | undefined> => {
      if (state.hasRunBeforeStop || processor.beforeStop === undefined) {
        return Promise.resolve(undefined)
      } else {
        state.hasRunBeforeStop = true
        return processor.beforeStop(bound)
      }
    }

    const programSurface = programCliSurface(bound, name)
    const maybeLog = processor.log
    const followings: CliFollowings = {
      ...programFollowings(bound, name),
      ...(maybeLog === undefined
        ? {}
        : {
            log: () => {
              const log = maybeLog()
              return followProgramTail(log.engine, log.wire)
            },
          }),
      ...(processor.followings === undefined
        ? {}
        : processor.followings(bound)),
    }
    const withFollowings: CliDaemonSurface<Model, Message> = {
      ...programSurface,
      follow: (topic, flags, client) =>
        followTopicOf(followings, topic, flags, client),
    }
    const inner =
      processor.surface === undefined
        ? withFollowings
        : processor.surface(bound, withFollowings)

    const asked = <A, E>(answer: Effect.Effect<A, E>): Effect.Effect<A, E> =>
      Effect.andThen(whenReady, () => {
        state.askedAtMs = Date.now()
        return answer
      })

    const stopped = (): Effect.Effect<CliDaemonPaintedResult, CliDaemonError> =>
      Effect.map(Effect.promise(beforeStop), said => ({
        stdout:
          said === undefined ? `Stopped ${name}'s Background Processor.` : said,
        exitCode: 0,
        flags: { outcome: stoppedOutcome, build: options.build },
      }))

    const stamped = (
      painted: CliDaemonPaintedResult,
    ): CliDaemonPaintedResult => ({
      ...painted,
      flags: { ...painted.flags, build: options.build },
    })

    const surface: CliDaemonSurface<Model, Message> = {
      read: () => asked(inner.read()),
      run: message => asked(inner.run(message)),
      show: (flags, client) =>
        asked(
          Effect.map(
            inner.show === undefined
              ? programSurface.show === undefined
                ? Effect.succeed({ stdout: '', exitCode: 0 })
                : programSurface.show(flags, client)
              : inner.show(flags, client),
            stamped,
          ),
        ),
      do: (token, flags, client) => {
        if (token === buildWord) {
          return Effect.succeed({ stdout: options.build, exitCode: 0 })
        } else if (token === stopWord) {
          return asked(stopped())
        } else {
          return asked(
            Effect.map(
              inner.do === undefined
                ? Effect.succeed({ stdout: '', exitCode: 0 })
                : inner.do(token, flags, client),
              stamped,
            ),
          )
        }
      },
      follow: (topic, flags, client) =>
        Stream.unwrap(
          Effect.sync(() => {
            state.followers += 1
            const topicStream =
              inner.follow === undefined
                ? followTopicOf(followings, topic, flags, client)
                : inner.follow(topic, flags, client)
            return Stream.ensuring(
              topicStream,
              Effect.sync(() => {
                state.followers -= 1
                state.askedAtMs = Date.now()
              }),
            )
          }),
        ),
    }

    const whenIdle = untilIdle({
      idleMs,
      heard: () => ({
        reasons:
          processor.keepsAlive === undefined
            ? []
            : processor.keepsAlive(bound.readModel()),
        followers: state.followers,
        askedAtMs: state.askedAtMs,
      }),
    })

    yield* Effect.scoped(
      Effect.gen(function* () {
        yield* startCliDaemonServer({
          socketPath: options.socketPath,
          Model: processor.program.Model,
          Message: processor.program.Message,
          surface,
          onAnswered: answer => {
            if (isStopped(answer)) {
              askToStop()
            }
          },
        })
        yield* Effect.raceFirst(Deferred.await(stopping), whenIdle)
        yield* Effect.promise(() => withinMs(beforeStop(), STOP_TIMEOUT_MS))
      }),
    )
    yield* Effect.promise(() => withinMs(handle.stop(), STOP_TIMEOUT_MS))
  })

  return Effect.runPromise(serve).then(
    () => {
      process.exit(0)
    },
    cause => {
      process.stderr.write(`${String(cause)}\n`)
      process.exit(1)
    },
  )
}
