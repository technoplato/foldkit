import { Option, Schema as S } from 'effect'
import { Command, Processor, Synchronization } from 'foldkit'

import { InstantCoreDatabase, i } from '@instantdb/core'

const HighEntropyRoomId = S.String.check(S.isMinLength(32))
const NonNegativeInteger = S.Int.check(S.isGreaterThanOrEqualTo(0))
const CapabilityIdJson = S.fromJsonString(Processor.CapabilityId)
const InstantEntityId = S.String.check(S.isUUID(4))
const MaximumMessageIdempotencyKeyLength = 512

/** The only authenticated shared Program wire protocol supported by this build. */
export const InstantProgramProtocolVersion = S.Literal(2)
/** The only authenticated shared Program wire protocol supported by this build. */
export type InstantProgramProtocolVersion =
  typeof InstantProgramProtocolVersion.Type
/** The current authenticated shared Program wire protocol version. */
export const instantProgramProtocolVersion =
  InstantProgramProtocolVersion.make(2)

/** The kinds of Message proposal accepted through the shared Program intake path. */
export const InstantMessageProposalKind = S.Literals([
  'Message',
  'EffectResult',
])
/** The kinds of Message proposal accepted through the shared Program intake path. */
export type InstantMessageProposalKind = typeof InstantMessageProposalKind.Type

/** A bounded durable identity for one semantically idempotent ordinary Message. */
export const InstantMessageIdempotencyKey = S.String.check(
  S.isLengthBetween(1, MaximumMessageIdempotencyKeyLength),
).annotate({
  description:
    'A 1-512 character caller-generated identity that is globally unique across every Program, subject, and session in one Instant database and is reused only for the same semantic ordinary Message.',
  identifier: 'InstantMessageIdempotencyKey',
})
/** A bounded durable identity for one semantically idempotent ordinary Message. */
export type InstantMessageIdempotencyKey =
  typeof InstantMessageIdempotencyKey.Type

/** Validates one caller-generated globally unique ordinary-Message identity. */
export const makeInstantMessageIdempotencyKey = (
  value: string,
): InstantMessageIdempotencyKey => InstantMessageIdempotencyKey.make(value)

/** The durable outcome of capability-driven Processor placement. */
export const InstantEffectPlacementStatus = S.Literals([
  'AssignedPreferred',
  'AssignedFallback',
  'Waiting',
  'Failed',
  'Ignored',
])
/** The durable outcome of capability-driven Processor placement. */
export type InstantEffectPlacementStatus =
  typeof InstantEffectPlacementStatus.Type

/** The canonical Foldkit event range permitted as one factual effect result. */
export const InstantPermittedResultEventRange = Command.ResultEventRange
/** One Program event range permitted as the factual result of an effect. */
export type InstantPermittedResultEventRange =
  typeof InstantPermittedResultEventRange.Type

/** Every factual Message event that one delegated effect may return. */
export const InstantPermittedResultEvents = S.NonEmptyArray(
  Command.ResultEventRange,
)
/** Every factual Message event that one delegated effect may return. */
export type InstantPermittedResultEvents =
  typeof InstantPermittedResultEvents.Type

/** Routing and fencing data for one authenticated Program session. */
export const InstantProgramSessionRecord = S.Struct({
  authorityProcessorId: S.String,
  createdAtMs: S.Int,
  id: S.String,
  isRevoked: S.Boolean,
  processorRoomId: HighEntropyRoomId,
  programId: S.String,
  programVersion: S.Int,
  protocolVersion: InstantProgramProtocolVersion,
  sessionId: S.String,
  sessionPolicy: Synchronization.SessionPolicy,
  subjectId: S.String,
})
/** Routing and fencing data for one authenticated Program session. */
export type InstantProgramSessionRecord =
  typeof InstantProgramSessionRecord.Type

/**
 * A durable, offline-capable request to admit one Message occurrence.
 * `actorSequence` is a monotonic provenance nonce per actor and Client. Instant's
 * ordered outbox preserves normal delivery, while admission permits holes and
 * never waits for a missing nonce.
 */
