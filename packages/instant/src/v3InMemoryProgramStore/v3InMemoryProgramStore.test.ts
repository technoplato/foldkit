import { Effect, Option, Schema as S, Stream } from 'effect'
import { Command, Processor, Synchronization } from 'foldkit'
import { expect, expectTypeOf } from 'vitest'

import { describe, it } from '@effect/vitest'

import {
  V3OriginPolicyDecisionLifecycleConflict,
  type V3ProgramAuthorityStoreService,
  V3ProgramSessionLifecycleConflict,
  V3ProgramStoreAcceptedMessageOccurrenceMismatch,
  V3ProgramStoreAcceptedMessageOccurrenceTransaction,
  V3ProgramStoreIdentityConflict,
  V3ProgramStoreScope,
  type V3ProgramStoreService,
  V3ProgramStoreTerminalConflict,
  findV3ProgramStoreAcceptedMessageOccurrenceMismatch,
} from '../v3ProgramStore/index.js'
import {
  InstantV3AcceptedMessageProposalResolutionRecord,
  InstantV3AcceptedOrdinaryMessageOccurrenceRecord,
  InstantV3ActiveOriginPolicyDecision,
  InstantV3DeniedOriginPolicyDecision,
  InstantV3EffectPlacementRecord,
  InstantV3EffectRequestRecord,
  InstantV3EffectResultProposalRecord,
  InstantV3OrdinaryMessageProposalRecord,
  InstantV3OriginPolicyDecisionRecord,
  InstantV3ProgramSessionIdentity,
  InstantV3ProgramSessionRecord,
  InstantV3ProjectionCheckpointRecord,
  InstantV3RejectedMessageProposalResolutionRecord,
  InstantV3RevokedOriginPolicyDecision,
  instantV3OriginPolicyProtocolVersion,
  instantV3ProgramProtocolVersion,
  makeInstantV3AcceptedActorSequencePositionKey,
  makeInstantV3AcceptedMessageIdempotencyPositionKey,
  makeInstantV3AcceptedOccurrencePositionKey,
  makeInstantV3AcceptedProposalPositionKey,
  makeInstantV3AcceptedSequencePositionKey,
  makeInstantV3CapabilityIdIndex,
  makeInstantV3EffectPlacementPositionKey,
  makeInstantV3EffectRequestIdempotencyPositionKey,
  makeInstantV3EffectRequestPositionKey,
  makeInstantV3MessageProposalActorSequencePositionKey,
  makeInstantV3MessageProposalEffectIdempotencyPositionKey,
  makeInstantV3MessageProposalEffectRequestResultPositionKey,
  makeInstantV3MessageProposalMessageIdempotencyPositionKey,
  makeInstantV3MessageProposalOccurrencePositionKey,
  makeInstantV3MessageProposalPositionKey,
  makeInstantV3MessageProposalResolutionPositionKey,
  makeInstantV3OriginEnrollmentClaimPositionKey,
  makeInstantV3OriginPolicyDecisionPositionKey,
  makeInstantV3ProgramSessionLifecyclePositionKey,
  makeInstantV3ProjectionCheckpointId,
  printInstantV3ProgramSessionId,
  stringifyInstantV3CanonicalJson,
} from '../v3Schema/index.js'
import {
  V3InMemoryProgramStoreSnapshot,
  emptyV3InMemoryProgramStoreSnapshot,
  makeV3InMemoryProgramStores,
} from './v3InMemoryProgramStore.js'

const appSubjectDigest = 'a'.repeat(64)
const sessionEpochId = 'e'.repeat(22)
const otherSessionEpochId = 'f'.repeat(22)
const proofDigest = 'b'.repeat(64)
const deviceId = 'A2sX0fLhLEJH-Lzm5WOkQPJ3A32BLeszoPShOUXYmMKW'
const clientId = 'A3zyexiNA09-ilI4AwS1GsPAiWnid_IbNaYLSPxHZpl4'
const processorId = 'Al7L5NGmMwpEyPfvlR1L8WXmxrch762phftBZhvG5_1s'
const signature = 'A'.repeat(86)
const sessionPolicy = Synchronization.SessionPolicy.make({
  generation: 2,
  mode: Synchronization.Mirror.make({}),
})
const updatedSessionPolicy = Synchronization.SessionPolicy.make({
  generation: sessionPolicy.generation + 1,
  mode: Synchronization.SharedDomain.make({}),
})
const laterSessionPolicy = Synchronization.SessionPolicy.make({
  generation: updatedSessionPolicy.generation + 1,
  mode: Synchronization.Mirror.make({}),
})
const audience = Synchronization.SessionAudience.make({})
const clientCertificateJson = stringifyInstantV3CanonicalJson({
  scope: 'client',
  version: 1,
})
const processorCertificateJson = stringifyInstantV3CanonicalJson({
  scope: 'processor',
  version: 1,
})
const otherClientCertificateJson = stringifyInstantV3CanonicalJson({
  scope: 'other-client',
  version: 1,
})

