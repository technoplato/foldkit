import { Option, Schema as S } from 'effect'
import { Command, Processor, Synchronization } from 'foldkit'

import {
  InstantV3AdmissionClaimJson,
  InstantV3AppSubjectDigest,
  InstantV3CanonicalJson,
  InstantV3CompositeKey,
  InstantV3EntityId,
  InstantV3Identity,
  InstantV3MessageIdempotencyKey,
  InstantV3NonNegativeInteger,
  InstantV3OriginCertificateJson,
  InstantV3OriginPolicyProtocolVersion,
  InstantV3OriginPublicKey,
  InstantV3OriginSignature,
  InstantV3PositiveInteger,
  InstantV3ProgramId,
  InstantV3ProgramProtocolVersion,
  InstantV3ProgramSessionId,
  InstantV3Reason,
  InstantV3SessionEpochId,
  InstantV3Sha256Digest,
  InstantV3TimestampMs,
  instantV3ProtocolLimits,
  parseInstantV3ProgramSessionId,
  stringifyInstantV3CanonicalJson,
} from './identity.js'

const BoundedText = S.String.check(
  S.isLengthBetween(1, instantV3ProtocolLimits.identityLength),
)
const BoundedAuthorityIdentity = S.String.check(
  S.isLengthBetween(1, instantV3ProtocolLimits.positionKeyLength),
)
const CapabilityIdJson = S.fromJsonString(Processor.CapabilityId)
const Forbidden = S.optionalKey(S.NullOr(S.Never))

const ForbiddenClientRoutingFields = {
  audience: Forbidden,
  messageCategory: Forbidden,
  policyGeneration: Forbidden,
  proposedAudience: Forbidden,
}

const V3ScopeFields = {
  appSubjectDigest: InstantV3AppSubjectDigest,
  instantAppId: BoundedText,
  programId: InstantV3ProgramId,
  programVersion: InstantV3NonNegativeInteger,
  protocolVersion: InstantV3ProgramProtocolVersion,
  sessionEpochId: InstantV3SessionEpochId,
  sessionId: InstantV3ProgramSessionId,
  subjectId: BoundedText,
}

const instantV3ScopeIssue = (
  scope: Readonly<{
    appSubjectDigest: string
    programId: string
    programVersion: number
    sessionEpochId: string
    sessionId: string
  }>,
) => {
  const maybeIdentity = parseInstantV3ProgramSessionId(scope.sessionId)
  return Option.isSome(maybeIdentity) &&
    maybeIdentity.value.appSubjectDigest === scope.appSubjectDigest &&
    maybeIdentity.value.programId === scope.programId &&
    maybeIdentity.value.programVersion === scope.programVersion &&
    maybeIdentity.value.sessionEpochId === scope.sessionEpochId
    ? undefined
    : {
        path: ['sessionId'],
        issue:
          'Every session-scoped v3 row must match the exact canonical session digest and epoch.',
      }
}

const makeInstantV3TaggedPositionKey = (
  parts: ReadonlyArray<string | number>,
): InstantV3CompositeKey =>
  InstantV3CompositeKey.make(stringifyInstantV3CanonicalJson([...parts]))

/** Derives a proposal identity scoped to one exact protocol-v3 session epoch. */
export const makeInstantV3MessageProposalPositionKey = (
  sessionId: string,
  proposalId: string,
): InstantV3CompositeKey =>
  makeInstantV3TaggedPositionKey([
    'MessageProposal',
    sessionId,
    'ProposalId',
    proposalId,
  ])

/** Derives a proposal occurrence identity scoped to one exact protocol-v3 session epoch. */
export const makeInstantV3MessageProposalOccurrencePositionKey = (
  sessionId: string,
  occurrenceId: string,
): InstantV3CompositeKey =>
  makeInstantV3TaggedPositionKey([
    'MessageProposal',
    sessionId,
    'OccurrenceId',
    occurrenceId,
  ])

/** Derives a proposal actor sequence scoped to one exact Client and session epoch. */
export const makeInstantV3MessageProposalActorSequencePositionKey = (
  sessionId: string,
  actorId: string,
  clientId: string,
  actorSequence: number,
): InstantV3CompositeKey =>
  makeInstantV3TaggedPositionKey([
    'MessageProposal',
    sessionId,
    'ActorSequence',
    actorId,
    clientId,
    actorSequence,
  ])

/** Derives an ordinary-Message idempotency identity scoped to one exact session epoch. */
export const makeInstantV3MessageProposalMessageIdempotencyPositionKey = (
  sessionId: string,
  messageIdempotencyKey: string,
): InstantV3CompositeKey =>
  makeInstantV3TaggedPositionKey([
    'MessageProposal',
    sessionId,
    'MessageIdempotencyKey',
    messageIdempotencyKey,
  ])

/** Derives an effect-result idempotency identity scoped to one exact session epoch. */
export const makeInstantV3MessageProposalEffectIdempotencyPositionKey = (
  sessionId: string,
  effectIdempotencyKey: string,
): InstantV3CompositeKey =>
  makeInstantV3TaggedPositionKey([
    'MessageProposal',
    sessionId,
    'EffectIdempotencyKey',
    effectIdempotencyKey,
  ])

/** Derives the single result identity for an effect request in one exact session epoch. */
export const makeInstantV3MessageProposalEffectRequestResultPositionKey = (
  sessionId: string,
  effectRequestId: string,
): InstantV3CompositeKey =>
  makeInstantV3TaggedPositionKey([
    'MessageProposal',
    sessionId,
    'EffectRequestResult',
    effectRequestId,
  ])

const ProposalCommonFields = {
  actorId: BoundedText,
  actorSequence: InstantV3NonNegativeInteger,
  actorSequencePositionKey: InstantV3CompositeKey,
  causationOccurrenceId: S.NullOr(InstantV3Identity),
  clientId: InstantV3OriginPublicKey,
  correlationId: S.NullOr(InstantV3Identity),
  createdAtMs: InstantV3TimestampMs,
  envelopeJson: InstantV3CanonicalJson,
  envelopeVersion: InstantV3NonNegativeInteger,
  eventId: BoundedText,
  eventVersion: InstantV3NonNegativeInteger,
  id: InstantV3EntityId,
  occurrenceId: InstantV3Identity,
  occurrencePositionKey: InstantV3CompositeKey,
  originDeviceId: InstantV3OriginPublicKey,
  originatingProcessorId: InstantV3OriginPublicKey,
  payloadJson: InstantV3CanonicalJson,
  proposalId: InstantV3Identity,
  proposalPositionKey: InstantV3CompositeKey,
  ...V3ScopeFields,
}

