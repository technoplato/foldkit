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
  navigationToPath,
  resolveNavigationCarrier,
} from 'counters-core-example'
import {
  Array,
  Cause,
  Effect,
  Match as M,
  Option,
  PlatformError,
  Pull,
  Queue,
  Result,
  Terminal,
} from 'effect'
import { Runtime } from 'foldkit'
import * as InteractionGraph from 'foldkit/interaction-graph'

const clearScreen = '\u001b[2J\u001b[H'

type CountersAction = InteractionGraph.InteractionAction<Interaction>

const terminalNavigationOccurrenceId =
  InteractionGraph.InteractionOccurrenceId.make('terminal-navigation-1')

/** Every typed failure produced while resolving local terminal input. */
export type CountersTerminalResolutionError =
  | InteractionGraph.InteractionClaimError
  | InteractionGraph.InteractionGraphError
  | NavigationCarrierResolutionError

const terminalInvocationFacts = (
  occurrenceId: InteractionGraph.InteractionOccurrenceId,
) =>
  InteractionGraph.InteractionInvocationFacts.make({
    occurrenceId,
    actorId: 'local-terminal-actor',
    clientId: 'counters-terminal-client',
    originatingProcessorId: 'counters-terminal-processor',
    sessionId: 'local-terminal-session',
    subjectId: 'local-terminal-subject',
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

const formatDestination = (destination: Destination): ReadonlyArray<string> =>
  M.value(destination).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      CounterListDestination: ({ counters }) => [
        'Counters',
        ...Array.map(
          counters,
          counter => `${counter.id}  ${counter.counter.count.toString()}`,
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

/** Renders one Multiple Counters Model for the Effect Terminal client. */
export const renderCountersTerminal = (model: Model): string => {
  const projected = actionsForModel(model)
  const actionLines = Result.isFailure(projected)
    ? [`  Interaction graph unavailable: ${projected.failure._tag}`]
    : Array.map(
        projected.success,
        (action, index) =>
          `  [${(index + 1).toString()}] ${action.label}  ${action.descriptor.token}`,
      )
  return Array.join(
    [
      clearScreen,
      'Foldkit Multiple Counters | Effect Terminal',
      navigationToPath(model.navigation),
      '',
      ...formatDestination(destinationForModel(model)),
      '',
      'Available actions',
      ...actionLines,
      '',
      '[q] Quit',
    ],
    '\n',
  )
}

const actionForInput = (
  actions: ReadonlyArray<CountersAction>,
  input: string,
): Option.Option<CountersAction> => {
  const maybeIndex = Number.parseInt(input, 10)
  return Number.isNaN(maybeIndex)
    ? Option.none()
    : Array.get(actions, maybeIndex - 1)
}

/** Resolves and enqueues one numeric terminal selection through the Program graph. */
export const enqueueCountersTerminalSelection = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  input: string,
  occurrenceId: InteractionGraph.InteractionOccurrenceId,
): Effect.Effect<
  Option.Option<Message>,
  | InteractionGraph.InteractionClaimError
  | InteractionGraph.InteractionGraphError
> =>
  Effect.gen(function* () {
    const projected = actionsForModel(runtime.readModel())
    if (Result.isFailure(projected)) {
      return yield* Effect.fail(projected.failure)
    }
    const maybeAction = actionForInput(projected.success, input)
    if (Option.isNone(maybeAction)) {
      return Option.none()
    }
    const resolved = MultipleCountersInteractionGraph.resolveWithContext(
      runtime.readModel(),
      activatedInteraction(maybeAction.value.reference, occurrenceId),
      interactionIdentitySourceForOccurrence(occurrenceId),
    )
    if (Result.isFailure(resolved)) {
      return yield* Effect.fail(resolved.failure)
    }
    yield* runtime.run(resolved.success)
    return Option.some(resolved.success)
  })

const runInputLoop = (
  inputQueue: Queue.Dequeue<Terminal.UserInput, Cause.Done>,
  runtime: Runtime.ProgramRuntime<Model, Message>,
  terminal: Terminal.Terminal,
  nextOccurrenceNumber: number,
): Effect.Effect<
  void,
  | Cause.Done
  | InteractionGraph.InteractionClaimError
  | InteractionGraph.InteractionGraphError
  | PlatformError.PlatformError
> =>
  Queue.take(inputQueue).pipe(
    Effect.flatMap(input => {
      const keyName = input.key.name.toLowerCase()
      const key = Option.getOrElse(input.input, () => keyName).toLowerCase()
      const isControlQuit =
        input.key.ctrl && (keyName === 'c' || keyName === 'd')
      if (key === 'q' || isControlQuit) {
        return Effect.void
      }

      const occurrenceId = InteractionGraph.InteractionOccurrenceId.make(
        `terminal-action-${nextOccurrenceNumber.toString()}`,
      )
      return enqueueCountersTerminalSelection(runtime, key, occurrenceId).pipe(
        Effect.flatMap(maybeMessage => {
          if (Option.isNone(maybeMessage)) {
            return runInputLoop(
              inputQueue,
              runtime,
              terminal,
              nextOccurrenceNumber,
            )
          }
          return terminal
            .display(renderCountersTerminal(runtime.readModel()))
            .pipe(
              Effect.flatMap(() =>
                runInputLoop(
                  inputQueue,
                  runtime,
                  terminal,
                  nextOccurrenceNumber + 1,
                ),
              ),
            )
        }),
      )
    }),
  )

/** Resolves and enqueues one terminal navigation carrier through the live tape. */
export const openCountersTerminalCarrier = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  carrier: string,
): Effect.Effect<Message, NavigationCarrierResolutionError> =>
  Effect.gen(function* () {
    const resolvedCarrier = resolveNavigationCarrier(
      runtime.readModel(),
      carrier,
      terminalInvocationFacts(terminalNavigationOccurrenceId),
    )
    if (Result.isFailure(resolvedCarrier)) {
      return yield* Effect.fail(resolvedCarrier.failure)
    }
    yield* runtime.run(resolvedCarrier.success)
    return resolvedCarrier.success
  })

/** Runs the interactive Effect Terminal host over one portable URI. */
export const runCountersTerminal = (
  carrier: string,
): Effect.Effect<
  void,
  CountersTerminalResolutionError | PlatformError.PlatformError,
  Terminal.Terminal
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: MultipleCountersProgram,
          resources: StaticCounterFactClient,
        }),
      )

      yield* runtime.initialization
      yield* openCountersTerminalCarrier(runtime, carrier)
      yield* terminal.display(renderCountersTerminal(runtime.readModel()))
      const inputQueue = yield* terminal.readInput
      yield* runInputLoop(inputQueue, runtime, terminal, 1).pipe(
        Pull.catchDone(() => Effect.void),
      )
      yield* runtime.shutdown
    }),
  )
