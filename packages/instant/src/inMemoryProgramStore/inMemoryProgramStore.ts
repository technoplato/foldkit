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
  ProgramAuthorityStore,
  type ProgramAuthorityStoreService,
  ProgramStore,
  type ProgramStoreConnectionStatus,
  ProgramStoreError,
  type ProgramStoreScope,
  type ProgramStoreService,
  type ProgramStoreTransactionOutcome,
  syncedTransactionOutcome,
} from '../programStore/index.js'
import {
  InstantAcceptedMessageOccurrenceRecord,
  InstantEffectPlacementRecord,
  InstantEffectRequestRecord,
  InstantMessageProposalRecord,
  InstantMessageProposalResolutionRecord,
  InstantProgramSessionRecord,
  InstantProjectionCheckpointRecord,
} from '../schema/index.js'

type IdentifiedRecord = Readonly<{
  id: string
  sessionId: string
  subjectId: string
}>

const acceptedMessageOccurrenceJson = S.fromJsonString(
  InstantAcceptedMessageOccurrenceRecord,
)
const effectRequestJson = S.fromJsonString(InstantEffectRequestRecord)
const effectPlacementJson = S.fromJsonString(InstantEffectPlacementRecord)
const messageProposalJson = S.fromJsonString(InstantMessageProposalRecord)
const messageProposalResolutionJson = S.fromJsonString(
  InstantMessageProposalResolutionRecord,
)
const programSessionJson = S.fromJsonString(InstantProgramSessionRecord)
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

const effectPlacementOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (record: InstantEffectPlacementRecord) => record.assignmentGeneration,
  ),
  Order.mapInput(
    Order.String,
    (record: InstantEffectPlacementRecord) => record.positionKey,
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

const messageProposalResolutionOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (record: InstantMessageProposalResolutionRecord) => record.rejectedAtMs,
  ),
  Order.mapInput(
    Order.String,
    (record: InstantMessageProposalResolutionRecord) => record.proposalId,
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

const programSessionOrder = Order.mapInput(
  Order.String,
  (record: InstantProgramSessionRecord) => record.sessionId,
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
  scope: ProgramStoreScope,
  order: Order.Order<Record>,
): Stream.Stream<ReadonlyArray<Record>> =>
  SubscriptionRef.changes(ref).pipe(
    Stream.map(records =>
      pipe(
        records,
        Array.filter(
          record =>
            record.sessionId === scope.sessionId &&
            record.subjectId === scope.subjectId,
        ),
        Array.sort(order),
      ),
    ),
  )

const putRecord = <Record extends IdentifiedRecord>(
  ref: SubscriptionRef.SubscriptionRef<ReadonlyArray<Record>>,
  record: Record,
  encode: (record: Record) => string,
  outcome: ProgramStoreTransactionOutcome,
): Effect.Effect<ProgramStoreTransactionOutcome> =>
  SubscriptionRef.modify(ref, records => {
    const maybeExistingRecord = Array.findFirst(
      records,
      existingRecord => existingRecord.id === record.id,
    )
    if (Option.isNone(maybeExistingRecord)) {
      return Tuple.make(outcome, [...records, record])
    }
    if (encode(maybeExistingRecord.value) === encode(record)) {
      return Tuple.make(outcome, records)
    }
    return Tuple.make(
      outcome,
      Array.map(records, existingRecord =>
        existingRecord.id === record.id ? record : existingRecord,
      ),
    )
  })

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
    const effectPlacements = yield* SubscriptionRef.make<
      ReadonlyArray<InstantEffectPlacementRecord>
    >([])
    const messageProposals = yield* SubscriptionRef.make<
      ReadonlyArray<InstantMessageProposalRecord>
    >([])
    const messageProposalResolutions = yield* SubscriptionRef.make<
      ReadonlyArray<InstantMessageProposalResolutionRecord>
    >([])
    const programSessions = yield* SubscriptionRef.make<
      ReadonlyArray<InstantProgramSessionRecord>
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
      appendEffectPlacement: record =>
        appendRecord(
          effectPlacements,
          record,
          S.encodeSync(effectPlacementJson),
          outcome,
          'AppendEffectPlacement',
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
      appendMessageProposalResolution: record =>
        appendRecord(
          messageProposalResolutions,
          record,
          S.encodeSync(messageProposalResolutionJson),
          outcome,
          'AppendMessageProposalResolution',
        ),
      appendProgramSession: record =>
        putRecord(
          programSessions,
          record,
          S.encodeSync(programSessionJson),
          outcome,
        ),
      appendProjectionCheckpoint: record =>
        appendRecord(
          projectionCheckpoints,
          record,
          S.encodeSync(projectionCheckpointJson),
          outcome,
          'AppendProjectionCheckpoint',
        ),
      observeAcceptedMessageOccurrences: scope =>
        observeSessionRecords(
          acceptedMessageOccurrences,
          scope,
          acceptedMessageOccurrenceOrder,
        ),
      observeConnectionStatus:
        Stream.succeed<ProgramStoreConnectionStatus>('authenticated'),
      observeEffectPlacements: scope =>
        observeSessionRecords(effectPlacements, scope, effectPlacementOrder),
      observeEffectRequests: scope =>
        observeSessionRecords(effectRequests, scope, effectRequestOrder),
      observeMessageProposals: scope =>
        observeSessionRecords(messageProposals, scope, messageProposalOrder),
      observeMessageProposalResolutions: scope =>
        observeSessionRecords(
          messageProposalResolutions,
          scope,
          messageProposalResolutionOrder,
        ),
      observeProgramSessions: scope =>
        observeSessionRecords(programSessions, scope, programSessionOrder),
      observeProjectionCheckpoints: scope =>
        observeSessionRecords(
          projectionCheckpoints,
          scope,
          projectionCheckpointOrder,
        ),
    })
  })

