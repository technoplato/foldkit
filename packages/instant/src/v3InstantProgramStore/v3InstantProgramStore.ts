import {
  Array,
  Cause,
  Effect,
  Function,
  HashMap,
  HashSet,
  Layer,
  Match as M,
  Option,
  Order,
  Predicate,
  Queue,
  Record as Record_,
  Ref,
  Schema as S,
  SchemaAST,
  Semaphore,
  Stream,
  pipe,
} from 'effect'

import {
  type V3InMemoryProgramStoreSnapshot,
  type V3InMemoryProgramStores,
  emptyV3InMemoryProgramStoreSnapshot,
  makeV3InMemoryProgramStores,
} from '../v3InMemoryProgramStore/index.js'
import {
  V3OriginPolicyStoreScope,
  V3ProgramAuthorityCoordinatorCapability,
  type V3ProgramAuthorityMutationService,
  V3ProgramAuthoritySnapshot,
  V3ProgramAuthorityStore,
  V3ProgramAuthorityStoreCapability,
  type V3ProgramAuthorityStoreService,
  V3ProgramStore,
  V3ProgramStoreAcceptedMessageOccurrenceMismatch,
  V3ProgramStoreAcceptedMessageOccurrenceTransaction,
  type V3ProgramStoreAppendError,
  type V3ProgramStoreConnectionStatus,
  type V3ProgramStoreEntity,
  V3ProgramStoreError,
  V3ProgramStoreIdentityConflict,
  type V3ProgramStoreObservations,
  type V3ProgramStoreOperation,
  V3ProgramStoreScope,
  type V3ProgramStoreServerConfirmedTransactionOutcome,
  type V3ProgramStoreService,
  V3ProgramStoreTerminalConflict,
  type V3ProgramStoreTransactionOutcome,
  type V3ProgramStoreWriteDisposition,
  findV3ProgramStoreAcceptedMessageOccurrenceMismatch,
  makeV3ProgramAuthorityCriticalSectionInvocation,
  v3EnqueuedTransactionOutcome,
  v3ServerConfirmedTransactionOutcome,
} from '../v3ProgramStore/index.js'
import {
  InstantV3AcceptedMessageOccurrenceRecord,
  InstantV3EffectPlacementRecord,
  InstantV3EffectRequestRecord,
  InstantV3MessageProposalRecord,
  InstantV3MessageProposalResolutionRecord,
  InstantV3OriginEnrollmentClaimRecord,
  InstantV3OriginPolicyDecisionRecord,
  type InstantV3ProgramDatabase,
  InstantV3ProgramSessionRecord,
  InstantV3ProjectionCheckpointRecord,
  InstantV3RejectedMessageProposalResolutionRecord,
  stringifyInstantV3CanonicalJson,
} from '../v3Schema/index.js'

type V3InstantProgramWhere = V3ProgramStoreScope

type V3InstantOriginPolicyWhere = V3OriginPolicyStoreScope

type V3InstantEntityQuery<Where, OrderBy extends string = never> = Readonly<{
  $: Readonly<{
    where: Where
  }> &
    ([OrderBy] extends [never]
      ? Readonly<Record<never, never>>
      : Readonly<{ order: Readonly<Record<OrderBy, 'asc' | 'desc'>> }>)
}>

/** A query accepted by the exact protocol-v3 InstantDB schema. */
export type V3InstantProgramQuery =
  | Readonly<{
      foldkitV3AcceptedMessageOccurrences: V3InstantEntityQuery<
        V3InstantProgramWhere,
        'acceptedSequence'
      >
    }>
  | Readonly<{
      foldkitV3EffectPlacements: V3InstantEntityQuery<
        V3InstantProgramWhere,
        'assignmentGeneration'
      >
    }>
  | Readonly<{
      foldkitV3EffectRequests: V3InstantEntityQuery<
        V3InstantProgramWhere,
        'requestedAtMs'
      >
    }>
  | Readonly<{
      foldkitV3MessageProposals: V3InstantEntityQuery<
        V3InstantProgramWhere,
        'actorSequence'
      >
    }>
  | Readonly<{
      foldkitV3MessageProposalResolutions: V3InstantEntityQuery<V3InstantProgramWhere>
    }>
  | Readonly<{
      foldkitV3OriginEnrollmentClaims: V3InstantEntityQuery<V3InstantOriginPolicyWhere>
    }>
  | Readonly<{
      foldkitV3OriginPolicyDecisions: V3InstantEntityQuery<
        V3InstantOriginPolicyWhere,
        'generation'
      >
    }>
  | Readonly<{
      foldkitV3ProgramSessions: V3InstantEntityQuery<
        V3InstantProgramWhere,
        'lifecycleGeneration'
      >
    }>
  | Readonly<{
      foldkitV3ProjectionCheckpoints: V3InstantEntityQuery<
        V3InstantProgramWhere,
        'throughAcceptedSequence'
      >
    }>
  | Readonly<{
      foldkitV3AcceptedMessageOccurrences: V3InstantEntityQuery<
        V3InstantProgramWhere,
        'acceptedSequence'
      >
      foldkitV3MessageProposalResolutions: V3InstantEntityQuery<V3InstantProgramWhere>
    }>

/** The single multi-namespace query available only to a v3 authority. */
export type V3InstantProgramAuthoritySnapshotQuery = Readonly<{
  foldkitV3AcceptedMessageOccurrences: V3InstantEntityQuery<
    V3InstantProgramWhere,
    'acceptedSequence'
  >
  foldkitV3EffectPlacements: V3InstantEntityQuery<
    V3InstantProgramWhere,
    'assignmentGeneration'
  >
  foldkitV3EffectRequests: V3InstantEntityQuery<
    V3InstantProgramWhere,
    'requestedAtMs'
  >
  foldkitV3MessageProposalResolutions: V3InstantEntityQuery<V3InstantProgramWhere>
  foldkitV3MessageProposals: V3InstantEntityQuery<
    V3InstantProgramWhere,
    'actorSequence'
  >
  foldkitV3OriginPolicyDecisions: V3InstantEntityQuery<
    V3InstantOriginPolicyWhere,
    'generation'
  >
  foldkitV3ProgramSessions: V3InstantEntityQuery<
    V3InstantProgramWhere,
    'lifecycleGeneration'
  >
}>

/** One or more exact protocol-v3 InstantDB transaction chunks. */
export type V3InstantProgramTransactionInput = Parameters<
  InstantV3ProgramDatabase['transact']
>[0]

/** The normalized InstantDB surface required by Client observations. */
export type V3InstantProgramObservationDatabase = Readonly<{
  currentConnectionStatus: () => unknown
  subscribeConnectionStatus: (listener: (status: unknown) => void) => () => void
  subscribeQuery: (
    query: V3InstantProgramQuery,
    listener: (response: unknown) => void,
  ) => () => void
}>

/** The normalized InstantDB surface required by an ordinary optimistic Client. */
export type V3InstantProgramClientDatabase =
  V3InstantProgramObservationDatabase &
    Readonly<{
      queryOnce: (query: V3InstantProgramQuery) => Promise<unknown>
      transact: (
        transactions: V3InstantProgramTransactionInput,
      ) => Promise<unknown>
      tx: InstantV3ProgramDatabase['tx']
    }>

/** Explicit evidence required before an Instant database may power an authority. */
export const V3InstantProgramAuthorityDatabaseCapability = S.TaggedStruct(
  'ServerConfirmedInstantV3AuthorityDatabase',
  {
    protocolVersion: S.Literal(3),
    writeIsolation: S.Literal('ExclusiveSerializedWriter'),
  },
)
/** Explicit evidence required before an Instant database may power an authority. */
export type V3InstantProgramAuthorityDatabaseCapability =
  typeof V3InstantProgramAuthorityDatabaseCapability.Type

/**
 * A server-confirmed Instant database with an exclusive serialized authority
 * writer. Instant transactions are atomic, but public InstantDB APIs do not
 * provide compare-and-set. The host must guarantee this write isolation.
 */
export type V3InstantProgramAuthorityDatabase =
  V3InstantProgramObservationDatabase &
    Readonly<{
      authorityCapability: V3InstantProgramAuthorityDatabaseCapability
      query: (
        query: V3InstantProgramQuery | V3InstantProgramAuthoritySnapshotQuery,
      ) => Promise<unknown>
      transact: (
        transactions: V3InstantProgramTransactionInput,
      ) => Promise<unknown>
      tx: InstantV3ProgramDatabase['tx']
    }>

/** Optional diagnostics retained outside the no-error connection Stream. */
export type V3InstantProgramStoreConfig = Readonly<{
  onConnectionDefect?: (cause: unknown) => void
}>

const strictDecodeOptions: SchemaAST.ParseOptions = {
  errors: 'all',
  onExcessProperty: 'error',
}

const InstantConnectionStatus = S.Literals([
  'connecting',
  'opened',
  'authenticated',
  'closed',
  'errored',
])

const decodeConnectionStatus = (
  status: unknown,
): V3ProgramStoreConnectionStatus => {
  const decoded = S.decodeUnknownSync(InstantConnectionStatus)(status)
  if (decoded === 'connecting') {
    return 'Connecting'
  } else if (decoded === 'opened') {
    return 'Opened'
  } else if (decoded === 'authenticated') {
    return 'Authenticated'
  } else if (decoded === 'closed') {
    return 'Closed'
  } else {
    return 'Errored'
  }
}

/** Adapts the exact Instant core database without granting authority methods. */
export const makeV3InstantProgramClientDatabase = (
  database: InstantV3ProgramDatabase,
): V3InstantProgramClientDatabase => {
  const subscribeQuery = (
    query: V3InstantProgramQuery,
    listener: (response: unknown) => void,
  ): (() => void) => {
    if (
      'foldkitV3AcceptedMessageOccurrences' in query &&
      'foldkitV3MessageProposalResolutions' in query
    ) {
      return database.subscribeQuery(query, listener)
    } else if ('foldkitV3AcceptedMessageOccurrences' in query) {
      return database.subscribeQuery(query, listener)
    } else if ('foldkitV3EffectPlacements' in query) {
      return database.subscribeQuery(query, listener)
    } else if ('foldkitV3EffectRequests' in query) {
      return database.subscribeQuery(query, listener)
    } else if ('foldkitV3MessageProposals' in query) {
      return database.subscribeQuery(query, listener)
    } else if ('foldkitV3MessageProposalResolutions' in query) {
      return database.subscribeQuery(query, listener)
    } else if ('foldkitV3OriginEnrollmentClaims' in query) {
      return database.subscribeQuery(query, listener)
    } else if ('foldkitV3OriginPolicyDecisions' in query) {
      return database.subscribeQuery(query, listener)
    } else if ('foldkitV3ProgramSessions' in query) {
      return database.subscribeQuery(query, listener)
    } else {
      return database.subscribeQuery(query, listener)
    }
  }
  const queryOnce = (query: V3InstantProgramQuery): Promise<unknown> => {
    if (
      'foldkitV3AcceptedMessageOccurrences' in query &&
      'foldkitV3MessageProposalResolutions' in query
    ) {
      return database.queryOnce(query)
    } else if ('foldkitV3AcceptedMessageOccurrences' in query) {
      return database.queryOnce(query)
    } else if ('foldkitV3EffectPlacements' in query) {
      return database.queryOnce(query)
    } else if ('foldkitV3EffectRequests' in query) {
      return database.queryOnce(query)
    } else if ('foldkitV3MessageProposals' in query) {
      return database.queryOnce(query)
    } else if ('foldkitV3MessageProposalResolutions' in query) {
      return database.queryOnce(query)
    } else if ('foldkitV3OriginEnrollmentClaims' in query) {
      return database.queryOnce(query)
    } else if ('foldkitV3OriginPolicyDecisions' in query) {
      return database.queryOnce(query)
    } else if ('foldkitV3ProgramSessions' in query) {
      return database.queryOnce(query)
    } else {
      return database.queryOnce(query)
    }
  }
  return {
    currentConnectionStatus: () => database._reactor.status,
    subscribeConnectionStatus: listener =>
      database.subscribeConnectionStatus(listener),
    subscribeQuery,
    queryOnce,
    transact: transactions => database.transact(transactions),
    tx: database.tx,
  }
}