const sessionIdentity = InstantV3ProgramSessionIdentity.make({
  appSubjectDigest,
  originPolicyProtocolVersion: instantV3OriginPolicyProtocolVersion,
  programId: 'counter',
  programVersion: 1,
  sessionEpochId,
})
const otherSessionIdentity = InstantV3ProgramSessionIdentity.make({
  ...sessionIdentity,
  sessionEpochId: otherSessionEpochId,
})
const sessionId = printInstantV3ProgramSessionId(sessionIdentity)
const otherSessionId = printInstantV3ProgramSessionId(otherSessionIdentity)
const scope = V3ProgramStoreScope.make({
  appSubjectDigest,
  instantAppId: 'instant-app-1',
  programId: sessionIdentity.programId,
  programVersion: sessionIdentity.programVersion,
  protocolVersion: instantV3ProgramProtocolVersion,
  sessionEpochId,
  sessionId,
  subjectId: 'subject-1',
})
const otherScope = V3ProgramStoreScope.make({
  ...scope,
  sessionEpochId: otherSessionEpochId,
  sessionId: otherSessionId,
})
const originPolicyScope = {
  instantAppId: scope.instantAppId,
  protocolVersion: instantV3ProgramProtocolVersion,
  subjectId: scope.subjectId,
}
const initialProgramSession = InstantV3ProgramSessionRecord.make({
  ...scope,
  authorityProcessorId: 'authority-processor',
  createdAtMs: 1_753_824_999_900,
  id: '00000000-0000-4000-8000-000000000800',
  lifecycleGeneration: 1,
  lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
    sessionId,
    1,
  ),
  lifecycleState: 'Active',
  originPolicyProtocolVersion: instantV3OriginPolicyProtocolVersion,
  previousLifecyclePositionKey: null,
  processorRoomId: 'processor-room-1',
  sessionPolicy,
})
const updatedProgramSession = InstantV3ProgramSessionRecord.make({
  ...initialProgramSession,
  createdAtMs: initialProgramSession.createdAtMs + 1,
  id: '00000000-0000-4000-8000-000000000801',
  lifecycleGeneration: 2,
  lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
    sessionId,
    2,
  ),
  previousLifecyclePositionKey: initialProgramSession.lifecyclePositionKey,
  sessionPolicy: updatedSessionPolicy,
})
const revokedProgramSession = InstantV3ProgramSessionRecord.make({
  ...updatedProgramSession,
  createdAtMs: updatedProgramSession.createdAtMs + 1,
  id: '00000000-0000-4000-8000-000000000802',
  lifecycleGeneration: 3,
  lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
    sessionId,
    3,
  ),
  lifecycleState: 'Revoked',
  previousLifecyclePositionKey: updatedProgramSession.lifecyclePositionKey,
})
const gapProgramSession = InstantV3ProgramSessionRecord.make({
  ...initialProgramSession,
  createdAtMs: initialProgramSession.createdAtMs + 2,
  id: '00000000-0000-4000-8000-000000000803',
  lifecycleGeneration: 3,
  lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
    sessionId,
    3,
  ),
  lifecycleState: 'Revoked',
  previousLifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
    sessionId,
    2,
  ),
})
const forkedProgramSession = InstantV3ProgramSessionRecord.make({
  ...updatedProgramSession,
  id: '00000000-0000-4000-8000-000000000804',
  sessionPolicy: laterSessionPolicy,
})
const unrevokedProgramSession = InstantV3ProgramSessionRecord.make({
  ...revokedProgramSession,
  createdAtMs: revokedProgramSession.createdAtMs + 1,
  id: '00000000-0000-4000-8000-000000000805',
  lifecycleGeneration: 4,
  lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
    sessionId,
    4,
  ),
  lifecycleState: 'Active',
  previousLifecyclePositionKey: revokedProgramSession.lifecyclePositionKey,
  sessionPolicy: laterSessionPolicy,
})
const laterPolicyMutation = InstantV3ProgramSessionRecord.make({
  ...unrevokedProgramSession,
  id: '00000000-0000-4000-8000-000000000806',
  lifecycleState: 'Revoked',
})
const revocationPolicyMutation = InstantV3ProgramSessionRecord.make({
  ...revokedProgramSession,
  id: '00000000-0000-4000-8000-000000000807',
  sessionPolicy: laterSessionPolicy,
})
const nonSequentialPolicyUpdate = InstantV3ProgramSessionRecord.make({
  ...updatedProgramSession,
  id: '00000000-0000-4000-8000-000000000808',
  sessionPolicy,
})
const otherEpochProgramSession = InstantV3ProgramSessionRecord.make({
  ...initialProgramSession,
  ...otherScope,
  id: '00000000-0000-4000-8000-000000000809',
  lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
    otherSessionId,
    1,
  ),
})
const ordinaryProofFields = {
  admissionClaimJson: stringifyInstantV3CanonicalJson({
    _tag: 'ActivatedInteraction',
    value: 1,
  }),
  admissionOccurrenceId: 'occurrence-ordinary-1',
  messageIdempotencyKey: 'ordinary-message-1',
  originClientCertificateJson: clientCertificateJson,
  originPolicyGeneration: 1,
  originPolicyId: 'origin-policy-1',
  originProcessorCertificateJson: processorCertificateJson,
  originProposalSignature: signature,
}
const ordinaryProposalFields = {
  ...ordinaryProofFields,
  messageIdempotencyPositionKey:
    makeInstantV3MessageProposalMessageIdempotencyPositionKey(
      sessionId,
      ordinaryProofFields.messageIdempotencyKey,
    ),
}
const ordinaryProposal = InstantV3OrdinaryMessageProposalRecord.make({
  ...scope,
  ...ordinaryProposalFields,
  actorId: 'actor-1',
  actorSequence: 1,
  actorSequencePositionKey:
    makeInstantV3MessageProposalActorSequencePositionKey(
      sessionId,
      'actor-1',
      1,
    ),
  causationOccurrenceId: null,
  clientId,
  correlationId: 'correlation-1',
  createdAtMs: 1_753_825_000_000,
  envelopeJson: stringifyInstantV3CanonicalJson({ event: 'Opened' }),
  envelopeVersion: 1,
  eventId: 'counter.opened',
  eventVersion: 1,
  id: '00000000-0000-4000-8000-000000000100',
  occurrenceId: ordinaryProofFields.admissionOccurrenceId,
  occurrencePositionKey: makeInstantV3MessageProposalOccurrencePositionKey(
    sessionId,
    ordinaryProofFields.admissionOccurrenceId,
  ),
  originDeviceId: deviceId,
  originatingProcessorId: processorId,
  payloadJson: stringifyInstantV3CanonicalJson({ _tag: 'Opened' }),
  proposalId: 'proposal-ordinary-1',
  proposalKind: 'OrdinaryMessage',
  proposalPositionKey: makeInstantV3MessageProposalPositionKey(
    sessionId,
    'proposal-ordinary-1',
  ),
})
const otherSessionProposal = InstantV3OrdinaryMessageProposalRecord.make({
  ...ordinaryProposal,
  ...otherScope,
  actorSequencePositionKey:
    makeInstantV3MessageProposalActorSequencePositionKey(
      otherSessionId,
      ordinaryProposal.actorId,
      ordinaryProposal.actorSequence,
    ),
  id: '00000000-0000-4000-8000-000000000101',
  messageIdempotencyPositionKey:
    makeInstantV3MessageProposalMessageIdempotencyPositionKey(
      otherSessionId,
      ordinaryProposal.messageIdempotencyKey,
    ),
  occurrencePositionKey: makeInstantV3MessageProposalOccurrencePositionKey(
    otherSessionId,
    ordinaryProposal.occurrenceId,
  ),
  proposalPositionKey: makeInstantV3MessageProposalPositionKey(
    otherSessionId,
    ordinaryProposal.proposalId,
  ),
})
const conflictingOrdinaryProposal = InstantV3OrdinaryMessageProposalRecord.make(
  {
    ...ordinaryProposal,
    id: '00000000-0000-4000-8000-000000000102',
    payloadJson: stringifyInstantV3CanonicalJson({ _tag: 'Opened', value: 2 }),
  },
)
const effectResultProposal = InstantV3EffectResultProposalRecord.make({
  ...scope,
  actorId: 'actor-2',
  actorSequence: 2,
  actorSequencePositionKey:
    makeInstantV3MessageProposalActorSequencePositionKey(
      sessionId,
      'actor-2',
      2,
    ),
  causalAcceptedSequence: 1,
  causalAudience: audience,
  causalMessageCategory: 'Domain',
  causalOccurrenceId: ordinaryProposal.occurrenceId,
  causalOriginDeviceId: deviceId,
  causalOriginPolicyGeneration: ordinaryProposal.originPolicyGeneration,
  causalOriginPolicyId: ordinaryProposal.originPolicyId,
  causalOriginProofDigest: proofDigest,
  causalOriginatingProcessorId: processorId,
  causalPolicyGeneration: sessionPolicy.generation,
  causalProposalId: ordinaryProposal.proposalId,
  causationOccurrenceId: ordinaryProposal.occurrenceId,
  clientId,
  correlationId: ordinaryProposal.correlationId,
  createdAtMs: 1_753_825_000_001,
  effectAssignmentGeneration: 1,
  effectCancellationGeneration: 0,
  effectIdempotencyKey: 'effect-result-1',
  effectIdempotencyPositionKey:
    makeInstantV3MessageProposalEffectIdempotencyPositionKey(
      sessionId,
      'effect-result-1',
    ),
  effectPlacementId: makeInstantV3EffectPlacementPositionKey(
    sessionId,
    'effect-request-1',
    1,
    0,
  ),
  effectRequestId: 'effect-request-1',
  effectRequestResultPositionKey:
    makeInstantV3MessageProposalEffectRequestResultPositionKey(
      sessionId,
      'effect-request-1',
    ),
  envelopeJson: stringifyInstantV3CanonicalJson({ event: 'Persisted' }),
  envelopeVersion: 1,
  eventId: 'counter.persisted',
  eventVersion: 1,
  executorClientCertificateJson: clientCertificateJson,
  executorOriginPolicyGeneration: 1,
  executorOriginPolicyId: 'origin-policy-1',
  executorProcessorCertificateJson: processorCertificateJson,
  executorProcessorId: processorId,
  executorResultSignature: signature,
  id: '00000000-0000-4000-8000-000000000103',
  occurrenceId: 'occurrence-effect-1',
  occurrencePositionKey: makeInstantV3MessageProposalOccurrencePositionKey(
    sessionId,
    'occurrence-effect-1',
  ),
  originDeviceId: deviceId,
  originatingProcessorId: processorId,
  payloadJson: stringifyInstantV3CanonicalJson({ _tag: 'Persisted' }),
  proposalId: 'proposal-effect-1',
  proposalKind: 'EffectResult',
  proposalPositionKey: makeInstantV3MessageProposalPositionKey(
    sessionId,
    'proposal-effect-1',
  ),
})
const conflictingEffectResultProposal =
  InstantV3EffectResultProposalRecord.make({
    ...effectResultProposal,
    executorClientCertificateJson: otherClientCertificateJson,
    id: '00000000-0000-4000-8000-000000000104',
  })

const acceptedOccurrence =
  InstantV3AcceptedOrdinaryMessageOccurrenceRecord.make({
    ...scope,
    ...ordinaryProofFields,
    acceptedAtMs: 1_753_825_000_002,
    acceptedSequence: 1,
    acceptedSequencePositionKey: makeInstantV3AcceptedSequencePositionKey(
      sessionId,
      1,
    ),
    acceptingProcessorId: 'authority-processor',
    actorId: ordinaryProposal.actorId,
    actorSequence: ordinaryProposal.actorSequence,
    actorSequencePositionKey: makeInstantV3AcceptedActorSequencePositionKey(
      sessionId,
      ordinaryProposal.actorId,
      ordinaryProposal.actorSequence,
    ),
    audience,
    causationId: ordinaryProposal.causationOccurrenceId,
    clientId,
    correlationId: ordinaryProposal.correlationId,
    createdAtMs: ordinaryProposal.createdAtMs,
    envelopeJson: ordinaryProposal.envelopeJson,
    envelopeVersion: ordinaryProposal.envelopeVersion,
    eventId: ordinaryProposal.eventId,
    eventVersion: ordinaryProposal.eventVersion,
    id: '00000000-0000-4000-8000-000000000200',
    messageCategory: 'Domain',
    messageIdempotencyPositionKey:
      makeInstantV3AcceptedMessageIdempotencyPositionKey(
        sessionId,
        ordinaryProposal.messageIdempotencyKey,
      ),
    occurrenceId: ordinaryProposal.occurrenceId,
    occurrencePositionKey: makeInstantV3AcceptedOccurrencePositionKey(
      sessionId,
      ordinaryProposal.occurrenceId,
    ),
    originDeviceId: deviceId,
    originatingProcessorId: processorId,
    payloadJson: ordinaryProposal.payloadJson,
    policyGeneration: sessionPolicy.generation,
    positionKey: makeInstantV3AcceptedSequencePositionKey(sessionId, 1),
    proposedEnvelopeJson: ordinaryProposal.envelopeJson,
    proposalId: ordinaryProposal.proposalId,
    proposalKind: 'OrdinaryMessage',
    proposalPositionKey: makeInstantV3AcceptedProposalPositionKey(
      sessionId,
      ordinaryProposal.proposalId,
    ),
    sessionPolicy,
  })
