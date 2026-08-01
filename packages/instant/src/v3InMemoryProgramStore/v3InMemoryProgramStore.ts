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
import { Synchronization } from 'foldkit'

import {
  V3OriginPolicyDecisionLifecycleConflict,
  type V3OriginPolicyDecisionLifecycleConflictReason,
  type V3OriginPolicyStoreScope,
  V3ProgramAuthorityStore,
  V3ProgramAuthorityStoreCapability,
  type V3ProgramAuthorityStoreService,
  V3ProgramSessionLifecycleConflict,
  V3ProgramStore,
  V3ProgramStoreAcceptedMessageOccurrenceMismatch,
  V3ProgramStoreAcceptedMessageOccurrenceTransaction,
  type V3ProgramStoreAppendError,
  type V3ProgramStoreEntity,
  V3ProgramStoreIdentityConflict,
  type V3ProgramStoreObservations,
  type V3ProgramStoreScope,
  type V3ProgramStoreServerConfirmedTransactionOutcome,
  type V3ProgramStoreService,
  V3ProgramStoreTerminalConflict,
  type V3ProgramStoreTransactionOutcome,
  type V3ProgramStoreWriteDisposition,
  findV3ProgramStoreAcceptedMessageOccurrenceMismatch,
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
  InstantV3ProgramSessionRecord,
  InstantV3ProjectionCheckpointRecord,
} from '../v3Schema/index.js'

type V3IdentifiedRecord = Readonly<{
  id: string
}>

type V3ProgramScopedIdentifiedRecord = V3IdentifiedRecord &
  Readonly<{
    appSubjectDigest: string
    instantAppId: string
    programId: string
    programVersion: number
    protocolVersion: 3
    sessionEpochId: string
    sessionId: string
    subjectId: string
  }>

type V3OriginPolicyScopedIdentifiedRecord = V3IdentifiedRecord &
  Readonly<{
    instantAppId: string
    protocolVersion: 3
    subjectId: string
  }>

/** Every immutable row retained by one deterministic in-memory v3 store. */
export const V3InMemoryProgramStoreSnapshot = S.Struct({
  acceptedMessageOccurrences: S.Array(InstantV3AcceptedMessageOccurrenceRecord),
  effectPlacements: S.Array(InstantV3EffectPlacementRecord),
  effectRequests: S.Array(InstantV3EffectRequestRecord),
  messageProposalResolutions: S.Array(InstantV3MessageProposalResolutionRecord),
  messageProposals: S.Array(InstantV3MessageProposalRecord),
  originEnrollmentClaims: S.Array(InstantV3OriginEnrollmentClaimRecord),
  originPolicyDecisions: S.Array(InstantV3OriginPolicyDecisionRecord),
  programSessions: S.Array(InstantV3ProgramSessionRecord),
  projectionCheckpoints: S.Array(InstantV3ProjectionCheckpointRecord),
})
/** Every immutable row retained by one deterministic in-memory v3 store. */
export type V3InMemoryProgramStoreSnapshot =
  typeof V3InMemoryProgramStoreSnapshot.Type

/** An empty immutable snapshot for a fresh protocol-v3 store. */
export const emptyV3InMemoryProgramStoreSnapshot =
  V3InMemoryProgramStoreSnapshot.make({
    acceptedMessageOccurrences: [],
    effectPlacements: [],
    effectRequests: [],
    messageProposalResolutions: [],
    messageProposals: [],
    originEnrollmentClaims: [],
    originPolicyDecisions: [],
    programSessions: [],
    projectionCheckpoints: [],
  })

const acceptedMessageOccurrenceJson = S.fromJsonString(
  InstantV3AcceptedMessageOccurrenceRecord,
)
const effectPlacementJson = S.fromJsonString(InstantV3EffectPlacementRecord)
const effectRequestJson = S.fromJsonString(InstantV3EffectRequestRecord)
const messageProposalJson = S.fromJsonString(InstantV3MessageProposalRecord)
const messageProposalResolutionJson = S.fromJsonString(
  InstantV3MessageProposalResolutionRecord,
)
const originEnrollmentClaimJson = S.fromJsonString(
  InstantV3OriginEnrollmentClaimRecord,
)
const originPolicyDecisionJson = S.fromJsonString(
  InstantV3OriginPolicyDecisionRecord,
)
const programSessionJson = S.fromJsonString(InstantV3ProgramSessionRecord)
const projectionCheckpointJson = S.fromJsonString(
  InstantV3ProjectionCheckpointRecord,
)

const identifiedRecordOrder = Order.mapInput(
  Order.String,
  (record: V3IdentifiedRecord) => record.id,
)

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

const effectPlacementOrder = Order.combine(
  Order.combine(
    Order.mapInput(
      Order.Number,
      (record: InstantV3EffectPlacementRecord) => record.assignmentGeneration,
    ),
    Order.mapInput(
      Order.Number,
      (record: InstantV3EffectPlacementRecord) => record.cancellationGeneration,
    ),
  ),
  Order.mapInput(
    Order.String,
    (record: InstantV3EffectPlacementRecord) => record.positionKey,
  ),
)

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
): number => {
  if (record.resolutionState === 'Accepted') {
    return record.acceptedAtMs
  } else {
    return record.rejectedAtMs
  }
}