export const InstantMessageProposalRecord = S.Struct({
  actorId: S.String,
  actorSequence: NonNegativeInteger,
  causationOccurrenceId: S.NullOr(S.String),
  clientId: S.String,
  correlationId: S.NullOr(S.String),
  createdAtMs: S.Int,
  effectAssignmentGeneration: S.NullOr(NonNegativeInteger),
  effectCancellationGeneration: S.NullOr(NonNegativeInteger),
  effectIdempotencyKey: S.NullOr(S.String),
  effectRequestId: S.NullOr(S.String),
  envelopeJson: S.String,
  envelopeVersion: S.Int,
  eventId: S.String,
  eventVersion: S.Int,
  executorProcessorId: S.NullOr(S.String),
  id: S.String,
  messageCategory: Synchronization.MessageCategory,
  messageIdempotencyKey: S.NullOr(InstantMessageIdempotencyKey),
  occurrenceId: S.String,
  originDeviceId: S.String,
  originatingProcessorId: S.String,
  payloadJson: S.String,
  programId: S.String,
  programVersion: S.Int,
  protocolVersion: InstantProgramProtocolVersion,
  proposalId: S.String,
  proposalKind: InstantMessageProposalKind,
  proposedAudience: Synchronization.Audience,
  policyGeneration: NonNegativeInteger,
  sessionId: S.String,
  subjectId: S.String,
})
/** A durable, offline-capable request to admit one Message occurrence. */
export type InstantMessageProposalRecord =
  typeof InstantMessageProposalRecord.Type

/** Returns whether a proposal carries exactly the fields required by its kind. */
export const isInstantMessageProposalKindValid = (
  proposal: InstantMessageProposalRecord,
): boolean => {
  const hasCompleteEffectFields =
    proposal.effectAssignmentGeneration !== null &&
    proposal.effectCancellationGeneration !== null &&
    proposal.effectIdempotencyKey !== null &&
    proposal.effectRequestId !== null &&
    proposal.executorProcessorId !== null
  const hasNoEffectFields =
    proposal.effectAssignmentGeneration === null &&
    proposal.effectCancellationGeneration === null &&
    proposal.effectIdempotencyKey === null &&
    proposal.effectRequestId === null &&
    proposal.executorProcessorId === null
  return (
    (proposal.proposalKind === 'Message' && hasNoEffectFields) ||
    (proposal.proposalKind === 'EffectResult' &&
      hasCompleteEffectFields &&
      proposal.messageIdempotencyKey === null)
  )
}

/** A safe terminal reason why an admission sequencer rejected a proposal. */
export const InstantMessageProposalRejectionReason = S.Literals([
  'DuplicateEffectResult',
  'DuplicateMessage',
  'EffectResultMismatch',
  'EnvelopeInvalid',
  'IdentityConflict',
  'ProposalKindMismatch',
  'ScopeMismatch',
  'SynchronizationPolicyMismatch',
])
/** A safe terminal reason why an admission sequencer rejected a proposal. */
export type InstantMessageProposalRejectionReason =
  typeof InstantMessageProposalRejectionReason.Type

/** The durable terminal rejection of one Message proposal. */
export const InstantMessageProposalResolutionRecord = S.Struct({
  actorId: S.String,
  actorSequence: NonNegativeInteger,
  clientId: S.String,
  id: S.String,
  programId: S.String,
  programVersion: S.Int,
  protocolVersion: InstantProgramProtocolVersion,
  proposalId: S.String,
  rejectedAtMs: S.Int,
  rejectingProcessorId: S.String,
  rejectionReason: InstantMessageProposalRejectionReason,
  sessionId: S.String,
  subjectId: S.String,
}).check(
  S.makeFilter(resolution =>
    resolution.id === resolution.proposalId
      ? undefined
      : {
          path: ['id'],
          issue: 'A proposal resolution id must equal its proposal id.',
        },
  ),
)
/** The durable terminal rejection of one Message proposal. */
export type InstantMessageProposalResolutionRecord =
  typeof InstantMessageProposalResolutionRecord.Type

