import {
  type CounterDetailMode,
  type CounterFactStatus,
  type Destination,
  type Interaction,
  type Message,
  type Model,
  MultipleCountersInteractionGraph,
  MultipleCountersProgram,
  type NavigationCarrierResolutionError,
  StaticCounterFactClient,
  activatedInteraction,
  destinationForModel,
  interactionIdentitySourceForOccurrence,
  resolveNavigationCarrier,
} from 'counters-core-example'
import {
  Array,
  Console,
  Data,
  Effect,
  Match as M,
  Option,
  Result,
} from 'effect'
import { Runtime } from 'foldkit'
import * as InteractionGraph from 'foldkit/interaction-graph'

/** A CLI token is not valid in the current state and mode. */
export class CountersCliError extends Data.TaggedError('CountersCliError')<{
  readonly message: string
}> {}

/** The result of running a state-dependent CLI action sequence. */
export type CountersCliExecution = Readonly<{
  initialModel: Model
  messages: ReadonlyArray<Message>
  finalModel: Model
  journal: Runtime.ProgramJournalSnapshot<Model, Message>
  replayTape: Runtime.ReplayTape<Model, Message>
}>

type CountersAction = InteractionGraph.InteractionAction<Interaction>

const defaultCliNavigationCarrier = '/counters'

const cliNavigationOccurrenceId =
  InteractionGraph.InteractionOccurrenceId.make('cli-navigation-1')

/** Every typed failure produced while resolving local CLI input. */
export type CountersCliResolutionError =
  | CountersCliError
  | InteractionGraph.InteractionClaimError
  | InteractionGraph.InteractionGraphError
  | NavigationCarrierResolutionError

const cliInvocationFacts = (
  occurrenceId: InteractionGraph.InteractionOccurrenceId,
) =>
  InteractionGraph.InteractionInvocationFacts.make({
    occurrenceId,
    actorId: 'local-cli-actor',
    clientId: 'counters-cli-client',
    originatingProcessorId: 'counters-cli-processor',
    sessionId: 'local-cli-session',
    subjectId: 'local-cli-subject',
  })

const actionsForModel = (
  model: Model,
): Result.Result<
  ReadonlyArray<CountersAction>,
  InteractionGraph.InteractionGraphError
> =>
  Result.map(MultipleCountersInteractionGraph.project(model), projection =>
    Array.filter(
      InteractionGraph.interactiveNodes(projection.root),
      (node): node is CountersAction => node._tag === 'InteractionAction',
    ),
  )

const actionTokens = (actions: ReadonlyArray<CountersAction>) =>
  Array.map(actions, action => action.descriptor.token)

const resolveActionToken = (
  model: Model,
  token: string,
  occurrenceId: InteractionGraph.InteractionOccurrenceId,
): Result.Result<
  Message,
  | CountersCliError
  | InteractionGraph.InteractionClaimError
  | InteractionGraph.InteractionGraphError
> => {
  const projected = actionsForModel(model)
  if (Result.isFailure(projected)) {
    return Result.fail(projected.failure)
  }
  const maybeAction = Array.findFirst(
    projected.success,
    action => action.descriptor.token === token,
  )
  if (Option.isNone(maybeAction)) {
    return Result.fail(
      new CountersCliError({
        message: `Action "${token}" is not valid here. Valid actions: ${Array.join(
          actionTokens(projected.success),
          ', ',
        )}`,
      }),
    )
  }
  return MultipleCountersInteractionGraph.resolveWithContext(
    model,
    activatedInteraction(maybeAction.value.reference, occurrenceId),
    interactionIdentitySourceForOccurrence(occurrenceId),
  )
}

const openNavigationCarrier = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  initialModel: Model,
  maybeCarrier: Option.Option<string>,
): Effect.Effect<ReadonlyArray<Message>, NavigationCarrierResolutionError> =>
  Effect.gen(function* () {
    const carrier = Option.getOrElse(
      maybeCarrier,
      () => defaultCliNavigationCarrier,
    )
    const resolved = resolveNavigationCarrier(
      initialModel,
      carrier,
      cliInvocationFacts(cliNavigationOccurrenceId),
    )
    if (Result.isFailure(resolved)) {
      return yield* Effect.fail(resolved.failure)
    }
    yield* runtime.run(resolved.success)
    return [resolved.success]
  })

const runTokens = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  tokens: ReadonlyArray<string>,
): Effect.Effect<
  Readonly<{ messages: ReadonlyArray<Message>; finalModel: Model }>,
  | CountersCliError
  | InteractionGraph.InteractionClaimError
  | InteractionGraph.InteractionGraphError
> =>
  Effect.gen(function* () {
    const messages = yield* Effect.forEach(tokens, (token, index) => {
      const resolved = resolveActionToken(
        runtime.readModel(),
        token,
        InteractionGraph.InteractionOccurrenceId.make(
          `cli-action-${(index + 1).toString()}`,
        ),
      )
      if (Result.isFailure(resolved)) {
        return Effect.fail(resolved.failure)
      }
      return runtime.run(resolved.success).pipe(Effect.as(resolved.success))
    })
    return { messages, finalModel: runtime.readModel() }
  })

/** Runs CLI actions through the renderer-free runtime without printing. */
export const executeCounters = (
  tokens: ReadonlyArray<string>,
  maybeCarrier = Option.none<string>(),
): Effect.Effect<CountersCliExecution, CountersCliResolutionError> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: MultipleCountersProgram,
          resources: StaticCounterFactClient,
        }),
      )
      const initialModel = yield* runtime.initialization
      const navigationMessages = yield* openNavigationCarrier(
        runtime,
        initialModel,
        maybeCarrier,
      )
      const execution = yield* runTokens(runtime, tokens)
      const journal = runtime.journal.read()
      const replayTape = runtime.replay.readTape()
      yield* runtime.shutdown
      return {
        initialModel,
        messages: [...navigationMessages, ...execution.messages],
        finalModel: execution.finalModel,
        journal,
        replayTape,
      }
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
  actions: ReadonlyArray<CountersAction>,
): ReadonlyArray<string> => [
  'Available commands:',
  ...Array.map(
    actions,
    action => `  ${action.descriptor.token}  ${action.label}`,
  ),
]

/** Prints the final Program screen and optionally its valid command set. */
export const runCounters = (
  tokens: ReadonlyArray<string>,
  isVerbose: boolean,
  maybeCarrier = Option.none<string>(),
): Effect.Effect<void, CountersCliResolutionError> =>
  Effect.gen(function* () {
    const execution = yield* executeCounters(tokens, maybeCarrier)
    const screenLines = formatDestination(
      destinationForModel(execution.finalModel),
    )
    yield* Console.log(Array.join(screenLines, '\n'))

    if (isVerbose) {
      const actions = actionsForModel(execution.finalModel)
      if (Result.isFailure(actions)) {
        return yield* Effect.fail(actions.failure)
      }
      const commandLines = formatInteractions(actions.success)
      yield* Console.log(Array.join(commandLines, '\n'))
    }
  })