const messageProposalResolutionOrder = Order.combine(
  Order.combine(
    Order.combine(
      Order.mapInput(Order.Number, messageProposalResolutionTimestamp),
      Order.mapInput(
        Order.String,
        (record: InstantV3MessageProposalResolutionRecord) => record.proposalId,
      ),
    ),
    Order.mapInput(
      Order.String,
      (record: InstantV3MessageProposalResolutionRecord) =>
        record.resolutionState,
    ),
  ),
  Order.mapInput(
    Order.String,
    (record: InstantV3MessageProposalResolutionRecord) => record.id,
  ),
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

const originPolicyDecisionReplayOrder = Order.combineAll([
  Order.mapInput(
    Order.String,
    (record: InstantV3OriginPolicyDecisionRecord) => record.instantAppId,
  ),
  Order.mapInput(
    Order.String,
    (record: InstantV3OriginPolicyDecisionRecord) => record.subjectId,
  ),
  Order.mapInput(
    Order.Number,
    (record: InstantV3OriginPolicyDecisionRecord) => record.protocolVersion,
  ),
  Order.mapInput(
    Order.String,
    (record: InstantV3OriginPolicyDecisionRecord) => record.originPolicyId,
  ),
  Order.mapInput(
    Order.Number,
    (record: InstantV3OriginPolicyDecisionRecord) => record.generation,
  ),
  Order.mapInput(
    Order.String,
    (record: InstantV3OriginPolicyDecisionRecord) => record.id,
  ),
])

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

const programSessionReplayOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (record: InstantV3ProgramSessionRecord) => record.lifecycleGeneration,
  ),
  Order.mapInput(
    Order.String,
    (record: InstantV3ProgramSessionRecord) => record.lifecyclePositionKey,
  ),
)

const scopeMatches = (
  record: V3ProgramScopedIdentifiedRecord,
  scope: V3ProgramStoreScope,
): boolean =>
  record.appSubjectDigest === scope.appSubjectDigest &&
  record.instantAppId === scope.instantAppId &&
  record.programId === scope.programId &&
  record.programVersion === scope.programVersion &&
  record.protocolVersion === scope.protocolVersion &&
  record.sessionEpochId === scope.sessionEpochId &&
  record.sessionId === scope.sessionId &&
  record.subjectId === scope.subjectId

const observeRecords = <Record extends V3ProgramScopedIdentifiedRecord>(
  ref: SubscriptionRef.SubscriptionRef<V3InMemoryProgramStoreSnapshot>,
  scope: V3ProgramStoreScope,
  recordsForSnapshot: (
    snapshot: V3InMemoryProgramStoreSnapshot,
  ) => ReadonlyArray<Record>,
  order: Order.Order<Record>,
): Stream.Stream<ReadonlyArray<Record>> =>
  SubscriptionRef.changes(ref).pipe(
    Stream.map(snapshot =>
      pipe(
        recordsForSnapshot(snapshot),
        Array.filter(record => scopeMatches(record, scope)),
        Array.sort(order),
      ),
    ),
  )

const originPolicyScopeMatches = (
  record: V3OriginPolicyScopedIdentifiedRecord,
  scope: V3OriginPolicyStoreScope,
): boolean =>
  record.instantAppId === scope.instantAppId &&
  record.protocolVersion === scope.protocolVersion &&
  record.subjectId === scope.subjectId

const observeOriginPolicyRecords = <
  Record extends V3OriginPolicyScopedIdentifiedRecord,
>(
  ref: SubscriptionRef.SubscriptionRef<V3InMemoryProgramStoreSnapshot>,
  scope: V3OriginPolicyStoreScope,
  recordsForSnapshot: (
    snapshot: V3InMemoryProgramStoreSnapshot,
  ) => ReadonlyArray<Record>,
  order: Order.Order<Record>,
): Stream.Stream<ReadonlyArray<Record>> =>
  SubscriptionRef.changes(ref).pipe(
    Stream.map(snapshot =>
      pipe(
        recordsForSnapshot(snapshot),
        Array.filter(record => originPolicyScopeMatches(record, scope)),
        Array.sort(order),
      ),
    ),
  )

const V3RecordIdentity = S.Struct({
  kind: S.String,
  parts: S.Array(S.Union([S.String, S.Number])),
})
type V3RecordIdentity = typeof V3RecordIdentity.Type

const recordIdentityEquivalence = S.toEquivalence(V3RecordIdentity)

const recordIdentity = (
  kind: string,
  parts: ReadonlyArray<string | number>,
): V3RecordIdentity => V3RecordIdentity.make({ kind, parts })

type AppendRecordOptions<
  Record extends V3IdentifiedRecord,
  Outcome,
> = Readonly<{
  encode: (record: Record) => string
  entity: V3ProgramStoreEntity
  identityKeys: (record: Record) => ReadonlyArray<V3RecordIdentity>
  makeOutcome: (disposition: V3ProgramStoreWriteDisposition) => Outcome
  recordsForSnapshot: (
    snapshot: V3InMemoryProgramStoreSnapshot,
  ) => ReadonlyArray<Record>
  updateSnapshot: (
    snapshot: V3InMemoryProgramStoreSnapshot,
    records: ReadonlyArray<Record>,
  ) => V3InMemoryProgramStoreSnapshot
  validateAppend: (
    snapshot: V3InMemoryProgramStoreSnapshot,
    record: Record,
  ) => Option.Option<V3ProgramStoreAppendError>
}>