const OrdinaryProposalFields = {
  admissionClaimJson: InstantV3AdmissionClaimJson,
  admissionOccurrenceId: InstantV3Identity,
  messageIdempotencyKey: InstantV3MessageIdempotencyKey,
  messageIdempotencyPositionKey: InstantV3CompositeKey,
  originClientCertificateJson: InstantV3OriginCertificateJson,
  originPolicyGeneration: InstantV3PositiveInteger,
  originPolicyId: InstantV3Identity,
  originProcessorCertificateJson: InstantV3OriginCertificateJson,
  originProposalSignature: InstantV3OriginSignature,
}

const EffectResultProposalFields = {
  causalAcceptedSequence: InstantV3PositiveInteger,
  causalAudience: Synchronization.Audience,
  causalMessageCategory: Synchronization.MessageCategory,
  causalOccurrenceId: InstantV3Identity,
  causalOriginDeviceId: InstantV3OriginPublicKey,
  causalOriginPolicyGeneration: InstantV3PositiveInteger,
  causalOriginPolicyId: InstantV3Identity,
  causalOriginProofDigest: InstantV3Sha256Digest,
  causalOriginatingProcessorId: InstantV3OriginPublicKey,
  causalPolicyGeneration: InstantV3NonNegativeInteger,
  causalProposalId: InstantV3Identity,
  effectAssignmentGeneration: InstantV3NonNegativeInteger,
  effectCancellationGeneration: InstantV3NonNegativeInteger,
  effectIdempotencyKey: InstantV3MessageIdempotencyKey,
  effectIdempotencyPositionKey: InstantV3CompositeKey,
  effectPlacementId: InstantV3CompositeKey,
  effectRequestId: InstantV3Identity,
  effectRequestResultPositionKey: InstantV3CompositeKey,
  executorClientCertificateJson: InstantV3OriginCertificateJson,
  executorOriginPolicyGeneration: InstantV3PositiveInteger,
  executorOriginPolicyId: InstantV3Identity,
  executorProcessorCertificateJson: InstantV3OriginCertificateJson,
  executorProcessorId: InstantV3OriginPublicKey,
  executorResultSignature: InstantV3OriginSignature,
}

const ForbiddenOrdinaryProposalFields = {
  admissionClaimJson: Forbidden,
  admissionOccurrenceId: Forbidden,
  messageIdempotencyKey: Forbidden,
  messageIdempotencyPositionKey: Forbidden,
  originClientCertificateJson: Forbidden,
  originPolicyGeneration: Forbidden,
  originPolicyId: Forbidden,
  originProcessorCertificateJson: Forbidden,
  originProposalSignature: Forbidden,
}

const ForbiddenEffectResultProposalFields = {
  causalAcceptedSequence: Forbidden,
  causalAudience: Forbidden,
  causalMessageCategory: Forbidden,
  causalOccurrenceId: Forbidden,
  causalOriginDeviceId: Forbidden,
  causalOriginPolicyGeneration: Forbidden,
  causalOriginPolicyId: Forbidden,
  causalOriginProofDigest: Forbidden,
  causalOriginatingProcessorId: Forbidden,
  causalPolicyGeneration: Forbidden,
  causalProposalId: Forbidden,
  effectAssignmentGeneration: Forbidden,
  effectCancellationGeneration: Forbidden,
  effectIdempotencyKey: Forbidden,
  effectIdempotencyPositionKey: Forbidden,
  effectPlacementId: Forbidden,
  effectRequestId: Forbidden,
  effectRequestResultPositionKey: Forbidden,
  executorClientCertificateJson: Forbidden,
  executorOriginPolicyGeneration: Forbidden,
  executorOriginPolicyId: Forbidden,
  executorProcessorCertificateJson: Forbidden,
  executorProcessorId: Forbidden,
  executorResultSignature: Forbidden,
}

/** The exact proposal variants accepted by the protocol-v3 intake path. */
export const InstantV3MessageProposalKind = S.Literals([
  'OrdinaryMessage',
  'EffectResult',
])
/** The exact proposal variants accepted by the protocol-v3 intake path. */
export type InstantV3MessageProposalKind =
  typeof InstantV3MessageProposalKind.Type

/** The authority-selected lifecycle state of one protocol-v3 Program session generation. */
export const InstantV3ProgramSessionLifecycleState = S.Literals([
  'Active',
  'Revoked',
])
/** The authority-selected lifecycle state of one protocol-v3 Program session generation. */
export type InstantV3ProgramSessionLifecycleState =
  typeof InstantV3ProgramSessionLifecycleState.Type

/** Derives one append-only lifecycle generation identity for a Program session. */
export const makeInstantV3ProgramSessionLifecyclePositionKey = (
  sessionId: string,
  lifecycleGeneration: number,
): InstantV3CompositeKey =>
  makeInstantV3TaggedPositionKey([
    'ProgramSession',
    sessionId,
    'LifecycleGeneration',
    lifecycleGeneration,
  ])

