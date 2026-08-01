import { Array, Data, Effect, Option, Order, Record, Schema as S } from 'effect'
import { Command, Processor, Program, Synchronization } from 'foldkit'

import {
  InstantAcceptedMessageOccurrenceRecord,
  type InstantAcceptedMessageOccurrenceRecord as InstantAcceptedMessageOccurrenceRecordType,
  InstantEffectPlacementRecord,
  type InstantEffectPlacementRecord as InstantEffectPlacementRecordType,
  InstantEffectRequestRecord,
  type InstantEffectRequestRecord as InstantEffectRequestRecordType,
  InstantMessageProposalKind,
  InstantMessageProposalRecord,
  type InstantMessageProposalRecord as InstantMessageProposalRecordType,
  InstantMessageProposalResolutionRecord,
  type InstantMessageProposalResolutionRecord as InstantMessageProposalResolutionRecordType,
  InstantProgramSessionRecord,
  type InstantProgramSessionRecord as InstantProgramSessionRecordType,
  InstantProjectionCheckpointRecord,
  type InstantProjectionCheckpointRecord as InstantProjectionCheckpointRecordType,
  instantAcceptedMessageOccurrenceValidationIssue,
  instantProgramProtocolVersion,
  isInstantMessageProposalKindValid,
} from '@foldkit/instant'

import { Message } from '../domain/message.js'
import { InstantCounterSynchronization } from '../domain/program.js'
import { EventRegistry } from '../domain/wire.js'
import {
  instantCounterSessionPolicy,
  programId,
  programVersion,
} from '../shared/identity.js'
import { makeMessageCodec } from '../transport/codec.js'
import type { HeadlessInstantDatabase } from './adminStore.js'
import { makeEffectRequestRecord } from './placement.js'

const NonNegativeInteger = S.Int.check(S.isGreaterThanOrEqualTo(0))
const JsonString = S.fromJsonString(S.Json)
const StorageRecord = S.Record(S.String, S.Unknown)
const CausalKeyJson = S.fromJsonString(
  S.Tuple([S.String, S.Int, S.String, S.String]),
)
const migrationBatchSize = 100

