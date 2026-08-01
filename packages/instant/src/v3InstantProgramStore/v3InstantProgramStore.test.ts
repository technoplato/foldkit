import {
  Array,
  Deferred,
  Effect,
  Fiber,
  Function,
  Option,
  Ref,
  Stream,
} from 'effect'
import { Command, Processor, Synchronization } from 'foldkit'
import { expect, expectTypeOf, vi } from 'vitest'

import { describe, it } from '@effect/vitest'
import { txInit } from '@instantdb/core'

import {
  V3OriginPolicyDecisionLifecycleConflict,
  V3ProgramAuthorityCriticalSectionExpired,
  V3ProgramSessionLifecycleConflict,
  V3ProgramStoreAcceptedMessageOccurrenceMismatch,
  V3ProgramStoreAcceptedMessageOccurrenceTransaction,
  V3ProgramStoreIdentityConflict,
  V3ProgramStoreScope,
  V3ProgramStoreTerminalConflict,
} from '../v3ProgramStore/index.js'
import {
  InstantV3AcceptedMessageProposalResolutionRecord,
  InstantV3AcceptedOrdinaryMessageOccurrenceRecord,
  InstantV3ActiveOriginPolicyDecision,
  InstantV3EffectPlacementRecord,
  InstantV3EffectRequestRecord,
  InstantV3OrdinaryMessageProposalRecord,
  InstantV3OriginEnrollmentClaimRecord,
  InstantV3OriginPolicyDecisionRecord,
  InstantV3ProgramSchema,
  InstantV3ProgramSessionIdentity,
  InstantV3ProgramSessionRecord,
  InstantV3ProjectionCheckpointRecord,
  InstantV3RejectedMessageProposalResolutionRecord,
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
  type V3InstantProgramAuthorityDatabase,
  V3InstantProgramAuthorityDatabaseCapability,
  type V3InstantProgramAuthoritySnapshotQuery,
  type V3InstantProgramClientDatabase,
  type V3InstantProgramObservationDatabase,
  type V3InstantProgramQuery,
  type V3InstantProgramTransactionInput,
  decodeV3InstantClientTransactionOutcome,
  decodeV3InstantServerTransactionOutcome,
  makeV3InstantAcceptedMessageOccurrencePrerequisiteQuery,
  makeV3InstantAcceptedMessageOccurrenceTransactions,
  makeV3InstantAcceptedMessageOccurrencesQuery,
  makeV3InstantConnectionStatusStream,
  makeV3InstantEffectPlacementTransaction,
  makeV3InstantEffectPlacementsQuery,
  makeV3InstantEffectRequestTransaction,
  makeV3InstantEffectRequestsQuery,
  makeV3InstantMessageProposalResolutionTransaction,
  makeV3InstantMessageProposalResolutionsQuery,
  makeV3InstantMessageProposalTransaction,
  makeV3InstantMessageProposalsQuery,
  makeV3InstantOriginEnrollmentClaimTransaction,
  makeV3InstantOriginEnrollmentClaimsQuery,
  makeV3InstantOriginPolicyDecisionTransaction,
  makeV3InstantOriginPolicyDecisionsQuery,
  makeV3InstantProgramAuthoritySnapshotQuery,
  makeV3InstantProgramAuthorityStore,
  makeV3InstantProgramSessionTransaction,
  makeV3InstantProgramSessionsQuery,
  makeV3InstantProgramStoreFromDatabase,
  makeV3InstantProjectionCheckpointTransaction,
  makeV3InstantProjectionCheckpointsQuery,
} from './v3InstantProgramStore.js'