/** Maps documented and shipped Instant Client transaction correlation fields. */
export const decodeV3InstantClientTransactionOutcome = (
  result: unknown,
  disposition: V3ProgramStoreWriteDisposition,
): V3ProgramStoreTransactionOutcome => {
  const ClientTransactionResult = S.Struct({
    clientId: S.String,
    status: S.Literals(['enqueued', 'synced']),
  })
  const EventTransactionResult = S.Struct({
    eventId: S.String,
    status: S.Literals(['enqueued', 'synced']),
  })
  const compatibleResult = S.decodeUnknownSync(
    S.Union([ClientTransactionResult, EventTransactionResult]),
    strictDecodeOptions,
  )(result)
  const correlationId =
    'clientId' in compatibleResult
      ? compatibleResult.clientId
      : compatibleResult.eventId
  return M.value(compatibleResult.status).pipe(
    M.when('enqueued', () =>
      v3EnqueuedTransactionOutcome(correlationId, disposition),
    ),
    M.when('synced', () =>
      v3ServerConfirmedTransactionOutcome(correlationId, disposition),
    ),
    M.exhaustive,
  )
}

const ServerTransactionResult = S.Struct({
  'all-checks-ok?': S.optionalKey(S.Literal(true)),
  'tx-id': S.Union([S.Number, S.String]),
})

/** Decodes the transaction ID returned by a server-confirmed Instant write. */
export const decodeV3InstantServerTransactionOutcome = (
  result: unknown,
  disposition: V3ProgramStoreWriteDisposition,
): V3ProgramStoreServerConfirmedTransactionOutcome => {
  const decoded = S.decodeUnknownSync(
    ServerTransactionResult,
    strictDecodeOptions,
  )(result)
  return v3ServerConfirmedTransactionOutcome(
    decoded['tx-id'].toString(),
    disposition,
  )
}

const programScopeWhere = (scope: V3ProgramStoreScope) => ({
  appSubjectDigest: scope.appSubjectDigest,
  instantAppId: scope.instantAppId,
  programId: scope.programId,
  programVersion: scope.programVersion,
  protocolVersion: scope.protocolVersion,
  sessionEpochId: scope.sessionEpochId,
  sessionId: scope.sessionId,
  subjectId: scope.subjectId,
})

const originPolicyScopeWhere = (scope: V3OriginPolicyStoreScope) => ({
  instantAppId: scope.instantAppId,
  protocolVersion: scope.protocolVersion,
  subjectId: scope.subjectId,
})

/** Builds the full-scope accepted-occurrence live query. */
export const makeV3InstantAcceptedMessageOccurrencesQuery = (
  scope: V3ProgramStoreScope,
): V3InstantProgramQuery => ({
  foldkitV3AcceptedMessageOccurrences: {
    $: {
      order: { acceptedSequence: 'asc' },
      where: programScopeWhere(scope),
    },
  },
})

/** Builds the full-scope effect-placement live query. */
export const makeV3InstantEffectPlacementsQuery = (
  scope: V3ProgramStoreScope,
): V3InstantProgramQuery => ({
  foldkitV3EffectPlacements: {
    $: {
      order: { assignmentGeneration: 'asc' },
      where: programScopeWhere(scope),
    },
  },
})

/** Builds the full-scope effect-request live query. */
export const makeV3InstantEffectRequestsQuery = (
  scope: V3ProgramStoreScope,
): V3InstantProgramQuery => ({
  foldkitV3EffectRequests: {
    $: {
      order: { requestedAtMs: 'asc' },
      where: programScopeWhere(scope),
    },
  },
})

/** Builds the full-scope Message-proposal live query. */
export const makeV3InstantMessageProposalsQuery = (
  scope: V3ProgramStoreScope,
): V3InstantProgramQuery => ({
  foldkitV3MessageProposals: {
    $: {
      order: { actorSequence: 'asc' },
      where: programScopeWhere(scope),
    },
  },
})

/** Builds the full-scope terminal proposal-resolution live query. */
export const makeV3InstantMessageProposalResolutionsQuery = (
  scope: V3ProgramStoreScope,
): V3InstantProgramQuery => ({
  foldkitV3MessageProposalResolutions: {
    $: { where: programScopeWhere(scope) },
  },
})

/** Builds the independent app-subject enrollment-claim live query. */
export const makeV3InstantOriginEnrollmentClaimsQuery = (
  scope: V3OriginPolicyStoreScope,
): V3InstantProgramQuery => ({
  foldkitV3OriginEnrollmentClaims: {
    $: { where: originPolicyScopeWhere(scope) },
  },
})

/** Builds the independent app-subject origin-policy live query. */
export const makeV3InstantOriginPolicyDecisionsQuery = (
  scope: V3OriginPolicyStoreScope,
): V3InstantProgramQuery => ({
  foldkitV3OriginPolicyDecisions: {
    $: {
      order: { generation: 'asc' },
      where: originPolicyScopeWhere(scope),
    },
  },
})

/** Builds the full-scope Program-session lifecycle live query. */
export const makeV3InstantProgramSessionsQuery = (
  scope: V3ProgramStoreScope,
): V3InstantProgramQuery => ({
  foldkitV3ProgramSessions: {
    $: {
      order: { lifecycleGeneration: 'desc' },
      where: programScopeWhere(scope),
    },
  },
})

/** Builds the full-scope projection-checkpoint live query. */
export const makeV3InstantProjectionCheckpointsQuery = (
  scope: V3ProgramStoreScope,
): V3InstantProgramQuery => ({
  foldkitV3ProjectionCheckpoints: {
    $: {
      order: { throughAcceptedSequence: 'desc' },
      where: programScopeWhere(scope),
    },
  },
})

/** Builds one consistent query for both halves of the Accepted atomic pair. */
export const makeV3InstantAcceptedMessageOccurrencePrerequisiteQuery = (
  scope: V3ProgramStoreScope,
): V3InstantProgramQuery => ({
  foldkitV3AcceptedMessageOccurrences: {
    $: {
      order: { acceptedSequence: 'asc' },
      where: programScopeWhere(scope),
    },
  },
  foldkitV3MessageProposalResolutions: {
    $: { where: programScopeWhere(scope) },
  },
})

/** Builds one server query for every prerequisite consumed by an admission. */
export const makeV3InstantProgramAuthoritySnapshotQuery = (
  scope: V3ProgramStoreScope,
): V3InstantProgramAuthoritySnapshotQuery => ({
  foldkitV3AcceptedMessageOccurrences: {
    $: {
      order: { acceptedSequence: 'asc' },
      where: programScopeWhere(scope),
    },
  },
  foldkitV3EffectPlacements: {
    $: {
      order: { assignmentGeneration: 'asc' },
      where: programScopeWhere(scope),
    },
  },
  foldkitV3EffectRequests: {
    $: {
      order: { requestedAtMs: 'asc' },
      where: programScopeWhere(scope),
    },
  },
  foldkitV3MessageProposalResolutions: {
    $: { where: programScopeWhere(scope) },
  },
  foldkitV3MessageProposals: {
    $: {
      order: { actorSequence: 'asc' },
      where: programScopeWhere(scope),
    },
  },
  foldkitV3OriginPolicyDecisions: {
    $: {
      order: { generation: 'asc' },
      where: originPolicyScopeWhere(scope),
    },
  },
  foldkitV3ProgramSessions: {
    $: {
      order: { lifecycleGeneration: 'desc' },
      where: programScopeWhere(scope),
    },
  },
})

const transactionEntity = <Entity>(
  entity: Entity | undefined,
  description: string,
): Entity => {
  if (entity === undefined) {
    throw new Error(`Expected the ${description} transaction entity.`)
  }
  return entity
}

/** Creates the strict Instant append for one Message proposal. */
export const makeV3InstantMessageProposalTransaction = (
  transactions: InstantV3ProgramDatabase['tx'],
  record: InstantV3MessageProposalRecord,
) => {
  const entity = transactionEntity(
    transactions.foldkitV3MessageProposals[record.id],
    'protocol-v3 Message proposal',
  )
  const {
    causationOccurrenceId,
    correlationId,
    id: _id,
    ...requiredFields
  } = record
  return entity.create({
    ...requiredFields,
    ...(causationOccurrenceId === null ? {} : { causationOccurrenceId }),
    ...(correlationId === null ? {} : { correlationId }),
  })
}

/** Creates the strict Instant append for one origin enrollment claim. */
export const makeV3InstantOriginEnrollmentClaimTransaction = (
  transactions: InstantV3ProgramDatabase['tx'],
  record: InstantV3OriginEnrollmentClaimRecord,
) => {
  const entity = transactionEntity(
    transactions.foldkitV3OriginEnrollmentClaims[record.id],
    'protocol-v3 origin enrollment claim',
  )
  const { id: _id, ...fields } = record
  return entity.create(fields)
}

/** Creates the strict Instant append for one terminal proposal resolution. */
export const makeV3InstantMessageProposalResolutionTransaction = (
  transactions: InstantV3ProgramDatabase['tx'],
  record: InstantV3MessageProposalResolutionRecord,
) => {
  const entity = transactionEntity(
    transactions.foldkitV3MessageProposalResolutions[record.id],
    'protocol-v3 Message proposal resolution',
  )
  const { id: _id, ...fields } = record
  return entity.create(fields)
}