const noAppendConflict = (
  _snapshot: V3InMemoryProgramStoreSnapshot,
  _record: V3IdentifiedRecord,
) => Option.none<V3ProgramStoreAppendError>()

const sharesIdentity = <Record extends V3IdentifiedRecord>(
  left: Record,
  right: Record,
  identityKeys: (record: Record) => ReadonlyArray<V3RecordIdentity>,
): boolean => {
  const rightKeys = identityKeys(right)
  return Array.some(identityKeys(left), leftKey =>
    Array.some(rightKeys, rightKey =>
      recordIdentityEquivalence(leftKey, rightKey),
    ),
  )
}

const identityConflict = (
  entity: V3ProgramStoreEntity,
  id: string,
): V3ProgramStoreIdentityConflict =>
  new V3ProgramStoreIdentityConflict({ entity, id })

const appendRecordToSnapshot = <Record extends V3IdentifiedRecord, Outcome>(
  snapshot: V3InMemoryProgramStoreSnapshot,
  record: Record,
  options: AppendRecordOptions<Record, Outcome>,
): Effect.Effect<
  readonly [Outcome, V3InMemoryProgramStoreSnapshot],
  V3ProgramStoreAppendError
> => {
  const maybeAppendConflict = options.validateAppend(snapshot, record)
  if (Option.isSome(maybeAppendConflict)) {
    return Effect.fail(maybeAppendConflict.value)
  }
  const records = options.recordsForSnapshot(snapshot)
  const maybeExistingEntity = Array.findFirst(
    records,
    existingRecord => existingRecord.id === record.id,
  )
  if (Option.isSome(maybeExistingEntity)) {
    if (options.encode(maybeExistingEntity.value) === options.encode(record)) {
      return Effect.succeed(
        Tuple.make(options.makeOutcome('Idempotent'), snapshot),
      )
    }
    return Effect.fail(identityConflict(options.entity, record.id))
  }
  const maybeExistingRecord = Array.findFirst(records, existingRecord =>
    sharesIdentity(existingRecord, record, options.identityKeys),
  )
  if (Option.isNone(maybeExistingRecord)) {
    return Effect.succeed(
      Tuple.make(
        options.makeOutcome('Appended'),
        options.updateSnapshot(snapshot, [...records, record]),
      ),
    )
  }
  if (options.encode(maybeExistingRecord.value) === options.encode(record)) {
    return Effect.succeed(
      Tuple.make(options.makeOutcome('Idempotent'), snapshot),
    )
  }
  return Effect.fail(identityConflict(options.entity, record.id))
}

const appendRecord = <Record extends V3IdentifiedRecord, Outcome>(
  ref: SubscriptionRef.SubscriptionRef<V3InMemoryProgramStoreSnapshot>,
  record: Record,
  options: AppendRecordOptions<Record, Outcome>,
): Effect.Effect<Outcome, V3ProgramStoreAppendError> =>
  SubscriptionRef.modifyEffect(ref, snapshot =>
    appendRecordToSnapshot(snapshot, record, options),
  )

const terminalGuardConflict = (
  snapshot: V3InMemoryProgramStoreSnapshot,
  incoming: InstantV3MessageProposalResolutionRecord,
): Option.Option<V3ProgramStoreAppendError> =>
  pipe(
    snapshot.messageProposalResolutions,
    Array.findFirst(
      current =>
        current.proposalTerminalPositionKey ===
        incoming.proposalTerminalPositionKey,
    ),
    Option.filter(
      current => current.resolutionState !== incoming.resolutionState,
    ),
    Option.map(
      current =>
        new V3ProgramStoreTerminalConflict({
          attemptedTerminal: incoming.resolutionState,
          existingTerminal: current.resolutionState,
          proposalId: incoming.proposalId,
        }),
    ),
  )

const acceptedMessageOccurrenceMismatch = (
  proposalId: string,
  reason: V3ProgramStoreAcceptedMessageOccurrenceMismatch['reason'],
): V3ProgramStoreAcceptedMessageOccurrenceMismatch =>
  new V3ProgramStoreAcceptedMessageOccurrenceMismatch({ proposalId, reason })

const originPolicyDecisionCurrentOrder = Order.mapInput(
  Order.flip(Order.Number),
  (record: InstantV3OriginPolicyDecisionRecord) => record.generation,
)

const sharesOriginPolicyIdentity = (
  current: InstantV3OriginPolicyDecisionRecord,
  incoming: InstantV3OriginPolicyDecisionRecord,
): boolean =>
  current.instantAppId === incoming.instantAppId &&
  current.subjectId === incoming.subjectId &&
  current.protocolVersion === incoming.protocolVersion &&
  current.originPolicyId === incoming.originPolicyId

const hasMatchingImmutableOriginPolicyFields = (
  current: InstantV3OriginPolicyDecisionRecord,
  incoming: InstantV3OriginPolicyDecisionRecord,
): boolean =>
  sharesOriginPolicyIdentity(current, incoming) &&
  current.originDeviceId === incoming.originDeviceId &&
  current.enrollmentClaimId === incoming.enrollmentClaimId &&
  current.enrollmentClaimPositionKey === incoming.enrollmentClaimPositionKey