/** One immutable lifecycle generation for a protocol-v3 Program session. */
export const InstantV3ProgramSessionRecord = S.Struct({
  appSubjectDigest: InstantV3AppSubjectDigest,
  authorityProcessorId: BoundedAuthorityIdentity,
  createdAtMs: InstantV3TimestampMs,
  id: InstantV3EntityId,
  instantAppId: BoundedText,
  lifecycleGeneration: InstantV3PositiveInteger,
  lifecyclePositionKey: InstantV3CompositeKey,
  lifecycleState: InstantV3ProgramSessionLifecycleState,
  originPolicyProtocolVersion: InstantV3OriginPolicyProtocolVersion,
  previousLifecyclePositionKey: S.NullOr(InstantV3CompositeKey),
  processorRoomId: BoundedAuthorityIdentity,
  programId: InstantV3ProgramId,
  programVersion: InstantV3NonNegativeInteger,
  protocolVersion: InstantV3ProgramProtocolVersion,
  sessionEpochId: InstantV3SessionEpochId,
  sessionId: InstantV3ProgramSessionId,
  sessionPolicy: Synchronization.SessionPolicy,
  subjectId: BoundedText,
}).check(
  S.makeFilter(session => {
    const maybeIdentity = parseInstantV3ProgramSessionId(session.sessionId)
    const expectedLifecyclePositionKey =
      makeInstantV3ProgramSessionLifecyclePositionKey(
        session.sessionId,
        session.lifecycleGeneration,
      )
    const expectedPreviousLifecyclePositionKey =
      session.lifecycleGeneration === 1
        ? null
        : makeInstantV3ProgramSessionLifecyclePositionKey(
            session.sessionId,
            session.lifecycleGeneration - 1,
          )
    return Option.isSome(maybeIdentity) &&
      maybeIdentity.value.appSubjectDigest === session.appSubjectDigest &&
      maybeIdentity.value.originPolicyProtocolVersion ===
        session.originPolicyProtocolVersion &&
      maybeIdentity.value.programId === session.programId &&
      maybeIdentity.value.programVersion === session.programVersion &&
      maybeIdentity.value.sessionEpochId === session.sessionEpochId &&
      session.lifecyclePositionKey === expectedLifecyclePositionKey &&
      session.previousLifecyclePositionKey ===
        expectedPreviousLifecyclePositionKey &&
      (session.lifecycleGeneration !== 1 || session.lifecycleState === 'Active')
      ? undefined
      : {
          path: ['lifecyclePositionKey'],
          issue:
            'A Program session generation must match its canonical identity, exact predecessor, and initial Active state.',
        }
  }),
)
/** One immutable lifecycle generation for a protocol-v3 Program session. */
export type InstantV3ProgramSessionRecord =
  typeof InstantV3ProgramSessionRecord.Type

/** Derives an enrollment-claim identity within one authenticated app-subject scope. */
export const makeInstantV3OriginEnrollmentClaimPositionKey = (
  instantAppId: string,
  subjectId: string,
  protocolVersion: number,
  enrollmentClaimId: string,
): InstantV3CompositeKey =>
  makeInstantV3TaggedPositionKey([
    'OriginEnrollmentClaim',
    instantAppId,
    subjectId,
    protocolVersion,
    'EnrollmentClaimId',
    enrollmentClaimId,
  ])

/** A Device-origin enrollment claim written under one authenticated app subject. */
export const InstantV3OriginEnrollmentClaimRecord = S.Struct({
  claimSignature: InstantV3OriginSignature,
  claimedAtMs: InstantV3TimestampMs,
  enrollmentClaimId: InstantV3Identity,
  enrollmentClaimPositionKey: InstantV3CompositeKey,
  id: InstantV3EntityId,
  instantAppId: BoundedText,
  originDeviceId: InstantV3OriginPublicKey,
  protocolVersion: InstantV3ProgramProtocolVersion,
  subjectId: BoundedText,
}).check(
  S.makeFilter(claim =>
    claim.enrollmentClaimPositionKey ===
    makeInstantV3OriginEnrollmentClaimPositionKey(
      claim.instantAppId,
      claim.subjectId,
      claim.protocolVersion,
      claim.enrollmentClaimId,
    )
      ? undefined
      : {
          path: ['enrollmentClaimPositionKey'],
          issue:
            'An enrollment claim must use its exact app-subject-scoped identity.',
        },
  ),
)
/** A Device-origin enrollment claim written under one authenticated app subject. */
export type InstantV3OriginEnrollmentClaimRecord =
  typeof InstantV3OriginEnrollmentClaimRecord.Type

/** An origin policy is active for its exact app subject and Device. */
export const InstantV3ActiveOriginPolicyDecision = S.TaggedStruct('Active', {})
/** An origin policy is active for its exact app subject and Device. */
export type InstantV3ActiveOriginPolicyDecision =
  typeof InstantV3ActiveOriginPolicyDecision.Type

/** An origin enrollment claim was denied by the server authority. */
export const InstantV3DeniedOriginPolicyDecision = S.TaggedStruct('Denied', {
  reason: InstantV3Reason,
})
/** An origin enrollment claim was denied by the server authority. */
export type InstantV3DeniedOriginPolicyDecision =
  typeof InstantV3DeniedOriginPolicyDecision.Type

/** A previously established origin policy was revoked by the server authority. */
export const InstantV3RevokedOriginPolicyDecision = S.TaggedStruct('Revoked', {
  reason: InstantV3Reason,
})
/** A previously established origin policy was revoked by the server authority. */
export type InstantV3RevokedOriginPolicyDecision =
  typeof InstantV3RevokedOriginPolicyDecision.Type

/** A server-authoritative origin-policy decision, never an absence placeholder. */
export const InstantV3OriginPolicyDecision = S.Union([
  InstantV3ActiveOriginPolicyDecision,
  InstantV3DeniedOriginPolicyDecision,
  InstantV3RevokedOriginPolicyDecision,
])
/** A server-authoritative origin-policy decision, never an absence placeholder. */
export type InstantV3OriginPolicyDecision =
  typeof InstantV3OriginPolicyDecision.Type

/** The indexed states of a server-authoritative origin-policy decision. */
export const InstantV3OriginPolicyDecisionState = S.Literals([
  'Active',
  'Denied',
  'Revoked',
])
/** The indexed states of a server-authoritative origin-policy decision. */
export type InstantV3OriginPolicyDecisionState =
  typeof InstantV3OriginPolicyDecisionState.Type

/** Derives the append-only identity for one origin-policy decision generation. */
export const makeInstantV3OriginPolicyDecisionPositionKey = (
  instantAppId: string,
  subjectId: string,
  protocolVersion: number,
  originPolicyId: string,
  generation: number,
): InstantV3CompositeKey =>
  makeInstantV3TaggedPositionKey([
    'OriginPolicyDecision',
    instantAppId,
    subjectId,
    protocolVersion,
    'PolicyGeneration',
    originPolicyId,
    generation,
  ])

