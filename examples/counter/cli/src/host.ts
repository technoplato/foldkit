import {
  CounterProgram,
  type Device,
  type Message,
  type Model,
  counterScreen,
  tokenOf,
} from 'counter-core-example'
import { Array, Console, Effect, Match as M, Option } from 'effect'
import { Program, Runtime } from 'foldkit'
import { renderScreen } from 'foldkit/renderers'
import { readFileSync } from 'node:fs'

import { CounterCliError } from './cliError.js'
import {
  type CliExecution,
  occupancyToOpen,
  paintDoExecution,
  paintPaletteExecution,
  paintShowExecution,
  parseDevice,
  resolveHostDo,
  resolveHostSpoken,
} from './paintHost.js'
import { type CliTapeOptions, withSession } from './session.js'

export { CounterCliError, readyCount } from './cliError.js'
export type { CliTapeOptions } from './session.js'
export type { CliExecution } from './paintHost.js'

const decodeDevice = (
  raw: string | undefined,
): Effect.Effect<Device | undefined, CounterCliError> => {
  const decoded = parseDevice(raw)
  if (decoded._tag === 'Failed') {
    return Effect.fail(new CounterCliError({ message: decoded.error }))
  }
  if (decoded._tag === 'None') {
    return Effect.succeed(undefined)
  }
  return Effect.succeed(decoded.device)
}

/** Prints IDENTITY and ACESS. `--device` / `--path` occupy the Model. */
export const executeShow = (
  deviceRaw: string | undefined,
  path: string | undefined,
  options: CliTapeOptions = {},
): Effect.Effect<CliExecution, CounterCliError> =>
  Effect.gen(function* () {
    const device = yield* decodeDevice(deviceRaw)
    return yield* withSession(
      (session, initialModel) =>
        Effect.gen(function* () {
          const maybeOpen = occupancyToOpen(device, path)
          if (Option.isNone(maybeOpen)) {
            return yield* Effect.sync(() =>
              paintShowExecution(initialModel, undefined, undefined),
            ).pipe(Effect.withSpan('cli.paint'))
          }
          const ran = yield* session.run(maybeOpen.value)
          return yield* Effect.sync(() => ({
            ...paintShowExecution(ran.model, undefined, undefined),
            initialModel,
            maybeMessage: Option.some(maybeOpen.value),
            finalModel: ran.model,
            link: ran.link,
          })).pipe(Effect.withSpan('cli.paint'))
        }),
      options,
    )
  })

/** Lists Actions, or sends one token through the Action menu. */
export const executePalette = (
  token: string | undefined,
  options: CliTapeOptions = {},
): Effect.Effect<CliExecution, CounterCliError> =>
  Effect.gen(function* () {
    return yield* withSession(
      (session, initialModel) =>
        Effect.gen(function* () {
          if (token === undefined) {
            return yield* Effect.sync(() =>
              paintPaletteExecution(initialModel),
            ).pipe(Effect.withSpan('cli.paint'))
          }
          const resolved = resolveHostDo(token, initialModel)
          if (resolved._tag === 'Unknown') {
            return yield* Effect.fail(
              new CounterCliError({
                message: resolved.message,
              }),
            )
          }
          if (resolved._tag === 'Invalid') {
            return yield* Effect.sync(() => resolved.execution).pipe(
              Effect.withSpan('cli.paint'),
            )
          }
          yield* session.run(Program.ActionMenuCommandTriggered())
          const ran = yield* session.run(
            Program.ActionCommandMenuSelectionMade({ token }),
          )
          return yield* Effect.sync(() =>
            paintDoExecution(
              initialModel,
              resolved.action,
              token,
              ran.model,
              ran.link,
              'palette',
            ),
          ).pipe(Effect.withSpan('cli.paint'))
        }),
      options,
    )
  })