const LegacyMessageProposalRecord = S.Struct({
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
type LegacyMessageProposalRecord = typeof LegacyMessageProposalRecord.Type

const LegacyAcceptedMessageOccurrenceRecord = S.Struct({
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
type LegacyAcceptedMessageOccurrenceRecord =
  typeof LegacyAcceptedMessageOccurrenceRecord.Type

const LegacyEffectRequestRecord = S.Struct({
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
})
type LegacyEffectRequestRecord = typeof LegacyEffectRequestRecord.Type

const LegacyMessageProposalResolutionRecord = S.Struct({
  id: S.String,
  programId: S.String,
  programVersion: S.Int,
  proposalId: S.String,
  rejectedAtMs: S.Int,
  rejectingProcessorId: S.String,
  rejectionReason: S.Literals([
    'EffectResultMismatch',
    'EnvelopeInvalid',
    'IdentityConflict',
    'ProposalKindMismatch',
    'ScopeMismatch',
  ]),
  sessionId: S.String,
  subjectId: S.String,
})
type LegacyMessageProposalResolutionRecord =
  typeof LegacyMessageProposalResolutionRecord.Type

const LegacyEffectPlacementRecord = S.Struct({
  assignedProcessorId: S.NullOr(S.String),
  assignmentGeneration: NonNegativeInteger,
  cancellationGeneration: NonNegativeInteger,
  decidedAtMs: S.Int,
  id: S.String,
  placementDecision: Processor.PlacementDecision,
  placementStatus: S.Literals([
    'AssignedPreferred',
    'AssignedFallback',
    'Waiting',
    'Failed',
    'Ignored',
  ]),
  positionKey: S.String,
  programId: S.String,
  programVersion: S.Int,
  requestId: S.String,
  sessionId: S.String,
  subjectId: S.String,
})
type LegacyEffectPlacementRecord = typeof LegacyEffectPlacementRecord.Type

const LegacyProjectionCheckpointRecord = S.Struct({
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
type LegacyProjectionCheckpointRecord =
  typeof LegacyProjectionCheckpointRecord.Type

type StoredAcceptedMessageOccurrence =
  | Readonly<{
      _tag: 'Current'
      record: InstantAcceptedMessageOccurrenceRecordType
    }>
  | Readonly<{
      _tag: 'LegacyV1'
      record: LegacyAcceptedMessageOccurrenceRecord
    }>

type StoredMessageProposal =
  | Readonly<{
      _tag: 'Current'
      record: InstantMessageProposalRecordType
    }>
  | Readonly<{
      _tag: 'LegacyV1'
      record: LegacyMessageProposalRecord
    }>

type StoredEffectRequest =
  | Readonly<{
      _tag: 'Current'
      record: InstantEffectRequestRecordType
    }>
  | Readonly<{
      _tag: 'LegacyV1'
      record: LegacyEffectRequestRecord
    }>

type StoredMessageProposalResolution =
  | Readonly<{
      _tag: 'Current'
      record: InstantMessageProposalResolutionRecordType
    }>
  | Readonly<{
      _tag: 'LegacyV1'
      record: LegacyMessageProposalResolutionRecord
    }>

type StoredEffectPlacement =
  | Readonly<{
      _tag: 'Current'
      record: InstantEffectPlacementRecordType
    }>
  | Readonly<{
      _tag: 'LegacyV1'
      record: LegacyEffectPlacementRecord
    }>

type StoredProjectionCheckpoint =
  | Readonly<{
      _tag: 'Current'
      record: InstantProjectionCheckpointRecordType
    }>
  | Readonly<{
      _tag: 'LegacyV1'
      record: LegacyProjectionCheckpointRecord
    }>

type FrozenRouting = Readonly<{
  audience: Synchronization.Audience
  messageCategory: Synchronization.MessageCategory
  policyGeneration: number
  sessionPolicy: Synchronization.SessionPolicy
}>

type LegacyRoutingMigrationPlan = Readonly<{
  acceptedOccurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecordType>
  counts: LegacyRoutingMigrationCounts
  effectPlacements: ReadonlyArray<InstantEffectPlacementRecordType>
  effectRequests: ReadonlyArray<InstantEffectRequestRecordType>
  messageProposalResolutions: ReadonlyArray<InstantMessageProposalResolutionRecordType>
  messageProposals: ReadonlyArray<InstantMessageProposalRecordType>
  projectionCheckpoints: ReadonlyArray<InstantProjectionCheckpointRecordType>
}>

type LegacyRoutingMigrationInput = Readonly<{
  acceptedOccurrences: ReadonlyArray<unknown>
  effectPlacements: ReadonlyArray<unknown>
  effectRequests: ReadonlyArray<unknown>
  messageProposalResolutions: ReadonlyArray<unknown>
  messageProposals: ReadonlyArray<unknown>
  programSessions: ReadonlyArray<unknown>
  projectionCheckpoints: ReadonlyArray<unknown>
}>

/** Credential-free counts returned after one legacy routing preflight. */
export const LegacyRoutingMigrationCounts = S.Struct({
  acceptedOccurrences: NonNegativeInteger,
  effectPlacements: NonNegativeInteger,
  effectRequests: NonNegativeInteger,
  messageProposalResolutions: NonNegativeInteger,
  messageProposals: NonNegativeInteger,
  projectionCheckpoints: NonNegativeInteger,
})
/** Credential-free counts returned after one legacy routing preflight. */
export type LegacyRoutingMigrationCounts =
  typeof LegacyRoutingMigrationCounts.Type

/** One exact legacy routing preflight row could not be safely upgraded. */
export class LegacyRoutingMigrationError extends Data.TaggedError(
  'LegacyRoutingMigrationError',
)<{
  readonly entity:
    | 'AcceptedOccurrence'
    | 'EffectPlacement'
    | 'EffectRequest'
    | 'MessageProposal'
    | 'MessageProposalResolution'
    | 'Preflight'
    | 'ProjectionCheckpoint'
  readonly reason:
    | 'AcceptedAndRejected'
    | 'AcceptedProposalConflict'
    | 'DatabaseRead'
    | 'DatabaseWrite'
    | 'DuplicateOccurrence'
    | 'InvalidLegacyMessage'
    | 'MalformedOrPartialV2'
    | 'MissingAcceptedProposal'
    | 'MissingCausalOccurrence'
    | 'MissingResolutionProposal'
    | 'ResolutionProposalConflict'
    | 'ScopeMismatch'
}> {}

const migrationCodec = makeMessageCodec({
  actor: Processor.SystemActor.make({
    processorId: 'instant-counter-legacy-routing-migration',
  }),
})

const migrationError = (
  entity: LegacyRoutingMigrationError['entity'],
  reason: LegacyRoutingMigrationError['reason'],
): LegacyRoutingMigrationError =>
  new LegacyRoutingMigrationError({ entity, reason })

const nullableStoredField = (
  record: Record.ReadonlyRecord<string, unknown>,
  field: string,
): unknown => Option.getOrNull(Record.get(record, field))

const normalizeMessageProposalStorage = (
  record: Record.ReadonlyRecord<string, unknown>,
) => ({
  ...record,
  causationOccurrenceId: nullableStoredField(record, 'causationOccurrenceId'),
  correlationId: nullableStoredField(record, 'correlationId'),
  effectAssignmentGeneration: nullableStoredField(
    record,
    'effectAssignmentGeneration',
  ),
  effectCancellationGeneration: nullableStoredField(
    record,
    'effectCancellationGeneration',
  ),
  effectIdempotencyKey: nullableStoredField(record, 'effectIdempotencyKey'),
  effectRequestId: nullableStoredField(record, 'effectRequestId'),
  executorProcessorId: nullableStoredField(record, 'executorProcessorId'),
})

const normalizeAcceptedOccurrenceStorage = (
  record: Record.ReadonlyRecord<string, unknown>,
) => ({
  ...record,
  causationId: nullableStoredField(record, 'causationId'),
  correlationId: nullableStoredField(record, 'correlationId'),
  effectAssignmentGeneration: nullableStoredField(
    record,
    'effectAssignmentGeneration',
  ),
  effectCancellationGeneration: nullableStoredField(
    record,
    'effectCancellationGeneration',
  ),
  effectIdempotencyKey: nullableStoredField(record, 'effectIdempotencyKey'),
  effectRequestId: nullableStoredField(record, 'effectRequestId'),
  executorProcessorId: nullableStoredField(record, 'executorProcessorId'),
})

const normalizeEffectPlacementStorage = (
  record: Record.ReadonlyRecord<string, unknown>,
) => ({
  ...record,
  assignedProcessorId: nullableStoredField(record, 'assignedProcessorId'),
})

const isTargetProgram = (
  record: Readonly<{
    programId: string
    programVersion: number
  }>,
): boolean =>
  record.programId === programId && record.programVersion === programVersion

const hasValidProposalKindFields = (
  record: Readonly<{
    effectAssignmentGeneration: number | null
    effectCancellationGeneration: number | null
    effectIdempotencyKey: string | null
    effectRequestId: string | null
    executorProcessorId: string | null
    proposalKind: 'EffectResult' | 'Message'
  }>,
): boolean => {
  const hasCompleteEffectFields =
    record.effectAssignmentGeneration !== null &&
    record.effectCancellationGeneration !== null &&
    record.effectIdempotencyKey !== null &&
    record.effectRequestId !== null &&
    record.executorProcessorId !== null
  const hasNoEffectFields =
    record.effectAssignmentGeneration === null &&
    record.effectCancellationGeneration === null &&
    record.effectIdempotencyKey === null &&
    record.effectRequestId === null &&
    record.executorProcessorId === null
  return (
    (record.proposalKind === 'EffectResult' && hasCompleteEffectFields) ||
    (record.proposalKind === 'Message' && hasNoEffectFields)
  )
}

const decodeStorageObject = (
  input: unknown,
  entity: LegacyRoutingMigrationError['entity'],
): Effect.Effect<
  Record.ReadonlyRecord<string, unknown>,
  LegacyRoutingMigrationError
> =>
  Effect.try({
    try: () => S.decodeUnknownSync(StorageRecord)(input),
    catch: () => migrationError(entity, 'MalformedOrPartialV2'),
  })

const decodeStoredAcceptedOccurrence = (
  input: unknown,
): Effect.Effect<
  StoredAcceptedMessageOccurrence,
  LegacyRoutingMigrationError
> =>
  Effect.flatMap(
    decodeStorageObject(input, 'AcceptedOccurrence'),
    storageRecord => {
      const normalized = normalizeAcceptedOccurrenceStorage(storageRecord)
      const maybeCurrent = S.decodeUnknownOption(
        InstantAcceptedMessageOccurrenceRecord,
        { onExcessProperty: 'error' },
      )(normalized)
      if (Option.isSome(maybeCurrent)) {
        const record = maybeCurrent.value
        if (
          !isTargetProgram(record) ||
          Option.isSome(
            instantAcceptedMessageOccurrenceValidationIssue(record),
          ) ||
          record.policyGeneration !== record.sessionPolicy.generation
        ) {
          return Effect.fail(
            migrationError('AcceptedOccurrence', 'MalformedOrPartialV2'),
          )
        }
        return Effect.succeed<StoredAcceptedMessageOccurrence>({
          _tag: 'Current',
          record,
        })
      }
      const maybeLegacy = S.decodeUnknownOption(
        LegacyAcceptedMessageOccurrenceRecord,
        { onExcessProperty: 'error' },
      )(normalized)
      if (
        Option.isNone(maybeLegacy) ||
        !isTargetProgram(maybeLegacy.value) ||
        !hasValidProposalKindFields(maybeLegacy.value)
      ) {
        return Effect.fail(
          migrationError('AcceptedOccurrence', 'MalformedOrPartialV2'),
        )
      }
      return Effect.succeed<StoredAcceptedMessageOccurrence>({
        _tag: 'LegacyV1',
        record: maybeLegacy.value,
      })
    },
  )

const decodeStoredMessageProposal = (
  input: unknown,
): Effect.Effect<StoredMessageProposal, LegacyRoutingMigrationError> =>
  Effect.flatMap(
    decodeStorageObject(input, 'MessageProposal'),
    storageRecord => {
      const normalized = normalizeMessageProposalStorage(storageRecord)
      const maybeCurrent = S.decodeUnknownOption(InstantMessageProposalRecord, {
        onExcessProperty: 'error',
      })(normalized)
      if (Option.isSome(maybeCurrent)) {
        if (
          !isTargetProgram(maybeCurrent.value) ||
          !isInstantMessageProposalKindValid(maybeCurrent.value)
        ) {
          return Effect.fail(
            migrationError('MessageProposal', 'MalformedOrPartialV2'),
          )
        }
        return Effect.succeed<StoredMessageProposal>({
          _tag: 'Current',
          record: maybeCurrent.value,
        })
      }
      const maybeLegacy = S.decodeUnknownOption(LegacyMessageProposalRecord, {
        onExcessProperty: 'error',
      })(normalized)
      if (
        Option.isNone(maybeLegacy) ||
        !isTargetProgram(maybeLegacy.value) ||
        !hasValidProposalKindFields(maybeLegacy.value)
      ) {
        return Effect.fail(
          migrationError('MessageProposal', 'MalformedOrPartialV2'),
        )
      }
      return Effect.succeed<StoredMessageProposal>({
        _tag: 'LegacyV1',
        record: maybeLegacy.value,
      })
    },
  )

const decodeStoredEffectRequest = (
  input: unknown,
): Effect.Effect<StoredEffectRequest, LegacyRoutingMigrationError> =>
  Effect.flatMap(decodeStorageObject(input, 'EffectRequest'), storageRecord => {
    const maybeCurrent = S.decodeUnknownOption(InstantEffectRequestRecord, {
      onExcessProperty: 'error',
    })(storageRecord)
    if (Option.isSome(maybeCurrent)) {
      if (!isTargetProgram(maybeCurrent.value)) {
        return Effect.fail(
          migrationError('EffectRequest', 'MalformedOrPartialV2'),
        )
      }
      return Effect.succeed<StoredEffectRequest>({
        _tag: 'Current',
        record: maybeCurrent.value,
      })
    }
    const maybeLegacy = S.decodeUnknownOption(LegacyEffectRequestRecord, {
      onExcessProperty: 'error',
    })(storageRecord)
    if (Option.isNone(maybeLegacy) || !isTargetProgram(maybeLegacy.value)) {
      return Effect.fail(
        migrationError('EffectRequest', 'MalformedOrPartialV2'),
      )
    }
    return Effect.succeed<StoredEffectRequest>({
      _tag: 'LegacyV1',
      record: maybeLegacy.value,
    })
  })

const decodeStoredMessageProposalResolution = (
  input: unknown,
): Effect.Effect<
  StoredMessageProposalResolution,
  LegacyRoutingMigrationError
> =>
  Effect.flatMap(
    decodeStorageObject(input, 'MessageProposalResolution'),
    storageRecord => {
      const maybeCurrent = S.decodeUnknownOption(
        InstantMessageProposalResolutionRecord,
        { onExcessProperty: 'error' },
      )(storageRecord)
      if (Option.isSome(maybeCurrent)) {
        if (!isTargetProgram(maybeCurrent.value)) {
          return Effect.fail(
            migrationError('MessageProposalResolution', 'MalformedOrPartialV2'),
          )
        }
        return Effect.succeed<StoredMessageProposalResolution>({
          _tag: 'Current',
          record: maybeCurrent.value,
        })
      }
      const maybeLegacy = S.decodeUnknownOption(
        LegacyMessageProposalResolutionRecord,
        { onExcessProperty: 'error' },
      )(storageRecord)
      if (Option.isNone(maybeLegacy) || !isTargetProgram(maybeLegacy.value)) {
        return Effect.fail(
          migrationError('MessageProposalResolution', 'MalformedOrPartialV2'),
        )
      }
      return Effect.succeed<StoredMessageProposalResolution>({
        _tag: 'LegacyV1',
        record: maybeLegacy.value,
      })
    },
  )

const decodeStoredEffectPlacement = (
  input: unknown,
): Effect.Effect<StoredEffectPlacement, LegacyRoutingMigrationError> =>
  Effect.flatMap(
    decodeStorageObject(input, 'EffectPlacement'),
    storageRecord => {
      const normalized = normalizeEffectPlacementStorage(storageRecord)
      const maybeCurrent = S.decodeUnknownOption(InstantEffectPlacementRecord, {
        onExcessProperty: 'error',
      })(normalized)
      if (Option.isSome(maybeCurrent)) {
        if (!isTargetProgram(maybeCurrent.value)) {
          return Effect.fail(
            migrationError('EffectPlacement', 'MalformedOrPartialV2'),
          )
        }
        return Effect.succeed<StoredEffectPlacement>({
          _tag: 'Current',
          record: maybeCurrent.value,
        })
      }
      const maybeLegacy = S.decodeUnknownOption(LegacyEffectPlacementRecord, {
        onExcessProperty: 'error',
      })(normalized)
      if (Option.isNone(maybeLegacy) || !isTargetProgram(maybeLegacy.value)) {
        return Effect.fail(
          migrationError('EffectPlacement', 'MalformedOrPartialV2'),
        )
      }
      return Effect.succeed<StoredEffectPlacement>({
        _tag: 'LegacyV1',
        record: maybeLegacy.value,
      })
    },
  )

const decodeStoredProjectionCheckpoint = (
  input: unknown,
): Effect.Effect<StoredProjectionCheckpoint, LegacyRoutingMigrationError> =>
  Effect.flatMap(
    decodeStorageObject(input, 'ProjectionCheckpoint'),
    storageRecord => {
      const maybeCurrent = S.decodeUnknownOption(
        InstantProjectionCheckpointRecord,
        { onExcessProperty: 'error' },
      )(storageRecord)
      if (Option.isSome(maybeCurrent)) {
        if (!isTargetProgram(maybeCurrent.value)) {
          return Effect.fail(
            migrationError('ProjectionCheckpoint', 'MalformedOrPartialV2'),
          )
        }
        return Effect.succeed<StoredProjectionCheckpoint>({
          _tag: 'Current',
          record: maybeCurrent.value,
        })
      }
      const maybeLegacy = S.decodeUnknownOption(
        LegacyProjectionCheckpointRecord,
        { onExcessProperty: 'error' },
      )(storageRecord)
      if (Option.isNone(maybeLegacy) || !isTargetProgram(maybeLegacy.value)) {
        return Effect.fail(
          migrationError('ProjectionCheckpoint', 'MalformedOrPartialV2'),
        )
      }
      return Effect.succeed<StoredProjectionCheckpoint>({
        _tag: 'LegacyV1',
        record: maybeLegacy.value,
      })
    },
  )

const decodeLegacyMessage = (
  record: Readonly<{ envelopeJson: string; payloadJson: string }>,
  entity: LegacyRoutingMigrationError['entity'],
): Effect.Effect<Message, LegacyRoutingMigrationError> =>
  Effect.gen(function* () {
    const encoded = yield* Effect.try({
      try: () => ({
        envelope: S.decodeUnknownSync(JsonString)(record.envelopeJson),
        payload: S.decodeUnknownSync(JsonString)(record.payloadJson),
      }),
      catch: () => migrationError(entity, 'InvalidLegacyMessage'),
    })
    return yield* Program.decodeVersionedEvent(EventRegistry, encoded).pipe(
      Effect.map(decoded => decoded.message),
      Effect.catchCause(() =>
        Effect.fail(migrationError(entity, 'InvalidLegacyMessage')),
      ),
    )
  })

const routingForMessage = (
  message: Message,
  sessionPolicy: Synchronization.SessionPolicy,
  originatingProcessorId: string,
  entity: LegacyRoutingMigrationError['entity'],
): Effect.Effect<FrozenRouting, LegacyRoutingMigrationError> =>
  Effect.try({
    try: () => {
      const messageCategory =
        InstantCounterSynchronization.messageCategory(message)
      const audience = Synchronization.resolveAudience(
        sessionPolicy,
        messageCategory,
        originatingProcessorId,
      )
      if (audience._tag === 'ReadOnlyFollowerRejected') {
        throw migrationError(entity, 'InvalidLegacyMessage')
      }
      return {
        audience,
        messageCategory,
        policyGeneration: sessionPolicy.generation,
        sessionPolicy,
      }
    },
    catch: () => migrationError(entity, 'InvalidLegacyMessage'),
  })

const routingForLegacyMessage = (
  message: Message,
  originatingProcessorId: string,
  entity: LegacyRoutingMigrationError['entity'],
): Effect.Effect<FrozenRouting, LegacyRoutingMigrationError> =>
  routingForMessage(
    message,
    instantCounterSessionPolicy,
    originatingProcessorId,
    entity,
  )

const makeCausalKey = (
  record: Readonly<{
    occurrenceId: string
    programId: string
    programVersion: number
    sessionId: string
  }>,
): string =>
  S.encodeSync(CausalKeyJson)([
    record.programId,
    record.programVersion,
    record.sessionId,
    record.occurrenceId,
  ])

const routingFromOccurrence = (
  occurrence: InstantAcceptedMessageOccurrenceRecordType,
): FrozenRouting => ({
  audience: occurrence.audience,
  messageCategory: occurrence.messageCategory,
  policyGeneration: occurrence.policyGeneration,
  sessionPolicy: occurrence.sessionPolicy,
})

const routingFromCausalOccurrence = (
  acceptedByCausalKey: Map<string, InstantAcceptedMessageOccurrenceRecordType>,
  record: Readonly<{
    causationOccurrenceId: string | null
    programId: string
    programVersion: number
    sessionId: string
    subjectId: string
  }>,
  entity: LegacyRoutingMigrationError['entity'],
): Effect.Effect<FrozenRouting, LegacyRoutingMigrationError> => {
  if (record.causationOccurrenceId === null) {
    return Effect.fail(migrationError(entity, 'MissingCausalOccurrence'))
  }
  const maybeCausalOccurrence = Option.fromNullishOr(
    acceptedByCausalKey.get(
      makeCausalKey({
        occurrenceId: record.causationOccurrenceId,
        programId: record.programId,
        programVersion: record.programVersion,
        sessionId: record.sessionId,
      }),
    ),
  )
  if (Option.isNone(maybeCausalOccurrence)) {
    return Effect.fail(migrationError(entity, 'MissingCausalOccurrence'))
  }
  if (maybeCausalOccurrence.value.subjectId !== record.subjectId) {
    return Effect.fail(migrationError(entity, 'ScopeMismatch'))
  }
  return Effect.succeed(routingFromOccurrence(maybeCausalOccurrence.value))
}

const acceptedOccurrenceOrder = Order.combine(
  Order.mapInput(
    Order.String,
    (stored: StoredAcceptedMessageOccurrence) => stored.record.sessionId,
  ),
  Order.mapInput(
    Order.Number,
    (stored: StoredAcceptedMessageOccurrence) => stored.record.acceptedSequence,
  ),
)

const completeAcceptedOccurrenceOrder = Order.combine(
  Order.mapInput(
    Order.String,
    (occurrence: InstantAcceptedMessageOccurrenceRecordType) =>
      occurrence.sessionId,
  ),
  Order.mapInput(
    Order.Number,
    (occurrence: InstantAcceptedMessageOccurrenceRecordType) =>
      occurrence.acceptedSequence,
  ),
)

const makeAcceptedOccurrence = (
  legacy: LegacyAcceptedMessageOccurrenceRecord,
  routing: FrozenRouting,
): Effect.Effect<
  InstantAcceptedMessageOccurrenceRecordType,
  LegacyRoutingMigrationError
> =>
  Effect.try({
    try: () =>
      S.decodeUnknownSync(InstantAcceptedMessageOccurrenceRecord)({
        ...legacy,
        audience: routing.audience,
        messageCategory: routing.messageCategory,
        messageIdempotencyKey: null,
        policyGeneration: routing.policyGeneration,
        protocolVersion: instantProgramProtocolVersion,
        sessionPolicy: routing.sessionPolicy,
      }),
    catch: () => migrationError('AcceptedOccurrence', 'MalformedOrPartialV2'),
  })

const makeMessageProposal = (
  legacy: LegacyMessageProposalRecord,
  routing: FrozenRouting,
): Effect.Effect<
  InstantMessageProposalRecordType,
  LegacyRoutingMigrationError
> =>
  Effect.try({
    try: () =>
      S.decodeUnknownSync(InstantMessageProposalRecord)({
        ...legacy,
        messageCategory: routing.messageCategory,
        messageIdempotencyKey: null,
        policyGeneration: routing.policyGeneration,
        protocolVersion: instantProgramProtocolVersion,
        proposedAudience: routing.audience,
      }),
    catch: () => migrationError('MessageProposal', 'MalformedOrPartialV2'),
  })

const makeEffectRequest = (
  legacy: LegacyEffectRequestRecord,
  routing: FrozenRouting,
): Effect.Effect<InstantEffectRequestRecordType, LegacyRoutingMigrationError> =>
  Effect.try({
    try: () =>
      S.decodeUnknownSync(InstantEffectRequestRecord)({
        ...legacy,
        causalAudience: routing.audience,
        causalMessageCategory: routing.messageCategory,
        causalPolicyGeneration: routing.policyGeneration,
        protocolVersion: instantProgramProtocolVersion,
      }),
    catch: () => migrationError('EffectRequest', 'MalformedOrPartialV2'),
  })

const makeMessageProposalResolution = (
  legacy: LegacyMessageProposalResolutionRecord,
  proposal: InstantMessageProposalRecordType,
): Effect.Effect<
  InstantMessageProposalResolutionRecordType,
  LegacyRoutingMigrationError
> =>
  Effect.try({
    try: () =>
      S.decodeUnknownSync(InstantMessageProposalResolutionRecord)({
        ...legacy,
        actorId: proposal.actorId,
        actorSequence: proposal.actorSequence,
        clientId: proposal.clientId,
        protocolVersion: instantProgramProtocolVersion,
      }),
    catch: () =>
      migrationError('MessageProposalResolution', 'MalformedOrPartialV2'),
  })

const resolutionProposal = (
  resolution: LegacyMessageProposalResolutionRecord,
  proposals: ReadonlyArray<InstantMessageProposalRecordType>,
): Effect.Effect<
  InstantMessageProposalRecordType,
  LegacyRoutingMigrationError
> => {
  const candidates = Array.filter(
    proposals,
    proposal => proposal.proposalId === resolution.proposalId,
  )
  if (Array.isReadonlyArrayEmpty(candidates)) {
    return Effect.fail(
      migrationError('MessageProposalResolution', 'MissingResolutionProposal'),
    )
  }
  const proposal = Option.getOrThrow(Array.head(candidates))
  if (
    Array.length(candidates) !== 1 ||
    proposal.programId !== resolution.programId ||
    proposal.programVersion !== resolution.programVersion ||
    proposal.sessionId !== resolution.sessionId ||
    proposal.subjectId !== resolution.subjectId
  ) {
    return Effect.fail(
      migrationError('MessageProposalResolution', 'ResolutionProposalConflict'),
    )
  } else {
    return Effect.succeed(proposal)
  }
}

const makeEffectPlacement = (
  legacy: LegacyEffectPlacementRecord,
): Effect.Effect<
  InstantEffectPlacementRecordType,
  LegacyRoutingMigrationError
> =>
  Effect.try({
    try: () =>
      S.decodeUnknownSync(InstantEffectPlacementRecord)({
        ...legacy,
        protocolVersion: instantProgramProtocolVersion,
      }),
    catch: () => migrationError('EffectPlacement', 'MalformedOrPartialV2'),
  })

const makeProjectionCheckpoint = (
  legacy: LegacyProjectionCheckpointRecord,
): Effect.Effect<
  InstantProjectionCheckpointRecordType,
  LegacyRoutingMigrationError
> =>
  Effect.try({
    try: () =>
      S.decodeUnknownSync(InstantProjectionCheckpointRecord)({
        ...legacy,
        protocolVersion: instantProgramProtocolVersion,
      }),
    catch: () => migrationError('ProjectionCheckpoint', 'MalformedOrPartialV2'),
  })

type CompleteMigrationDataset = Readonly<{
  acceptedOccurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecordType>
  effectPlacements: ReadonlyArray<InstantEffectPlacementRecordType>
  effectRequests: ReadonlyArray<InstantEffectRequestRecordType>
  messageProposalResolutions: ReadonlyArray<InstantMessageProposalResolutionRecordType>
  messageProposals: ReadonlyArray<InstantMessageProposalRecordType>
  programSessions: ReadonlyArray<InstantProgramSessionRecordType>
  projectionCheckpoints: ReadonlyArray<InstantProjectionCheckpointRecordType>
}>

const audienceEquivalence = S.toEquivalence(Synchronization.Audience)
const sessionPolicyEquivalence = S.toEquivalence(Synchronization.SessionPolicy)
const effectRequestEquivalence = S.toEquivalence(InstantEffectRequestRecord)

const decodeProgramSessions = (
  records: ReadonlyArray<unknown>,
): Effect.Effect<
  ReadonlyArray<InstantProgramSessionRecordType>,
  LegacyRoutingMigrationError
> =>
  Effect.forEach(
    records,
    record =>
      Effect.try({
        try: () => {
          const session = S.decodeUnknownSync(InstantProgramSessionRecord)(
            record,
          )
          if (!isTargetProgram(session)) {
            throw migrationError('Preflight', 'ScopeMismatch')
          }
          return session
        },
        catch: cause =>
          cause instanceof LegacyRoutingMigrationError
            ? cause
            : migrationError('Preflight', 'MalformedOrPartialV2'),
      }),
    { concurrency: 1 },
  )

const sessionForRecord = (
  sessionsById: Map<string, InstantProgramSessionRecordType>,
  record: Readonly<{
    programId: string
    programVersion: number
    protocolVersion: number
    sessionId: string
    subjectId: string
  }>,
  entity: LegacyRoutingMigrationError['entity'],
): Effect.Effect<
  InstantProgramSessionRecordType,
  LegacyRoutingMigrationError
> => {
  const maybeSession = Option.fromNullishOr(sessionsById.get(record.sessionId))
  if (Option.isNone(maybeSession)) {
    return Effect.fail(migrationError(entity, 'ScopeMismatch'))
  }
  const session = maybeSession.value
  if (
    record.programId !== session.programId ||
    record.programVersion !== session.programVersion ||
    record.protocolVersion !== session.protocolVersion ||
    record.subjectId !== session.subjectId
  ) {
    return Effect.fail(migrationError(entity, 'ScopeMismatch'))
  } else {
    return Effect.succeed(session)
  }
}

const matchesAcceptedProposal = (
  accepted: InstantAcceptedMessageOccurrenceRecordType,
  proposal: InstantMessageProposalRecordType,
): boolean =>
  accepted.actorId === proposal.actorId &&
  accepted.actorSequence === proposal.actorSequence &&
  audienceEquivalence(accepted.audience, proposal.proposedAudience) &&
  accepted.causationId === proposal.causationOccurrenceId &&
  accepted.clientId === proposal.clientId &&
  accepted.correlationId === proposal.correlationId &&
  accepted.createdAtMs === proposal.createdAtMs &&
  accepted.effectAssignmentGeneration === proposal.effectAssignmentGeneration &&
  accepted.effectCancellationGeneration ===
    proposal.effectCancellationGeneration &&
  accepted.effectIdempotencyKey === proposal.effectIdempotencyKey &&
  accepted.effectRequestId === proposal.effectRequestId &&
  accepted.envelopeVersion === proposal.envelopeVersion &&
  accepted.eventId === proposal.eventId &&
  accepted.eventVersion === proposal.eventVersion &&
  accepted.executorProcessorId === proposal.executorProcessorId &&
  accepted.messageCategory === proposal.messageCategory &&
  accepted.messageIdempotencyKey === proposal.messageIdempotencyKey &&
  accepted.occurrenceId === proposal.occurrenceId &&
  accepted.originDeviceId === proposal.originDeviceId &&
  accepted.originatingProcessorId === proposal.originatingProcessorId &&
  accepted.payloadJson === proposal.payloadJson &&
  accepted.policyGeneration === proposal.policyGeneration &&
  accepted.programId === proposal.programId &&
  accepted.programVersion === proposal.programVersion &&
  accepted.proposedEnvelopeJson === proposal.envelopeJson &&
  accepted.proposalId === proposal.proposalId &&
  accepted.proposalKind === proposal.proposalKind &&
  accepted.protocolVersion === proposal.protocolVersion &&
  accepted.sessionId === proposal.sessionId &&
  accepted.subjectId === proposal.subjectId

const validateRoutingClaims = (
  record: Readonly<{
    messageCategory: Synchronization.MessageCategory
    policyGeneration: number
  }>,
  audience: Synchronization.Audience,
  routing: FrozenRouting,
  entity: LegacyRoutingMigrationError['entity'],
): Effect.Effect<void, LegacyRoutingMigrationError> => {
  if (
    record.messageCategory !== routing.messageCategory ||
    record.policyGeneration !== routing.policyGeneration ||
    !audienceEquivalence(audience, routing.audience)
  ) {
    return Effect.fail(migrationError(entity, 'MalformedOrPartialV2'))
  } else {
    return Effect.void
  }
}

const validateCompleteMigrationDataset = (
  dataset: CompleteMigrationDataset,
): Effect.Effect<void, LegacyRoutingMigrationError> =>
  Effect.gen(function* () {
    const sessionsById = new Map<string, InstantProgramSessionRecordType>()
    yield* Effect.forEach(
      dataset.programSessions,
      session => {
        if (sessionsById.has(session.sessionId)) {
          return Effect.fail(migrationError('Preflight', 'ScopeMismatch'))
        }
        sessionsById.set(session.sessionId, session)
        return Effect.void
      },
      { concurrency: 1, discard: true },
    )

    const proposalsById = new Map<string, InstantMessageProposalRecordType>()
    const proposalActorPositions = new Set<string>()
    const decodedProposalMessages = new Map<string, Message>()
    yield* Effect.forEach(
      dataset.messageProposals,
      proposal =>
        Effect.gen(function* () {
          yield* sessionForRecord(sessionsById, proposal, 'MessageProposal')
          const actorPosition = `${proposal.sessionId}:${proposal.actorId}:${proposal.clientId}:${proposal.actorSequence}`
          if (
            proposal.id !== proposal.proposalId ||
            proposal.proposalId !== proposal.occurrenceId ||
            !isInstantMessageProposalKindValid(proposal) ||
            proposalsById.has(proposal.proposalId) ||
            proposalActorPositions.has(actorPosition)
          ) {
            return yield* Effect.fail(
              migrationError('MessageProposal', 'DuplicateOccurrence'),
            )
          }
          const decoded = yield* migrationCodec
            .decodeProposed(proposal)
            .pipe(
              Effect.mapError(() =>
                migrationError('MessageProposal', 'InvalidLegacyMessage'),
              ),
            )
          proposalsById.set(proposal.proposalId, proposal)
          proposalActorPositions.add(actorPosition)
          decodedProposalMessages.set(proposal.proposalId, decoded.message)
        }),
      { concurrency: 1, discard: true },
    )

    const resolutionProposalIds = new Set<string>()
    yield* Effect.forEach(
      dataset.messageProposalResolutions,
      resolution =>
        Effect.gen(function* () {
          const session = yield* sessionForRecord(
            sessionsById,
            resolution,
            'MessageProposalResolution',
          )
          const maybeProposal = Option.fromNullishOr(
            proposalsById.get(resolution.proposalId),
          )
          if (Option.isNone(maybeProposal)) {
            return yield* Effect.fail(
              migrationError(
                'MessageProposalResolution',
                'MissingResolutionProposal',
              ),
            )
          }
          const proposal = maybeProposal.value
          if (
            resolutionProposalIds.has(resolution.proposalId) ||
            resolution.id !== resolution.proposalId ||
            resolution.rejectingProcessorId !== session.authorityProcessorId ||
            resolution.actorId !== proposal.actorId ||
            resolution.actorSequence !== proposal.actorSequence ||
            resolution.clientId !== proposal.clientId ||
            resolution.programId !== proposal.programId ||
            resolution.programVersion !== proposal.programVersion ||
            resolution.protocolVersion !== proposal.protocolVersion ||
            resolution.sessionId !== proposal.sessionId ||
            resolution.subjectId !== proposal.subjectId
          ) {
            return yield* Effect.fail(
              migrationError(
                'MessageProposalResolution',
                'ResolutionProposalConflict',
              ),
            )
          }
          resolutionProposalIds.add(resolution.proposalId)
        }),
      { concurrency: 1, discard: true },
    )

    const acceptedByOccurrenceId = new Map<
      string,
      InstantAcceptedMessageOccurrenceRecordType
    >()
    const acceptedByProposalId = new Map<
      string,
      InstantAcceptedMessageOccurrenceRecordType
    >()
    const decodedAcceptedMessages = new Map<string, Message>()
    const nextAcceptedSequenceBySession = new Map<string, number>()
    const previousPolicyGenerationBySession = new Map<string, number>()
    const policiesBySessionGeneration = new Map<
      string,
      Synchronization.SessionPolicy
    >()
    const acceptedActorPositions = new Set<string>()
    const messageIdempotencyKeys = new Set<string>()
    const effectIdempotencyKeys = new Set<string>()
    yield* Effect.forEach(
      Array.sort(dataset.acceptedOccurrences, completeAcceptedOccurrenceOrder),
      occurrence =>
        Effect.gen(function* () {
          const session = yield* sessionForRecord(
            sessionsById,
            occurrence,
            'AcceptedOccurrence',
          )
          const nextAcceptedSequence =
            nextAcceptedSequenceBySession.get(occurrence.sessionId) ?? 1
          const previousPolicyGeneration =
            previousPolicyGenerationBySession.get(occurrence.sessionId) ?? 0
          const policyKey = `${occurrence.sessionId}:${occurrence.policyGeneration}`
          const maybePolicy = Option.fromNullishOr(
            policiesBySessionGeneration.get(policyKey),
          )
          const actorPosition = `${occurrence.sessionId}:${occurrence.actorId}:${occurrence.clientId}:${occurrence.actorSequence}`
          if (
            Option.isSome(
              instantAcceptedMessageOccurrenceValidationIssue(occurrence),
            ) ||
            occurrence.acceptedSequence !== nextAcceptedSequence ||
            occurrence.acceptingProcessorId !== session.authorityProcessorId ||
            occurrence.policyGeneration < previousPolicyGeneration ||
            occurrence.policyGeneration > session.sessionPolicy.generation ||
            (Option.isSome(maybePolicy) &&
              !sessionPolicyEquivalence(
                maybePolicy.value,
                occurrence.sessionPolicy,
              )) ||
            acceptedByOccurrenceId.has(occurrence.occurrenceId) ||
            acceptedByProposalId.has(occurrence.proposalId) ||
            acceptedActorPositions.has(actorPosition)
          ) {
            return yield* Effect.fail(
              migrationError('AcceptedOccurrence', 'DuplicateOccurrence'),
            )
          }
          if (resolutionProposalIds.has(occurrence.proposalId)) {
            return yield* Effect.fail(
              migrationError('AcceptedOccurrence', 'AcceptedAndRejected'),
            )
          }
          const maybeProposal = Option.fromNullishOr(
            proposalsById.get(occurrence.proposalId),
          )
          if (Option.isNone(maybeProposal)) {
            return yield* Effect.fail(
              migrationError('AcceptedOccurrence', 'MissingAcceptedProposal'),
            )
          }
          if (!matchesAcceptedProposal(occurrence, maybeProposal.value)) {
            return yield* Effect.fail(
              migrationError('AcceptedOccurrence', 'AcceptedProposalConflict'),
            )
          }
          const maybeMessageIdempotencyKey = Option.fromNullishOr(
            occurrence.messageIdempotencyKey,
          )
          if (
            Option.isSome(maybeMessageIdempotencyKey) &&
            messageIdempotencyKeys.has(maybeMessageIdempotencyKey.value)
          ) {
            return yield* Effect.fail(
              migrationError('AcceptedOccurrence', 'DuplicateOccurrence'),
            )
          }
          const maybeEffectIdempotencyKey = Option.fromNullishOr(
            occurrence.effectIdempotencyKey,
          )
          if (
            Option.isSome(maybeEffectIdempotencyKey) &&
            effectIdempotencyKeys.has(maybeEffectIdempotencyKey.value)
          ) {
            return yield* Effect.fail(
              migrationError('AcceptedOccurrence', 'DuplicateOccurrence'),
            )
          }
          const decoded = yield* migrationCodec
            .decodeAccepted(occurrence)
            .pipe(
              Effect.mapError(() =>
                migrationError('AcceptedOccurrence', 'InvalidLegacyMessage'),
              ),
            )
          const routing = yield* (() => {
            if (occurrence.proposalKind === 'Message') {
              return routingForMessage(
                decoded.message,
                occurrence.sessionPolicy,
                occurrence.originatingProcessorId,
                'AcceptedOccurrence',
              )
            }
            if (occurrence.causationId === null) {
              return Effect.fail(
                migrationError('AcceptedOccurrence', 'MissingCausalOccurrence'),
              )
            }
            const maybeCausalOccurrence = Option.fromNullishOr(
              acceptedByOccurrenceId.get(occurrence.causationId),
            )
            if (
              Option.isNone(maybeCausalOccurrence) ||
              maybeCausalOccurrence.value.sessionId !== occurrence.sessionId ||
              maybeCausalOccurrence.value.subjectId !== occurrence.subjectId
            ) {
              return Effect.fail(
                migrationError('AcceptedOccurrence', 'MissingCausalOccurrence'),
              )
            }
            return Effect.succeed(
              routingFromOccurrence(maybeCausalOccurrence.value),
            )
          })()
          yield* validateRoutingClaims(
            occurrence,
            occurrence.audience,
            routing,
            'AcceptedOccurrence',
          )
          if (
            !sessionPolicyEquivalence(
              occurrence.sessionPolicy,
              routing.sessionPolicy,
            )
          ) {
            return yield* Effect.fail(
              migrationError('AcceptedOccurrence', 'MalformedOrPartialV2'),
            )
          }
          acceptedByOccurrenceId.set(occurrence.occurrenceId, occurrence)
          acceptedByProposalId.set(occurrence.proposalId, occurrence)
          decodedAcceptedMessages.set(occurrence.occurrenceId, decoded.message)
          nextAcceptedSequenceBySession.set(
            occurrence.sessionId,
            nextAcceptedSequence + 1,
          )
          previousPolicyGenerationBySession.set(
            occurrence.sessionId,
            occurrence.policyGeneration,
          )
          policiesBySessionGeneration.set(policyKey, occurrence.sessionPolicy)
          acceptedActorPositions.add(actorPosition)
          if (Option.isSome(maybeMessageIdempotencyKey)) {
            messageIdempotencyKeys.add(maybeMessageIdempotencyKey.value)
          }
          if (Option.isSome(maybeEffectIdempotencyKey)) {
            effectIdempotencyKeys.add(maybeEffectIdempotencyKey.value)
          }
        }),
      { concurrency: 1, discard: true },
    )

    yield* Effect.forEach(
      dataset.messageProposals,
      proposal =>
        Effect.gen(function* () {
          const session = yield* sessionForRecord(
            sessionsById,
            proposal,
            'MessageProposal',
          )
          const message = Option.getOrThrow(
            Option.fromNullishOr(
              decodedProposalMessages.get(proposal.proposalId),
            ),
          )
          const routing = yield* (() => {
            if (proposal.proposalKind === 'EffectResult') {
              const maybeCausalOccurrence = Option.fromNullishOr(
                proposal.causationOccurrenceId === null
                  ? undefined
                  : acceptedByOccurrenceId.get(proposal.causationOccurrenceId),
              )
              if (
                Option.isNone(maybeCausalOccurrence) ||
                maybeCausalOccurrence.value.sessionId !== proposal.sessionId ||
                maybeCausalOccurrence.value.subjectId !== proposal.subjectId
              ) {
                return Effect.fail(
                  migrationError('MessageProposal', 'MissingCausalOccurrence'),
                )
              }
              return Effect.succeed(
                routingFromOccurrence(maybeCausalOccurrence.value),
              )
            }
            const maybeAccepted = Option.fromNullishOr(
              acceptedByProposalId.get(proposal.proposalId),
            )
            const sessionPolicy = Option.isSome(maybeAccepted)
              ? maybeAccepted.value.sessionPolicy
              : session.sessionPolicy
            return routingForMessage(
              message,
              sessionPolicy,
              proposal.originatingProcessorId,
              'MessageProposal',
            )
          })()
          yield* validateRoutingClaims(
            proposal,
            proposal.proposedAudience,
            routing,
            'MessageProposal',
          )
        }),
      { concurrency: 1, discard: true },
    )

    const requestsById = new Map<string, InstantEffectRequestRecordType>()
    yield* Effect.forEach(
      dataset.effectRequests,
      request =>
        Effect.gen(function* () {
          const session = yield* sessionForRecord(
            sessionsById,
            request,
            'EffectRequest',
          )
          const maybeCausalOccurrence = Option.fromNullishOr(
            acceptedByOccurrenceId.get(request.causalOccurrenceId),
          )
          const maybeCausalMessage = Option.fromNullishOr(
            decodedAcceptedMessages.get(request.causalOccurrenceId),
          )
          if (
            request.id !== request.requestId ||
            requestsById.has(request.requestId) ||
            Option.isNone(maybeCausalOccurrence) ||
            Option.isNone(maybeCausalMessage)
          ) {
            return yield* Effect.fail(
              migrationError('EffectRequest', 'MissingCausalOccurrence'),
            )
          }
          const causalOccurrence = maybeCausalOccurrence.value
          const causalMessage = maybeCausalMessage.value
          if (
            causalMessage._tag !== 'RequestedEffect' ||
            causalMessage.requestId !== request.requestId
          ) {
            return yield* Effect.fail(
              migrationError('EffectRequest', 'MissingCausalOccurrence'),
            )
          }
          const expectedRequest = yield* Effect.try({
            try: () =>
              makeEffectRequestRecord(
                session,
                causalMessage,
                {
                  causalAudience: causalOccurrence.audience,
                  causalMessageCategory: causalOccurrence.messageCategory,
                  causalOccurrenceId: causalOccurrence.occurrenceId,
                  causalPolicyGeneration: causalOccurrence.policyGeneration,
                  ingressProcessorId: causalOccurrence.acceptingProcessorId,
                  originClientId: causalOccurrence.clientId,
                  originatingProcessorId:
                    causalOccurrence.originatingProcessorId,
                },
                request.requestedAtMs,
              ),
            catch: () =>
              migrationError('EffectRequest', 'MalformedOrPartialV2'),
          })
          if (!effectRequestEquivalence(request, expectedRequest)) {
            return yield* Effect.fail(
              migrationError('EffectRequest', 'MalformedOrPartialV2'),
            )
          }
          requestsById.set(request.requestId, request)
        }),
      { concurrency: 1, discard: true },
    )

    const placementPositionKeys = new Set<string>()
    yield* Effect.forEach(
      dataset.effectPlacements,
      placement =>
        Effect.gen(function* () {
          yield* sessionForRecord(sessionsById, placement, 'EffectPlacement')
          const maybeRequest = Option.fromNullishOr(
            requestsById.get(placement.requestId),
          )
          if (
            Option.isNone(maybeRequest) ||
            placementPositionKeys.has(placement.positionKey) ||
            placement.programId !== maybeRequest.value.programId ||
            placement.programVersion !== maybeRequest.value.programVersion ||
            placement.protocolVersion !== maybeRequest.value.protocolVersion ||
            placement.sessionId !== maybeRequest.value.sessionId ||
            placement.subjectId !== maybeRequest.value.subjectId
          ) {
            return yield* Effect.fail(
              migrationError('EffectPlacement', 'ScopeMismatch'),
            )
          }
          placementPositionKeys.add(placement.positionKey)
        }),
      { concurrency: 1, discard: true },
    )

    yield* Effect.forEach(
      Array.filter(
        dataset.acceptedOccurrences,
        occurrence => occurrence.proposalKind === 'EffectResult',
      ),
      occurrence => {
        const maybeRequest = Option.fromNullishOr(
          occurrence.effectRequestId === null
            ? undefined
            : requestsById.get(occurrence.effectRequestId),
        )
        const maybePlacement = Array.findFirst(
          dataset.effectPlacements,
          placement =>
            placement.requestId === occurrence.effectRequestId &&
            placement.assignmentGeneration ===
              occurrence.effectAssignmentGeneration &&
            placement.cancellationGeneration ===
              occurrence.effectCancellationGeneration,
        )
        const isPermitted =
          Option.isSome(maybeRequest) &&
          Array.some(
            maybeRequest.value.permittedResultEvents,
            permitted =>
              permitted.eventId === occurrence.eventId &&
              occurrence.eventVersion >= permitted.minimumVersion &&
              occurrence.eventVersion <= permitted.maximumVersion,
          )
        if (
          Option.isNone(maybeRequest) ||
          Option.isNone(maybePlacement) ||
          (maybePlacement.value.placementStatus !== 'AssignedPreferred' &&
            maybePlacement.value.placementStatus !== 'AssignedFallback') ||
          maybePlacement.value.assignedProcessorId !==
            occurrence.executorProcessorId ||
          occurrence.originatingProcessorId !==
            occurrence.executorProcessorId ||
          maybeRequest.value.idempotencyKey !==
            occurrence.effectIdempotencyKey ||
          maybeRequest.value.causalOccurrenceId !== occurrence.causationId ||
          !isPermitted
        ) {
          return Effect.fail(
            migrationError('AcceptedOccurrence', 'MalformedOrPartialV2'),
          )
        } else {
          return Effect.void
        }
      },
      { concurrency: 1, discard: true },
    )

    yield* Effect.forEach(
      dataset.projectionCheckpoints,
      checkpoint =>
        Effect.gen(function* () {
          yield* sessionForRecord(
            sessionsById,
            checkpoint,
            'ProjectionCheckpoint',
          )
          const maximumAcceptedSequence =
            (nextAcceptedSequenceBySession.get(checkpoint.sessionId) ?? 1) - 1
          if (
            checkpoint.id !== checkpoint.checkpointId ||
            checkpoint.throughAcceptedSequence < 0 ||
            checkpoint.throughAcceptedSequence > maximumAcceptedSequence
          ) {
            return yield* Effect.fail(
              migrationError('ProjectionCheckpoint', 'ScopeMismatch'),
            )
          }
        }),
      { concurrency: 1, discard: true },
    )
  })

/** Plans exact legacy v1 upgrades while passing complete current v2 rows through. */
export const planLegacyRoutingMigration = (
  input: LegacyRoutingMigrationInput,
): Effect.Effect<LegacyRoutingMigrationPlan, LegacyRoutingMigrationError> =>
  Effect.gen(function* () {
    const programSessions = yield* decodeProgramSessions(input.programSessions)
    const storedAcceptedOccurrences = Array.sort(
      yield* Effect.forEach(
        input.acceptedOccurrences,
        decodeStoredAcceptedOccurrence,
        { concurrency: 1 },
      ),
      acceptedOccurrenceOrder,
    )
    const acceptedByCausalKey = new Map<
      string,
      InstantAcceptedMessageOccurrenceRecordType
    >()
    const maybeAcceptedUpdates = yield* Effect.forEach(
      storedAcceptedOccurrences,
      stored =>
        Effect.gen(function* () {
          const key = makeCausalKey(stored.record)
          if (acceptedByCausalKey.has(key)) {
            return yield* Effect.fail(
              migrationError('AcceptedOccurrence', 'DuplicateOccurrence'),
            )
          }
          if (stored._tag === 'Current') {
            acceptedByCausalKey.set(key, stored.record)
            return Option.none<InstantAcceptedMessageOccurrenceRecordType>()
          }
          const legacy = stored.record
          const routing = yield* (() => {
            if (legacy.proposalKind === 'EffectResult') {
              return routingFromCausalOccurrence(
                acceptedByCausalKey,
                {
                  ...legacy,
                  causationOccurrenceId: legacy.causationId,
                },
                'AcceptedOccurrence',
              )
            }
            return Effect.flatMap(
              decodeLegacyMessage(legacy, 'AcceptedOccurrence'),
              message =>
                routingForLegacyMessage(
                  message,
                  legacy.originatingProcessorId,
                  'AcceptedOccurrence',
                ),
            )
          })()
          const occurrence = yield* makeAcceptedOccurrence(legacy, routing)
          yield* migrationCodec
            .decodeAccepted(occurrence)
            .pipe(
              Effect.mapError(() =>
                migrationError('AcceptedOccurrence', 'InvalidLegacyMessage'),
              ),
            )
          acceptedByCausalKey.set(key, occurrence)
          return Option.some(occurrence)
        }),
      { concurrency: 1 },
    )
    const acceptedOccurrences = Array.getSomes(maybeAcceptedUpdates)
    const completeAcceptedOccurrences = Array.fromIterable(
      acceptedByCausalKey.values(),
    )

    const storedMessageProposals = yield* Effect.forEach(
      input.messageProposals,
      decodeStoredMessageProposal,
      { concurrency: 1 },
    )
    const maybeProposalUpdates = yield* Effect.forEach(
      storedMessageProposals,
      stored => {
        if (stored._tag === 'Current') {
          return Effect.succeed(Option.none<InstantMessageProposalRecordType>())
        }
        const legacy = stored.record
        return Effect.gen(function* () {
          const routing = yield* (() => {
            if (legacy.proposalKind === 'EffectResult') {
              return routingFromCausalOccurrence(
                acceptedByCausalKey,
                legacy,
                'MessageProposal',
              )
            }
            return Effect.flatMap(
              decodeLegacyMessage(legacy, 'MessageProposal'),
              message =>
                routingForLegacyMessage(
                  message,
                  legacy.originatingProcessorId,
                  'MessageProposal',
                ),
            )
          })()
          const proposal = yield* makeMessageProposal(legacy, routing)
          yield* migrationCodec
            .decodeProposed(proposal)
            .pipe(
              Effect.mapError(() =>
                migrationError('MessageProposal', 'InvalidLegacyMessage'),
              ),
            )
          return Option.some(proposal)
        })
      },
      { concurrency: 1 },
    )
    const messageProposals = Array.getSomes(maybeProposalUpdates)
    const resolutionSourceProposals = [
      ...Array.getSomes(
        Array.map(storedMessageProposals, stored =>
          stored._tag === 'Current'
            ? Option.some(stored.record)
            : Option.none<InstantMessageProposalRecordType>(),
        ),
      ),
      ...messageProposals,
    ]

    const storedEffectRequests = yield* Effect.forEach(
      input.effectRequests,
      decodeStoredEffectRequest,
      { concurrency: 1 },
    )
    const maybeEffectRequestUpdates = yield* Effect.forEach(
      storedEffectRequests,
      stored => {
        if (stored._tag === 'Current') {
          return Effect.succeed(Option.none<InstantEffectRequestRecordType>())
        }
        return Effect.gen(function* () {
          const routing = yield* routingFromCausalOccurrence(
            acceptedByCausalKey,
            {
              ...stored.record,
              causationOccurrenceId: stored.record.causalOccurrenceId,
            },
            'EffectRequest',
          )
          return Option.some(yield* makeEffectRequest(stored.record, routing))
        })
      },
      { concurrency: 1 },
    )
    const effectRequests = Array.getSomes(maybeEffectRequestUpdates)
    const completeEffectRequests = [
      ...Array.getSomes(
        Array.map(storedEffectRequests, stored =>
          stored._tag === 'Current'
            ? Option.some(stored.record)
            : Option.none<InstantEffectRequestRecordType>(),
        ),
      ),
      ...effectRequests,
    ]

    const storedMessageProposalResolutions = yield* Effect.forEach(
      input.messageProposalResolutions,
      decodeStoredMessageProposalResolution,
      { concurrency: 1 },
    )
    const messageProposalResolutions = Array.getSomes(
      yield* Effect.forEach(
        storedMessageProposalResolutions,
        stored => {
          if (stored._tag === 'Current') {
            return Effect.succeed(
              Option.none<InstantMessageProposalResolutionRecordType>(),
            )
          }
          return Effect.gen(function* () {
            const proposal = yield* resolutionProposal(
              stored.record,
              resolutionSourceProposals,
            )
            return Option.some(
              yield* makeMessageProposalResolution(stored.record, proposal),
            )
          })
        },
        { concurrency: 1 },
      ),
    )
    const completeMessageProposalResolutions = [
      ...Array.getSomes(
        Array.map(storedMessageProposalResolutions, stored =>
          stored._tag === 'Current'
            ? Option.some(stored.record)
            : Option.none<InstantMessageProposalResolutionRecordType>(),
        ),
      ),
      ...messageProposalResolutions,
    ]

    const storedEffectPlacements = yield* Effect.forEach(
      input.effectPlacements,
      decodeStoredEffectPlacement,
      { concurrency: 1 },
    )
    const effectPlacements = Array.getSomes(
      yield* Effect.forEach(
        storedEffectPlacements,
        stored => {
          if (stored._tag === 'Current') {
            return Effect.succeed(
              Option.none<InstantEffectPlacementRecordType>(),
            )
          }
          return Effect.map(makeEffectPlacement(stored.record), Option.some)
        },
        { concurrency: 1 },
      ),
    )
    const completeEffectPlacements = [
      ...Array.getSomes(
        Array.map(storedEffectPlacements, stored =>
          stored._tag === 'Current'
            ? Option.some(stored.record)
            : Option.none<InstantEffectPlacementRecordType>(),
        ),
      ),
      ...effectPlacements,
    ]

    const storedProjectionCheckpoints = yield* Effect.forEach(
      input.projectionCheckpoints,
      decodeStoredProjectionCheckpoint,
      { concurrency: 1 },
    )
    const projectionCheckpoints = Array.getSomes(
      yield* Effect.forEach(
        storedProjectionCheckpoints,
        stored => {
          if (stored._tag === 'Current') {
            return Effect.succeed(
              Option.none<InstantProjectionCheckpointRecordType>(),
            )
          }
          return Effect.map(
            makeProjectionCheckpoint(stored.record),
            Option.some,
          )
        },
        { concurrency: 1 },
      ),
    )
    const completeProjectionCheckpoints = [
      ...Array.getSomes(
        Array.map(storedProjectionCheckpoints, stored =>
          stored._tag === 'Current'
            ? Option.some(stored.record)
            : Option.none<InstantProjectionCheckpointRecordType>(),
        ),
      ),
      ...projectionCheckpoints,
    ]

    yield* validateCompleteMigrationDataset({
      acceptedOccurrences: completeAcceptedOccurrences,
      effectPlacements: completeEffectPlacements,
      effectRequests: completeEffectRequests,
      messageProposalResolutions: completeMessageProposalResolutions,
      messageProposals: resolutionSourceProposals,
      programSessions,
      projectionCheckpoints: completeProjectionCheckpoints,
    })

    return {
      acceptedOccurrences,
      counts: LegacyRoutingMigrationCounts.make({
        acceptedOccurrences: Array.length(acceptedOccurrences),
        effectPlacements: Array.length(effectPlacements),
        effectRequests: Array.length(effectRequests),
        messageProposalResolutions: Array.length(messageProposalResolutions),
        messageProposals: Array.length(messageProposals),
        projectionCheckpoints: Array.length(projectionCheckpoints),
      }),
      effectPlacements,
      effectRequests,
      messageProposalResolutions,
      messageProposals,
      projectionCheckpoints,
    }
  })

const makeMigrationTransactions = (
  database: HeadlessInstantDatabase,
  plan: LegacyRoutingMigrationPlan,
) => [
  ...Array.map(plan.acceptedOccurrences, occurrence => {
    const entity = database.tx.foldkitAcceptedMessageOccurrences[occurrence.id]
    if (entity === undefined) {
      throw migrationError('AcceptedOccurrence', 'DatabaseWrite')
    }
    return entity.update(
      {
        audience: occurrence.audience,
        messageCategory: occurrence.messageCategory,
        messageIdempotencyKey: occurrence.messageIdempotencyKey,
        policyGeneration: occurrence.policyGeneration,
        protocolVersion: occurrence.protocolVersion,
        sessionPolicy: occurrence.sessionPolicy,
      },
      { upsert: false },
    )
  }),
  ...Array.map(plan.messageProposals, proposal => {
    const entity = database.tx.foldkitMessageProposals[proposal.id]
    if (entity === undefined) {
      throw migrationError('MessageProposal', 'DatabaseWrite')
    }
    return entity.update(
      {
        messageCategory: proposal.messageCategory,
        messageIdempotencyKey: proposal.messageIdempotencyKey,
        policyGeneration: proposal.policyGeneration,
        protocolVersion: proposal.protocolVersion,
        proposedAudience: proposal.proposedAudience,
      },
      { upsert: false },
    )
  }),
  ...Array.map(plan.effectRequests, request => {
    const entity = database.tx.foldkitEffectRequests[request.id]
    if (entity === undefined) {
      throw migrationError('EffectRequest', 'DatabaseWrite')
    }
    return entity.update(
      {
        causalAudience: request.causalAudience,
        causalMessageCategory: request.causalMessageCategory,
        causalPolicyGeneration: request.causalPolicyGeneration,
        protocolVersion: request.protocolVersion,
      },
      { upsert: false },
    )
  }),
  ...Array.map(plan.messageProposalResolutions, resolution => {
    const entity = database.tx.foldkitMessageProposalResolutions[resolution.id]
    if (entity === undefined) {
      throw migrationError('MessageProposalResolution', 'DatabaseWrite')
    }
    return entity.update(
      {
        actorId: resolution.actorId,
        actorSequence: resolution.actorSequence,
        clientId: resolution.clientId,
        protocolVersion: resolution.protocolVersion,
      },
      { upsert: false },
    )
  }),
  ...Array.map(plan.effectPlacements, placement => {
    const entity = database.tx.foldkitEffectPlacements[placement.id]
    if (entity === undefined) {
      throw migrationError('EffectPlacement', 'DatabaseWrite')
    }
    return entity.update(
      { protocolVersion: placement.protocolVersion },
      { upsert: false },
    )
  }),
  ...Array.map(plan.projectionCheckpoints, checkpoint => {
    const entity = database.tx.foldkitProjectionCheckpoints[checkpoint.id]
    if (entity === undefined) {
      throw migrationError('ProjectionCheckpoint', 'DatabaseWrite')
    }
    return entity.update(
      { protocolVersion: checkpoint.protocolVersion },
      { upsert: false },
    )
  }),
]

/**
 * Completes the trusted legacy routing upgrade before any Processor starts.
 * Every writer for these Program tables must remain stopped until this Effect
 * completes because the preflight read and batched updates are not one database
 * transaction.
 */
export const runLegacyRoutingMigration = (
  database: HeadlessInstantDatabase,
): Effect.Effect<LegacyRoutingMigrationCounts, LegacyRoutingMigrationError> =>
  Effect.gen(function* () {
    const records = yield* Effect.tryPromise({
      try: () =>
        database.query({
          foldkitAcceptedMessageOccurrences: {
            $: {
              order: { acceptedSequence: 'asc' },
              where: { and: [{ programId }, { programVersion }] },
            },
          },
          foldkitEffectPlacements: {
            $: { where: { and: [{ programId }, { programVersion }] } },
          },
          foldkitEffectRequests: {
            $: { where: { and: [{ programId }, { programVersion }] } },
          },
          foldkitMessageProposalResolutions: {
            $: { where: { and: [{ programId }, { programVersion }] } },
          },
          foldkitMessageProposals: {
            $: { where: { and: [{ programId }, { programVersion }] } },
          },
          foldkitProgramSessions: {
            $: { where: { and: [{ programId }, { programVersion }] } },
          },
          foldkitProjectionCheckpoints: {
            $: { where: { and: [{ programId }, { programVersion }] } },
          },
        }),
      catch: () => migrationError('Preflight', 'DatabaseRead'),
    })
    const plan = yield* planLegacyRoutingMigration({
      acceptedOccurrences: records.foldkitAcceptedMessageOccurrences,
      effectPlacements: records.foldkitEffectPlacements,
      effectRequests: records.foldkitEffectRequests,
      messageProposalResolutions: records.foldkitMessageProposalResolutions,
      messageProposals: records.foldkitMessageProposals,
      programSessions: records.foldkitProgramSessions,
      projectionCheckpoints: records.foldkitProjectionCheckpoints,
    })
    const transactions = yield* Effect.try({
      try: () => makeMigrationTransactions(database, plan),
      catch: () => migrationError('Preflight', 'DatabaseWrite'),
    })
    yield* Effect.forEach(
      Array.chunksOf(transactions, migrationBatchSize),
      batch =>
        Effect.tryPromise({
          try: () => database.transact([...batch]),
          catch: () => migrationError('Preflight', 'DatabaseWrite'),
        }),
      { concurrency: 1, discard: true },
    )
    return plan.counts
  })