/** Creates a deterministic server-confirmed authority store for tests. */
export const makeInMemoryProgramAuthorityStore =
  (): Effect.Effect<ProgramAuthorityStoreService> =>
    Effect.map(makeInMemoryProgramStore(), store =>
      ProgramAuthorityStore.of({
        ...store,
        appendServerConfirmedAcceptedMessageOccurrence: record =>
          Effect.flatMap(
            store.appendAcceptedMessageOccurrence(record),
            outcome =>
              outcome._tag === 'Synced'
                ? Effect.succeed(outcome)
                : Effect.fail(
                    new ProgramStoreError({
                      cause: new Error(
                        'The in-memory authority store returned an optimistic accepted write.',
                      ),
                      operation: 'AppendAcceptedMessageOccurrence',
                    }),
                  ),
          ),
        appendServerConfirmedEffectPlacement: record =>
          Effect.flatMap(store.appendEffectPlacement(record), outcome =>
            outcome._tag === 'Synced'
              ? Effect.succeed(outcome)
              : Effect.fail(
                  new ProgramStoreError({
                    cause: new Error(
                      'The in-memory authority store returned an optimistic placement write.',
                    ),
                    operation: 'AppendEffectPlacement',
                  }),
                ),
          ),
        appendServerConfirmedEffectRequest: record =>
          Effect.flatMap(store.appendEffectRequest(record), outcome =>
            outcome._tag === 'Synced'
              ? Effect.succeed(outcome)
              : Effect.fail(
                  new ProgramStoreError({
                    cause: new Error(
                      'The in-memory authority store returned an optimistic effect-request write.',
                    ),
                    operation: 'AppendEffectRequest',
                  }),
                ),
          ),
        appendServerConfirmedMessageProposalResolution: record =>
          Effect.flatMap(
            store.appendMessageProposalResolution(record),
            outcome =>
              outcome._tag === 'Synced'
                ? Effect.succeed(outcome)
                : Effect.fail(
                    new ProgramStoreError({
                      cause: new Error(
                        'The in-memory authority store returned an optimistic resolution write.',
                      ),
                      operation: 'AppendMessageProposalResolution',
                    }),
                  ),
          ),
        serverConfirmed: {
          observeAcceptedMessageOccurrences:
            store.observeAcceptedMessageOccurrences,
          observeConnectionStatus: store.observeConnectionStatus,
          observeEffectPlacements: store.observeEffectPlacements,
          observeEffectRequests: store.observeEffectRequests,
          observeMessageProposals: store.observeMessageProposals,
          observeMessageProposalResolutions:
            store.observeMessageProposalResolutions,
          observeProgramSessions: store.observeProgramSessions,
          observeProjectionCheckpoints: store.observeProjectionCheckpoints,
        },
      }),
    )

/** Provides a fresh deterministic in-memory Program store. */
export const InMemoryProgramStoreLayer = Layer.effect(
  ProgramStore,
  makeInMemoryProgramStore(),
)
