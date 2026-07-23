import {
  ClickedDecrement,
  ClickedIncrement,
  ClickedReset,
  Message,
  Model,
  init,
  update,
} from 'counter-core-example'
import { Console, Effect, Layer, Match as M, Option, Schema as S } from 'effect'
import { Runtime } from 'foldkit'

/** Operations supported by the one-shot Counter client. */
export const CliOperation = S.Literals([
  'Show',
  'Increment',
  'Decrement',
  'Reset',
])
/** A one-shot Counter operation. */
export type CliOperation = typeof CliOperation.Type

/** The imported Counter state transition performed by a one-shot operation. */
export type CliOperationExecution = Readonly<{
  initialModel: Model
  maybeMessage: Option.Option<Message>
  finalModel: Model
}>

const messageForOperation = (operation: CliOperation): Option.Option<Message> =>
  M.value(operation).pipe(
    M.withReturnType<Option.Option<Message>>(),
    M.when('Show', () => Option.none()),
    M.when('Increment', () => Option.some(ClickedIncrement())),
    M.when('Decrement', () => Option.some(ClickedDecrement())),
    M.when('Reset', () => Option.some(ClickedReset())),
    M.exhaustive,
  )

const runMessage = (
  runtime: Runtime.HostRuntime<Model, Message>,
  initialModel: Model,
  maybeMessage: Option.Option<Message>,
): Effect.Effect<Model> => {
  if (Option.isSome(maybeMessage)) {
    return runtime.run(maybeMessage.value)
  } else {
    return Effect.succeed(initialModel)
  }
}

/** Runs one CLI operation through the renderer-free runtime without printing. */
export const executeCliOperation = (
  operation: CliOperation,
): Effect.Effect<CliOperationExecution> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Runtime.makeHostRuntime<Model, Message>({
        Model,
        init,
        update,
        resources: Layer.empty,
      })
      const initialModel = yield* runtime.initialization
      const maybeMessage = messageForOperation(operation)
      const finalModel = yield* runMessage(runtime, initialModel, maybeMessage)
      yield* runtime.shutdown
      return { initialModel, maybeMessage, finalModel }
    }),
  )

const formatModel = (model: Model): string => `Model({ count: ${model.count} })`

const formatMessage = (message: Message): string =>
  M.value(message).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      ClickedDecrement: () => 'ClickedDecrement()',
      ClickedIncrement: () => 'ClickedIncrement()',
      ClickedReset: () => 'ClickedReset()',
    }),
  )

/** Runs one CLI operation and prints its resulting integer. */
export const runCliOperation = (
  operation: CliOperation,
  isVerbose: boolean,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const execution = yield* executeCliOperation(operation)

    if (isVerbose) {
      yield* Console.log(
        `Initial Model: ${formatModel(execution.initialModel)}`,
      )
      if (Option.isSome(execution.maybeMessage)) {
        yield* Console.log(
          `Message: ${formatMessage(execution.maybeMessage.value)}`,
        )
      }
      yield* Console.log(`Final Model: ${formatModel(execution.finalModel)}`)
    }

    yield* Console.log(execution.finalModel.count)
  })