const appSubjectDigest = 'a'.repeat(64)
const proofDigest = 'b'.repeat(64)
const sessionEpochId = 'e'.repeat(22)
const deviceId = 'A2sX0fLhLEJH-Lzm5WOkQPJ3A32BLeszoPShOUXYmMKW'
const clientId = 'A3zyexiNA09-ilI4AwS1GsPAiWnid_IbNaYLSPxHZpl4'
const processorId = 'Al7L5NGmMwpEyPfvlR1L8WXmxrch762phftBZhvG5_1s'
const signature = 'A'.repeat(86)
const sessionPolicy = Synchronization.SessionPolicy.make({
  generation: 2,
  mode: Synchronization.Mirror.make({}),
})
const updatedSessionPolicy = Synchronization.SessionPolicy.make({
  generation: 3,
  mode: Synchronization.SharedDomain.make({}),
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

const indexedUuid = (value: number): string =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`

const ordinaryProofFields = {
  admissionClaimJson: stringifyInstantV3CanonicalJson({
    _tag: 'ActivatedInteraction',
    value: 1,
  }),
  admissionOccurrenceId: 'occurrence-ordinary-1',
  messageIdempotencyKey: 'ordinary-message-1',
  messageIdempotencyPositionKey:
    makeInstantV3MessageProposalMessageIdempotencyPositionKey(
      sessionId,
      'ordinary-message-1',
    ),
  originClientCertificateJson: stringifyInstantV3CanonicalJson({
    scope: 'client',
    version: 1,
  }),
  originPolicyGeneration: 1,
  originPolicyId: 'origin-policy-1',
  originProcessorCertificateJson: stringifyInstantV3CanonicalJson({
    scope: 'processor',
    version: 1,
  }),
  originProposalSignature: signature,
}

const ordinaryProposal = InstantV3OrdinaryMessageProposalRecord.make({
  ...scope,
  ...ordinaryProofFields,
  actorId: 'actor-1',
  actorSequence: 1,
  actorSequencePositionKey:
    makeInstantV3MessageProposalActorSequencePositionKey(
      sessionId,
      'actor-1',
      clientId,
      1,
    ),
  causationOccurrenceId: null,
  clientId,
  correlationId: null,
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

const conflictingProposal = InstantV3OrdinaryMessageProposalRecord.make({
  ...ordinaryProposal,
  id: '00000000-0000-4000-8000-000000000101',
  payloadJson: stringifyInstantV3CanonicalJson({ _tag: 'Opened', count: 2 }),
})

const enrollmentClaim = InstantV3OriginEnrollmentClaimRecord.make({
  claimSignature: signature,
  claimedAtMs: 1_753_825_000_000,
  enrollmentClaimId: 'enrollment-claim-1',
  enrollmentClaimPositionKey: makeInstantV3OriginEnrollmentClaimPositionKey(
    scope.instantAppId,
    scope.subjectId,
    scope.protocolVersion,
    'enrollment-claim-1',
  ),
  id: '00000000-0000-4000-8000-000000000110',
  instantAppId: scope.instantAppId,
  originDeviceId: deviceId,
  protocolVersion: scope.protocolVersion,
  subjectId: scope.subjectId,
})

const secondEnrollmentClaim = InstantV3OriginEnrollmentClaimRecord.make({
  ...enrollmentClaim,
  claimedAtMs: enrollmentClaim.claimedAtMs + 1,
  enrollmentClaimId: 'enrollment-claim-2',
  enrollmentClaimPositionKey: makeInstantV3OriginEnrollmentClaimPositionKey(
    scope.instantAppId,
    scope.subjectId,
    scope.protocolVersion,
    'enrollment-claim-2',
  ),
  id: '00000000-0000-4000-8000-000000000109',
})

const otherSubjectEnrollmentClaim = InstantV3OriginEnrollmentClaimRecord.make({
  ...enrollmentClaim,
  enrollmentClaimId: 'enrollment-claim-other-subject',
  enrollmentClaimPositionKey: makeInstantV3OriginEnrollmentClaimPositionKey(
    scope.instantAppId,
    'subject-other',
    scope.protocolVersion,
    'enrollment-claim-other-subject',
  ),
  id: '00000000-0000-4000-8000-000000000108',
  subjectId: 'subject-other',
})

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

const gapProgramSession = InstantV3ProgramSessionRecord.make({
  ...updatedProgramSession,
  createdAtMs: updatedProgramSession.createdAtMs + 1,
  id: '00000000-0000-4000-8000-000000000802',
  lifecycleGeneration: 3,
  lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
    sessionId,
    3,
  ),
  previousLifecyclePositionKey: updatedProgramSession.lifecyclePositionKey,
})

const firstPolicyPositionKey = makeInstantV3OriginPolicyDecisionPositionKey(
  scope.instantAppId,
  scope.subjectId,
  scope.protocolVersion,
  'origin-policy-1',
  1,
)
const firstOriginPolicyDecision = InstantV3OriginPolicyDecisionRecord.make({
  decidedAtMs: 1_753_825_000_004,
  decidingProcessorId: 'policy-authority',
  decision: InstantV3ActiveOriginPolicyDecision.make({}),
  decisionId: firstPolicyPositionKey,
  decisionState: 'Active',
  enrollmentClaimId: enrollmentClaim.enrollmentClaimId,
  enrollmentClaimPositionKey: enrollmentClaim.enrollmentClaimPositionKey,
  generation: 1,
  id: '00000000-0000-4000-8000-000000000400',
  instantAppId: scope.instantAppId,
  originDeviceId: deviceId,
  originPolicyId: 'origin-policy-1',
  positionKey: firstPolicyPositionKey,
  previousDecisionId: null,
  protocolVersion: scope.protocolVersion,
  subjectId: scope.subjectId,
})
const thirdPolicyPositionKey = makeInstantV3OriginPolicyDecisionPositionKey(
  scope.instantAppId,
  scope.subjectId,
  scope.protocolVersion,
  firstOriginPolicyDecision.originPolicyId,
  3,
)
const gapOriginPolicyDecision = InstantV3OriginPolicyDecisionRecord.make({
  ...firstOriginPolicyDecision,
  decidedAtMs: firstOriginPolicyDecision.decidedAtMs + 1,
  decisionId: thirdPolicyPositionKey,
  generation: 3,
  id: '00000000-0000-4000-8000-000000000401',
  positionKey: thirdPolicyPositionKey,
  previousDecisionId: makeInstantV3OriginPolicyDecisionPositionKey(
    scope.instantAppId,
    scope.subjectId,
    scope.protocolVersion,
    firstOriginPolicyDecision.originPolicyId,
    2,
  ),
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

const acceptedResolution =
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
    resolution: acceptedResolution,
  })

const makeAcceptedHistoryPair = (acceptedSequence: number) => {
  const occurrenceId = `authority-soak-occurrence-${acceptedSequence.toString()}`
  const messageIdempotencyKey = `authority-soak-message-${acceptedSequence.toString()}`
  const proposalId = `authority-soak-proposal-${acceptedSequence.toString()}`
  const acceptedSequencePositionKey = makeInstantV3AcceptedSequencePositionKey(
    sessionId,
    acceptedSequence,
  )
  const occurrence = InstantV3AcceptedOrdinaryMessageOccurrenceRecord.make({
    ...acceptedOccurrence,
    acceptedAtMs: acceptedOccurrence.acceptedAtMs + acceptedSequence,
    acceptedSequence,
    acceptedSequencePositionKey,
    actorSequence: acceptedSequence,
    actorSequencePositionKey: makeInstantV3AcceptedActorSequencePositionKey(
      sessionId,
      acceptedOccurrence.actorId,
      acceptedOccurrence.clientId,
      acceptedSequence,
    ),
    admissionOccurrenceId: occurrenceId,
    createdAtMs: acceptedOccurrence.createdAtMs + acceptedSequence,
    id: indexedUuid(40_000 + acceptedSequence),
    messageIdempotencyKey,
    messageIdempotencyPositionKey:
      makeInstantV3AcceptedMessageIdempotencyPositionKey(
        sessionId,
        messageIdempotencyKey,
      ),
    occurrenceId,
    occurrencePositionKey: makeInstantV3AcceptedOccurrencePositionKey(
      sessionId,
      occurrenceId,
    ),
    positionKey: acceptedSequencePositionKey,
    proposalId,
    proposalPositionKey: makeInstantV3AcceptedProposalPositionKey(
      sessionId,
      proposalId,
    ),
  })
  const resolution = InstantV3AcceptedMessageProposalResolutionRecord.make({
    ...acceptedResolution,
    acceptedAtMs: occurrence.acceptedAtMs,
    acceptedMessageOccurrenceId: occurrence.id,
    acceptedMessageOccurrencePositionKey: occurrence.positionKey,
    actorSequence: occurrence.actorSequence,
    id: indexedUuid(50_000 + acceptedSequence),
    proposalId,
    proposalTerminalPositionKey:
      makeInstantV3MessageProposalResolutionPositionKey(sessionId, proposalId),
  })
  return { occurrence, resolution }
}

const rejectedResolution =
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

const effectPlacement = Processor.Placement.make({
  affinity: Processor.AnyProcessor.make({}),
  capability: Processor.CapabilityRequirement.make({
    id: ['Counter', 'Write'],
    minimumVersion: 1,
  }),
  cardinality: 'One',
  unavailable: 'Wait',
  version: 1,
})
const effectRequest = InstantV3EffectRequestRecord.make({
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
  placement: effectPlacement,
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
    effectPlacement.capability.id,
  ),
})
const placementPositionKey = makeInstantV3EffectPlacementPositionKey(
  sessionId,
  effectRequest.requestId,
  1,
  0,
)
const effectPlacementRecord = InstantV3EffectPlacementRecord.make({
  ...scope,
  assignedProcessorId: null,
  assignmentGeneration: 1,
  cancellationGeneration: 0,
  decidedAtMs: 1_753_825_000_008,
  id: '00000000-0000-4000-8000-000000000701',
  placementDecision: Processor.Waiting.make({
    reason: 'NoCapableProcessor',
  }),
  placementId: placementPositionKey,
  placementStatus: 'Waiting',
  positionKey: placementPositionKey,
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
  createdAtMs: 1_753_825_000_006,
  id: '00000000-0000-4000-8000-000000000500',
  modelDigest: 'c'.repeat(64),
  modelJson: stringifyInstantV3CanonicalJson({ count: 1 }),
  processorCheckpointKey: checkpointId,
  projectionVersion: 1,
  projectorProcessorId: processorId,
  throughAcceptedSequence: 1,
})

const transactions = txInit<typeof InstantV3ProgramSchema>()

const makeObservationDatabase = (
  subscribeQuery: V3InstantProgramObservationDatabase['subscribeQuery'],
  subscribeConnectionStatus: V3InstantProgramObservationDatabase['subscribeConnectionStatus'] = () =>
    Function.constVoid,
  currentConnectionStatus: V3InstantProgramObservationDatabase['currentConnectionStatus'] = () =>
    'authenticated',
): V3InstantProgramObservationDatabase => ({
  currentConnectionStatus,
  subscribeConnectionStatus,
  subscribeQuery,
})

const makeClientDatabase = (
  capturedTransactions: Array<V3InstantProgramTransactionInput>,
  transactionResult: unknown,
  subscribeQuery: V3InstantProgramObservationDatabase['subscribeQuery'] = () =>
    Function.constVoid,
  queryOnce: V3InstantProgramClientDatabase['queryOnce'] = query => {
    if ('foldkitV3MessageProposals' in query) {
      return Promise.resolve({
        data: { foldkitV3MessageProposals: [] },
      })
    } else if ('foldkitV3OriginEnrollmentClaims' in query) {
      return Promise.resolve({
        data: { foldkitV3OriginEnrollmentClaims: [] },
      })
    } else {
      return Promise.resolve({ data: {} })
    }
  },
): V3InstantProgramClientDatabase => ({
  ...makeObservationDatabase(subscribeQuery),
  queryOnce,
  transact: transaction => {
    capturedTransactions.push(transaction)
    return Promise.resolve(transactionResult)
  },
  tx: transactions,
})

const makeAuthorityDatabase = (
  query: (
    query: V3InstantProgramQuery | V3InstantProgramAuthoritySnapshotQuery,
  ) => Promise<unknown>,
  capturedTransactions: Array<V3InstantProgramTransactionInput> = [],
): V3InstantProgramAuthorityDatabase => ({
  ...makeObservationDatabase(() => Function.constVoid),
  authorityCapability: V3InstantProgramAuthorityDatabaseCapability.make({
    protocolVersion: 3,
    writeIsolation: 'ExclusiveSerializedWriter',
  }),
  query,
  transact: transaction => {
    capturedTransactions.push(transaction)
    return Promise.resolve({ 'all-checks-ok?': true, 'tx-id': 17 })
  },
  tx: transactions,
})

describe('protocol-v3 Instant queries and transactions', () => {
  it('decodes documented and shipped transaction correlation fields', () => {
    expect(
      decodeV3InstantClientTransactionOutcome(
        { clientId: 'documented-client-id', status: 'synced' },
        'Appended',
      ),
    ).toEqual({
      _tag: 'ServerConfirmed',
      disposition: 'Appended',
      serverTransactionId: 'documented-client-id',
    })
    expect(
      decodeV3InstantClientTransactionOutcome(
        { eventId: 'shipped-event-id', status: 'enqueued' },
        'Appended',
      ),
    ).toEqual({
      _tag: 'Enqueued',
      clientId: 'shipped-event-id',
      disposition: 'Appended',
    })
    expect(
      decodeV3InstantServerTransactionOutcome(
        { 'all-checks-ok?': true, 'tx-id': 42 },
        'Appended',
      ),
    ).toEqual({
      _tag: 'ServerConfirmed',
      disposition: 'Appended',
      serverTransactionId: '42',
    })
    expect(() =>
      decodeV3InstantServerTransactionOutcome(
        { 'all-checks-ok?': false, 'tx-id': 42 },
        'Appended',
      ),
    ).toThrow()
  })

  it('uses all eight session-scope fields for every Program query', () => {
    const queries = [
      makeV3InstantAcceptedMessageOccurrencesQuery(scope),
      makeV3InstantEffectPlacementsQuery(scope),
      makeV3InstantEffectRequestsQuery(scope),
      makeV3InstantMessageProposalsQuery(scope),
      makeV3InstantMessageProposalResolutionsQuery(scope),
      makeV3InstantProgramSessionsQuery(scope),
      makeV3InstantProjectionCheckpointsQuery(scope),
      makeV3InstantAcceptedMessageOccurrencePrerequisiteQuery(scope),
      makeV3InstantProgramAuthoritySnapshotQuery(scope),
    ]

    for (const query of queries) {
      const json = JSON.stringify(query)
      expect(json).toContain(`"appSubjectDigest":"${scope.appSubjectDigest}"`)
      expect(json).toContain(`"instantAppId":"${scope.instantAppId}"`)
      expect(json).toContain(`"programId":"${scope.programId}"`)
      expect(json).toContain(`"programVersion":${scope.programVersion}`)
      expect(json).toContain(`"protocolVersion":${scope.protocolVersion}`)
      expect(json).toContain(`"sessionEpochId":"${scope.sessionEpochId}"`)
      expect(json).toContain(`"sessionId":"${scope.sessionId}"`)
      expect(json).toContain(`"subjectId":"${scope.subjectId}"`)
    }
  })

  it('keeps both origin families on their separate three-field scope', () => {
    const originScope = {
      instantAppId: scope.instantAppId,
      protocolVersion: scope.protocolVersion,
      subjectId: scope.subjectId,
    }

    expect(makeV3InstantOriginEnrollmentClaimsQuery(originScope)).toEqual({
      foldkitV3OriginEnrollmentClaims: { $: { where: originScope } },
    })
    expect(makeV3InstantOriginPolicyDecisionsQuery(originScope)).toEqual({
      foldkitV3OriginPolicyDecisions: {
        $: { order: { generation: 'asc' }, where: originScope },
      },
    })
  })

  it('creates every row with its physical UUID and omits nullable attributes', () => {
    const acceptedChunks = makeV3InstantAcceptedMessageOccurrenceTransactions(
      transactions,
      acceptedTransaction,
    )
    const chunks = [
      makeV3InstantMessageProposalTransaction(transactions, ordinaryProposal),
      makeV3InstantOriginEnrollmentClaimTransaction(
        transactions,
        enrollmentClaim,
      ),
      makeV3InstantMessageProposalResolutionTransaction(
        transactions,
        rejectedResolution,
      ),
      acceptedChunks,
      makeV3InstantEffectRequestTransaction(transactions, effectRequest),
      makeV3InstantEffectPlacementTransaction(
        transactions,
        effectPlacementRecord,
      ),
      makeV3InstantOriginPolicyDecisionTransaction(
        transactions,
        firstOriginPolicyDecision,
      ),
      makeV3InstantProgramSessionTransaction(
        transactions,
        initialProgramSession,
      ),
      makeV3InstantProjectionCheckpointTransaction(
        transactions,
        projectionCheckpoint,
      ),
    ]
    const json = JSON.stringify(chunks)

    expect(json).toContain(ordinaryProposal.id)
    expect(json).toContain('foldkitV3AcceptedMessageOccurrences')
    expect(json).toContain('foldkitV3EffectPlacements')
    expect(json).toContain('foldkitV3ProjectionCheckpoints')
    expect(json).not.toContain('"update"')
    expect(json).not.toContain('causationOccurrenceId')
    expect(json).not.toContain('correlationId')
    expect(json).not.toContain('assignedProcessorId')
    expect(json).not.toContain('previousDecisionId')
    expect(json).not.toContain('previousLifecyclePositionKey')
  })
})

describe('protocol-v3 Instant Client store', () => {
  it.effect('preserves offline enqueue evidence and exact local retries', () =>
    Effect.gen(function* () {
      const capturedTransactions: Array<V3InstantProgramTransactionInput> = []
      const store = yield* makeV3InstantProgramStoreFromDatabase(
        makeClientDatabase(capturedTransactions, {
          eventId: 'instant-event-1',
          status: 'enqueued',
        }),
      )

      expect(yield* store.appendMessageProposal(ordinaryProposal)).toEqual({
        _tag: 'Enqueued',
        clientId: 'instant-event-1',
        disposition: 'Appended',
      })
      expect(yield* store.appendMessageProposal(ordinaryProposal)).toEqual({
        _tag: 'Enqueued',
        clientId: 'instant-event-1',
        disposition: 'Idempotent',
      })
      expect(capturedTransactions).toHaveLength(1)

      const conflict = yield* Effect.flip(
        store.appendMessageProposal(conflictingProposal),
      )
      expect(conflict).toBeInstanceOf(V3ProgramStoreIdentityConflict)
    }),
  )

  it.effect(
    'skips queryOnce and falls through to the offline outbox while disconnected',
    () =>
      Effect.gen(function* () {
        const capturedTransactions: Array<V3InstantProgramTransactionInput> = []
        const queryAttempts = { value: 0 }
        const database = {
          ...makeClientDatabase(
            capturedTransactions,
            { eventId: 'offline-query-event', status: 'enqueued' },
            () => Function.constVoid,
            () => {
              queryAttempts.value += 1
              return Promise.reject(new Error('device offline'))
            },
          ),
          currentConnectionStatus: () => 'closed',
        }
        const store = yield* makeV3InstantProgramStoreFromDatabase(database)
        const outcome = yield* store.appendMessageProposal(ordinaryProposal)

        expect(outcome).toMatchObject({
          _tag: 'Enqueued',
          disposition: 'Appended',
        })
        expect(capturedTransactions).toHaveLength(1)
        expect(queryAttempts.value).toBe(0)
      }),
  )

  it.effect('does not strict-create after an online hydration failure', () =>
    Effect.gen(function* () {
      const capturedTransactions: Array<V3InstantProgramTransactionInput> = []
      const database = makeClientDatabase(
        capturedTransactions,
        { eventId: 'unused', status: 'synced' },
        () => Function.constVoid,
        () => Promise.reject(new Error('online query failed')),
      )
      const store = yield* makeV3InstantProgramStoreFromDatabase(database)
      const failure = yield* Effect.flip(
        store.appendMessageProposal(ordinaryProposal),
      )

      expect(failure._tag).toBe('V3ProgramStoreError')
      expect(capturedTransactions).toEqual([])
    }),
  )

  it.effect(
    'query-observes an exact enrollment retry without claiming confirmation',
    () =>
      Effect.gen(function* () {
        const capturedTransactions: Array<V3InstantProgramTransactionInput> = []
        const capturedQueries: Array<V3InstantProgramQuery> = []
        const database = makeClientDatabase(
          capturedTransactions,
          { eventId: 'unused', status: 'synced' },
          () => Function.constVoid,
          query => {
            capturedQueries.push(query)
            return Promise.resolve({
              data: { foldkitV3OriginEnrollmentClaims: [enrollmentClaim] },
            })
          },
        )
        const store = yield* makeV3InstantProgramStoreFromDatabase(database)
        const outcome =
          yield* store.appendOriginEnrollmentClaim(enrollmentClaim)

        expect(outcome).toEqual({
          _tag: 'Enqueued',
          clientId: `instant-query-observed:${enrollmentClaim.id}`,
          disposition: 'Idempotent',
        })
        expect(capturedQueries).toEqual([
          makeV3InstantOriginEnrollmentClaimsQuery({
            instantAppId: enrollmentClaim.instantAppId,
            protocolVersion: enrollmentClaim.protocolVersion,
            subjectId: enrollmentClaim.subjectId,
          }),
        ])
        expect(capturedTransactions).toEqual([])
      }),
  )

  it.effect(
    'hydrates each origin-policy scope before suppressing strict create',
    () =>
      Effect.gen(function* () {
        const capturedTransactions: Array<V3InstantProgramTransactionInput> = []
        const capturedQueries: Array<V3InstantProgramQuery> = []
        const store = yield* makeV3InstantProgramStoreFromDatabase(
          makeClientDatabase(
            capturedTransactions,
            { eventId: 'unused', status: 'synced' },
            () => Function.constVoid,
            query => {
              capturedQueries.push(query)
              if (
                'foldkitV3OriginEnrollmentClaims' in query &&
                query.foldkitV3OriginEnrollmentClaims.$.where.subjectId ===
                  otherSubjectEnrollmentClaim.subjectId
              ) {
                return Promise.resolve({
                  data: {
                    foldkitV3OriginEnrollmentClaims: [
                      otherSubjectEnrollmentClaim,
                    ],
                  },
                })
              } else {
                return Promise.resolve({
                  data: { foldkitV3OriginEnrollmentClaims: [enrollmentClaim] },
                })
              }
            },
          ),
        )

        const first = yield* store.appendOriginEnrollmentClaim(enrollmentClaim)
        const second = yield* store.appendOriginEnrollmentClaim(
          otherSubjectEnrollmentClaim,
        )

        expect(first.disposition).toBe('Idempotent')
        expect(second.disposition).toBe('Idempotent')
        expect(capturedQueries).toHaveLength(2)
        expect(capturedTransactions).toEqual([])
      }),
  )

  it.effect(
    'rejects hydrated same-id and same-position enrollment conflicts',
    () =>
      Effect.gen(function* () {
        const database = makeClientDatabase(
          [],
          { eventId: 'unused', status: 'synced' },
          () => Function.constVoid,
          () =>
            Promise.resolve({
              data: { foldkitV3OriginEnrollmentClaims: [enrollmentClaim] },
            }),
        )
        const sameIdStore =
          yield* makeV3InstantProgramStoreFromDatabase(database)
        const sameIdConflict = yield* Effect.flip(
          sameIdStore.appendOriginEnrollmentClaim(
            InstantV3OriginEnrollmentClaimRecord.make({
              ...enrollmentClaim,
              claimedAtMs: enrollmentClaim.claimedAtMs + 1,
            }),
          ),
        )
        expect(sameIdConflict).toBeInstanceOf(V3ProgramStoreIdentityConflict)

        const samePositionStore =
          yield* makeV3InstantProgramStoreFromDatabase(database)
        const samePositionConflict = yield* Effect.flip(
          samePositionStore.appendOriginEnrollmentClaim(
            InstantV3OriginEnrollmentClaimRecord.make({
              ...enrollmentClaim,
              id: indexedUuid(111),
            }),
          ),
        )
        expect(samePositionConflict).toBeInstanceOf(
          V3ProgramStoreIdentityConflict,
        )
      }),
  )

  it.effect(
    'query-observes an exact Message retry without claiming confirmation',
    () =>
      Effect.gen(function* () {
        const capturedTransactions: Array<V3InstantProgramTransactionInput> = []
        const store = yield* makeV3InstantProgramStoreFromDatabase(
          makeClientDatabase(
            capturedTransactions,
            { eventId: 'unused', status: 'synced' },
            () => Function.constVoid,
            () =>
              Promise.resolve({
                data: { foldkitV3MessageProposals: [ordinaryProposal] },
              }),
          ),
        )
        const outcome = yield* store.appendMessageProposal(ordinaryProposal)

        expect(outcome).toEqual({
          _tag: 'Enqueued',
          clientId: `instant-query-observed:${ordinaryProposal.id}`,
          disposition: 'Idempotent',
        })
        expect(capturedTransactions).toEqual([])
      }),
  )

  it.effect('wraps Client transaction rejection in the typed store error', () =>
    Effect.gen(function* () {
      const database = {
        ...makeClientDatabase([], { eventId: 'unused', status: 'synced' }),
        transact: () => Promise.reject(new Error('offline outbox failed')),
      }
      const store = yield* makeV3InstantProgramStoreFromDatabase(database)
      const failure = yield* Effect.flip(
        store.appendOriginEnrollmentClaim(enrollmentClaim),
      )

      expect(failure._tag).toBe('V3ProgramStoreError')
      if (failure._tag === 'V3ProgramStoreError') {
        expect(failure.operation).toBe('AppendOriginEnrollmentClaim')
      }
    }),
  )

  it.effect(
    'keeps 1,025 offline Client appends incremental with exact late retries',
    () =>
      Effect.gen(function* () {
        const messageCount = 1_025
        const capturedTransactions: Array<V3InstantProgramTransactionInput> = []
        const hydrationQueries = { value: 0 }
        const store = yield* makeV3InstantProgramStoreFromDatabase(
          makeClientDatabase(
            capturedTransactions,
            {
              eventId: 'instant-soak-event',
              status: 'enqueued',
            },
            () => Function.constVoid,
            () => {
              hydrationQueries.value += 1
              return Promise.resolve({
                data: { foldkitV3MessageProposals: [] },
              })
            },
          ),
        )
        let finalProposal = ordinaryProposal
        for (const sequence of Array.range(1, messageCount)) {
          const occurrenceId = `soak-occurrence-${sequence.toString()}`
          const messageIdempotencyKey = `soak-message-${sequence.toString()}`
          const proposalId = `soak-proposal-${sequence.toString()}`
          finalProposal = InstantV3OrdinaryMessageProposalRecord.make({
            ...ordinaryProposal,
            actorSequence: sequence,
            actorSequencePositionKey:
              makeInstantV3MessageProposalActorSequencePositionKey(
                sessionId,
                ordinaryProposal.actorId,
                ordinaryProposal.clientId,
                sequence,
              ),
            admissionOccurrenceId: occurrenceId,
            createdAtMs: ordinaryProposal.createdAtMs + sequence,
            id: indexedUuid(10_000 + sequence),
            messageIdempotencyKey,
            messageIdempotencyPositionKey:
              makeInstantV3MessageProposalMessageIdempotencyPositionKey(
                sessionId,
                messageIdempotencyKey,
              ),
            occurrenceId,
            occurrencePositionKey:
              makeInstantV3MessageProposalOccurrencePositionKey(
                sessionId,
                occurrenceId,
              ),
            proposalId,
            proposalPositionKey: makeInstantV3MessageProposalPositionKey(
              sessionId,
              proposalId,
            ),
          })
          yield* store.appendMessageProposal(finalProposal)
        }
        const retry = yield* store.appendMessageProposal(finalProposal)
        const conflicting = yield* Effect.flip(
          store.appendMessageProposal(
            InstantV3OrdinaryMessageProposalRecord.make({
              ...finalProposal,
              id: indexedUuid(20_000 + messageCount),
            }),
          ),
        )
        const measurements = {
          clientTransactions: capturedTransactions.length,
          hydrationQueries: hydrationQueries.value,
          messageCount,
        }

        expect(measurements.clientTransactions).toBe(messageCount)
        expect(measurements.hydrationQueries).toBe(1)
        expect(retry.disposition).toBe('Idempotent')
        expect(conflicting).toBeInstanceOf(V3ProgramStoreIdentityConflict)
      }),
  )

  it('cannot structurally satisfy the authority database prerequisite', () => {
    expectTypeOf<V3InstantProgramClientDatabase>().not.toMatchTypeOf<V3InstantProgramAuthorityDatabase>()
  })
})

describe('protocol-v3 Instant observations', () => {
  it.effect('sorts, deduplicates, filters by app-subject, and disposes', () =>
    Effect.gen(function* () {
      const unsubscribe = vi.fn()
      const queries: Array<V3InstantProgramQuery> = []
      const listeners: Array<
        Parameters<V3InstantProgramObservationDatabase['subscribeQuery']>[1]
      > = []
      const database = makeClientDatabase(
        [],
        { clientId: 'unused', status: 'synced' },
        (query, listener) => {
          queries.push(query)
          listeners.push(listener)
          listener({
            data: {
              foldkitV3OriginEnrollmentClaims: [
                enrollmentClaim,
                secondEnrollmentClaim,
              ],
            },
          })
          return unsubscribe
        },
      )
      const store = yield* makeV3InstantProgramStoreFromDatabase(database)
      const firstSnapshotStarted = yield* Deferred.make<void>()
      const continueAfterBurst = yield* Deferred.make<void>()
      const receivedCount = yield* Ref.make(0)
      const snapshotsFiber = yield* Effect.forkChild(
        Stream.runCollect(
          Stream.take(
            Stream.mapEffect(
              store.observations.observeOriginEnrollmentClaims({
                instantAppId: scope.instantAppId,
                protocolVersion: scope.protocolVersion,
                subjectId: scope.subjectId,
              }),
              snapshot =>
                Ref.updateAndGet(receivedCount, count => count + 1).pipe(
                  Effect.flatMap(count => {
                    if (count === 1) {
                      return Deferred.succeed(
                        firstSnapshotStarted,
                        undefined,
                      ).pipe(Effect.andThen(Deferred.await(continueAfterBurst)))
                    } else {
                      return Effect.void
                    }
                  }),
                  Effect.as(snapshot),
                ),
            ),
            2,
          ),
        ),
      )
      yield* Deferred.await(firstSnapshotStarted)
      const maybeListener = Array.head(listeners)
      if (Option.isNone(maybeListener)) {
        return yield* Effect.die('Instant query listener was not registered.')
      }
      for (const _burstIndex of Array.range(1, 32)) {
        maybeListener.value({
          data: {
            foldkitV3OriginEnrollmentClaims: [
              enrollmentClaim,
              secondEnrollmentClaim,
            ],
          },
        })
      }
      maybeListener.value({
        data: { foldkitV3OriginEnrollmentClaims: [enrollmentClaim] },
      })
      yield* Deferred.succeed(continueAfterBurst, undefined)
      const snapshots = yield* Fiber.join(snapshotsFiber)

      expect(Array.fromIterable(snapshots)).toEqual([
        [secondEnrollmentClaim, enrollmentClaim],
        [enrollmentClaim],
      ])
      expect(yield* Ref.get(receivedCount)).toBe(2)
      expect(queries).toEqual([
        {
          foldkitV3OriginEnrollmentClaims: {
            $: {
              where: {
                instantAppId: scope.instantAppId,
                protocolVersion: scope.protocolVersion,
                subjectId: scope.subjectId,
              },
            },
          },
        },
      ])
      expect(unsubscribe).toHaveBeenCalledOnce()
    }),
  )

  it.effect(
    'keeps only the latest full replacement snapshot during a burst',
    () =>
      Effect.gen(function* () {
        const listeners: Array<
          Parameters<V3InstantProgramObservationDatabase['subscribeQuery']>[1]
        > = []
        const store = yield* makeV3InstantProgramStoreFromDatabase(
          makeClientDatabase(
            [],
            { clientId: 'unused', status: 'synced' },
            (_query, listener) => {
              listeners.push(listener)
              listener({
                data: { foldkitV3MessageProposals: [ordinaryProposal] },
              })
              return Function.constVoid
            },
          ),
        )
        const firstSnapshotStarted = yield* Deferred.make<void>()
        const continueAfterBurst = yield* Deferred.make<void>()
        const receivedCount = yield* Ref.make(0)
        const snapshotsFiber = yield* Effect.forkChild(
          Stream.runCollect(
            Stream.take(
              Stream.mapEffect(
                store.observations.observeMessageProposals(scope),
                snapshot =>
                  Ref.updateAndGet(receivedCount, count => count + 1).pipe(
                    Effect.flatMap(count => {
                      if (count === 1) {
                        return Deferred.succeed(
                          firstSnapshotStarted,
                          undefined,
                        ).pipe(
                          Effect.andThen(Deferred.await(continueAfterBurst)),
                        )
                      } else {
                        return Effect.void
                      }
                    }),
                    Effect.as(snapshot),
                  ),
              ),
              2,
            ),
          ),
        )
        yield* Deferred.await(firstSnapshotStarted)
        const maybeListener = Array.head(listeners)
        if (Option.isNone(maybeListener)) {
          return yield* Effect.die('Instant query listener was not registered.')
        }
        for (const burstIndex of Array.range(2, 100)) {
          const messageProposals =
            burstIndex % 2 === 0 ? [] : [ordinaryProposal]
          maybeListener.value({
            data: {
              foldkitV3MessageProposals: messageProposals,
            },
          })
        }
        maybeListener.value({ data: { foldkitV3MessageProposals: [] } })
        yield* Deferred.succeed(continueAfterBurst, undefined)
        const snapshots = Array.fromIterable(yield* Fiber.join(snapshotsFiber))
        const maybeLatestSnapshot = Array.last(snapshots)
        expect(Option.isSome(maybeLatestSnapshot)).toBe(true)
        if (Option.isSome(maybeLatestSnapshot)) {
          expect(Array.isReadonlyArrayEmpty(maybeLatestSnapshot.value)).toBe(
            true,
          )
        }
        expect(yield* Ref.get(receivedCount)).toBe(2)
      }),
  )

  it.effect('turns a strict row decode failure into a typed store error', () =>
    Effect.gen(function* () {
      const store = yield* makeV3InstantProgramStoreFromDatabase(
        makeClientDatabase(
          [],
          { clientId: 'unused', status: 'synced' },
          (_query, listener) => {
            listener({
              data: {
                foldkitV3MessageProposals: [
                  { ...ordinaryProposal, unexpected: true },
                ],
              },
            })
            return Function.constVoid
          },
        ),
      )
      const failure = yield* Effect.flip(
        Stream.runCollect(
          Stream.take(store.observations.observeMessageProposals(scope), 1),
        ),
      )

      expect(failure._tag).toBe('V3ProgramStoreError')
      expect(failure.operation).toBe('ObserveMessageProposals')
    }),
  )

  it.effect('wraps synchronous subscription defects in the store error', () =>
    Effect.gen(function* () {
      const store = yield* makeV3InstantProgramStoreFromDatabase(
        makeClientDatabase([], { clientId: 'unused', status: 'synced' }, () => {
          throw new Error('subscribe failed')
        }),
      )
      const failure = yield* Effect.flip(
        Stream.runCollect(
          Stream.take(store.observations.observeEffectRequests(scope), 1),
        ),
      )

      expect(failure._tag).toBe('V3ProgramStoreError')
      expect(failure.operation).toBe('ObserveEffectRequests')
    }),
  )

  it.effect(
    'keeps the latest connection state, reports malformed state, and disposes',
    () =>
      Effect.gen(function* () {
        const unsubscribe = vi.fn()
        const defect = vi.fn()
        const statuses = yield* Stream.runCollect(
          Stream.take(
            makeV3InstantConnectionStatusStream(
              makeObservationDatabase(
                () => Function.constVoid,
                listener => {
                  listener('opened')
                  return unsubscribe
                },
                () => 'not-an-instant-status',
              ),
              { onConnectionDefect: defect },
            ),
            1,
          ),
        )

        expect(Array.fromIterable(statuses)).toEqual(['Errored'])
        expect(defect).toHaveBeenCalledOnce()
        expect(unsubscribe).toHaveBeenCalledOnce()
      }),
  )
})

describe('protocol-v3 Instant authority store', () => {
  it.effect('expires a retained Instant authority critical section', () =>
    Effect.gen(function* () {
      const capturedQueries: Array<
        V3InstantProgramQuery | V3InstantProgramAuthoritySnapshotQuery
      > = []
      const store = yield* makeV3InstantProgramAuthorityStore(
        makeAuthorityDatabase(query => {
          capturedQueries.push(query)
          return Promise.resolve({})
        }),
      )
      const retained = yield* store.coordinator.withCriticalSection(section =>
        Effect.succeed(section),
      )
      const failure = yield* Effect.flip(
        retained.readServerConfirmedSnapshot(scope),
      )

      expect(failure).toBeInstanceOf(V3ProgramAuthorityCriticalSectionExpired)
      expect(failure).toMatchObject({ operation: 'ReadAuthoritySnapshot' })
      expect(capturedQueries).toEqual([])
    }),
  )

  it.effect('holds the permit until a forked critical operation drains', () =>
    Effect.gen(function* () {
      const queryStarted = yield* Deferred.make<void>()
      const releaseQuery = yield* Deferred.make<void>()
      const capturedQueries: Array<
        V3InstantProgramQuery | V3InstantProgramAuthoritySnapshotQuery
      > = []
      const store = yield* makeV3InstantProgramAuthorityStore(
        makeAuthorityDatabase(query => {
          capturedQueries.push(query)
          if ('foldkitV3ProjectionCheckpoints' in query) {
            return Promise.resolve({ foldkitV3ProjectionCheckpoints: [] })
          }
          return Effect.runPromise(
            Effect.gen(function* () {
              yield* Deferred.succeed(queryStarted, undefined)
              yield* Deferred.await(releaseQuery)
              return {
                foldkitV3AcceptedMessageOccurrences: [],
                foldkitV3EffectPlacements: [],
                foldkitV3EffectRequests: [],
                foldkitV3MessageProposalResolutions: [],
                foldkitV3MessageProposals: [],
                foldkitV3OriginPolicyDecisions: [],
                foldkitV3ProgramSessions: [],
              }
            }),
          )
        }),
      )
      const coordinatorFiber = yield* Effect.forkChild(
        store.coordinator.withCriticalSection(section =>
          Effect.gen(function* () {
            const queryFiber = yield* Effect.forkDetach(
              section.readServerConfirmedSnapshot(scope),
            )
            yield* Deferred.await(queryStarted)
            return queryFiber
          }),
        ),
      )
      yield* Deferred.await(queryStarted)
      const mutationStarted = yield* Deferred.make<void>()
      const mutationFiber = yield* Effect.forkChild(
        Effect.gen(function* () {
          yield* Deferred.succeed(mutationStarted, undefined)
          return yield* store.appendServerConfirmedProjectionCheckpoint(
            projectionCheckpoint,
          )
        }),
      )
      yield* Deferred.await(mutationStarted)
      yield* Effect.yieldNow

      expect(coordinatorFiber.pollUnsafe()).toBeUndefined()
      expect(mutationFiber.pollUnsafe()).toBeUndefined()
      expect(capturedQueries).toEqual([
        makeV3InstantProgramAuthoritySnapshotQuery(scope),
      ])

      yield* Deferred.succeed(releaseQuery, undefined)
      const queryFiber = yield* Fiber.join(coordinatorFiber)
      yield* Fiber.join(queryFiber)
      const outcome = yield* Fiber.join(mutationFiber)
      expect(outcome.disposition).toBe('Appended')
      expect(capturedQueries).toHaveLength(2)
    }),
  )

  it.effect(
    'serializes public Instant authority mutations behind the coordinator',
    () =>
      Effect.gen(function* () {
        const capturedQueries: Array<
          V3InstantProgramQuery | V3InstantProgramAuthoritySnapshotQuery
        > = []
        const store = yield* makeV3InstantProgramAuthorityStore(
          makeAuthorityDatabase(query => {
            capturedQueries.push(query)
            if ('foldkitV3ProjectionCheckpoints' in query) {
              return Promise.resolve({ foldkitV3ProjectionCheckpoints: [] })
            }
            return Promise.resolve({
              foldkitV3AcceptedMessageOccurrences: [],
              foldkitV3EffectPlacements: [],
              foldkitV3EffectRequests: [],
              foldkitV3MessageProposalResolutions: [],
              foldkitV3MessageProposals: [],
              foldkitV3OriginPolicyDecisions: [],
              foldkitV3ProgramSessions: [],
            })
          }),
        )
        const coordinatorEntered = yield* Deferred.make<void>()
        const releaseCoordinator = yield* Deferred.make<void>()
        const mutationStarted = yield* Deferred.make<void>()
        const coordinatorFiber = yield* Effect.forkChild(
          store.coordinator.withCriticalSection(section =>
            Effect.gen(function* () {
              yield* section.readServerConfirmedSnapshot(scope)
              yield* Deferred.succeed(coordinatorEntered, undefined)
              yield* Deferred.await(releaseCoordinator)
            }),
          ),
        )
        yield* Deferred.await(coordinatorEntered)
        const mutationFiber = yield* Effect.forkChild(
          Effect.gen(function* () {
            yield* Deferred.succeed(mutationStarted, undefined)
            return yield* store.appendServerConfirmedProjectionCheckpoint(
              projectionCheckpoint,
            )
          }),
        )
        yield* Deferred.await(mutationStarted)
        yield* Effect.yieldNow

        expect(mutationFiber.pollUnsafe()).toBeUndefined()
        expect(capturedQueries).toEqual([
          makeV3InstantProgramAuthoritySnapshotQuery(scope),
        ])

        yield* Deferred.succeed(releaseCoordinator, undefined)
        yield* Fiber.join(coordinatorFiber)
        const outcome = yield* Fiber.join(mutationFiber)
        expect(outcome.disposition).toBe('Appended')
        expect(capturedQueries).toHaveLength(2)
      }),
  )

  it.effect(
    'reads every admission prerequisite in one coordinated server query',
    () =>
      Effect.gen(function* () {
        const capturedQueries: Array<
          V3InstantProgramQuery | V3InstantProgramAuthoritySnapshotQuery
        > = []
        const store = yield* makeV3InstantProgramAuthorityStore(
          makeAuthorityDatabase(query => {
            capturedQueries.push(query)
            return Promise.resolve({
              foldkitV3AcceptedMessageOccurrences: [acceptedOccurrence],
              foldkitV3EffectPlacements: [effectPlacementRecord],
              foldkitV3EffectRequests: [effectRequest],
              foldkitV3MessageProposalResolutions: [acceptedResolution],
              foldkitV3MessageProposals: [ordinaryProposal],
              foldkitV3OriginPolicyDecisions: [firstOriginPolicyDecision],
              foldkitV3ProgramSessions: [initialProgramSession],
            })
          }),
        )

        const snapshot = yield* store.coordinator.withCriticalSection(section =>
          section.readServerConfirmedSnapshot(scope),
        )

        expect(store.coordinator.capability).toEqual({
          _tag: 'ExclusiveAuthorityCoordinator',
          protocolVersion: 3,
        })
        expect(capturedQueries).toEqual([
          makeV3InstantProgramAuthoritySnapshotQuery(scope),
        ])
        expect(snapshot).toEqual({
          acceptedMessageOccurrences: [acceptedOccurrence],
          effectPlacements: [effectPlacementRecord],
          effectRequests: [effectRequest],
          messageProposalResolutions: [acceptedResolution],
          messageProposals: [ordinaryProposal],
          originPolicyDecisions: [firstOriginPolicyDecision],
          programSessions: [initialProgramSession],
        })
      }),
  )

  it.effect('writes an Accepted guard and occurrence in one transaction', () =>
    Effect.gen(function* () {
      const capturedTransactions: Array<V3InstantProgramTransactionInput> = []
      const store = yield* makeV3InstantProgramAuthorityStore(
        makeAuthorityDatabase(
          () =>
            Promise.resolve({
              foldkitV3AcceptedMessageOccurrences: [],
              foldkitV3MessageProposalResolutions: [],
            }),
          capturedTransactions,
        ),
      )

      expect(
        yield* store.appendServerConfirmedAcceptedMessageOccurrence(
          acceptedTransaction,
        ),
      ).toEqual({
        _tag: 'ServerConfirmed',
        disposition: 'Appended',
        serverTransactionId: '17',
      })
      expect(capturedTransactions).toHaveLength(1)
      const json = JSON.stringify(capturedTransactions)
      expect(json).toContain('foldkitV3MessageProposalResolutions')
      expect(json).toContain('foldkitV3AcceptedMessageOccurrences')
    }),
  )

  it.effect(
    'indexes 1,024 Accepted prerequisite pairs before one late authority write',
    () =>
      Effect.gen(function* () {
        const history = Array.map(
          Array.range(1, 1_024),
          makeAcceptedHistoryPair,
        )
        const late = makeAcceptedHistoryPair(1_025)
        const capturedTransactions: Array<V3InstantProgramTransactionInput> = []
        const store = yield* makeV3InstantProgramAuthorityStore(
          makeAuthorityDatabase(
            () =>
              Promise.resolve({
                foldkitV3AcceptedMessageOccurrences: Array.map(
                  history,
                  pair => pair.occurrence,
                ),
                foldkitV3MessageProposalResolutions: Array.map(
                  history,
                  pair => pair.resolution,
                ),
              }),
            capturedTransactions,
          ),
        )

        const outcome =
          yield* store.appendServerConfirmedAcceptedMessageOccurrence(
            V3ProgramStoreAcceptedMessageOccurrenceTransaction.make(late),
          )
        const measurements = {
          acceptedPrerequisitePairs: Array.length(history),
          authorityTransactions: Array.length(capturedTransactions),
        }

        expect(measurements).toEqual({
          acceptedPrerequisitePairs: 1_024,
          authorityTransactions: 1,
        })
        expect(outcome.disposition).toBe('Appended')
      }),
    { timeout: 20_000 },
  )

  it.effect(
    'does not fabricate a terminal state from a skewed pair query',
    () =>
      Effect.gen(function* () {
        const store = yield* makeV3InstantProgramAuthorityStore(
          makeAuthorityDatabase(() =>
            Promise.resolve({
              foldkitV3AcceptedMessageOccurrences: [acceptedOccurrence],
              foldkitV3MessageProposalResolutions: [],
            }),
          ),
        )
        const failure = yield* Effect.flip(
          store.appendServerConfirmedAcceptedMessageOccurrence(
            acceptedTransaction,
          ),
        )

        expect(failure).toBeInstanceOf(
          V3ProgramStoreAcceptedMessageOccurrenceMismatch,
        )
        if (
          failure instanceof V3ProgramStoreAcceptedMessageOccurrenceMismatch
        ) {
          expect(failure.reason).toBe('AtomicPairIncomplete')
        }
      }),
  )

  it.effect('returns query-confirmed idempotency without another write', () =>
    Effect.gen(function* () {
      const capturedTransactions: Array<V3InstantProgramTransactionInput> = []
      const store = yield* makeV3InstantProgramAuthorityStore(
        makeAuthorityDatabase(
          () =>
            Promise.resolve({
              foldkitV3AcceptedMessageOccurrences: [acceptedOccurrence],
              foldkitV3MessageProposalResolutions: [acceptedResolution],
            }),
          capturedTransactions,
        ),
      )
      const outcome =
        yield* store.appendServerConfirmedAcceptedMessageOccurrence(
          acceptedTransaction,
        )

      expect(outcome).toEqual({
        _tag: 'ServerConfirmed',
        disposition: 'Idempotent',
        serverTransactionId: `instant-query-confirmed:${acceptedResolution.id}`,
      })
      expect(capturedTransactions).toHaveLength(0)
    }),
  )

  it.effect('rejects the opposite terminal in the shared namespace', () =>
    Effect.gen(function* () {
      const store = yield* makeV3InstantProgramAuthorityStore(
        makeAuthorityDatabase(() =>
          Promise.resolve({
            foldkitV3AcceptedMessageOccurrences: [],
            foldkitV3MessageProposalResolutions: [rejectedResolution],
          }),
        ),
      )
      const failure = yield* Effect.flip(
        store.appendServerConfirmedAcceptedMessageOccurrence(
          acceptedTransaction,
        ),
      )

      expect(failure).toBeInstanceOf(V3ProgramStoreTerminalConflict)
    }),
  )

  it.effect('wraps authority query defects in the typed store error', () =>
    Effect.gen(function* () {
      const store = yield* makeV3InstantProgramAuthorityStore(
        makeAuthorityDatabase(() => Promise.reject(new Error('query failed'))),
      )
      const failure = yield* Effect.flip(
        store.appendServerConfirmedProjectionCheckpoint(projectionCheckpoint),
      )

      expect(failure._tag).toBe('V3ProgramStoreError')
      if (failure._tag === 'V3ProgramStoreError') {
        expect(failure.operation).toBe('AppendProjectionCheckpoint')
      }
    }),
  )

  it.effect('labels coordinated snapshot query defects exactly', () =>
    Effect.gen(function* () {
      const store = yield* makeV3InstantProgramAuthorityStore(
        makeAuthorityDatabase(() => Promise.reject(new Error('query failed'))),
      )
      const failure = yield* Effect.flip(
        store.coordinator.withCriticalSection(section =>
          section.readServerConfirmedSnapshot(scope),
        ),
      )

      expect(failure._tag).toBe('V3ProgramStoreError')
      if (failure._tag === 'V3ProgramStoreError') {
        expect(failure.operation).toBe('ReadAuthoritySnapshot')
      }
    }),
  )

  it.effect('maps Program-session lifecycle conflicts exactly', () =>
    Effect.gen(function* () {
      const store = yield* makeV3InstantProgramAuthorityStore(
        makeAuthorityDatabase(() =>
          Promise.resolve({
            foldkitV3ProgramSessions: [initialProgramSession],
          }),
        ),
      )
      const failure = yield* Effect.flip(
        store.appendServerConfirmedProgramSession(gapProgramSession),
      )

      expect(failure).toBeInstanceOf(V3ProgramSessionLifecycleConflict)
      if (failure instanceof V3ProgramSessionLifecycleConflict) {
        expect(failure.reason).toBe('LifecycleGenerationNotSequential')
      }
    }),
  )

  it.effect('maps origin-policy lifecycle conflicts exactly', () =>
    Effect.gen(function* () {
      const store = yield* makeV3InstantProgramAuthorityStore(
        makeAuthorityDatabase(() =>
          Promise.resolve({
            foldkitV3OriginPolicyDecisions: [firstOriginPolicyDecision],
          }),
        ),
      )
      const failure = yield* Effect.flip(
        store.appendServerConfirmedOriginPolicyDecision(
          gapOriginPolicyDecision,
        ),
      )

      expect(failure).toBeInstanceOf(V3OriginPolicyDecisionLifecycleConflict)
      if (failure instanceof V3OriginPolicyDecisionLifecycleConflict) {
        expect(failure.reason).toBe('DecisionGenerationNotSequential')
      }
    }),
  )
})