const originPolicyDecisionLifecycleConflict = (
  current: InstantV3OriginPolicyDecisionRecord,
  incoming: InstantV3OriginPolicyDecisionRecord,
  reason: V3OriginPolicyDecisionLifecycleConflictReason,
): V3OriginPolicyDecisionLifecycleConflict =>
  new V3OriginPolicyDecisionLifecycleConflict({
    currentDecisionState: current.decisionState,
    currentGeneration: current.generation,
    incomingDecisionState: incoming.decisionState,
    incomingGeneration: incoming.generation,
    originPolicyId: incoming.originPolicyId,
    reason,
  })

const initialOriginPolicyDecisionLifecycleConflict = (
  incoming: InstantV3OriginPolicyDecisionRecord,
): V3OriginPolicyDecisionLifecycleConflict =>
  new V3OriginPolicyDecisionLifecycleConflict({
    currentDecisionState: 'New',
    currentGeneration: 0,
    incomingDecisionState: incoming.decisionState,
    incomingGeneration: incoming.generation,
    originPolicyId: incoming.originPolicyId,
    reason: 'InitialDecisionRequired',
  })

const originPolicyDecisionAppendConflict = (
  snapshot: V3InMemoryProgramStoreSnapshot,
  incoming: InstantV3OriginPolicyDecisionRecord,
): Option.Option<V3ProgramStoreAppendError> => {
  const maybeExistingGeneration = Array.findFirst(
    snapshot.originPolicyDecisions,
    current => current.positionKey === incoming.positionKey,
  )
  if (Option.isSome(maybeExistingGeneration)) {
    return Option.none()
  }
  const currentGenerations = pipe(
    snapshot.originPolicyDecisions,
    Array.filter(current => sharesOriginPolicyIdentity(current, incoming)),
    Array.sort(originPolicyDecisionCurrentOrder),
  )
  const maybeCurrent = Array.head(currentGenerations)
  if (Option.isNone(maybeCurrent)) {
    return incoming.generation === 1 &&
      (incoming.decisionState === 'Active' ||
        incoming.decisionState === 'Denied')
      ? Option.none()
      : Option.some(initialOriginPolicyDecisionLifecycleConflict(incoming))
  }
  const current = maybeCurrent.value
  if (
    current.decisionState === 'Denied' ||
    current.decisionState === 'Revoked'
  ) {
    return Option.some(
      originPolicyDecisionLifecycleConflict(
        current,
        incoming,
        'PolicyPermanentlyTerminal',
      ),
    )
  }
  if (incoming.generation !== current.generation + 1) {
    return Option.some(
      originPolicyDecisionLifecycleConflict(
        current,
        incoming,
        'DecisionGenerationNotSequential',
      ),
    )
  }
  if (!hasMatchingImmutableOriginPolicyFields(current, incoming)) {
    return Option.some(
      originPolicyDecisionLifecycleConflict(
        current,
        incoming,
        'ImmutablePolicyChanged',
      ),
    )
  }
  if (incoming.decidedAtMs < current.decidedAtMs) {
    return Option.some(
      originPolicyDecisionLifecycleConflict(
        current,
        incoming,
        'DecisionTimestampRegressed',
      ),
    )
  }
  return incoming.decisionState === 'Active' ||
    incoming.decisionState === 'Revoked'
    ? Option.none()
    : Option.some(
        originPolicyDecisionLifecycleConflict(
          current,
          incoming,
          'InvalidDecisionTransition',
        ),
      )
}

const sessionPolicyEquivalence = S.toEquivalence(Synchronization.SessionPolicy)

const hasMatchingImmutableSessionFields = (
  current: InstantV3ProgramSessionRecord,
  incoming: InstantV3ProgramSessionRecord,
): boolean =>
  current.appSubjectDigest === incoming.appSubjectDigest &&
  current.authorityProcessorId === incoming.authorityProcessorId &&
  current.instantAppId === incoming.instantAppId &&
  current.originPolicyProtocolVersion ===
    incoming.originPolicyProtocolVersion &&
  current.processorRoomId === incoming.processorRoomId &&
  current.programId === incoming.programId &&
  current.programVersion === incoming.programVersion &&
  current.protocolVersion === incoming.protocolVersion &&
  current.sessionEpochId === incoming.sessionEpochId &&
  current.sessionId === incoming.sessionId &&
  current.subjectId === incoming.subjectId

const programSessionLifecycleConflict = (
  current: InstantV3ProgramSessionRecord,
  incoming: InstantV3ProgramSessionRecord,
  reason: V3ProgramSessionLifecycleConflict['reason'],
): V3ProgramSessionLifecycleConflict =>
  new V3ProgramSessionLifecycleConflict({
    currentLifecycleGeneration: current.lifecycleGeneration,
    currentPolicyGeneration: current.sessionPolicy.generation,
    incomingLifecycleGeneration: incoming.lifecycleGeneration,
    incomingPolicyGeneration: incoming.sessionPolicy.generation,
    reason,
    sessionId: incoming.sessionId,
  })

const initialProgramSessionLifecycleConflict = (
  incoming: InstantV3ProgramSessionRecord,
): V3ProgramSessionLifecycleConflict =>
  new V3ProgramSessionLifecycleConflict({
    currentLifecycleGeneration: 0,
    currentPolicyGeneration: incoming.sessionPolicy.generation,
    incomingLifecycleGeneration: incoming.lifecycleGeneration,
    incomingPolicyGeneration: incoming.sessionPolicy.generation,
    reason: 'InitialGenerationRequired',
    sessionId: incoming.sessionId,
  })

