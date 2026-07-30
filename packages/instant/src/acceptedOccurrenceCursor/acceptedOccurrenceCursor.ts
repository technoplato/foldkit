import {
  Array,
  Data,
  Effect,
  HashMap,
  Option,
  Schema as S,
  SynchronizedRef,
  Tuple,
} from 'effect'

import { InstantAcceptedMessageOccurrenceRecord } from '../schema/index.js'

const acceptedMessageOccurrenceJson = S.fromJsonString(
  InstantAcceptedMessageOccurrenceRecord,
)
const encodeAcceptedMessageOccurrence = S.encodeSync(
  acceptedMessageOccurrenceJson,
)

type KnownOccurrence = Readonly<{
  encodedOccurrence: string
  occurrence: InstantAcceptedMessageOccurrenceRecord
}>

type AcceptedOccurrenceCursorState = Readonly<{
  knownById: HashMap.HashMap<string, KnownOccurrence>
  knownBySequence: HashMap.HashMap<number, KnownOccurrence>
  nextAcceptedSequence: number
  sessionId: string
}>

/** One occurrence ID was reused for different accepted Message contents. */
export class AcceptedOccurrenceIdConflict extends Data.TaggedError(
  'AcceptedOccurrenceIdConflict',
)<{
  readonly occurrenceId: string
}> {}

/** Two different Message occurrences occupied one accepted sequence position. */
export class AcceptedSequenceConflict extends Data.TaggedError(
  'AcceptedSequenceConflict',
)<{
  readonly acceptedSequence: number
  readonly existingOccurrenceId: string
  readonly incomingOccurrenceId: string
}> {}

/** An occurrence belonged to a different Program session than its cursor. */
export class AcceptedOccurrenceSessionMismatch extends Data.TaggedError(
  'AcceptedOccurrenceSessionMismatch',
)<{
  readonly actualSessionId: string
  readonly expectedSessionId: string
  readonly occurrenceId: string
}> {}

/** An occurrence did not carry the canonical session and sequence position key. */
export class AcceptedOccurrencePositionMismatch extends Data.TaggedError(
  'AcceptedOccurrencePositionMismatch',
)<{
  readonly actualPositionKey: string
  readonly expectedPositionKey: string
  readonly occurrenceId: string
}> {}

/** A conflict that prevents deterministic accepted Message ordering. */
export type AcceptedOccurrenceCursorError =
  | AcceptedOccurrenceIdConflict
  | AcceptedSequenceConflict
  | AcceptedOccurrenceSessionMismatch
  | AcceptedOccurrencePositionMismatch

/** A stateful cursor that emits each accepted Message exactly once and in order. */
export type AcceptedOccurrenceCursorService = Readonly<{
  ingest: (
    occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
  ) => Effect.Effect<
    ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
    AcceptedOccurrenceCursorError
  >
}>

/** Derives the unique InstantDB position key for one accepted sequence. */
export const makeAcceptedOccurrencePositionKey = (
  sessionId: string,
  acceptedSequence: number,
): string => `${sessionId}:${acceptedSequence}`

const insertOccurrence = (
  state: AcceptedOccurrenceCursorState,
  occurrence: InstantAcceptedMessageOccurrenceRecord,
): Effect.Effect<
  AcceptedOccurrenceCursorState,
  AcceptedOccurrenceCursorError
> => {
  if (occurrence.sessionId !== state.sessionId) {
    return Effect.fail(
      new AcceptedOccurrenceSessionMismatch({
        actualSessionId: occurrence.sessionId,
        expectedSessionId: state.sessionId,
        occurrenceId: occurrence.occurrenceId,
      }),
    )
  }

  const expectedPositionKey = makeAcceptedOccurrencePositionKey(
    occurrence.sessionId,
    occurrence.acceptedSequence,
  )
  if (occurrence.positionKey !== expectedPositionKey) {
    return Effect.fail(
      new AcceptedOccurrencePositionMismatch({
        actualPositionKey: occurrence.positionKey,
        expectedPositionKey,
        occurrenceId: occurrence.occurrenceId,
      }),
    )
  }

  const encodedOccurrence = encodeAcceptedMessageOccurrence(occurrence)
  const maybeKnownById = HashMap.get(state.knownById, occurrence.occurrenceId)
  if (Option.isSome(maybeKnownById)) {
    if (maybeKnownById.value.encodedOccurrence === encodedOccurrence) {
      return Effect.succeed(state)
    } else {
      return Effect.fail(
        new AcceptedOccurrenceIdConflict({
          occurrenceId: occurrence.occurrenceId,
        }),
      )
    }
  }

  const maybeKnownBySequence = HashMap.get(
    state.knownBySequence,
    occurrence.acceptedSequence,
  )
  if (Option.isSome(maybeKnownBySequence)) {
    return Effect.fail(
      new AcceptedSequenceConflict({
        acceptedSequence: occurrence.acceptedSequence,
        existingOccurrenceId:
          maybeKnownBySequence.value.occurrence.occurrenceId,
        incomingOccurrenceId: occurrence.occurrenceId,
      }),
    )
  }

  const knownOccurrence = {
    encodedOccurrence,
    occurrence,
  }
  return Effect.succeed({
    ...state,
    knownById: HashMap.set(
      state.knownById,
      occurrence.occurrenceId,
      knownOccurrence,
    ),
    knownBySequence: HashMap.set(
      state.knownBySequence,
      occurrence.acceptedSequence,
      knownOccurrence,
    ),
  })
}

const insertOccurrences = (
  state: AcceptedOccurrenceCursorState,
  occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
): Effect.Effect<
  AcceptedOccurrenceCursorState,
  AcceptedOccurrenceCursorError
> => {
  const initialState: Effect.Effect<
    AcceptedOccurrenceCursorState,
    AcceptedOccurrenceCursorError
  > = Effect.succeed(state)
  return Array.reduce(occurrences, initialState, (stateEffect, occurrence) =>
    Effect.flatMap(stateEffect, nextState =>
      insertOccurrence(nextState, occurrence),
    ),
  )
}

const drainContiguousOccurrences = (
  state: AcceptedOccurrenceCursorState,
  emittedOccurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
): readonly [
  ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
  AcceptedOccurrenceCursorState,
] => {
  const maybeKnownOccurrence = HashMap.get(
    state.knownBySequence,
    state.nextAcceptedSequence,
  )
  if (Option.isSome(maybeKnownOccurrence)) {
    return drainContiguousOccurrences(
      {
        ...state,
        nextAcceptedSequence: state.nextAcceptedSequence + 1,
      },
      [...emittedOccurrences, maybeKnownOccurrence.value.occurrence],
    )
  } else {
    return Tuple.make(emittedOccurrences, state)
  }
}

/** Creates a cursor positioned immediately after a trusted projection checkpoint. */
export const makeAcceptedOccurrenceCursor = (
  sessionId: string,
  throughAcceptedSequence = 0,
): Effect.Effect<AcceptedOccurrenceCursorService> =>
  Effect.gen(function* () {
    const stateRef = yield* SynchronizedRef.make<AcceptedOccurrenceCursorState>(
      {
        knownById: HashMap.empty(),
        knownBySequence: HashMap.empty(),
        nextAcceptedSequence: throughAcceptedSequence + 1,
        sessionId,
      },
    )

    return {
      ingest: occurrences =>
        SynchronizedRef.modifyEffect(stateRef, state =>
          Effect.map(insertOccurrences(state, occurrences), nextState => {
            const [emittedOccurrences, drainedState] =
              drainContiguousOccurrences(nextState, [])
            return Tuple.make(emittedOccurrences, drainedState)
          }),
        ),
    }
  })