/** Creates the strict Instant append for one accepted Message occurrence. */
export const makeV3InstantAcceptedMessageOccurrenceTransaction = (
  transactions: InstantV3ProgramDatabase['tx'],
  record: InstantV3AcceptedMessageOccurrenceRecord,
) => {
  const entity = transactionEntity(
    transactions.foldkitV3AcceptedMessageOccurrences[record.id],
    'protocol-v3 accepted Message occurrence',
  )
  const { causationId, correlationId, id: _id, ...requiredFields } = record
  return entity.create({
    ...requiredFields,
    ...(causationId === null ? {} : { causationId }),
    ...(correlationId === null ? {} : { correlationId }),
  })
}

/** Creates the strict Instant append for one effect request. */
export const makeV3InstantEffectRequestTransaction = (
  transactions: InstantV3ProgramDatabase['tx'],
  record: InstantV3EffectRequestRecord,
) => {
  const entity = transactionEntity(
    transactions.foldkitV3EffectRequests[record.id],
    'protocol-v3 effect request',
  )
  const { id: _id, ...fields } = record
  return entity.create(fields)
}

/** Creates the strict Instant append for one effect-placement generation. */
export const makeV3InstantEffectPlacementTransaction = (
  transactions: InstantV3ProgramDatabase['tx'],
  record: InstantV3EffectPlacementRecord,
) => {
  const entity = transactionEntity(
    transactions.foldkitV3EffectPlacements[record.id],
    'protocol-v3 effect placement',
  )
  const { assignedProcessorId, id: _id, ...requiredFields } = record
  return entity.create({
    ...requiredFields,
    ...(assignedProcessorId === null ? {} : { assignedProcessorId }),
  })
}

/** Creates the strict Instant append for one origin-policy decision. */
export const makeV3InstantOriginPolicyDecisionTransaction = (
  transactions: InstantV3ProgramDatabase['tx'],
  record: InstantV3OriginPolicyDecisionRecord,
) => {
  const entity = transactionEntity(
    transactions.foldkitV3OriginPolicyDecisions[record.id],
    'protocol-v3 origin-policy decision',
  )
  const { id: _id, previousDecisionId, ...requiredFields } = record
  return entity.create({
    ...requiredFields,
    ...(previousDecisionId === null ? {} : { previousDecisionId }),
  })
}

/** Creates the strict Instant append for one Program-session generation. */
export const makeV3InstantProgramSessionTransaction = (
  transactions: InstantV3ProgramDatabase['tx'],
  record: InstantV3ProgramSessionRecord,
) => {
  const entity = transactionEntity(
    transactions.foldkitV3ProgramSessions[record.id],
    'protocol-v3 Program session',
  )
  const { id: _id, previousLifecyclePositionKey, ...requiredFields } = record
  return entity.create({
    ...requiredFields,
    ...(previousLifecyclePositionKey === null
      ? {}
      : { previousLifecyclePositionKey }),
  })
}

/** Creates the strict Instant append for one projection checkpoint. */
export const makeV3InstantProjectionCheckpointTransaction = (
  transactions: InstantV3ProgramDatabase['tx'],
  record: InstantV3ProjectionCheckpointRecord,
) => {
  const entity = transactionEntity(
    transactions.foldkitV3ProjectionCheckpoints[record.id],
    'protocol-v3 projection checkpoint',
  )
  const { id: _id, ...fields } = record
  return entity.create(fields)
}

/** Creates both halves of one Accepted write for a single Instant transaction. */
export const makeV3InstantAcceptedMessageOccurrenceTransactions = (
  transactions: InstantV3ProgramDatabase['tx'],
  transaction: V3ProgramStoreAcceptedMessageOccurrenceTransaction,
): V3InstantProgramTransactionInput => [
  makeV3InstantMessageProposalResolutionTransaction(
    transactions,
    transaction.resolution,
  ),
  makeV3InstantAcceptedMessageOccurrenceTransaction(
    transactions,
    transaction.occurrence,
  ),
]

const normalizeMessageProposal = (value: unknown): unknown =>
  Predicate.isObject(value)
    ? {
        ...value,
        causationOccurrenceId: value['causationOccurrenceId'] ?? null,
        correlationId: value['correlationId'] ?? null,
      }
    : value

const normalizeAcceptedMessageOccurrence = (value: unknown): unknown =>
  Predicate.isObject(value)
    ? {
        ...value,
        causationId: value['causationId'] ?? null,
        correlationId: value['correlationId'] ?? null,
      }
    : value

const normalizeEffectPlacement = (value: unknown): unknown =>
  Predicate.isObject(value)
    ? {
        ...value,
        assignedProcessorId: value['assignedProcessorId'] ?? null,
      }
    : value

const normalizeOriginPolicyDecision = (value: unknown): unknown =>
  Predicate.isObject(value)
    ? {
        ...value,
        previousDecisionId: value['previousDecisionId'] ?? null,
      }
    : value

const normalizeProgramSession = (value: unknown): unknown =>
  Predicate.isObject(value)
    ? {
        ...value,
        previousLifecyclePositionKey:
          value['previousLifecyclePositionKey'] ?? null,
      }
    : value

const identityNormalization = (value: unknown): unknown => value

const acceptedMessageOccurrenceOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (record: InstantV3AcceptedMessageOccurrenceRecord) =>
      record.acceptedSequence,
  ),
  Order.mapInput(
    Order.String,
    (record: InstantV3AcceptedMessageOccurrenceRecord) => record.occurrenceId,
  ),
)

const effectRequestOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (record: InstantV3EffectRequestRecord) => record.requestedAtMs,
  ),
  Order.mapInput(
    Order.String,
    (record: InstantV3EffectRequestRecord) => record.requestId,
  ),
)

const effectPlacementOrder = Order.combineAll([
  Order.mapInput(
    Order.Number,
    (record: InstantV3EffectPlacementRecord) => record.assignmentGeneration,
  ),
  Order.mapInput(
    Order.Number,
    (record: InstantV3EffectPlacementRecord) => record.cancellationGeneration,
  ),
  Order.mapInput(
    Order.String,
    (record: InstantV3EffectPlacementRecord) => record.positionKey,
  ),
])

const messageProposalOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (record: InstantV3MessageProposalRecord) => record.actorSequence,
  ),
  Order.mapInput(
    Order.String,
    (record: InstantV3MessageProposalRecord) => record.proposalId,
  ),
)

const messageProposalResolutionTimestamp = (
  record: InstantV3MessageProposalResolutionRecord,
): number =>
  record.resolutionState === 'Accepted'
    ? record.acceptedAtMs
    : record.rejectedAtMs

const messageProposalResolutionOrder = Order.combineAll([
  Order.mapInput(Order.Number, messageProposalResolutionTimestamp),
  Order.mapInput(
    Order.String,
    (record: InstantV3MessageProposalResolutionRecord) => record.proposalId,
  ),
  Order.mapInput(
    Order.String,
    (record: InstantV3MessageProposalResolutionRecord) =>
      record.resolutionState,
  ),
  Order.mapInput(
    Order.String,
    (record: InstantV3MessageProposalResolutionRecord) => record.id,
  ),
])

const identifiedRecordOrder = Order.mapInput(
  Order.String,
  (record: Readonly<{ id: string }>) => record.id,
)

const originPolicyDecisionOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (record: InstantV3OriginPolicyDecisionRecord) => record.generation,
  ),
  Order.mapInput(
    Order.String,
    (record: InstantV3OriginPolicyDecisionRecord) => record.originPolicyId,
  ),
)

const programSessionObservationOrder = Order.combine(
  Order.mapInput(
    Order.flip(Order.Number),
    (record: InstantV3ProgramSessionRecord) => record.lifecycleGeneration,
  ),
  Order.mapInput(
    Order.String,
    (record: InstantV3ProgramSessionRecord) => record.lifecyclePositionKey,
  ),
)

const projectionCheckpointOrder = Order.combine(
  Order.mapInput(
    Order.flip(Order.Number),
    (record: InstantV3ProjectionCheckpointRecord) =>
      record.throughAcceptedSequence,
  ),
  Order.mapInput(
    Order.String,
    (record: InstantV3ProjectionCheckpointRecord) => record.checkpointId,
  ),
)

const responseData = (response: unknown): unknown => {
  if (!Predicate.isObject(response)) {
    throw new Error('Expected an InstantDB query response object.')
  }
  const maybeError = Record_.get(response, 'error')
  if (Option.isSome(maybeError) && maybeError.value !== undefined) {
    throw maybeError.value
  }
  const maybeType = Record_.get(response, 'type')
  if (Option.isSome(maybeType) && maybeType.value === 'error') {
    throw Option.getOrElse(
      maybeError,
      () => new Error('InstantDB reported a query error.'),
    )
  }
  const maybeData = Record_.get(response, 'data')
  return Option.isSome(maybeData) ? maybeData.value : response
}

const namespaceRows = (response: unknown, namespace: string) => {
  const data = responseData(response)
  if (!Predicate.isObject(data)) {
    throw new Error('Expected InstantDB query data to be an object.')
  }
  const maybeRows = Record_.get(data, namespace)
  if (Option.isNone(maybeRows)) {
    throw new Error(`InstantDB query data omitted ${namespace}.`)
  }
  return S.decodeUnknownSync(
    S.Array(S.Unknown),
    strictDecodeOptions,
  )(maybeRows.value)
}

const strictRowsDecoder =
  <A, I>(
    schema: S.Codec<A, I, never>,
    normalize: (value: unknown) => unknown,
  ) =>
  (response: unknown, namespace: string): ReadonlyArray<A> =>
    S.decodeUnknownSync(
      S.Array(schema),
      strictDecodeOptions,
    )(Array.map(namespaceRows(response, namespace), normalize))

const decodeAcceptedMessageOccurrences = strictRowsDecoder(
  InstantV3AcceptedMessageOccurrenceRecord,
  normalizeAcceptedMessageOccurrence,
)
const decodeEffectPlacements = strictRowsDecoder(
  InstantV3EffectPlacementRecord,
  normalizeEffectPlacement,
)
const decodeEffectRequests = strictRowsDecoder(
  InstantV3EffectRequestRecord,
  identityNormalization,
)
const decodeMessageProposals = strictRowsDecoder(
  InstantV3MessageProposalRecord,
  normalizeMessageProposal,
)
const decodeMessageProposalResolutions = strictRowsDecoder(
  InstantV3MessageProposalResolutionRecord,
  identityNormalization,
)
const decodeOriginEnrollmentClaims = strictRowsDecoder(
  InstantV3OriginEnrollmentClaimRecord,
  identityNormalization,
)
const decodeOriginPolicyDecisions = strictRowsDecoder(
  InstantV3OriginPolicyDecisionRecord,
  normalizeOriginPolicyDecision,
)
const decodeProgramSessions = strictRowsDecoder(
  InstantV3ProgramSessionRecord,
  normalizeProgramSession,
)
const decodeProjectionCheckpoints = strictRowsDecoder(
  InstantV3ProjectionCheckpointRecord,
  identityNormalization,
)

