import { Data, type Effect, Schema as S } from 'effect'

import type { ProgramSchema } from '../program/program.js'
import { ts } from '../schema/index.js'

/** Protocol version for one CLI daemon request. */
export const cliDaemonProtocolVersion = 1

/** Asks the daemon for the current Model. */
export const CliDaemonRead = ts('Read')
/** Asks the daemon for the current Model. */
export type CliDaemonRead = typeof CliDaemonRead.Type

/** Sends one Message to the daemon Processor. */
export const makeCliDaemonRun = <Message>(Message: ProgramSchema<Message>) =>
  ts('Run', {
    message: Message,
  })

/** One request a non-captive CLI sends to its daemon. */
export const makeCliDaemonRequest = <Message>(
  Message: ProgramSchema<Message>,
) => S.Union([CliDaemonRead, makeCliDaemonRun(Message)])

/** Optional string flags a view sends with Show or Do. */
export const CliDaemonFlags = S.Record(S.String, S.String)
/** Optional string flags a view sends with Show or Do. */
export type CliDaemonFlags = typeof CliDaemonFlags.Type

/** Asks the daemon to paint the current Model. */
export const CliDaemonShow = ts('Show', {
  flags: S.optionalKey(CliDaemonFlags),
})
/** Asks the daemon to paint the current Model. */
export type CliDaemonShow = typeof CliDaemonShow.Type

/** Asks the daemon to run one token and paint. */
export const CliDaemonDo = ts('Do', {
  token: S.String,
  flags: S.optionalKey(CliDaemonFlags),
})
/** Asks the daemon to run one token and paint. */
export type CliDaemonDo = typeof CliDaemonDo.Type

/** Settled Model after Read or Run. */
export const makeCliDaemonOk = <Model>(Model: ProgramSchema<Model>) =>
  S.Struct({
    _tag: S.Literal('Ok'),
    model: Model,
    previous: S.optionalKey(Model),
  })

/** Daemon could not read, run, or paint. */
export const CliDaemonFailed = ts('Failed', {
  cause: S.String,
})
/** Daemon could not read, run, or paint. */
export type CliDaemonFailed = typeof CliDaemonFailed.Type

/** Painted stdout from Show or Do. Paint stays in the daemon. */
export const CliDaemonPainted = ts('Painted', {
  stdout: S.String,
  exitCode: S.Number,
  stderr: S.optionalKey(S.String),
})
/** Painted stdout from Show or Do. */
export type CliDaemonPainted = typeof CliDaemonPainted.Type

/** One response the daemon writes back to a CLI view. */
export const makeCliDaemonResponse = <Model>(Model: ProgramSchema<Model>) =>
  S.Union([makeCliDaemonOk(Model), CliDaemonPainted, CliDaemonFailed])

/** Socket, spawn, or protocol failure for the CLI adapter. */
export class CliDaemonError extends Data.TaggedError('CliDaemonError')<{
  readonly message: string
}> {}

/** Painted stdout a Program daemon returns for Show or Do. */
export type CliDaemonPaintedResult = Readonly<{
  stdout: string
  exitCode: number
  stderr?: string
}>

/** The live Processor the daemon holds. */
export type CliDaemonSurface<Model, Message> = Readonly<{
  read: () => Effect.Effect<Model, CliDaemonError>
  run: (message: Message) => Effect.Effect<
    Readonly<{
      model: Model
      previous: Model
    }>,
    CliDaemonError
  >
  show?: (
    flags: CliDaemonFlags,
  ) => Effect.Effect<CliDaemonPaintedResult, CliDaemonError>
  do?: (
    token: string,
    flags: CliDaemonFlags,
  ) => Effect.Effect<CliDaemonPaintedResult, CliDaemonError>
}>

/** How long a CLI view waits for the daemon socket. */
export const cliDaemonReadyTimeoutMs = 20_000