/** One append-only server-authoritative origin-policy decision generation. */
export const InstantV3OriginPolicyDecisionRecord = S.Struct({
  decidedAtMs: InstantV3TimestampMs,
  decidingProcessorId: BoundedAuthorityIdentity,
  decision: InstantV3OriginPolicyDecision,
  decisionId: InstantV3CompositeKey,
  decisionState: InstantV3OriginPolicyDecisionState,
  enrollmentClaimId: InstantV3Identity,
  enrollmentClaimPositionKey: InstantV3CompositeKey,
  generation: InstantV3PositiveInteger,
  id: InstantV3EntityId,
  instantAppId: BoundedText,
  originDeviceId: InstantV3OriginPublicKey,
  originPolicyId: InstantV3Identity,
  positionKey: InstantV3CompositeKey,
  previousDecisionId: S.NullOr(InstantV3CompositeKey),
  protocolVersion: InstantV3ProgramProtocolVersion,
  subjectId: BoundedText,
}).check(
  S.makeFilter(decision => {
    const expectedPositionKey = makeInstantV3OriginPolicyDecisionPositionKey(
      decision.instantAppId,
      decision.subjectId,
      decision.protocolVersion,
      decision.originPolicyId,
      decision.generation,
    )
    const expectedEnrollmentClaimPositionKey =
      makeInstantV3OriginEnrollmentClaimPositionKey(
        decision.instantAppId,
        decision.subjectId,
        decision.protocolVersion,
        decision.enrollmentClaimId,
      )
    const expectedPreviousDecisionId =
      decision.generation === 1
        ? null
        : makeInstantV3OriginPolicyDecisionPositionKey(
            decision.instantAppId,
            decision.subjectId,
            decision.protocolVersion,
            decision.originPolicyId,
            decision.generation - 1,
          )
    return decision.decisionId === decision.positionKey &&
      decision.positionKey === expectedPositionKey &&
      decision.enrollmentClaimPositionKey ===
        expectedEnrollmentClaimPositionKey &&
      decision.decision._tag === decision.decisionState &&
      decision.previousDecisionId === expectedPreviousDecisionId &&
      (decision.generation !== 1 || decision.decisionState !== 'Revoked')
      ? undefined
      : {
          path: ['decisionId'],
          issue:
            'An origin-policy decision must have canonical append-only identity, state, and previous-generation linkage.',
        }
  }),
)
/** One append-only server-authoritative origin-policy decision generation. */
export type InstantV3OriginPolicyDecisionRecord =
  typeof InstantV3OriginPolicyDecisionRecord.Type

/** A strictly ordinary Message proposal with deterministic admission proof. */
export const InstantV3OrdinaryMessageProposalRecord = S.Struct({
  ...ProposalCommonFields,
  proposalKind: S.Literal('OrdinaryMessage'),
  ...OrdinaryProposalFields,
  ...ForbiddenEffectResultProposalFields,
  ...ForbiddenClientRoutingFields,
}).check(
  S.makeFilter(proposal => {
    const scopeIssue = instantV3ScopeIssue(proposal)
    if (scopeIssue !== undefined) {
      return scopeIssue
    }
    return proposal.occurrenceId === proposal.admissionOccurrenceId &&
      proposal.proposalPositionKey ===
        makeInstantV3MessageProposalPositionKey(
          proposal.sessionId,
          proposal.proposalId,
        ) &&
      proposal.occurrencePositionKey ===
        makeInstantV3MessageProposalOccurrencePositionKey(
          proposal.sessionId,
          proposal.occurrenceId,
        ) &&
      proposal.actorSequencePositionKey ===
        makeInstantV3MessageProposalActorSequencePositionKey(
          proposal.sessionId,
          proposal.actorId,
          proposal.clientId,
          proposal.actorSequence,
        ) &&
      proposal.messageIdempotencyPositionKey ===
        makeInstantV3MessageProposalMessageIdempotencyPositionKey(
          proposal.sessionId,
          proposal.messageIdempotencyKey,
        )
      ? undefined
      : {
          path: ['proposalPositionKey'],
          issue:
            'An ordinary proposal must use its exact scoped identities and admission occurrence.',
        }
  }),
)
/** A strictly ordinary Message proposal with deterministic admission proof. */
export type InstantV3OrdinaryMessageProposalRecord =
  typeof InstantV3OrdinaryMessageProposalRecord.Type

/** A strict effect-result proposal linked to one verified causal placement. */
export const InstantV3EffectResultProposalRecord = S.Struct({
  ...ProposalCommonFields,
  proposalKind: S.Literal('EffectResult'),
  ...EffectResultProposalFields,
  ...ForbiddenOrdinaryProposalFields,
  ...ForbiddenClientRoutingFields,
}).check(
  S.makeFilter(proposal => {
    const scopeIssue = instantV3ScopeIssue(proposal)
    if (scopeIssue !== undefined) {
      return scopeIssue
    }
    return proposal.executorProcessorId === proposal.originatingProcessorId &&
      proposal.proposalPositionKey ===
        makeInstantV3MessageProposalPositionKey(
          proposal.sessionId,
          proposal.proposalId,
        ) &&
      proposal.occurrencePositionKey ===
        makeInstantV3MessageProposalOccurrencePositionKey(
          proposal.sessionId,
          proposal.occurrenceId,
        ) &&
      proposal.actorSequencePositionKey ===
        makeInstantV3MessageProposalActorSequencePositionKey(
          proposal.sessionId,
          proposal.actorId,
          proposal.clientId,
          proposal.actorSequence,
        ) &&
      proposal.effectIdempotencyPositionKey ===
        makeInstantV3MessageProposalEffectIdempotencyPositionKey(
          proposal.sessionId,
          proposal.effectIdempotencyKey,
        ) &&
      proposal.effectRequestResultPositionKey ===
        makeInstantV3MessageProposalEffectRequestResultPositionKey(
          proposal.sessionId,
          proposal.effectRequestId,
        ) &&
      proposal.effectPlacementId ===
        makeInstantV3EffectPlacementPositionKey(
          proposal.sessionId,
          proposal.effectRequestId,
          proposal.effectAssignmentGeneration,
          proposal.effectCancellationGeneration,
        )
      ? undefined
      : {
          path: ['proposalPositionKey'],
          issue:
            'An effect-result proposal must use its exact scoped identities and originating executor Processor.',
        }
  }),
)
/** A strict effect-result proposal linked to one verified causal placement. */
export type InstantV3EffectResultProposalRecord =
  typeof InstantV3EffectResultProposalRecord.Type

