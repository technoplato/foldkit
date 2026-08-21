import { Option, Schema as S } from 'effect'
import { Command, Processor, Synchronization } from 'foldkit'
import { describe, expect, it } from 'vitest'

import {
  InstantMessageProposalRecord,
  InstantProgramEntities,
  InstantProgramSessionRecord,
} from '../schema/schema.js'
import { InstantV3ProgramEntities } from './entities.js'
import {
  InstantV3ProgramSessionIdentity,
  instantV3OriginPolicyProtocolVersion,
  instantV3ProgramProtocolVersion,
  printInstantV3ProgramSessionId,
  stringifyInstantV3CanonicalJson,
} from './identity.js'
import {
  InstantV3AcceptedMessageOccurrenceRecord,
  InstantV3AcceptedMessageProposalResolutionRecord,
  InstantV3ActiveOriginPolicyDecision,
  InstantV3EffectPlacementRecord,
  InstantV3EffectRequestRecord,
  InstantV3EffectResultProposalRecord,
  InstantV3MessageProposalRecord,
  InstantV3MessageProposalResolutionRecord,
  InstantV3OrdinaryMessageProposalRecord,
  InstantV3OriginEnrollmentClaimRecord,
  InstantV3OriginPolicyDecisionRecord,
  InstantV3ProgramSessionRecord,
  InstantV3ProjectionCheckpointRecord,
  InstantV3RejectedMessageProposalResolutionRecord,
  InstantV3RevokedOriginPolicyDecision,
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
} from './records.js'