const acceptedProposalResolution =
  InstantV3AcceptedMessageProposalResolutionRecord.make({
    ...scope,
    acceptedAtMs: acceptedOccurrence.acceptedAtMs,
    acceptedMessageOccurrenceId: acceptedOccurrence.id,
    acceptedMessageOccurrencePositionKey: acceptedOccurrence.positionKey,
    acceptingProcessorId: acceptedOccurrence.acceptingProcessorId,
    actorId: acceptedOccurrence.actorId,
    actorSequence: acceptedOccurrence.actorSequence,
    clientId: acceptedOccurrence.clientId,
    id: '00000000-0000-4000-8000-000000000300',
    originDeviceId: acceptedOccurrence.originDeviceId,
    originatingProcessorId: acceptedOccurrence.originatingProcessorId,
    proposalId: acceptedOccurrence.proposalId,
    proposalKind: acceptedOccurrence.proposalKind,
    proposalTerminalPositionKey:
      makeInstantV3MessageProposalResolutionPositionKey(
        sessionId,
        acceptedOccurrence.proposalId,
      ),
    resolutionState: 'Accepted',
  })
const acceptedTransaction =
  V3ProgramStoreAcceptedMessageOccurrenceTransaction.make({
    occurrence: acceptedOccurrence,
    resolution: acceptedProposalResolution,
  })
const secondAcceptedOccurrence =
  InstantV3AcceptedOrdinaryMessageOccurrenceRecord.make({
    ...acceptedOccurrence,
    acceptedAtMs: acceptedOccurrence.acceptedAtMs + 1,
    acceptedSequence: 2,
    acceptedSequencePositionKey: makeInstantV3AcceptedSequencePositionKey(
      sessionId,
      2,
    ),
    actorSequence: acceptedOccurrence.actorSequence + 1,
    actorSequencePositionKey: makeInstantV3AcceptedActorSequencePositionKey(
      sessionId,
      acceptedOccurrence.actorId,
      acceptedOccurrence.actorSequence + 1,
    ),
    admissionOccurrenceId: 'occurrence-ordinary-2',
    id: '00000000-0000-4000-8000-000000000201',
    messageIdempotencyKey: 'ordinary-message-2',
    messageIdempotencyPositionKey:
      makeInstantV3AcceptedMessageIdempotencyPositionKey(
        sessionId,
        'ordinary-message-2',
      ),
    occurrenceId: 'occurrence-ordinary-2',
    occurrencePositionKey: makeInstantV3AcceptedOccurrencePositionKey(
      sessionId,
      'occurrence-ordinary-2',
    ),
    positionKey: makeInstantV3AcceptedSequencePositionKey(sessionId, 2),
    proposalId: 'proposal-ordinary-2',
    proposalPositionKey: makeInstantV3AcceptedProposalPositionKey(
      sessionId,
      'proposal-ordinary-2',
    ),
  })
const secondAcceptedProposalResolution =
  InstantV3AcceptedMessageProposalResolutionRecord.make({
    ...acceptedProposalResolution,
    acceptedAtMs: secondAcceptedOccurrence.acceptedAtMs,
    acceptedMessageOccurrenceId: secondAcceptedOccurrence.id,
    acceptedMessageOccurrencePositionKey: secondAcceptedOccurrence.positionKey,
    actorSequence: secondAcceptedOccurrence.actorSequence,
    id: '00000000-0000-4000-8000-000000000301',
    proposalId: secondAcceptedOccurrence.proposalId,
    proposalTerminalPositionKey:
      makeInstantV3MessageProposalResolutionPositionKey(
        sessionId,
        secondAcceptedOccurrence.proposalId,
      ),
  })
const conflictingAcceptedSequence =
  InstantV3AcceptedOrdinaryMessageOccurrenceRecord.make({
    ...secondAcceptedOccurrence,
    acceptedSequence: acceptedOccurrence.acceptedSequence,
    acceptedSequencePositionKey: acceptedOccurrence.acceptedSequencePositionKey,
    actorSequence: secondAcceptedOccurrence.actorSequence + 1,
    actorSequencePositionKey: makeInstantV3AcceptedActorSequencePositionKey(
      sessionId,
      secondAcceptedOccurrence.actorId,
      secondAcceptedOccurrence.actorSequence + 1,
    ),
    admissionOccurrenceId: 'occurrence-ordinary-3',
    id: '00000000-0000-4000-8000-000000000202',
    messageIdempotencyKey: 'ordinary-message-3',
    messageIdempotencyPositionKey:
      makeInstantV3AcceptedMessageIdempotencyPositionKey(
        sessionId,
        'ordinary-message-3',
      ),
    occurrenceId: 'occurrence-ordinary-3',
    occurrencePositionKey: makeInstantV3AcceptedOccurrencePositionKey(
      sessionId,
      'occurrence-ordinary-3',
    ),
    positionKey: acceptedOccurrence.positionKey,
    proposalId: 'proposal-ordinary-3',
    proposalPositionKey: makeInstantV3AcceptedProposalPositionKey(
      sessionId,
      'proposal-ordinary-3',
    ),
  })
const conflictingAcceptedProposalResolution =
  InstantV3AcceptedMessageProposalResolutionRecord.make({
    ...acceptedProposalResolution,
    acceptedAtMs: conflictingAcceptedSequence.acceptedAtMs,
    acceptedMessageOccurrenceId: conflictingAcceptedSequence.id,
    acceptedMessageOccurrencePositionKey:
      conflictingAcceptedSequence.positionKey,
    actorSequence: conflictingAcceptedSequence.actorSequence,
    id: '00000000-0000-4000-8000-000000000302',
    proposalId: conflictingAcceptedSequence.proposalId,
    proposalTerminalPositionKey:
      makeInstantV3MessageProposalResolutionPositionKey(
        sessionId,
        conflictingAcceptedSequence.proposalId,
      ),
  })
const conflictingAcceptedTransaction =
  V3ProgramStoreAcceptedMessageOccurrenceTransaction.make({
    occurrence: conflictingAcceptedSequence,
    resolution: conflictingAcceptedProposalResolution,
  })
const forkedAcceptedProposalResolution =
  InstantV3AcceptedMessageProposalResolutionRecord.make({
    ...acceptedProposalResolution,
    id: '00000000-0000-4000-8000-000000000303',
  })
const forkedAcceptedTransaction =
  V3ProgramStoreAcceptedMessageOccurrenceTransaction.make({
    occurrence: acceptedOccurrence,
    resolution: forkedAcceptedProposalResolution,
  })
const mismatchedAcceptedProposalResolution =
  InstantV3AcceptedMessageProposalResolutionRecord.make({
    ...acceptedProposalResolution,
    acceptedMessageOccurrenceId: secondAcceptedOccurrence.id,
    id: '00000000-0000-4000-8000-000000000304',
  })
const mismatchedAcceptedTransaction = {
  occurrence: acceptedOccurrence,
  resolution: mismatchedAcceptedProposalResolution,
}
const proposalResolution =
  InstantV3RejectedMessageProposalResolutionRecord.make({
    ...scope,
    actorId: ordinaryProposal.actorId,
    actorSequence: ordinaryProposal.actorSequence,
    clientId,
    id: '00000000-0000-4000-8000-000000000305',
    originDeviceId: deviceId,
    originatingProcessorId: processorId,
    proposalId: ordinaryProposal.proposalId,
    proposalKind: 'OrdinaryMessage',
    proposalTerminalPositionKey:
      makeInstantV3MessageProposalResolutionPositionKey(
        sessionId,
        ordinaryProposal.proposalId,
      ),
    rejectedAtMs: 1_753_825_000_003,
    rejectingProcessorId: 'authority-processor',
    rejectionReason: 'OriginProofInvalid',
    resolutionState: 'Rejected',
  })
const forkedProposalResolution =
  InstantV3RejectedMessageProposalResolutionRecord.make({
    ...proposalResolution,
    id: '00000000-0000-4000-8000-000000000306',
    rejectionReason: 'IdentityConflict',
  })

const firstDecisionPositionKey = makeInstantV3OriginPolicyDecisionPositionKey(
  scope.instantAppId,
  scope.subjectId,
  instantV3ProgramProtocolVersion,
  'origin-policy-1',
  1,
)
const secondDecisionPositionKey = makeInstantV3OriginPolicyDecisionPositionKey(
  scope.instantAppId,
  scope.subjectId,
  instantV3ProgramProtocolVersion,
  'origin-policy-1',
  2,
)
const thirdDecisionPositionKey = makeInstantV3OriginPolicyDecisionPositionKey(
  scope.instantAppId,
  scope.subjectId,
  instantV3ProgramProtocolVersion,
  'origin-policy-1',
  3,
)
const fourthDecisionPositionKey = makeInstantV3OriginPolicyDecisionPositionKey(
  scope.instantAppId,
  scope.subjectId,
  instantV3ProgramProtocolVersion,
  'origin-policy-1',
  4,
)
const firstOriginPolicyDecision = InstantV3OriginPolicyDecisionRecord.make({
  decidedAtMs: 1_753_825_000_004,
  decidingProcessorId: 'policy-authority',
  decision: InstantV3ActiveOriginPolicyDecision.make({}),
  decisionId: firstDecisionPositionKey,
  decisionState: 'Active',
  enrollmentClaimId: 'enrollment-claim-1',
  enrollmentClaimPositionKey: makeInstantV3OriginEnrollmentClaimPositionKey(
    scope.instantAppId,
    scope.subjectId,
    instantV3ProgramProtocolVersion,
    'enrollment-claim-1',
  ),
  generation: 1,
  id: '00000000-0000-4000-8000-000000000400',
  instantAppId: scope.instantAppId,
  originDeviceId: deviceId,
  originPolicyId: 'origin-policy-1',
  positionKey: firstDecisionPositionKey,
  previousDecisionId: null,
  protocolVersion: instantV3ProgramProtocolVersion,
  subjectId: scope.subjectId,
})
const secondOriginPolicyDecision = InstantV3OriginPolicyDecisionRecord.make({
  ...firstOriginPolicyDecision,
  decidedAtMs: firstOriginPolicyDecision.decidedAtMs + 1,
  decisionId: secondDecisionPositionKey,
  generation: 2,
  id: '00000000-0000-4000-8000-000000000401',
  positionKey: secondDecisionPositionKey,
  previousDecisionId: firstDecisionPositionKey,
})
const conflictingOriginPolicyDecision =
  InstantV3OriginPolicyDecisionRecord.make({
    ...firstOriginPolicyDecision,
    decision: InstantV3DeniedOriginPolicyDecision.make({
      reason: 'Device enrollment denied',
    }),
    decisionState: 'Denied',
    id: '00000000-0000-4000-8000-000000000402',
  })