type V3ObservationSpec<Record> = Readonly<{
  decode: (response: unknown, namespace: string) => ReadonlyArray<Record>
  equivalence: (
    left: ReadonlyArray<Record>,
    right: ReadonlyArray<Record>,
  ) => boolean
  namespace: string
  operation: V3ProgramStoreOperation
  order: Order.Order<Record>
  query: V3InstantProgramQuery
}>

const makeV3InstantObservationStream = <Record>(
  database: V3InstantProgramObservationDatabase,
  spec: V3ObservationSpec<Record>,
): Stream.Stream<ReadonlyArray<Record>, V3ProgramStoreError> =>
  Stream.callback<ReadonlyArray<Record>, V3ProgramStoreError>(
    queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          try {
            return database.subscribeQuery(spec.query, response => {
              try {
                Queue.offerUnsafe(
                  queue,
                  pipe(
                    spec.decode(response, spec.namespace),
                    Array.sort(spec.order),
                  ),
                )
              } catch (cause) {
                Queue.failCauseUnsafe(
                  queue,
                  Cause.fail(storeError(cause, spec.operation)),
                )
              }
            })
          } catch (cause) {
            Queue.failCauseUnsafe(
              queue,
              Cause.fail(storeError(cause, spec.operation)),
            )
            return Function.constVoid
          }
        }),
        unsubscribe => Effect.sync(unsubscribe),
      ),
    { bufferSize: 1, strategy: 'sliding' },
  ).pipe(Stream.changesWith(spec.equivalence))

/** Observes current and later Instant connection states with scoped disposal. */
export const makeV3InstantConnectionStatusStream = (
  database: V3InstantProgramObservationDatabase,
  config: V3InstantProgramStoreConfig = {},
): V3ProgramStoreObservations['observeConnectionStatus'] =>
  Stream.callback<V3ProgramStoreConnectionStatus>(
    queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const reportErrored = (cause: unknown) => {
            try {
              config.onConnectionDefect?.(cause)
            } finally {
              Queue.offerUnsafe(queue, 'Errored')
            }
          }
          const emit = (status: unknown) => {
            try {
              Queue.offerUnsafe(queue, decodeConnectionStatus(status))
            } catch (cause) {
              reportErrored(cause)
            }
          }
          let unsubscribe = Function.constVoid
          try {
            unsubscribe = database.subscribeConnectionStatus(emit)
          } catch (cause) {
            reportErrored(cause)
            return unsubscribe
          }
          try {
            emit(database.currentConnectionStatus())
          } catch (cause) {
            reportErrored(cause)
          }
          return unsubscribe
        }),
        unsubscribe => Effect.sync(unsubscribe),
      ),
    { bufferSize: 1, strategy: 'sliding' },
  ).pipe(Stream.changes)

const makeV3InstantObservations = (
  database: V3InstantProgramObservationDatabase,
  config: V3InstantProgramStoreConfig,
): V3ProgramStoreObservations => ({
  observeAcceptedMessageOccurrences: scope =>
    makeV3InstantObservationStream(database, {
      decode: decodeAcceptedMessageOccurrences,
      equivalence: S.toEquivalence(
        S.Array(InstantV3AcceptedMessageOccurrenceRecord),
      ),
      namespace: 'foldkitV3AcceptedMessageOccurrences',
      operation: 'ObserveAcceptedMessageOccurrences',
      order: acceptedMessageOccurrenceOrder,
      query: makeV3InstantAcceptedMessageOccurrencesQuery(scope),
    }),
  observeConnectionStatus: makeV3InstantConnectionStatusStream(
    database,
    config,
  ),
  observeEffectPlacements: scope =>
    makeV3InstantObservationStream(database, {
      decode: decodeEffectPlacements,
      equivalence: S.toEquivalence(S.Array(InstantV3EffectPlacementRecord)),
      namespace: 'foldkitV3EffectPlacements',
      operation: 'ObserveEffectPlacements',
      order: effectPlacementOrder,
      query: makeV3InstantEffectPlacementsQuery(scope),
    }),
  observeEffectRequests: scope =>
    makeV3InstantObservationStream(database, {
      decode: decodeEffectRequests,
      equivalence: S.toEquivalence(S.Array(InstantV3EffectRequestRecord)),
      namespace: 'foldkitV3EffectRequests',
      operation: 'ObserveEffectRequests',
      order: effectRequestOrder,
      query: makeV3InstantEffectRequestsQuery(scope),
    }),
  observeMessageProposals: scope =>
    makeV3InstantObservationStream(database, {
      decode: decodeMessageProposals,
      equivalence: S.toEquivalence(S.Array(InstantV3MessageProposalRecord)),
      namespace: 'foldkitV3MessageProposals',
      operation: 'ObserveMessageProposals',
      order: messageProposalOrder,
      query: makeV3InstantMessageProposalsQuery(scope),
    }),
  observeMessageProposalResolutions: scope =>
    makeV3InstantObservationStream(database, {
      decode: decodeMessageProposalResolutions,
      equivalence: S.toEquivalence(
        S.Array(InstantV3MessageProposalResolutionRecord),
      ),
      namespace: 'foldkitV3MessageProposalResolutions',
      operation: 'ObserveMessageProposalResolutions',
      order: messageProposalResolutionOrder,
      query: makeV3InstantMessageProposalResolutionsQuery(scope),
    }),
  observeOriginEnrollmentClaims: scope =>
    makeV3InstantObservationStream(database, {
      decode: decodeOriginEnrollmentClaims,
      equivalence: S.toEquivalence(
        S.Array(InstantV3OriginEnrollmentClaimRecord),
      ),
      namespace: 'foldkitV3OriginEnrollmentClaims',
      operation: 'ObserveOriginEnrollmentClaims',
      order: identifiedRecordOrder,
      query: makeV3InstantOriginEnrollmentClaimsQuery(scope),
    }),
  observeOriginPolicyDecisions: scope =>
    makeV3InstantObservationStream(database, {
      decode: decodeOriginPolicyDecisions,
      equivalence: S.toEquivalence(
        S.Array(InstantV3OriginPolicyDecisionRecord),
      ),
      namespace: 'foldkitV3OriginPolicyDecisions',
      operation: 'ObserveOriginPolicyDecisions',
      order: originPolicyDecisionOrder,
      query: makeV3InstantOriginPolicyDecisionsQuery(scope),
    }),
  observeProgramSessions: scope =>
    makeV3InstantObservationStream(database, {
      decode: decodeProgramSessions,
      equivalence: S.toEquivalence(S.Array(InstantV3ProgramSessionRecord)),
      namespace: 'foldkitV3ProgramSessions',
      operation: 'ObserveProgramSessions',
      order: programSessionObservationOrder,
      query: makeV3InstantProgramSessionsQuery(scope),
    }),
  observeProjectionCheckpoints: scope =>
    makeV3InstantObservationStream(database, {
      decode: decodeProjectionCheckpoints,
      equivalence: S.toEquivalence(
        S.Array(InstantV3ProjectionCheckpointRecord),
      ),
      namespace: 'foldkitV3ProjectionCheckpoints',
      operation: 'ObserveProjectionCheckpoints',
      order: projectionCheckpointOrder,
      query: makeV3InstantProjectionCheckpointsQuery(scope),
    }),
})

type V3ClientCachedRecord<Record> = Readonly<{
  outcome: V3ProgramStoreTransactionOutcome
  record: Record
}>

type V3ClientRecordIndex<Record extends Readonly<{ id: string }>> = Readonly<{
  byId: HashMap.HashMap<string, V3ClientCachedRecord<Record>>
  identityOwners: HashMap.HashMap<string, string>
}>

type V3InstantClientCache = Readonly<{
  messageProposals: V3ClientRecordIndex<InstantV3MessageProposalRecord>
  messageProposalHydratedScopes: HashSet.HashSet<string>
  originEnrollmentClaims: V3ClientRecordIndex<InstantV3OriginEnrollmentClaimRecord>
  originEnrollmentClaimHydratedScopes: HashSet.HashSet<string>
}>

const emptyV3ClientRecordIndex = <
  Record extends Readonly<{ id: string }>,
>(): V3ClientRecordIndex<Record> => ({
  byId: HashMap.empty(),
  identityOwners: HashMap.empty(),
})

const emptyV3InstantClientCache: V3InstantClientCache = {
  messageProposals: emptyV3ClientRecordIndex(),
  messageProposalHydratedScopes: HashSet.empty(),
  originEnrollmentClaims: emptyV3ClientRecordIndex(),
  originEnrollmentClaimHydratedScopes: HashSet.empty(),
}

const indexedIdentityKey = (kind: string, key: string): string =>
  stringifyInstantV3CanonicalJson([kind, key])

const messageProposalIdentityKeys = (
  proposal: InstantV3MessageProposalRecord,
): ReadonlyArray<string> => {
  const shared = [
    indexedIdentityKey('ProposalPositionKey', proposal.proposalPositionKey),
    indexedIdentityKey('OccurrencePositionKey', proposal.occurrencePositionKey),
    indexedIdentityKey(
      'ActorSequencePositionKey',
      proposal.actorSequencePositionKey,
    ),
  ]
  if (proposal.proposalKind === 'OrdinaryMessage') {
    return [
      ...shared,
      indexedIdentityKey(
        'MessageIdempotencyPositionKey',
        proposal.messageIdempotencyPositionKey,
      ),
    ]
  } else {
    return [
      ...shared,
      indexedIdentityKey(
        'EffectIdempotencyPositionKey',
        proposal.effectIdempotencyPositionKey,
      ),
      indexedIdentityKey(
        'EffectRequestResultPositionKey',
        proposal.effectRequestResultPositionKey,
      ),
    ]
  }
}

const originEnrollmentClaimIdentityKeys = (
  claim: InstantV3OriginEnrollmentClaimRecord,
): ReadonlyArray<string> => [
  indexedIdentityKey(
    'EnrollmentClaimPositionKey',
    claim.enrollmentClaimPositionKey,
  ),
]

const acceptedMessageOccurrenceIdentityKeys = (
  occurrence: typeof InstantV3AcceptedMessageOccurrenceRecord.Type,
): ReadonlyArray<string> => {
  const shared = [
    indexedIdentityKey(
      'AcceptedSequencePositionKey',
      occurrence.acceptedSequencePositionKey,
    ),
    indexedIdentityKey(
      'OccurrencePositionKey',
      occurrence.occurrencePositionKey,
    ),
    indexedIdentityKey('ProposalPositionKey', occurrence.proposalPositionKey),
    indexedIdentityKey(
      'ActorSequencePositionKey',
      occurrence.actorSequencePositionKey,
    ),
  ]
  if (occurrence.proposalKind === 'OrdinaryMessage') {
    return [
      ...shared,
      indexedIdentityKey(
        'MessageIdempotencyPositionKey',
        occurrence.messageIdempotencyPositionKey,
      ),
    ]
  } else {
    return [
      ...shared,
      indexedIdentityKey(
        'EffectIdempotencyPositionKey',
        occurrence.effectIdempotencyPositionKey,
      ),
      indexedIdentityKey(
        'EffectRequestResultPositionKey',
        occurrence.effectRequestResultPositionKey,
      ),
    ]
  }
}

