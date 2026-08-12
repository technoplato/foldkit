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
  ProgramStoreConnectionStatus,
  type ProgramStoreConnectionStatus as ProgramStoreConnectionStatusType,
  ProgramStoreError,
  ProgramStoreProposalMutationRejected,
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
  InstantMessageProposalResolutionRecord,
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

/** Observes the current Instant connection state and all later transitions. */
export const makeInstantConnectionStatusStream = (
  source: Readonly<{
    current: () => ProgramStoreConnectionStatusType
    subscribe: (
      listener: (status: ProgramStoreConnectionStatusType) => void,
    ) => () => void
  }>,
): Stream.Stream<ProgramStoreConnectionStatusType> =>
  Stream.callback(queue =>
    Effect.acquireRelease(
      Effect.sync(() =>
        source.subscribe(status => {
          Queue.offerUnsafe(queue, status)
        }),
      ),
      unsubscribe => Effect.sync(unsubscribe),
    ).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          Queue.offerUnsafe(queue, source.current())
        }),
      ),
      Effect.flatMap(() => Effect.never),
    ),
  )

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
    messageCategory: record.messageCategory,
    messageIdempotencyKey: record.messageIdempotencyKey,
    occurrenceId: record.occurrenceId,
    originDeviceId: record.originDeviceId,
    originatingProcessorId: record.originatingProcessorId,
    payloadJson: record.payloadJson,
    programId: record.programId,
    programVersion: record.programVersion,
    protocolVersion: record.protocolVersion,
    proposalId: record.proposalId,
    proposalKind: record.proposalKind,
    proposedAudience: record.proposedAudience,
    policyGeneration: record.policyGeneration,
    sessionId: record.sessionId,
    subjectId: record.subjectId,
  })
}

/** Creates the strict append for one terminal Message proposal rejection. */
export const makeInstantMessageProposalResolutionTransaction = (
  transactions: InstantProgramDatabase['tx'],
  record: InstantMessageProposalResolutionRecord,
) => {
  const entity = transactions.foldkitMessageProposalResolutions[record.id]
  if (entity === undefined) {
    throw new Error(
      'Expected a Foldkit Message proposal resolution transaction entity.',
    )
  }
  return entity.create({
    actorId: record.actorId,
    actorSequence: record.actorSequence,
    clientId: record.clientId,
    programId: record.programId,
    programVersion: record.programVersion,
    protocolVersion: record.protocolVersion,
    proposalId: record.proposalId,
    rejectedAtMs: record.rejectedAtMs,
    rejectingProcessorId: record.rejectingProcessorId,
    rejectionReason: record.rejectionReason,
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
    messageCategory: record.messageCategory,
    messageIdempotencyKey: record.messageIdempotencyKey,
    occurrenceId: record.occurrenceId,
    originDeviceId: record.originDeviceId,
    originatingProcessorId: record.originatingProcessorId,
    payloadJson: record.payloadJson,
    positionKey: record.positionKey,
    programId: record.programId,
    programVersion: record.programVersion,
    protocolVersion: record.protocolVersion,
    proposedEnvelopeJson: record.proposedEnvelopeJson,
    proposalId: record.proposalId,
    proposalKind: record.proposalKind,
    audience: record.audience,
    policyGeneration: record.policyGeneration,
    sessionPolicy: record.sessionPolicy,
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
    protocolVersion: record.protocolVersion,
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
    causalAudience: record.causalAudience,
    causalMessageCategory: record.causalMessageCategory,
    causalOccurrenceId: record.causalOccurrenceId,
    causalPolicyGeneration: record.causalPolicyGeneration,
    effectId: record.effectId,
    effectVersion: record.effectVersion,
    idempotencyKey: record.idempotencyKey,
    minimumCapabilityVersion: record.minimumCapabilityVersion,
    originatingProcessorId: record.originatingProcessorId,
    placement: record.placement,
    programId: record.programId,
    programVersion: record.programVersion,
    protocolVersion: record.protocolVersion,
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
    protocolVersion: record.protocolVersion,
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
    protocolVersion: record.protocolVersion,
    sessionId: record.sessionId,
    sessionPolicy: record.sessionPolicy,
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
    Effect.try({
      try: () => makeInstantMessageProposalTransaction(database.tx, record),
      catch: cause =>
        new ProgramStoreError({
          cause,
          operation: 'AppendMessageProposal',
        }),
    }).pipe(
      Effect.flatMap(transaction =>
        Effect.tryPromise({
          try: () => database.transact(transaction),
          catch: cause =>
            new ProgramStoreProposalMutationRejected({
              cause,
            }),
        }),
      ),
      Effect.flatMap(result =>
        Effect.try({
          try: () => decodeProgramStoreTransactionOutcome(result),
          catch: cause =>
            new ProgramStoreError({
              cause,
              operation: 'AppendMessageProposal',
            }),
        }),
      ),
    ),
  appendMessageProposalResolution: record =>
    Effect.tryPromise({
      try: () =>
        database
          .transact(
            makeInstantMessageProposalResolutionTransaction(
              database.tx,
              record,
            ),
          )
          .then(decodeProgramStoreTransactionOutcome),
      catch: cause =>
        new ProgramStoreError({
          cause,
          operation: 'AppendMessageProposalResolution',
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
                          messageIdempotencyKey:
                            record.messageIdempotencyKey ?? null,
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
      ),
    ),
  observeConnectionStatus: makeInstantConnectionStatusStream({
    current: () =>
      S.decodeUnknownSync(ProgramStoreConnectionStatus)(
        database._reactor.status,
      ),
    subscribe: listener => database.subscribeConnectionStatus(listener),
  }),
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
      ),
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
      ),
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
                          messageIdempotencyKey:
                            record.messageIdempotencyKey ?? null,
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
      ),
    ),
  observeMessageProposalResolutions: scope =>
    Stream.callback<
      ReadonlyArray<InstantMessageProposalResolutionRecord>,
      ProgramStoreError
    >(queue =>
      Effect.acquireRelease(
        Effect.sync(() =>
          database.subscribeQuery(
            {
              foldkitMessageProposalResolutions: {
                $: {
                  where: {
                    and: [
                      { sessionId: scope.sessionId },
                      { subjectId: scope.subjectId },
                    ],
                  },
                  order: { rejectedAtMs: 'asc' },
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
                      operation: 'ObserveMessageProposalResolutions',
                    }),
                  ),
                )
              } else {
                try {
                  Queue.offerUnsafe(
                    queue,
                    Array.map(
                      response.data.foldkitMessageProposalResolutions,
                      record =>
                        S.decodeUnknownSync(
                          InstantMessageProposalResolutionRecord,
                        )(record),
                    ),
                  )
                } catch (cause) {
                  Queue.failCauseUnsafe(
                    queue,
                    Cause.fail(
                      new ProgramStoreError({
                        cause,
                        operation: 'ObserveMessageProposalResolutions',
                      }),
                    ),
                  )
                }
              }
            },
          ),
        ),
        unsubscribe => Effect.sync(unsubscribe),
      ),
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
      ),
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
      ),
    ),
})

/** Provides an InstantDB-backed Program store without taking ownership of the client. */
export const makeInstantProgramStoreLayer = (
  database: InstantProgramDatabase,
): Layer.Layer<ProgramStore> =>
  Layer.succeed(ProgramStore, makeInstantProgramStore(database))
