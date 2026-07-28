import {
  AdvancedZeroButtonHold,
  AdvancedZeroOpening,
  CardboardProgram,
  CompletedZeroGame,
  CompletedZeroOpening,
  type Message,
  type Model,
  PressedZeroButton,
  ReleasedZeroButton,
  ReturnedToZeroStart,
  SelectedIncorrectInputMethod,
  SelectedMirrorAnswer,
  SkippedZeroStep,
  terminalPresentation,
} from 'cardboard-core-example'
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

/** One-shot operations supported by the Cardboard CLI. */
export const CliOperation = S.Literals([
  'Show',
  'Tap',
  'Hold',
  'Skip',
  'Finish',
  'TryController',
  'Mirror',
  'Reset',
])
/** A one-shot Cardboard CLI operation. */
export type CliOperation = typeof CliOperation.Type

const messagesForOperation = (
  operation: CliOperation,
): ReadonlyArray<Message> =>
  M.value(operation).pipe(
    M.withReturnType<ReadonlyArray<Message>>(),
    M.when('Show', () => []),
    M.when('Tap', () => [PressedZeroButton(), ReleasedZeroButton()]),
    M.when('Hold', () => [
      PressedZeroButton(),
      AdvancedZeroButtonHold({ elapsedMilliseconds: 1_800 }),
      AdvancedZeroOpening({ progressPermille: 1_000 }),
      CompletedZeroOpening(),
    ]),
    M.when('Skip', () => [SkippedZeroStep()]),
    M.when('Finish', () => [CompletedZeroGame()]),
    M.when('TryController', () => [
      CompletedZeroGame(),
      SelectedIncorrectInputMethod({
        inputMethod: 'SegaGenesisController',
      }),
    ]),
    M.when('Mirror', () => [CompletedZeroGame(), SelectedMirrorAnswer()]),
    M.when('Reset', () => [ReturnedToZeroStart()]),
    M.exhaustive,
  )

/** Runs one Cardboard operation through the renderer-free Program runtime. */
export const executeCliOperation = (
  operation: CliOperation,
): Effect.Effect<Model> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: CardboardProgram,
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

/** Runs and prints one one-shot Cardboard operation. */
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
