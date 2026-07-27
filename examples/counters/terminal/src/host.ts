import {
  type CounterDetailMode,
  type CounterFactStatus,
  type Destination,
  type Interaction,
  type Message,
  type Model,
  MultipleCountersProgram,
  StaticCounterFactClient,
  destinationForModel,
  interactionsForModel,
  modelForNavigation,
  navigationToPath,
  pathToNavigation,
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
  Terminal,
} from 'effect'
import { Runtime } from 'foldkit'

const clearScreen = '\u001b[2J\u001b[H'

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
  const interactions = interactionsForModel(model)
  const actionLines = Array.map(
    interactions,
    (interaction, index) =>
      `  [${(index + 1).toString()}] ${interaction.label}  ${interaction.token}`,
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

const interactionForInput = (
  interactions: ReadonlyArray<Interaction>,
  input: string,
): Option.Option<Interaction> => {
  const maybeIndex = Number.parseInt(input, 10)
  return Number.isNaN(maybeIndex)
    ? Option.none()
    : Array.get(interactions, maybeIndex - 1)
}

const runInputLoop = (
  inputQueue: Queue.Dequeue<Terminal.UserInput, Cause.Done>,
  runtime: Runtime.ProgramRuntime<Model, Message>,
  terminal: Terminal.Terminal,
): Effect.Effect<void, Cause.Done | PlatformError.PlatformError> =>
  Queue.take(inputQueue).pipe(
    Effect.flatMap(input => {
      const keyName = input.key.name.toLowerCase()
      const key = Option.getOrElse(input.input, () => keyName).toLowerCase()
      const isControlQuit =
        input.key.ctrl && (keyName === 'c' || keyName === 'd')
      if (key === 'q' || isControlQuit) {
        return Effect.void
      }

      const maybeInteraction = interactionForInput(
        interactionsForModel(runtime.readModel()),
        key,
      )
      if (Option.isNone(maybeInteraction)) {
        return runInputLoop(inputQueue, runtime, terminal)
      }
      return runtime.run(maybeInteraction.value.message).pipe(
        Effect.flatMap(model =>
          terminal.display(renderCountersTerminal(model)),
        ),
        Effect.flatMap(() => runInputLoop(inputQueue, runtime, terminal)),
      )
    }),
  )

/** Runs the interactive Effect Terminal host over one portable URI. */
export const runCountersTerminal = (
  carrier: string,
): Effect.Effect<void, PlatformError.PlatformError, Terminal.Terminal> =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      const initialNavigation = pathToNavigation(carrier)
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: MultipleCountersProgram,
          resources: StaticCounterFactClient,
          start: Runtime.fromModel(modelForNavigation(initialNavigation)),
        }),
      )

      yield* runtime.initialization
      yield* terminal.display(renderCountersTerminal(runtime.readModel()))
      const inputQueue = yield* terminal.readInput
      yield* runInputLoop(inputQueue, runtime, terminal).pipe(
        Pull.catchDone(() => Effect.void),
      )
      yield* runtime.shutdown
    }),
  )