const appSubjectDigest = 'a'.repeat(64)
const proofDigest = 'b'.repeat(64)
const sessionEpochId = 'e'.repeat(22)
const deviceId = 'A2sX0fLhLEJH-Lzm5WOkQPJ3A32BLeszoPShOUXYmMKW'
const clientId = 'A3zyexiNA09-ilI4AwS1GsPAiWnid_IbNaYLSPxHZpl4'
const processorId = 'Al7L5NGmMwpEyPfvlR1L8WXmxrch762phftBZhvG5_1s'
const signature = 'A'.repeat(86)
const clientCertificateJson = stringifyInstantV3CanonicalJson({
  scope: 'client',
  version: 1,
})
const processorCertificateJson = stringifyInstantV3CanonicalJson({
  scope: 'processor',
  version: 1,
})
const sessionPolicy = Synchronization.SessionPolicy.make({
  generation: 2,
  mode: Synchronization.Mirror.make({}),
})
const audience = Synchronization.SessionAudience.make({})
const sessionIdentity = InstantV3ProgramSessionIdentity.make({
  appSubjectDigest,
  originPolicyProtocolVersion: instantV3OriginPolicyProtocolVersion,
  programId: 'counter',
  programVersion: 1,
  sessionEpochId,
})
const sessionId = printInstantV3ProgramSessionId(sessionIdentity)
const scope = {
  appSubjectDigest,
  instantAppId: 'instant-app-1',
  programId: 'counter',
  programVersion: 1,
  protocolVersion: instantV3ProgramProtocolVersion,
  sessionEpochId,
  sessionId,
  subjectId: 'subject-1',
}
const rowIds = {
  accepted: '00000000-0000-4000-8000-000000000005',
  acceptedResolution: '00000000-0000-4000-8000-000000000014',
  checkpoint: '00000000-0000-4000-8000-000000000009',
  decision: '00000000-0000-4000-8000-000000000003',
  effectPlacement: '00000000-0000-4000-8000-000000000008',
  effectProposal: '00000000-0000-4000-8000-000000000010',
  effectRequest: '00000000-0000-4000-8000-000000000007',
  enrollment: '00000000-0000-4000-8000-000000000002',
  ordinaryProposal: '00000000-0000-4000-8000-000000000004',
  resolution: '00000000-0000-4000-8000-000000000006',
  session: '00000000-0000-4000-8000-000000000001',
}
const proposalCommon = {
  actorId: 'actor-1',
  actorSequence: 4,
  causationOccurrenceId: null,
  clientId,
  correlationId: 'correlation-1',
  createdAtMs: 1_753_825_000_000,
  envelopeJson: stringifyInstantV3CanonicalJson({ event: 'Opened' }),
  envelopeVersion: 1,
  eventId: 'counter.opened',
  eventVersion: 1,
  occurrenceId: 'interaction-occurrence-1',
  originDeviceId: deviceId,
  originatingProcessorId: processorId,
  payloadJson: stringifyInstantV3CanonicalJson({ _tag: 'Opened' }),
  ...scope,
}
const ordinaryFields = {
  admissionClaimJson: stringifyInstantV3CanonicalJson({
    _tag: 'ActivatedInteraction',
    value: 1,
  }),
  admissionOccurrenceId: proposalCommon.occurrenceId,
  messageIdempotencyKey: 'ordinary-message-1',
  originClientCertificateJson: clientCertificateJson,
  originPolicyGeneration: 1,
  originPolicyId: 'origin-policy-1',
  originProcessorCertificateJson: processorCertificateJson,
  originProposalSignature: signature,
}
const ordinaryProposal = InstantV3OrdinaryMessageProposalRecord.make({
  ...proposalCommon,
  ...ordinaryFields,
  actorSequencePositionKey:
    makeInstantV3MessageProposalActorSequencePositionKey(
      sessionId,
      proposalCommon.actorId,
      proposalCommon.clientId,
      proposalCommon.actorSequence,
    ),
  id: rowIds.ordinaryProposal,
  messageIdempotencyPositionKey:
    makeInstantV3MessageProposalMessageIdempotencyPositionKey(
      sessionId,
      ordinaryFields.messageIdempotencyKey,
    ),
  occurrencePositionKey: makeInstantV3MessageProposalOccurrencePositionKey(
    sessionId,
    proposalCommon.occurrenceId,
  ),
  proposalId: 'proposal-ordinary-1',
  proposalKind: 'OrdinaryMessage',
  proposalPositionKey: makeInstantV3MessageProposalPositionKey(
    sessionId,
    'proposal-ordinary-1',
  ),
})
const effectPlacementId = makeInstantV3EffectPlacementPositionKey(
  sessionId,
  'effect-request-1',
  1,
  0,
)
const effectFields = {
  causalAcceptedSequence: 1,
  causalAudience: audience,
  causalMessageCategory: Synchronization.MessageCategory.make('Domain'),
  causalOccurrenceId: ordinaryProposal.occurrenceId,
  causalOriginDeviceId: deviceId,
  causalOriginPolicyGeneration: ordinaryProposal.originPolicyGeneration,
  causalOriginPolicyId: ordinaryProposal.originPolicyId,
  causalOriginProofDigest: proofDigest,
  causalOriginatingProcessorId: processorId,
  causalPolicyGeneration: sessionPolicy.generation,
  causalProposalId: ordinaryProposal.proposalId,
  effectAssignmentGeneration: 1,
  effectCancellationGeneration: 0,
  effectIdempotencyKey: 'effect-result-1',
  effectPlacementId,
  effectRequestId: 'effect-request-1',
  executorClientCertificateJson: clientCertificateJson,
  executorOriginPolicyGeneration: 1,
  executorOriginPolicyId: 'origin-policy-1',
  executorProcessorCertificateJson: processorCertificateJson,
  executorProcessorId: processorId,
  executorResultSignature: signature,
}
const effectProposal = InstantV3EffectResultProposalRecord.make({
  ...proposalCommon,
  ...effectFields,
  actorSequencePositionKey:
    makeInstantV3MessageProposalActorSequencePositionKey(
      sessionId,
      proposalCommon.actorId,
      proposalCommon.clientId,
      proposalCommon.actorSequence,
    ),
  effectIdempotencyPositionKey:
    makeInstantV3MessageProposalEffectIdempotencyPositionKey(
      sessionId,
      effectFields.effectIdempotencyKey,
    ),
  effectRequestResultPositionKey:
    makeInstantV3MessageProposalEffectRequestResultPositionKey(
      sessionId,
      effectFields.effectRequestId,
    ),
  eventId: 'counter.persisted',
  id: rowIds.effectProposal,
  occurrenceId: 'effect-occurrence-1',
  occurrencePositionKey: makeInstantV3MessageProposalOccurrencePositionKey(
    sessionId,
    'effect-occurrence-1',
  ),
  payloadJson: stringifyInstantV3CanonicalJson({ _tag: 'Persisted' }),
  proposalId: 'proposal-effect-1',
  proposalKind: 'EffectResult',
  proposalPositionKey: makeInstantV3MessageProposalPositionKey(
    sessionId,
    'proposal-effect-1',
  ),
})
const programSession = InstantV3ProgramSessionRecord.make({
  ...scope,
  authorityProcessorId: 'authority-processor',
  createdAtMs: 1_753_825_000_000,
  id: rowIds.session,
  lifecycleGeneration: 1,
  lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
    sessionId,
    1,
  ),
  lifecycleState: 'Active',
  originPolicyProtocolVersion: instantV3OriginPolicyProtocolVersion,
  previousLifecyclePositionKey: null,
  processorRoomId: 'processor-room-12345678901234567890123456789012',
  sessionPolicy,
})
const enrollmentClaim = InstantV3OriginEnrollmentClaimRecord.make({
  claimSignature: signature,
  claimedAtMs: 1_753_825_000_001,
  enrollmentClaimId: 'enrollment-claim-1',
  enrollmentClaimPositionKey: makeInstantV3OriginEnrollmentClaimPositionKey(
    scope.instantAppId,
    scope.subjectId,
    instantV3ProgramProtocolVersion,
    'enrollment-claim-1',
  ),
  id: rowIds.enrollment,
  instantAppId: scope.instantAppId,
  originDeviceId: deviceId,
  protocolVersion: instantV3ProgramProtocolVersion,
  subjectId: scope.subjectId,
})
const decisionPositionKey = makeInstantV3OriginPolicyDecisionPositionKey(
  scope.instantAppId,
  scope.subjectId,
  instantV3ProgramProtocolVersion,
  'origin-policy-1',
  1,
)
const originPolicyDecision = InstantV3OriginPolicyDecisionRecord.make({
  decidedAtMs: 1_753_825_000_002,
  decidingProcessorId: 'policy-authority',
  decision: InstantV3ActiveOriginPolicyDecision.make({}),
  decisionId: decisionPositionKey,
  decisionState: 'Active',
  enrollmentClaimId: enrollmentClaim.enrollmentClaimId,
  enrollmentClaimPositionKey: enrollmentClaim.enrollmentClaimPositionKey,
  generation: 1,
  id: rowIds.decision,
  instantAppId: scope.instantAppId,
  originDeviceId: deviceId,
  originPolicyId: 'origin-policy-1',
  positionKey: decisionPositionKey,
  previousDecisionId: null,
  protocolVersion: instantV3ProgramProtocolVersion,
  subjectId: scope.subjectId,
})
const acceptedOccurrence = InstantV3AcceptedMessageOccurrenceRecord.make({
  ...scope,
  ...ordinaryFields,
  acceptedAtMs: 1_753_825_000_003,
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
    ordinaryProposal.clientId,
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
  id: rowIds.accepted,
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
    id: rowIds.acceptedResolution,
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
const proposalResolution =
  InstantV3RejectedMessageProposalResolutionRecord.make({
    ...scope,
    actorId: effectProposal.actorId,
    actorSequence: effectProposal.actorSequence,
    clientId,
    id: rowIds.resolution,
    originDeviceId: deviceId,
    originatingProcessorId: processorId,
    proposalId: effectProposal.proposalId,
    proposalKind: 'EffectResult',
    proposalTerminalPositionKey:
      makeInstantV3MessageProposalResolutionPositionKey(
        sessionId,
        effectProposal.proposalId,
      ),
    rejectedAtMs: 1_753_825_000_004,
    rejectingProcessorId: 'authority-processor',
    rejectionReason: 'CausalLinkageInvalid',
    resolutionState: 'Rejected',
  })
const placement = Processor.Placement.make({
  affinity: Processor.AnyProcessor.make({}),
  capability: Processor.CapabilityRequirement.make({
    id: ['Counter', 'Write'],
    minimumVersion: 1,
  }),
  cardinality: 'One',
  unavailable: 'Wait',
  version: 1,
})
const causalFields = {
  causalAcceptedSequence: 1,
  causalAudience: audience,
  causalMessageCategory: Synchronization.MessageCategory.make('Domain'),
  causalOccurrenceId: acceptedOccurrence.occurrenceId,
  causalOriginDeviceId: deviceId,
  causalOriginPolicyGeneration: 1,
  causalOriginPolicyId: 'origin-policy-1',
  causalOriginProofDigest: proofDigest,
  causalOriginatingProcessorId: processorId,
  causalPolicyGeneration: sessionPolicy.generation,
  causalProposalId: ordinaryProposal.proposalId,
}
const effectRequest = InstantV3EffectRequestRecord.make({
  ...scope,
  ...causalFields,
  effectId: 'counter.persist',
  effectVersion: 1,
  id: rowIds.effectRequest,
  idempotencyKey: 'effect-request-idempotency-1',
  idempotencyPositionKey: makeInstantV3EffectRequestIdempotencyPositionKey(
    sessionId,
    'effect-request-idempotency-1',
  ),
  minimumCapabilityVersion: 1,
  originatingProcessorId: processorId,
  placement,
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
  requestedAtMs: 1_753_825_000_005,
  requiredCapabilityIdJson: makeInstantV3CapabilityIdIndex(
    placement.capability.id,
  ),
})
const effectPlacement = InstantV3EffectPlacementRecord.make({
  ...scope,
  assignedProcessorId: processorId,
  assignmentGeneration: 1,
  cancellationGeneration: 0,
  decidedAtMs: 1_753_825_000_006,
  id: rowIds.effectPlacement,
  placementDecision: Processor.AssignedPreferred.make({ processorId }),
  placementId: effectPlacementId,
  placementStatus: 'AssignedPreferred',
  positionKey: effectPlacementId,
  requestId: effectRequest.requestId,
})
const checkpointId = makeInstantV3ProjectionCheckpointId(
  sessionId,
  processorId,
  1,
)
const projectionCheckpoint = InstantV3ProjectionCheckpointRecord.make({
  ...scope,
  checkpointId,
  createdAtMs: 1_753_825_000_007,
  id: rowIds.checkpoint,
  modelDigest: 'c'.repeat(64),
  modelJson: stringifyInstantV3CanonicalJson({ count: 1 }),
  processorCheckpointKey: checkpointId,
  projectionVersion: 1,
  projectorProcessorId: processorId,
  throughAcceptedSequence: 1,
})

describe('protocol-v3 proposal separation', () => {
  it('admits the exact ordinary and EffectResult structures', () => {
    expect(
      S.decodeUnknownSync(InstantV3MessageProposalRecord)(ordinaryProposal),
    ).toEqual(ordinaryProposal)
    expect(
      S.decodeUnknownSync(InstantV3MessageProposalRecord)(effectProposal),
    ).toEqual(effectProposal)
  })

  it('forbids claim, effect, and client-selected routing fields across variants', () => {
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3MessageProposalRecord)({
          ...ordinaryProposal,
          effectRequestId: 'forbidden-request',
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3MessageProposalRecord)({
          ...effectProposal,
          admissionClaimJson: ordinaryFields.admissionClaimJson,
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3MessageProposalRecord)({
          ...ordinaryProposal,
          proposedAudience: audience,
        }),
      ),
    ).toBe(true)
  })

  it('requires the complete executor chain, exact executor, and exact session scope', () => {
    const withoutClientCertificate = {
      ...effectProposal,
      executorClientCertificateJson: undefined,
    }
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3EffectResultProposalRecord)(
          withoutClientCertificate,
        ),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3EffectResultProposalRecord)({
          ...effectProposal,
          executorProcessorId: deviceId,
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3OrdinaryMessageProposalRecord)({
          ...ordinaryProposal,
          sessionEpochId: 'f'.repeat(22),
        }),
      ),
    ).toBe(true)
  })
})

