import { Context, Data, Effect, Option, Schema as S, Stream } from 'effect'

import {
  InstantV3AcceptedMessageOccurrenceRecord,
  InstantV3AcceptedMessageProposalResolutionRecord,
  InstantV3AppSubjectDigest,
  InstantV3EffectPlacementRecord,
  InstantV3EffectRequestRecord,
  InstantV3MessageProposalRecord,
  InstantV3MessageProposalResolutionRecord,
  InstantV3NonNegativeInteger,
  InstantV3OriginEnrollmentClaimRecord,
  InstantV3OriginPolicyDecisionRecord,
  InstantV3ProgramId,
  InstantV3ProgramProtocolVersion,
  InstantV3ProgramSessionId,
  InstantV3ProgramSessionRecord,
  InstantV3ProjectionCheckpointRecord,
  InstantV3RejectedMessageProposalResolutionRecord,
  InstantV3SessionEpochId,
} from '../v3Schema/index.js'

/** The complete protocol-v3 Program session scope isolated by every query. */
export const V3ProgramStoreScope = S.Struct({
  appSubjectDigest: InstantV3AppSubjectDigest,
  instantAppId: S.String,
  programId: InstantV3ProgramId,
  programVersion: InstantV3NonNegativeInteger,
  protocolVersion: InstantV3ProgramProtocolVersion,
  sessionEpochId: InstantV3SessionEpochId,
  sessionId: InstantV3ProgramSessionId,
  subjectId: S.String,
})
/** The complete protocol-v3 Program session scope isolated by every query. */
export type V3ProgramStoreScope = typeof V3ProgramStoreScope.Type

/** The app-subject scope shared by origin enrollment and policy decisions. */
export const V3OriginPolicyStoreScope = S.Struct({
  instantAppId: S.String,
  protocolVersion: InstantV3ProgramProtocolVersion,
  subjectId: S.String,
})
/** The app-subject scope shared by origin enrollment and policy decisions. */
export type V3OriginPolicyStoreScope = typeof V3OriginPolicyStoreScope.Type

/** The real connection state reported by a protocol-v3 transport. */
export const V3ProgramStoreConnectionStatus = S.Literals([
  'Connecting',
  'Opened',
  'Authenticated',
  'Closed',
  'Errored',
])
/** The real connection state reported by a protocol-v3 transport. */
export type V3ProgramStoreConnectionStatus =
  typeof V3ProgramStoreConnectionStatus.Type

/** Whether an immutable protocol-v3 row was appended or already existed exactly. */
export const V3ProgramStoreWriteDisposition = S.Literals([
  'Appended',
  'Idempotent',
])
/** Whether an immutable protocol-v3 row was appended or already existed exactly. */
export type V3ProgramStoreWriteDisposition =
  typeof V3ProgramStoreWriteDisposition.Type

/** A Client write retained for later server synchronization. */
export const V3ProgramStoreEnqueuedTransactionOutcome = S.TaggedStruct(
  'Enqueued',
  {
    clientId: S.String,
    disposition: V3ProgramStoreWriteDisposition,
  },
)
/** A Client write retained for later server synchronization. */
export type V3ProgramStoreEnqueuedTransactionOutcome =
  typeof V3ProgramStoreEnqueuedTransactionOutcome.Type

/** A protocol-v3 transaction confirmed by the authoritative server. */
export const V3ProgramStoreServerConfirmedTransactionOutcome = S.TaggedStruct(
  'ServerConfirmed',
  {
    disposition: V3ProgramStoreWriteDisposition,
    serverTransactionId: S.String,
  },
)
/** A protocol-v3 transaction confirmed by the authoritative server. */
export type V3ProgramStoreServerConfirmedTransactionOutcome =
  typeof V3ProgramStoreServerConfirmedTransactionOutcome.Type

/** The outcome visible to an ordinary offline-capable Client store. */
export const V3ProgramStoreTransactionOutcome = S.Union([
  V3ProgramStoreEnqueuedTransactionOutcome,
  V3ProgramStoreServerConfirmedTransactionOutcome,
])
/** The outcome visible to an ordinary offline-capable Client store. */
export type V3ProgramStoreTransactionOutcome =
  typeof V3ProgramStoreTransactionOutcome.Type

