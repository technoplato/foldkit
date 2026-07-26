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
import { Console, Data, Effect, Layer, Match as M, Option } from 'effect'
import { Runtime } from 'foldkit'

/** A calculator CLI token could not be translated to a Message. */
export class CalculatorCliError extends Data.TaggedError('CalculatorCliError')<{
  readonly reason: string
}> {}

/** The imported Calculator state transition performed by CLI button input. */
export type CalculatorCliExecution = Readonly<{
  initialModel: Model
  messages: ReadonlyArray<Message>
  finalModel: Model
}>

const numericDigitMessageForToken = (token: string): Option.Option<Message> =>
  M.value(token).pipe(
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

const namedDigitMessageForToken = (token: string): Option.Option<Message> =>
  M.value(token).pipe(
    M.withReturnType<Option.Option<Message>>(),
    M.when('zero', () => Option.some(PressedDigit({ digit: 'Zero' }))),
    M.when('one', () => Option.some(PressedDigit({ digit: 'One' }))),
    M.when('two', () => Option.some(PressedDigit({ digit: 'Two' }))),
    M.when('three', () => Option.some(PressedDigit({ digit: 'Three' }))),
    M.when('four', () => Option.some(PressedDigit({ digit: 'Four' }))),
    M.when('five', () => Option.some(PressedDigit({ digit: 'Five' }))),
    M.when('six', () => Option.some(PressedDigit({ digit: 'Six' }))),
    M.when('seven', () => Option.some(PressedDigit({ digit: 'Seven' }))),
    M.when('eight', () => Option.some(PressedDigit({ digit: 'Eight' }))),
    M.when('nine', () => Option.some(PressedDigit({ digit: 'Nine' }))),
    M.orElse(() => Option.none()),
  )

const digitMessageForToken = (token: string): Option.Option<Message> => {
  const maybeNumericDigitMessage = numericDigitMessageForToken(token)
  if (Option.isSome(maybeNumericDigitMessage)) {
    return maybeNumericDigitMessage
  } else {
    return namedDigitMessageForToken(token)
  }
}

const operationMessageForToken = (token: string): Option.Option<Message> =>
  M.value(token).pipe(
    M.withReturnType<Option.Option<Message>>(),
    M.when('+', () => Option.some(PressedOperation({ operation: 'Add' }))),
    M.when('add', () => Option.some(PressedOperation({ operation: 'Add' }))),
    M.when('plus', () => Option.some(PressedOperation({ operation: 'Add' }))),
    M.when('-', () => Option.some(PressedOperation({ operation: 'Subtract' }))),
    M.when('subtract', () =>
      Option.some(PressedOperation({ operation: 'Subtract' })),
    ),
    M.when('minus', () =>
      Option.some(PressedOperation({ operation: 'Subtract' })),
    ),
    M.when('*', () => Option.some(PressedOperation({ operation: 'Multiply' }))),
    M.when('x', () => Option.some(PressedOperation({ operation: 'Multiply' }))),
    M.when('multiply', () =>
      Option.some(PressedOperation({ operation: 'Multiply' })),
    ),
    M.when('/', () => Option.some(PressedOperation({ operation: 'Divide' }))),
    M.when('divide', () =>
      Option.some(PressedOperation({ operation: 'Divide' })),
    ),
    M.orElse(() => Option.none()),
  )

const controlMessageForToken = (token: string): Option.Option<Message> =>
  M.value(token).pipe(
    M.withReturnType<Option.Option<Message>>(),
    M.when('=', () => Option.some(PressedEquals())),
    M.when('equals', () => Option.some(PressedEquals())),
    M.when('enter', () => Option.some(PressedEquals())),
    M.when('return', () => Option.some(PressedEquals())),
    M.when('clear', () => Option.some(PressedClear())),
    M.when('ac', () => Option.some(PressedClear())),
    M.when('c', () => Option.some(PressedClear())),
    M.when('backspace', () => Option.some(PressedBackspace())),
    M.when('delete', () => Option.some(PressedBackspace())),
    M.when('del', () => Option.some(PressedBackspace())),
    M.when('.', () => Option.some(PressedDecimalSeparator())),
    M.when('dot', () => Option.some(PressedDecimalSeparator())),
    M.when('decimal', () => Option.some(PressedDecimalSeparator())),
    M.when('%', () => Option.some(PressedPercent())),
    M.when('percent', () => Option.some(PressedPercent())),
    M.when('+/-', () => Option.some(PressedSign())),
    M.when('sign', () => Option.some(PressedSign())),
    M.when('negate', () => Option.some(PressedSign())),
    M.orElse(() => Option.none()),
  )

const nonDigitMessageForToken = (token: string): Option.Option<Message> => {
  const maybeOperationMessage = operationMessageForToken(token)
  if (Option.isSome(maybeOperationMessage)) {
    return maybeOperationMessage
  } else {
    return controlMessageForToken(token)
  }
}

const messageForToken = (
  token: string,
): Effect.Effect<Message, CalculatorCliError> => {
  const normalizedToken = token.trim().toLowerCase()
  const maybeDigitMessage = digitMessageForToken(normalizedToken)
  if (Option.isSome(maybeDigitMessage)) {
    return Effect.succeed(maybeDigitMessage.value)
  }

  const maybeControlMessage = nonDigitMessageForToken(normalizedToken)
  if (Option.isSome(maybeControlMessage)) {
    return Effect.succeed(maybeControlMessage.value)
  }

  return Effect.fail(
    new CalculatorCliError({
      reason: `Unknown calculator button "${token}"`,
    }),
  )
}

const runMessages = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  initialModel: Model,
  messages: ReadonlyArray<Message>,
): Effect.Effect<Model> =>
  Effect.gen(function* () {
    let nextModel = initialModel
    for (const message of messages) {
      nextModel = yield* runtime.run(message)
    }
    return nextModel
  })

