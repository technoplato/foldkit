import {
  ClickedDecrement,
  ClickedIncrement,
  ClickedReset,
  CounterProgram,
  type Message,
  type Model,
} from 'counter-core-example'
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

const CLEAR_SCREEN = '\u001b[2J\u001b[H'
const SCREEN_INNER_WIDTH = 43

const framed = (content: string): string => {
  const remainingWidth = Math.max(0, SCREEN_INNER_WIDTH - content.length)
  return `| ${content}${' '.repeat(Math.max(0, remainingWidth - 1))}|`
}

const centered = (content: string): string => {
  const remainingWidth = Math.max(0, SCREEN_INNER_WIDTH - content.length)
  const leftPadding = Math.floor(remainingWidth / 2)
  const rightPadding = remainingWidth - leftPadding
  return `|${' '.repeat(leftPadding)}${content}${' '.repeat(rightPadding)}|`
}

/** Renders the imported Counter Model as a terminal screen. */
export const renderCounterScreen = (model: Model): string => {
  const border = `+${'-'.repeat(SCREEN_INNER_WIDTH)}+`
  const lines = [
    border,
    framed('Counter'),
    framed(''),
    centered(model.count.toString()),
    framed(''),
    framed('[-] decrement  [R] reset  [+] increment'),
    framed(''),
    framed('                               [Q] quit'),
    border,
  ]
  return `${CLEAR_SCREEN}${lines.join('\n')}\n`
}

/** Maps a terminal key to an imported Counter Message when applicable. */
export const messageForInput = (input: string): Option.Option<Message> => {
  const key = input.toLowerCase()
  if (key === '+' || key === '=') {
    return Option.some(ClickedIncrement())
  } else if (key === '-') {
    return Option.some(ClickedDecrement())
  } else if (key === 'r') {
    return Option.some(ClickedReset())
  } else {
    return Option.none()
  }
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

      const maybeMessage = messageForInput(key)
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