/** A structurally separated ordinary-Message or effect-result proposal. */
export const InstantV3MessageProposalRecord = S.Union([
  InstantV3OrdinaryMessageProposalRecord,
  InstantV3EffectResultProposalRecord,
])
/** A structurally separated ordinary-Message or effect-result proposal. */
export type InstantV3MessageProposalRecord =
  typeof InstantV3MessageProposalRecord.Type

/** Derives an accepted sequence identity scoped to one exact protocol-v3 session epoch. */
export const makeInstantV3AcceptedSequencePositionKey = (
  sessionId: string,
  acceptedSequence: number,
): InstantV3CompositeKey =>
  makeInstantV3TaggedPositionKey([
    'AcceptedMessageOccurrence',
    sessionId,
    'AcceptedSequence',
    acceptedSequence,
  ])

/** Derives an accepted occurrence identity scoped to one exact protocol-v3 session epoch. */
export const makeInstantV3AcceptedOccurrencePositionKey = (
  sessionId: string,
  occurrenceId: string,
): InstantV3CompositeKey =>
  makeInstantV3TaggedPositionKey([
    'AcceptedMessageOccurrence',
    sessionId,
    'OccurrenceId',
    occurrenceId,
  ])

/** Derives an accepted proposal identity scoped to one exact protocol-v3 session epoch. */
export const makeInstantV3AcceptedProposalPositionKey = (
  sessionId: string,
  proposalId: string,
): InstantV3CompositeKey =>
  makeInstantV3TaggedPositionKey([
    'AcceptedMessageOccurrence',
    sessionId,
    'ProposalId',
    proposalId,
  ])

/** Derives an accepted actor sequence scoped to one exact Client and session epoch. */
export const makeInstantV3AcceptedActorSequencePositionKey = (
  sessionId: string,
  actorId: string,
  clientId: string,
  actorSequence: number,
): InstantV3CompositeKey =>
  makeInstantV3TaggedPositionKey([
    'AcceptedMessageOccurrence',
    sessionId,
    'ActorSequence',
    actorId,
    clientId,
    actorSequence,
  ])

/** Derives an accepted ordinary-Message idempotency identity in one session epoch. */
export const makeInstantV3AcceptedMessageIdempotencyPositionKey = (
  sessionId: string,
  messageIdempotencyKey: string,
): InstantV3CompositeKey =>
  makeInstantV3TaggedPositionKey([
    'AcceptedMessageOccurrence',
    sessionId,
    'MessageIdempotencyKey',
    messageIdempotencyKey,
  ])

/** Derives an accepted effect-result idempotency identity in one session epoch. */
export const makeInstantV3AcceptedEffectIdempotencyPositionKey = (
  sessionId: string,
  effectIdempotencyKey: string,
): InstantV3CompositeKey =>
  makeInstantV3TaggedPositionKey([
    'AcceptedMessageOccurrence',
    sessionId,
    'EffectIdempotencyKey',
    effectIdempotencyKey,
  ])

/** Derives the accepted result identity for one effect request in one session epoch. */
export const makeInstantV3AcceptedEffectRequestResultPositionKey = (
  sessionId: string,
  effectRequestId: string,
): InstantV3CompositeKey =>
  makeInstantV3TaggedPositionKey([
    'AcceptedMessageOccurrence',
    sessionId,
    'EffectRequestResult',
    effectRequestId,
  ])

const AcceptedOccurrenceCommonFields = {
  acceptedAtMs: InstantV3TimestampMs,
  acceptedSequence: InstantV3PositiveInteger,
  acceptedSequencePositionKey: InstantV3CompositeKey,
  acceptingProcessorId: BoundedAuthorityIdentity,
  actorId: BoundedText,
  actorSequence: InstantV3NonNegativeInteger,
  actorSequencePositionKey: InstantV3CompositeKey,
  audience: Synchronization.Audience,
  causationId: S.NullOr(InstantV3Identity),
  clientId: InstantV3OriginPublicKey,
  correlationId: S.NullOr(InstantV3Identity),
  createdAtMs: InstantV3TimestampMs,
  envelopeJson: InstantV3CanonicalJson,
  envelopeVersion: InstantV3NonNegativeInteger,
  eventId: BoundedText,
  eventVersion: InstantV3NonNegativeInteger,
  id: InstantV3EntityId,
  messageCategory: Synchronization.MessageCategory,
  occurrenceId: InstantV3Identity,
  occurrencePositionKey: InstantV3CompositeKey,
  originDeviceId: InstantV3OriginPublicKey,
  originatingProcessorId: InstantV3OriginPublicKey,
  payloadJson: InstantV3CanonicalJson,
  policyGeneration: InstantV3NonNegativeInteger,
  positionKey: InstantV3CompositeKey,
  proposedEnvelopeJson: InstantV3CanonicalJson,
  proposalId: InstantV3Identity,
  proposalPositionKey: InstantV3CompositeKey,
  sessionPolicy: Synchronization.SessionPolicy,
  ...V3ScopeFields,
}