const revokedOriginPolicyDecision = InstantV3OriginPolicyDecisionRecord.make({
  ...secondOriginPolicyDecision,
  decidedAtMs: secondOriginPolicyDecision.decidedAtMs + 1,
  decision: InstantV3RevokedOriginPolicyDecision.make({
    reason: 'Device key compromised',
  }),
  decisionId: thirdDecisionPositionKey,
  decisionState: 'Revoked',
  generation: 3,
  id: '00000000-0000-4000-8000-000000000403',
  positionKey: thirdDecisionPositionKey,
  previousDecisionId: secondDecisionPositionKey,
})
const gapOriginPolicyDecision = InstantV3OriginPolicyDecisionRecord.make({
  ...firstOriginPolicyDecision,
  decidedAtMs: firstOriginPolicyDecision.decidedAtMs + 2,
  decisionId: thirdDecisionPositionKey,
  generation: 3,
  id: '00000000-0000-4000-8000-000000000404',
  positionKey: thirdDecisionPositionKey,
  previousDecisionId: secondDecisionPositionKey,
})
const activeToDeniedOriginPolicyDecision =
  InstantV3OriginPolicyDecisionRecord.make({
    ...secondOriginPolicyDecision,
    decision: InstantV3DeniedOriginPolicyDecision.make({
      reason: 'Rotation denied',
    }),
    decisionState: 'Denied',
    id: '00000000-0000-4000-8000-000000000405',
  })
const afterRevokedOriginPolicyDecision =
  InstantV3OriginPolicyDecisionRecord.make({
    ...secondOriginPolicyDecision,
    decidedAtMs: revokedOriginPolicyDecision.decidedAtMs + 1,
    decisionId: fourthDecisionPositionKey,
    generation: 4,
    id: '00000000-0000-4000-8000-000000000406',
    positionKey: fourthDecisionPositionKey,
    previousDecisionId: thirdDecisionPositionKey,
  })
const deniedOriginPolicyId = 'origin-policy-denied'
const deniedDecisionPositionKey = makeInstantV3OriginPolicyDecisionPositionKey(
  scope.instantAppId,
  scope.subjectId,
  instantV3ProgramProtocolVersion,
  deniedOriginPolicyId,
  1,
)
const deniedOriginPolicyDecision = InstantV3OriginPolicyDecisionRecord.make({
  ...firstOriginPolicyDecision,
  decision: InstantV3DeniedOriginPolicyDecision.make({
    reason: 'Enrollment denied',
  }),
  decisionId: deniedDecisionPositionKey,
  decisionState: 'Denied',
  id: '00000000-0000-4000-8000-000000000407',
  originPolicyId: deniedOriginPolicyId,
  positionKey: deniedDecisionPositionKey,
})
const deniedSecondDecisionPositionKey =
  makeInstantV3OriginPolicyDecisionPositionKey(
    scope.instantAppId,
    scope.subjectId,
    instantV3ProgramProtocolVersion,
    deniedOriginPolicyId,
    2,
  )
const afterDeniedOriginPolicyDecision =
  InstantV3OriginPolicyDecisionRecord.make({
    ...deniedOriginPolicyDecision,
    decidedAtMs: deniedOriginPolicyDecision.decidedAtMs + 1,
    decision: InstantV3ActiveOriginPolicyDecision.make({}),
    decisionId: deniedSecondDecisionPositionKey,
    decisionState: 'Active',
    generation: 2,
    id: '00000000-0000-4000-8000-000000000408',
    positionKey: deniedSecondDecisionPositionKey,
    previousDecisionId: deniedDecisionPositionKey,
  })
const isolatedOriginPolicyId = 'origin-policy-2'
const isolatedDecisionPositionKey =
  makeInstantV3OriginPolicyDecisionPositionKey(
    scope.instantAppId,
    scope.subjectId,
    instantV3ProgramProtocolVersion,
    isolatedOriginPolicyId,
    1,
  )
const isolatedOriginPolicyDecision = InstantV3OriginPolicyDecisionRecord.make({
  ...firstOriginPolicyDecision,
  decisionId: isolatedDecisionPositionKey,
  id: '00000000-0000-4000-8000-000000000409',
  originPolicyId: isolatedOriginPolicyId,
  positionKey: isolatedDecisionPositionKey,
})
const otherSubjectId = 'subject-2'
const otherSubjectDecisionPositionKey =
  makeInstantV3OriginPolicyDecisionPositionKey(
    scope.instantAppId,
    otherSubjectId,
    instantV3ProgramProtocolVersion,
    firstOriginPolicyDecision.originPolicyId,
    1,
  )
const otherSubjectOriginPolicyDecision =
  InstantV3OriginPolicyDecisionRecord.make({
    ...firstOriginPolicyDecision,
    decisionId: otherSubjectDecisionPositionKey,
    enrollmentClaimPositionKey: makeInstantV3OriginEnrollmentClaimPositionKey(
      scope.instantAppId,
      otherSubjectId,
      instantV3ProgramProtocolVersion,
      firstOriginPolicyDecision.enrollmentClaimId,
    ),
    id: '00000000-0000-4000-8000-000000000412',
    positionKey: otherSubjectDecisionPositionKey,
    subjectId: otherSubjectId,
  })
const immutableOriginPolicyMutation = InstantV3OriginPolicyDecisionRecord.make({
  ...secondOriginPolicyDecision,
  id: '00000000-0000-4000-8000-000000000410',
  originDeviceId: clientId,
})
const timestampRegressedOriginPolicyDecision =
  InstantV3OriginPolicyDecisionRecord.make({
    ...secondOriginPolicyDecision,
    decidedAtMs: firstOriginPolicyDecision.decidedAtMs - 1,
    id: '00000000-0000-4000-8000-000000000411',
  })

const effectCapabilityPlacement = Processor.Placement.make({
  affinity: Processor.AnyProcessor.make({}),
  capability: Processor.CapabilityRequirement.make({
    id: ['Counter', 'Write'],
    minimumVersion: 1,
  }),
  cardinality: 'One',
  unavailable: 'Wait',
  version: 1,
})
const firstEffectRequest = InstantV3EffectRequestRecord.make({
  ...scope,
  causalAcceptedSequence: acceptedOccurrence.acceptedSequence,
  causalAudience: acceptedOccurrence.audience,
  causalMessageCategory: acceptedOccurrence.messageCategory,
  causalOccurrenceId: acceptedOccurrence.occurrenceId,
  causalOriginDeviceId: acceptedOccurrence.originDeviceId,
  causalOriginPolicyGeneration: acceptedOccurrence.originPolicyGeneration,
  causalOriginPolicyId: acceptedOccurrence.originPolicyId,
  causalOriginProofDigest: proofDigest,
  causalOriginatingProcessorId: acceptedOccurrence.originatingProcessorId,
  causalPolicyGeneration: acceptedOccurrence.policyGeneration,
  causalProposalId: acceptedOccurrence.proposalId,
  effectId: 'counter.persist',
  effectVersion: 1,
  id: '00000000-0000-4000-8000-000000000601',
  idempotencyKey: 'effect-request-idempotency-1',
  idempotencyPositionKey: makeInstantV3EffectRequestIdempotencyPositionKey(
    sessionId,
    'effect-request-idempotency-1',
  ),
  minimumCapabilityVersion: 1,
  originatingProcessorId: processorId,
  placement: effectCapabilityPlacement,
  publicArguments: { counterId: 'counter-1' },
  permittedResultEvents: [
    Command.ResultEventRange.make({
      eventId: 'counter.persisted',
      maximumVersion: 1,
      minimumVersion: 1,
    }),
  ],
  requestId: 'effect-request-1',
  requestPositionKey: makeInstantV3EffectRequestPositionKey(
    sessionId,
    'effect-request-1',
  ),
  requestedAtMs: 1_753_825_000_006,
  requiredCapabilityIdJson: makeInstantV3CapabilityIdIndex(
    effectCapabilityPlacement.capability.id,
  ),
})
const secondEffectRequest = InstantV3EffectRequestRecord.make({
  ...firstEffectRequest,
  id: '00000000-0000-4000-8000-000000000600',
  idempotencyKey: 'effect-request-idempotency-2',
  idempotencyPositionKey: makeInstantV3EffectRequestIdempotencyPositionKey(
    sessionId,
    'effect-request-idempotency-2',
  ),
  requestId: 'effect-request-2',
  requestPositionKey: makeInstantV3EffectRequestPositionKey(
    sessionId,
    'effect-request-2',
  ),
  requestedAtMs: firstEffectRequest.requestedAtMs + 1,
})
const firstEffectPlacementPositionKey = makeInstantV3EffectPlacementPositionKey(
  sessionId,
  firstEffectRequest.requestId,
  1,
  0,
)
const firstEffectPlacement = InstantV3EffectPlacementRecord.make({
  ...scope,
  assignedProcessorId: processorId,
  assignmentGeneration: 1,
  cancellationGeneration: 0,
  decidedAtMs: 1_753_825_000_008,
  id: '00000000-0000-4000-8000-000000000701',
  placementDecision: Processor.AssignedPreferred.make({ processorId }),
  placementId: firstEffectPlacementPositionKey,
  placementStatus: 'AssignedPreferred',
  positionKey: firstEffectPlacementPositionKey,
  requestId: firstEffectRequest.requestId,
})
const secondEffectPlacementPositionKey =
  makeInstantV3EffectPlacementPositionKey(
    sessionId,
    firstEffectRequest.requestId,
    2,
    0,
  )