/** Constructs an outcome for a protocol-v3 write retained in a Client outbox. */
export const v3EnqueuedTransactionOutcome = (
  clientId: string,
  disposition: V3ProgramStoreWriteDisposition,
): V3ProgramStoreEnqueuedTransactionOutcome =>
  V3ProgramStoreEnqueuedTransactionOutcome.make({ clientId, disposition })

/** Constructs an outcome for a server-confirmed protocol-v3 write. */
export const v3ServerConfirmedTransactionOutcome = (
  serverTransactionId: string,
  disposition: V3ProgramStoreWriteDisposition,
): V3ProgramStoreServerConfirmedTransactionOutcome =>
  V3ProgramStoreServerConfirmedTransactionOutcome.make({
    disposition,
    serverTransactionId,
  })

/** One immutable protocol-v3 identity was reused for different contents. */
export class V3ProgramStoreIdentityConflict extends Data.TaggedError(
  'V3ProgramStoreIdentityConflict',
)<{
  readonly entity: V3ProgramStoreEntity
  readonly id: string
}> {}

/** Accepted and rejected terminal evidence cannot coexist for one proposal. */
export class V3ProgramStoreTerminalConflict extends Data.TaggedError(
  'V3ProgramStoreTerminalConflict',
)<{
  readonly attemptedTerminal: 'Accepted' | 'Rejected'
  readonly existingTerminal: 'Accepted' | 'Rejected'
  readonly proposalId: string
}> {}

/** Why an atomic Accepted guard and ordered occurrence do not form one write. */
export const V3ProgramStoreAcceptedMessageOccurrenceMismatchReason = S.Literals(
  [
    'AcceptedAuditMismatch',
    'AcceptedOccurrenceReferenceMismatch',
    'AtomicPairIncomplete',
    'ProposalMetadataMismatch',
    'ScopeMismatch',
  ],
)
/** Why an atomic Accepted guard and ordered occurrence do not form one write. */
export type V3ProgramStoreAcceptedMessageOccurrenceMismatchReason =
  typeof V3ProgramStoreAcceptedMessageOccurrenceMismatchReason.Type

/** An Accepted terminal guard does not exactly identify its ordered occurrence. */
export class V3ProgramStoreAcceptedMessageOccurrenceMismatch extends Data.TaggedError(
  'V3ProgramStoreAcceptedMessageOccurrenceMismatch',
)<{
  readonly proposalId: string
  readonly reason: V3ProgramStoreAcceptedMessageOccurrenceMismatchReason
}> {}

/** Finds the exact mismatch between an Accepted terminal guard and occurrence. */
export const findV3ProgramStoreAcceptedMessageOccurrenceMismatch = (
  transaction: Readonly<{
    occurrence: InstantV3AcceptedMessageOccurrenceRecord
    resolution: InstantV3AcceptedMessageProposalResolutionRecord
  }>,
): Option.Option<V3ProgramStoreAcceptedMessageOccurrenceMismatch> => {
  const { occurrence, resolution } = transaction
  const isSameScope =
    occurrence.appSubjectDigest === resolution.appSubjectDigest &&
    occurrence.instantAppId === resolution.instantAppId &&
    occurrence.programId === resolution.programId &&
    occurrence.programVersion === resolution.programVersion &&
    occurrence.protocolVersion === resolution.protocolVersion &&
    occurrence.sessionEpochId === resolution.sessionEpochId &&
    occurrence.sessionId === resolution.sessionId &&
    occurrence.subjectId === resolution.subjectId
  if (!isSameScope) {
    return Option.some(
      new V3ProgramStoreAcceptedMessageOccurrenceMismatch({
        proposalId: resolution.proposalId,
        reason: 'ScopeMismatch',
      }),
    )
  }
  const isSameProposalMetadata =
    occurrence.actorId === resolution.actorId &&
    occurrence.actorSequence === resolution.actorSequence &&
    occurrence.clientId === resolution.clientId &&
    occurrence.originDeviceId === resolution.originDeviceId &&
    occurrence.originatingProcessorId === resolution.originatingProcessorId &&
    occurrence.proposalId === resolution.proposalId &&
    occurrence.proposalKind === resolution.proposalKind
  if (!isSameProposalMetadata) {
    return Option.some(
      new V3ProgramStoreAcceptedMessageOccurrenceMismatch({
        proposalId: resolution.proposalId,
        reason: 'ProposalMetadataMismatch',
      }),
    )
  }
  const isSameOccurrenceReference =
    occurrence.id === resolution.acceptedMessageOccurrenceId &&
    occurrence.positionKey === resolution.acceptedMessageOccurrencePositionKey
  if (!isSameOccurrenceReference) {
    return Option.some(
      new V3ProgramStoreAcceptedMessageOccurrenceMismatch({
        proposalId: resolution.proposalId,
        reason: 'AcceptedOccurrenceReferenceMismatch',
      }),
    )
  }
  const isSameAuditMetadata =
    occurrence.acceptedAtMs === resolution.acceptedAtMs &&
    occurrence.acceptingProcessorId === resolution.acceptingProcessorId
  if (isSameAuditMetadata) {
    return Option.none()
  } else {
    return Option.some(
      new V3ProgramStoreAcceptedMessageOccurrenceMismatch({
        proposalId: resolution.proposalId,
        reason: 'AcceptedAuditMismatch',
      }),
    )
  }
}