const acceptedOccurrenceFilter = (
  occurrence: Readonly<{
    acceptedSequence: number
    acceptedSequencePositionKey: string
    actorId: string
    actorSequence: number
    actorSequencePositionKey: string
    appSubjectDigest: string
    clientId: string
    occurrenceId: string
    occurrencePositionKey: string
    positionKey: string
    programId: string
    programVersion: number
    sessionEpochId: string
    sessionId: string
    proposalId: string
    proposalPositionKey: string
  }>,
) =>
  instantV3ScopeIssue(occurrence) ??
  (occurrence.acceptedSequencePositionKey ===
    makeInstantV3AcceptedSequencePositionKey(
      occurrence.sessionId,
      occurrence.acceptedSequence,
    ) &&
  occurrence.positionKey === occurrence.acceptedSequencePositionKey &&
  occurrence.occurrencePositionKey ===
    makeInstantV3AcceptedOccurrencePositionKey(
      occurrence.sessionId,
      occurrence.occurrenceId,
    ) &&
  occurrence.proposalPositionKey ===
    makeInstantV3AcceptedProposalPositionKey(
      occurrence.sessionId,
      occurrence.proposalId,
    ) &&
  occurrence.actorSequencePositionKey ===
    makeInstantV3AcceptedActorSequencePositionKey(
      occurrence.sessionId,
      occurrence.actorId,
      occurrence.clientId,
      occurrence.actorSequence,
    )
    ? undefined
    : {
        path: ['acceptedSequencePositionKey'],
        issue:
          'An accepted occurrence must use its exact scoped sequence and alias identities.',
      })

/** One accepted ordinary Message occurrence with retained admission proof. */
export const InstantV3AcceptedOrdinaryMessageOccurrenceRecord = S.Struct({
  ...AcceptedOccurrenceCommonFields,
  proposalKind: S.Literal('OrdinaryMessage'),
  ...OrdinaryProposalFields,
  ...ForbiddenEffectResultProposalFields,
}).check(
  S.makeFilter(occurrence => {
    const issue = acceptedOccurrenceFilter(occurrence)
    if (issue !== undefined) {
      return issue
    }
    return occurrence.occurrenceId === occurrence.admissionOccurrenceId &&
      occurrence.messageIdempotencyPositionKey ===
        makeInstantV3AcceptedMessageIdempotencyPositionKey(
          occurrence.sessionId,
          occurrence.messageIdempotencyKey,
        )
      ? undefined
      : {
          path: ['messageIdempotencyPositionKey'],
          issue:
            'An accepted ordinary Message must retain its exact scoped idempotency and admission occurrence identities.',
        }
  }),
)
/** One accepted ordinary Message occurrence with retained admission proof. */
export type InstantV3AcceptedOrdinaryMessageOccurrenceRecord =
  typeof InstantV3AcceptedOrdinaryMessageOccurrenceRecord.Type

/** One accepted effect-result occurrence with verified causal proof lineage. */
export const InstantV3AcceptedEffectResultOccurrenceRecord = S.Struct({
  ...AcceptedOccurrenceCommonFields,
  proposalKind: S.Literal('EffectResult'),
  ...EffectResultProposalFields,
  ...ForbiddenOrdinaryProposalFields,
}).check(
  S.makeFilter(occurrence => {
    const issue = acceptedOccurrenceFilter(occurrence)
    if (issue !== undefined) {
      return issue
    }
    return occurrence.executorProcessorId ===
      occurrence.originatingProcessorId &&
      occurrence.effectIdempotencyPositionKey ===
        makeInstantV3AcceptedEffectIdempotencyPositionKey(
          occurrence.sessionId,
          occurrence.effectIdempotencyKey,
        ) &&
      occurrence.effectRequestResultPositionKey ===
        makeInstantV3AcceptedEffectRequestResultPositionKey(
          occurrence.sessionId,
          occurrence.effectRequestId,
        ) &&
      occurrence.effectPlacementId ===
        makeInstantV3EffectPlacementPositionKey(
          occurrence.sessionId,
          occurrence.effectRequestId,
          occurrence.effectAssignmentGeneration,
          occurrence.effectCancellationGeneration,
        )
      ? undefined
      : {
          path: ['effectIdempotencyPositionKey'],
          issue:
            'An accepted effect result must retain its exact scoped effect identities and originating executor Processor.',
        }
  }),
)
/** One accepted effect-result occurrence with verified causal proof lineage. */
export type InstantV3AcceptedEffectResultOccurrenceRecord =
  typeof InstantV3AcceptedEffectResultOccurrenceRecord.Type

/** One globally ordered protocol-v3 Message occurrence admitted by the authority. */
export const InstantV3AcceptedMessageOccurrenceRecord = S.Union([
  InstantV3AcceptedOrdinaryMessageOccurrenceRecord,
  InstantV3AcceptedEffectResultOccurrenceRecord,
])
/** One globally ordered protocol-v3 Message occurrence admitted by the authority. */
export type InstantV3AcceptedMessageOccurrenceRecord =
  typeof InstantV3AcceptedMessageOccurrenceRecord.Type

/** A safe terminal reason why a protocol-v3 authority rejected a proposal. */
export const InstantV3MessageProposalRejectionReason = S.Literals([
  'AdmissionClaimInvalid',
  'AdmissionClaimRejected',
  'CausalLinkageInvalid',
  'DuplicateEffectResult',
  'DuplicateOrdinaryMessage',
  'EffectResultMismatch',
  'EnvelopeInvalid',
  'IdentityConflict',
  'OriginPolicyDenied',
  'OriginPolicyGenerationMismatch',
  'OriginProofInvalid',
  'ProposalKindMismatch',
  'ScopeMismatch',
  'SynchronizationPolicyMismatch',
])
/** A safe terminal reason why a protocol-v3 authority rejected a proposal. */
export type InstantV3MessageProposalRejectionReason =
  typeof InstantV3MessageProposalRejectionReason.Type

/** Derives the single terminal identity for one proposal in one session epoch. */
export const makeInstantV3MessageProposalResolutionPositionKey = (
  sessionId: string,
  proposalId: string,
): InstantV3CompositeKey =>
  makeInstantV3TaggedPositionKey([
    'MessageProposalResolution',
    sessionId,
    'ProposalTerminal',
    proposalId,
  ])