const secondEffectPlacement = InstantV3EffectPlacementRecord.make({
  ...firstEffectPlacement,
  assignmentGeneration: 2,
  decidedAtMs: firstEffectPlacement.decidedAtMs + 1,
  id: '00000000-0000-4000-8000-000000000700',
  placementId: secondEffectPlacementPositionKey,
  positionKey: secondEffectPlacementPositionKey,
})
const cancellationTwoPositionKey = makeInstantV3EffectPlacementPositionKey(
  sessionId,
  firstEffectRequest.requestId,
  3,
  2,
)
const cancellationTwoPlacement = InstantV3EffectPlacementRecord.make({
  ...firstEffectPlacement,
  assignmentGeneration: 3,
  cancellationGeneration: 2,
  decidedAtMs: secondEffectPlacement.decidedAtMs + 1,
  id: '00000000-0000-4000-8000-000000000702',
  placementId: cancellationTwoPositionKey,
  positionKey: cancellationTwoPositionKey,
})
const cancellationTenPositionKey = makeInstantV3EffectPlacementPositionKey(
  sessionId,
  firstEffectRequest.requestId,
  3,
  10,
)
const cancellationTenPlacement = InstantV3EffectPlacementRecord.make({
  ...cancellationTwoPlacement,
  cancellationGeneration: 10,
  decidedAtMs: cancellationTwoPlacement.decidedAtMs + 1,
  id: '00000000-0000-4000-8000-000000000703',
  placementId: cancellationTenPositionKey,
  positionKey: cancellationTenPositionKey,
})

const checkpointId = makeInstantV3ProjectionCheckpointId(
  sessionId,
  processorId,
  1,
)
const clientCheckpointId = makeInstantV3ProjectionCheckpointId(
  sessionId,
  clientId,
  1,
)
const projectionCheckpoint = InstantV3ProjectionCheckpointRecord.make({
  ...scope,
  checkpointId,
  createdAtMs: 1_753_825_000_006,
  id: '00000000-0000-4000-8000-000000000500',
  modelDigest: 'c'.repeat(64),
  modelJson: stringifyInstantV3CanonicalJson({ count: 1 }),
  processorCheckpointKey: checkpointId,
  projectionVersion: 1,
  projectorProcessorId: processorId,
  throughAcceptedSequence: 1,
})
const clientProjectionCheckpoint = InstantV3ProjectionCheckpointRecord.make({
  ...projectionCheckpoint,
  checkpointId: clientCheckpointId,
  id: '00000000-0000-4000-8000-000000000501',
  processorCheckpointKey: clientCheckpointId,
  projectorProcessorId: clientId,
})
const newestCheckpointId = makeInstantV3ProjectionCheckpointId(
  sessionId,
  processorId,
  2,
)
const newestProjectionCheckpoint = InstantV3ProjectionCheckpointRecord.make({
  ...projectionCheckpoint,
  checkpointId: newestCheckpointId,
  createdAtMs: projectionCheckpoint.createdAtMs + 1,
  id: '00000000-0000-4000-8000-000000000499',
  modelDigest: 'e'.repeat(64),
  modelJson: stringifyInstantV3CanonicalJson({ count: 2 }),
  processorCheckpointKey: newestCheckpointId,
  throughAcceptedSequence: 2,
})
const conflictingProjectionCheckpoint =
  InstantV3ProjectionCheckpointRecord.make({
    ...projectionCheckpoint,
    id: '00000000-0000-4000-8000-000000000502',
    modelDigest: 'd'.repeat(64),
    modelJson: stringifyInstantV3CanonicalJson({ count: 2 }),
  })

describe('protocol-v3 in-memory Client boundary', () => {
  it.effect(
    'keeps authority capability, writes, and observations off the ordinary Client',
    () =>
      Effect.gen(function* () {
        expectTypeOf<V3ProgramStoreService>().not.toMatchTypeOf<V3ProgramAuthorityStoreService>()

        const stores = yield* makeV3InMemoryProgramStores()
        const client = stores.client

        expect(client).not.toHaveProperty('authorityCapability')
        expect(client).not.toHaveProperty('serverConfirmed')
        expect(client).not.toHaveProperty(
          'appendServerConfirmedAcceptedMessageOccurrence',
        )
        expect(client).not.toHaveProperty('appendServerConfirmedProgramSession')

        const outcome = yield* client.appendMessageProposal(ordinaryProposal)
        expect(outcome).toEqual({
          _tag: 'ServerConfirmed',
          disposition: 'Appended',
          serverTransactionId: `in-memory-v3:${ordinaryProposal.id}`,
        })
        expect(stores.authority.authorityCapability).toEqual({
          _tag: 'ServerConfirmedAuthority',
          protocolVersion: 3,
        })
        expect(
          Option.getOrThrow(
            yield* Stream.runHead(
              stores.authority.serverConfirmed.observeMessageProposals(scope),
            ),
          ),
        ).toEqual([ordinaryProposal])
      }),
  )

  it.effect(
    'distinguishes exact retry, scoped semantic conflict, and a new session epoch',
    () =>
      Effect.gen(function* () {
        const stores = yield* makeV3InMemoryProgramStores()

        const first =
          yield* stores.client.appendMessageProposal(ordinaryProposal)
        const retry =
          yield* stores.client.appendMessageProposal(ordinaryProposal)
        const conflict = yield* Effect.flip(
          stores.client.appendMessageProposal(conflictingOrdinaryProposal),
        )
        const nextEpoch =
          yield* stores.client.appendMessageProposal(otherSessionProposal)

        expect(first.disposition).toBe('Appended')
        expect(retry.disposition).toBe('Idempotent')
        expect(conflict).toBeInstanceOf(V3ProgramStoreIdentityConflict)
        expect(nextEpoch.disposition).toBe('Appended')
        expect(otherSessionProposal.proposalId).toBe(
          ordinaryProposal.proposalId,
        )
        expect(otherSessionProposal.proposalPositionKey).not.toBe(
          ordinaryProposal.proposalPositionKey,
        )

        const firstEpochRows = Option.getOrThrow(
          yield* Stream.runHead(
            stores.client.observations.observeMessageProposals(scope),
          ),
        )
        const nextEpochRows = Option.getOrThrow(
          yield* Stream.runHead(
            stores.client.observations.observeMessageProposals(otherScope),
          ),
        )
        expect(firstEpochRows).toEqual([ordinaryProposal])
        expect(nextEpochRows).toEqual([otherSessionProposal])
      }),
  )

  it.effect(
    'retains and conflicts on the complete EffectResult causal and executor chain',
    () =>
      Effect.gen(function* () {
        const stores = yield* makeV3InMemoryProgramStores()

        yield* stores.client.appendMessageProposal(effectResultProposal)
        const conflict = yield* Effect.flip(
          stores.client.appendMessageProposal(conflictingEffectResultProposal),
        )
        const proposals = Option.getOrThrow(
          yield* Stream.runHead(
            stores.client.observations.observeMessageProposals(scope),
          ),
        )

        expect(conflict).toBeInstanceOf(V3ProgramStoreIdentityConflict)
        expect(proposals).toEqual([effectResultProposal])
        expect(effectResultProposal.causalProposalId).toBe(
          ordinaryProposal.proposalId,
        )
        expect(effectResultProposal.executorProcessorId).toBe(processorId)
        expect(effectResultProposal.executorOriginPolicyGeneration).toBe(1)
      }),
  )
})