const messageProposalResolutionIdentityKeys = (
  resolution: typeof InstantV3MessageProposalResolutionRecord.Type,
): ReadonlyArray<string> => [
  indexedIdentityKey(
    'ProposalTerminalPositionKey',
    resolution.proposalTerminalPositionKey,
  ),
  ...(resolution.resolutionState === 'Accepted'
    ? [
        indexedIdentityKey(
          'AcceptedMessageOccurrenceId',
          resolution.acceptedMessageOccurrenceId,
        ),
        indexedIdentityKey(
          'AcceptedMessageOccurrencePositionKey',
          resolution.acceptedMessageOccurrencePositionKey,
        ),
      ]
    : []),
]

const validateIndexedClientAppend = <Record extends Readonly<{ id: string }>>(
  index: V3ClientRecordIndex<Record>,
  record: Record,
  entity: V3ProgramStoreEntity,
  equivalence: (left: Record, right: Record) => boolean,
  identityKeys: (record: Record) => ReadonlyArray<string>,
): Effect.Effect<
  Option.Option<V3ClientCachedRecord<Record>>,
  V3ProgramStoreIdentityConflict
> => {
  const maybeCached = HashMap.get(index.byId, record.id)
  if (Option.isSome(maybeCached)) {
    return equivalence(maybeCached.value.record, record)
      ? Effect.succeed(maybeCached)
      : Effect.fail(
          new V3ProgramStoreIdentityConflict({ entity, id: record.id }),
        )
  }
  const maybeIdentityOwner = Array.findFirst(identityKeys(record), key =>
    HashMap.has(index.identityOwners, key),
  )
  if (Option.isSome(maybeIdentityOwner)) {
    return Effect.fail(
      new V3ProgramStoreIdentityConflict({ entity, id: record.id }),
    )
  } else {
    return Effect.succeed(Option.none())
  }
}

const addIndexedClientRecord = <Record extends Readonly<{ id: string }>>(
  index: V3ClientRecordIndex<Record>,
  cached: V3ClientCachedRecord<Record>,
  identityKeys: (record: Record) => ReadonlyArray<string>,
): V3ClientRecordIndex<Record> => {
  let identityOwners = index.identityOwners
  for (const key of identityKeys(cached.record)) {
    identityOwners = HashMap.set(identityOwners, key, cached.record.id)
  }
  return {
    byId: HashMap.set(index.byId, cached.record.id, cached),
    identityOwners,
  }
}

const programScopeFor = (
  record: Readonly<{
    appSubjectDigest: string
    instantAppId: string
    programId: string
    programVersion: number
    protocolVersion: 3
    sessionEpochId: string
    sessionId: string
    subjectId: string
  }>,
): V3ProgramStoreScope =>
  V3ProgramStoreScope.make({
    appSubjectDigest: record.appSubjectDigest,
    instantAppId: record.instantAppId,
    programId: record.programId,
    programVersion: record.programVersion,
    protocolVersion: record.protocolVersion,
    sessionEpochId: record.sessionEpochId,
    sessionId: record.sessionId,
    subjectId: record.subjectId,
  })

const originPolicyScopeFor = (
  record: Readonly<{
    instantAppId: string
    protocolVersion: 3
    subjectId: string
  }>,
): V3OriginPolicyStoreScope =>
  V3OriginPolicyStoreScope.make({
    instantAppId: record.instantAppId,
    protocolVersion: record.protocolVersion,
    subjectId: record.subjectId,
  })

const programScopeHydrationKey = (scope: V3ProgramStoreScope): string =>
  stringifyInstantV3CanonicalJson([
    scope.appSubjectDigest,
    scope.instantAppId,
    scope.programId,
    scope.programVersion,
    scope.protocolVersion,
    scope.sessionEpochId,
    scope.sessionId,
    scope.subjectId,
  ])

const originPolicyScopeHydrationKey = (
  scope: V3OriginPolicyStoreScope,
): string =>
  stringifyInstantV3CanonicalJson([
    scope.instantAppId,
    scope.protocolVersion,
    scope.subjectId,
  ])

const snapshotWith = (
  fields: Partial<V3InMemoryProgramStoreSnapshot>,
): V3InMemoryProgramStoreSnapshot => ({
  ...emptyV3InMemoryProgramStoreSnapshot,
  ...fields,
})

const storeError = (
  cause: unknown,
  operation: V3ProgramStoreOperation,
): V3ProgramStoreError => new V3ProgramStoreError({ cause, operation })

const decodeRecord = <Record, Encoded>(
  schema: S.Codec<Record, Encoded, never>,
  value: unknown,
  operation: V3ProgramStoreOperation,
): Effect.Effect<Record, V3ProgramStoreError> =>
  Effect.try({
    try: () => S.decodeUnknownSync(schema, strictDecodeOptions)(value),
    catch: cause => storeError(cause, operation),
  })

const createTransaction = <Transaction>(
  operation: V3ProgramStoreOperation,
  create: () => Transaction,
): Effect.Effect<Transaction, V3ProgramStoreError> =>
  Effect.try({
    try: create,
    catch: cause => storeError(cause, operation),
  })

const transactClient = (
  database: V3InstantProgramClientDatabase,
  operation: V3ProgramStoreOperation,
  transactions: V3InstantProgramTransactionInput,
  disposition: V3ProgramStoreWriteDisposition,
): Effect.Effect<V3ProgramStoreTransactionOutcome, V3ProgramStoreError> =>
  Effect.tryPromise({
    try: () => database.transact(transactions),
    catch: cause => storeError(cause, operation),
  }).pipe(
    Effect.flatMap(result =>
      Effect.try({
        try: () => decodeV3InstantClientTransactionOutcome(result, disposition),
        catch: cause => storeError(cause, operation),
      }),
    ),
  )

const transactAuthority = (
  database: V3InstantProgramAuthorityDatabase,
  operation: V3ProgramStoreOperation,
  transactions: V3InstantProgramTransactionInput,
  disposition: V3ProgramStoreWriteDisposition,
): Effect.Effect<
  V3ProgramStoreServerConfirmedTransactionOutcome,
  V3ProgramStoreError
> =>
  Effect.tryPromise({
    try: () => database.transact(transactions),
    catch: cause => storeError(cause, operation),
  }).pipe(
    Effect.flatMap(result =>
      Effect.try({
        try: () => decodeV3InstantServerTransactionOutcome(result, disposition),
        catch: cause => storeError(cause, operation),
      }),
    ),
  )

const queryAuthorityRows = <Record>(
  database: V3InstantProgramAuthorityDatabase,
  operation: V3ProgramStoreOperation,
  query: V3InstantProgramQuery,
  namespace: string,
  decode: (response: unknown, namespace: string) => ReadonlyArray<Record>,
): Effect.Effect<ReadonlyArray<Record>, V3ProgramStoreError> =>
  Effect.tryPromise({
    try: () => database.query(query),
    catch: cause => storeError(cause, operation),
  }).pipe(
    Effect.flatMap(response =>
      Effect.try({
        try: () => decode(response, namespace),
        catch: cause => storeError(cause, operation),
      }),
    ),
  )

const queryClientRows = <Record>(
  database: V3InstantProgramClientDatabase,
  operation: V3ProgramStoreOperation,
  query: V3InstantProgramQuery,
  namespace: string,
  decode: (response: unknown, namespace: string) => ReadonlyArray<Record>,
): Effect.Effect<ReadonlyArray<Record>, V3ProgramStoreError> =>
  Effect.tryPromise({
    try: () => database.queryOnce(query),
    catch: cause => storeError(cause, operation),
  }).pipe(
    Effect.flatMap(response =>
      Effect.try({
        try: () => decode(response, namespace),
        catch: cause => storeError(cause, operation),
      }),
    ),
  )

const readClientConnectionStatus = (
  database: V3InstantProgramClientDatabase,
  operation: V3ProgramStoreOperation,
): Effect.Effect<V3ProgramStoreConnectionStatus, V3ProgramStoreError> =>
  Effect.try({
    try: () => decodeConnectionStatus(database.currentConnectionStatus()),
    catch: cause => storeError(cause, operation),
  })

const withIdempotentDisposition = (
  outcome: V3ProgramStoreTransactionOutcome,
): V3ProgramStoreTransactionOutcome => {
  if (outcome._tag === 'Enqueued') {
    return v3EnqueuedTransactionOutcome(outcome.clientId, 'Idempotent')
  } else {
    return v3ServerConfirmedTransactionOutcome(
      outcome.serverTransactionId,
      'Idempotent',
    )
  }
}

const encodeMessageProposal = S.encodeSync(
  S.fromJsonString(InstantV3MessageProposalRecord),
)
const encodeOriginEnrollmentClaim = S.encodeSync(
  S.fromJsonString(InstantV3OriginEnrollmentClaimRecord),
)
const encodeAcceptedMessageOccurrence = S.encodeSync(
  S.fromJsonString(InstantV3AcceptedMessageOccurrenceRecord),
)
const encodeMessageProposalResolution = S.encodeSync(
  S.fromJsonString(InstantV3MessageProposalResolutionRecord),
)
const messageProposalEquivalence = (
  left: InstantV3MessageProposalRecord,
  right: InstantV3MessageProposalRecord,
): boolean => encodeMessageProposal(left) === encodeMessageProposal(right)
const originEnrollmentClaimEquivalence = (
  left: InstantV3OriginEnrollmentClaimRecord,
  right: InstantV3OriginEnrollmentClaimRecord,
): boolean =>
  encodeOriginEnrollmentClaim(left) === encodeOriginEnrollmentClaim(right)
const acceptedMessageOccurrenceEquivalence = (
  left: typeof InstantV3AcceptedMessageOccurrenceRecord.Type,
  right: typeof InstantV3AcceptedMessageOccurrenceRecord.Type,
): boolean =>
  encodeAcceptedMessageOccurrence(left) ===
  encodeAcceptedMessageOccurrence(right)
const messageProposalResolutionEquivalence = (
  left: typeof InstantV3MessageProposalResolutionRecord.Type,
  right: typeof InstantV3MessageProposalResolutionRecord.Type,
): boolean =>
  encodeMessageProposalResolution(left) ===
  encodeMessageProposalResolution(right)

const clientQueryObservedOutcome = (
  recordId: string,
): V3ProgramStoreTransactionOutcome =>
  v3EnqueuedTransactionOutcome(
    `instant-query-observed:${recordId}`,
    'Idempotent',
  )

