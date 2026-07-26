import {
  Cause,
  Data,
  Effect,
  Layer,
  Match as M,
  Option,
  PlatformError,
  Queue,
  Terminal,
} from 'effect'
import { factEndpoint, makeFactHttpClient } from 'fact-http-client-example'
import { Program, Runtime } from 'foldkit'
import {
  type ReplayProgramId,
  Workbench,
  makeReplayabilityTapeStore,
  parseReplayDestination,
} from 'replayability-core-example'

import { NodeCrypto, NodeHttpClient } from '@effect/platform-node'

const clearScreen = '\u001b[2J\u001b[H'
const screenInnerWidth = 72

/** A terminal carrier could not be reduced to its portable relative URI. */
export class ReplayCarrierError extends Data.TaggedError('ReplayCarrierError')<{
  readonly cause: unknown
  readonly uri: string
}> {}

const relativeRouteForCarrier = (
  uri: string,
): Effect.Effect<string, ReplayCarrierError> => {
  if (!uri.includes('://')) {
    return Effect.succeed(uri)
  }
  return Effect.try({
    try: () => {
      const url = new URL(uri)
      return `${url.pathname}${url.search}`
    },
    catch: cause => new ReplayCarrierError({ cause, uri }),
  })
}

const framed = (content: string): string => {
  const remainingWidth = Math.max(0, screenInnerWidth - content.length)
  return `| ${content}${' '.repeat(Math.max(0, remainingWidth - 1))}|`
}

const centered = (content: string): string => {
  const remainingWidth = Math.max(0, screenInnerWidth - content.length)
  const leftPadding = Math.floor(remainingWidth / 2)
  const rightPadding = remainingWidth - leftPadding
  return `|${' '.repeat(leftPadding)}${content}${' '.repeat(rightPadding)}|`
}

const renderReadyReplayScreen = (model: Workbench.ReadyModel): string => {
  const border = `+${'-'.repeat(screenInnerWidth)}+`
  const lines = [
    border,
    framed(
      `Replayability | ${Workbench.titleForModel(model)} | ${model.playback}`,
    ),
    framed(
      `Frame ${model.currentFrame.toString()} of ${model.finalFrame.toString()} | ${model.controllerMode}`,
    ),
    framed(''),
    centered(Workbench.displayForModel(model)),
    centered(Workbench.detailForModel(model)),
    framed(''),
    framed('[←/H] back  [P] play  [→/L] forward  [C] next example  [W] save'),
    framed(
      '[C] next Program  [+/-/R] Counter  [0-9,+,-,*,/,=,.,%,S] Calculator  [F] Fact',
    ),
    framed('[Q] quit'),
    border,
  ]
  const autoplayUri =
    model.replaySaveStatus._tag === 'SavedReplay'
      ? `\nAutoplay: ${model.replaySaveStatus.autoplayUri}`
      : ''
  return `${clearScreen}${lines.join('\n')}\nState: ${model.stateUri}\nReplay: ${model.replayUri}${autoplayUri}\n`
}

const renderReplayStatus = (model: Workbench.Model): string => {
  const border = `+${'-'.repeat(screenInnerWidth)}+`
  const lines = [
    border,
    framed(`Replayability | ${Workbench.titleForModel(model)}`),
    framed(''),
    centered(Workbench.displayForModel(model)),
    centered(Workbench.detailForModel(model)),
    framed(''),
    border,
  ]
  return `${clearScreen}${lines.join('\n')}\n`
}

/** Renders the shared replay workbench Model as a terminal screen. */
export const renderReplayScreen = (model: Workbench.Model): string => {
  if (Workbench.isReady(model)) {
    return renderReadyReplayScreen(model)
  } else {
    return renderReplayStatus(model)
  }
}

const counterActionForInput = (key: string): Option.Option<Workbench.Message> =>
  M.value(key).pipe(
    M.withReturnType<Option.Option<Workbench.Message>>(),
    M.when('+', () =>
      Option.some(Workbench.PressedReplayAction({ actionId: 'increment' })),
    ),
    M.when('=', () =>
      Option.some(Workbench.PressedReplayAction({ actionId: 'increment' })),
    ),
    M.when('-', () =>
      Option.some(Workbench.PressedReplayAction({ actionId: 'decrement' })),
    ),
    M.when('r', () =>
      Option.some(Workbench.PressedReplayAction({ actionId: 'reset' })),
    ),
    M.orElse(() => Option.none()),
  )

const calculatorDigitActionIdForInput = (key: string): Option.Option<string> =>
  M.value(key).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.when('0', () => Option.some('digit-zero')),
    M.when('1', () => Option.some('digit-one')),
    M.when('2', () => Option.some('digit-two')),
    M.when('3', () => Option.some('digit-three')),
    M.when('4', () => Option.some('digit-four')),
    M.when('5', () => Option.some('digit-five')),
    M.when('6', () => Option.some('digit-six')),
    M.when('7', () => Option.some('digit-seven')),
    M.when('8', () => Option.some('digit-eight')),
    M.when('9', () => Option.some('digit-nine')),
    M.orElse(() => Option.none()),
  )