describe('protocol-v3 in-memory Program-session lifecycle', () => {
  it.effect(
    'appends creation, policy update, and terminal revocation with exact retries',
    () =>
      Effect.gen(function* () {
        const stores = yield* makeV3InMemoryProgramStores()

        const creation =
          yield* stores.authority.appendServerConfirmedProgramSession(
            initialProgramSession,
          )
        const creationRetry =
          yield* stores.authority.appendServerConfirmedProgramSession(
            initialProgramSession,
          )
        const policyUpdate =
          yield* stores.authority.appendServerConfirmedProgramSession(
            updatedProgramSession,
          )
        const revocation =
          yield* stores.authority.appendServerConfirmedProgramSession(
            revokedProgramSession,
          )
        const revocationRetry =
          yield* stores.authority.appendServerConfirmedProgramSession(
            revokedProgramSession,
          )
        const sessions = Option.getOrThrow(
          yield* Stream.runHead(
            stores.authority.serverConfirmed.observeProgramSessions(scope),
          ),
        )

        expect(creation.disposition).toBe('Appended')
        expect(creationRetry.disposition).toBe('Idempotent')
        expect(policyUpdate.disposition).toBe('Appended')
        expect(revocation.disposition).toBe('Appended')
        expect(revocationRetry.disposition).toBe('Idempotent')
        expect(
          sessions.map(session => [
            session.lifecycleGeneration,
            session.sessionPolicy.generation,
            session.lifecycleState,
          ]),
        ).toEqual([
          [3, 3, 'Revoked'],
          [2, 3, 'Active'],
          [1, 2, 'Active'],
        ])
      }),
  )

  it.effect(
    'rejects lifecycle gaps, policy-generation reuse, and same-position forks',
    () =>
      Effect.gen(function* () {
        const gapStores = yield* makeV3InMemoryProgramStores()
        yield* gapStores.authority.appendServerConfirmedProgramSession(
          initialProgramSession,
        )
        const gapConflict = yield* Effect.flip(
          gapStores.authority.appendServerConfirmedProgramSession(
            gapProgramSession,
          ),
        )

        const policyStores = yield* makeV3InMemoryProgramStores()
        yield* policyStores.authority.appendServerConfirmedProgramSession(
          initialProgramSession,
        )
        const policyConflict = yield* Effect.flip(
          policyStores.authority.appendServerConfirmedProgramSession(
            nonSequentialPolicyUpdate,
          ),
        )

        const forkStores = yield* makeV3InMemoryProgramStores()
        yield* forkStores.authority.appendServerConfirmedProgramSession(
          initialProgramSession,
        )
        yield* forkStores.authority.appendServerConfirmedProgramSession(
          updatedProgramSession,
        )
        const forkConflict = yield* Effect.flip(
          forkStores.authority.appendServerConfirmedProgramSession(
            forkedProgramSession,
          ),
        )

        expect(gapConflict).toMatchObject({
          _tag: 'V3ProgramSessionLifecycleConflict',
          reason: 'LifecycleGenerationNotSequential',
        })
        expect(gapConflict).toBeInstanceOf(V3ProgramSessionLifecycleConflict)
        expect(policyConflict).toMatchObject({
          _tag: 'V3ProgramSessionLifecycleConflict',
          reason: 'PolicyGenerationNotSequential',
        })
        expect(forkConflict).toBeInstanceOf(V3ProgramStoreIdentityConflict)
      }),
  )

  it.effect(
    'makes revocation permanent and forbids policy mutation during or after it',
    () =>
      Effect.gen(function* () {
        const stores = yield* makeV3InMemoryProgramStores()
        yield* stores.authority.appendServerConfirmedProgramSession(
          initialProgramSession,
        )
        yield* stores.authority.appendServerConfirmedProgramSession(
          updatedProgramSession,
        )
        yield* stores.authority.appendServerConfirmedProgramSession(
          revokedProgramSession,
        )
        const unrevokedConflict = yield* Effect.flip(
          stores.authority.appendServerConfirmedProgramSession(
            unrevokedProgramSession,
          ),
        )
        const laterMutationConflict = yield* Effect.flip(
          stores.authority.appendServerConfirmedProgramSession(
            laterPolicyMutation,
          ),
        )

        const revocationStores = yield* makeV3InMemoryProgramStores()
        yield* revocationStores.authority.appendServerConfirmedProgramSession(
          initialProgramSession,
        )
        yield* revocationStores.authority.appendServerConfirmedProgramSession(
          updatedProgramSession,
        )
        const revocationMutationConflict = yield* Effect.flip(
          revocationStores.authority.appendServerConfirmedProgramSession(
            revocationPolicyMutation,
          ),
        )

        expect(unrevokedConflict).toMatchObject({
          _tag: 'V3ProgramSessionLifecycleConflict',
          reason: 'SessionPermanentlyRevoked',
        })
        expect(laterMutationConflict).toMatchObject({
          _tag: 'V3ProgramSessionLifecycleConflict',
          reason: 'SessionPermanentlyRevoked',
        })
        expect(revocationMutationConflict).toMatchObject({
          _tag: 'V3ProgramSessionLifecycleConflict',
          reason: 'RevocationPolicyChanged',
        })
      }),
  )

  it.effect('isolates equal lifecycle generations across session epochs', () =>
    Effect.gen(function* () {
      const stores = yield* makeV3InMemoryProgramStores()

      const firstEpoch =
        yield* stores.authority.appendServerConfirmedProgramSession(
          initialProgramSession,
        )
      const nextEpoch =
        yield* stores.authority.appendServerConfirmedProgramSession(
          otherEpochProgramSession,
        )
      const firstEpochSessions = Option.getOrThrow(
        yield* Stream.runHead(
          stores.authority.serverConfirmed.observeProgramSessions(scope),
        ),
      )
      const nextEpochSessions = Option.getOrThrow(
        yield* Stream.runHead(
          stores.authority.serverConfirmed.observeProgramSessions(otherScope),
        ),
      )

      expect(firstEpoch.disposition).toBe('Appended')
      expect(nextEpoch.disposition).toBe('Appended')
      expect(firstEpochSessions).toEqual([initialProgramSession])
      expect(nextEpochSessions).toEqual([otherEpochProgramSession])
      expect(otherEpochProgramSession.lifecycleGeneration).toBe(
        initialProgramSession.lifecycleGeneration,
      )
      expect(otherEpochProgramSession.lifecyclePositionKey).not.toBe(
        initialProgramSession.lifecyclePositionKey,
      )
    }),
  )

  it.effect('reconstructs an unsorted lifecycle in deterministic order', () =>
    Effect.gen(function* () {
      const snapshot = V3InMemoryProgramStoreSnapshot.make({
        ...emptyV3InMemoryProgramStoreSnapshot,
        programSessions: [
          revokedProgramSession,
          initialProgramSession,
          updatedProgramSession,
        ],
      })
      const stores = yield* makeV3InMemoryProgramStores(snapshot)
      const sessions = Option.getOrThrow(
        yield* Stream.runHead(
          stores.authority.serverConfirmed.observeProgramSessions(scope),
        ),
      )
      const reconstructedSnapshot = yield* stores.readSnapshot

      expect(sessions.map(session => session.lifecycleGeneration)).toEqual([
        3, 2, 1,
      ])
      expect(
        reconstructedSnapshot.programSessions.map(
          session => session.lifecycleGeneration,
        ),
      ).toEqual([1, 2, 3])
    }),
  )
})

