import {
  CounterProgram,
  type Message,
  type Model,
  actions,
  counterProcessorIdFrom,
  counterProcessorIds,
  counterValid,
  foldCounterMessages,
  renderChrome,
  tokenOf,
} from 'counter-core-example'
import {
  Array,
  Cause,
  Effect,
  Layer,
  Option,
  PlatformError,
  Queue,
  Terminal,
} from 'effect'
import { Runtime } from 'foldkit'

import {
  commitSharedMessage,
  observeRemoteAcceptedMessages,
} from '@foldkit/instant/sharing'

import { type CounterTape, resolveCounterTape } from './tape.js'

const CLEAR_SCREEN = '\u001b[2J\u001b[H'

/** Renders the imported Counter Model from core chrome. */
export const renderCounterScreen = (model: Model): string => {
  const chrome = renderChrome(model, 'computer')
  return `${CLEAR_SCREEN}${chrome}\n\n[Q] quit\n`
}

/** Maps a terminal key to an imported Counter Message when applicable. */
export const messageForInput = (
  input: string,
  model: Model,
): Option.Option<Message> => {
  const key = input.toLowerCase()
  const maybeAction = Array.findFirst(
    actions,
    action =>
      Array.contains(action.keys ?? [], key) ||
      Array.contains(action.keys ?? [], input),
  )
  if (Option.isNone(maybeAction)) {
    return Option.none()
  }
  const token = tokenOf(maybeAction.value)
  const isValid = Array.some(
    counterValid(model, {}),
    item => item.token === token && item.valid,
  )
  if (!isValid) {
    return Option.none()
  }
  return Option.some(maybeAction.value())
}

const runInputLoop = (
  inputQueue: Queue.Dequeue<Terminal.UserInput, Cause.Done>,
  runtime: Runtime.ProgramRuntime<Model, Message>,
  terminal: Terminal.Terminal,
  tape: CounterTape,
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

      const maybeMessage = messageForInput(key, runtime.readModel())
      if (Option.isSome(maybeMessage)) {
        return commitSharedMessage(tape, maybeMessage.value, () =>
          runtime.run(maybeMessage.value),
        ).pipe(
          Effect.map(commit => commit.result),
          Effect.orDie,
          Effect.flatMap(model => terminal.display(renderCounterScreen(model))),
          Effect.flatMap(() =>
            runInputLoop(inputQueue, runtime, terminal, tape),
          ),
        )
      } else {
        return runInputLoop(inputQueue, runtime, terminal, tape)
      }
    }),
  )

/** Runs the interactive terminal host over the imported Counter program. */
export const runCounterTui = (): Effect.Effect<
  void,
  Cause.Done | PlatformError.PlatformError,
  Terminal.Terminal
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      const tape = yield* Effect.orDie(resolveCounterTape())
      const accepted = yield* Effect.orDie(tape.readAcceptedMessages)
      const processorId = counterProcessorIdFrom(
        process.env['COUNTER_PROCESSOR_ID'],
        counterProcessorIds.tui,
      )
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: CounterProgram,
          resources: Layer.empty,
          start: Runtime.fromModel(foldCounterMessages(accepted)),
        }),
      )

      yield* runtime.initialization
      yield* terminal.display(renderCounterScreen(runtime.readModel()))
      yield* observeRemoteAcceptedMessages(
        tape,
        processorId,
        (message, occurrence) =>
          runtime
            .run(message, {
              source: Runtime.fromAcceptedMessage(occurrence.occurrenceId),
            })
            .pipe(
              Effect.flatMap(model =>
                terminal.display(renderCounterScreen(model)),
              ),
              Effect.asVoid,
            ),
      ).pipe(Effect.orDie, Effect.forkChild)

      const inputQueue = yield* terminal.readInput
      yield* runInputLoop(inputQueue, runtime, terminal, tape)
      yield* runtime.shutdown
    }),
  )
