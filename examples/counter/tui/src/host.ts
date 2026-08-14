import {
  CounterProgram,
  type Message,
  type Model,
  actions,
  renderChrome,
} from 'counter-core-example'
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

const CLEAR_SCREEN = '\u001b[2J\u001b[H'

/** Renders the imported Counter Model from core chrome. */
export const renderCounterScreen = (model: Model): string => {
  const chrome = renderChrome(model, 'computer')
  return `${CLEAR_SCREEN}${chrome}\n\n[Q] quit\n`
}

/** Maps a terminal key to an imported Counter Message when applicable. */
export const messageForInput = (
  input: string,
  model: Model,
): Option.Option<Message> => {
  const key = input.toLowerCase()
  const maybeAction = Array.findFirst(
    actions,
    action =>
      Array.contains(action.keys ?? [], key) ||
      Array.contains(action.keys ?? [], input),
  )
  if (Option.isNone(maybeAction)) {
    return Option.none()
  }
  if (!maybeAction.value.valid(model, {})) {
    return Option.none()
  }
  return Option.some(maybeAction.value())
}

const runInputLoop = (
  inputQueue: Queue.Dequeue<Terminal.UserInput, Cause.Done>,
  runtime: Runtime.ProgramRuntime<Model, Message>,
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

      const maybeMessage = messageForInput(key, runtime.readModel())
      if (Option.isSome(maybeMessage)) {
        return runtime.run(maybeMessage.value).pipe(
          Effect.flatMap(model => terminal.display(renderCounterScreen(model))),
          Effect.flatMap(() => runInputLoop(inputQueue, runtime, terminal)),
        )
      } else {
        return runInputLoop(inputQueue, runtime, terminal)
      }
    }),
  )

/** Runs the interactive terminal host over the imported Counter program. */
export const runCounterTui = (): Effect.Effect<
  void,
  Cause.Done | PlatformError.PlatformError,
  Terminal.Terminal
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: CounterProgram,
          resources: Layer.empty,
        }),
      )

      yield* runtime.initialization
      yield* terminal.display(renderCounterScreen(runtime.readModel()))

      const inputQueue = yield* terminal.readInput
      yield* runInputLoop(inputQueue, runtime, terminal)
      yield* runtime.shutdown
    }),
  )