/** One globally ordered Message occurrence admitted by an admission sequencer. */
export const InstantAcceptedMessageOccurrenceRecord = S.Struct({
  acceptedAtMs: S.Int,
  acceptedSequence: NonNegativeInteger,
  acceptingProcessorId: S.String,
  actorId: S.String,
  actorSequence: NonNegativeInteger,
  audience: Synchronization.Audience,
  causationId: S.NullOr(S.String),
  clientId: S.String,
  correlationId: S.NullOr(S.String),
  createdAtMs: S.Int,
  effectAssignmentGeneration: S.NullOr(NonNegativeInteger),
  effectCancellationGeneration: S.NullOr(NonNegativeInteger),
  effectIdempotencyKey: S.NullOr(S.String),
  effectRequestId: S.NullOr(S.String),
  envelopeJson: S.String,
  envelopeVersion: S.Int,
  eventId: S.String,
  eventVersion: S.Int,
  executorProcessorId: S.NullOr(S.String),
  id: S.String,
  messageCategory: Synchronization.MessageCategory,
  messageIdempotencyKey: S.NullOr(InstantMessageIdempotencyKey),
  occurrenceId: S.String,
  originDeviceId: S.String,
  originatingProcessorId: S.String,
  payloadJson: S.String,
  positionKey: S.String,
  programId: S.String,
  programVersion: S.Int,
  protocolVersion: InstantProgramProtocolVersion,
  proposedEnvelopeJson: S.String,
  proposalId: S.String,
  proposalKind: InstantMessageProposalKind,
  policyGeneration: NonNegativeInteger,
  sessionPolicy: Synchronization.SessionPolicy,
  sessionId: S.String,
  subjectId: S.String,
})
/** One globally ordered Message occurrence admitted by an admission sequencer. */
export type InstantAcceptedMessageOccurrenceRecord =
  typeof InstantAcceptedMessageOccurrenceRecord.Type

/** Why an accepted occurrence is not a canonical durable protocol-v2 row. */
export const InstantAcceptedMessageOccurrenceValidationIssue = S.Literals([
  'AcceptedSequence',
  'OccurrenceIdentity',
  'PositionKey',
  'ProposalKind',
])
/** Why an accepted occurrence is not a canonical durable protocol-v2 row. */
export type InstantAcceptedMessageOccurrenceValidationIssue =
  typeof InstantAcceptedMessageOccurrenceValidationIssue.Type

/** Returns the first semantic protocol-v2 violation in an accepted occurrence. */
export const instantAcceptedMessageOccurrenceValidationIssue = (
  occurrence: InstantAcceptedMessageOccurrenceRecord,
): Option.Option<InstantAcceptedMessageOccurrenceValidationIssue> => {
  if (occurrence.acceptedSequence < 1) {
    return Option.some('AcceptedSequence')
  } else if (occurrence.id !== occurrence.occurrenceId) {
    return Option.some('OccurrenceIdentity')
  } else if (
    occurrence.positionKey !==
    `${occurrence.sessionId}:${occurrence.acceptedSequence}`
  ) {
    return Option.some('PositionKey')
  }
  const hasCompleteEffectFields =
    occurrence.effectAssignmentGeneration !== null &&
    occurrence.effectCancellationGeneration !== null &&
    occurrence.effectIdempotencyKey !== null &&
    occurrence.effectRequestId !== null &&
    occurrence.executorProcessorId !== null
  const hasNoEffectFields =
    occurrence.effectAssignmentGeneration === null &&
    occurrence.effectCancellationGeneration === null &&
    occurrence.effectIdempotencyKey === null &&
    occurrence.effectRequestId === null &&
    occurrence.executorProcessorId === null
  if (
    (occurrence.proposalKind === 'Message' && hasNoEffectFields) ||
    (occurrence.proposalKind === 'EffectResult' &&
      hasCompleteEffectFields &&
      occurrence.messageIdempotencyKey === null)
  ) {
    return Option.none()
  } else {
    return Option.some('ProposalKind')
  }
}

/** Returns whether an accepted occurrence is semantically canonical protocol v2. */
export const isInstantAcceptedMessageOccurrenceValid = (
  occurrence: InstantAcceptedMessageOccurrenceRecord,
): boolean =>
  Option.isNone(instantAcceptedMessageOccurrenceValidationIssue(occurrence))

/** An append-only materialized Model checkpoint derived from accepted Messages. */
export const InstantProjectionCheckpointRecord = S.Struct({
  checkpointId: S.String,
  createdAtMs: S.Int,
  id: S.String,
  modelDigest: S.String,
  modelJson: S.String,
  programId: S.String,
  programVersion: S.Int,
  protocolVersion: InstantProgramProtocolVersion,
  projectionId: S.String,
  projectionVersion: S.Int,
  projectorProcessorId: S.String,
  sessionId: S.String,
  subjectId: S.String,
  throughAcceptedSequence: S.Int,
})
/** An append-only materialized Model checkpoint derived from accepted Messages. */
export type InstantProjectionCheckpointRecord =
  typeof InstantProjectionCheckpointRecord.Type

