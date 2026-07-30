import { Schema as S } from 'effect'

import { InstantCoreDatabase, i } from '@instantdb/core'

/** A durable, offline-capable request to admit one Message occurrence. */
export const InstantMessageProposalRecord = S.Struct({
  actorId: S.String,
  actorSequence: S.Int,
  clientId: S.String,
  createdAtMs: S.Int,
  envelopeJson: S.String,
  envelopeVersion: S.Int,
  eventId: S.String,
  eventVersion: S.Int,
  id: S.String,
  originatingProcessorId: S.String,
  payloadJson: S.String,
  programId: S.String,
  programVersion: S.Int,
  proposalId: S.String,
  sessionId: S.String,
})
/** A durable, offline-capable request to admit one Message occurrence. */
export type InstantMessageProposalRecord =
  typeof InstantMessageProposalRecord.Type

/** One globally ordered Message occurrence admitted by an acceptance authority. */
export const InstantAcceptedMessageOccurrenceRecord = S.Struct({
  acceptedAtMs: S.Int,
  acceptedSequence: S.Int,
  acceptingProcessorId: S.String,
  actorId: S.String,
  causationId: S.String,
  clientId: S.String,
  correlationId: S.String,
  envelopeJson: S.String,
  envelopeVersion: S.Int,
  eventId: S.String,
  eventVersion: S.Int,
  id: S.String,
  occurrenceId: S.String,
  originatingProcessorId: S.String,
  payloadJson: S.String,
  positionKey: S.String,
  programId: S.String,
  programVersion: S.Int,
  proposalId: S.String,
  sessionId: S.String,
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
  throughAcceptedSequence: S.Int,
})
/** An append-only materialized Model checkpoint derived from accepted Messages. */
export type InstantProjectionCheckpointRecord =
  typeof InstantProjectionCheckpointRecord.Type

/** A durable request for one capable Processor to perform a Program effect. */
export const InstantEffectRequestRecord = S.Struct({
  argumentsJson: S.String,
  cancellationGeneration: S.Int,
  causalOccurrenceId: S.String,
  effectId: S.String,
  effectVersion: S.Int,
  id: S.String,
  idempotencyKey: S.String,
  minimumCapabilityVersion: S.Int,
  originatingProcessorId: S.String,
  placementJson: S.String,
  programId: S.String,
  programVersion: S.Int,
  requestId: S.String,
  requestedAtMs: S.Int,
  requiredCapability: S.String,
  sessionId: S.String,
})
/** A durable request for one capable Processor to perform a Program effect. */
export type InstantEffectRequestRecord = typeof InstantEffectRequestRecord.Type

/** InstantDB entity definitions that a host can compose into its application schema. */
export const InstantProgramEntities = {
  foldkitAcceptedMessageOccurrences: i.entity({
    acceptedAtMs: i.number().indexed(),
    acceptedSequence: i.number().indexed(),
    acceptingProcessorId: i.string().indexed(),
    actorId: i.string().indexed(),
    causationId: i.string().indexed(),
    clientId: i.string().indexed(),
    correlationId: i.string().indexed(),
    envelopeJson: i.string(),
    envelopeVersion: i.number(),
    eventId: i.string().indexed(),
    eventVersion: i.number(),
    occurrenceId: i.string().unique().indexed(),
    originatingProcessorId: i.string().indexed(),
    payloadJson: i.string(),
    positionKey: i.string().unique().indexed(),
    programId: i.string().indexed(),
    programVersion: i.number(),
    proposalId: i.string().indexed(),
    sessionId: i.string().indexed(),
  }),
  foldkitEffectRequests: i.entity({
    argumentsJson: i.string(),
    cancellationGeneration: i.number(),
    causalOccurrenceId: i.string().indexed(),
    effectId: i.string().indexed(),
    effectVersion: i.number(),
    idempotencyKey: i.string().unique().indexed(),
    minimumCapabilityVersion: i.number(),
    originatingProcessorId: i.string().indexed(),
    placementJson: i.string(),
    programId: i.string().indexed(),
    programVersion: i.number(),
    requestId: i.string().unique().indexed(),
    requestedAtMs: i.number().indexed(),
    requiredCapability: i.string().indexed(),
    sessionId: i.string().indexed(),
  }),
  foldkitMessageProposals: i.entity({
    actorId: i.string().indexed(),
    actorSequence: i.number().indexed(),
    clientId: i.string().indexed(),
    createdAtMs: i.number().indexed(),
    envelopeJson: i.string(),
    envelopeVersion: i.number(),
    eventId: i.string().indexed(),
    eventVersion: i.number(),
    originatingProcessorId: i.string().indexed(),
    payloadJson: i.string(),
    programId: i.string().indexed(),
    programVersion: i.number(),
    proposalId: i.string().unique().indexed(),
    sessionId: i.string().indexed(),
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
    throughAcceptedSequence: i.number().indexed(),
  }),
}

/** A complete InstantDB schema for hosts using only Foldkit Program entities. */
export const InstantProgramSchema = i.schema({
  entities: InstantProgramEntities,
})

/** An InstantDB client initialized by the host with the Foldkit Program schema. */
export type InstantProgramDatabase = InstantCoreDatabase<
  typeof InstantProgramSchema
>
