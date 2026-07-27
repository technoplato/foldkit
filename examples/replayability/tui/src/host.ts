import {
  Array,
  Cause,
  Data,
  Effect,
  HashSet,
  Layer,
  Match as M,
  Option,
  PlatformError,
  Pull,
  Queue,
  Schema as S,
  Terminal,
} from 'effect'
import { factEndpoint, makeFactHttpClient } from 'fact-http-client-example'
import { Program, Runtime } from 'foldkit'
import {
  ReplayPresentation,
  type ReplayProgramId,
  Workbench,
  makeReplayabilityTapeStore,
  parseReplayDestination,
} from 'replayability-core-example'

import { NodeCrypto, NodeHttpClient } from '@effect/platform-node'

const clearScreen = '\u001b[2J\u001b[H'
const screenInnerWidth = 72
const screenContentWidth = screenInnerWidth - 1
const actionLegendIndent = '  '
const actionLegendSeparator = '  '
const globalReplayShortcuts = HashSet.fromIterable([
  'c',
  'h',
  'l',
  'p',
  'q',
  'w',
])
const actionShortcutPool = Array.fromIterable(
  "1234567890abcdefghijklmnopqrstuvwxyz!#$%&'*+-./:;<=>?@^_`|~",
)

/** A discoverable terminal binding for one currently valid Program action. */
export const ReplayActionBinding = S.Struct({
  actionId: S.String,
  label: S.String,
  shortcut: S.String,
})
/** A discoverable terminal binding for one currently valid Program action. */
export type ReplayActionBinding = typeof ReplayActionBinding.Type

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

const naturalShortcutForAction = (
  action: ReplayPresentation.ActionPresentation,
): Option.Option<string> => {
  const normalizedLabel = action.label.toLowerCase()
  if (
    normalizedLabel.length === 1 &&
    Array.contains(actionShortcutPool, normalizedLabel) &&
    !HashSet.has(globalReplayShortcuts, normalizedLabel)
  ) {
    return Option.some(normalizedLabel)
  } else {
    return Option.none()
  }
}

/** Derives deterministic terminal bindings from the active Program presentation. */
export const actionBindingsForModel = (
  model: Workbench.ReadyModel,
): ReadonlyArray<ReplayActionBinding> => {
  const actions = ReplayPresentation.actionsForModel(model)
  const naturalShortcuts = HashSet.fromIterable(
    Array.getSomes(Array.map(actions, naturalShortcutForAction)),
  )
  const fallbackShortcuts = Array.filter(
    actionShortcutPool,
    shortcut =>
      !HashSet.has(globalReplayShortcuts, shortcut) &&
      !HashSet.has(naturalShortcuts, shortcut),
  )
  const [, bindings] = Array.mapAccum(
    actions,
    HashSet.empty<string>(),
    (usedShortcuts, action) => {
      const maybeNaturalShortcut = Option.filter(
        naturalShortcutForAction(action),
        shortcut => !HashSet.has(usedShortcuts, shortcut),
      )
      const maybeFallbackShortcut = Array.findFirst(
        fallbackShortcuts,
        shortcut => !HashSet.has(usedShortcuts, shortcut),
      )
      const shortcut = Option.getOrThrowWith(
        Option.orElse(maybeNaturalShortcut, () => maybeFallbackShortcut),
        () => new Error('The replay TUI exhausted its action shortcut pool'),
      )
      return [
        HashSet.add(usedShortcuts, shortcut),
        ReplayActionBinding.make({
          actionId: action.id,
          label: action.label,
          shortcut,
        }),
      ]
    },
  )
  return bindings
}

const actionLegendRowsForModel = (
  model: Workbench.ReadyModel,
): ReadonlyArray<string> => {
  const actionTokens = Array.map(
    actionBindingsForModel(model),
    binding => `[${binding.shortcut}] ${binding.label}`,
  )
  const rowWidth = screenContentWidth - actionLegendIndent.length
  return Array.reduce(actionTokens, Array.empty<string>(), (rows, token) => {
    const maybeLastRow = Array.last(rows)
    if (Option.isNone(maybeLastRow)) {
      return [token]
    }
    const nextLastRow = `${maybeLastRow.value}${actionLegendSeparator}${token}`
    if (nextLastRow.length <= rowWidth) {
      return [...Array.dropRight(rows, 1), nextLastRow]
    } else {
      return [...rows, token]
    }
  })
}