const calculatorControlActionIdForInput = (
  key: string,
): Option.Option<string> =>
  M.value(key).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.when('+', () => Option.some('operation-add')),
    M.when('-', () => Option.some('operation-subtract')),
    M.when('*', () => Option.some('operation-multiply')),
    M.when('x', () => Option.some('operation-multiply')),
    M.when('/', () => Option.some('operation-divide')),
    M.when('=', () => Option.some('equals')),
    M.when('return', () => Option.some('equals')),
    M.when('enter', () => Option.some('equals')),
    M.when('.', () => Option.some('decimal')),
    M.when('%', () => Option.some('percent')),
    M.when('s', () => Option.some('sign')),
    M.when('delete', () => Option.some('backspace')),
    M.when('backspace', () => Option.some('backspace')),
    M.when('a', () => Option.some('clear')),
    M.orElse(() => Option.none()),
  )

const calculatorActionIdForInput = (key: string): Option.Option<string> => {
  const maybeDigitActionId = calculatorDigitActionIdForInput(key)
  if (Option.isSome(maybeDigitActionId)) {
    return maybeDigitActionId
  } else {
    return calculatorControlActionIdForInput(key)
  }
}

const nextProgramForModel = (model: Workbench.ReadyModel): ReplayProgramId =>
  M.value(model._tag).pipe(
    M.withReturnType<ReplayProgramId>(),
    M.when('Counters', () => 'Counter'),
    M.when('Counter', () => 'Calculator'),
    M.when('Calculator', () => 'Fact'),
    M.when('Fact', () => 'Counters'),
    M.exhaustive,
  )

/** Maps a terminal key to a replay workbench Message when applicable. */
export const messageForReplayInput = (
  model: Workbench.Model,
  input: string,
): Option.Option<Workbench.Message> => {
  if (!Workbench.isReady(model)) {
    return Option.none()
  }
  const key = input.toLowerCase()
  const maybeTimelineMessage = M.value(key).pipe(
    M.withReturnType<Option.Option<Workbench.Message>>(),
    M.when('left', () => Option.some(Workbench.ClickedStepBackward())),
    M.when('h', () => Option.some(Workbench.ClickedStepBackward())),
    M.when('right', () => Option.some(Workbench.ClickedStepForward())),
    M.when('l', () => Option.some(Workbench.ClickedStepForward())),
    M.when('p', () => Option.some(Workbench.ClickedPlayback())),
    M.when('w', () => Option.some(Workbench.ClickedSaveReplay())),
    M.when('c', () =>
      Option.some(
        Workbench.SelectedReplayProgram({
          programId: nextProgramForModel(model),
        }),
      ),
    ),
    M.orElse(() => Option.none()),
  )
  if (Option.isSome(maybeTimelineMessage)) {
    return maybeTimelineMessage
  }

  if (model._tag === 'Counters') {
    return Option.none()
  } else if (model._tag === 'Counter') {
    return counterActionForInput(key)
  } else if (model._tag === 'Calculator') {
    return Option.map(calculatorActionIdForInput(key), actionId =>
      Workbench.PressedReplayAction({ actionId }),
    )
  } else if (key === 'f') {
    return Option.some(Workbench.PressedReplayAction({ actionId: 'load-fact' }))
  } else {
    return Option.none()
  }
}

const runInputLoop = (
  inputQueue: Queue.Dequeue<Terminal.UserInput, Cause.Done>,
  runtime: Runtime.ProgramRuntime<Workbench.Model, Workbench.Message>,
  terminal: Terminal.Terminal,
): Effect.Effect<void, Cause.Done | PlatformError.PlatformError> =>
  Queue.take(inputQueue).pipe(
    Effect.flatMap(input => {
      const key = Option.getOrElse(
        input.input,
        () => input.key.name,
      ).toLowerCase()
      if (key === 'q') {
        return Effect.void
      }

      const maybeMessage = messageForReplayInput(runtime.readModel(), key)
      if (Option.isSome(maybeMessage)) {
        return runtime.run(maybeMessage.value).pipe(
          Effect.flatMap(model => terminal.display(renderReplayScreen(model))),
          Effect.flatMap(() => runInputLoop(inputQueue, runtime, terminal)),
        )
      } else {
        return runInputLoop(inputQueue, runtime, terminal)
      }
    }),
  )

/** Runs the interactive terminal host over a canonical Program URI. */
export const runReplayTui = (
  uri: string,
): Effect.Effect<
  void,
  | Cause.Done
  | PlatformError.PlatformError
  | ReplayCarrierError
  | Program.ProgramRouteError
  | Runtime.ProgramRuntimeStartError,
  Terminal.Terminal
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      const relativeRoute = yield* relativeRouteForCarrier(uri)
      const destination = yield* parseReplayDestination(relativeRoute)
      const { program, resources } = Workbench.makeReplayWorkbench(
        destination,
        makeReplayabilityTapeStore(globalThis.fetch),
        NodeCrypto.layer,
        Layer.provide(
          makeFactHttpClient(factEndpoint),
          NodeHttpClient.layerUndici,
        ),
      )
      const runtime = yield* Runtime.makeProgramRuntime({
        program,
        resources,
      })
      const stopObserving = runtime.observeModel(model => {
        Effect.runFork(terminal.display(renderReplayScreen(model)))
      })
      yield* Effect.addFinalizer(() => Effect.sync(stopObserving))

      yield* terminal.display(renderReplayScreen(runtime.readModel()))
      yield* runtime.initialization
      yield* terminal.display(renderReplayScreen(runtime.readModel()))

      const inputQueue = yield* terminal.readInput
      yield* runInputLoop(inputQueue, runtime, terminal)
      yield* runtime.shutdown
    }),
  )

/** Jumps directly to a frame for terminal-host tests and adapters. */
export const changedReplayFrame = (frame: number): Workbench.Message =>
  Workbench.ChangedReplayFrame({ frame })