const serverQueryConfirmedOutcome = (
  recordId: string,
): V3ProgramStoreServerConfirmedTransactionOutcome =>
  v3ServerConfirmedTransactionOutcome(
    `instant-query-confirmed:${recordId}`,
    'Idempotent',
  )

const hydrateClientRecordIndex = <Record extends Readonly<{ id: string }>>(
  index: V3ClientRecordIndex<Record>,
  records: ReadonlyArray<Record>,
  entity: V3ProgramStoreEntity,
  equivalence: (left: Record, right: Record) => boolean,
  identityKeys: (record: Record) => ReadonlyArray<string>,
): Effect.Effect<V3ClientRecordIndex<Record>, V3ProgramStoreIdentityConflict> =>
  Effect.gen(function* () {
    let nextIndex = index
    for (const record of records) {
      const maybeCached = yield* validateIndexedClientAppend(
        nextIndex,
        record,
        entity,
        equivalence,
        identityKeys,
      )
      if (Option.isNone(maybeCached)) {
        nextIndex = addIndexedClientRecord(
          nextIndex,
          { outcome: clientQueryObservedOutcome(record.id), record },
          identityKeys,
        )
      }
    }
    return nextIndex
  })

/**
 * Creates the ordinary Instant Client store. Its writes may be queued offline;
 * no Client result grants authority capability. The first online append in
 * each record family hydrates immutable identities through queryOnce so an
 * exact browser-reload retry is locally observed without another strict create.
 * Client queryOnce may include optimistic pending rows, so hydration never
 * claims server confirmation.
 */
export const makeV3InstantProgramStoreFromDatabase = (
  database: V3InstantProgramClientDatabase,
  config: V3InstantProgramStoreConfig = {},
): Effect.Effect<V3ProgramStoreService> =>
  Effect.gen(function* () {
    const cache = yield* Ref.make(emptyV3InstantClientCache)
    const appendSemaphore = yield* Semaphore.make(1)

    const appendMessageProposal = (
      input: InstantV3MessageProposalRecord,
    ): Effect.Effect<
      V3ProgramStoreTransactionOutcome,
      V3ProgramStoreAppendError
    > =>
      appendSemaphore.withPermit(
        Effect.gen(function* () {
          const operation = 'AppendMessageProposal'
          const record = yield* decodeRecord(
            InstantV3MessageProposalRecord,
            input,
            operation,
          )
          let currentCache = yield* Ref.get(cache)
          const recordScope = programScopeFor(record)
          const hydrationKey = programScopeHydrationKey(recordScope)
          if (
            !HashSet.has(
              currentCache.messageProposalHydratedScopes,
              hydrationKey,
            )
          ) {
            const connectionStatus = yield* readClientConnectionStatus(
              database,
              operation,
            )
            if (
              connectionStatus === 'Opened' ||
              connectionStatus === 'Authenticated'
            ) {
              const queried = yield* queryClientRows(
                database,
                operation,
                makeV3InstantMessageProposalsQuery(recordScope),
                'foldkitV3MessageProposals',
                decodeMessageProposals,
              )
              const messageProposals = yield* hydrateClientRecordIndex(
                currentCache.messageProposals,
                queried,
                'MessageProposal',
                messageProposalEquivalence,
                messageProposalIdentityKeys,
              )
              currentCache = {
                ...currentCache,
                messageProposals,
                messageProposalHydratedScopes: HashSet.add(
                  currentCache.messageProposalHydratedScopes,
                  hydrationKey,
                ),
              }
              yield* Ref.set(cache, currentCache)
            }
          }
          const maybeCached = yield* validateIndexedClientAppend(
            currentCache.messageProposals,
            record,
            'MessageProposal',
            messageProposalEquivalence,
            messageProposalIdentityKeys,
          )
          if (Option.isSome(maybeCached)) {
            return withIdempotentDisposition(maybeCached.value.outcome)
          }
          const transaction = yield* createTransaction(operation, () =>
            makeV3InstantMessageProposalTransaction(database.tx, record),
          )
          const outcome = yield* transactClient(
            database,
            operation,
            transaction,
            'Appended',
          )
          yield* Ref.set(cache, {
            ...currentCache,
            messageProposals: addIndexedClientRecord(
              currentCache.messageProposals,
              { outcome, record },
              messageProposalIdentityKeys,
            ),
          })
          return outcome
        }),
      )

    const appendOriginEnrollmentClaim = (
      input: InstantV3OriginEnrollmentClaimRecord,
    ): Effect.Effect<
      V3ProgramStoreTransactionOutcome,
      V3ProgramStoreAppendError
    > =>
      appendSemaphore.withPermit(
        Effect.gen(function* () {
          const operation = 'AppendOriginEnrollmentClaim'
          const record = yield* decodeRecord(
            InstantV3OriginEnrollmentClaimRecord,
            input,
            operation,
          )
          let currentCache = yield* Ref.get(cache)
          const recordScope = originPolicyScopeFor(record)
          const hydrationKey = originPolicyScopeHydrationKey(recordScope)
          if (
            !HashSet.has(
              currentCache.originEnrollmentClaimHydratedScopes,
              hydrationKey,
            )
          ) {
            const connectionStatus = yield* readClientConnectionStatus(
              database,
              operation,
            )
            if (
              connectionStatus === 'Opened' ||
              connectionStatus === 'Authenticated'
            ) {
              const queried = yield* queryClientRows(
                database,
                operation,
                makeV3InstantOriginEnrollmentClaimsQuery(recordScope),
                'foldkitV3OriginEnrollmentClaims',
                decodeOriginEnrollmentClaims,
              )
              const originEnrollmentClaims = yield* hydrateClientRecordIndex(
                currentCache.originEnrollmentClaims,
                queried,
                'OriginEnrollmentClaim',
                originEnrollmentClaimEquivalence,
                originEnrollmentClaimIdentityKeys,
              )
              currentCache = {
                ...currentCache,
                originEnrollmentClaims,
                originEnrollmentClaimHydratedScopes: HashSet.add(
                  currentCache.originEnrollmentClaimHydratedScopes,
                  hydrationKey,
                ),
              }
              yield* Ref.set(cache, currentCache)
            }
          }
          const maybeCached = yield* validateIndexedClientAppend(
            currentCache.originEnrollmentClaims,
            record,
            'OriginEnrollmentClaim',
            originEnrollmentClaimEquivalence,
            originEnrollmentClaimIdentityKeys,
          )
          if (Option.isSome(maybeCached)) {
            return withIdempotentDisposition(maybeCached.value.outcome)
          }
          const transaction = yield* createTransaction(operation, () =>
            makeV3InstantOriginEnrollmentClaimTransaction(database.tx, record),
          )
          const outcome = yield* transactClient(
            database,
            operation,
            transaction,
            'Appended',
          )
          yield* Ref.set(cache, {
            ...currentCache,
            originEnrollmentClaims: addIndexedClientRecord(
              currentCache.originEnrollmentClaims,
              { outcome, record },
              originEnrollmentClaimIdentityKeys,
            ),
          })
          return outcome
        }),
      )

    return V3ProgramStore.of({
      appendMessageProposal,
      appendOriginEnrollmentClaim,
      observations: makeV3InstantObservations(database, config),
    })
  })

/** Creates an ordinary Instant Client store from the exact schema database. */
export const makeV3InstantProgramStore = (
  database: InstantV3ProgramDatabase,
  config: V3InstantProgramStoreConfig = {},
): Effect.Effect<V3ProgramStoreService> =>
  makeV3InstantProgramStoreFromDatabase(
    makeV3InstantProgramClientDatabase(database),
    config,
  )

/** Provides an ordinary Instant Client store from a normalized database. */
export const makeV3InstantProgramStoreLayer = (
  database: V3InstantProgramClientDatabase,
  config: V3InstantProgramStoreConfig = {},
) =>
  Layer.effect(
    V3ProgramStore,
    makeV3InstantProgramStoreFromDatabase(database, config),
  )

type V3IndexedAppendPlan<Record extends Readonly<{ id: string }>> = Readonly<{
  disposition: V3ProgramStoreWriteDisposition
  index: V3ClientRecordIndex<Record>
}>

const planIndexedServerAppend = <Record extends Readonly<{ id: string }>>(
  index: V3ClientRecordIndex<Record>,
  record: Record,
  entity: V3ProgramStoreEntity,
  equivalence: (left: Record, right: Record) => boolean,
  identityKeys: (record: Record) => ReadonlyArray<string>,
): Effect.Effect<V3IndexedAppendPlan<Record>, V3ProgramStoreIdentityConflict> =>
  Effect.gen(function* () {
    const maybeCached = yield* validateIndexedClientAppend(
      index,
      record,
      entity,
      equivalence,
      identityKeys,
    )
    if (Option.isSome(maybeCached)) {
      return { disposition: 'Idempotent', index }
    } else {
      return {
        disposition: 'Appended',
        index: addIndexedClientRecord(
          index,
          { outcome: serverQueryConfirmedOutcome(record.id), record },
          identityKeys,
        ),
      }
    }
  })

type V3AcceptedPrerequisiteIndex = Readonly<{
  acceptedMessageOccurrences: V3ClientRecordIndex<
    typeof InstantV3AcceptedMessageOccurrenceRecord.Type
  >
  messageProposalResolutions: V3ClientRecordIndex<
    typeof InstantV3MessageProposalResolutionRecord.Type
  >
  terminalByPositionKey: HashMap.HashMap<
    string,
    typeof InstantV3MessageProposalResolutionRecord.Type
  >
}>

const acceptedReferenceKey = (id: string, positionKey: string): string =>
  stringifyInstantV3CanonicalJson(['AcceptedReference', id, positionKey])

const atomicPairIncomplete = (
  proposalId: string,
): V3ProgramStoreAcceptedMessageOccurrenceMismatch =>
  new V3ProgramStoreAcceptedMessageOccurrenceMismatch({
    proposalId,
    reason: 'AtomicPairIncomplete',
  })

const validateTerminalAppend = (
  terminalByPositionKey: HashMap.HashMap<
    string,
    typeof InstantV3MessageProposalResolutionRecord.Type
  >,
  resolution: typeof InstantV3MessageProposalResolutionRecord.Type,
): Effect.Effect<
  HashMap.HashMap<string, typeof InstantV3MessageProposalResolutionRecord.Type>,
  V3ProgramStoreTerminalConflict
> => {
  const maybeCurrent = HashMap.get(
    terminalByPositionKey,
    resolution.proposalTerminalPositionKey,
  )
  if (
    Option.isSome(maybeCurrent) &&
    maybeCurrent.value.resolutionState !== resolution.resolutionState
  ) {
    return Effect.fail(
      new V3ProgramStoreTerminalConflict({
        attemptedTerminal: resolution.resolutionState,
        existingTerminal: maybeCurrent.value.resolutionState,
        proposalId: resolution.proposalId,
      }),
    )
  } else if (Option.isSome(maybeCurrent)) {
    return Effect.succeed(terminalByPositionKey)
  } else {
    return Effect.succeed(
      HashMap.set(
        terminalByPositionKey,
        resolution.proposalTerminalPositionKey,
        resolution,
      ),
    )
  }
}

