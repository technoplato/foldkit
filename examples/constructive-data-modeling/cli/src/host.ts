import {
  AdvancedPage,
  CommandLineControl,
  ConstructiveDataModelingProgram,
  type Message,
  type Model,
  RevealPage,
  SelectedRevealPage,
  terminalPresentation,
} from 'constructive-data-modeling-core-example'
import {
  Array,
  Console,
  Effect,
  Layer,
  Match as M,
  Option,
  Schema as S,
} from 'effect'
import { Runtime } from 'foldkit'

/** One-shot operations supported by the constructive modeling CLI. */
export const CliOperation = S.Literals([
  'Show',
  'Next',
  'PositiveSpace',
  'Obligations',
  'Recap',
  'Thanks',
])
/** A one-shot constructive modeling CLI operation. */
export type CliOperation = typeof CliOperation.Type

const messagesForOperation = (
  operation: CliOperation,
): ReadonlyArray<Message> => {
  const origin = CommandLineControl()
  return M.value(operation).pipe(
    M.withReturnType<ReadonlyArray<Message>>(),
    M.when('Show', () => []),
    M.when('Next', () => [AdvancedPage({ origin })]),
    M.when('PositiveSpace', () => [SelectedRevealPage({ origin, page: 52 })]),
    M.when('Obligations', () => [SelectedRevealPage({ origin, page: 101 })]),
    M.when('Recap', () => [SelectedRevealPage({ origin, page: 147 })]),
    M.when('Thanks', () => [SelectedRevealPage({ origin, page: 158 })]),
    M.exhaustive,
  )
}

/** Runs one deck operation through the renderer-free Program runtime. */
export const executeCliOperation = (
  operation: CliOperation,
): Effect.Effect<Model> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: ConstructiveDataModelingProgram,
          resources: Layer.empty,
        }),
      )
      const initialModel = yield* runtime.initialization
      const models = yield* Effect.forEach(
        messagesForOperation(operation),
        message => runtime.run(message),
      )
      const finalModel = Option.getOrElse(
        Array.last(models),
        () => initialModel,
      )
      yield* runtime.shutdown
      return finalModel
    }),
  )

/** Runs and prints one one-shot deck operation. */
export const runCliOperation = (
  operation: CliOperation,
  isVerbose: boolean,
): Effect.Effect<void> =>
  executeCliOperation(operation).pipe(
    Effect.flatMap(model =>
      Console.log(
        isVerbose
          ? `${terminalPresentation(model)}\nmodel ${JSON.stringify(model)}`
          : terminalPresentation(model),
      ),
    ),
  )

/** Runs and prints a direct authored-page jump through the shared Message. */
export const runCliPage = (page: number, isVerbose: boolean) =>
  S.decodeUnknownEffect(RevealPage)(page).pipe(
    Effect.flatMap(revealPage =>
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Effect.orDie(
            Runtime.makeProgramRuntime({
              program: ConstructiveDataModelingProgram,
              resources: Layer.empty,
            }),
          )
          yield* runtime.initialization
          const model = yield* runtime.run(
            SelectedRevealPage({
              origin: CommandLineControl(),
              page: revealPage,
            }),
          )
          yield* runtime.shutdown
          yield* Console.log(
            isVerbose
              ? `${terminalPresentation(model)}\nmodel ${JSON.stringify(model)}`
              : terminalPresentation(model),
          )
        }),
      ),
    ),
  )
