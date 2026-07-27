import {
  type CounterDetailMode,
  type CounterFactStatus,
  CounterList,
  type Destination,
  type Interaction,
  type Message,
  type Model,
  MultipleCountersProgram,
  type Navigation,
  StaticCounterFactClient,
  destinationForModel,
  interactionsForModel,
  messageForInteractionToken,
  modelForNavigation,
} from 'counters-core-example'
import { Array, Console, Data, Effect, Match as M, Option } from 'effect'
import { Runtime } from 'foldkit'

/** A CLI token is not valid in the current state and mode. */
export class CountersCliError extends Data.TaggedError('CountersCliError')<{
  readonly message: string
}> {}

/** The result of running a state-dependent CLI action sequence. */
export type CountersCliExecution = Readonly<{
  initialModel: Model
  messages: ReadonlyArray<Message>
  finalModel: Model
}>

const runTokens = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  initialModel: Model,
  tokens: ReadonlyArray<string>,
): Effect.Effect<
  Readonly<{ messages: ReadonlyArray<Message>; finalModel: Model }>,
  CountersCliError
> =>
  Effect.gen(function* () {
    let nextModel = initialModel
    let messages: ReadonlyArray<Message> = []

    for (const token of tokens) {
      const maybeMessage = messageForInteractionToken(nextModel, token)
      if (Option.isNone(maybeMessage)) {
        const validTokens = Array.join(
          Array.map(
            interactionsForModel(nextModel),
            interaction => interaction.token,
          ),
          ', ',
        )
        return yield* Effect.fail(
          new CountersCliError({
            message: `Action "${token}" is not valid here. Valid actions: ${validTokens}`,
          }),
        )
      }
      messages = Array.append(messages, maybeMessage.value)
      nextModel = yield* runtime.run(maybeMessage.value)
    }

    return { messages, finalModel: nextModel }
  })

/** Runs CLI actions through the renderer-free runtime without printing. */
export const executeCounters = (
  tokens: ReadonlyArray<string>,
  maybeInitialNavigation = Option.none<Navigation>(),
): Effect.Effect<CountersCliExecution, CountersCliError> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: MultipleCountersProgram,
          resources: StaticCounterFactClient,
          start: Runtime.fromModel(
            modelForNavigation(
              Option.getOrElse(maybeInitialNavigation, () =>
                CounterList.make({}),
              ),
            ),
          ),
        }),
      )
      const initialModel = yield* runtime.initialization
      const execution = yield* runTokens(runtime, initialModel, tokens)
      yield* runtime.shutdown
      return { initialModel, ...execution }
    }),
  )

const formatFactStatus = (status: CounterFactStatus): ReadonlyArray<string> =>
  M.value(status).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      LoadingCounterFact: () => ['Loading counter fact…'],
      LoadedCounterFact: ({ fact }) => [
        `Counter fact for ${fact.number.toString()}`,
        fact.text,
      ],
      FailedCounterFact: ({ reason }) => ['Counter fact unavailable', reason],
    }),
  )

const formatDetailMode = (
  counterId: string,
  mode: CounterDetailMode,
): ReadonlyArray<string> =>
  M.value(mode).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      CounterFactAlert: ({ status }) => formatFactStatus(status),
      DeleteCounterConfirmation: () => [
        `Delete ${counterId}?`,
        'This cannot be undone.',
      ],
    }),
  )

/** Formats a host-neutral destination as the CLI's final screen. */
export const formatDestination = (
  destination: Destination,
): ReadonlyArray<string> =>
  M.value(destination).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      CounterListDestination: ({ counters }) => [
        'Counters',
        ...Array.map(
          counters,
          counter => `${counter.id}: ${counter.counter.count.toString()}`,
        ),
      ],
      CounterDetailDestination: ({ counter, maybeMode }) => {
        if (Option.isSome(maybeMode)) {
          return formatDetailMode(counter.id, maybeMode.value)
        } else {
          return [counter.id, `Count: ${counter.counter.count.toString()}`]
        }
      },
    }),
  )

const formatInteractions = (
  interactions: ReadonlyArray<Interaction>,
): ReadonlyArray<string> => [
  'Available commands:',
  ...Array.map(
    interactions,
    interaction => `  ${interaction.token}  ${interaction.label}`,
  ),
]

/** Prints the final Program screen and optionally its valid command set. */
export const runCounters = (
  tokens: ReadonlyArray<string>,
  isVerbose: boolean,
  maybeInitialNavigation = Option.none<Navigation>(),
): Effect.Effect<void, CountersCliError> =>
  Effect.gen(function* () {
    const execution = yield* executeCounters(tokens, maybeInitialNavigation)
    const screenLines = formatDestination(
      destinationForModel(execution.finalModel),
    )
    yield* Console.log(Array.join(screenLines, '\n'))

    if (isVerbose) {
      const commandLines = formatInteractions(
        interactionsForModel(execution.finalModel),
      )
      yield* Console.log(Array.join(commandLines, '\n'))
    }
  })
