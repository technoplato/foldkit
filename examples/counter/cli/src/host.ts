import {
  CounterProgram,
  Device,
  LastAction,
  type Message,
  type Model,
  actionByToken,
  actions,
  defaultShowContext,
  foldCounterMessages,
  invalidActionLog,
  productView,
  renderReceipt,
  renderShow,
  tokenOf,
  update,
} from 'counter-core-example'
import {
  Array,
  Console,
  Data,
  Effect,
  Match as M,
  Option,
  Schema as S,
} from 'effect'
import { Runtime } from 'foldkit'
import { renderScreen } from 'foldkit/renderers'
import { readFileSync } from 'node:fs'

import { commitSharedMessage } from '@foldkit/instant/sharing'

import { type CounterTape, withCounterTape } from './tape.js'

/** CLI failure for a bad token, Device, or tape. */
export class CounterCliError extends Data.TaggedError('CounterCliError')<{
  readonly message: string
}> {}

const tapeError = (): CounterCliError =>
  new CounterCliError({
    message: 'Cannot append the Instant tape.',
  })

const openTape = (
  options: CliTapeOptions,
): Effect.Effect<CounterTape, CounterCliError> =>
  withCounterTape(Option.fromNullishOr(options.tape)).pipe(
    Effect.mapError(
      error =>
        new CounterCliError({
          message: error.message,
        }),
    ),
  )

const modelFromTape = (
  tape: CounterTape,
): Effect.Effect<Model, CounterCliError> =>
  Effect.map(tape.readAcceptedMessages, foldCounterMessages).pipe(
    Effect.mapError(() => tapeError()),
  )

const parseDevice = (
  raw: string | undefined,
): Effect.Effect<Device | undefined, CounterCliError> => {
  if (raw === undefined) {
    return Effect.succeed(undefined)
  }
  const decoded = S.decodeUnknownOption(Device)(raw)
  if (Option.isNone(decoded)) {
    return Effect.fail(
      new CounterCliError({
        message: `Unknown device "${raw}". Use watch, phone, tablet, computer, or tv.`,
      }),
    )
  }
  return Effect.succeed(decoded.value)
}

const showContext = (device: Device | undefined) => ({
  ...defaultShowContext,
  ...(device === undefined ? {} : { device }),
})

/** One `show` or `do` execution against the imported Program. */
export type CliExecution = Readonly<{
  initialModel: Model
  maybeMessage: Option.Option<Message>
  finalModel: Model
  link: 'offline' | 'queued' | 'delivered'
  stdout: string
}>

/** Optional Instant tape for one CLI execution. */
export type CliTapeOptions = Readonly<{
  tape?: CounterTape
}>

/** Prints IDENTITY and ACESS. Optional `--device` wraps the product tree. */
export const executeShow = (
  deviceRaw: string | undefined,
  path: string | undefined,
  options: CliTapeOptions = {},
): Effect.Effect<CliExecution, CounterCliError> =>
  Effect.gen(function* () {
    const device = yield* parseDevice(deviceRaw)
    const tape = yield* openTape(options)
    const initialModel = yield* modelFromTape(tape)
    const stdout = renderShow(initialModel, {
      ...showContext(device),
      ...(path === undefined ? {} : { path }),
    })
    return {
      initialModel,
      maybeMessage: Option.none(),
      finalModel: initialModel,
      link: 'offline',
      stdout,
    }
  })

/** Sends one semantic token, then auto-shows. */
export const executeDo = (
  token: string,
  options: CliTapeOptions = {},
): Effect.Effect<CliExecution, CounterCliError> =>
  Effect.gen(function* () {
    const tape = yield* openTape(options)
    const initialModel = yield* modelFromTape(tape)
    const action = actionByToken(token.trim().toLowerCase())
    if (action === undefined) {
      return yield* Effect.fail(
        new CounterCliError({
          message: `Unknown action "${token}". Use increment, decrement, or reset.`,
        }),
      )
    }
    const isValid = action.valid(initialModel, {})
    if (!isValid) {
      const stdout = [
        invalidActionLog(token, initialModel),
        '',
        renderShow(initialModel, showContext(undefined)),
      ].join('\n')
      return {
        initialModel,
        maybeMessage: Option.none(),
        finalModel: initialModel,
        link: 'offline',
        stdout,
      }
    }

    const message = action()
    const commit = yield* commitSharedMessage(tape, message, () =>
      Effect.sync(() => {
        const [next] = update(initialModel, message)
        return next
      }),
    ).pipe(Effect.mapError(() => tapeError()))
    const last: LastAction = {
      command: action.command ?? token,
      event: action.event ?? token,
      sideEffects: ['tape append', `link  ${commit.accepted}`],
    }
    const receipt = renderReceipt({
      token: tokenOf(action),
      verb: 'sent',
      from: 'cli',
      via: 'argv',
      command: last.command,
      event: last.event,
      mutate: action.mutate ?? '',
      sideEffects: action.sideEffects ?? '(none)',
      tape: 'appended',
      link: commit.accepted,
    })
    const stdout = [
      receipt,
      '',
      renderShow(commit.result, {
        ...showContext(undefined),
        last,
      }),
    ].join('\n')
    return {
      initialModel,
      maybeMessage: Option.some(message),
      finalModel: commit.result,
      link: commit.accepted,
      stdout,
    }
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

const validLine = (model: Model): string =>
  Array.map(actions, action => {
    const token = tokenOf(action)
    const isValid = action.valid(model, {})
    return `  ${token.padEnd(12)}${isValid ? 'true' : 'false'}`
  }).join('\n')

const formatReplayFrame = (
  frame: number,
  model: Model,
  maybeMessage: Option.Option<Message>,
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
    validLine(model),
    'SCREEN',
    renderScreen(productView(model)),
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
      Runtime.replayToFrame(CounterProgram, tape, frame).pipe(
        Effect.map(model => {
          const maybeMessage =
            frame === 0
              ? Option.none()
              : Option.map(
                  Array.get(tape.transitions, frame - 1),
                  transition => transition.message,
                )
          return {
            model,
            block: formatReplayFrame(frame, model, maybeMessage),
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
    yield* Console.log(execution.stdout)
  })

/** Runs `do` and prints the receipt plus auto-show. */
export const runDo = (token: string): Effect.Effect<void, CounterCliError> =>
  Effect.gen(function* () {
    const execution = yield* executeDo(token)
    yield* Console.log(execution.stdout)
  })

/** Runs `replay` and prints each tape frame. */
export const runReplay = (
  tapePath: string,
): Effect.Effect<void, CounterCliError> =>
  Effect.gen(function* () {
    const execution = yield* executeReplay(tapePath)
    yield* Console.log(execution.stdout)
  })