describe('protocol-v3 in-memory authority invariants', () => {
  it.effect(
    'enforces terminal retries, same-state forks, and opposite arrival orders',
    () =>
      Effect.gen(function* () {
        const acceptedFirst = yield* makeV3InMemoryProgramStores()
        const accepted =
          yield* acceptedFirst.authority.appendServerConfirmedAcceptedMessageOccurrence(
            acceptedTransaction,
          )
        const acceptedRetry =
          yield* acceptedFirst.authority.appendServerConfirmedAcceptedMessageOccurrence(
            acceptedTransaction,
          )
        const acceptedForkConflict = yield* Effect.flip(
          acceptedFirst.authority.appendServerConfirmedAcceptedMessageOccurrence(
            forkedAcceptedTransaction,
          ),
        )
        const rejectedConflict = yield* Effect.flip(
          acceptedFirst.authority.appendServerConfirmedRejectedMessageProposalResolution(
            proposalResolution,
          ),
        )

        const rejectedFirst = yield* makeV3InMemoryProgramStores()
        const rejected =
          yield* rejectedFirst.authority.appendServerConfirmedRejectedMessageProposalResolution(
            proposalResolution,
          )
        const rejectedRetry =
          yield* rejectedFirst.authority.appendServerConfirmedRejectedMessageProposalResolution(
            proposalResolution,
          )
        const rejectedForkConflict = yield* Effect.flip(
          rejectedFirst.authority.appendServerConfirmedRejectedMessageProposalResolution(
            forkedProposalResolution,
          ),
        )
        const acceptedConflict = yield* Effect.flip(
          rejectedFirst.authority.appendServerConfirmedAcceptedMessageOccurrence(
            acceptedTransaction,
          ),
        )

        expect(accepted.disposition).toBe('Appended')
        expect(acceptedRetry.disposition).toBe('Idempotent')
        expect(acceptedForkConflict).toBeInstanceOf(
          V3ProgramStoreIdentityConflict,
        )
        expect(rejectedConflict).toEqual(
          new V3ProgramStoreTerminalConflict({
            attemptedTerminal: 'Rejected',
            existingTerminal: 'Accepted',
            proposalId: ordinaryProposal.proposalId,
          }),
        )
        expect(rejected.disposition).toBe('Appended')
        expect(rejectedRetry.disposition).toBe('Idempotent')
        expect(rejectedForkConflict).toBeInstanceOf(
          V3ProgramStoreIdentityConflict,
        )
        expect(acceptedConflict).toEqual(
          new V3ProgramStoreTerminalConflict({
            attemptedTerminal: 'Accepted',
            existingTerminal: 'Rejected',
            proposalId: ordinaryProposal.proposalId,
          }),
        )
      }),
  )

  it('rejects every public Accepted transaction pair-mismatch category', () => {
    const scopeMismatchedResolution =
      InstantV3AcceptedMessageProposalResolutionRecord.make({
        ...acceptedProposalResolution,
        ...otherScope,
        proposalTerminalPositionKey:
          makeInstantV3MessageProposalResolutionPositionKey(
            otherSessionId,
            acceptedProposalResolution.proposalId,
          ),
      })
    const proposalMetadataMismatchedResolution =
      InstantV3AcceptedMessageProposalResolutionRecord.make({
        ...acceptedProposalResolution,
        actorSequence: acceptedProposalResolution.actorSequence + 1,
      })
    const auditMismatchedResolution =
      InstantV3AcceptedMessageProposalResolutionRecord.make({
        ...acceptedProposalResolution,
        acceptedAtMs: acceptedProposalResolution.acceptedAtMs + 1,
      })
    const scopeMismatchedTransaction = {
      occurrence: acceptedOccurrence,
      resolution: scopeMismatchedResolution,
    }
    const proposalMetadataMismatchedTransaction = {
      occurrence: acceptedOccurrence,
      resolution: proposalMetadataMismatchedResolution,
    }
    const auditMismatchedTransaction = {
      occurrence: acceptedOccurrence,
      resolution: auditMismatchedResolution,
    }
    const decodeTransaction = S.decodeUnknownOption(
      V3ProgramStoreAcceptedMessageOccurrenceTransaction,
    )

    expect(Option.isSome(decodeTransaction(acceptedTransaction))).toBe(true)
    expect(Option.isNone(decodeTransaction(scopeMismatchedTransaction))).toBe(
      true,
    )
    expect(
      Option.isNone(decodeTransaction(proposalMetadataMismatchedTransaction)),
    ).toBe(true)
    expect(
      Option.isNone(decodeTransaction(mismatchedAcceptedTransaction)),
    ).toBe(true)
    expect(Option.isNone(decodeTransaction(auditMismatchedTransaction))).toBe(
      true,
    )
    expect(
      Option.getOrThrow(
        findV3ProgramStoreAcceptedMessageOccurrenceMismatch(
          scopeMismatchedTransaction,
        ),
      ).reason,
    ).toBe('ScopeMismatch')
    expect(
      Option.getOrThrow(
        findV3ProgramStoreAcceptedMessageOccurrenceMismatch(
          proposalMetadataMismatchedTransaction,
        ),
      ).reason,
    ).toBe('ProposalMetadataMismatch')
    expect(
      Option.getOrThrow(
        findV3ProgramStoreAcceptedMessageOccurrenceMismatch(
          mismatchedAcceptedTransaction,
        ),
      ).reason,
    ).toBe('AcceptedOccurrenceReferenceMismatch')
    expect(
      Option.getOrThrow(
        findV3ProgramStoreAcceptedMessageOccurrenceMismatch(
          auditMismatchedTransaction,
        ),
      ).reason,
    ).toBe('AcceptedAuditMismatch')
  })

  it.effect(
    'rejects an Accepted guard and occurrence mismatch without appending either row',
    () =>
      Effect.gen(function* () {
        const stores = yield* makeV3InMemoryProgramStores()
        const mismatch = yield* Effect.flip(
          stores.authority.appendServerConfirmedAcceptedMessageOccurrence(
            mismatchedAcceptedTransaction,
          ),
        )
        const snapshot = yield* stores.readSnapshot

        expect(mismatch).toEqual(
          new V3ProgramStoreAcceptedMessageOccurrenceMismatch({
            proposalId: ordinaryProposal.proposalId,
            reason: 'AcceptedOccurrenceReferenceMismatch',
          }),
        )
        expect(snapshot.acceptedMessageOccurrences).toEqual([])
        expect(snapshot.messageProposalResolutions).toEqual([])
      }),
  )

  it.effect(
    'rejects opposite and both partial Accepted shapes during restart',
    () =>
      Effect.gen(function* () {
        const oppositeSnapshot = V3InMemoryProgramStoreSnapshot.make({
          ...emptyV3InMemoryProgramStoreSnapshot,
          acceptedMessageOccurrences: [acceptedOccurrence],
          messageProposalResolutions: [
            proposalResolution,
            acceptedProposalResolution,
          ],
        })
        const missingOccurrenceSnapshot = V3InMemoryProgramStoreSnapshot.make({
          ...emptyV3InMemoryProgramStoreSnapshot,
          messageProposalResolutions: [acceptedProposalResolution],
        })
        const missingGuardSnapshot = V3InMemoryProgramStoreSnapshot.make({
          ...emptyV3InMemoryProgramStoreSnapshot,
          acceptedMessageOccurrences: [acceptedOccurrence],
        })

        const oppositeConflict = yield* Effect.flip(
          makeV3InMemoryProgramStores(oppositeSnapshot),
        )
        const missingOccurrenceConflict = yield* Effect.flip(
          makeV3InMemoryProgramStores(missingOccurrenceSnapshot),
        )
        const missingGuardConflict = yield* Effect.flip(
          makeV3InMemoryProgramStores(missingGuardSnapshot),
        )

        expect(oppositeConflict).toBeInstanceOf(V3ProgramStoreTerminalConflict)
        expect(missingOccurrenceConflict).toMatchObject({
          _tag: 'V3ProgramStoreAcceptedMessageOccurrenceMismatch',
          reason: 'AtomicPairIncomplete',
        })
        expect(missingGuardConflict).toMatchObject({
          _tag: 'V3ProgramStoreAcceptedMessageOccurrenceMismatch',
          reason: 'AtomicPairIncomplete',
        })
      }),
  )

  it.effect(
    'reconstructs complete Accepted pairs and atomically rejects an occurrence alias tie',
    () =>
      Effect.gen(function* () {
        const snapshot = V3InMemoryProgramStoreSnapshot.make({
          ...emptyV3InMemoryProgramStoreSnapshot,
          acceptedMessageOccurrences: [
            secondAcceptedOccurrence,
            acceptedOccurrence,
          ],
          messageProposalResolutions: [
            secondAcceptedProposalResolution,
            acceptedProposalResolution,
          ],
        })
        const stores = yield* makeV3InMemoryProgramStores(snapshot)
        const retry =
          yield* stores.authority.appendServerConfirmedAcceptedMessageOccurrence(
            acceptedTransaction,
          )
        const conflict = yield* Effect.flip(
          stores.authority.appendServerConfirmedAcceptedMessageOccurrence(
            conflictingAcceptedTransaction,
          ),
        )
        const occurrences = Option.getOrThrow(
          yield* Stream.runHead(
            stores.authority.serverConfirmed.observeAcceptedMessageOccurrences(
              scope,
            ),
          ),
        )
        const resolutions = Option.getOrThrow(
          yield* Stream.runHead(
            stores.authority.serverConfirmed.observeMessageProposalResolutions(
              scope,
            ),
          ),
        )

        expect(retry.disposition).toBe('Idempotent')
        expect(
          occurrences.map(occurrence => occurrence.acceptedSequence),
        ).toEqual([1, 2])
        expect(resolutions).toHaveLength(2)
        expect(
          resolutions.some(
            resolution =>
              resolution.proposalId ===
              conflictingAcceptedProposalResolution.proposalId,
          ),
        ).toBe(false)
        expect(conflict).toBeInstanceOf(V3ProgramStoreIdentityConflict)
      }),
  )

  it.effect(
    'appends Active rotation and revocation with retries, forks, and policy isolation',
    () =>
      Effect.gen(function* () {
        const stores = yield* makeV3InMemoryProgramStores()
        const first =
          yield* stores.authority.appendServerConfirmedOriginPolicyDecision(
            firstOriginPolicyDecision,
          )
        const retry =
          yield* stores.authority.appendServerConfirmedOriginPolicyDecision(
            firstOriginPolicyDecision,
          )
        const forkConflict = yield* Effect.flip(
          stores.authority.appendServerConfirmedOriginPolicyDecision(
            conflictingOriginPolicyDecision,
          ),
        )
        const rotation =
          yield* stores.authority.appendServerConfirmedOriginPolicyDecision(
            secondOriginPolicyDecision,
          )
        const revocation =
          yield* stores.authority.appendServerConfirmedOriginPolicyDecision(
            revokedOriginPolicyDecision,
          )
        const revocationRetry =
          yield* stores.authority.appendServerConfirmedOriginPolicyDecision(
            revokedOriginPolicyDecision,
          )
        const terminalConflict = yield* Effect.flip(
          stores.authority.appendServerConfirmedOriginPolicyDecision(
            afterRevokedOriginPolicyDecision,
          ),
        )
        const isolated =
          yield* stores.authority.appendServerConfirmedOriginPolicyDecision(
            isolatedOriginPolicyDecision,
          )
        const otherSubject =
          yield* stores.authority.appendServerConfirmedOriginPolicyDecision(
            otherSubjectOriginPolicyDecision,
          )
        const decisions = Option.getOrThrow(
          yield* Stream.runHead(
            stores.authority.serverConfirmed.observeOriginPolicyDecisions(
              originPolicyScope,
            ),
          ),
        )

        expect(first.disposition).toBe('Appended')
        expect(retry.disposition).toBe('Idempotent')
        expect(forkConflict).toBeInstanceOf(V3ProgramStoreIdentityConflict)
        expect(rotation.disposition).toBe('Appended')
        expect(revocation.disposition).toBe('Appended')
        expect(revocationRetry.disposition).toBe('Idempotent')
        expect(terminalConflict).toMatchObject({
          _tag: 'V3OriginPolicyDecisionLifecycleConflict',
          reason: 'PolicyPermanentlyTerminal',
        })
        expect(isolated.disposition).toBe('Appended')
        expect(otherSubject.disposition).toBe('Appended')
        expect(
          decisions
            .filter(
              decision =>
                decision.originPolicyId ===
                firstOriginPolicyDecision.originPolicyId,
            )
            .map(decision => decision.generation),
        ).toEqual([1, 2, 3])
        expect(secondOriginPolicyDecision.previousDecisionId).toBe(
          firstOriginPolicyDecision.decisionId,
        )
      }),
  )

  it.effect('allows initial Denied and keeps it permanently terminal', () =>
    Effect.gen(function* () {
      const stores = yield* makeV3InMemoryProgramStores()

      const denied =
        yield* stores.authority.appendServerConfirmedOriginPolicyDecision(
          deniedOriginPolicyDecision,
        )
      const retry =
        yield* stores.authority.appendServerConfirmedOriginPolicyDecision(
          deniedOriginPolicyDecision,
        )
      const terminalConflict = yield* Effect.flip(
        stores.authority.appendServerConfirmedOriginPolicyDecision(
          afterDeniedOriginPolicyDecision,
        ),
      )

      expect(denied.disposition).toBe('Appended')
      expect(retry.disposition).toBe('Idempotent')
      expect(terminalConflict).toBeInstanceOf(
        V3OriginPolicyDecisionLifecycleConflict,
      )
      expect(terminalConflict).toMatchObject({
        reason: 'PolicyPermanentlyTerminal',
      })
    }),
  )

  it.effect(
    'rejects missing initial decisions, gaps, invalid transitions, and immutable mutations',
    () =>
      Effect.gen(function* () {
        const missingInitialStores = yield* makeV3InMemoryProgramStores()
        const missingInitialConflict = yield* Effect.flip(
          missingInitialStores.authority.appendServerConfirmedOriginPolicyDecision(
            secondOriginPolicyDecision,
          ),
        )

        const gapStores = yield* makeV3InMemoryProgramStores()
        yield* gapStores.authority.appendServerConfirmedOriginPolicyDecision(
          firstOriginPolicyDecision,
        )
        const gapConflict = yield* Effect.flip(
          gapStores.authority.appendServerConfirmedOriginPolicyDecision(
            gapOriginPolicyDecision,
          ),
        )

        const transitionStores = yield* makeV3InMemoryProgramStores()
        yield* transitionStores.authority.appendServerConfirmedOriginPolicyDecision(
          firstOriginPolicyDecision,
        )
        const transitionConflict = yield* Effect.flip(
          transitionStores.authority.appendServerConfirmedOriginPolicyDecision(
            activeToDeniedOriginPolicyDecision,
          ),
        )

        const immutableStores = yield* makeV3InMemoryProgramStores()
        yield* immutableStores.authority.appendServerConfirmedOriginPolicyDecision(
          firstOriginPolicyDecision,
        )
        const immutableConflict = yield* Effect.flip(
          immutableStores.authority.appendServerConfirmedOriginPolicyDecision(
            immutableOriginPolicyMutation,
          ),
        )

        const timestampStores = yield* makeV3InMemoryProgramStores()
        yield* timestampStores.authority.appendServerConfirmedOriginPolicyDecision(
          firstOriginPolicyDecision,
        )
        const timestampConflict = yield* Effect.flip(
          timestampStores.authority.appendServerConfirmedOriginPolicyDecision(
            timestampRegressedOriginPolicyDecision,
          ),
        )

        expect(missingInitialConflict).toMatchObject({
          _tag: 'V3OriginPolicyDecisionLifecycleConflict',
          reason: 'InitialDecisionRequired',
        })
        expect(gapConflict).toMatchObject({
          _tag: 'V3OriginPolicyDecisionLifecycleConflict',
          reason: 'DecisionGenerationNotSequential',
        })
        expect(transitionConflict).toMatchObject({
          _tag: 'V3OriginPolicyDecisionLifecycleConflict',
          reason: 'InvalidDecisionTransition',
        })
        expect(immutableConflict).toMatchObject({
          _tag: 'V3OriginPolicyDecisionLifecycleConflict',
          reason: 'ImmutablePolicyChanged',
        })
        expect(timestampConflict).toMatchObject({
          _tag: 'V3OriginPolicyDecisionLifecycleConflict',
          reason: 'DecisionTimestampRegressed',
        })
      }),
  )

  it.effect(
    'reconstructs unsorted policy chains grouped in numeric order',
    () =>
      Effect.gen(function* () {
        const snapshot = V3InMemoryProgramStoreSnapshot.make({
          ...emptyV3InMemoryProgramStoreSnapshot,
          originPolicyDecisions: [
            revokedOriginPolicyDecision,
            deniedOriginPolicyDecision,
            secondOriginPolicyDecision,
            isolatedOriginPolicyDecision,
            firstOriginPolicyDecision,
          ],
        })
        const stores = yield* makeV3InMemoryProgramStores(snapshot)
        const reconstructedSnapshot = yield* stores.readSnapshot
        const retry =
          yield* stores.authority.appendServerConfirmedOriginPolicyDecision(
            revokedOriginPolicyDecision,
          )

        expect(retry.disposition).toBe('Idempotent')
        expect(
          reconstructedSnapshot.originPolicyDecisions.map(decision => [
            decision.originPolicyId,
            decision.generation,
          ]),
        ).toEqual([
          ['origin-policy-1', 1],
          ['origin-policy-1', 2],
          ['origin-policy-1', 3],
          ['origin-policy-2', 1],
          ['origin-policy-denied', 1],
        ])
      }),
  )

  it.effect(
    'orders effect requests and placements by their semantic positions',
    () =>
      Effect.gen(function* () {
        const stores = yield* makeV3InMemoryProgramStores()
        yield* stores.authority.appendServerConfirmedEffectRequest(
          secondEffectRequest,
        )
        yield* stores.authority.appendServerConfirmedEffectRequest(
          firstEffectRequest,
        )
        yield* stores.authority.appendServerConfirmedEffectPlacement(
          secondEffectPlacement,
        )
        yield* stores.authority.appendServerConfirmedEffectPlacement(
          firstEffectPlacement,
        )
        yield* stores.authority.appendServerConfirmedEffectPlacement(
          cancellationTenPlacement,
        )
        yield* stores.authority.appendServerConfirmedEffectPlacement(
          cancellationTwoPlacement,
        )

        const requests = Option.getOrThrow(
          yield* Stream.runHead(
            stores.authority.serverConfirmed.observeEffectRequests(scope),
          ),
        )
        const placements = Option.getOrThrow(
          yield* Stream.runHead(
            stores.authority.serverConfirmed.observeEffectPlacements(scope),
          ),
        )

        expect(requests.map(request => request.requestId)).toEqual([
          firstEffectRequest.requestId,
          secondEffectRequest.requestId,
        ])
        expect(
          placements.map(placement => placement.assignmentGeneration),
        ).toEqual([1, 2, 3, 3])
        expect(
          placements.map(placement => placement.cancellationGeneration),
        ).toEqual([0, 0, 2, 10])
      }),
  )

  it.effect(
    'allows equal checkpoint positions for different Processors and conflicts within one Processor',
    () =>
      Effect.gen(function* () {
        const stores = yield* makeV3InMemoryProgramStores()
        yield* stores.authority.appendServerConfirmedProjectionCheckpoint(
          projectionCheckpoint,
        )
        yield* stores.authority.appendServerConfirmedProjectionCheckpoint(
          clientProjectionCheckpoint,
        )
        yield* stores.authority.appendServerConfirmedProjectionCheckpoint(
          newestProjectionCheckpoint,
        )
        const conflict = yield* Effect.flip(
          stores.authority.appendServerConfirmedProjectionCheckpoint(
            conflictingProjectionCheckpoint,
          ),
        )
        const checkpoints = Option.getOrThrow(
          yield* Stream.runHead(
            stores.authority.serverConfirmed.observeProjectionCheckpoints(
              scope,
            ),
          ),
        )

        expect(checkpoints).toHaveLength(3)
        expect(
          checkpoints.map(checkpoint => checkpoint.throughAcceptedSequence),
        ).toEqual([2, 1, 1])
        expect(
          checkpoints.map(checkpoint => checkpoint.projectorProcessorId),
        ).toEqual(expect.arrayContaining([clientId, processorId]))
        expect(conflict).toBeInstanceOf(V3ProgramStoreIdentityConflict)
      }),
  )
})
