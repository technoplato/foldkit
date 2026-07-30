import { Schema as S } from 'effect'
import { Command, Processor } from 'foldkit'

import { InstantCoreDatabase, i } from '@instantdb/core'

const HighEntropyRoomId = S.String.check(S.isMinLength(32))
const NonNegativeInteger = S.Int.check(S.isGreaterThanOrEqualTo(0))
const CapabilityIdJson = S.fromJsonString(Processor.CapabilityId)

/** The kinds of Message proposal accepted through the shared Program intake path. */
export const InstantMessageProposalKind = S.Literals([
  'Message',
  'EffectResult',
])
/** The kinds of Message proposal accepted through the shared Program intake path. */
export type InstantMessageProposalKind = typeof InstantMessageProposalKind.Type

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

/** The authenticated owner and single acceptance authority for one Program session. */
export const InstantProgramSessionRecord = S.Struct({
  authorityProcessorId: S.String,
  createdAtMs: S.Int,
  id: S.String,
  isRevoked: S.Boolean,
  processorRoomId: HighEntropyRoomId,
  programId: S.String,
  programVersion: S.Int,
  sessionId: S.String,
  subjectId: S.String,
})
/** The authenticated owner and single acceptance authority for one Program session. */
export type InstantProgramSessionRecord =
  typeof InstantProgramSessionRecord.Type

/** A durable, offline-capable request to admit one Message occurrence. */
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
  occurrenceId: S.String,
  originDeviceId: S.String,
  originatingProcessorId: S.String,
  payloadJson: S.String,
  programId: S.String,
  programVersion: S.Int,
  proposalId: S.String,
  proposalKind: InstantMessageProposalKind,
  sessionId: S.String,
  subjectId: S.String,
})
/** A durable, offline-capable request to admit one Message occurrence. */
export type InstantMessageProposalRecord =
  typeof InstantMessageProposalRecord.Type

/** One globally ordered Message occurrence admitted by an acceptance authority. */
export const InstantAcceptedMessageOccurrenceRecord = S.Struct({
  acceptedAtMs: S.Int,
  acceptedSequence: NonNegativeInteger,
  acceptingProcessorId: S.String,
  actorId: S.String,
  actorSequence: NonNegativeInteger,
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
  occurrenceId: S.String,
  originDeviceId: S.String,
  originatingProcessorId: S.String,
  payloadJson: S.String,
  positionKey: S.String,
  programId: S.String,
  programVersion: S.Int,
  proposedEnvelopeJson: S.String,
  proposalId: S.String,
  proposalKind: InstantMessageProposalKind,
  sessionId: S.String,
  subjectId: S.String,
})
/** One globally ordered Message occurrence admitted by an acceptance authority. */
export type InstantAcceptedMessageOccurrenceRecord =
  typeof InstantAcceptedMessageOccurrenceRecord.Type

/** An append-only materialized Model checkpoint derived from accepted Messages. */
export const InstantProjectionCheckpointRecord = S.Struct({
  checkpointId: S.String,
  createdAtMs: S.Int,
  id: S.String,
  modelDigest: S.String,
  modelJson: S.String,
  programId: S.String,
  programVersion: S.Int,
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
  causalOccurrenceId: S.String,
  effectId: S.String,
  effectVersion: S.Int,
  id: S.String,
  idempotencyKey: S.String,
  minimumCapabilityVersion: S.Int,
  originatingProcessorId: S.String,
  placement: Processor.Placement,
  programId: S.String,
  programVersion: S.Int,
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
  id: S.String,
  placementDecision: Processor.PlacementDecision,
  placementStatus: InstantEffectPlacementStatus,
  positionKey: S.String,
  programId: S.String,
  programVersion: S.Int,
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

/** Derives the unique append-only position for one effect placement generation. */
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
    occurrenceId: i.string().unique().indexed(),
    originDeviceId: i.string().indexed(),
    originatingProcessorId: i.string().indexed(),
    payloadJson: i.string(),
    positionKey: i.string().unique().indexed(),
    programId: i.string().indexed(),
    programVersion: i.number(),
    proposedEnvelopeJson: i.string(),
    proposalId: i.string().indexed(),
    proposalKind: i.string().indexed(),
    sessionId: i.string().indexed(),
    subjectId: i.string().indexed(),
  }),
  foldkitEffectRequests: i.entity({
    causalOccurrenceId: i.string().indexed(),
    effectId: i.string().indexed(),
    effectVersion: i.number(),
    idempotencyKey: i.string().unique().indexed(),
    minimumCapabilityVersion: i.number(),
    originatingProcessorId: i.string().indexed(),
    placement: i.json(),
    programId: i.string().indexed(),
    programVersion: i.number(),
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
    occurrenceId: i.string().unique().indexed(),
    originDeviceId: i.string().indexed(),
    originatingProcessorId: i.string().indexed(),
    payloadJson: i.string(),
    programId: i.string().indexed(),
    programVersion: i.number(),
    proposalId: i.string().unique().indexed(),
    proposalKind: i.string().indexed(),
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
    sessionId: i.string().unique().indexed(),
    subjectId: i.string().indexed(),
  }),
  foldkitProjectionCheckpoints: i.entity({
    checkpointId: i.string().unique().indexed(),
    createdAtMs: i.number().indexed(),
    modelDigest: i.string(),
    modelJson: i.string(),
    programId: i.string().indexed(),
    programVersion: i.number(),
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
