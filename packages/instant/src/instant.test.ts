import {
  Array,
  Effect,
  Fiber,
  Latch,
  Option,
  Schema as S,
  Stream,
} from 'effect'
import { Command, Processor } from 'foldkit'
import { expect, expectTypeOf } from 'vitest'

import { describe, it } from '@effect/vitest'
import {
  InstantCoreDatabase,
  i,
  txInit,
  validateTransactions,
} from '@instantdb/core'

import {
  AcceptedOccurrenceIdConflict,
  AcceptedSequenceConflict,
  InstantAcceptedMessageOccurrenceRecord,
  InstantEffectPlacementRecord,
  InstantEffectRequestRecord,
  InstantMessageProposalRecord,
  InstantProcessorActivity,
  InstantProcessorPresence,
  InstantProgramEntities,
  InstantProgramSchema,
  InstantProgramSessionRecord,
  InstantProjectionCheckpointRecord,
  decodeProgramStoreTransactionOutcome,
  enqueuedTransactionOutcome,
  makeAcceptedOccurrenceCursor,
  makeAcceptedOccurrencePositionKey,
  makeInMemoryProgramStore,
  makeInstantAcceptedMessageOccurrenceTransaction,
  makeInstantCapabilityIdIndex,
  makeInstantEffectPlacementPositionKey,
  makeInstantEffectPlacementTransaction,
  makeInstantEffectRequestTransaction,
  makeInstantMessageProposalTransaction,
  makeInstantProgramSessionTransaction,
  makeInstantProgramStore,
  makeInstantProjectionCheckpointTransaction,
} from './index.js'

const sessionId = 'session-001'
const subjectId = 'user-001'

const messageProposal = InstantMessageProposalRecord.make({
  actorId: 'user-001',
  actorSequence: 1,
  causationOccurrenceId: null,
  clientId: 'client-001',
  correlationId: null,
  createdAtMs: 1_753_825_100_000,
  effectAssignmentGeneration: null,
  effectCancellationGeneration: null,
  effectIdempotencyKey: null,
  effectRequestId: null,
  envelopeJson: '{"protocol":"foldkit-message"}',
  envelopeVersion: 1,
  eventId: 'counter.adjusted',
  eventVersion: 2,
  executorProcessorId: null,
  id: '11111111-1111-4111-8111-111111111111',
  occurrenceId: '11111111-1111-4111-8111-111111111111',
  originDeviceId: 'device-phone',
  originatingProcessorId: 'processor-phone',
  payloadJson: '{"_tag":"AdjustedCounter","amount":1}',
  programId: 'counter',
  programVersion: 3,
  proposalId: '11111111-1111-4111-8111-111111111111',
  proposalKind: 'Message',
  sessionId,
  subjectId,
})

const secondMessageProposal = InstantMessageProposalRecord.make({
  ...messageProposal,
  actorSequence: 2,
  createdAtMs: messageProposal.createdAtMs + 1,
  id: '11111111-1111-4111-8111-111111111112',
  occurrenceId: '11111111-1111-4111-8111-111111111112',
  proposalId: '11111111-1111-4111-8111-111111111112',
})

const makeAcceptedMessageOccurrence = (
  acceptedSequence: number,
  occurrenceId: string,
): InstantAcceptedMessageOccurrenceRecord =>
  InstantAcceptedMessageOccurrenceRecord.make({
    acceptedAtMs: 1_753_825_200_000 + acceptedSequence,
    acceptedSequence,
    acceptingProcessorId: 'processor-authority',
    actorId: 'user-001',
    actorSequence: acceptedSequence,
    causationId: `proposal-${acceptedSequence}`,
    clientId: 'client-001',
    correlationId: sessionId,
    createdAtMs: 1_753_825_100_000 + acceptedSequence,
    effectAssignmentGeneration: null,
    effectCancellationGeneration: null,
    effectIdempotencyKey: null,
    effectRequestId: null,
    envelopeJson: '{"protocol":"foldkit-message"}',
    envelopeVersion: 1,
    eventId: 'counter.adjusted',
    eventVersion: 2,
    executorProcessorId: null,
    id: occurrenceId,
    occurrenceId,
    originDeviceId: 'device-phone',
    originatingProcessorId: 'processor-phone',
    payloadJson: `{"_tag":"AdjustedCounter","amount":${acceptedSequence}}`,
    positionKey: makeAcceptedOccurrencePositionKey(sessionId, acceptedSequence),
    programId: 'counter',
    programVersion: 3,
    proposedEnvelopeJson: '{"protocol":"foldkit-message"}',
    proposalId: `proposal-${acceptedSequence}`,
    proposalKind: 'Message',
    sessionId,
    subjectId,
  })