const programSessionAppendConflict = (
  snapshot: V3InMemoryProgramStoreSnapshot,
  incoming: InstantV3ProgramSessionRecord,
): Option.Option<V3ProgramStoreAppendError> => {
  const maybeExistingGeneration = Array.findFirst(
    snapshot.programSessions,
    current => current.lifecyclePositionKey === incoming.lifecyclePositionKey,
  )
  if (Option.isSome(maybeExistingGeneration)) {
    return Option.none()
  }
  const currentGenerations = pipe(
    snapshot.programSessions,
    Array.filter(current => current.sessionId === incoming.sessionId),
    Array.sort(programSessionObservationOrder),
  )
  const maybeCurrent = Array.head(currentGenerations)
  if (Option.isNone(maybeCurrent)) {
    return incoming.lifecycleGeneration === 1 &&
      incoming.lifecycleState === 'Active'
      ? Option.none()
      : Option.some(initialProgramSessionLifecycleConflict(incoming))
  }
  const current = maybeCurrent.value
  if (current.lifecycleState === 'Revoked') {
    return Option.some(
      programSessionLifecycleConflict(
        current,
        incoming,
        'SessionPermanentlyRevoked',
      ),
    )
  }
  if (incoming.lifecycleGeneration !== current.lifecycleGeneration + 1) {
    return Option.some(
      programSessionLifecycleConflict(
        current,
        incoming,
        'LifecycleGenerationNotSequential',
      ),
    )
  }
  if (!hasMatchingImmutableSessionFields(current, incoming)) {
    return Option.some(
      programSessionLifecycleConflict(
        current,
        incoming,
        'ImmutableSessionChanged',
      ),
    )
  }
  if (incoming.createdAtMs < current.createdAtMs) {
    return Option.some(
      programSessionLifecycleConflict(
        current,
        incoming,
        'LifecycleTimestampRegressed',
      ),
    )
  }
  if (incoming.lifecycleState === 'Revoked') {
    return sessionPolicyEquivalence(
      current.sessionPolicy,
      incoming.sessionPolicy,
    )
      ? Option.none()
      : Option.some(
          programSessionLifecycleConflict(
            current,
            incoming,
            'RevocationPolicyChanged',
          ),
        )
  }
  return incoming.sessionPolicy.generation ===
    current.sessionPolicy.generation + 1
    ? Option.none()
    : Option.some(
        programSessionLifecycleConflict(
          current,
          incoming,
          'PolicyGenerationNotSequential',
        ),
      )
}

const serverOutcome =
  (recordId: string) =>
  (
    disposition: V3ProgramStoreWriteDisposition,
  ): V3ProgramStoreServerConfirmedTransactionOutcome =>
    v3ServerConfirmedTransactionOutcome(`in-memory-v3:${recordId}`, disposition)