/** Sends one spoken phrase, then auto-shows. */
export const executeSay = (
  utterance: string,
  options: CliTapeOptions = {},
): Effect.Effect<CliExecution, CounterCliError> =>
  Effect.gen(function* () {
    return yield* withSession(
      (session, initialModel) =>
        Effect.gen(function* () {
          const resolved = resolveHostSpoken(utterance, initialModel)
          if (resolved._tag === 'Unknown') {
            return yield* Effect.fail(
              new CounterCliError({
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
              tokenOf(resolved.action),
              ran.model,
              ran.link,
              'spoken',
            ),
          ).pipe(Effect.withSpan('cli.paint'))
        }),
      options,
    )
  })

/** Sends one semantic token, then auto-shows. */
export const executeDo = (
  token: string,
  options: CliTapeOptions = {},
): Effect.Effect<CliExecution, CounterCliError> =>
  Effect.gen(function* () {
    return yield* withSession(
      (session, initialModel) =>
        Effect.gen(function* () {
          const resolved = resolveHostDo(token, initialModel)
          if (resolved._tag === 'Unknown') {
            return yield* Effect.fail(
              new CounterCliError({
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
  screen: ReturnType<typeof counterScreen>,
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
    `  count    ${model.count.toString()}`,
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
): Effect.Effect<ReplayExecution, CounterCliError> =>
  Effect.gen(function* () {
    const json = yield* Effect.try({
      try: () => readFileSync(tapePath, 'utf8'),
      catch: () =>
        new CounterCliError({
          message: `Cannot read tape at ${tapePath}.`,
        }),
    })
    const tape = yield* Runtime.decodeReplayTape(CounterProgram, json).pipe(
      Effect.mapError(
        error =>
          new CounterCliError({
            message: describeTapeError(error),
          }),
      ),
    )
    const frames = Array.range(0, tape.transitions.length)
    const rendered = yield* Effect.forEach(frames, frame =>
      Runtime.inspectReplayFrame(CounterProgram, tape, frame).pipe(
        Effect.map(inspection => {
          const maybeMessage =
            frame === 0
              ? Option.none()
              : Option.map(
                  Array.get(tape.transitions, frame - 1),
                  transition => transition.message,
                )
          const screen = Option.getOrElse(inspection.screen, () =>
            counterScreen(inspection.model),
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
            new CounterCliError({
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
): Effect.Effect<void, CounterCliError> =>
  Effect.gen(function* () {
    const execution = yield* executeShow(deviceRaw, path)
    yield* Console.log(execution.stdout).pipe(Effect.withSpan('cli.print'))
  }).pipe(Effect.withSpan('counter.show'))

/** Runs `do` and prints the receipt plus auto-show. */
export const runDo = (token: string): Effect.Effect<void, CounterCliError> =>
  Effect.gen(function* () {
    const execution = yield* executeDo(token)
    yield* Console.log(execution.stdout).pipe(Effect.withSpan('cli.print'))
  }).pipe(Effect.withSpan('counter.do'))

/** Runs `palette` and prints the catalog or a receipt. */
export const runPalette = (
  token: string | undefined,
): Effect.Effect<void, CounterCliError> =>
  Effect.gen(function* () {
    const execution = yield* executePalette(token)
    yield* Console.log(execution.stdout).pipe(Effect.withSpan('cli.print'))
  }).pipe(Effect.withSpan('counter.palette'))

/** Runs `say` and prints the receipt plus auto-show. */
export const runSay = (
  utterance: string,
): Effect.Effect<void, CounterCliError> =>
  Effect.gen(function* () {
    const execution = yield* executeSay(utterance)
    yield* Console.log(execution.stdout).pipe(Effect.withSpan('cli.print'))
  }).pipe(Effect.withSpan('counter.say'))

/** Runs `replay` and prints each tape frame. */
export const runReplay = (
  tapePath: string,
): Effect.Effect<void, CounterCliError> =>
  Effect.gen(function* () {
    const execution = yield* executeReplay(tapePath)
    yield* Console.log(execution.stdout)
  })