const renderReadyReplayScreen = (
  model: Workbench.ReadyModel,
  maybeInputNotice: Option.Option<string>,
): string => {
  const border = `+${'-'.repeat(screenInnerWidth)}+`
  const inputNoticeLines = Option.match(maybeInputNotice, {
    onNone: () => Array.empty<string>(),
    onSome: inputNotice => [framed(''), framed(inputNotice)],
  })
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
    framed('Actions:'),
    ...Array.map(actionLegendRowsForModel(model), row =>
      framed(`${actionLegendIndent}${row}`),
    ),
    ...inputNoticeLines,
    framed(''),
    framed('[←/H] back  [P] play  [→/L] forward  [C] next Program  [W] save'),
    framed('[Q] quit'),
    border,
  ]
  const savedReplayLinks =
    model.replaySaveStatus._tag === 'SavedReplay'
      ? `\nSaved replay: ${model.replaySaveStatus.uri}\nAutoplay: ${model.replaySaveStatus.autoplayUri}`
      : ''
  return `${clearScreen}${lines.join('\n')}${savedReplayLinks}\n`
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

/** Renders the shared replay workbench Model and optional host-input feedback. */
export const renderReplayScreen = (
  model: Workbench.Model,
  maybeInputNotice = Option.none<string>(),
): string => {
  if (Workbench.isReady(model)) {
    return renderReadyReplayScreen(model, maybeInputNotice)
  } else {
    return renderReplayStatus(model)
  }
}

const renderUnboundInput = (model: Workbench.Model, input: string): string => {
  if (Workbench.isReady(model)) {
    return renderReadyReplayScreen(
      model,
      Option.some(
        `No action is bound to "${input}". Use a displayed shortcut.`,
      ),
    )
  } else {
    return renderReplayStatus(model)
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
  return Option.map(
    Array.findFirst(
      actionBindingsForModel(model),
      binding => binding.shortcut === key,
    ),
    binding => Workbench.PressedReplayAction({ actionId: binding.actionId }),
  )
}

const runInputLoop = (
  inputQueue: Queue.Dequeue<Terminal.UserInput, Cause.Done>,
  runtime: Runtime.ProgramRuntime<Workbench.Model, Workbench.Message>,
  terminal: Terminal.Terminal,
): Effect.Effect<void, Cause.Done | PlatformError.PlatformError> =>
  Queue.take(inputQueue).pipe(
    Effect.flatMap(input => {
      const keyName = input.key.name.toLowerCase()
      const key = Option.getOrElse(input.input, () => keyName).toLowerCase()
      const isControlQuit =
        input.key.ctrl && (keyName === 'c' || keyName === 'd')
      if (key === 'q' || isControlQuit) {
        return Effect.void
      }

      const maybeMessage = messageForReplayInput(runtime.readModel(), key)
      if (Option.isSome(maybeMessage)) {
        return runtime.run(maybeMessage.value).pipe(
          Effect.asVoid,
          Effect.flatMap(() => runInputLoop(inputQueue, runtime, terminal)),
        )
      } else {
        return terminal
          .display(renderUnboundInput(runtime.readModel(), key))
          .pipe(
            Effect.flatMap(() => runInputLoop(inputQueue, runtime, terminal)),
          )
      }
    }),
  )

/** Runs the interactive terminal host over a canonical Program URI. */
export const runReplayTui = (
  uri: string,
): Effect.Effect<
  void,
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
      let currentScreen = renderReplayScreen(runtime.readModel())
      yield* terminal.display(currentScreen)
      const stopObserving = runtime.observeModel(model => {
        const nextScreen = renderReplayScreen(model)
        if (nextScreen !== currentScreen) {
          currentScreen = nextScreen
          Effect.runFork(terminal.display(nextScreen))
        }
      })
      yield* Effect.addFinalizer(() => Effect.sync(stopObserving))

      yield* runtime.initialization

      const inputQueue = yield* terminal.readInput
      yield* runInputLoop(inputQueue, runtime, terminal).pipe(
        Pull.catchDone(() => Effect.void),
      )
      yield* runtime.shutdown
    }),
  )

/** Jumps directly to a frame for terminal-host tests and adapters. */
export const changedReplayFrame = (frame: number): Workbench.Message =>
  Workbench.ChangedReplayFrame({ frame })