const indexAcceptedPrerequisiteSnapshot = (
  acceptedMessageOccurrences: ReadonlyArray<
    typeof InstantV3AcceptedMessageOccurrenceRecord.Type
  >,
  messageProposalResolutions: ReadonlyArray<
    typeof InstantV3MessageProposalResolutionRecord.Type
  >,
): Effect.Effect<V3AcceptedPrerequisiteIndex, V3ProgramStoreAppendError> =>
  Effect.gen(function* () {
    const orderedAcceptedMessageOccurrences = Array.sort(
      acceptedMessageOccurrences,
      acceptedMessageOccurrenceOrder,
    )
    const orderedMessageProposalResolutions = Array.sort(
      messageProposalResolutions,
      messageProposalResolutionOrder,
    )
    let acceptedByReference = HashMap.empty<
      string,
      ReadonlyArray<typeof InstantV3AcceptedMessageOccurrenceRecord.Type>
    >()
    for (const occurrence of orderedAcceptedMessageOccurrences) {
      const referenceKey = acceptedReferenceKey(
        occurrence.id,
        occurrence.positionKey,
      )
      const maybeCurrent = HashMap.get(acceptedByReference, referenceKey)
      acceptedByReference = HashMap.set(
        acceptedByReference,
        referenceKey,
        Option.isSome(maybeCurrent)
          ? Array.append(maybeCurrent.value, occurrence)
          : [occurrence],
      )
    }
    let acceptedResolutionsByReference = HashMap.empty<
      string,
      ReadonlyArray<
        Extract<
          typeof InstantV3MessageProposalResolutionRecord.Type,
          Readonly<{ resolutionState: 'Accepted' }>
        >
      >
    >()
    for (const resolution of orderedMessageProposalResolutions) {
      if (resolution.resolutionState === 'Accepted') {
        const referenceKey = acceptedReferenceKey(
          resolution.acceptedMessageOccurrenceId,
          resolution.acceptedMessageOccurrencePositionKey,
        )
        const maybeCurrent = HashMap.get(
          acceptedResolutionsByReference,
          referenceKey,
        )
        acceptedResolutionsByReference = HashMap.set(
          acceptedResolutionsByReference,
          referenceKey,
          Option.isSome(maybeCurrent)
            ? Array.append(maybeCurrent.value, resolution)
            : [resolution],
        )
      }
    }
    for (const occurrence of orderedAcceptedMessageOccurrences) {
      if (
        !HashMap.has(
          acceptedResolutionsByReference,
          acceptedReferenceKey(occurrence.id, occurrence.positionKey),
        )
      ) {
        return yield* Effect.fail(atomicPairIncomplete(occurrence.proposalId))
      }
    }
    let acceptedIndex =
      emptyV3ClientRecordIndex<
        typeof InstantV3AcceptedMessageOccurrenceRecord.Type
      >()
    let resolutionIndex =
      emptyV3ClientRecordIndex<
        typeof InstantV3MessageProposalResolutionRecord.Type
      >()
    let terminalByPositionKey = HashMap.empty<
      string,
      typeof InstantV3MessageProposalResolutionRecord.Type
    >()
    for (const resolution of orderedMessageProposalResolutions) {
      terminalByPositionKey = yield* validateTerminalAppend(
        terminalByPositionKey,
        resolution,
      )
      const resolutionPlan = yield* planIndexedServerAppend(
        resolutionIndex,
        resolution,
        'MessageProposalResolution',
        messageProposalResolutionEquivalence,
        messageProposalResolutionIdentityKeys,
      )
      resolutionIndex = resolutionPlan.index
      if (resolution.resolutionState === 'Accepted') {
        const maybeOccurrences = HashMap.get(
          acceptedByReference,
          acceptedReferenceKey(
            resolution.acceptedMessageOccurrenceId,
            resolution.acceptedMessageOccurrencePositionKey,
          ),
        )
        if (Option.isNone(maybeOccurrences)) {
          return yield* Effect.fail(atomicPairIncomplete(resolution.proposalId))
        }
        const maybeOccurrence = Array.head(maybeOccurrences.value)
        if (Option.isNone(maybeOccurrence)) {
          return yield* Effect.fail(atomicPairIncomplete(resolution.proposalId))
        }
        const transaction =
          V3ProgramStoreAcceptedMessageOccurrenceTransaction.make({
            occurrence: maybeOccurrence.value,
            resolution,
          })
        const maybeMismatch =
          findV3ProgramStoreAcceptedMessageOccurrenceMismatch(transaction)
        if (Option.isSome(maybeMismatch)) {
          return yield* Effect.fail(maybeMismatch.value)
        }
        const acceptedPlan = yield* planIndexedServerAppend(
          acceptedIndex,
          maybeOccurrence.value,
          'AcceptedMessageOccurrence',
          acceptedMessageOccurrenceEquivalence,
          acceptedMessageOccurrenceIdentityKeys,
        )
        acceptedIndex = acceptedPlan.index
        if (resolutionPlan.disposition !== acceptedPlan.disposition) {
          return yield* Effect.fail(atomicPairIncomplete(resolution.proposalId))
        }
      }
    }
    return {
      acceptedMessageOccurrences: acceptedIndex,
      messageProposalResolutions: resolutionIndex,
      terminalByPositionKey,
    }
  })

type V3AuthorityAppendSpec<Record> = Readonly<{
  append: (
    stores: V3InMemoryProgramStores,
    record: Record,
  ) => Effect.Effect<
    V3ProgramStoreServerConfirmedTransactionOutcome,
    V3ProgramStoreAppendError
  >
  createTransaction: (
    transactions: InstantV3ProgramDatabase['tx'],
    record: Record,
  ) => V3InstantProgramTransactionInput
  decode: (value: unknown) => Record
  operation: V3ProgramStoreOperation
  query: (record: Record) => V3InstantProgramQuery
  queryRows: (response: unknown, namespace: string) => ReadonlyArray<Record>
  namespace: string
  snapshot: (records: ReadonlyArray<Record>) => V3InMemoryProgramStoreSnapshot
}>

const appendAuthorityRecord = <Record extends Readonly<{ id: string }>>(
  database: V3InstantProgramAuthorityDatabase,
  input: Record,
  spec: V3AuthorityAppendSpec<Record>,
): Effect.Effect<
  V3ProgramStoreServerConfirmedTransactionOutcome,
  V3ProgramStoreAppendError
> =>
  Effect.gen(function* () {
    const record = yield* Effect.try({
      try: () => spec.decode(input),
      catch: cause => storeError(cause, spec.operation),
    })
    const records = yield* queryAuthorityRows(
      database,
      spec.operation,
      spec.query(record),
      spec.namespace,
      spec.queryRows,
    )
    const planner = yield* makeV3InMemoryProgramStores(spec.snapshot(records))
    const plan = yield* spec.append(planner, record)
    if (plan.disposition === 'Idempotent') {
      return serverQueryConfirmedOutcome(record.id)
    }
    const transaction = yield* createTransaction(spec.operation, () =>
      spec.createTransaction(database.tx, record),
    )
    return yield* transactAuthority(
      database,
      spec.operation,
      transaction,
      'Appended',
    )
  })

/**
 * Creates a structurally separate server-confirmed authority store. The caller
 * must provide the explicit exclusive-writer capability because InstantDB has
 * no public compare-and-set transaction primitive for these append guards. The
 * prerequisite applies across every authority process using the database, not
 * only this store's local semaphore. Exact retries confirmed by a fresh query
 * use an `instant-query-confirmed:` correlation because no new transaction ran.
 */
