import {
  type CounterFactClient,
  HttpCounterFactClient,
  type Message,
  type Model,
  MultipleCountersProgram,
  StaticCounterFactClient,
} from 'counters-core-example'
import { Array, Effect, Layer } from 'effect'
import { Runtime } from 'foldkit'

import {
  type ProgramStoreError,
  commitSharedMessage,
  observeRemoteAcceptedMessages,
} from '@foldkit/instant/browser'

import { foldCountersMessages } from './fold.js'
import { type CountersTape } from './makeTape.js'

/** Tracks which local journal transitions have already been taped. */
export type CountersTapeCursor = {
  journalIndex: number
}

/** Writes Command-result Messages after they apply locally. */
export const tapeJournaledCommandResults = (
  tape: CountersTape,
  runtime: Runtime.ProgramRuntime<Model, Message>,
  cursor: CountersTapeCursor,
): Effect.Effect<void, ProgramStoreError> =>
  Effect.gen(function* () {
    const transitions = runtime.journal.read().transitions
    const pending = Array.drop(transitions, cursor.journalIndex)
    cursor.journalIndex = transitions.length
    yield* Effect.forEach(pending, transition => {
      if (transition.source._tag !== 'Command') {
        return Effect.void
      }
      return tape.appendProposedMessage(transition.message).pipe(
        Effect.flatMap(() => tape.appendAcceptedMessage(transition.message)),
        Effect.asVoid,
      )
    })
  })

/** Writes one host Message before update and after update, then tapes Command results. */
export const commitCountersMessage = (
  tape: CountersTape,
  runtime: Runtime.ProgramRuntime<Model, Message>,
  cursor: CountersTapeCursor,
  message: Message,
): Effect.Effect<Model, ProgramStoreError> =>
  commitSharedMessage(tape, message, () => runtime.run(message)).pipe(
    Effect.tap(() => tapeJournaledCommandResults(tape, runtime, cursor)),
    Effect.map(commit => commit.result),
  )

/** Resources used by Instant hosts. Tests keep the static Layer. */
export const instantCountersResources = HttpCounterFactClient

export type OpenCountersTapeRuntime = Readonly<{
  cursor: CountersTapeCursor
  runtime: Runtime.ProgramRuntime<Model, Message>
  sendClientInput: (message: Message) => void
}>

/** Starts a Program runtime from the accepted Instant tape. */
export const openCountersTapeRuntime = (
  tape: CountersTape,
  resources: Layer.Layer<CounterFactClient> = StaticCounterFactClient,
) =>
  Effect.gen(function* () {
    const accepted = yield* tape.readAcceptedMessages
    const startModel = foldCountersMessages(accepted)
    const runtime = yield* Effect.orDie(
      Runtime.makeProgramRuntime({
        program: MultipleCountersProgram,
        resources,
        start: Runtime.fromModel(startModel),
      }),
    )
    yield* runtime.initialization
    const cursor: CountersTapeCursor = { journalIndex: 0 }
    yield* tapeJournaledCommandResults(tape, runtime, cursor)
    const sendClientInput = (message: Message): void => {
      void Effect.runPromise(
        commitCountersMessage(tape, runtime, cursor, message),
      )
    }
    return { cursor, runtime, sendClientInput }
  })

/** Applies remote accepted Messages without re-running Commands. */
export const observeRemoteCountersTape = (
  tape: CountersTape,
  runtime: Runtime.ProgramRuntime<Model, Message>,
  processorId: string,
): Effect.Effect<void, ProgramStoreError> =>
  observeRemoteAcceptedMessages(tape, processorId, (message, occurrence) =>
    Effect.asVoid(
      runtime.run(message, {
        source: Runtime.fromAcceptedMessage(occurrence.occurrenceId),
      }),
    ),
  )