const makeStoreServices = (
  ref: SubscriptionRef.SubscriptionRef<V3InMemoryProgramStoreSnapshot>,
): Readonly<{
  authority: V3ProgramAuthorityStoreService
  client: V3ProgramStoreService
}> => {
  const observations: V3ProgramStoreObservations = {
    observeAcceptedMessageOccurrences: scope =>
      observeRecords(
        ref,
        scope,
        snapshot => snapshot.acceptedMessageOccurrences,
        acceptedMessageOccurrenceOrder,
      ),
    observeConnectionStatus: Stream.succeed('Authenticated'),
    observeEffectPlacements: scope =>
      observeRecords(
        ref,
        scope,
        snapshot => snapshot.effectPlacements,
        effectPlacementOrder,
      ),
    observeEffectRequests: scope =>
      observeRecords(
        ref,
        scope,
        snapshot => snapshot.effectRequests,
        effectRequestOrder,
      ),
    observeMessageProposals: scope =>
      observeRecords(
        ref,
        scope,
        snapshot => snapshot.messageProposals,
        messageProposalOrder,
      ),
    observeMessageProposalResolutions: scope =>
      observeRecords(
        ref,
        scope,
        snapshot => snapshot.messageProposalResolutions,
        messageProposalResolutionOrder,
      ),
    observeOriginEnrollmentClaims: scope =>
      observeOriginPolicyRecords(
        ref,
        scope,
        snapshot => snapshot.originEnrollmentClaims,
        identifiedRecordOrder,
      ),
    observeOriginPolicyDecisions: scope =>
      observeOriginPolicyRecords(
        ref,
        scope,
        snapshot => snapshot.originPolicyDecisions,
        originPolicyDecisionOrder,
      ),
    observeProgramSessions: scope =>
      observeRecords(
        ref,
        scope,
        snapshot => snapshot.programSessions,
        programSessionObservationOrder,
      ),
    observeProjectionCheckpoints: scope =>
      observeRecords(
        ref,
        scope,
        snapshot => snapshot.projectionCheckpoints,
        projectionCheckpointOrder,
      ),
  }

  const acceptedMessageOccurrenceAppendOptions = (
    occurrence: InstantV3AcceptedMessageOccurrenceRecord,
  ): AppendRecordOptions<
    InstantV3AcceptedMessageOccurrenceRecord,
    V3ProgramStoreServerConfirmedTransactionOutcome
  > => ({
    encode: S.encodeSync(acceptedMessageOccurrenceJson),
    entity: 'AcceptedMessageOccurrence',
    identityKeys: current => [
      recordIdentity('AcceptedSequencePositionKey', [
        current.acceptedSequencePositionKey,
      ]),
      recordIdentity('OccurrencePositionKey', [current.occurrencePositionKey]),
      recordIdentity('ProposalPositionKey', [current.proposalPositionKey]),
      recordIdentity('ActorSequencePositionKey', [
        current.actorSequencePositionKey,
      ]),
      ...(current.proposalKind === 'OrdinaryMessage'
        ? [
            recordIdentity('MessageIdempotencyPositionKey', [
              current.messageIdempotencyPositionKey,
            ]),
          ]
        : [
            recordIdentity('EffectIdempotencyPositionKey', [
              current.effectIdempotencyPositionKey,
            ]),
            recordIdentity('EffectRequestResultPositionKey', [
              current.effectRequestResultPositionKey,
            ]),
          ]),
    ],
    makeOutcome: serverOutcome(occurrence.id),
    recordsForSnapshot: snapshot => snapshot.acceptedMessageOccurrences,
    updateSnapshot: (snapshot, acceptedMessageOccurrences) => ({
      ...snapshot,
      acceptedMessageOccurrences,
    }),
    validateAppend: noAppendConflict,
  })

  const messageProposalResolutionAppendOptions = (
    resolution: InstantV3MessageProposalResolutionRecord,
  ): AppendRecordOptions<
    InstantV3MessageProposalResolutionRecord,
    V3ProgramStoreServerConfirmedTransactionOutcome
  > => ({
    encode: S.encodeSync(messageProposalResolutionJson),
    entity: 'MessageProposalResolution',
    identityKeys: current => [
      recordIdentity('ProposalTerminalPositionKey', [
        current.proposalTerminalPositionKey,
      ]),
      ...(current.resolutionState === 'Accepted'
        ? [
            recordIdentity('AcceptedMessageOccurrenceId', [
              current.acceptedMessageOccurrenceId,
            ]),
            recordIdentity('AcceptedMessageOccurrencePositionKey', [
              current.acceptedMessageOccurrencePositionKey,
            ]),
          ]
        : []),
    ],
    makeOutcome: serverOutcome(resolution.id),
    recordsForSnapshot: snapshot => snapshot.messageProposalResolutions,
    updateSnapshot: (snapshot, messageProposalResolutions) => ({
      ...snapshot,
      messageProposalResolutions,
    }),
    validateAppend: terminalGuardConflict,
  })

  const appendAcceptedMessageOccurrence = (
    transaction: V3ProgramStoreAcceptedMessageOccurrenceTransaction,
  ): Effect.Effect<
    V3ProgramStoreServerConfirmedTransactionOutcome,
    V3ProgramStoreAppendError
  > =>
    SubscriptionRef.modifyEffect(ref, snapshot => {
      const maybeMismatch =
        findV3ProgramStoreAcceptedMessageOccurrenceMismatch(transaction)
      if (Option.isSome(maybeMismatch)) {
        return Effect.fail(maybeMismatch.value)
      }
      return Effect.gen(function* () {
        const [resolutionOutcome, snapshotWithResolution] =
          yield* appendRecordToSnapshot(
            snapshot,
            transaction.resolution,
            messageProposalResolutionAppendOptions(transaction.resolution),
          )
        const [occurrenceOutcome, nextSnapshot] = yield* appendRecordToSnapshot(
          snapshotWithResolution,
          transaction.occurrence,
          acceptedMessageOccurrenceAppendOptions(transaction.occurrence),
        )
        if (resolutionOutcome.disposition !== occurrenceOutcome.disposition) {
          return yield* Effect.fail(
            acceptedMessageOccurrenceMismatch(
              transaction.resolution.proposalId,
              'AtomicPairIncomplete',
            ),
          )
        }
        return Tuple.make(resolutionOutcome, nextSnapshot)
      })
    })

  const appendMessageProposal = (
    record: InstantV3MessageProposalRecord,
  ): Effect.Effect<
    V3ProgramStoreTransactionOutcome,
    V3ProgramStoreAppendError
  > =>
    appendRecord(ref, record, {
      encode: S.encodeSync(messageProposalJson),
      entity: 'MessageProposal',
      identityKeys: proposal => [
        recordIdentity('ProposalPositionKey', [proposal.proposalPositionKey]),
        recordIdentity('OccurrencePositionKey', [
          proposal.occurrencePositionKey,
        ]),
        recordIdentity('ActorSequencePositionKey', [
          proposal.actorSequencePositionKey,
        ]),
        ...(proposal.proposalKind === 'OrdinaryMessage'
          ? [
              recordIdentity('MessageIdempotencyPositionKey', [
                proposal.messageIdempotencyPositionKey,
              ]),
            ]
          : [
              recordIdentity('EffectIdempotencyPositionKey', [
                proposal.effectIdempotencyPositionKey,
              ]),
              recordIdentity('EffectRequestResultPositionKey', [
                proposal.effectRequestResultPositionKey,
              ]),
            ]),
      ],
      makeOutcome: serverOutcome(record.id),
      recordsForSnapshot: snapshot => snapshot.messageProposals,
      updateSnapshot: (snapshot, messageProposals) => ({
        ...snapshot,
        messageProposals,
      }),
      validateAppend: noAppendConflict,
    })
  const appendOriginEnrollmentClaim = (
    record: InstantV3OriginEnrollmentClaimRecord,
  ): Effect.Effect<
    V3ProgramStoreTransactionOutcome,
    V3ProgramStoreAppendError
  > =>
    appendRecord(ref, record, {
      encode: S.encodeSync(originEnrollmentClaimJson),
      entity: 'OriginEnrollmentClaim',
      identityKeys: claim => [
        recordIdentity('EnrollmentClaimPositionKey', [
          claim.enrollmentClaimPositionKey,
        ]),
      ],
      makeOutcome: serverOutcome(record.id),
      recordsForSnapshot: snapshot => snapshot.originEnrollmentClaims,
      updateSnapshot: (snapshot, originEnrollmentClaims) => ({
        ...snapshot,
        originEnrollmentClaims,
      }),
      validateAppend: noAppendConflict,
    })

  const client = V3ProgramStore.of({
    appendMessageProposal,
    appendOriginEnrollmentClaim,
    observations,
  })

  const authority = V3ProgramAuthorityStore.of({
    authorityCapability: V3ProgramAuthorityStoreCapability.make({
      protocolVersion: 3,
    }),
    appendServerConfirmedAcceptedMessageOccurrence:
      appendAcceptedMessageOccurrence,
    appendServerConfirmedEffectPlacement: record =>
      appendRecord(ref, record, {
        encode: S.encodeSync(effectPlacementJson),
        entity: 'EffectPlacement',
        identityKeys: placement => [
          recordIdentity('PlacementPositionKey', [placement.positionKey]),
        ],
        makeOutcome: serverOutcome(record.id),
        recordsForSnapshot: snapshot => snapshot.effectPlacements,
        updateSnapshot: (snapshot, effectPlacements) => ({
          ...snapshot,
          effectPlacements,
        }),
        validateAppend: noAppendConflict,
      }),
    appendServerConfirmedEffectRequest: record =>
      appendRecord(ref, record, {
        encode: S.encodeSync(effectRequestJson),
        entity: 'EffectRequest',
        identityKeys: request => [
          recordIdentity('RequestPositionKey', [request.requestPositionKey]),
          recordIdentity('IdempotencyPositionKey', [
            request.idempotencyPositionKey,
          ]),
        ],
        makeOutcome: serverOutcome(record.id),
        recordsForSnapshot: snapshot => snapshot.effectRequests,
        updateSnapshot: (snapshot, effectRequests) => ({
          ...snapshot,
          effectRequests,
        }),
        validateAppend: noAppendConflict,
      }),
    appendServerConfirmedRejectedMessageProposalResolution: record =>
      appendRecord(ref, record, messageProposalResolutionAppendOptions(record)),
    appendServerConfirmedOriginPolicyDecision: record =>
      appendRecord(ref, record, {
        encode: S.encodeSync(originPolicyDecisionJson),
        entity: 'OriginPolicyDecision',
        identityKeys: decision => [
          recordIdentity('PolicyDecisionPositionKey', [decision.positionKey]),
        ],
        makeOutcome: serverOutcome(record.id),
        recordsForSnapshot: snapshot => snapshot.originPolicyDecisions,
        updateSnapshot: (snapshot, originPolicyDecisions) => ({
          ...snapshot,
          originPolicyDecisions,
        }),
        validateAppend: originPolicyDecisionAppendConflict,
      }),
    appendServerConfirmedProgramSession: record =>
      appendRecord(ref, record, {
        encode: S.encodeSync(programSessionJson),
        entity: 'ProgramSession',
        identityKeys: session => [
          recordIdentity('LifecyclePositionKey', [
            session.lifecyclePositionKey,
          ]),
        ],
        makeOutcome: serverOutcome(record.id),
        recordsForSnapshot: snapshot => snapshot.programSessions,
        updateSnapshot: (snapshot, programSessions) => ({
          ...snapshot,
          programSessions,
        }),
        validateAppend: programSessionAppendConflict,
      }),
    appendServerConfirmedProjectionCheckpoint: record =>
      appendRecord(ref, record, {
        encode: S.encodeSync(projectionCheckpointJson),
        entity: 'ProjectionCheckpoint',
        identityKeys: checkpoint => [
          recordIdentity('ProcessorCheckpointPositionKey', [
            checkpoint.processorCheckpointKey,
          ]),
        ],
        makeOutcome: serverOutcome(record.id),
        recordsForSnapshot: snapshot => snapshot.projectionCheckpoints,
        updateSnapshot: (snapshot, projectionCheckpoints) => ({
          ...snapshot,
          projectionCheckpoints,
        }),
        validateAppend: noAppendConflict,
      }),
    serverConfirmed: observations,
  })

  return { authority, client }
}

