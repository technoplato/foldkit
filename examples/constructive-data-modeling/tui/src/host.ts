import {
  AdvancedSlide,
  ConstructiveDataModelingProgram,
  type Message,
  type Model,
  RewoundSlide,
  SelectedSlide,
  TerminalControl,
  terminalPresentation,
} from 'constructive-data-modeling-core-example'
import {
  Cause,
  Effect,
  Layer,
  Option,
  PlatformError,
  Queue,
  Terminal,
} from 'effect'
import { Runtime } from 'foldkit'

const clearScreen = '\u001b[2J\u001b[H'
const lime = '\u001b[38;2;196;255;82m'
const paper = '\u001b[38;2;243;240;232m'
const muted = '\u001b[38;2;141;145;136m'
const reset = '\u001b[0m'

/** Renders the canonical deck Model for a text terminal. */
export const renderDeckScreen = (model: Model): string =>
  `${clearScreen}${lime}CONSTRUCTIVE DATA MODELING${paper}\n\n${terminalPresentation(model)}\n\n${muted}[←/p] Previous  [→/n/space] Next  [h] Home  [e] End  [q] Quit${reset}\n`

/** Maps one terminal key to the shared deck Message vocabulary. */
export const messageForInput = (input: string): Option.Option<Message> => {
  const origin = TerminalControl()
  if (
    input === ' ' ||
    input === 'n' ||
    input === 'right' ||
    input === 'enter' ||
    input === 'return' ||
    input === '\r'
  ) {
    return Option.some(AdvancedSlide({ origin }))
  } else if (input === 'p' || input === 'left') {
    return Option.some(RewoundSlide({ origin }))
  } else if (input === 'h' || input === 'home') {
    return Option.some(SelectedSlide({ origin, slideId: 'opening' }))
  } else if (input === 'e' || input === 'end') {
    return Option.some(SelectedSlide({ origin, slideId: 'sources' }))
  } else {
    return Option.none()
  }
}

const runInputLoop = (
  inputQueue: Queue.Dequeue<Terminal.UserInput, Cause.Done>,
  runtime: Runtime.ProgramRuntime<Model, Message>,
): Effect.Effect<void, Cause.Done> =>
  Queue.take(inputQueue).pipe(
    Effect.flatMap(input => {
      const inputText = Option.getOrElse(input.input, () =>
        input.key.name === 'space' ? ' ' : input.key.name,
      )
      if (inputText.toLowerCase() === 'q') {
        return Effect.void
      }
      const maybeMessage = messageForInput(inputText)
      if (Option.isSome(maybeMessage)) {
        return Effect.sync(() => runtime.send(maybeMessage.value)).pipe(
          Effect.flatMap(() => runInputLoop(inputQueue, runtime)),
        )
      } else {
        return runInputLoop(inputQueue, runtime)
      }
    }),
  )

/** Runs the interactive constructive modeling terminal host. */
export const runDeckTui = (): Effect.Effect<
  void,
  Cause.Done | PlatformError.PlatformError,
  Terminal.Terminal
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: ConstructiveDataModelingProgram,
          resources: Layer.empty,
        }),
      )
      let currentScreen = renderDeckScreen(runtime.readModel())
      yield* terminal.display(currentScreen)
      const stopObserving = runtime.observeModel(model => {
        const nextScreen = renderDeckScreen(model)
        if (nextScreen !== currentScreen) {
          currentScreen = nextScreen
          Effect.runFork(terminal.display(nextScreen))
        }
      })
      yield* Effect.addFinalizer(() => Effect.sync(stopObserving))
      yield* runtime.initialization
      const inputQueue = yield* terminal.readInput
      yield* runInputLoop(inputQueue, runtime)
      yield* runtime.shutdown
    }),
  )