const MessageProposalResolutionCommonFields = {
  actorId: BoundedText,
  actorSequence: InstantV3NonNegativeInteger,
  clientId: InstantV3OriginPublicKey,
  id: InstantV3EntityId,
  originDeviceId: InstantV3OriginPublicKey,
  originatingProcessorId: InstantV3OriginPublicKey,
  proposalId: InstantV3Identity,
  proposalKind: InstantV3MessageProposalKind,
  proposalTerminalPositionKey: InstantV3CompositeKey,
  ...V3ScopeFields,
}

const ForbiddenAcceptedMessageProposalResolutionFields = {
  acceptedAtMs: Forbidden,
  acceptedMessageOccurrenceId: Forbidden,
  acceptedMessageOccurrencePositionKey: Forbidden,
  acceptingProcessorId: Forbidden,
}

const RejectedMessageProposalResolutionFields = {
  rejectedAtMs: InstantV3TimestampMs,
  rejectingProcessorId: BoundedAuthorityIdentity,
  rejectionReason: InstantV3MessageProposalRejectionReason,
}

const ForbiddenRejectedMessageProposalResolutionFields = {
  rejectedAtMs: Forbidden,
  rejectingProcessorId: Forbidden,
  rejectionReason: Forbidden,
}

const messageProposalResolutionFilter = (
  resolution: Readonly<{
    appSubjectDigest: string
    programId: string
    programVersion: number
    proposalId: string
    proposalTerminalPositionKey: string
    sessionEpochId: string
    sessionId: string
  }>,
) =>
  instantV3ScopeIssue(resolution) ??
  (resolution.proposalTerminalPositionKey ===
  makeInstantV3MessageProposalResolutionPositionKey(
    resolution.sessionId,
    resolution.proposalId,
  )
    ? undefined
    : {
        path: ['proposalTerminalPositionKey'],
        issue:
          'A proposal resolution must use its exact scoped terminal identity.',
      })

/** The terminal Accepted guard that points to one ordered Message occurrence. */
export const InstantV3AcceptedMessageProposalResolutionRecord = S.Struct({
  ...MessageProposalResolutionCommonFields,
  acceptedAtMs: InstantV3TimestampMs,
  acceptedMessageOccurrenceId: InstantV3EntityId,
  acceptedMessageOccurrencePositionKey: InstantV3CompositeKey,
  acceptingProcessorId: BoundedAuthorityIdentity,
  resolutionState: S.Literal('Accepted'),
  ...ForbiddenRejectedMessageProposalResolutionFields,
}).check(S.makeFilter(messageProposalResolutionFilter))
/** The terminal Accepted guard that points to one ordered Message occurrence. */
export type InstantV3AcceptedMessageProposalResolutionRecord =
  typeof InstantV3AcceptedMessageProposalResolutionRecord.Type

/** The terminal Rejected guard retaining a safe authority rejection reason. */
export const InstantV3RejectedMessageProposalResolutionRecord = S.Struct({
  ...MessageProposalResolutionCommonFields,
  resolutionState: S.Literal('Rejected'),
  ...ForbiddenAcceptedMessageProposalResolutionFields,
  ...RejectedMessageProposalResolutionFields,
}).check(S.makeFilter(messageProposalResolutionFilter))
/** The terminal Rejected guard retaining a safe authority rejection reason. */
export type InstantV3RejectedMessageProposalResolutionRecord =
  typeof InstantV3RejectedMessageProposalResolutionRecord.Type

/** The single append-only Accepted or Rejected terminal guard for one proposal. */
export const InstantV3MessageProposalResolutionRecord = S.Union([
  InstantV3AcceptedMessageProposalResolutionRecord,
  InstantV3RejectedMessageProposalResolutionRecord,
])
/** The single append-only Accepted or Rejected terminal guard for one proposal. */
export type InstantV3MessageProposalResolutionRecord =
  typeof InstantV3MessageProposalResolutionRecord.Type

const CausalRoutingAndProofFields = {
  causalAcceptedSequence: InstantV3PositiveInteger,
  causalAudience: Synchronization.Audience,
  causalMessageCategory: Synchronization.MessageCategory,
  causalOccurrenceId: InstantV3Identity,
  causalOriginDeviceId: InstantV3OriginPublicKey,
  causalOriginPolicyGeneration: InstantV3PositiveInteger,
  causalOriginPolicyId: InstantV3Identity,
  causalOriginProofDigest: InstantV3Sha256Digest,
  causalOriginatingProcessorId: InstantV3OriginPublicKey,
  causalPolicyGeneration: InstantV3NonNegativeInteger,
  causalProposalId: InstantV3Identity,
}

/** Derives an effect-request identity scoped to one exact protocol-v3 session epoch. */
export const makeInstantV3EffectRequestPositionKey = (
  sessionId: string,
  requestId: string,
): InstantV3CompositeKey =>
  makeInstantV3TaggedPositionKey([
    'EffectRequest',
    sessionId,
    'RequestId',
    requestId,
  ])

/** Derives an effect-request idempotency identity scoped to one exact session epoch. */
export const makeInstantV3EffectRequestIdempotencyPositionKey = (
  sessionId: string,
  idempotencyKey: string,
): InstantV3CompositeKey =>
  makeInstantV3TaggedPositionKey([
    'EffectRequest',
    sessionId,
    'IdempotencyKey',
    idempotencyKey,
  ])

