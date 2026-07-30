import {
  Array,
  Cause,
  Effect,
  Layer,
  Match as M,
  Option,
  Queue,
  Schema as S,
  Stream,
} from 'effect'

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
  InstantEffectPlacementRecord,
  InstantEffectRequestRecord,
  InstantMessageProposalRecord,
  type InstantProgramDatabase,
  InstantProgramSessionRecord,
  InstantProjectionCheckpointRecord,
} from '../schema/index.js'

const ClientTransactionResult = S.Struct({
  clientId: S.String,
  status: S.Literals(['enqueued', 'synced']),
})

const EventTransactionResult = S.Struct({
  eventId: S.String,
  status: S.Literals(['enqueued', 'synced']),
})

const CompatibleTransactionResult = S.Union([
  ClientTransactionResult,
  EventTransactionResult,
])

/** Decodes both documented and shipped InstantDB transaction correlation fields. */
export const decodeProgramStoreTransactionOutcome = (
  result: unknown,
): ProgramStoreTransactionOutcome => {
  const compatibleResult = S.decodeUnknownSync(CompatibleTransactionResult)(
    result,
  )
  const correlationId =
    'clientId' in compatibleResult
      ? compatibleResult.clientId
      : compatibleResult.eventId
  return M.value(compatibleResult.status).pipe(
    M.when('enqueued', () => enqueuedTransactionOutcome(correlationId)),
    M.when('synced', () => syncedTransactionOutcome(correlationId)),
    M.exhaustive,
  )
}

