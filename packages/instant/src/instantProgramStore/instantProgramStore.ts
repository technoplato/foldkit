import {
  Array,
  Cause,
  Effect,
  Layer,
  Match as M,
  Queue,
  Schema as S,
  Stream,
} from 'effect'

import { type TransactionResult } from '@instantdb/core'

import {
  ProgramStore,
  ProgramStoreError,
  type ProgramStoreService,
  type ProgramStoreTransactionOutcome,
  enqueuedTransactionOutcome,
  syncedTransactionOutcome,
} from '../programStore/index.js'
import {
  InstantAcceptedMessageOccurrenceRecord,
  InstantEffectRequestRecord,
  InstantMessageProposalRecord,
  type InstantProgramDatabase,
  InstantProjectionCheckpointRecord,
} from '../schema/index.js'

const toProgramStoreTransactionOutcome = (
  result: TransactionResult,
): ProgramStoreTransactionOutcome =>
  M.value(result.status).pipe(
    M.when('enqueued', () => enqueuedTransactionOutcome(result.clientId)),
    M.when('synced', () => syncedTransactionOutcome(result.clientId)),
    M.exhaustive,
  )

/** Creates the InstantDB transaction for one durable Message proposal. */
export const makeInstantMessageProposalTransaction = (
  transactions: InstantProgramDatabase['tx'],
  record: InstantMessageProposalRecord,
) => {
  const entity = transactions.foldkitMessageProposals[record.id]
  if (entity === undefined) {
    throw new Error('Expected a Foldkit Message proposal transaction entity.')
  }
  return entity.update({
    actorId: record.actorId,
    actorSequence: record.actorSequence,
    clientId: record.clientId,
    createdAtMs: record.createdAtMs,
    envelopeJson: record.envelopeJson,
    envelopeVersion: record.envelopeVersion,
    eventId: record.eventId,
    eventVersion: record.eventVersion,
    originatingProcessorId: record.originatingProcessorId,
    payloadJson: record.payloadJson,
    programId: record.programId,
    programVersion: record.programVersion,
    proposalId: record.proposalId,
    sessionId: record.sessionId,
  })
}

/** Creates the InstantDB transaction for one accepted Message occurrence. */
export const makeInstantAcceptedMessageOccurrenceTransaction = (
  transactions: InstantProgramDatabase['tx'],
  record: InstantAcceptedMessageOccurrenceRecord,
) => {
  const entity = transactions.foldkitAcceptedMessageOccurrences[record.id]
  if (entity === undefined) {
    throw new Error(
      'Expected a Foldkit accepted Message occurrence transaction entity.',
    )
  }
  return entity.update({
    acceptedAtMs: record.acceptedAtMs,
    acceptedSequence: record.acceptedSequence,
    acceptingProcessorId: record.acceptingProcessorId,
    actorId: record.actorId,
    causationId: record.causationId,
    clientId: record.clientId,
    correlationId: record.correlationId,
    envelopeJson: record.envelopeJson,
    envelopeVersion: record.envelopeVersion,
    eventId: record.eventId,
    eventVersion: record.eventVersion,
    occurrenceId: record.occurrenceId,
    originatingProcessorId: record.originatingProcessorId,
    payloadJson: record.payloadJson,
    positionKey: record.positionKey,
    programId: record.programId,
    programVersion: record.programVersion,
    proposalId: record.proposalId,
    sessionId: record.sessionId,
  })
}

/** Creates the InstantDB transaction for one append-only projection checkpoint. */
export const makeInstantProjectionCheckpointTransaction = (
  transactions: InstantProgramDatabase['tx'],
  record: InstantProjectionCheckpointRecord,
) => {
  const entity = transactions.foldkitProjectionCheckpoints[record.id]
  if (entity === undefined) {
    throw new Error(
      'Expected a Foldkit projection checkpoint transaction entity.',
    )
  }
  return entity.update({
    checkpointId: record.checkpointId,
    createdAtMs: record.createdAtMs,
    modelDigest: record.modelDigest,
    modelJson: record.modelJson,
    programId: record.programId,
    programVersion: record.programVersion,
    projectionId: record.projectionId,
    projectionVersion: record.projectionVersion,
    projectorProcessorId: record.projectorProcessorId,
    sessionId: record.sessionId,
    throughAcceptedSequence: record.throughAcceptedSequence,
  })
}

