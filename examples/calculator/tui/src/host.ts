import {
  CalculatorProgram,
  type Message,
  type Model,
  PressedBackspace,
  PressedClear,
  PressedDecimalSeparator,
  PressedDigit,
  PressedEquals,
  PressedOperation,
  PressedPercent,
  PressedSign,
  displayForModel,
  expressionForModel,
} from 'calculator-core-example'
import {
  Cause,
  Effect,
  Layer,
  Match as M,
  Option,
  PlatformError,
  Queue,
  Terminal,
} from 'effect'
import { Runtime } from 'foldkit'

const CLEAR_SCREEN = '\u001b[2J\u001b[H'
const SCREEN_INNER_WIDTH = 45

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

const statusForModel = (model: Model): string => expressionForModel(model)

/** Renders the imported Calculator Model as a terminal screen. */
export const renderCalculatorScreen = (model: Model): string => {
  const border = `+${'-'.repeat(SCREEN_INNER_WIDTH)}+`
  const lines = [
    border,
    framed('Calculator'),
    framed(statusForModel(model)),
    framed(''),
    centered(displayForModel(model)),
    framed(''),
    framed('[0-9] digits [+] [-] [*] [/] operators'),
    framed('[.] decimal  [%] percent  [+/-] sign'),
    framed('[=] equals   [AC/C] clear  [DEL] backspace'),
    framed('[Q] quit'),
    border,
  ]
  return `${CLEAR_SCREEN}${lines.join('\n')}\n`
}

const digitMessageForInput = (key: string): Option.Option<Message> =>
  M.value(key).pipe(
    M.withReturnType<Option.Option<Message>>(),
    M.when('0', () => Option.some(PressedDigit({ digit: 'Zero' }))),
    M.when('1', () => Option.some(PressedDigit({ digit: 'One' }))),
    M.when('2', () => Option.some(PressedDigit({ digit: 'Two' }))),
    M.when('3', () => Option.some(PressedDigit({ digit: 'Three' }))),
    M.when('4', () => Option.some(PressedDigit({ digit: 'Four' }))),
    M.when('5', () => Option.some(PressedDigit({ digit: 'Five' }))),
    M.when('6', () => Option.some(PressedDigit({ digit: 'Six' }))),
    M.when('7', () => Option.some(PressedDigit({ digit: 'Seven' }))),
    M.when('8', () => Option.some(PressedDigit({ digit: 'Eight' }))),
    M.when('9', () => Option.some(PressedDigit({ digit: 'Nine' }))),
    M.orElse(() => Option.none()),
  )

const controlMessageForInput = (key: string): Option.Option<Message> =>
  M.value(key).pipe(
    M.withReturnType<Option.Option<Message>>(),
    M.when('+', () => Option.some(PressedOperation({ operation: 'Add' }))),
    M.when('-', () => Option.some(PressedOperation({ operation: 'Subtract' }))),
    M.when('*', () => Option.some(PressedOperation({ operation: 'Multiply' }))),
    M.when('x', () => Option.some(PressedOperation({ operation: 'Multiply' }))),
    M.when('/', () => Option.some(PressedOperation({ operation: 'Divide' }))),
    M.when('=', () => Option.some(PressedEquals())),
    M.when('return', () => Option.some(PressedEquals())),
    M.when('enter', () => Option.some(PressedEquals())),
    M.when('c', () => Option.some(PressedClear())),
    M.when('ac', () => Option.some(PressedClear())),
    M.when('backspace', () => Option.some(PressedBackspace())),
    M.when('delete', () => Option.some(PressedBackspace())),
    M.when('del', () => Option.some(PressedBackspace())),
    M.when('.', () => Option.some(PressedDecimalSeparator())),
    M.when('%', () => Option.some(PressedPercent())),
    M.when('+/-', () => Option.some(PressedSign())),
    M.when('sign', () => Option.some(PressedSign())),
    M.orElse(() => Option.none()),
  )

/** Maps a terminal key to an imported Calculator Message when applicable. */
export const messageForInput = (input: string): Option.Option<Message> => {
  const key = input.toLowerCase()
  const maybeDigitMessage = digitMessageForInput(key)
  if (Option.isSome(maybeDigitMessage)) {
    return maybeDigitMessage
  } else {
    return controlMessageForInput(key)
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
          Effect.flatMap(model =>
            terminal.display(renderCalculatorScreen(model)),
          ),
          Effect.flatMap(() => runInputLoop(inputQueue, runtime, terminal)),
        )
      } else {
        return runInputLoop(inputQueue, runtime, terminal)
      }
    }),
  )

/** Runs the interactive terminal host over the imported Calculator Program. */
export const runCalculatorTui = (): Effect.Effect<
  void,
  Cause.Done | PlatformError.PlatformError,
  Terminal.Terminal
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: CalculatorProgram,
          resources: Layer.empty,
        }),
      )

      yield* runtime.initialization
      yield* terminal.display(renderCalculatorScreen(runtime.readModel()))

      const inputQueue = yield* terminal.readInput
      yield* runInputLoop(inputQueue, runtime, terminal)
      yield* runtime.shutdown
    }),
  )
