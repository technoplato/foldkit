import {
  Array,
  Effect,
  Layer,
  Option,
  Order,
  Schema as S,
  Stream,
  SubscriptionRef,
  Tuple,
  pipe,
} from 'effect'

import {
  ProgramStore,
  ProgramStoreError,
  type ProgramStoreService,
  type ProgramStoreTransactionOutcome,
  syncedTransactionOutcome,
} from '../programStore/index.js'
import {
  InstantAcceptedMessageOccurrenceRecord,
  InstantEffectRequestRecord,
  InstantMessageProposalRecord,
  InstantProjectionCheckpointRecord,
} from '../schema/index.js'

type IdentifiedRecord = Readonly<{
  id: string
  sessionId: string
}>

const acceptedMessageOccurrenceJson = S.fromJsonString(
  InstantAcceptedMessageOccurrenceRecord,
)
const effectRequestJson = S.fromJsonString(InstantEffectRequestRecord)
const messageProposalJson = S.fromJsonString(InstantMessageProposalRecord)
const projectionCheckpointJson = S.fromJsonString(
  InstantProjectionCheckpointRecord,
)

const acceptedMessageOccurrenceOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (record: InstantAcceptedMessageOccurrenceRecord) => record.acceptedSequence,
  ),
  Order.mapInput(
    Order.String,
    (record: InstantAcceptedMessageOccurrenceRecord) => record.occurrenceId,
  ),
)

const effectRequestOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (record: InstantEffectRequestRecord) => record.requestedAtMs,
  ),
  Order.mapInput(
    Order.String,
    (record: InstantEffectRequestRecord) => record.requestId,
  ),
)

const messageProposalOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (record: InstantMessageProposalRecord) => record.actorSequence,
  ),
  Order.mapInput(
    Order.String,
    (record: InstantMessageProposalRecord) => record.proposalId,
  ),
)

const projectionCheckpointOrder = Order.combine(
  Order.mapInput(
    Order.flip(Order.Number),
    (record: InstantProjectionCheckpointRecord) =>
      record.throughAcceptedSequence,
  ),
  Order.mapInput(
    Order.String,
    (record: InstantProjectionCheckpointRecord) => record.checkpointId,
  ),
)

const appendRecord = <Record extends IdentifiedRecord>(
  ref: SubscriptionRef.SubscriptionRef<ReadonlyArray<Record>>,
  record: Record,
  encode: (record: Record) => string,
  outcome: ProgramStoreTransactionOutcome,
  operation: ProgramStoreError['operation'],
): Effect.Effect<ProgramStoreTransactionOutcome, ProgramStoreError> =>
  SubscriptionRef.modifySomeEffect(ref, records => {
    const maybeExistingRecord = Array.findFirst(
      records,
      existingRecord => existingRecord.id === record.id,
    )
    if (Option.isSome(maybeExistingRecord)) {
      if (encode(maybeExistingRecord.value) === encode(record)) {
        return Effect.succeed(Tuple.make(outcome, Option.none()))
      } else {
        return Effect.fail(
          new ProgramStoreError({
            cause: new Error(
              `Record ${record.id} already exists with different contents.`,
            ),
            operation,
          }),
        )
      }
    } else {
      return Effect.succeed(
        Tuple.make(outcome, Option.some([...records, record])),
      )
    }
  })

const observeSessionRecords = <Record extends IdentifiedRecord>(
  ref: SubscriptionRef.SubscriptionRef<ReadonlyArray<Record>>,
  sessionId: string,
  order: Order.Order<Record>,
): Stream.Stream<ReadonlyArray<Record>> =>
  SubscriptionRef.changes(ref).pipe(
    Stream.map(records =>
      pipe(
        records,
        Array.filter(record => record.sessionId === sessionId),
        Array.sort(order),
      ),
    ),
  )

/** Creates a deterministic in-memory Program store for tests and local previews. */
export const makeInMemoryProgramStore = (
  outcome: ProgramStoreTransactionOutcome = syncedTransactionOutcome(
    'in-memory',
  ),
): Effect.Effect<ProgramStoreService> =>
  Effect.gen(function* () {
    const acceptedMessageOccurrences = yield* SubscriptionRef.make<
      ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>
    >([])
    const effectRequests = yield* SubscriptionRef.make<
      ReadonlyArray<InstantEffectRequestRecord>
    >([])
    const messageProposals = yield* SubscriptionRef.make<
      ReadonlyArray<InstantMessageProposalRecord>
    >([])
    const projectionCheckpoints = yield* SubscriptionRef.make<
      ReadonlyArray<InstantProjectionCheckpointRecord>
    >([])

    return ProgramStore.of({
      appendAcceptedMessageOccurrence: record =>
        appendRecord(
          acceptedMessageOccurrences,
          record,
          S.encodeSync(acceptedMessageOccurrenceJson),
          outcome,
          'AppendAcceptedMessageOccurrence',
        ),
      appendEffectRequest: record =>
        appendRecord(
          effectRequests,
          record,
          S.encodeSync(effectRequestJson),
          outcome,
          'AppendEffectRequest',
        ),
      appendMessageProposal: record =>
        appendRecord(
          messageProposals,
          record,
          S.encodeSync(messageProposalJson),
          outcome,
          'AppendMessageProposal',
        ),
      appendProjectionCheckpoint: record =>
        appendRecord(
          projectionCheckpoints,
          record,
          S.encodeSync(projectionCheckpointJson),
          outcome,
          'AppendProjectionCheckpoint',
        ),
      observeAcceptedMessageOccurrences: sessionId =>
        observeSessionRecords(
          acceptedMessageOccurrences,
          sessionId,
          acceptedMessageOccurrenceOrder,
        ),
      observeEffectRequests: sessionId =>
        observeSessionRecords(effectRequests, sessionId, effectRequestOrder),
      observeMessageProposals: sessionId =>
        observeSessionRecords(
          messageProposals,
          sessionId,
          messageProposalOrder,
        ),
      observeProjectionCheckpoints: sessionId =>
        observeSessionRecords(
          projectionCheckpoints,
          sessionId,
          projectionCheckpointOrder,
        ),
    })
  })

/** Provides a fresh deterministic in-memory Program store. */
export const InMemoryProgramStoreLayer = Layer.effect(
  ProgramStore,
  makeInMemoryProgramStore(),
)