/** A durable request for one capable Processor to perform a Program effect. */
export const InstantEffectRequestRecord = S.Struct({
  causalAudience: Synchronization.Audience,
  causalMessageCategory: Synchronization.MessageCategory,
  causalOccurrenceId: S.String,
  causalPolicyGeneration: NonNegativeInteger,
  effectId: S.String,
  effectVersion: S.Int,
  id: S.String,
  idempotencyKey: S.String,
  minimumCapabilityVersion: S.Int,
  originatingProcessorId: S.String,
  placement: Processor.Placement,
  programId: S.String,
  programVersion: S.Int,
  protocolVersion: InstantProgramProtocolVersion,
  publicArguments: S.Record(S.String, S.Json),
  permittedResultEvents: S.NonEmptyArray(Command.ResultEventRange),
  requestId: S.String,
  requestedAtMs: S.Int,
  requiredCapabilityIdJson: S.String,
  sessionId: S.String,
  subjectId: S.String,
}).check(
  S.makeFilter(request =>
    request.requiredCapabilityIdJson ===
      S.encodeSync(CapabilityIdJson)(request.placement.capability.id) &&
    request.minimumCapabilityVersion ===
      request.placement.capability.minimumVersion
      ? undefined
      : {
          path: ['requiredCapabilityIdJson'],
          issue:
            'The indexed capability fields must match the canonical placement.',
        },
  ),
)
/** A durable request for one capable Processor to perform a Program effect. */
export type InstantEffectRequestRecord = typeof InstantEffectRequestRecord.Type

/** One append-only generation of a deterministic effect placement decision. */
export const InstantEffectPlacementRecord = S.Struct({
  assignedProcessorId: S.NullOr(S.String),
  assignmentGeneration: NonNegativeInteger,
  cancellationGeneration: NonNegativeInteger,
  decidedAtMs: S.Int,
  id: InstantEntityId,
  placementDecision: Processor.PlacementDecision,
  placementStatus: InstantEffectPlacementStatus,
  positionKey: S.String,
  programId: S.String,
  programVersion: S.Int,
  protocolVersion: InstantProgramProtocolVersion,
  requestId: S.String,
  sessionId: S.String,
  subjectId: S.String,
}).check(
  S.makeFilter(placement => {
    const expectedStatus = placement.placementDecision._tag
    const expectedProcessorId =
      placement.placementDecision._tag === 'AssignedPreferred' ||
      placement.placementDecision._tag === 'AssignedFallback'
        ? placement.placementDecision.processorId
        : null
    return placement.placementStatus === expectedStatus &&
      placement.assignedProcessorId === expectedProcessorId &&
      placement.positionKey ===
        makeInstantEffectPlacementPositionKey(
          placement.requestId,
          placement.assignmentGeneration,
          placement.cancellationGeneration,
        )
      ? undefined
      : {
          path: ['placementDecision'],
          issue:
            'The indexed placement fields must match the canonical decision and generation.',
        }
  }),
)
/** One append-only generation of a deterministic effect placement decision. */
export type InstantEffectPlacementRecord =
  typeof InstantEffectPlacementRecord.Type

/** Derives the stable indexed representation of a nested capability ID. */
export const makeInstantCapabilityIdIndex = (
  capabilityId: Processor.CapabilityId,
): string => S.encodeSync(CapabilityIdJson)(capabilityId)

/** Derives the logical identity for one placement generation, separate from its Instant entity UUID. */
export const makeInstantEffectPlacementPositionKey = (
  requestId: string,
  assignmentGeneration: number,
  cancellationGeneration: number,
): string => `${requestId}:${assignmentGeneration}:${cancellationGeneration}`