/** A paired Client and authority view over one always-connected immutable state. */
export type V3InMemoryProgramStores = Readonly<{
  authority: V3ProgramAuthorityStoreService
  client: V3ProgramStoreService
  readSnapshot: Effect.Effect<V3InMemoryProgramStoreSnapshot>
}>

/** Reconstructs paired always-connected protocol-v3 stores from one confirmed snapshot. */
export const makeV3InMemoryProgramStores = (
  initialSnapshot: V3InMemoryProgramStoreSnapshot = emptyV3InMemoryProgramStoreSnapshot,
): Effect.Effect<V3InMemoryProgramStores, V3ProgramStoreAppendError> =>
  Effect.gen(function* () {
    const ref = yield* SubscriptionRef.make(emptyV3InMemoryProgramStoreSnapshot)
    const stores = makeStoreServices(ref)
    const orderedAcceptedMessageOccurrences = Array.sort(
      initialSnapshot.acceptedMessageOccurrences,
      acceptedMessageOccurrenceOrder,
    )
    const orderedMessageProposalResolutions = Array.sort(
      initialSnapshot.messageProposalResolutions,
      messageProposalResolutionOrder,
    )
    const maybeOrphanedOccurrence = Array.findFirst(
      orderedAcceptedMessageOccurrences,
      occurrence =>
        !Array.some(
          orderedMessageProposalResolutions,
          resolution =>
            resolution.resolutionState === 'Accepted' &&
            resolution.acceptedMessageOccurrenceId === occurrence.id &&
            resolution.acceptedMessageOccurrencePositionKey ===
              occurrence.positionKey,
        ),
    )
    if (Option.isSome(maybeOrphanedOccurrence)) {
      return yield* Effect.fail(
        acceptedMessageOccurrenceMismatch(
          maybeOrphanedOccurrence.value.proposalId,
          'AtomicPairIncomplete',
        ),
      )
    }
    const maybeOrphanedResolution = Array.findFirst(
      orderedMessageProposalResolutions,
      resolution =>
        resolution.resolutionState === 'Accepted' &&
        !Array.some(
          orderedAcceptedMessageOccurrences,
          occurrence =>
            occurrence.id === resolution.acceptedMessageOccurrenceId &&
            occurrence.positionKey ===
              resolution.acceptedMessageOccurrencePositionKey,
        ),
    )
    if (Option.isSome(maybeOrphanedResolution)) {
      return yield* Effect.fail(
        acceptedMessageOccurrenceMismatch(
          maybeOrphanedResolution.value.proposalId,
          'AtomicPairIncomplete',
        ),
      )
    }
    yield* Effect.forEach(
      Array.sort(initialSnapshot.programSessions, programSessionReplayOrder),
      stores.authority.appendServerConfirmedProgramSession,
      { discard: true },
    )
    yield* Effect.forEach(
      initialSnapshot.originEnrollmentClaims,
      stores.client.appendOriginEnrollmentClaim,
      { discard: true },
    )
    yield* Effect.forEach(
      Array.sort(
        initialSnapshot.originPolicyDecisions,
        originPolicyDecisionReplayOrder,
      ),
      stores.authority.appendServerConfirmedOriginPolicyDecision,
      { discard: true },
    )
    yield* Effect.forEach(
      initialSnapshot.messageProposals,
      stores.client.appendMessageProposal,
      { discard: true },
    )
    yield* Effect.forEach(
      orderedMessageProposalResolutions,
      resolution => {
        if (resolution.resolutionState === 'Rejected') {
          return stores.authority.appendServerConfirmedRejectedMessageProposalResolution(
            resolution,
          )
        }
        const maybeOccurrence = Array.findFirst(
          orderedAcceptedMessageOccurrences,
          occurrence =>
            occurrence.id === resolution.acceptedMessageOccurrenceId &&
            occurrence.positionKey ===
              resolution.acceptedMessageOccurrencePositionKey,
        )
        if (Option.isNone(maybeOccurrence)) {
          return Effect.fail(
            acceptedMessageOccurrenceMismatch(
              resolution.proposalId,
              'AtomicPairIncomplete',
            ),
          )
        }
        return stores.authority.appendServerConfirmedAcceptedMessageOccurrence(
          V3ProgramStoreAcceptedMessageOccurrenceTransaction.make({
            occurrence: maybeOccurrence.value,
            resolution,
          }),
        )
      },
      { discard: true },
    )
    yield* Effect.forEach(
      initialSnapshot.effectRequests,
      stores.authority.appendServerConfirmedEffectRequest,
      { discard: true },
    )
    yield* Effect.forEach(
      initialSnapshot.effectPlacements,
      stores.authority.appendServerConfirmedEffectPlacement,
      { discard: true },
    )
    yield* Effect.forEach(
      initialSnapshot.projectionCheckpoints,
      stores.authority.appendServerConfirmedProjectionCheckpoint,
      { discard: true },
    )
    return {
      ...stores,
      readSnapshot: SubscriptionRef.get(ref),
    }
  })