const firstOccurrence = makeAcceptedMessageOccurrence(
  1,
  '22222222-2222-4222-8222-222222222221',
)
const secondOccurrence = makeAcceptedMessageOccurrence(
  2,
  '22222222-2222-4222-8222-222222222222',
)
const thirdOccurrence = makeAcceptedMessageOccurrence(
  3,
  '22222222-2222-4222-8222-222222222223',
)

const projectionCheckpoint = InstantProjectionCheckpointRecord.make({
  checkpointId: 'checkpoint-003',
  createdAtMs: 1_753_825_300_000,
  id: '33333333-3333-4333-8333-333333333333',
  modelDigest: 'sha256:model-003',
  modelJson: '{"count":3}',
  programId: 'counter',
  programVersion: 3,
  projectionId: 'counter-model',
  projectionVersion: 1,
  projectorProcessorId: 'processor-authority',
  sessionId,
  subjectId,
  throughAcceptedSequence: 3,
})

const effectCapability = Processor.CapabilityRequirement.make({
  id: ['Counter', 'Persistence'],
  minimumVersion: 1,
})

const effectRequest = InstantEffectRequestRecord.make({
  causalOccurrenceId: firstOccurrence.occurrenceId,
  effectId: 'persist-counter',
  effectVersion: 1,
  id: '44444444-4444-4444-8444-444444444444',
  idempotencyKey: `${sessionId}:persist-counter:1`,
  minimumCapabilityVersion: 1,
  originatingProcessorId: 'processor-authority',
  placement: Processor.Placement.make({
    affinity: Processor.AnyProcessor.make({}),
    capability: effectCapability,
    cardinality: 'One',
    unavailable: 'Wait',
    version: 1,
  }),
  programId: 'counter',
  programVersion: 3,
  publicArguments: { amount: 1 },
  permittedResultEvents: [
    Command.ResultEventRange.make({
      eventId: 'counter.persisted',
      maximumVersion: 1,
      minimumVersion: 1,
    }),
  ],
  requestId: 'effect-request-001',
  requestedAtMs: 1_753_825_400_000,
  requiredCapabilityIdJson: makeInstantCapabilityIdIndex(effectCapability.id),
  sessionId,
  subjectId,
})

const effectPlacement = InstantEffectPlacementRecord.make({
  assignedProcessorId: 'processor-phone',
  assignmentGeneration: 1,
  cancellationGeneration: 0,
  decidedAtMs: 1_753_825_400_001,
  id: '55555555-5555-4555-8555-555555555555',
  placementDecision: Processor.AssignedPreferred.make({
    processorId: 'processor-phone',
  }),
  placementStatus: 'AssignedPreferred',
  positionKey: makeInstantEffectPlacementPositionKey(
    effectRequest.requestId,
    1,
    0,
  ),
  programId: 'counter',
  programVersion: 3,
  requestId: effectRequest.requestId,
  sessionId,
  subjectId,
})

const programSession = InstantProgramSessionRecord.make({
  authorityProcessorId: 'processor-authority',
  createdAtMs: 1_753_825_000_000,
  id: '66666666-6666-4666-8666-666666666666',
  isRevoked: false,
  processorRoomId: 'room-4ec724f1c3584d679b8a3b88f470e372',
  programId: 'counter',
  programVersion: 3,
  sessionId,
  subjectId,
})

const ApplicationSchema = i.schema({
  entities: {
    ...InstantProgramEntities,
    notes: i.entity({
      body: i.string(),
    }),
  },
})

const adaptApplicationDatabase = (
  database: InstantCoreDatabase<typeof ApplicationSchema>,
) => makeInstantProgramStore(database)

