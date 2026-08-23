import { Array, Console, Effect, Match as M, Option } from 'effect'
import { Runtime } from 'foldkit'
import { renderScreen } from 'foldkit/renderers'
import { readFileSync } from 'node:fs'
import {
  type Device,
  type Message,
  type Model,
  PuzzleProgram,
  puzzleScreen,
  uriOf,
} from 'puzzle-core-example'

import { PuzzleCliError } from './cliError.js'
import {
  type CliExecution,
  paintDoExecution,
  paintShowExecution,
  parseDevice,
  resolveHostDo,
} from './paintHost.js'
import { type CliTapeOptions, withSession } from './session.js'

export { PuzzleCliError, readyCount } from './cliError.js'
export type { CliTapeOptions } from './session.js'
export type { CliExecution } from './paintHost.js'

const decodeDevice = (
  raw: string | undefined,
): Effect.Effect<Device | undefined, PuzzleCliError> => {
  const decoded = parseDevice(raw)
  if (decoded._tag === 'Failed') {
    return Effect.fail(new PuzzleCliError({ message: decoded.error }))
  }
  if (decoded._tag === 'None') {
    return Effect.succeed(undefined)
  }
  return Effect.succeed(decoded.device)
}

/** Prints IDENTITY and ACESS. Optional `--device` wraps the product tree. */
export const executeShow = (
  deviceRaw: string | undefined,
  path: string | undefined,
  options: CliTapeOptions = {},
): Effect.Effect<CliExecution, PuzzleCliError> =>
  Effect.gen(function* () {
    const device = yield* decodeDevice(deviceRaw)
    return yield* withSession(
      (_session, initialModel) =>
        Effect.sync(() => paintShowExecution(initialModel, device, path)).pipe(
          Effect.withSpan('cli.paint'),
        ),
      options,
    )
  })

/** Sends one semantic token, then auto-shows. */
export const executeDo = (
  token: string,
  options: CliTapeOptions = {},
): Effect.Effect<CliExecution, PuzzleCliError> =>
  Effect.gen(function* () {
    return yield* withSession(
      (session, initialModel) =>
        Effect.gen(function* () {
          const resolved = resolveHostDo(token, initialModel)
          if (resolved._tag === 'Unknown') {
            return yield* Effect.fail(
              new PuzzleCliError({
                message: resolved.message,
              }),
            )
          }
          if (resolved._tag === 'Invalid') {
            return yield* Effect.sync(() => resolved.execution).pipe(
              Effect.withSpan('cli.paint'),
            )
          }
          const ran = yield* session.run(resolved.action())
          return yield* Effect.sync(() =>
            paintDoExecution(
              initialModel,
              resolved.action,
              token,
              ran.model,
              ran.link,
            ),
          ).pipe(Effect.withSpan('cli.paint'))
        }),
      options,
    )
  })

const describeTapeError = (error: Runtime.ReplayTapeDecodeError): string =>
  M.value(error).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      ReplayTapeImportError: ({ message }) => message,
      IncompatibleProgramError: ({ expectedProgramId, actualProgramId }) =>
        `Tape program is ${actualProgramId}. Expected ${expectedProgramId}.`,
      IncompatibleProgramVersionError: ({
        expectedVersion,
        actualVersion,
        programId,
      }) =>
        `Tape ${programId} version ${actualVersion.toString()} does not match ${expectedVersion.toString()}.`,
      ReplayTapeMigrationError: ({ programId, fromVersion, toVersion }) =>
        `Tape ${programId} could not migrate from ${fromVersion.toString()} to ${toVersion.toString()}.`,
    }),
  )

const validLine = (
  items: ReadonlyArray<{
    readonly token: string
    readonly valid: boolean
  }>,
): string =>
  Array.map(items, item => {
    return `  ${item.token.padEnd(12)}${item.valid ? 'true' : 'false'}`
  }).join('\n')

const formatReplayFrame = (
  frame: number,
  model: Model,
  maybeMessage: Option.Option<Message>,
  valid: ReadonlyArray<{
    readonly token: string
    readonly valid: boolean
  }>,
  screen: ReturnType<typeof puzzleScreen>,
): string => {
  const messageLine = Option.match(maybeMessage, {
    onNone: () => '  (none)',
    onSome: message => `  ${message._tag}`,
  })
  return [
    `FRAME ${frame.toString()}`,
    'MESSAGE',
    messageLine,
    'STATE',
    `  tape     ${uriOf(model)}`,
    'VALID',
    validLine(valid),
    'SCREEN',
    renderScreen(screen),
  ].join('\n')
}

/** One replay of a Program tape. The CLI does not reimplement update. */
export type ReplayExecution = Readonly<{
  models: ReadonlyArray<Model>
  stdout: string
}>

/** Steps a portable tape through Runtime.replayToFrame. */
export const executeReplay = (
  tapePath: string,
): Effect.Effect<ReplayExecution, PuzzleCliError> =>
  Effect.gen(function* () {
    const json = yield* Effect.try({
      try: () => readFileSync(tapePath, 'utf8'),
      catch: () =>
        new PuzzleCliError({
          message: `Cannot read tape at ${tapePath}.`,
        }),
    })
    const tape = yield* Runtime.decodeReplayTape(PuzzleProgram, json).pipe(
      Effect.mapError(
        error =>
          new PuzzleCliError({
            message: describeTapeError(error),
          }),
      ),
    )
    const frames = Array.range(0, tape.transitions.length)
    const rendered = yield* Effect.forEach(frames, frame =>
      Runtime.inspectReplayFrame(PuzzleProgram, tape, frame).pipe(
        Effect.map(inspection => {
          const maybeMessage =
            frame === 0
              ? Option.none()
              : Option.map(
                  Array.get(tape.transitions, frame - 1),
                  transition => transition.message,
                )
          const screen = Option.getOrElse(inspection.screen, () =>
            puzzleScreen(inspection.model),
          )
          return {
            model: inspection.model,
            block: formatReplayFrame(
              frame,
              inspection.model,
              maybeMessage,
              inspection.valid,
              screen,
            ),
          }
        }),
        Effect.mapError(
          error =>
            new PuzzleCliError({
              message: `Tape frame ${error.frame.toString()} is out of range.`,
            }),
        ),
      ),
    )
    return {
      models: Array.map(rendered, item => item.model),
      stdout: Array.map(rendered, item => item.block).join('\n\n'),
    }
  })

/** Runs `show` and prints. */
export const runShow = (
  deviceRaw: string | undefined,
  path: string | undefined,
): Effect.Effect<void, PuzzleCliError> =>
  Effect.gen(function* () {
    const execution = yield* executeShow(deviceRaw, path)
    yield* Console.log(execution.stdout).pipe(Effect.withSpan('cli.print'))
  }).pipe(Effect.withSpan('puzzle.show'))

/** Runs `do` and prints the receipt plus auto-show. */
export const runDo = (token: string): Effect.Effect<void, PuzzleCliError> =>
  Effect.gen(function* () {
    const execution = yield* executeDo(token)
    yield* Console.log(execution.stdout).pipe(Effect.withSpan('cli.print'))
  }).pipe(Effect.withSpan('puzzle.do'))

/** Runs `replay` and prints each tape frame. */
export const runReplay = (
  tapePath: string,
): Effect.Effect<void, PuzzleCliError> =>
  Effect.gen(function* () {
    const execution = yield* executeReplay(tapePath)
    yield* Console.log(execution.stdout)
  })