/** The current logical state used while validating an origin-policy chain. */
export const V3OriginPolicyDecisionLifecycleState = S.Literals([
  'New',
  'Active',
  'Denied',
  'Revoked',
])
/** The current logical state used while validating an origin-policy chain. */
export type V3OriginPolicyDecisionLifecycleState =
  typeof V3OriginPolicyDecisionLifecycleState.Type

/** Why an immutable origin-policy decision generation was rejected. */
export const V3OriginPolicyDecisionLifecycleConflictReason = S.Literals([
  'DecisionGenerationNotSequential',
  'DecisionTimestampRegressed',
  'ImmutablePolicyChanged',
  'InitialDecisionRequired',
  'InvalidDecisionTransition',
  'PolicyPermanentlyTerminal',
])
/** Why an immutable origin-policy decision generation was rejected. */
export type V3OriginPolicyDecisionLifecycleConflictReason =
  typeof V3OriginPolicyDecisionLifecycleConflictReason.Type

/** An origin-policy decision violated its authority-owned lifecycle chain. */
export class V3OriginPolicyDecisionLifecycleConflict extends Data.TaggedError(
  'V3OriginPolicyDecisionLifecycleConflict',
)<{
  readonly currentDecisionState: V3OriginPolicyDecisionLifecycleState
  readonly currentGeneration: number
  readonly incomingDecisionState: V3OriginPolicyDecisionLifecycleState
  readonly incomingGeneration: number
  readonly originPolicyId: string
  readonly reason: V3OriginPolicyDecisionLifecycleConflictReason
}> {}

/** Why an immutable Program-session lifecycle generation was rejected. */
export const V3ProgramSessionLifecycleConflictReason = S.Literals([
  'ImmutableSessionChanged',
  'InitialGenerationRequired',
  'LifecycleGenerationNotSequential',
  'LifecycleTimestampRegressed',
  'PolicyGenerationNotSequential',
  'RevocationPolicyChanged',
  'SessionPermanentlyRevoked',
])
/** Why an immutable Program-session lifecycle generation was rejected. */
export type V3ProgramSessionLifecycleConflictReason =
  typeof V3ProgramSessionLifecycleConflictReason.Type

/** A Program-session generation violated the authority-owned lifecycle chain. */
export class V3ProgramSessionLifecycleConflict extends Data.TaggedError(
  'V3ProgramSessionLifecycleConflict',
)<{
  readonly currentLifecycleGeneration: number
  readonly currentPolicyGeneration: number
  readonly incomingLifecycleGeneration: number
  readonly incomingPolicyGeneration: number
  readonly reason: V3ProgramSessionLifecycleConflictReason
  readonly sessionId: string
}> {}

/** A durable protocol-v3 store operation failed unexpectedly. */
export class V3ProgramStoreError extends Data.TaggedError(
  'V3ProgramStoreError',
)<{
  readonly cause: unknown
  readonly operation: V3ProgramStoreOperation
}> {}

