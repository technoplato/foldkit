import {
  CardboardProgram,
  CompletedZeroGame,
  type Message,
  type Model,
  OpenedConversationLedger,
  PressedLowercaseG,
  PressedSpace,
  PressedZeroButton,
  ReleasedZeroButton,
  ReturnedToRuleZeroPage,
  SelectedIncorrectInputMethod,
  SelectedMirrorAnswer,
  SkippedZeroStep,
  terminalPresentation,
} from 'cardboard-core-example'
import {
  Array,
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
const amberPaper = '\u001b[38;2;255;229;174m\u001b[48;2;35;24;13m'
const amberAccent = '\u001b[38;2;244;173;72m'
const resetTerminalStyle = '\u001b[0m'

/** Renders the canonical Cardboard Model for a text terminal. */
export const renderCardboardScreen = (model: Model): string =>
  `${amberPaper}${clearScreen}${amberAccent}PROJECT CARDBOARD${amberPaper}\n${terminalPresentation(model)}\n\n${amberAccent}[l] /0/0 log  [0] /0${amberPaper}\n[p] press  [r] release  [o] open  [space x3] skip\n[1] Genesis  [2] N64  [3] Game Boy  [4] Xbox  [5] keys\n[6] joystick  [7] eyes  [8] up  [9] down  [a] right  [m] mirror\n[g g] home  [G or ;] continue  [q] quit\n${resetTerminalStyle}`

/** Maps a terminal key to a Cardboard Message. */
export const messageForInput = (input: string): Option.Option<Message> => {
  if (input === ' ') {
    return Option.some(PressedSpace())
  } else if (input === 'G' || input === ';') {
    return Option.some(CompletedZeroGame())
  } else if (input === 'g') {
    return Option.some(PressedLowercaseG())
  } else if (input === 'p') {
    return Option.some(PressedZeroButton())
  } else if (input === 'r') {
    return Option.some(ReleasedZeroButton())
  } else if (input === 'o') {
    return Option.some(SkippedZeroStep())
  } else if (input === 'm') {
    return Option.some(SelectedMirrorAnswer())
  } else if (input === '1') {
    return Option.some(
      SelectedIncorrectInputMethod({
        inputMethod: 'SegaGenesisController',
      }),
    )
  } else if (input === '2') {
    return Option.some(
      SelectedIncorrectInputMethod({
        inputMethod: 'Nintendo64Controller',
      }),
    )
  } else if (input === '3') {
    return Option.some(
      SelectedIncorrectInputMethod({ inputMethod: 'GameBoyColor' }),
    )
  } else if (input === '4') {
    return Option.some(
      SelectedIncorrectInputMethod({ inputMethod: 'Xbox360Controller' }),
    )
  } else if (input === '5') {
    return Option.some(
      SelectedIncorrectInputMethod({ inputMethod: 'MouseAndKeyboard' }),
    )
  } else if (input === '6') {
    return Option.some(
      SelectedIncorrectInputMethod({ inputMethod: 'Joystick' }),
    )
  } else if (input === '7') {
    return Option.some(SelectedIncorrectInputMethod({ inputMethod: 'Eyes' }))
  } else if (input === '8') {
    return Option.some(
      SelectedIncorrectInputMethod({ inputMethod: 'HeadLookingUp' }),
    )
  } else if (input === '9') {
    return Option.some(
      SelectedIncorrectInputMethod({ inputMethod: 'HeadLookingDown' }),
    )
  } else if (input === 'a') {
    return Option.some(
      SelectedIncorrectInputMethod({ inputMethod: 'HeadLookingRight' }),
    )
  } else if (input === '0') {
    return Option.some(ReturnedToRuleZeroPage())
  } else if (input === 'l') {
    return Option.some(OpenedConversationLedger())
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
      return runInputCharacters(Array.fromIterable(inputText), runtime).pipe(
        Effect.flatMap(isContinuing =>
          isContinuing ? runInputLoop(inputQueue, runtime) : Effect.void,
        ),
      )
    }),
  )

const runInputCharacters = (
  characters: ReadonlyArray<string>,
  runtime: Runtime.ProgramRuntime<Model, Message>,
): Effect.Effect<boolean> =>
  Array.matchLeft(characters, {
    onEmpty: () => Effect.succeed(true),
    onNonEmpty: (key, remainingCharacters) => {
      if (key.toLowerCase() === 'q') {
        return Effect.succeed(false)
      }
      const maybeMessage = messageForInput(key)
      if (Option.isSome(maybeMessage)) {
        return Effect.sync(() => runtime.send(maybeMessage.value)).pipe(
          Effect.flatMap(() =>
            runInputCharacters(remainingCharacters, runtime),
          ),
        )
      } else {
        return runInputCharacters(remainingCharacters, runtime)
      }
    },
  })

/** Runs the interactive Cardboard terminal host. */
export const runCardboardTui = (): Effect.Effect<
  void,
  Cause.Done | PlatformError.PlatformError,
  Terminal.Terminal
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: CardboardProgram,
          resources: Layer.empty,
        }),
      )
      let currentScreen = renderCardboardScreen(runtime.readModel())
      yield* terminal.display(currentScreen)
      const stopObserving = runtime.observeModel(model => {
        const nextScreen = renderCardboardScreen(model)
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
