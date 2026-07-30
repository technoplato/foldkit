import { Effect, Fiber, Latch, Schema as S, Stream } from 'effect'
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
  InstantEffectRequestRecord,
  InstantMessageProposalRecord,
  InstantProgramEntities,
  InstantProgramSchema,
  InstantProjectionCheckpointRecord,
  enqueuedTransactionOutcome,
  makeAcceptedOccurrenceCursor,
  makeAcceptedOccurrencePositionKey,
  makeInMemoryProgramStore,
  makeInstantAcceptedMessageOccurrenceTransaction,
  makeInstantEffectRequestTransaction,
  makeInstantMessageProposalTransaction,
  makeInstantProgramStore,
  makeInstantProjectionCheckpointTransaction,
} from './index.js'

const sessionId = 'session-001'

const messageProposal = InstantMessageProposalRecord.make({
  actorId: 'user-001',
  actorSequence: 1,
  clientId: 'client-001',
  createdAtMs: 1_753_825_100_000,
  envelopeJson: '{"protocol":"foldkit-message"}',
  envelopeVersion: 1,
  eventId: 'counter.adjusted',
  eventVersion: 2,
  id: '11111111-1111-4111-8111-111111111111',
  originatingProcessorId: 'processor-phone',
  payloadJson: '{"_tag":"AdjustedCounter","amount":1}',
  programId: 'counter',
  programVersion: 3,
  proposalId: '11111111-1111-4111-8111-111111111111',
  sessionId,
})

const secondMessageProposal = InstantMessageProposalRecord.make({
  ...messageProposal,
  actorSequence: 2,
  createdAtMs: messageProposal.createdAtMs + 1,
  id: '11111111-1111-4111-8111-111111111112',
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
    causationId: `proposal-${acceptedSequence}`,
    clientId: 'client-001',
    correlationId: sessionId,
    envelopeJson: '{"protocol":"foldkit-message"}',
    envelopeVersion: 1,
    eventId: 'counter.adjusted',
    eventVersion: 2,
    id: occurrenceId,
    occurrenceId,
    originatingProcessorId: 'processor-phone',
    payloadJson: `{"_tag":"AdjustedCounter","amount":${acceptedSequence}}`,
    positionKey: makeAcceptedOccurrencePositionKey(sessionId, acceptedSequence),
    programId: 'counter',
    programVersion: 3,
    proposalId: `proposal-${acceptedSequence}`,
    sessionId,
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
  throughAcceptedSequence: 3,
})

const effectRequest = InstantEffectRequestRecord.make({
  argumentsJson: '{"amount":1}',
  cancellationGeneration: 0,
  causalOccurrenceId: firstOccurrence.occurrenceId,
  effectId: 'persist-counter',
  effectVersion: 1,
  id: '44444444-4444-4444-8444-444444444444',
  idempotencyKey: `${sessionId}:persist-counter:1`,
  minimumCapabilityVersion: 1,
  originatingProcessorId: 'processor-authority',
  placementJson: '{"_tag":"AnyCapableProcessor"}',
  programId: 'counter',
  programVersion: 3,
  requestId: 'effect-request-001',
  requestedAtMs: 1_753_825_400_000,
  requiredCapability: 'counter.persistence',
  sessionId,
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
                store.observeMessageProposals(sessionId),
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

  it.effect('buffers gaps and suppresses duplicate accepted occurrences', () =>
    Effect.gen(function* () {
      const cursor = yield* makeAcceptedOccurrenceCursor(sessionId)

      expect(yield* cursor.ingest([firstOccurrence, thirdOccurrence])).toEqual([
        firstOccurrence,
      ])
      expect(yield* cursor.ingest([thirdOccurrence])).toEqual([])
      expect(yield* cursor.ingest([secondOccurrence])).toEqual([
        secondOccurrence,
        thirdOccurrence,
      ])
      expect(
        yield* cursor.ingest([
          firstOccurrence,
          secondOccurrence,
          thirdOccurrence,
        ]),
      ).toEqual([])
    }),
  )

  it.effect('rejects occurrence identity and accepted sequence conflicts', () =>
    Effect.gen(function* () {
      const cursor = yield* makeAcceptedOccurrenceCursor(sessionId)
      yield* cursor.ingest([firstOccurrence])

      const reusedOccurrenceId = InstantAcceptedMessageOccurrenceRecord.make({
        ...firstOccurrence,
        payloadJson: '{"_tag":"AdjustedCounter","amount":99}',
      })
      const reusedSequence = makeAcceptedMessageOccurrence(
        firstOccurrence.acceptedSequence,
        '55555555-5555-4555-8555-555555555555',
      )

      const occurrenceIdConflict = yield* Effect.flip(
        cursor.ingest([reusedOccurrenceId]),
      )
      const acceptedSequenceConflict = yield* Effect.flip(
        cursor.ingest([reusedSequence]),
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
    ]

    expect(() =>
      validateTransactions(chunks, InstantProgramSchema),
    ).not.toThrow()
  })

  it('accepts a database whose application schema composes the entities', () => {
    expectTypeOf(adaptApplicationDatabase).toBeFunction()
  })
})