/** Creates the InstantDB transaction for one durable effect request. */
export const makeInstantEffectRequestTransaction = (
  transactions: InstantProgramDatabase['tx'],
  record: InstantEffectRequestRecord,
) => {
  const entity = transactions.foldkitEffectRequests[record.id]
  if (entity === undefined) {
    throw new Error('Expected a Foldkit effect request transaction entity.')
  }
  return entity.update({
    argumentsJson: record.argumentsJson,
    cancellationGeneration: record.cancellationGeneration,
    causalOccurrenceId: record.causalOccurrenceId,
    effectId: record.effectId,
    effectVersion: record.effectVersion,
    idempotencyKey: record.idempotencyKey,
    minimumCapabilityVersion: record.minimumCapabilityVersion,
    originatingProcessorId: record.originatingProcessorId,
    placementJson: record.placementJson,
    programId: record.programId,
    programVersion: record.programVersion,
    requestId: record.requestId,
    requestedAtMs: record.requestedAtMs,
    requiredCapability: record.requiredCapability,
    sessionId: record.sessionId,
  })
}

/** Creates a durable Program store from a host-owned InstantDB client. */
export const makeInstantProgramStore = (
  database: InstantProgramDatabase,
): ProgramStoreService => ({
  appendAcceptedMessageOccurrence: record =>
    Effect.tryPromise({
      try: () =>
        database
          .transact(
            makeInstantAcceptedMessageOccurrenceTransaction(
              database.tx,
              record,
            ),
          )
          .then(toProgramStoreTransactionOutcome),
      catch: cause =>
        new ProgramStoreError({
          cause,
          operation: 'AppendAcceptedMessageOccurrence',
        }),
    }),
  appendEffectRequest: record =>
    Effect.tryPromise({
      try: () =>
        database
          .transact(makeInstantEffectRequestTransaction(database.tx, record))
          .then(toProgramStoreTransactionOutcome),
      catch: cause =>
        new ProgramStoreError({
          cause,
          operation: 'AppendEffectRequest',
        }),
    }),
  appendMessageProposal: record =>
    Effect.tryPromise({
      try: () =>
        database
          .transact(makeInstantMessageProposalTransaction(database.tx, record))
          .then(toProgramStoreTransactionOutcome),
      catch: cause =>
        new ProgramStoreError({
          cause,
          operation: 'AppendMessageProposal',
        }),
    }),
  appendProjectionCheckpoint: record =>
    Effect.tryPromise({
      try: () =>
        database
          .transact(
            makeInstantProjectionCheckpointTransaction(database.tx, record),
          )
          .then(toProgramStoreTransactionOutcome),
      catch: cause =>
        new ProgramStoreError({
          cause,
          operation: 'AppendProjectionCheckpoint',
        }),
    }),
  observeAcceptedMessageOccurrences: sessionId =>
    Stream.callback<
      ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
      ProgramStoreError
    >(queue =>
      Effect.acquireRelease(
        Effect.sync(() =>
          database.subscribeQuery(
            {
              foldkitAcceptedMessageOccurrences: {
                $: {
                  where: { sessionId },
                  order: { acceptedSequence: 'asc' },
                },
              },
            },
            response => {
              if (response.error !== undefined) {
                Queue.failCauseUnsafe(
                  queue,
                  Cause.fail(
                    new ProgramStoreError({
                      cause: response.error,
                      operation: 'ObserveAcceptedMessageOccurrences',
                    }),
                  ),
                )
              } else {
                try {
                  Queue.offerUnsafe(
                    queue,
                    Array.map(
                      response.data.foldkitAcceptedMessageOccurrences,
                      record =>
                        S.decodeUnknownSync(
                          InstantAcceptedMessageOccurrenceRecord,
                        )(record),
                    ),
                  )
                } catch (cause) {
                  Queue.failCauseUnsafe(
                    queue,
                    Cause.fail(
                      new ProgramStoreError({
                        cause,
                        operation: 'ObserveAcceptedMessageOccurrences',
                      }),
                    ),
                  )
                }
              }
            },
          ),
        ),
        unsubscribe => Effect.sync(unsubscribe),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
  observeEffectRequests: sessionId =>
    Stream.callback<
      ReadonlyArray<InstantEffectRequestRecord>,
      ProgramStoreError
    >(queue =>
      Effect.acquireRelease(
        Effect.sync(() =>
          database.subscribeQuery(
            {
              foldkitEffectRequests: {
                $: {
                  where: { sessionId },
                  order: { requestedAtMs: 'asc' },
                },
              },
            },
            response => {
              if (response.error !== undefined) {
                Queue.failCauseUnsafe(
                  queue,
                  Cause.fail(
                    new ProgramStoreError({
                      cause: response.error,
                      operation: 'ObserveEffectRequests',
                    }),
                  ),
                )
              } else {
                try {
                  Queue.offerUnsafe(
                    queue,
                    Array.map(response.data.foldkitEffectRequests, record =>
                      S.decodeUnknownSync(InstantEffectRequestRecord)(record),
                    ),
                  )
                } catch (cause) {
                  Queue.failCauseUnsafe(
                    queue,
                    Cause.fail(
                      new ProgramStoreError({
                        cause,
                        operation: 'ObserveEffectRequests',
                      }),
                    ),
                  )
                }
              }
            },
          ),
        ),
        unsubscribe => Effect.sync(unsubscribe),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
  observeMessageProposals: sessionId =>
    Stream.callback<
      ReadonlyArray<InstantMessageProposalRecord>,
      ProgramStoreError
    >(queue =>
      Effect.acquireRelease(
        Effect.sync(() =>
          database.subscribeQuery(
            {
              foldkitMessageProposals: {
                $: {
                  where: { sessionId },
                  order: { actorSequence: 'asc' },
                },
              },
            },
            response => {
              if (response.error !== undefined) {
                Queue.failCauseUnsafe(
                  queue,
                  Cause.fail(
                    new ProgramStoreError({
                      cause: response.error,
                      operation: 'ObserveMessageProposals',
                    }),
                  ),
                )
              } else {
                try {
                  Queue.offerUnsafe(
                    queue,
                    Array.map(response.data.foldkitMessageProposals, record =>
                      S.decodeUnknownSync(InstantMessageProposalRecord)(record),
                    ),
                  )
                } catch (cause) {
                  Queue.failCauseUnsafe(
                    queue,
                    Cause.fail(
                      new ProgramStoreError({
                        cause,
                        operation: 'ObserveMessageProposals',
                      }),
                    ),
                  )
                }
              }
            },
          ),
        ),
        unsubscribe => Effect.sync(unsubscribe),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
  observeProjectionCheckpoints: sessionId =>
    Stream.callback<
      ReadonlyArray<InstantProjectionCheckpointRecord>,
      ProgramStoreError
    >(queue =>
      Effect.acquireRelease(
        Effect.sync(() =>
          database.subscribeQuery(
            {
              foldkitProjectionCheckpoints: {
                $: {
                  where: { sessionId },
                  order: { throughAcceptedSequence: 'desc' },
                },
              },
            },
            response => {
              if (response.error !== undefined) {
                Queue.failCauseUnsafe(
                  queue,
                  Cause.fail(
                    new ProgramStoreError({
                      cause: response.error,
                      operation: 'ObserveProjectionCheckpoints',
                    }),
                  ),
                )
              } else {
                try {
                  Queue.offerUnsafe(
                    queue,
                    Array.map(
                      response.data.foldkitProjectionCheckpoints,
                      record =>
                        S.decodeUnknownSync(InstantProjectionCheckpointRecord)(
                          record,
                        ),
                    ),
                  )
                } catch (cause) {
                  Queue.failCauseUnsafe(
                    queue,
                    Cause.fail(
                      new ProgramStoreError({
                        cause,
                        operation: 'ObserveProjectionCheckpoints',
                      }),
                    ),
                  )
                }
              }
            },
          ),
        ),
        unsubscribe => Effect.sync(unsubscribe),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
})

/** Provides an InstantDB-backed Program store without taking ownership of the client. */
export const makeInstantProgramStoreLayer = (
  database: InstantProgramDatabase,
): Layer.Layer<ProgramStore> =>
  Layer.succeed(ProgramStore, makeInstantProgramStore(database))