/** Ephemeral Processor liveness and capability data published through an Instant room. */
export const InstantProcessorPresence = S.Struct({
  clientId: S.String,
  descriptor: Processor.Descriptor,
  isEffectExecutorAvailable: S.Boolean,
  lastSeenAtMs: S.Int,
  latestAcceptedSequence: S.Int,
  processorId: S.String,
  protocolMaximumVersion: S.Int,
  protocolMinimumVersion: S.Int,
}).check(
  S.makeFilter(presence =>
    presence.clientId === presence.descriptor.clientId &&
    presence.processorId === presence.descriptor.processorId &&
    presence.protocolMinimumVersion ===
      presence.descriptor.protocol.minimumVersion &&
    presence.protocolMaximumVersion ===
      presence.descriptor.protocol.maximumVersion
      ? undefined
      : {
          path: ['descriptor'],
          issue:
            'The indexed presence fields must match the canonical Processor Descriptor.',
        },
  ),
)
/** Ephemeral Processor liveness and capability data published through an Instant room. */
export type InstantProcessorPresence = typeof InstantProcessorPresence.Type

/** A disposable activity hint that never changes the authoritative Program Model. */
export const InstantProcessorActivity = S.Struct({
  activity: S.Literals([
    'HandlingEffect',
    'WaitingForProcessor',
    'EffectUnavailable',
  ]),
  effectRequestId: S.String,
  processorId: S.String,
})
/** A disposable activity hint that never changes the authoritative Program Model. */
export type InstantProcessorActivity = typeof InstantProcessorActivity.Type