describe('@foldkit/instant', () => {
  it('round trips every durable record through its wire Schema', () => {
    const proposalJson = S.fromJsonString(InstantMessageProposalRecord)
    const occurrenceJson = S.fromJsonString(
      InstantAcceptedMessageOccurrenceRecord,
    )
    const checkpointJson = S.fromJsonString(InstantProjectionCheckpointRecord)
    const effectRequestJson = S.fromJsonString(InstantEffectRequestRecord)
    const effectPlacementJson = S.fromJsonString(InstantEffectPlacementRecord)

    expect(
      S.decodeUnknownSync(proposalJson)(
        S.encodeSync(proposalJson)(messageProposal),
      ),
    ).toEqual(messageProposal)
    expect(
      S.decodeUnknownSync(occurrenceJson)(
        S.encodeSync(occurrenceJson)(firstOccurrence),
      ),
    ).toEqual(firstOccurrence)
    expect(
      S.decodeUnknownSync(checkpointJson)(
        S.encodeSync(checkpointJson)(projectionCheckpoint),
      ),
    ).toEqual(projectionCheckpoint)
    expect(
      S.decodeUnknownSync(effectRequestJson)(
        S.encodeSync(effectRequestJson)(effectRequest),
      ),
    ).toEqual(effectRequest)
    expect(
      S.decodeUnknownSync(effectPlacementJson)(
        S.encodeSync(effectPlacementJson)(effectPlacement),
      ),
    ).toEqual(effectPlacement)
  })

  it.effect(
    'observes the current in-memory snapshot and subsequent writes',
    () =>
      Effect.gen(function* () {
        const store = yield* makeInMemoryProgramStore()
        const subscribed = yield* Latch.make()
        const snapshotsFiber = yield* Effect.forkChild(
          Stream.runCollect(
            Stream.take(
              Stream.tap(
                store.observeMessageProposals({ sessionId, subjectId }),
                () => subscribed.open,
              ),
              3,
            ),
          ),
        )

        yield* subscribed.await
        const outcome = yield* store.appendMessageProposal(messageProposal)
        yield* store.appendMessageProposal(messageProposal)
        yield* store.appendMessageProposal(secondMessageProposal)
        const snapshots = yield* Fiber.join(snapshotsFiber)

        expect(outcome).toEqual({
          _tag: 'Synced',
          clientId: 'in-memory',
        })
        expect(snapshots).toEqual([
          [],
          [messageProposal],
          [messageProposal, secondMessageProposal],
        ])
      }),
  )

  it.effect(
    'keeps locally enqueued writes distinct from accepted Messages',
    () =>
      Effect.gen(function* () {
        const store = yield* makeInMemoryProgramStore(
          enqueuedTransactionOutcome('offline-client'),
        )

        expect(yield* store.appendMessageProposal(messageProposal)).toEqual({
          _tag: 'Enqueued',
          clientId: 'offline-client',
        })
      }),
  )

  it.effect(
    'isolates durable snapshots by authenticated subject and session',
    () =>
      Effect.gen(function* () {
        const store = yield* makeInMemoryProgramStore()
        const otherSubjectProposal = InstantMessageProposalRecord.make({
          ...secondMessageProposal,
          id: '11111111-1111-4111-8111-111111111113',
          occurrenceId: '11111111-1111-4111-8111-111111111113',
          proposalId: '11111111-1111-4111-8111-111111111113',
          subjectId: 'user-other',
        })
        yield* store.appendMessageProposal(messageProposal)
        yield* store.appendMessageProposal(otherSubjectProposal)

        const maybeSnapshot = yield* Stream.runHead(
          store.observeMessageProposals({ sessionId, subjectId }),
        )
        expect(Option.getOrThrow(maybeSnapshot)).toEqual([messageProposal])
      }),
  )

  it.effect('buffers gaps and suppresses duplicate accepted occurrences', () =>
    Effect.gen(function* () {
      const cursor = yield* makeAcceptedOccurrenceCursor(sessionId)

      yield* cursor.stage([firstOccurrence, thirdOccurrence])
      expect(yield* cursor.next).toEqual(Option.some(firstOccurrence))
      yield* cursor.commit(firstOccurrence)
      yield* cursor.stage([thirdOccurrence])
      expect(yield* cursor.next).toEqual(Option.none())
      yield* cursor.stage([secondOccurrence])
      expect(yield* cursor.next).toEqual(Option.some(secondOccurrence))
      yield* cursor.commit(secondOccurrence)
      expect(yield* cursor.next).toEqual(Option.some(thirdOccurrence))
      yield* cursor.commit(thirdOccurrence)
      yield* cursor.stage([firstOccurrence, secondOccurrence, thirdOccurrence])
      expect(yield* cursor.next).toEqual(Option.none())
    }),
  )

  it.effect('rejects occurrence identity and accepted sequence conflicts', () =>
    Effect.gen(function* () {
      const cursor = yield* makeAcceptedOccurrenceCursor(sessionId)
      yield* cursor.stage([firstOccurrence])
      yield* cursor.commit(firstOccurrence)

      const reusedOccurrenceId = InstantAcceptedMessageOccurrenceRecord.make({
        ...firstOccurrence,
        payloadJson: '{"_tag":"AdjustedCounter","amount":99}',
      })
      const reusedSequence = makeAcceptedMessageOccurrence(
        firstOccurrence.acceptedSequence,
        '55555555-5555-4555-8555-555555555555',
      )

      const occurrenceIdConflict = yield* Effect.flip(
        cursor.stage([reusedOccurrenceId]),
      )
      const acceptedSequenceConflict = yield* Effect.flip(
        cursor.stage([reusedSequence]),
      )

      expect(occurrenceIdConflict).toBeInstanceOf(AcceptedOccurrenceIdConflict)
      expect(acceptedSequenceConflict).toBeInstanceOf(AcceptedSequenceConflict)
    }),
  )

  it('builds locally valid InstantDB transactions for every record', () => {
    const transactions = txInit<typeof InstantProgramSchema>()
    const chunks = [
      makeInstantMessageProposalTransaction(transactions, messageProposal),
      makeInstantAcceptedMessageOccurrenceTransaction(
        transactions,
        firstOccurrence,
      ),
      makeInstantProjectionCheckpointTransaction(
        transactions,
        projectionCheckpoint,
      ),
      makeInstantEffectRequestTransaction(transactions, effectRequest),
      makeInstantEffectPlacementTransaction(transactions, effectPlacement),
      makeInstantProgramSessionTransaction(transactions, programSession),
    ]

    expect(() =>
      validateTransactions(chunks, InstantProgramSchema),
    ).not.toThrow()
    expect(
      Array.map(chunks, chunk =>
        Array.map(chunk.__ops, operation =>
          Option.getOrThrow(Array.head(operation)),
        ),
      ),
    ).toEqual([
      ['create'],
      ['create'],
      ['create'],
      ['create'],
      ['create'],
      ['update'],
    ])
  })

  it('accepts a database whose application schema composes the entities', () => {
    expectTypeOf(adaptApplicationDatabase).toBeFunction()
  })

  it('decodes both documented and shipped transaction correlation fields', () => {
    expect(
      decodeProgramStoreTransactionOutcome({
        clientId: 'documented-client-id',
        status: 'synced',
      }),
    ).toEqual({
      _tag: 'Synced',
      clientId: 'documented-client-id',
    })
    expect(
      decodeProgramStoreTransactionOutcome({
        eventId: 'shipped-event-id',
        status: 'enqueued',
      }),
    ).toEqual({
      _tag: 'Enqueued',
      clientId: 'shipped-event-id',
    })
    expect(() =>
      decodeProgramStoreTransactionOutcome({ status: 'synced' }),
    ).toThrow()
  })

  it('keeps Processor room data transient, capability-oriented, and subject-free', () => {
    const presence = InstantProcessorPresence.make({
      clientId: 'client-phone',
      descriptor: Processor.Descriptor.make({
        capabilities: [
          Processor.Capability.make({
            id: ['Device', 'Vibrate'],
            version: 1,
          }),
        ],
        clientId: 'client-phone',
        effectSupport: [
          Processor.EffectSupportRange.make({
            id: 'device.vibrate',
            maximumVersion: 1,
            minimumVersion: 1,
          }),
        ],
        processorId: 'processor-phone',
        protocol: Processor.ProtocolRange.make({
          maximumVersion: 1,
          minimumVersion: 1,
        }),
      }),
      isEffectExecutorAvailable: true,
      lastSeenAtMs: 1_753_825_500_000,
      latestAcceptedSequence: 12,
      processorId: 'processor-phone',
      protocolMaximumVersion: 1,
      protocolMinimumVersion: 1,
    })
    const activity = InstantProcessorActivity.make({
      activity: 'HandlingEffect',
      effectRequestId: 'effect-request-001',
      processorId: 'processor-phone',
    })

    expect(S.decodeUnknownSync(InstantProcessorPresence)(presence)).toEqual(
      presence,
    )
    expect(S.decodeUnknownSync(InstantProcessorActivity)(activity)).toEqual(
      activity,
    )
    expect('subjectId' in presence).toBe(false)
    expect('sessionId' in presence).toBe(false)
  })
})
