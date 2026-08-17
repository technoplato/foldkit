import {
  Model as CounterModel,
  CounterProgram,
  Device,
  LastAction,
  type Message,
  type Model,
  SyncedCounter,
  actionByToken,
  counterScreen,
  counterValid,
  defaultShowContext,
  foldCounterMessages,
  invalidActionLog,
  renderReceipt,
  renderShow,
  tokenOf,
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
import { Processor, Program, Runtime } from 'foldkit'
import { renderScreen } from 'foldkit/renderers'
import { readFileSync } from 'node:fs'

import {
  FoldkitCounterV01,
  Instant,
  makeFileSnapshotLogTransport,
} from '@foldkit/instant'
import { commitSharedMessage } from '@foldkit/instant/sharing'

import {
  type CounterTape,
  type SnapshotLogTransport,
  withCounterTape,
} from './tape.js'

/** CLI failure for a bad token, Device, or tape. */
export class CounterCliError extends Data.TaggedError('CounterCliError')<{
  readonly message: string
}> {}

const tapeError = (): CounterCliError =>
  new CounterCliError({
    message: 'Cannot append the Instant tape.',
  })

const usesTape = (options: CliTapeOptions): boolean =>
  options.tape !== undefined

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

const resolveEngine = (options: CliTapeOptions): Runtime.SyncEngine => {
  if (options.snapshot !== undefined) {
    return Instant({
      app: FoldkitCounterV01,
      processor: Processor.Host.Cli(),
      transport: options.snapshot,
    })
  }
  if (process.env['COUNTER_TAPE'] === 'instant') {
    return Instant({
      app: FoldkitCounterV01,
      processor: Processor.Host.Cli(),
    })
  }
  const tapePath = process.env['COUNTER_TAPE_PATH']
  if (tapePath !== undefined && tapePath !== '') {
    return Instant({
      app: FoldkitCounterV01,
      processor: Processor.Host.Cli(),
      transport: makeFileSnapshotLogTransport(tapePath),
    })
  }
  return Runtime.Memory({ processor: Processor.Host.Cli() })
}

const readyCount = (
  model: Program.SyncedModel<Model, Message>,
): Effect.Effect<Model, CounterCliError> => {
  if (model._tag === 'Ready') {
    return Effect.succeed(CounterModel.make({ count: model.count }))
  }
  if (model._tag === 'Failed') {
    return Effect.fail(
      new CounterCliError({
        message: Program.describeSyncError(
          model.error,
          message => message._tag,
        ),
      }),
    )
  }
  return Effect.fail(
    new CounterCliError({
      message: 'CLI waited for Ready and Instant stayed Starting.',
    }),
  )
}

const withSynced = <A>(
  body: (
    started: Runtime.StartedProgram<
      Program.SyncedModel<Model, Message>,
      Program.SyncedMessage<Model, Message>
    >,
    initialModel: Model,
  ) => Effect.Effect<A, CounterCliError>,
  options: CliTapeOptions,
): Effect.Effect<A, CounterCliError> =>
  Effect.scoped(
    Effect.gen(function* () {
      const started = yield* Runtime.start({
        program: SyncedCounter,
        sync: resolveEngine(options),
      }).pipe(
        Effect.mapError(
          error =>
            new CounterCliError({
              message: error.message,
            }),
        ),
      )
      const settled = yield* Runtime.untilSettled(started)
      const initialModel = yield* readyCount(settled)
      return yield* body(started, initialModel)
    }),
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

/** Optional Instant tape or count snapshot for one CLI execution. */
export type CliTapeOptions = Readonly<{
  snapshot?: SnapshotLogTransport
  tape?: CounterTape
}>

const showExecution = (
  initialModel: Model,
  device: Device | undefined,
  path: string | undefined,
): CliExecution => ({
  initialModel,
  maybeMessage: Option.none(),
  finalModel: initialModel,
  link: 'offline',
  stdout: renderShow(initialModel, {
    ...showContext(device),
    ...(path === undefined ? {} : { path }),
  }),
})

const doExecution = (
  initialModel: Model,
  action: NonNullable<ReturnType<typeof actionByToken>>,
  token: string,
  nextModel: Model,
  link: CliExecution['link'],
): CliExecution => {
  const last: LastAction = {
    command: action.command ?? token,
    event: action.event ?? token,
    sideEffects: ['tape append', `link  ${link}`],
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
    link,
  })
  return {
    initialModel,
    maybeMessage: Option.some(action()),
    finalModel: nextModel,
    link,
    stdout: [
      receipt,
      '',
      renderShow(nextModel, {
        ...showContext(undefined),
        last,
      }),
    ].join('\n'),
  }
}

const invalidDoExecution = (
  token: string,
  initialModel: Model,
): CliExecution => ({
  initialModel,
  maybeMessage: Option.none(),
  finalModel: initialModel,
  link: 'offline',
  stdout: [
    invalidActionLog(token, initialModel),
    '',
    renderShow(initialModel, showContext(undefined)),
  ].join('\n'),
})

/** Prints IDENTITY and ACESS. Optional `--device` wraps the product tree. */
export const executeShow = (
  deviceRaw: string | undefined,
  path: string | undefined,
  options: CliTapeOptions = {},
): Effect.Effect<CliExecution, CounterCliError> =>
  Effect.gen(function* () {
    const device = yield* parseDevice(deviceRaw)
    if (usesTape(options)) {
      const tape = yield* openTape(options)
      const initialModel = yield* modelFromTape(tape)
      return showExecution(initialModel, device, path)
    }
    return yield* withSynced(
      (_started, initialModel) =>
        Effect.succeed(showExecution(initialModel, device, path)),
      options,
    )
  })

/** Sends one semantic token, then auto-shows. */
export const executeDo = (
  token: string,
  options: CliTapeOptions = {},
): Effect.Effect<CliExecution, CounterCliError> =>
  Effect.gen(function* () {
    const action = actionByToken(token.trim().toLowerCase())
    if (action === undefined) {
      return yield* Effect.fail(
        new CounterCliError({
          message: `Unknown action "${token}". Use increment, decrement, or reset.`,
        }),
      )
    }
    if (usesTape(options)) {
      const tape = yield* openTape(options)
      const initialModel = yield* modelFromTape(tape)
      const isValid = Array.some(
        counterValid(initialModel, {}),
        item => item.token === tokenOf(action) && item.valid,
      )
      if (!isValid) {
        return invalidDoExecution(token, initialModel)
      }
      const message = action()
      const [nextModel] = CounterProgram.update(initialModel, message)
      const commit = yield* commitSharedMessage(tape, message, () =>
        Effect.succeed(nextModel),
      ).pipe(
        Effect.map(shared => ({
          link: shared.accepted,
          model: shared.result,
        })),
        Effect.mapError(() => tapeError()),
      )
      return doExecution(initialModel, action, token, commit.model, commit.link)
    }
    return yield* withSynced(
      (started, initialModel) =>
        Effect.gen(function* () {
          const isValid = Array.some(
            counterValid(initialModel, {}),
            item => item.token === tokenOf(action) && item.valid,
          )
          if (!isValid) {
            return invalidDoExecution(token, initialModel)
          }
          const message = action()
          yield* started.run(message)
          const nextModel = yield* readyCount(started.readModel())
          const write = started.lastWrite()
          const link = Option.match(write, {
            onNone: () => 'offline' as const,
            onSome: result => result.link,
          })
          return doExecution(initialModel, action, token, nextModel, link)
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
