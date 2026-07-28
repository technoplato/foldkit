import {
  AdvancedCardboardSequence,
  CardboardProgram,
  CompletedZeroGame,
  type Message,
  type Model,
  OpenedConversationLedger,
  PressedLowercaseG,
  PressedZeroButton,
  ReleasedZeroButton,
  ReturnedToCardboardSequence,
  SelectedIncorrectInputMethod,
  SelectedMirrorAnswer,
  SkippedZeroStep,
  initialCardboardRoute,
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
const dimTerminalText = '\u001b[2m'
const resetTerminalStyle = '\u001b[0m'

/** Renders the canonical Cardboard Model for a text terminal. */
export const renderCardboardScreen = (model: Model): string =>
  model.page._tag === 'SequencePage'
    ? `${amberPaper}${clearScreen}${amberAccent}╭───╮\n│ ${terminalPresentation(model)} │\n╰───╯${amberPaper}\n[Enter] Next\n[L] Log  [E] Extra  [Q] Quit\n${resetTerminalStyle}`
    : `${amberPaper}${clearScreen}${amberAccent}PROJECT CARDBOARD${amberPaper}\n${terminalPresentation(model)}\n\n${amberAccent}[e] /0/extra  [0] /0${amberPaper}\n[p] press  [r] release  [o] open  [space x3] skip\n[1] Genesis  [2] N64  [3] Game Boy  [4] Xbox  [5] keys\n[6] joystick  [7] eyes  [8] up  [9] down  [a] right  [m] mirror\n[g g] home  [G or ;] continue  [l] log  [q] quit\n${resetTerminalStyle}`

const renderProgramLog = (
  controller: Runtime.ReplayController<Model, Message>,
): string => {
  const snapshot = controller.read()
  const transitions = controller.readReplayTape().transitions
  const transitionLines = Array.map(transitions, (transition, index) => {
    const frame = index + 1
    const commands = Array.map(
      transition.commands,
      command => command.name,
    ).join(', ')
    const detail = `${transition.source._tag}${commands === '' ? '' : ` · ${commands}`}`
    const line = `${frame.toString().padStart(3, ' ')}  ${transition.message._tag}  ${detail}`
    return frame > snapshot.frame
      ? `${dimTerminalText}${line}${resetTerminalStyle}${amberPaper}`
      : line
  })
  const runtimeEventLines = Array.map(snapshot.runtimeEvents, event => {
    const line = `${event.afterFrame.toString().padStart(3, ' ')}  ${event.name}  Runtime event`
    return event.afterFrame > snapshot.frame
      ? `${dimTerminalText}${line}${resetTerminalStyle}${amberPaper}`
      : line
  })
  const logLines = [...transitionLines, ...runtimeEventLines].join('\n')
  return `${amberPaper}${clearScreen}${amberAccent}CURRENT PROGRAM STATE${amberPaper}\n${terminalPresentation(snapshot.model)}\nFrame ${snapshot.frame.toString()} of ${snapshot.finalFrame.toString()}\n\n${amberAccent}[U] Undo  [R] Redo  [D] Done${amberPaper}\n\n${amberAccent}ACTIONS AND EVENTS${amberPaper}\n  0  Initial Model  Program start\n${logLines}\n\n${amberAccent}[E] Extra  [Q] Quit${resetTerminalStyle}`
}

const renderControllerScreen = (
  controller: Runtime.ReplayController<Model, Message>,
): string =>
  controller.read().mode === 'Inspecting'
    ? renderProgramLog(controller)
    : renderCardboardScreen(controller.read().model)

/** Maps a terminal key to a Cardboard Message. */
export const messageForInput = (input: string): Option.Option<Message> => {
  if (
    input === ' ' ||
    input === 'enter' ||
    input === 'return' ||
    input === '\r' ||
    input === 'n'
  ) {
    return Option.some(AdvancedCardboardSequence())
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
    return Option.some(ReturnedToCardboardSequence())
  } else if (input === 'e') {
    return Option.some(OpenedConversationLedger())
  } else {
    return Option.none()
  }
}

const runInputLoop = (
  inputQueue: Queue.Dequeue<Terminal.UserInput, Cause.Done>,
  controller: Runtime.ReplayController<Model, Message>,
): Effect.Effect<void, Cause.Done> =>
  Queue.take(inputQueue).pipe(
    Effect.flatMap(input => {
      const inputText = Option.getOrElse(input.input, () =>
        input.key.name === 'space' ? ' ' : input.key.name,
      )
      return runInputCharacters(Array.fromIterable(inputText), controller).pipe(
        Effect.flatMap(isContinuing =>
          isContinuing ? runInputLoop(inputQueue, controller) : Effect.void,
        ),
      )
    }),
  )

const runInputCharacters = (
  characters: ReadonlyArray<string>,
  controller: Runtime.ReplayController<Model, Message>,
): Effect.Effect<boolean> =>
  Array.matchLeft(characters, {
    onEmpty: () => Effect.succeed(true),
    onNonEmpty: (key, remainingCharacters) => {
      if (key.toLowerCase() === 'q') {
        return Effect.succeed(false)
      }
      const snapshot = controller.read()
      if (snapshot.mode === 'Inspecting') {
        if (key.toLowerCase() === 'u' && snapshot.frame > 0) {
          return controller.stepBackward.pipe(
            Effect.orDie,
            Effect.flatMap(() =>
              runInputCharacters(remainingCharacters, controller),
            ),
          )
        } else if (
          key.toLowerCase() === 'r' &&
          snapshot.frame < snapshot.finalFrame
        ) {
          return controller.stepForward.pipe(
            Effect.orDie,
            Effect.flatMap(() =>
              runInputCharacters(remainingCharacters, controller),
            ),
          )
        } else if (
          key.toLowerCase() === 'd' ||
          key === '\r' ||
          key === 'enter' ||
          key === 'return'
        ) {
          return controller.resume.pipe(
            Effect.orDie,
            Effect.flatMap(() =>
              runInputCharacters(remainingCharacters, controller),
            ),
          )
        } else if (key.toLowerCase() === 'e') {
          return controller.run(OpenedConversationLedger()).pipe(
            Effect.orDie,
            Effect.flatMap(() =>
              runInputCharacters(remainingCharacters, controller),
            ),
          )
        } else {
          return runInputCharacters(remainingCharacters, controller)
        }
      }
      if (key.toLowerCase() === 'l') {
        return controller.inspect().pipe(
          Effect.orDie,
          Effect.flatMap(() =>
            runInputCharacters(remainingCharacters, controller),
          ),
        )
      }
      const maybeMessage = messageForInput(key)
      if (Option.isSome(maybeMessage)) {
        return controller.run(maybeMessage.value).pipe(
          Effect.orDie,
          Effect.flatMap(() =>
            runInputCharacters(remainingCharacters, controller),
          ),
        )
      } else {
        return runInputCharacters(remainingCharacters, controller)
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
      const controller = yield* Effect.orDie(
        Runtime.makeReplayController({
          program: CardboardProgram,
          resources: Layer.empty,
          route: initialCardboardRoute,
        }),
      )
      let currentScreen = renderControllerScreen(controller)
      yield* terminal.display(currentScreen)
      const stopObserving = controller.observe(() => {
        const nextScreen = renderControllerScreen(controller)
        if (nextScreen !== currentScreen) {
          currentScreen = nextScreen
          Effect.runFork(terminal.display(nextScreen))
        }
      })
      yield* Effect.addFinalizer(() => Effect.sync(stopObserving))
      yield* controller.initialization
      const inputQueue = yield* terminal.readInput
      yield* runInputLoop(inputQueue, controller)
      yield* controller.shutdown
    }),
  )