/** Runs CLI button input through the renderer-free runtime without printing. */
export const executeCalculatorInput = (
  tokens: ReadonlyArray<string>,
): Effect.Effect<CalculatorCliExecution, CalculatorCliError> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: CalculatorProgram,
          resources: Layer.empty,
        }),
      )
      const initialModel = yield* runtime.initialization
      const messages = yield* Effect.forEach(tokens, messageForToken)
      const finalModel = yield* runMessages(runtime, initialModel, messages)
      yield* runtime.shutdown
      return { initialModel, messages, finalModel }
    }),
  )

const formatModel = (model: Model): string =>
  `Model(${model._tag}, expression: ${expressionForModel(model)}, display: ${displayForModel(model)})`

const formatMessage = (message: Message): string =>
  M.value(message).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      PressedBackspace: () => 'PressedBackspace()',
      PressedClear: () => 'PressedClear()',
      PressedDecimalSeparator: () => 'PressedDecimalSeparator()',
      PressedDigit: ({ digit }) => `PressedDigit(${digit})`,
      PressedEquals: () => 'PressedEquals()',
      PressedOperation: ({ operation }) => `PressedOperation(${operation})`,
      PressedPercent: () => 'PressedPercent()',
      PressedSign: () => 'PressedSign()',
    }),
  )

/** Prints the imported Calculator's initial display. */
export const runCalculatorShow = (
  isVerbose: boolean,
): Effect.Effect<void, CalculatorCliError> =>
  Effect.gen(function* () {
    const execution = yield* executeCalculatorInput([])

    if (isVerbose) {
      yield* Console.log(
        `Initial Model: ${formatModel(execution.initialModel)}`,
      )
      yield* Console.log(`Final Model: ${formatModel(execution.finalModel)}`)
    }

    yield* Console.log(displayForModel(execution.finalModel))
  })

/** Runs calculator button input and prints the resulting display. */
export const runCalculatorInput = (
  tokens: ReadonlyArray<string>,
  isVerbose: boolean,
): Effect.Effect<void, CalculatorCliError> =>
  Effect.gen(function* () {
    const execution = yield* executeCalculatorInput(tokens)

    if (isVerbose) {
      yield* Console.log(
        `Initial Model: ${formatModel(execution.initialModel)}`,
      )
      for (const message of execution.messages) {
        yield* Console.log(`Message: ${formatMessage(message)}`)
      }
      yield* Console.log(`Final Model: ${formatModel(execution.finalModel)}`)
    }

    yield* Console.log(displayForModel(execution.finalModel))
  })