/** Every immutable entity persisted by the protocol-v3 Program store. */
export type V3ProgramStoreEntity =
  | 'AcceptedMessageOccurrence'
  | 'EffectPlacement'
  | 'EffectRequest'
  | 'MessageProposal'
  | 'MessageProposalResolution'
  | 'OriginEnrollmentClaim'
  | 'OriginPolicyDecision'
  | 'ProgramSession'
  | 'ProjectionCheckpoint'

/** Every operation surfaced by the protocol-v3 Program store contract. */
export type V3ProgramStoreOperation =
  | `Append${V3ProgramStoreEntity}`
  | `Observe${V3ProgramStoreEntity}s`

/** Expected immutable-write failures surfaced without defects. */
export type V3ProgramStoreAppendError =
  | V3OriginPolicyDecisionLifecycleConflict
  | V3ProgramStoreAcceptedMessageOccurrenceMismatch
  | V3ProgramStoreError
  | V3ProgramStoreIdentityConflict
  | V3ProgramSessionLifecycleConflict
  | V3ProgramStoreTerminalConflict

/** Client-visible protocol-v3 observations, including optimistic intake rows. */
export type V3ProgramStoreObservations = Readonly<{
  observeAcceptedMessageOccurrences: (
    scope: V3ProgramStoreScope,
  ) => Stream.Stream<
    ReadonlyArray<InstantV3AcceptedMessageOccurrenceRecord>,
    V3ProgramStoreError
  >
  observeConnectionStatus: Stream.Stream<V3ProgramStoreConnectionStatus>
  observeEffectPlacements: (
    scope: V3ProgramStoreScope,
  ) => Stream.Stream<
    ReadonlyArray<InstantV3EffectPlacementRecord>,
    V3ProgramStoreError
  >
  observeEffectRequests: (
    scope: V3ProgramStoreScope,
  ) => Stream.Stream<
    ReadonlyArray<InstantV3EffectRequestRecord>,
    V3ProgramStoreError
  >
  observeMessageProposals: (
    scope: V3ProgramStoreScope,
  ) => Stream.Stream<
    ReadonlyArray<InstantV3MessageProposalRecord>,
    V3ProgramStoreError
  >
  observeMessageProposalResolutions: (
    scope: V3ProgramStoreScope,
  ) => Stream.Stream<
    ReadonlyArray<InstantV3MessageProposalResolutionRecord>,
    V3ProgramStoreError
  >
  observeOriginEnrollmentClaims: (
    scope: V3OriginPolicyStoreScope,
  ) => Stream.Stream<
    ReadonlyArray<InstantV3OriginEnrollmentClaimRecord>,
    V3ProgramStoreError
  >
  observeOriginPolicyDecisions: (
    scope: V3OriginPolicyStoreScope,
  ) => Stream.Stream<
    ReadonlyArray<InstantV3OriginPolicyDecisionRecord>,
    V3ProgramStoreError
  >
  observeProgramSessions: (
    scope: V3ProgramStoreScope,
  ) => Stream.Stream<
    ReadonlyArray<InstantV3ProgramSessionRecord>,
    V3ProgramStoreError
  >
  observeProjectionCheckpoints: (
    scope: V3ProgramStoreScope,
  ) => Stream.Stream<
    ReadonlyArray<InstantV3ProjectionCheckpointRecord>,
    V3ProgramStoreError
  >
}>

/** Ordinary Client writes and observations without any authority capability. */
export type V3ProgramStoreService = Readonly<{
  appendMessageProposal: (
    record: InstantV3MessageProposalRecord,
  ) => Effect.Effect<
    V3ProgramStoreTransactionOutcome,
    V3ProgramStoreAppendError
  >
  appendOriginEnrollmentClaim: (
    record: InstantV3OriginEnrollmentClaimRecord,
  ) => Effect.Effect<
    V3ProgramStoreTransactionOutcome,
    V3ProgramStoreAppendError
  >
  observations: V3ProgramStoreObservations
}>