/** InstantDB entity definitions that a host can compose into its application schema. */
export const InstantProgramEntities = {
  foldkitAcceptedMessageOccurrences: i.entity({
    acceptedAtMs: i.number().indexed(),
    acceptedSequence: i.number().indexed(),
    acceptingProcessorId: i.string().indexed(),
    actorId: i.string().indexed(),
    actorSequence: i.number().indexed(),
    audience: i.json(),
    causationId: i.string().indexed().optional(),
    clientId: i.string().indexed(),
    correlationId: i.string().indexed().optional(),
    createdAtMs: i.number().indexed(),
    effectAssignmentGeneration: i.number().optional(),
    effectCancellationGeneration: i.number().optional(),
    effectIdempotencyKey: i.string().unique().indexed().optional(),
    effectRequestId: i.string().indexed().optional(),
    envelopeJson: i.string(),
    envelopeVersion: i.number(),
    eventId: i.string().indexed(),
    eventVersion: i.number(),
    executorProcessorId: i.string().indexed().optional(),
    messageCategory: i.string().indexed(),
    messageIdempotencyKey: i.string().unique().indexed().optional(),
    occurrenceId: i.string().unique().indexed(),
    originDeviceId: i.string().indexed(),
    originatingProcessorId: i.string().indexed(),
    payloadJson: i.string(),
    positionKey: i.string().unique().indexed(),
    programId: i.string().indexed(),
    programVersion: i.number(),
    protocolVersion: i.number().indexed(),
    proposedEnvelopeJson: i.string(),
    proposalId: i.string().unique().indexed(),
    proposalKind: i.string().indexed(),
    policyGeneration: i.number().indexed(),
    sessionPolicy: i.json(),
    sessionId: i.string().indexed(),
    subjectId: i.string().indexed(),
  }),
  foldkitEffectRequests: i.entity({
    causalAudience: i.json(),
    causalMessageCategory: i.string().indexed(),
    causalOccurrenceId: i.string().indexed(),
    causalPolicyGeneration: i.number().indexed(),
    effectId: i.string().indexed(),
    effectVersion: i.number(),
    idempotencyKey: i.string().unique().indexed(),
    minimumCapabilityVersion: i.number(),
    originatingProcessorId: i.string().indexed(),
    placement: i.json(),
    programId: i.string().indexed(),
    programVersion: i.number(),
    protocolVersion: i.number().indexed(),
    publicArguments: i.json(),
    permittedResultEvents: i.json(),
    requestId: i.string().unique().indexed(),
    requestedAtMs: i.number().indexed(),
    requiredCapabilityIdJson: i.string().indexed(),
    sessionId: i.string().indexed(),
    subjectId: i.string().indexed(),
  }),
  foldkitEffectPlacements: i.entity({
    assignedProcessorId: i.string().indexed().optional(),
    assignmentGeneration: i.number().indexed(),
    cancellationGeneration: i.number().indexed(),
    decidedAtMs: i.number().indexed(),
    placementDecision: i.json(),
    placementStatus: i.string().indexed(),
    positionKey: i.string().unique().indexed(),
    programId: i.string().indexed(),
    programVersion: i.number(),
    protocolVersion: i.number().indexed(),
    requestId: i.string().indexed(),
    sessionId: i.string().indexed(),
    subjectId: i.string().indexed(),
  }),
  foldkitMessageProposals: i.entity({
    actorId: i.string().indexed(),
    actorSequence: i.number().indexed(),
    causationOccurrenceId: i.string().indexed().optional(),
    clientId: i.string().indexed(),
    correlationId: i.string().indexed().optional(),
    createdAtMs: i.number().indexed(),
    effectAssignmentGeneration: i.number().optional(),
    effectCancellationGeneration: i.number().optional(),
    effectIdempotencyKey: i.string().indexed().optional(),
    effectRequestId: i.string().indexed().optional(),
    envelopeJson: i.string(),
    envelopeVersion: i.number(),
    eventId: i.string().indexed(),
    eventVersion: i.number(),
    executorProcessorId: i.string().indexed().optional(),
    messageCategory: i.string().indexed(),
    messageIdempotencyKey: i.string().indexed().optional(),
    occurrenceId: i.string().unique().indexed(),
    originDeviceId: i.string().indexed(),
    originatingProcessorId: i.string().indexed(),
    payloadJson: i.string(),
    programId: i.string().indexed(),
    programVersion: i.number(),
    protocolVersion: i.number().indexed(),
    proposalId: i.string().unique().indexed(),
    proposalKind: i.string().indexed(),
    proposedAudience: i.json(),
    policyGeneration: i.number().indexed(),
    sessionId: i.string().indexed(),
    subjectId: i.string().indexed(),
  }),
  foldkitMessageProposalResolutions: i.entity({
    actorId: i.string().indexed(),
    actorSequence: i.number().indexed(),
    clientId: i.string().indexed(),
    programId: i.string().indexed(),
    programVersion: i.number(),
    protocolVersion: i.number().indexed(),
    proposalId: i.string().unique().indexed(),
    rejectedAtMs: i.number().indexed(),
    rejectingProcessorId: i.string().indexed(),
    rejectionReason: i.string().indexed(),
    sessionId: i.string().indexed(),
    subjectId: i.string().indexed(),
  }),
  foldkitProgramSessions: i.entity({
    authorityProcessorId: i.string().indexed(),
    createdAtMs: i.number().indexed(),
    isRevoked: i.boolean().indexed(),
    processorRoomId: i.string().unique().indexed(),
    programId: i.string().indexed(),
    programVersion: i.number(),
    protocolVersion: i.number().indexed(),
    sessionId: i.string().unique().indexed(),
    sessionPolicy: i.json(),
    subjectId: i.string().indexed(),
  }),
  foldkitProjectionCheckpoints: i.entity({
    checkpointId: i.string().unique().indexed(),
    createdAtMs: i.number().indexed(),
    modelDigest: i.string(),
    modelJson: i.string(),
    programId: i.string().indexed(),
    programVersion: i.number(),
    protocolVersion: i.number().indexed(),
    projectionId: i.string().indexed(),
    projectionVersion: i.number(),
    projectorProcessorId: i.string().indexed(),
    sessionId: i.string().indexed(),
    subjectId: i.string().indexed(),
    throughAcceptedSequence: i.number().indexed(),
  }),
}

/** Typed rooms used only for transient Processor presence and activity hints. */
export const InstantProgramRooms = {
  foldkitProcessors: {
    presence: i.entity({
      clientId: i.string(),
      descriptor: i.json(),
      isEffectExecutorAvailable: i.boolean(),
      lastSeenAtMs: i.number(),
      latestAcceptedSequence: i.number(),
      processorId: i.string(),
      protocolMaximumVersion: i.number(),
      protocolMinimumVersion: i.number(),
    }),
    topics: {
      processorActivity: i.entity({
        activity: i.string(),
        effectRequestId: i.string(),
        processorId: i.string(),
      }),
    },
  },
}

/** The exact pre-release schema for hosts with no legacy authenticated Program rows. */
export const InstantProgramSchema = i.schema({
  entities: InstantProgramEntities,
  rooms: InstantProgramRooms,
})

/** An InstantDB client initialized by the host with the Foldkit Program schema. */
export type InstantProgramDatabase = InstantCoreDatabase<
  typeof InstantProgramSchema
>