export const makeV3InstantProgramAuthorityStore = (
  database: V3InstantProgramAuthorityDatabase,
  config: V3InstantProgramStoreConfig = {},
): Effect.Effect<V3ProgramAuthorityStoreService> =>
  Effect.gen(function* () {
    const authoritySemaphore = yield* Semaphore.make(1)
    const strict = <Record, Encoded>(schema: S.Codec<Record, Encoded, never>) =>
      S.decodeUnknownSync(schema, strictDecodeOptions)

    const appendAccepted = (
      input: V3ProgramStoreAcceptedMessageOccurrenceTransaction,
    ): Effect.Effect<
      V3ProgramStoreServerConfirmedTransactionOutcome,
      V3ProgramStoreAppendError
    > =>
      Effect.gen(function* () {
        const operation = 'AppendAcceptedMessageOccurrence'
        const transaction = yield* decodeRecord(
          V3ProgramStoreAcceptedMessageOccurrenceTransaction,
          input,
          operation,
        )
        const maybeMismatch =
          findV3ProgramStoreAcceptedMessageOccurrenceMismatch(transaction)
        if (Option.isSome(maybeMismatch)) {
          return yield* Effect.fail(maybeMismatch.value)
        }
        const response = yield* Effect.tryPromise({
          try: () =>
            database.query(
              makeV3InstantAcceptedMessageOccurrencePrerequisiteQuery(
                programScopeFor(transaction.occurrence),
              ),
            ),
          catch: cause => storeError(cause, operation),
        })
        const acceptedMessageOccurrences = yield* Effect.try({
          try: () =>
            decodeAcceptedMessageOccurrences(
              response,
              'foldkitV3AcceptedMessageOccurrences',
            ),
          catch: cause => storeError(cause, operation),
        })
        const messageProposalResolutions = yield* Effect.try({
          try: () =>
            decodeMessageProposalResolutions(
              response,
              'foldkitV3MessageProposalResolutions',
            ),
          catch: cause => storeError(cause, operation),
        })
        const prerequisiteIndex = yield* indexAcceptedPrerequisiteSnapshot(
          acceptedMessageOccurrences,
          messageProposalResolutions,
        )
        yield* validateTerminalAppend(
          prerequisiteIndex.terminalByPositionKey,
          transaction.resolution,
        )
        const resolutionPlan = yield* planIndexedServerAppend(
          prerequisiteIndex.messageProposalResolutions,
          transaction.resolution,
          'MessageProposalResolution',
          messageProposalResolutionEquivalence,
          messageProposalResolutionIdentityKeys,
        )
        const acceptedPlan = yield* planIndexedServerAppend(
          prerequisiteIndex.acceptedMessageOccurrences,
          transaction.occurrence,
          'AcceptedMessageOccurrence',
          acceptedMessageOccurrenceEquivalence,
          acceptedMessageOccurrenceIdentityKeys,
        )
        if (resolutionPlan.disposition !== acceptedPlan.disposition) {
          return yield* Effect.fail(
            atomicPairIncomplete(transaction.resolution.proposalId),
          )
        }
        if (resolutionPlan.disposition === 'Idempotent') {
          return serverQueryConfirmedOutcome(transaction.resolution.id)
        }
        const transactions = yield* createTransaction(operation, () =>
          makeV3InstantAcceptedMessageOccurrenceTransactions(
            database.tx,
            transaction,
          ),
        )
        return yield* transactAuthority(
          database,
          operation,
          transactions,
          'Appended',
        )
      })

    const appendRejected = (
      input: InstantV3RejectedMessageProposalResolutionRecord,
    ): Effect.Effect<
      V3ProgramStoreServerConfirmedTransactionOutcome,
      V3ProgramStoreAppendError
    > =>
      Effect.gen(function* () {
        const operation = 'AppendMessageProposalResolution'
        const record = yield* decodeRecord(
          InstantV3MessageProposalResolutionRecord,
          input,
          operation,
        )
        if (record.resolutionState !== 'Rejected') {
          return yield* Effect.fail(
            storeError(
              new Error('Expected a Rejected proposal resolution.'),
              operation,
            ),
          )
        }
        const response = yield* Effect.tryPromise({
          try: () =>
            database.query(
              makeV3InstantAcceptedMessageOccurrencePrerequisiteQuery(
                programScopeFor(record),
              ),
            ),
          catch: cause => storeError(cause, operation),
        })
        const acceptedMessageOccurrences = yield* Effect.try({
          try: () =>
            decodeAcceptedMessageOccurrences(
              response,
              'foldkitV3AcceptedMessageOccurrences',
            ),
          catch: cause => storeError(cause, operation),
        })
        const messageProposalResolutions = yield* Effect.try({
          try: () =>
            decodeMessageProposalResolutions(
              response,
              'foldkitV3MessageProposalResolutions',
            ),
          catch: cause => storeError(cause, operation),
        })
        const prerequisiteIndex = yield* indexAcceptedPrerequisiteSnapshot(
          acceptedMessageOccurrences,
          messageProposalResolutions,
        )
        yield* validateTerminalAppend(
          prerequisiteIndex.terminalByPositionKey,
          record,
        )
        const resolutionPlan = yield* planIndexedServerAppend(
          prerequisiteIndex.messageProposalResolutions,
          record,
          'MessageProposalResolution',
          messageProposalResolutionEquivalence,
          messageProposalResolutionIdentityKeys,
        )
        if (resolutionPlan.disposition === 'Idempotent') {
          return serverQueryConfirmedOutcome(record.id)
        }
        const transaction = yield* createTransaction(operation, () =>
          makeV3InstantMessageProposalResolutionTransaction(
            database.tx,
            record,
          ),
        )
        return yield* transactAuthority(
          database,
          operation,
          transaction,
          'Appended',
        )
      })

    const readServerConfirmedSnapshot = (
      scope: V3ProgramStoreScope,
    ): Effect.Effect<V3ProgramAuthoritySnapshot, V3ProgramStoreError> =>
      Effect.tryPromise({
        try: () =>
          database.query(makeV3InstantProgramAuthoritySnapshotQuery(scope)),
        catch: cause => storeError(cause, 'ReadAuthoritySnapshot'),
      }).pipe(
        Effect.flatMap(response =>
          Effect.try({
            try: () =>
              V3ProgramAuthoritySnapshot.make({
                acceptedMessageOccurrences: Array.sort(
                  decodeAcceptedMessageOccurrences(
                    response,
                    'foldkitV3AcceptedMessageOccurrences',
                  ),
                  acceptedMessageOccurrenceOrder,
                ),
                effectPlacements: Array.sort(
                  decodeEffectPlacements(response, 'foldkitV3EffectPlacements'),
                  effectPlacementOrder,
                ),
                effectRequests: Array.sort(
                  decodeEffectRequests(response, 'foldkitV3EffectRequests'),
                  effectRequestOrder,
                ),
                messageProposalResolutions: Array.sort(
                  decodeMessageProposalResolutions(
                    response,
                    'foldkitV3MessageProposalResolutions',
                  ),
                  messageProposalResolutionOrder,
                ),
                messageProposals: Array.sort(
                  decodeMessageProposals(response, 'foldkitV3MessageProposals'),
                  messageProposalOrder,
                ),
                originPolicyDecisions: Array.sort(
                  decodeOriginPolicyDecisions(
                    response,
                    'foldkitV3OriginPolicyDecisions',
                  ),
                  originPolicyDecisionOrder,
                ),
                programSessions: Array.sort(
                  decodeProgramSessions(response, 'foldkitV3ProgramSessions'),
                  programSessionObservationOrder,
                ),
              }),
            catch: cause => storeError(cause, 'ReadAuthoritySnapshot'),
          }),
        ),
      )

    const authorityMutations: V3ProgramAuthorityMutationService = {
      appendServerConfirmedAcceptedMessageOccurrence: appendAccepted,
      appendServerConfirmedEffectPlacement: input =>
        appendAuthorityRecord(database, input, {
          append: (stores, record) =>
            stores.authority.appendServerConfirmedEffectPlacement(record),
          createTransaction: makeV3InstantEffectPlacementTransaction,
          decode: strict(InstantV3EffectPlacementRecord),
          namespace: 'foldkitV3EffectPlacements',
          operation: 'AppendEffectPlacement',
          query: record =>
            makeV3InstantEffectPlacementsQuery(programScopeFor(record)),
          queryRows: decodeEffectPlacements,
          snapshot: effectPlacements => snapshotWith({ effectPlacements }),
        }),
      appendServerConfirmedEffectRequest: input =>
        appendAuthorityRecord(database, input, {
          append: (stores, record) =>
            stores.authority.appendServerConfirmedEffectRequest(record),
          createTransaction: makeV3InstantEffectRequestTransaction,
          decode: strict(InstantV3EffectRequestRecord),
          namespace: 'foldkitV3EffectRequests',
          operation: 'AppendEffectRequest',
          query: record =>
            makeV3InstantEffectRequestsQuery(programScopeFor(record)),
          queryRows: decodeEffectRequests,
          snapshot: effectRequests => snapshotWith({ effectRequests }),
        }),
      appendServerConfirmedRejectedMessageProposalResolution: appendRejected,
      appendServerConfirmedOriginPolicyDecision: input =>
        appendAuthorityRecord(database, input, {
          append: (stores, record) =>
            stores.authority.appendServerConfirmedOriginPolicyDecision(record),
          createTransaction: makeV3InstantOriginPolicyDecisionTransaction,
          decode: strict(InstantV3OriginPolicyDecisionRecord),
          namespace: 'foldkitV3OriginPolicyDecisions',
          operation: 'AppendOriginPolicyDecision',
          query: record =>
            makeV3InstantOriginPolicyDecisionsQuery(
              originPolicyScopeFor(record),
            ),
          queryRows: decodeOriginPolicyDecisions,
          snapshot: originPolicyDecisions =>
            snapshotWith({ originPolicyDecisions }),
        }),
      appendServerConfirmedProgramSession: input =>
        appendAuthorityRecord(database, input, {
          append: (stores, record) =>
            stores.authority.appendServerConfirmedProgramSession(record),
          createTransaction: makeV3InstantProgramSessionTransaction,
          decode: strict(InstantV3ProgramSessionRecord),
          namespace: 'foldkitV3ProgramSessions',
          operation: 'AppendProgramSession',
          query: record =>
            makeV3InstantProgramSessionsQuery(programScopeFor(record)),
          queryRows: decodeProgramSessions,
          snapshot: programSessions => snapshotWith({ programSessions }),
        }),
      appendServerConfirmedProjectionCheckpoint: input =>
        appendAuthorityRecord(database, input, {
          append: (stores, record) =>
            stores.authority.appendServerConfirmedProjectionCheckpoint(record),
          createTransaction: makeV3InstantProjectionCheckpointTransaction,
          decode: strict(InstantV3ProjectionCheckpointRecord),
          namespace: 'foldkitV3ProjectionCheckpoints',
          operation: 'AppendProjectionCheckpoint',
          query: record =>
            makeV3InstantProjectionCheckpointsQuery(programScopeFor(record)),
          queryRows: decodeProjectionCheckpoints,
          snapshot: projectionCheckpoints =>
            snapshotWith({ projectionCheckpoints }),
        }),
    }

    const criticalSection = {
      ...authorityMutations,
      readServerConfirmedSnapshot,
    }

    const serializeAuthorityMutation = <Success, Error, Requirements>(
      effect: Effect.Effect<Success, Error, Requirements>,
    ): Effect.Effect<Success, Error, Requirements> =>
      authoritySemaphore.withPermit(effect)

    return V3ProgramAuthorityStore.of({
      authorityCapability: V3ProgramAuthorityStoreCapability.make({
        protocolVersion: 3,
      }),
      appendServerConfirmedAcceptedMessageOccurrence: transaction =>
        serializeAuthorityMutation(
          authorityMutations.appendServerConfirmedAcceptedMessageOccurrence(
            transaction,
          ),
        ),
      appendServerConfirmedEffectPlacement: record =>
        serializeAuthorityMutation(
          authorityMutations.appendServerConfirmedEffectPlacement(record),
        ),
      appendServerConfirmedEffectRequest: record =>
        serializeAuthorityMutation(
          authorityMutations.appendServerConfirmedEffectRequest(record),
        ),
      appendServerConfirmedRejectedMessageProposalResolution: record =>
        serializeAuthorityMutation(
          authorityMutations.appendServerConfirmedRejectedMessageProposalResolution(
            record,
          ),
        ),
      appendServerConfirmedOriginPolicyDecision: record =>
        serializeAuthorityMutation(
          authorityMutations.appendServerConfirmedOriginPolicyDecision(record),
        ),
      appendServerConfirmedProgramSession: record =>
        serializeAuthorityMutation(
          authorityMutations.appendServerConfirmedProgramSession(record),
        ),
      appendServerConfirmedProjectionCheckpoint: record =>
        serializeAuthorityMutation(
          authorityMutations.appendServerConfirmedProjectionCheckpoint(record),
        ),
      coordinator: {
        capability: V3ProgramAuthorityCoordinatorCapability.make({
          protocolVersion: 3,
        }),
        withCriticalSection: use =>
          authoritySemaphore.withPermit(
            Effect.gen(function* () {
              const invocation =
                yield* makeV3ProgramAuthorityCriticalSectionInvocation(
                  criticalSection,
                )
              return yield* Effect.suspend(() => use(invocation.section)).pipe(
                Effect.ensuring(invocation.expire),
              )
            }),
          ),
      },
      serverConfirmed: makeV3InstantObservations(database, config),
    })
  })

/** Provides the structurally separate Instant authority store. */
export const makeV3InstantProgramAuthorityStoreLayer = (
  database: V3InstantProgramAuthorityDatabase,
  config: V3InstantProgramStoreConfig = {},
) =>
  Layer.effect(
    V3ProgramAuthorityStore,
    makeV3InstantProgramAuthorityStore(database, config),
  )