/** Creates the InstantDB transaction for one durable Message proposal. */
export const makeInstantMessageProposalTransaction = (
  transactions: InstantProgramDatabase['tx'],
  record: InstantMessageProposalRecord,
) => {
  const entity = transactions.foldkitMessageProposals[record.id]
  if (entity === undefined) {
    throw new Error('Expected a Foldkit Message proposal transaction entity.')
  }
  return entity.create({
    actorId: record.actorId,
    actorSequence: record.actorSequence,
    causationOccurrenceId: record.causationOccurrenceId,
    clientId: record.clientId,
    correlationId: record.correlationId,
    createdAtMs: record.createdAtMs,
    effectAssignmentGeneration: record.effectAssignmentGeneration,
    effectCancellationGeneration: record.effectCancellationGeneration,
    effectIdempotencyKey: record.effectIdempotencyKey,
    effectRequestId: record.effectRequestId,
    envelopeJson: record.envelopeJson,
    envelopeVersion: record.envelopeVersion,
    eventId: record.eventId,
    eventVersion: record.eventVersion,
    executorProcessorId: record.executorProcessorId,
    occurrenceId: record.occurrenceId,
    originDeviceId: record.originDeviceId,
    originatingProcessorId: record.originatingProcessorId,
    payloadJson: record.payloadJson,
    programId: record.programId,
    programVersion: record.programVersion,
    proposalId: record.proposalId,
    proposalKind: record.proposalKind,
    sessionId: record.sessionId,
    subjectId: record.subjectId,
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
  return entity.create({
    acceptedAtMs: record.acceptedAtMs,
    acceptedSequence: record.acceptedSequence,
    acceptingProcessorId: record.acceptingProcessorId,
    actorId: record.actorId,
    actorSequence: record.actorSequence,
    causationId: record.causationId,
    clientId: record.clientId,
    correlationId: record.correlationId,
    createdAtMs: record.createdAtMs,
    effectAssignmentGeneration: record.effectAssignmentGeneration,
    effectCancellationGeneration: record.effectCancellationGeneration,
    effectIdempotencyKey: record.effectIdempotencyKey,
    effectRequestId: record.effectRequestId,
    envelopeJson: record.envelopeJson,
    envelopeVersion: record.envelopeVersion,
    eventId: record.eventId,
    eventVersion: record.eventVersion,
    executorProcessorId: record.executorProcessorId,
    occurrenceId: record.occurrenceId,
    originDeviceId: record.originDeviceId,
    originatingProcessorId: record.originatingProcessorId,
    payloadJson: record.payloadJson,
    positionKey: record.positionKey,
    programId: record.programId,
    programVersion: record.programVersion,
    proposedEnvelopeJson: record.proposedEnvelopeJson,
    proposalId: record.proposalId,
    proposalKind: record.proposalKind,
    sessionId: record.sessionId,
    subjectId: record.subjectId,
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
  return entity.create({
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
    subjectId: record.subjectId,
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
  return entity.create({
    causalOccurrenceId: record.causalOccurrenceId,
    effectId: record.effectId,
    effectVersion: record.effectVersion,
    idempotencyKey: record.idempotencyKey,
    minimumCapabilityVersion: record.minimumCapabilityVersion,
    originatingProcessorId: record.originatingProcessorId,
    placement: record.placement,
    programId: record.programId,
    programVersion: record.programVersion,
    publicArguments: record.publicArguments,
    permittedResultEvents: record.permittedResultEvents,
    requestId: record.requestId,
    requestedAtMs: record.requestedAtMs,
    requiredCapabilityIdJson: record.requiredCapabilityIdJson,
    sessionId: record.sessionId,
    subjectId: record.subjectId,
  })
}

/** Creates the strict append for one generation-keyed effect placement. */
export const makeInstantEffectPlacementTransaction = (
  transactions: InstantProgramDatabase['tx'],
  record: InstantEffectPlacementRecord,
) => {
  const entity = transactions.foldkitEffectPlacements[record.id]
  if (entity === undefined) {
    throw new Error('Expected a Foldkit effect placement transaction entity.')
  }
  return entity.create({
    assignedProcessorId: record.assignedProcessorId,
    assignmentGeneration: record.assignmentGeneration,
    cancellationGeneration: record.cancellationGeneration,
    decidedAtMs: record.decidedAtMs,
    placementDecision: record.placementDecision,
    placementStatus: record.placementStatus,
    positionKey: record.positionKey,
    programId: record.programId,
    programVersion: record.programVersion,
    requestId: record.requestId,
    sessionId: record.sessionId,
    subjectId: record.subjectId,
  })
}

/** Creates the InstantDB transaction for one authenticated Program session. */
export const makeInstantProgramSessionTransaction = (
  transactions: InstantProgramDatabase['tx'],
  record: InstantProgramSessionRecord,
) => {
  const entity = transactions.foldkitProgramSessions[record.id]
  if (entity === undefined) {
    throw new Error('Expected a Foldkit Program session transaction entity.')
  }
  return entity.update({
    authorityProcessorId: record.authorityProcessorId,
    createdAtMs: record.createdAtMs,
    isRevoked: record.isRevoked,
    processorRoomId: record.processorRoomId,
    programId: record.programId,
    programVersion: record.programVersion,
    sessionId: record.sessionId,
    subjectId: record.subjectId,
  })
}

/** Optional diagnostics for malformed browser-writable proposal rows. */
export type InstantProgramStoreConfig = Readonly<{
  onMalformedMessageProposal?: (value: unknown) => void
}>

/** Creates a durable Program store from a host-owned InstantDB client. */
export const makeInstantProgramStore = (
  database: InstantProgramDatabase,
  config: InstantProgramStoreConfig = {},
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
          .then(decodeProgramStoreTransactionOutcome),
      catch: cause =>
        new ProgramStoreError({
          cause,
          operation: 'AppendAcceptedMessageOccurrence',
        }),
    }),
  appendEffectPlacement: record =>
    Effect.tryPromise({
      try: () =>
        database
          .transact(makeInstantEffectPlacementTransaction(database.tx, record))
          .then(decodeProgramStoreTransactionOutcome),
      catch: cause =>
        new ProgramStoreError({
          cause,
          operation: 'AppendEffectPlacement',
        }),
    }),
  appendEffectRequest: record =>
    Effect.tryPromise({
      try: () =>
        database
          .transact(makeInstantEffectRequestTransaction(database.tx, record))
          .then(decodeProgramStoreTransactionOutcome),
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
          .then(decodeProgramStoreTransactionOutcome),
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
          .then(decodeProgramStoreTransactionOutcome),
      catch: cause =>
        new ProgramStoreError({
          cause,
          operation: 'AppendProjectionCheckpoint',
        }),
    }),
  appendProgramSession: record =>
    Effect.tryPromise({
      try: () =>
        database
          .transact(makeInstantProgramSessionTransaction(database.tx, record))
          .then(decodeProgramStoreTransactionOutcome),
      catch: cause =>
        new ProgramStoreError({
          cause,
          operation: 'AppendProgramSession',
        }),
    }),
  observeAcceptedMessageOccurrences: scope =>
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
                  where: {
                    and: [
                      { sessionId: scope.sessionId },
                      { subjectId: scope.subjectId },
                    ],
                  },
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
                        )({
                          ...record,
                          causationId: record.causationId ?? null,
                          correlationId: record.correlationId ?? null,
                          effectAssignmentGeneration:
                            record.effectAssignmentGeneration ?? null,
                          effectCancellationGeneration:
                            record.effectCancellationGeneration ?? null,
                          effectIdempotencyKey:
                            record.effectIdempotencyKey ?? null,
                          effectRequestId: record.effectRequestId ?? null,
                          executorProcessorId:
                            record.executorProcessorId ?? null,
                        }),
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
  observeConnectionStatus: Stream.callback(queue =>
    Effect.acquireRelease(
      Effect.sync(() =>
        database.subscribeConnectionStatus(status => {
          Queue.offerUnsafe(queue, status)
        }),
      ),
      unsubscribe => Effect.sync(unsubscribe),
    ).pipe(Effect.flatMap(() => Effect.never)),
  ),
  observeEffectPlacements: scope =>
    Stream.callback<
      ReadonlyArray<InstantEffectPlacementRecord>,
      ProgramStoreError
    >(queue =>
      Effect.acquireRelease(
        Effect.sync(() =>
          database.subscribeQuery(
            {
              foldkitEffectPlacements: {
                $: {
                  where: {
                    and: [
                      { sessionId: scope.sessionId },
                      { subjectId: scope.subjectId },
                    ],
                  },
                  order: { assignmentGeneration: 'asc' },
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
                      operation: 'ObserveEffectPlacements',
                    }),
                  ),
                )
              } else {
                try {
                  Queue.offerUnsafe(
                    queue,
                    Array.map(response.data.foldkitEffectPlacements, record =>
                      S.decodeUnknownSync(InstantEffectPlacementRecord)({
                        ...record,
                        assignedProcessorId: record.assignedProcessorId ?? null,
                      }),
                    ),
                  )
                } catch (cause) {
                  Queue.failCauseUnsafe(
                    queue,
                    Cause.fail(
                      new ProgramStoreError({
                        cause,
                        operation: 'ObserveEffectPlacements',
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
  observeEffectRequests: scope =>
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
                  where: {
                    and: [
                      { sessionId: scope.sessionId },
                      { subjectId: scope.subjectId },
                    ],
                  },
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
  observeMessageProposals: scope =>
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
                  where: {
                    and: [
                      { sessionId: scope.sessionId },
                      { subjectId: scope.subjectId },
                    ],
                  },
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
                  const initialProposals: ReadonlyArray<InstantMessageProposalRecord> =
                    []
                  Queue.offerUnsafe(
                    queue,
                    Array.reduce(
                      response.data.foldkitMessageProposals,
                      initialProposals,
                      (proposals, record) => {
                        const value = {
                          ...record,
                          causationOccurrenceId:
                            record.causationOccurrenceId ?? null,
                          correlationId: record.correlationId ?? null,
                          effectAssignmentGeneration:
                            record.effectAssignmentGeneration ?? null,
                          effectCancellationGeneration:
                            record.effectCancellationGeneration ?? null,
                          effectIdempotencyKey:
                            record.effectIdempotencyKey ?? null,
                          effectRequestId: record.effectRequestId ?? null,
                          executorProcessorId:
                            record.executorProcessorId ?? null,
                        }
                        const maybeProposal = S.decodeUnknownOption(
                          InstantMessageProposalRecord,
                        )(value)
                        if (Option.isSome(maybeProposal)) {
                          return [...proposals, maybeProposal.value]
                        } else {
                          config.onMalformedMessageProposal?.(value)
                          return proposals
                        }
                      },
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
  observeProgramSessions: scope =>
    Stream.callback<
      ReadonlyArray<InstantProgramSessionRecord>,
      ProgramStoreError
    >(queue =>
      Effect.acquireRelease(
        Effect.sync(() =>
          database.subscribeQuery(
            {
              foldkitProgramSessions: {
                $: {
                  where: {
                    and: [
                      { sessionId: scope.sessionId },
                      { subjectId: scope.subjectId },
                    ],
                  },
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
                      operation: 'ObserveProgramSessions',
                    }),
                  ),
                )
              } else {
                try {
                  Queue.offerUnsafe(
                    queue,
                    Array.map(response.data.foldkitProgramSessions, record =>
                      S.decodeUnknownSync(InstantProgramSessionRecord)(record),
                    ),
                  )
                } catch (cause) {
                  Queue.failCauseUnsafe(
                    queue,
                    Cause.fail(
                      new ProgramStoreError({
                        cause,
                        operation: 'ObserveProgramSessions',
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
  observeProjectionCheckpoints: scope =>
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
                  where: {
                    and: [
                      { sessionId: scope.sessionId },
                      { subjectId: scope.subjectId },
                    ],
                  },
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
