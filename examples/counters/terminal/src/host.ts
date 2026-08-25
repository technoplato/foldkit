import {
  type CounterDetailMode,
  type CounterFactStatus,
  type Destination,
  type Interaction,
  type Message,
  type Model,
  MultipleCountersInteractionGraph,
  type NavigationCarrierResolutionError,
  StaticCounterFactClient,
  activatedInteraction,
  destinationForModel,
  interactionIdentitySourceForOccurrence,
  navigationToPath,
  resolveNavigationCarrier,
} from 'counters-core-example'
import {
  type CountersTape,
  type CountersTapeCursor,
  commitCountersMessage,
  countersProcessorIds,
  instantCountersResources,
  observeRemoteCountersTape,
  openCountersTapeRuntime,
} from 'counters-instant-example'
import { resolveCountersTape } from 'counters-instant-example/node'
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

import type { ProgramStoreError } from '@foldkit/instant'

import { attributionSuffix } from './surfaceLabel.js'

const clearScreen = '\u001b[2J\u001b[H'

type CountersAction = InteractionGraph.InteractionAction<Interaction>

const terminalNavigationOccurrenceId =
  InteractionGraph.InteractionOccurrenceId.make('terminal-navigation-1')

/** Every typed failure produced while resolving local terminal input. */
export type CountersTerminalResolutionError =
  | InteractionGraph.InteractionClaimError
  | InteractionGraph.InteractionGraphError
  | NavigationCarrierResolutionError
  | ProgramStoreError

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
      FailedCounterFact: ({ cause }) => [
        'Counter fact unavailable',
        cause === 'Network'
          ? 'The network could not reach the fact source'
          : 'The fact source returned an unreadable body',
      ],
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
          counter => `${counter.id}  ${counter.child.count.toString()}`,
        ),
      ],
      CounterDetailDestination: ({ counter, maybeMode }) => {
        if (Option.isSome(maybeMode)) {
          return formatDetailMode(counter.id, maybeMode.value)
        } else {
          return [counter.id, `Count: ${counter.child.count.toString()}`]
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
      attributionSuffix('Foldkit Multiple Counters | Effect Terminal'),
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
const sendTerminalMessage = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  message: Message,
  maybeTape: Option.Option<
    Readonly<{ cursor: CountersTapeCursor; tape: CountersTape }>
  >,
) => {
  if (Option.isNone(maybeTape)) {
    return runtime.run(message)
  }
  return commitCountersMessage(
    maybeTape.value.tape,
    runtime,
    maybeTape.value.cursor,
    message,
  )
}

export const enqueueCountersTerminalSelection = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  input: string,
  occurrenceId: InteractionGraph.InteractionOccurrenceId,
  maybeTape: Option.Option<
    Readonly<{ cursor: CountersTapeCursor; tape: CountersTape }>
  > = Option.none(),
): Effect.Effect<
  Option.Option<Message>,
  | InteractionGraph.InteractionClaimError
  | InteractionGraph.InteractionGraphError
  | ProgramStoreError
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
    yield* sendTerminalMessage(runtime, resolved.success, maybeTape)
    return Option.some(resolved.success)
  })

const runInputLoop = (
  inputQueue: Queue.Dequeue<Terminal.UserInput, Cause.Done>,
  runtime: Runtime.ProgramRuntime<Model, Message>,
  terminal: Terminal.Terminal,
  nextOccurrenceNumber: number,
  maybeTape: Option.Option<
    Readonly<{ cursor: CountersTapeCursor; tape: CountersTape }>
  >,
): Effect.Effect<
  void,
  | Cause.Done
  | InteractionGraph.InteractionClaimError
  | InteractionGraph.InteractionGraphError
  | PlatformError.PlatformError
  | ProgramStoreError
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
      return enqueueCountersTerminalSelection(
        runtime,
        key,
        occurrenceId,
        maybeTape,
      ).pipe(
        Effect.flatMap(maybeMessage => {
          if (Option.isNone(maybeMessage)) {
            return runInputLoop(
              inputQueue,
              runtime,
              terminal,
              nextOccurrenceNumber,
              maybeTape,
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
                  maybeTape,
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
  maybeTape: Option.Option<
    Readonly<{ cursor: CountersTapeCursor; tape: CountersTape }>
  > = Option.none(),
): Effect.Effect<
  Message,
  NavigationCarrierResolutionError | ProgramStoreError
> =>
  Effect.gen(function* () {
    const resolvedCarrier = resolveNavigationCarrier(
      runtime.readModel(),
      carrier,
      terminalInvocationFacts(terminalNavigationOccurrenceId),
    )
    if (Result.isFailure(resolvedCarrier)) {
      return yield* Effect.fail(resolvedCarrier.failure)
    }
    yield* sendTerminalMessage(runtime, resolvedCarrier.success, maybeTape)
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
      const tape = yield* Effect.orDie(
        resolveCountersTape({
          ...process.env,
          COUNTERS_PROCESSOR_ID: countersProcessorIds.terminal,
        }),
      )
      const mode = process.env['COUNTERS_TAPE'] ?? process.env['COUNTER_TAPE']
      const resources =
        mode === 'instant' ? instantCountersResources : StaticCounterFactClient
      const opened = yield* Effect.orDie(
        openCountersTapeRuntime(tape, resources),
      )
      const maybeTape = Option.some({
        cursor: opened.cursor,
        tape,
      })
      if (mode === 'instant') {
        yield* observeRemoteCountersTape(
          tape,
          opened.runtime,
          countersProcessorIds.terminal,
        ).pipe(Effect.forkChild)
      }

      yield* openCountersTerminalCarrier(opened.runtime, carrier, maybeTape)
      yield* terminal.display(
        renderCountersTerminal(opened.runtime.readModel()),
      )
      const inputQueue = yield* terminal.readInput
      yield* runInputLoop(
        inputQueue,
        opened.runtime,
        terminal,
        1,
        maybeTape,
      ).pipe(Pull.catchDone(() => Effect.void))
      yield* opened.runtime.shutdown
    }),
  )