/** Nominal runtime evidence that writes and observations are server-confirmed. */
export const V3ProgramAuthorityStoreCapability = S.TaggedStruct(
  'ServerConfirmedAuthority',
  {
    protocolVersion: S.Literal(3),
  },
)
/** Nominal runtime evidence that writes and observations are server-confirmed. */
export type V3ProgramAuthorityStoreCapability =
  typeof V3ProgramAuthorityStoreCapability.Type

/** Server-confirmed protocol-v3 observations available only to authorities. */
export type V3ProgramAuthorityStoreObservations = V3ProgramStoreObservations

/** One atomic authority write for an Accepted guard and its ordered occurrence. */
export const V3ProgramStoreAcceptedMessageOccurrenceTransaction = S.Struct({
  occurrence: InstantV3AcceptedMessageOccurrenceRecord,
  resolution: InstantV3AcceptedMessageProposalResolutionRecord,
}).check(
  S.makeFilter(transaction => {
    const maybeMismatch =
      findV3ProgramStoreAcceptedMessageOccurrenceMismatch(transaction)
    if (Option.isSome(maybeMismatch)) {
      return {
        path: ['resolution'],
        issue: `An Accepted guard and occurrence must form one exact atomic pair: ${maybeMismatch.value.reason}.`,
      }
    } else {
      return undefined
    }
  }),
)
/** One atomic authority write for an Accepted guard and its ordered occurrence. */
export type V3ProgramStoreAcceptedMessageOccurrenceTransaction =
  typeof V3ProgramStoreAcceptedMessageOccurrenceTransaction.Type

/** Server-confirmed writes available only to a trusted protocol-v3 authority. */
export type V3ProgramAuthorityStoreService = Readonly<{
  authorityCapability: V3ProgramAuthorityStoreCapability
  appendServerConfirmedAcceptedMessageOccurrence: (
    transaction: V3ProgramStoreAcceptedMessageOccurrenceTransaction,
  ) => Effect.Effect<
    V3ProgramStoreServerConfirmedTransactionOutcome,
    V3ProgramStoreAppendError
  >
  appendServerConfirmedEffectPlacement: (
    record: InstantV3EffectPlacementRecord,
  ) => Effect.Effect<
    V3ProgramStoreServerConfirmedTransactionOutcome,
    V3ProgramStoreAppendError
  >
  appendServerConfirmedEffectRequest: (
    record: InstantV3EffectRequestRecord,
  ) => Effect.Effect<
    V3ProgramStoreServerConfirmedTransactionOutcome,
    V3ProgramStoreAppendError
  >
  appendServerConfirmedRejectedMessageProposalResolution: (
    record: InstantV3RejectedMessageProposalResolutionRecord,
  ) => Effect.Effect<
    V3ProgramStoreServerConfirmedTransactionOutcome,
    V3ProgramStoreAppendError
  >
  appendServerConfirmedOriginPolicyDecision: (
    record: InstantV3OriginPolicyDecisionRecord,
  ) => Effect.Effect<
    V3ProgramStoreServerConfirmedTransactionOutcome,
    V3ProgramStoreAppendError
  >
  appendServerConfirmedProgramSession: (
    record: InstantV3ProgramSessionRecord,
  ) => Effect.Effect<
    V3ProgramStoreServerConfirmedTransactionOutcome,
    V3ProgramStoreAppendError
  >
  appendServerConfirmedProjectionCheckpoint: (
    record: InstantV3ProjectionCheckpointRecord,
  ) => Effect.Effect<
    V3ProgramStoreServerConfirmedTransactionOutcome,
    V3ProgramStoreAppendError
  >
  serverConfirmed: V3ProgramAuthorityStoreObservations
}>

/** The ordinary protocol-v3 Program store selected by a Client. */
export class V3ProgramStore extends Context.Service<
  V3ProgramStore,
  V3ProgramStoreService
>()('@foldkit/instant/V3ProgramStore') {}

/** The server-confirmed protocol-v3 store selected by a trusted authority. */
export class V3ProgramAuthorityStore extends Context.Service<
  V3ProgramAuthorityStore,
  V3ProgramAuthorityStoreService
>()('@foldkit/instant/V3ProgramAuthorityStore') {}