/** Creates an ordinary Client view over a fresh always-connected protocol-v3 store. */
export const makeV3InMemoryProgramStore = (
  initialSnapshot?: V3InMemoryProgramStoreSnapshot,
): Effect.Effect<V3ProgramStoreService, V3ProgramStoreAppendError> =>
  Effect.map(makeV3InMemoryProgramStores(initialSnapshot), stores =>
    V3ProgramStore.of(stores.client),
  )

/** Creates a server-confirmed in-memory protocol-v3 authority store. */
export const makeV3InMemoryProgramAuthorityStore = (
  initialSnapshot?: V3InMemoryProgramStoreSnapshot,
): Effect.Effect<V3ProgramAuthorityStoreService, V3ProgramStoreAppendError> =>
  Effect.map(makeV3InMemoryProgramStores(initialSnapshot), stores =>
    V3ProgramAuthorityStore.of(stores.authority),
  )

/** Provides an ordinary Client view over a fresh always-connected protocol-v3 store. */
export const V3InMemoryProgramStoreLayer = Layer.effect(
  V3ProgramStore,
  makeV3InMemoryProgramStore(),
)

/** Provides a fresh server-confirmed in-memory protocol-v3 authority store. */
export const V3InMemoryProgramAuthorityStoreLayer = Layer.effect(
  V3ProgramAuthorityStore,
  makeV3InMemoryProgramAuthorityStore(),
)
