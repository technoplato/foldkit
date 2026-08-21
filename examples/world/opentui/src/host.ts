import {
  Cause,
  Effect,
  Match as M,
  Option,
  PlatformError,
  Queue,
  Terminal,
} from 'effect'
import { Runtime } from 'foldkit'
import { SimulatedWalletResources } from 'wallet-simulated-client-example'
import {
  type Message,
  type Model,
  WorldProgram,
  asciiMap,
  messageFromKey,
  overlayOf,
} from 'world-core-example'

const clearScreen = '\u001b[2J\u001b[H'
const lime = '\u001b[38;2;196;255;82m'
const paper = '\u001b[38;2;243;240;232m'
const muted = '\u001b[38;2;141;145;136m'
const reset = '\u001b[0m'

const box = (title: string, body: string): string =>
  `${lime}+---- ${title} ----+\n${paper}| ${body}\n${lime}+------------------+${paper}`

/** Renders the ASCII town and exclusive overlay. */
export const renderWorldScreen = (model: Model): string => {
  const map = asciiMap(model)
  const overlay = overlayOf(model)
  const panel = M.value(overlay).pipe(
    M.tagsExhaustive({
      Hidden: () => '',
      SignOverlay: ({ speaker, overlay: text }) => `\n\n${box(speaker, text)}`,
      VendingOverlay: ({ keypadBuffer, vendPhase, listPriceDisplay }) =>
        `\n\n${box('MACHINE', `listed ${listPriceDisplay}  ${keypadBuffer === '' ? '____' : keypadBuffer}  ${vendPhase}`)}`,
    }),
  )
  return `${clearScreen}${lime}KNOPHY TOWN${paper}\n\n${map}${panel}\n\n${muted}arrows/wsd walk  q west  a talk  esc dismiss  x quit${reset}\n`
}

const keyNameToBrowser = (name: string): string => {
  if (name === 'up') {
    return 'ArrowUp'
  }
  if (name === 'down') {
    return 'ArrowDown'
  }
  if (name === 'left') {
    return 'ArrowLeft'
  }
  if (name === 'right') {
    return 'ArrowRight'
  }
  if (name === 'escape' || name === 'esc') {
    return 'Escape'
  }
  if (name === 'return' || name === 'enter') {
    return 'Enter'
  }
  if (name === 'backspace') {
    return 'Backspace'
  }
  if (name === 'space') {
    return ' '
  }
  return name
}

const runInputLoop = (
  inputQueue: Queue.Dequeue<Terminal.UserInput, Cause.Done>,
  runtime: Runtime.ProgramRuntime<Model, Message>,
): Effect.Effect<void, Cause.Done> =>
  Queue.take(inputQueue).pipe(
    Effect.flatMap(input => {
      const inputText = Option.getOrElse(input.input, () =>
        keyNameToBrowser(input.key.name),
      )
      if (inputText === 'x' || inputText === 'X') {
        return Effect.void
      }
      const maybeMessage = messageFromKey(
        keyNameToBrowser(inputText),
        runtime.readModel(),
      )
      if (Option.isSome(maybeMessage)) {
        return Effect.sync(() => runtime.send(maybeMessage.value)).pipe(
          Effect.flatMap(() => runInputLoop(inputQueue, runtime)),
        )
      }
      return runInputLoop(inputQueue, runtime)
    }),
  )

/** Runs the interactive World terminal host. */
export const runWorldTui = (): Effect.Effect<
  void,
  Cause.Done | PlatformError.PlatformError,
  Terminal.Terminal
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: WorldProgram,
          resources: SimulatedWalletResources,
        }),
      )
      let currentScreen = renderWorldScreen(runtime.readModel())
      yield* terminal.display(currentScreen)
      const stopObserving = runtime.observeModel(model => {
        const nextScreen = renderWorldScreen(model)
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