describe('protocol-v3 record invariants', () => {
  it('models one strict Accepted or Rejected proposal-terminal guard union', () => {
    expect(
      Option.isSome(
        S.decodeUnknownOption(InstantV3MessageProposalResolutionRecord)(
          acceptedProposalResolution,
        ),
      ),
    ).toBe(true)
    expect(
      Option.isSome(
        S.decodeUnknownOption(InstantV3MessageProposalResolutionRecord)(
          proposalResolution,
        ),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3MessageProposalResolutionRecord)({
          ...acceptedProposalResolution,
          rejectedAtMs: proposalResolution.rejectedAtMs,
          rejectingProcessorId: proposalResolution.rejectingProcessorId,
          rejectionReason: proposalResolution.rejectionReason,
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3MessageProposalResolutionRecord)({
          ...proposalResolution,
          acceptedAtMs: acceptedProposalResolution.acceptedAtMs,
          acceptedMessageOccurrenceId:
            acceptedProposalResolution.acceptedMessageOccurrenceId,
          acceptedMessageOccurrencePositionKey:
            acceptedProposalResolution.acceptedMessageOccurrencePositionKey,
          acceptingProcessorId: acceptedProposalResolution.acceptingProcessorId,
        }),
      ),
    ).toBe(true)
    expect(acceptedProposalResolution.proposalTerminalPositionKey).toBe(
      makeInstantV3MessageProposalResolutionPositionKey(
        sessionId,
        acceptedOccurrence.proposalId,
      ),
    )
  })

  it('uses UUIDv4 row ids independently of every canonical composite key', () => {
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3ProgramSessionRecord)({
          ...programSession,
          id: programSession.sessionId,
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3OriginEnrollmentClaimRecord)({
          ...enrollmentClaim,
          id: enrollmentClaim.enrollmentClaimId,
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3OriginPolicyDecisionRecord)({
          ...originPolicyDecision,
          id: originPolicyDecision.decisionId,
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3OriginPolicyDecisionRecord)({
          ...originPolicyDecision,
          decision: InstantV3RevokedOriginPolicyDecision.make({
            reason: 'Compromised Device',
          }),
          decisionState: 'Revoked',
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3MessageProposalRecord)({
          ...ordinaryProposal,
          id: ordinaryProposal.proposalId,
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3AcceptedMessageOccurrenceRecord)({
          ...acceptedOccurrence,
          id: acceptedOccurrence.occurrenceId,
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3MessageProposalResolutionRecord)({
          ...proposalResolution,
          id: proposalResolution.proposalId,
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3EffectRequestRecord)({
          ...effectRequest,
          id: effectRequest.requestId,
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3EffectPlacementRecord)({
          ...effectPlacement,
          id: effectPlacement.positionKey,
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3ProjectionCheckpointRecord)({
          ...projectionCheckpoint,
          id: projectionCheckpoint.processorCheckpointKey,
        }),
      ),
    ).toBe(true)

    expect(originPolicyDecision.positionKey).toBe(
      '["OriginPolicyDecision","instant-app-1","subject-1",3,"PolicyGeneration","origin-policy-1",1]',
    )
    expect(effectPlacement.positionKey).toBe(
      `["EffectPlacement","${sessionId}","PlacementGeneration","effect-request-1",1,0]`,
    )
    expect(projectionCheckpoint.processorCheckpointKey).toBe(
      `["ProjectionCheckpoint","${sessionId}","ProcessorCheckpoint","${processorId}",1]`,
    )
  })

  it('models Program-session state as append-only linked lifecycle generations', () => {
    const secondLifecyclePositionKey =
      makeInstantV3ProgramSessionLifecyclePositionKey(sessionId, 2)
    const secondGeneration = InstantV3ProgramSessionRecord.make({
      ...programSession,
      id: '00000000-0000-4000-8000-000000000013',
      lifecycleGeneration: 2,
      lifecyclePositionKey: secondLifecyclePositionKey,
      previousLifecyclePositionKey: programSession.lifecyclePositionKey,
    })

    expect(secondGeneration.lifecyclePositionKey).toBe(
      `["ProgramSession","${sessionId}","LifecycleGeneration",2]`,
    )
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3ProgramSessionRecord)({
          ...programSession,
          lifecycleState: 'Revoked',
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3ProgramSessionRecord)({
          ...secondGeneration,
          previousLifecyclePositionKey: null,
        }),
      ),
    ).toBe(true)

    const sessionAttrs = InstantV3ProgramEntities.foldkitV3ProgramSessions.attrs
    expect(sessionAttrs.sessionId.config.unique).toBe(false)
    expect(sessionAttrs.lifecyclePositionKey.config.unique).toBe(true)
  })

  it('enforces exact server decision states and prior-generation linkage', () => {
    const secondPositionKey = makeInstantV3OriginPolicyDecisionPositionKey(
      originPolicyDecision.instantAppId,
      originPolicyDecision.subjectId,
      originPolicyDecision.protocolVersion,
      originPolicyDecision.originPolicyId,
      2,
    )
    expect(
      InstantV3OriginPolicyDecisionRecord.make({
        ...originPolicyDecision,
        decisionId: secondPositionKey,
        generation: 2,
        id: '00000000-0000-4000-8000-000000000011',
        positionKey: secondPositionKey,
        previousDecisionId: originPolicyDecision.decisionId,
      }).generation,
    ).toBe(2)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3OriginPolicyDecisionRecord)({
          ...originPolicyDecision,
          decisionId: secondPositionKey,
          generation: 2,
          positionKey: secondPositionKey,
          previousDecisionId: 'origin-policy-1:0',
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3OriginPolicyDecisionRecord)({
          ...originPolicyDecision,
          decisionState: 'Denied',
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3OriginPolicyDecisionRecord)({
          ...originPolicyDecision,
          decision: { _tag: 'Pending' },
          decisionState: 'Pending',
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3OriginPolicyDecisionRecord)({
          ...originPolicyDecision,
          decidedAtMs: -1,
        }),
      ),
    ).toBe(true)
  })

  it('keys checkpoints by Processor without globally uniquing epoch-scoped idempotency', () => {
    const otherCheckpointId = makeInstantV3ProjectionCheckpointId(
      sessionId,
      clientId,
      projectionCheckpoint.throughAcceptedSequence,
    )
    expect(otherCheckpointId).not.toBe(projectionCheckpoint.checkpointId)
    expect(
      InstantV3ProgramEntities.foldkitV3MessageProposals.attrs
        .messageIdempotencyKey.config.unique,
    ).toBe(false)
    expect(
      InstantV3ProgramEntities.foldkitV3MessageProposals.attrs
        .effectIdempotencyKey.config.unique,
    ).toBe(false)
    expect(
      InstantV3ProgramEntities.foldkitV3EffectRequests.attrs.idempotencyKey
        .config.unique,
    ).toBe(false)
  })

  it('represents equal raw proposal identities in distinct epochs with exact scoped keys', () => {
    const otherSessionEpochId = 'f'.repeat(22)
    const otherSessionId = printInstantV3ProgramSessionId(
      InstantV3ProgramSessionIdentity.make({
        ...sessionIdentity,
        sessionEpochId: otherSessionEpochId,
      }),
    )
    const otherEpochProposal = InstantV3OrdinaryMessageProposalRecord.make({
      ...ordinaryProposal,
      actorSequencePositionKey:
        makeInstantV3MessageProposalActorSequencePositionKey(
          otherSessionId,
          ordinaryProposal.actorId,
          ordinaryProposal.clientId,
          ordinaryProposal.actorSequence,
        ),
      id: '00000000-0000-4000-8000-000000000012',
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
      sessionEpochId: otherSessionEpochId,
      sessionId: otherSessionId,
    })

    expect(otherEpochProposal.proposalId).toBe(ordinaryProposal.proposalId)
    expect(otherEpochProposal.occurrenceId).toBe(ordinaryProposal.occurrenceId)
    expect(otherEpochProposal.messageIdempotencyKey).toBe(
      ordinaryProposal.messageIdempotencyKey,
    )
    expect(otherEpochProposal.proposalPositionKey).not.toBe(
      ordinaryProposal.proposalPositionKey,
    )
    expect(
      makeInstantV3MessageProposalPositionKey(
        ordinaryProposal.sessionId,
        ordinaryProposal.proposalId,
      ),
    ).toBe(ordinaryProposal.proposalPositionKey)
    expect(
      Option.isSome(
        S.decodeUnknownOption(InstantV3MessageProposalRecord)(
          otherEpochProposal,
        ),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3MessageProposalRecord)({
          ...otherEpochProposal,
          proposalPositionKey: ordinaryProposal.proposalPositionKey,
        }),
      ),
    ).toBe(true)
  })

  it('separates equal actor sequences emitted by different Clients', () => {
    const otherClientId = 'B'.repeat(44)
    expect(
      makeInstantV3MessageProposalActorSequencePositionKey(
        sessionId,
        ordinaryProposal.actorId,
        clientId,
        ordinaryProposal.actorSequence,
      ),
    ).not.toBe(
      makeInstantV3MessageProposalActorSequencePositionKey(
        sessionId,
        ordinaryProposal.actorId,
        otherClientId,
        ordinaryProposal.actorSequence,
      ),
    )
    expect(
      makeInstantV3AcceptedActorSequencePositionKey(
        sessionId,
        ordinaryProposal.actorId,
        clientId,
        ordinaryProposal.actorSequence,
      ),
    ).not.toBe(
      makeInstantV3AcceptedActorSequencePositionKey(
        sessionId,
        ordinaryProposal.actorId,
        otherClientId,
        ordinaryProposal.actorSequence,
      ),
    )
  })

  it('uniques every persisted scoped alias while leaving its raw semantic input reusable', () => {
    const proposalAttrs =
      InstantV3ProgramEntities.foldkitV3MessageProposals.attrs
    expect(proposalAttrs.proposalId.config.unique).toBe(false)
    expect(proposalAttrs.occurrenceId.config.unique).toBe(false)
    expect(proposalAttrs.actorSequence.config.unique).toBe(false)
    expect(proposalAttrs.messageIdempotencyKey.config.unique).toBe(false)
    expect(proposalAttrs.effectIdempotencyKey.config.unique).toBe(false)
    expect(proposalAttrs.effectRequestId.config.unique).toBe(false)
    expect(proposalAttrs.proposalPositionKey.config.unique).toBe(true)
    expect(proposalAttrs.occurrencePositionKey.config.unique).toBe(true)
    expect(proposalAttrs.actorSequencePositionKey.config.unique).toBe(true)
    expect(proposalAttrs.messageIdempotencyPositionKey.config.unique).toBe(true)
    expect(proposalAttrs.effectIdempotencyPositionKey.config.unique).toBe(true)
    expect(proposalAttrs.effectRequestResultPositionKey.config.unique).toBe(
      true,
    )

    const acceptedAttrs =
      InstantV3ProgramEntities.foldkitV3AcceptedMessageOccurrences.attrs
    expect(acceptedAttrs.acceptedSequence.config.unique).toBe(false)
    expect(acceptedAttrs.occurrenceId.config.unique).toBe(false)
    expect(acceptedAttrs.proposalId.config.unique).toBe(false)
    expect(acceptedAttrs.actorSequence.config.unique).toBe(false)
    expect(acceptedAttrs.messageIdempotencyKey.config.unique).toBe(false)
    expect(acceptedAttrs.effectIdempotencyKey.config.unique).toBe(false)
    expect(acceptedAttrs.effectRequestId.config.unique).toBe(false)
    expect(acceptedAttrs.acceptedSequencePositionKey.config.unique).toBe(true)
    expect(acceptedAttrs.occurrencePositionKey.config.unique).toBe(true)
    expect(acceptedAttrs.proposalPositionKey.config.unique).toBe(true)
    expect(acceptedAttrs.actorSequencePositionKey.config.unique).toBe(true)
    expect(acceptedAttrs.messageIdempotencyPositionKey.config.unique).toBe(true)
    expect(acceptedAttrs.effectIdempotencyPositionKey.config.unique).toBe(true)
    expect(acceptedAttrs.effectRequestResultPositionKey.config.unique).toBe(
      true,
    )

    const requestAttrs = InstantV3ProgramEntities.foldkitV3EffectRequests.attrs
    expect(requestAttrs.requestId.config.unique).toBe(false)
    expect(requestAttrs.idempotencyKey.config.unique).toBe(false)
    expect(requestAttrs.requestPositionKey.config.unique).toBe(true)
    expect(requestAttrs.idempotencyPositionKey.config.unique).toBe(true)

    const resolutionAttrs =
      InstantV3ProgramEntities.foldkitV3MessageProposalResolutions.attrs
    expect(resolutionAttrs.proposalId.config.unique).toBe(false)
    expect(
      resolutionAttrs.acceptedMessageOccurrencePositionKey.config.unique,
    ).toBe(true)
    expect(resolutionAttrs.acceptedMessageOccurrenceId.config.unique).toBe(true)
    expect(resolutionAttrs.proposalTerminalPositionKey.config.unique).toBe(true)

    const placementAttrs =
      InstantV3ProgramEntities.foldkitV3EffectPlacements.attrs
    expect(placementAttrs.requestId.config.unique).toBe(false)
    expect(placementAttrs.placementId.config.unique).toBe(true)
    expect(placementAttrs.positionKey.config.unique).toBe(true)

    const checkpointAttrs =
      InstantV3ProgramEntities.foldkitV3ProjectionCheckpoints.attrs
    expect(checkpointAttrs.projectorProcessorId.config.unique).toBe(false)
    expect(checkpointAttrs.throughAcceptedSequence.config.unique).toBe(false)
    expect(checkpointAttrs.processorCheckpointKey.config.unique).toBe(true)

    const enrollmentAttrs =
      InstantV3ProgramEntities.foldkitV3OriginEnrollmentClaims.attrs
    expect(enrollmentAttrs.enrollmentClaimId.config.unique).toBe(false)
    expect(enrollmentAttrs.enrollmentClaimPositionKey.config.unique).toBe(true)
    expect(
      makeInstantV3OriginEnrollmentClaimPositionKey(
        enrollmentClaim.instantAppId,
        'subject-2',
        enrollmentClaim.protocolVersion,
        enrollmentClaim.enrollmentClaimId,
      ),
    ).not.toBe(enrollmentClaim.enrollmentClaimPositionKey)

    const decisionAttrs =
      InstantV3ProgramEntities.foldkitV3OriginPolicyDecisions.attrs
    expect(decisionAttrs.originPolicyId.config.unique).toBe(false)
    expect(decisionAttrs.enrollmentClaimId.config.unique).toBe(false)
    expect(decisionAttrs.positionKey.config.unique).toBe(true)
    expect(
      makeInstantV3OriginPolicyDecisionPositionKey(
        originPolicyDecision.instantAppId,
        'subject-2',
        originPolicyDecision.protocolVersion,
        originPolicyDecision.originPolicyId,
        originPolicyDecision.generation,
      ),
    ).not.toBe(originPolicyDecision.positionKey)
  })

  it('treats Instant nulls on ordinary-occurrence effect fields as absent', () => {
    const decoded = S.decodeUnknownSync(
      InstantV3AcceptedMessageOccurrenceRecord,
    )({
      ...acceptedOccurrence,
      causalAcceptedSequence: null,
      causalAudience: null,
      causalMessageCategory: null,
      causalOccurrenceId: null,
      causalOriginDeviceId: null,
      causalOriginPolicyGeneration: null,
      causalOriginPolicyId: null,
      causalOriginProofDigest: null,
      causalOriginatingProcessorId: null,
      causalPolicyGeneration: null,
      causalProposalId: null,
      effectAssignmentGeneration: null,
      effectCancellationGeneration: null,
      effectIdempotencyKey: null,
      effectIdempotencyPositionKey: null,
      effectPlacementId: null,
      effectRequestId: null,
      effectRequestResultPositionKey: null,
      executorClientCertificateJson: null,
      executorOriginPolicyGeneration: null,
      executorOriginPolicyId: null,
      executorProcessorCertificateJson: null,
      executorProcessorId: null,
      executorResultSignature: null,
    })

    expect(decoded.proposalKind).toBe('OrdinaryMessage')
    expect(decoded.occurrenceId).toBe(acceptedOccurrence.occurrenceId)
  })
})

describe('protocol-v2 and protocol-v3 separation', () => {
  it('keeps literals, proposal structures, and entity namespaces disjoint', () => {
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3ProgramSessionRecord)({
          ...programSession,
          protocolVersion: 2,
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3MessageProposalRecord)({
          ...ordinaryProposal,
          proposalKind: 'Message',
          protocolVersion: 2,
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantProgramSessionRecord)(programSession),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantMessageProposalRecord)(ordinaryProposal),
      ),
    ).toBe(true)

    const v2EntityNames = new Set(Object.keys(InstantProgramEntities))
    const v3EntityNames = Object.keys(InstantV3ProgramEntities)
    expect(new Set(v3EntityNames)).toEqual(
      new Set([
        'foldkitV3ProgramSessions',
        'foldkitV3OriginEnrollmentClaims',
        'foldkitV3OriginPolicyDecisions',
        'foldkitV3MessageProposals',
        'foldkitV3AcceptedMessageOccurrences',
        'foldkitV3MessageProposalResolutions',
        'foldkitV3EffectRequests',
        'foldkitV3EffectPlacements',
        'foldkitV3ProjectionCheckpoints',
      ]),
    )
    for (const v3EntityName of v3EntityNames) {
      expect(v2EntityNames.has(v3EntityName)).toBe(false)
      expect(v3EntityName.startsWith('foldkitV3')).toBe(true)
    }
    expect(
      InstantV3ProgramEntities.foldkitV3MessageProposals.attrs,
    ).not.toHaveProperty('proposedAudience')
    expect(
      InstantV3ProgramEntities.foldkitV3MessageProposals.attrs,
    ).not.toHaveProperty('messageCategory')
  })
})