/** A durable protocol-v3 request for one capable Processor to perform an effect. */
export const InstantV3EffectRequestRecord = S.Struct({
  ...CausalRoutingAndProofFields,
  effectId: BoundedText,
  effectVersion: InstantV3NonNegativeInteger,
  id: InstantV3EntityId,
  idempotencyKey: InstantV3MessageIdempotencyKey,
  idempotencyPositionKey: InstantV3CompositeKey,
  minimumCapabilityVersion: InstantV3PositiveInteger,
  originatingProcessorId: InstantV3OriginPublicKey,
  placement: Processor.Placement,
  publicArguments: S.Record(S.String, S.Json),
  permittedResultEvents: S.NonEmptyArray(Command.ResultEventRange),
  requestId: InstantV3Identity,
  requestPositionKey: InstantV3CompositeKey,
  requestedAtMs: InstantV3TimestampMs,
  requiredCapabilityIdJson: InstantV3CanonicalJson,
  ...V3ScopeFields,
}).check(
  S.makeFilter(request => {
    const scopeIssue = instantV3ScopeIssue(request)
    if (scopeIssue !== undefined) {
      return scopeIssue
    }
    return request.requiredCapabilityIdJson ===
      S.encodeSync(CapabilityIdJson)(request.placement.capability.id) &&
      request.minimumCapabilityVersion ===
        request.placement.capability.minimumVersion &&
      request.requestPositionKey ===
        makeInstantV3EffectRequestPositionKey(
          request.sessionId,
          request.requestId,
        ) &&
      request.idempotencyPositionKey ===
        makeInstantV3EffectRequestIdempotencyPositionKey(
          request.sessionId,
          request.idempotencyKey,
        )
      ? undefined
      : {
          path: ['requestPositionKey'],
          issue:
            'An effect request must use its exact scoped identities and canonical placement capability indexes.',
        }
  }),
)
/** A durable protocol-v3 request for one capable Processor to perform an effect. */
export type InstantV3EffectRequestRecord =
  typeof InstantV3EffectRequestRecord.Type

/** The durable outcome of one protocol-v3 capability placement generation. */
export const InstantV3EffectPlacementStatus = S.Literals([
  'AssignedPreferred',
  'AssignedFallback',
  'Waiting',
  'Failed',
  'Ignored',
])
/** The durable outcome of one protocol-v3 capability placement generation. */
export type InstantV3EffectPlacementStatus =
  typeof InstantV3EffectPlacementStatus.Type

/** Derives one append-only protocol-v3 effect placement position key. */
export const makeInstantV3EffectPlacementPositionKey = (
  sessionId: string,
  requestId: string,
  assignmentGeneration: number,
  cancellationGeneration: number,
): InstantV3CompositeKey =>
  makeInstantV3TaggedPositionKey([
    'EffectPlacement',
    sessionId,
    'PlacementGeneration',
    requestId,
    assignmentGeneration,
    cancellationGeneration,
  ])

/** One append-only generation of a protocol-v3 effect placement decision. */
export const InstantV3EffectPlacementRecord = S.Struct({
  assignedProcessorId: S.NullOr(Processor.ProcessorId),
  assignmentGeneration: InstantV3NonNegativeInteger,
  cancellationGeneration: InstantV3NonNegativeInteger,
  decidedAtMs: InstantV3TimestampMs,
  id: InstantV3EntityId,
  placementDecision: Processor.PlacementDecision,
  placementId: InstantV3CompositeKey,
  placementStatus: InstantV3EffectPlacementStatus,
  positionKey: InstantV3CompositeKey,
  requestId: InstantV3Identity,
  ...V3ScopeFields,
}).check(
  S.makeFilter(placement => {
    const scopeIssue = instantV3ScopeIssue(placement)
    if (scopeIssue !== undefined) {
      return scopeIssue
    }
    const expectedProcessorId =
      placement.placementDecision._tag === 'AssignedPreferred' ||
      placement.placementDecision._tag === 'AssignedFallback'
        ? placement.placementDecision.processorId
        : null
    const expectedPositionKey = makeInstantV3EffectPlacementPositionKey(
      placement.sessionId,
      placement.requestId,
      placement.assignmentGeneration,
      placement.cancellationGeneration,
    )
    return placement.placementId === placement.positionKey &&
      placement.positionKey === expectedPositionKey &&
      placement.placementStatus === placement.placementDecision._tag &&
      placement.assignedProcessorId === expectedProcessorId
      ? undefined
      : {
          path: ['placementId'],
          issue:
            'An effect placement must have canonical append-only identity and exact decision indexes.',
        }
  }),
)
/** One append-only generation of a protocol-v3 effect placement decision. */
export type InstantV3EffectPlacementRecord =
  typeof InstantV3EffectPlacementRecord.Type

/** Derives the Processor-keyed identity for one protocol-v3 projection checkpoint. */
export const makeInstantV3ProjectionCheckpointId = (
  sessionId: string,
  projectorProcessorId: string,
  throughAcceptedSequence: number,
): InstantV3CompositeKey =>
  makeInstantV3TaggedPositionKey([
    'ProjectionCheckpoint',
    sessionId,
    'ProcessorCheckpoint',
    projectorProcessorId,
    throughAcceptedSequence,
  ])

/** An append-only Processor-keyed materialized Model checkpoint. */
export const InstantV3ProjectionCheckpointRecord = S.Struct({
  checkpointId: InstantV3CompositeKey,
  createdAtMs: InstantV3TimestampMs,
  id: InstantV3EntityId,
  modelDigest: InstantV3Sha256Digest,
  modelJson: InstantV3CanonicalJson,
  processorCheckpointKey: InstantV3CompositeKey,
  projectionVersion: InstantV3NonNegativeInteger,
  projectorProcessorId: Processor.ProcessorId,
  throughAcceptedSequence: InstantV3NonNegativeInteger,
  ...V3ScopeFields,
}).check(
  S.makeFilter(checkpoint => {
    const scopeIssue = instantV3ScopeIssue(checkpoint)
    if (scopeIssue !== undefined) {
      return scopeIssue
    }
    const expectedCheckpointId = makeInstantV3ProjectionCheckpointId(
      checkpoint.sessionId,
      checkpoint.projectorProcessorId,
      checkpoint.throughAcceptedSequence,
    )
    return checkpoint.checkpointId === checkpoint.processorCheckpointKey &&
      checkpoint.processorCheckpointKey === expectedCheckpointId
      ? undefined
      : {
          path: ['checkpointId'],
          issue:
            'A projection checkpoint must be keyed by its exact session, Processor, and accepted sequence.',
        }
  }),
)
/** An append-only Processor-keyed materialized Model checkpoint. */
export type InstantV3ProjectionCheckpointRecord =
  typeof InstantV3ProjectionCheckpointRecord.Type

/** Derives the stable indexed representation of one nested capability ID. */
export const makeInstantV3CapabilityIdIndex = (
  capabilityId: Processor.CapabilityId,
): string => S.encodeSync(CapabilityIdJson)(capabilityId)
