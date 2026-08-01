import {
  Array,
  Data,
  Effect,
  HashMap,
  HashSet,
  Match as M,
  Option,
  Order,
  Schema as S,
  Stream,
  SynchronizedRef,
  Tuple,
} from 'effect'
import { Processor, Synchronization } from 'foldkit'

import { makeAcceptedOccurrencePositionKey } from '../acceptedOccurrenceCursor/index.js'
import type {
  ProgramAuthorityStoreService,
  ProgramStoreError,
} from '../programStore/index.js'
import {
  InstantAcceptedMessageOccurrenceRecord,
  type InstantAcceptedMessageOccurrenceRecord as InstantAcceptedMessageOccurrenceRecordType,
  type InstantAcceptedMessageOccurrenceValidationIssue,
  InstantEffectPlacementRecord,
  type InstantEffectPlacementRecord as InstantEffectPlacementRecordType,
  type InstantEffectRequestRecord,
  InstantMessageProposalRecord,
  InstantMessageProposalRejectionReason,
  InstantMessageProposalResolutionRecord,
  type InstantMessageProposalResolutionRecord as InstantMessageProposalResolutionRecordType,
  type InstantProgramSessionRecord,
  instantAcceptedMessageOccurrenceValidationIssue,
  isInstantMessageProposalKindValid,
  makeInstantEffectPlacementPositionKey,
} from '../schema/index.js'

/** The portable admission-sequencing role. Advertising it grants no store authority. */
export const AdmissionSequencerCapability = Processor.Capability.make({
  id: Processor.CapabilityId.make(['Foldkit', 'Admission', 'Sequence']),
  version: 2,
})

/** The portable placement requirement for the admission sequencer role. */
export const AdmissionSequencerCapabilityRequirement =
  Processor.CapabilityRequirement.make({
    id: AdmissionSequencerCapability.id,
    minimumVersion: 2,
  })

const acceptedOccurrenceJson = S.fromJsonString(
  InstantAcceptedMessageOccurrenceRecord,
)
const encodeAcceptedOccurrence = S.encodeSync(acceptedOccurrenceJson)
const effectPlacementJson = S.fromJsonString(InstantEffectPlacementRecord)
const encodeEffectPlacement = S.encodeSync(effectPlacementJson)
const audienceJson = S.fromJsonString(Synchronization.Audience)
const encodeAudience = S.encodeSync(audienceJson)
const sessionPolicyJson = S.fromJsonString(Synchronization.SessionPolicy)
const encodeSessionPolicy = S.encodeSync(sessionPolicyJson)
const actorSequenceStreamJson = S.fromJsonString(S.Tuple([S.String, S.String]))
const encodeActorSequenceStream = S.encodeSync(actorSequenceStreamJson)

const proposalOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (proposal: InstantMessageProposalRecord) => proposal.actorSequence,
  ),
  Order.mapInput(
    Order.String,
    (proposal: InstantMessageProposalRecord) => proposal.proposalId,
  ),
)

const acceptedOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (occurrence: InstantAcceptedMessageOccurrenceRecordType) =>
      occurrence.acceptedSequence,
  ),
  Order.mapInput(
    Order.String,
    (occurrence: InstantAcceptedMessageOccurrenceRecordType) =>
      occurrence.occurrenceId,
  ),
)

type AuthorityState = Readonly<{
  actorSequenceHighWaterByStream: HashMap.HashMap<string, number>
  acceptedByEffectIdempotencyKey: HashMap.HashMap<
    string,
    InstantAcceptedMessageOccurrenceRecordType
  >
  acceptedByMessageIdempotencyKey: HashMap.HashMap<
    string,
    InstantAcceptedMessageOccurrenceRecordType
  >
  acceptedByOccurrenceId: HashMap.HashMap<
    string,
    InstantAcceptedMessageOccurrenceRecordType
  >
  acceptedByProposalId: HashMap.HashMap<
    string,
    InstantAcceptedMessageOccurrenceRecordType
  >
  acceptedBySequence: HashMap.HashMap<
    number,
    InstantAcceptedMessageOccurrenceRecordType
  >
  effectPlacementsByRequestId: HashMap.HashMap<
    string,
    InstantEffectPlacementRecordType
  >
  effectPlacementsByPositionKey: HashMap.HashMap<
    string,
    InstantEffectPlacementRecordType
  >
  effectRequestsById: HashMap.HashMap<string, InstantEffectRequestRecord>
  maximumAcceptedPolicyGeneration: number
  maybeCurrentSession: Option.Option<InstantProgramSessionRecord>
  nextAcceptedSequence: number
  sessionPolicyByGeneration: HashMap.HashMap<
    number,
    Synchronization.SessionPolicy
  >
}>

/** Accepted and rejected terminal evidence cannot exist for one proposal. */
export class AdmissionSequencerTerminalConflict extends Data.TaggedError(
  'AdmissionSequencerTerminalConflict',
)<{
  readonly proposalId: string
}> {}

/** A terminal resolution did not join exactly one matching immutable proposal. */
export class AdmissionSequencerResolutionProposalMismatch extends Data.TaggedError(
  'AdmissionSequencerResolutionProposalMismatch',
)<{
  readonly proposalId: string
  readonly reason:
    | 'ActorId'
    | 'ActorSequence'
    | 'ClientId'
    | 'DuplicateProposal'
    | 'DuplicateResolution'
    | 'MissingProposal'
    | 'ProposalIdentity'
}> {}

/** An authority received data outside its authenticated Program session. */
export class AcceptanceAuthorityScopeMismatch extends Data.TaggedError(
  'AcceptanceAuthorityScopeMismatch',
)<{
  readonly actualProgramId: string
  readonly actualProgramVersion: number
  readonly actualProtocolVersion: number
  readonly actualSessionId: string
  readonly actualSubjectId: string
  readonly expectedProgramId: string
  readonly expectedProgramVersion: number
  readonly expectedProtocolVersion: number
  readonly expectedSessionId: string
  readonly expectedSubjectId: string
}> {}

/** A revoked Program session cannot admit additional Message occurrences. */
export class AcceptanceAuthoritySessionRevoked extends Data.TaggedError(
  'AcceptanceAuthoritySessionRevoked',
)<{
  readonly sessionId: string
}> {}

/** The configured Program session is not currently visible to the authority. */
export class AcceptanceAuthoritySessionMissing extends Data.TaggedError(
  'AcceptanceAuthoritySessionMissing',
)<{
  readonly sessionId: string
}> {}

/** The current Program session fenced this Processor out as its authority. */
export class AcceptanceAuthorityChanged extends Data.TaggedError(
  'AcceptanceAuthorityChanged',
)<{
  readonly actualProcessorId: string
  readonly expectedProcessorId: string
  readonly sessionId: string
}> {}

/** The persisted session policy changed after this sequencer was configured. */
export class AcceptanceAuthoritySessionPolicyChanged extends Data.TaggedError(
  'AcceptanceAuthoritySessionPolicyChanged',
)<{
  readonly actualPolicy: Synchronization.SessionPolicy
  readonly expectedPolicy: Synchronization.SessionPolicy
  readonly sessionId: string
}> {}

/** Accepted history was not produced by the session's configured single authority. */
export class AcceptanceAuthorityProcessorMismatch extends Data.TaggedError(
  'AcceptanceAuthorityProcessorMismatch',
)<{
  readonly actualProcessorId: string
  readonly expectedProcessorId: string
  readonly occurrenceId: string
}> {}

/** Accepted history contained a gap or a reused sequence position. */
export class AcceptanceAuthoritySequenceConflict extends Data.TaggedError(
  'AcceptanceAuthoritySequenceConflict',
)<{
  readonly acceptedSequence: number
  readonly expectedAcceptedSequence: number
  readonly occurrenceId: string
}> {}

/** An occurrence or proposal identity was reused with different contents. */
export class AcceptanceAuthorityIdentityConflict extends Data.TaggedError(
  'AcceptanceAuthorityIdentityConflict',
)<{
  readonly identity: string
  readonly identityKind:
    | 'ActorSequence'
    | 'EffectIdempotencyKey'
    | 'MessageIdempotencyKey'
    | 'Occurrence'
    | 'Proposal'
}> {}

/** An accepted occurrence violated the semantic protocol-v2 row contract. */
export class AcceptanceAuthorityAcceptedOccurrenceInvalid extends Data.TaggedError(
  'AcceptanceAuthorityAcceptedOccurrenceInvalid',
)<{
  readonly occurrenceId: string
  readonly reason: InstantAcceptedMessageOccurrenceValidationIssue
}> {}

/** An effect result did not come from its authority-assigned Processor. */
export class AcceptanceAuthorityEffectResultMismatch extends Data.TaggedError(
  'AcceptanceAuthorityEffectResultMismatch',
)<{
  readonly effectRequestId: string | null
  readonly proposalId: string
  readonly reason:
    | 'MissingCorrelation'
    | 'UnknownCausation'
    | 'UnknownRequest'
    | 'NotAssigned'
    | 'WrongProcessor'
    | 'WrongIdempotencyKey'
    | 'WrongCausalRouting'
    | 'WrongCausation'
    | 'WrongAssignmentGeneration'
    | 'WrongCancellationGeneration'
    | 'WrongResultEvent'
}> {}

/** An effect result awaits causally prior data from another Instant query stream. */
export class AcceptanceAuthorityProposalDeferred extends Data.TaggedError(
  'AcceptanceAuthorityProposalDeferred',
)<{
  readonly effectRequestId: string | null
  readonly proposalId: string
  readonly reason:
    | 'CausalOccurrencePending'
    | 'EffectPlacementPending'
    | 'EffectRequestPending'
    | 'PlacementGenerationPending'
}> {}

/** A proposal kind carried fields reserved for a different intake path. */
export class AcceptanceAuthorityProposalKindMismatch extends Data.TaggedError(
  'AcceptanceAuthorityProposalKindMismatch',
)<{
  readonly proposalId: string
}> {}

/** A proposal's routing claims disagree with the Program-owned session policy. */
export class AcceptanceAuthoritySynchronizationPolicyMismatch extends Data.TaggedError(
  'AcceptanceAuthoritySynchronizationPolicyMismatch',
)<{
  readonly proposalId: string
  readonly reason:
    | 'AudienceClaim'
    | 'MessageCategoryClaim'
    | 'PolicyGenerationClaim'
    | 'ReadOnlyFollower'
    | 'SessionPolicyClaim'
}> {}

/** A durable effect request disagrees with its causal accepted occurrence. */
export class AcceptanceAuthorityEffectRequestRoutingMismatch extends Data.TaggedError(
  'AcceptanceAuthorityEffectRequestRoutingMismatch',
)<{
  readonly causalOccurrenceId: string | null
  readonly requestId: string | null
}> {}

/** Instant retained an accepted write locally instead of synchronizing it. */
export class AcceptanceAuthorityWriteNotSynced extends Data.TaggedError(
  'AcceptanceAuthorityWriteNotSynced',
)<{
  readonly clientId: string
  readonly occurrenceId: string
}> {}

/** Instant retained a terminal rejection locally instead of synchronizing it. */
export class AdmissionSequencerResolutionWriteNotSynced extends Data.TaggedError(
  'AdmissionSequencerResolutionWriteNotSynced',
)<{
  readonly clientId: string
  readonly proposalId: string
}> {}

/** A terminal rejection did not come from the session's designated sequencer. */
export class AdmissionSequencerResolutionProcessorMismatch extends Data.TaggedError(
  'AdmissionSequencerResolutionProcessorMismatch',
)<{
  readonly actualProcessorId: string
  readonly expectedProcessorId: string
  readonly proposalId: string
}> {}

/** An effect placement history reused a generation with different contents. */
export class AcceptanceAuthorityPlacementConflict extends Data.TaggedError(
  'AcceptanceAuthorityPlacementConflict',
)<{
  readonly positionKey: string
  readonly requestId: string
}> {}

/** A proposal envelope could not be converted into accepted provenance. */
export class AcceptanceAuthorityEnvelopeError extends Data.TaggedError(
  'AcceptanceAuthorityEnvelopeError',
)<{
  readonly cause: unknown
  readonly proposalId: string
}> {}

/** The trusted Program classifier failed to return one valid Message category. */
export class AcceptanceAuthorityMessageCategoryError extends Data.TaggedError(
  'AcceptanceAuthorityMessageCategoryError',
)<{
  readonly cause: unknown
  readonly proposalId: string
}> {}

/** A deterministic acceptance authority operation failed. */
export type AcceptanceAuthorityError =
  | AdmissionSequencerResolutionProposalMismatch
  | AdmissionSequencerResolutionProcessorMismatch
  | AdmissionSequencerResolutionWriteNotSynced
  | AdmissionSequencerTerminalConflict
  | AcceptanceAuthorityAcceptedOccurrenceInvalid
  | AcceptanceAuthorityChanged
  | AcceptanceAuthorityEffectRequestRoutingMismatch
  | AcceptanceAuthorityEffectResultMismatch
  | AcceptanceAuthorityEnvelopeError
  | AcceptanceAuthorityIdentityConflict
  | AcceptanceAuthorityMessageCategoryError
  | AcceptanceAuthorityPlacementConflict
  | AcceptanceAuthorityProcessorMismatch
  | AcceptanceAuthorityProposalDeferred
  | AcceptanceAuthorityProposalKindMismatch
  | AcceptanceAuthorityScopeMismatch
  | AcceptanceAuthoritySequenceConflict
  | AcceptanceAuthoritySessionMissing
  | AcceptanceAuthoritySessionPolicyChanged
  | AcceptanceAuthoritySessionRevoked
  | AcceptanceAuthoritySynchronizationPolicyMismatch
  | AcceptanceAuthorityWriteNotSynced
  | ProgramStoreError

/** A portable admission sequencer operation failed. */
export type AdmissionSequencerError = AcceptanceAuthorityError

/** A semantically invalid proposal reported without terminating authority intake. */
export type AcceptanceAuthorityProposalRejection =
  | AcceptanceAuthorityEffectResultMismatch
  | AcceptanceAuthorityEnvelopeError
  | AcceptanceAuthorityIdentityConflict
  | AcceptanceAuthorityProposalKindMismatch
  | AcceptanceAuthorityScopeMismatch
  | AcceptanceAuthoritySynchronizationPolicyMismatch

/** A semantically invalid proposal rejected by a portable admission sequencer. */
export type AdmissionSequencerProposalRejection =
  AcceptanceAuthorityProposalRejection

/** Maps an internal rejection to the safe reason persisted for every Processor. */
export const messageProposalRejectionReason = (
  rejection: AdmissionSequencerProposalRejection,
): InstantMessageProposalRejectionReason =>
  M.value(rejection).pipe(
    M.tagsExhaustive({
      AcceptanceAuthorityEffectResultMismatch: () =>
        InstantMessageProposalRejectionReason.make('EffectResultMismatch'),
      AcceptanceAuthorityEnvelopeError: () =>
        InstantMessageProposalRejectionReason.make('EnvelopeInvalid'),
      AcceptanceAuthorityIdentityConflict: () =>
        InstantMessageProposalRejectionReason.make('IdentityConflict'),
      AcceptanceAuthorityProposalKindMismatch: () =>
        InstantMessageProposalRejectionReason.make('ProposalKindMismatch'),
      AcceptanceAuthorityScopeMismatch: () =>
        InstantMessageProposalRejectionReason.make('ScopeMismatch'),
      AcceptanceAuthoritySynchronizationPolicyMismatch: () =>
        InstantMessageProposalRejectionReason.make(
          'SynchronizationPolicyMismatch',
        ),
    }),
  )

/** Constructs the immutable terminal rejection for one Message proposal. */
export const makeMessageProposalRejectionResolution = ({
  proposal,
  rejectedAtMs,
  rejection,
  session,
}: Readonly<{
  proposal: InstantMessageProposalRecord
  rejectedAtMs: number
  rejection: AdmissionSequencerProposalRejection
  session: InstantProgramSessionRecord
}>): InstantMessageProposalResolutionRecordType =>
  InstantMessageProposalResolutionRecord.make({
    actorId: proposal.actorId,
    actorSequence: proposal.actorSequence,
    clientId: proposal.clientId,
    id: proposal.proposalId,
    programId: session.programId,
    programVersion: session.programVersion,
    protocolVersion: session.protocolVersion,
    proposalId: proposal.proposalId,
    rejectedAtMs,
    rejectingProcessorId: session.authorityProcessorId,
    rejectionReason: messageProposalRejectionReason(rejection),
    sessionId: session.sessionId,
    subjectId: session.subjectId,
  })

/** Values supplied while converting proposed provenance into accepted provenance. */
export type AcceptEnvelopeInput = Readonly<{
  acceptedAtMs: number
  acceptedSequence: number
  acceptingProcessorId: string
  effectRequest?: InstantEffectRequestRecord | undefined
}>

/** Configuration for the portable single-writer admission sequencer role. */
export type AdmissionSequencerConfig<Message> = Readonly<{
  acceptEnvelope: (
    proposal: InstantMessageProposalRecord,
    input: AcceptEnvelopeInput,
  ) => Effect.Effect<string, unknown>
  decodeAcceptedMessage: (
    occurrence: InstantAcceptedMessageOccurrenceRecordType,
  ) => Effect.Effect<Message, unknown>
  decodeProposedMessage: (
    proposal: InstantMessageProposalRecord,
  ) => Effect.Effect<Message, unknown>
  messageCategory: (message: Message) => Synchronization.MessageCategory
  now: () => number
  onProposalRejected?: (
    proposal: InstantMessageProposalRecord,
    rejection: AcceptanceAuthorityProposalRejection,
  ) => Effect.Effect<void>
  session: InstantProgramSessionRecord
  store: ProgramAuthorityStoreService
}>

/** Compatibility name for admission sequencer configuration. */
export type AcceptanceAuthorityConfig<Message> =
  AdmissionSequencerConfig<Message>

/** A portable role that orders and admits proposals without owning Program execution. */
export type AdmissionSequencerService = Readonly<{
  admit: (
    proposal: InstantMessageProposalRecord,
  ) => Effect.Effect<
    InstantAcceptedMessageOccurrenceRecordType,
    AcceptanceAuthorityError
  >
  recoverAcceptedOccurrences: (
    occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecordType>,
  ) => Effect.Effect<void, AcceptanceAuthorityError>
  recoverEffectPlacements: (
    placements: ReadonlyArray<InstantEffectPlacementRecordType>,
  ) => Effect.Effect<
    void,
    AcceptanceAuthorityPlacementConflict | AcceptanceAuthorityScopeMismatch
  >
  recoverEffectRequests: (
    requests: ReadonlyArray<InstantEffectRequestRecord>,
  ) => Effect.Effect<
    void,
    | AcceptanceAuthorityEffectRequestRoutingMismatch
    | AcceptanceAuthorityScopeMismatch
  >
  run: Effect.Effect<never, AcceptanceAuthorityError>
}>

/** Compatibility name for the portable admission sequencer service. */
export type AcceptanceAuthorityService = AdmissionSequencerService

const emptyAuthorityState = (): AuthorityState => ({
  actorSequenceHighWaterByStream: HashMap.empty(),
  acceptedByEffectIdempotencyKey: HashMap.empty(),
  acceptedByMessageIdempotencyKey: HashMap.empty(),
  acceptedByOccurrenceId: HashMap.empty(),
  acceptedByProposalId: HashMap.empty(),
  acceptedBySequence: HashMap.empty(),
  effectPlacementsByRequestId: HashMap.empty(),
  effectPlacementsByPositionKey: HashMap.empty(),
  effectRequestsById: HashMap.empty(),
  maximumAcceptedPolicyGeneration: 0,
  maybeCurrentSession: Option.none(),
  nextAcceptedSequence: 1,
  sessionPolicyByGeneration: HashMap.empty(),
})

const actorSequenceStreamKey = (
  value: Readonly<{ actorId: string; clientId: string }>,
): string => encodeActorSequenceStream([value.actorId, value.clientId])

const advanceActorSequenceHighWater = (
  state: AuthorityState,
  value: Readonly<{
    actorId: string
    actorSequence: number
    clientId: string
  }>,
): AuthorityState => {
  const streamKey = actorSequenceStreamKey(value)
  const currentHighWater = Option.getOrElse(
    HashMap.get(state.actorSequenceHighWaterByStream, streamKey),
    () => 0,
  )
  return {
    ...state,
    actorSequenceHighWaterByStream: HashMap.set(
      state.actorSequenceHighWaterByStream,
      streamKey,
      Math.max(currentHighWater, value.actorSequence),
    ),
  }
}

const mergeActorSequenceHighWater = (
  left: HashMap.HashMap<string, number>,
  right: HashMap.HashMap<string, number>,
): HashMap.HashMap<string, number> =>
  HashMap.reduce(right, left, (highWaterByStream, highWater, streamKey) =>
    HashMap.set(
      highWaterByStream,
      streamKey,
      Math.max(
        highWater,
        Option.getOrElse(HashMap.get(highWaterByStream, streamKey), () => 0),
      ),
    ),
  )

const validateProposalActorSequence = (
  state: AuthorityState,
  proposal: Readonly<{
    actorId: string
    actorSequence: number
    clientId: string
  }>,
): Effect.Effect<void, AcceptanceAuthorityIdentityConflict> => {
  const streamKey = actorSequenceStreamKey(proposal)
  const maybeCurrentHighWater = HashMap.get(
    state.actorSequenceHighWaterByStream,
    streamKey,
  )
  if (
    Option.isNone(maybeCurrentHighWater) ||
    proposal.actorSequence > maybeCurrentHighWater.value
  ) {
    return Effect.void
  } else {
    return Effect.fail(
      new AcceptanceAuthorityIdentityConflict({
        identity: encodeActorSequenceStream([
          proposal.actorId,
          `${proposal.clientId}:${proposal.actorSequence}`,
        ]),
        identityKind: 'ActorSequence',
      }),
    )
  }
}

const validateAcceptedPolicyGeneration = (
  state: AuthorityState,
  occurrence: InstantAcceptedMessageOccurrenceRecordType,
  currentPolicy: Synchronization.SessionPolicy,
): Effect.Effect<void, AcceptanceAuthoritySynchronizationPolicyMismatch> => {
  const fail = (
    reason: AcceptanceAuthoritySynchronizationPolicyMismatch['reason'],
  ): Effect.Effect<never, AcceptanceAuthoritySynchronizationPolicyMismatch> =>
    Effect.fail(
      new AcceptanceAuthoritySynchronizationPolicyMismatch({
        proposalId: occurrence.proposalId,
        reason,
      }),
    )
  const maybeCanonicalPolicy = HashMap.get(
    state.sessionPolicyByGeneration,
    occurrence.policyGeneration,
  )
  if (
    occurrence.policyGeneration < state.maximumAcceptedPolicyGeneration ||
    occurrence.policyGeneration > currentPolicy.generation
  ) {
    return fail('PolicyGenerationClaim')
  } else if (
    Option.isSome(maybeCanonicalPolicy) &&
    encodeSessionPolicy(maybeCanonicalPolicy.value) !==
      encodeSessionPolicy(occurrence.sessionPolicy)
  ) {
    return fail('SessionPolicyClaim')
  } else if (
    occurrence.policyGeneration === currentPolicy.generation &&
    encodeSessionPolicy(occurrence.sessionPolicy) !==
      encodeSessionPolicy(currentPolicy)
  ) {
    return fail('SessionPolicyClaim')
  } else {
    return Effect.void
  }
}

const validateSessionPolicyHistory = (
  state: AuthorityState,
  currentPolicy: Synchronization.SessionPolicy,
  sessionId: string,
): Effect.Effect<void, AcceptanceAuthoritySessionPolicyChanged> => {
  const maybeCurrentGenerationPolicy = HashMap.get(
    state.sessionPolicyByGeneration,
    currentPolicy.generation,
  )
  const maybeMaximumGenerationPolicy = HashMap.get(
    state.sessionPolicyByGeneration,
    state.maximumAcceptedPolicyGeneration,
  )
  if (
    currentPolicy.generation < state.maximumAcceptedPolicyGeneration &&
    Option.isSome(maybeMaximumGenerationPolicy)
  ) {
    return Effect.fail(
      new AcceptanceAuthoritySessionPolicyChanged({
        actualPolicy: currentPolicy,
        expectedPolicy: maybeMaximumGenerationPolicy.value,
        sessionId,
      }),
    )
  } else if (
    Option.isSome(maybeCurrentGenerationPolicy) &&
    encodeSessionPolicy(maybeCurrentGenerationPolicy.value) !==
      encodeSessionPolicy(currentPolicy)
  ) {
    return Effect.fail(
      new AcceptanceAuthoritySessionPolicyChanged({
        actualPolicy: currentPolicy,
        expectedPolicy: maybeCurrentGenerationPolicy.value,
        sessionId,
      }),
    )
  } else {
    return Effect.void
  }
}

const scopeMismatch = (
  session: InstantProgramSessionRecord,
  value: Readonly<{
    programId: string
    programVersion: number
    protocolVersion: number
    sessionId: string
    subjectId: string
  }>,
): Option.Option<AcceptanceAuthorityScopeMismatch> => {
  if (
    value.programId === session.programId &&
    value.programVersion === session.programVersion &&
    value.protocolVersion === session.protocolVersion &&
    value.sessionId === session.sessionId &&
    value.subjectId === session.subjectId
  ) {
    return Option.none()
  } else {
    return Option.some(
      new AcceptanceAuthorityScopeMismatch({
        actualProgramId: value.programId,
        actualProgramVersion: value.programVersion,
        actualProtocolVersion: value.protocolVersion,
        actualSessionId: value.sessionId,
        actualSubjectId: value.subjectId,
        expectedProgramId: session.programId,
        expectedProgramVersion: session.programVersion,
        expectedProtocolVersion: session.protocolVersion,
        expectedSessionId: session.sessionId,
        expectedSubjectId: session.subjectId,
      }),
    )
  }
}

const validateResolutionProposals = (
  session: InstantProgramSessionRecord,
  state: AuthorityState,
  proposals: ReadonlyArray<InstantMessageProposalRecord>,
  resolutions: ReadonlyArray<InstantMessageProposalResolutionRecordType>,
): Effect.Effect<
  ReadonlyArray<InstantMessageProposalRecord>,
  | AcceptanceAuthorityScopeMismatch
  | AdmissionSequencerResolutionProcessorMismatch
  | AdmissionSequencerResolutionProposalMismatch
  | AdmissionSequencerTerminalConflict
> => {
  const initialResolutionProposalIds: Effect.Effect<
    HashSet.HashSet<string>,
    AdmissionSequencerResolutionProposalMismatch
  > = Effect.succeed(HashSet.empty())
  const uniqueResolutions = Array.reduce(
    resolutions,
    initialResolutionProposalIds,
    (proposalIdsEffect, resolution) =>
      Effect.flatMap(proposalIdsEffect, proposalIds => {
        if (HashSet.has(proposalIds, resolution.proposalId)) {
          return Effect.fail(
            new AdmissionSequencerResolutionProposalMismatch({
              proposalId: resolution.proposalId,
              reason: 'DuplicateResolution',
            }),
          )
        } else {
          return Effect.succeed(HashSet.add(proposalIds, resolution.proposalId))
        }
      }),
  )
  return Effect.andThen(
    uniqueResolutions,
    Effect.forEach(
      resolutions,
      resolution =>
        Effect.gen(function* () {
          const maybeScopeMismatch = scopeMismatch(session, resolution)
          if (Option.isSome(maybeScopeMismatch)) {
            return yield* Effect.fail(maybeScopeMismatch.value)
          }
          if (
            resolution.rejectingProcessorId !== session.authorityProcessorId
          ) {
            return yield* Effect.fail(
              new AdmissionSequencerResolutionProcessorMismatch({
                actualProcessorId: resolution.rejectingProcessorId,
                expectedProcessorId: session.authorityProcessorId,
                proposalId: resolution.proposalId,
              }),
            )
          }
          if (HashMap.has(state.acceptedByProposalId, resolution.proposalId)) {
            return yield* Effect.fail(
              new AdmissionSequencerTerminalConflict({
                proposalId: resolution.proposalId,
              }),
            )
          }
          const matchingProposals = Array.filter(
            proposals,
            proposal => proposal.proposalId === resolution.proposalId,
          )
          const maybeProposal = Array.head(matchingProposals)
          if (Option.isNone(maybeProposal)) {
            return yield* Effect.fail(
              new AdmissionSequencerResolutionProposalMismatch({
                proposalId: resolution.proposalId,
                reason: 'MissingProposal',
              }),
            )
          }
          if (Option.isSome(Array.get(matchingProposals, 1))) {
            return yield* Effect.fail(
              new AdmissionSequencerResolutionProposalMismatch({
                proposalId: resolution.proposalId,
                reason: 'DuplicateProposal',
              }),
            )
          }
          const proposal = maybeProposal.value
          const maybeProposalScopeMismatch = scopeMismatch(session, proposal)
          if (Option.isSome(maybeProposalScopeMismatch)) {
            return yield* Effect.fail(maybeProposalScopeMismatch.value)
          }
          if (
            resolution.id !== resolution.proposalId ||
            proposal.id !== proposal.proposalId
          ) {
            return yield* Effect.fail(
              new AdmissionSequencerResolutionProposalMismatch({
                proposalId: resolution.proposalId,
                reason: 'ProposalIdentity',
              }),
            )
          }
          if (resolution.actorId !== proposal.actorId) {
            return yield* Effect.fail(
              new AdmissionSequencerResolutionProposalMismatch({
                proposalId: resolution.proposalId,
                reason: 'ActorId',
              }),
            )
          }
          if (resolution.clientId !== proposal.clientId) {
            return yield* Effect.fail(
              new AdmissionSequencerResolutionProposalMismatch({
                proposalId: resolution.proposalId,
                reason: 'ClientId',
              }),
            )
          }
          if (resolution.actorSequence !== proposal.actorSequence) {
            return yield* Effect.fail(
              new AdmissionSequencerResolutionProposalMismatch({
                proposalId: resolution.proposalId,
                reason: 'ActorSequence',
              }),
            )
          }
          return proposal
        }),
      { concurrency: 1 },
    ),
  )
}

type CanonicalRouting = Readonly<{
  audience: Synchronization.Audience
  messageCategory: Synchronization.MessageCategory
  policyGeneration: number
  sessionPolicy: Synchronization.SessionPolicy
}>

const areAudiencesEqual = (
  left: Synchronization.Audience,
  right: Synchronization.Audience,
): boolean => encodeAudience(left) === encodeAudience(right)

const routingFromOccurrence = (
  occurrence: InstantAcceptedMessageOccurrenceRecordType,
): CanonicalRouting => ({
  audience: occurrence.audience,
  messageCategory: occurrence.messageCategory,
  policyGeneration: occurrence.policyGeneration,
  sessionPolicy: occurrence.sessionPolicy,
})

const resolveMessageRouting = (
  sessionPolicy: Synchronization.SessionPolicy,
  messageCategory: Synchronization.MessageCategory,
  originatingProcessorId: string,
  proposalId: string,
): Effect.Effect<
  CanonicalRouting,
  AcceptanceAuthoritySynchronizationPolicyMismatch
> => {
  const routingDecision = Synchronization.resolveAudience(
    sessionPolicy,
    messageCategory,
    originatingProcessorId,
  )
  if (routingDecision._tag === 'ReadOnlyFollowerRejected') {
    return Effect.fail(
      new AcceptanceAuthoritySynchronizationPolicyMismatch({
        proposalId,
        reason: 'ReadOnlyFollower',
      }),
    )
  } else {
    return Effect.succeed({
      audience: routingDecision,
      messageCategory,
      policyGeneration: sessionPolicy.generation,
      sessionPolicy,
    })
  }
}

const validateProposalRoutingClaims = (
  proposal: InstantMessageProposalRecord,
  routing: CanonicalRouting,
): Effect.Effect<void, AcceptanceAuthoritySynchronizationPolicyMismatch> => {
  if (proposal.messageCategory !== routing.messageCategory) {
    return Effect.fail(
      new AcceptanceAuthoritySynchronizationPolicyMismatch({
        proposalId: proposal.proposalId,
        reason: 'MessageCategoryClaim',
      }),
    )
  } else if (proposal.policyGeneration !== routing.policyGeneration) {
    return Effect.fail(
      new AcceptanceAuthoritySynchronizationPolicyMismatch({
        proposalId: proposal.proposalId,
        reason: 'PolicyGenerationClaim',
      }),
    )
  } else if (!areAudiencesEqual(proposal.proposedAudience, routing.audience)) {
    return Effect.fail(
      new AcceptanceAuthoritySynchronizationPolicyMismatch({
        proposalId: proposal.proposalId,
        reason: 'AudienceClaim',
      }),
    )
  } else {
    return Effect.void
  }
}

const validateAcceptedRouting = (
  occurrence: InstantAcceptedMessageOccurrenceRecordType,
  routing: CanonicalRouting,
): Effect.Effect<void, AcceptanceAuthoritySynchronizationPolicyMismatch> => {
  if (occurrence.messageCategory !== routing.messageCategory) {
    return Effect.fail(
      new AcceptanceAuthoritySynchronizationPolicyMismatch({
        proposalId: occurrence.proposalId,
        reason: 'MessageCategoryClaim',
      }),
    )
  } else if (occurrence.policyGeneration !== routing.policyGeneration) {
    return Effect.fail(
      new AcceptanceAuthoritySynchronizationPolicyMismatch({
        proposalId: occurrence.proposalId,
        reason: 'PolicyGenerationClaim',
      }),
    )
  } else if (
    encodeSessionPolicy(occurrence.sessionPolicy) !==
    encodeSessionPolicy(routing.sessionPolicy)
  ) {
    return Effect.fail(
      new AcceptanceAuthoritySynchronizationPolicyMismatch({
        proposalId: occurrence.proposalId,
        reason: 'SessionPolicyClaim',
      }),
    )
  } else if (
    occurrence.policyGeneration !== occurrence.sessionPolicy.generation
  ) {
    return Effect.fail(
      new AcceptanceAuthoritySynchronizationPolicyMismatch({
        proposalId: occurrence.proposalId,
        reason: 'PolicyGenerationClaim',
      }),
    )
  } else if (!areAudiencesEqual(occurrence.audience, routing.audience)) {
    return Effect.fail(
      new AcceptanceAuthoritySynchronizationPolicyMismatch({
        proposalId: occurrence.proposalId,
        reason: 'AudienceClaim',
      }),
    )
  } else {
    return Effect.void
  }
}

const validateEffectRequestRouting = (
  state: AuthorityState,
  request: InstantEffectRequestRecord,
): Effect.Effect<void, AcceptanceAuthorityEffectRequestRoutingMismatch> => {
  const maybeCausalOccurrence = HashMap.get(
    state.acceptedByOccurrenceId,
    request.causalOccurrenceId,
  )
  if (Option.isNone(maybeCausalOccurrence)) {
    return Effect.fail(
      new AcceptanceAuthorityEffectRequestRoutingMismatch({
        causalOccurrenceId: request.causalOccurrenceId,
        requestId: request.requestId,
      }),
    )
  }
  const causalOccurrence = maybeCausalOccurrence.value
  if (
    request.causalMessageCategory !== causalOccurrence.messageCategory ||
    request.causalPolicyGeneration !== causalOccurrence.policyGeneration ||
    !areAudiencesEqual(request.causalAudience, causalOccurrence.audience)
  ) {
    return Effect.fail(
      new AcceptanceAuthorityEffectRequestRoutingMismatch({
        causalOccurrenceId: request.causalOccurrenceId,
        requestId: request.requestId,
      }),
    )
  } else {
    return Effect.void
  }
}

const validateProposalKind = (
  proposal: InstantMessageProposalRecord,
): Effect.Effect<void, AcceptanceAuthorityProposalKindMismatch> => {
  if (isInstantMessageProposalKindValid(proposal)) {
    return Effect.void
  } else {
    return Effect.fail(
      new AcceptanceAuthorityProposalKindMismatch({
        proposalId: proposal.proposalId,
      }),
    )
  }
}

const validateEffectResult = (
  state: AuthorityState,
  proposal: InstantMessageProposalRecord,
): Effect.Effect<
  void,
  | AcceptanceAuthorityEffectResultMismatch
  | AcceptanceAuthorityProposalDeferred
  | AcceptanceAuthorityProposalKindMismatch
> => {
  const kindValidation = validateProposalKind(proposal)
  if (proposal.proposalKind === 'Message') {
    return kindValidation
  }
  if (
    proposal.effectAssignmentGeneration === null ||
    proposal.effectCancellationGeneration === null ||
    proposal.effectRequestId === null ||
    proposal.effectIdempotencyKey === null ||
    proposal.executorProcessorId === null
  ) {
    return Effect.fail(
      new AcceptanceAuthorityEffectResultMismatch({
        effectRequestId: proposal.effectRequestId,
        proposalId: proposal.proposalId,
        reason: 'MissingCorrelation',
      }),
    )
  }

  const maybeRequest = HashMap.get(
    state.effectRequestsById,
    proposal.effectRequestId,
  )
  if (Option.isNone(maybeRequest)) {
    return Effect.fail(
      new AcceptanceAuthorityProposalDeferred({
        effectRequestId: proposal.effectRequestId,
        proposalId: proposal.proposalId,
        reason: 'EffectRequestPending',
      }),
    )
  }

  const maybePlacement = HashMap.get(
    state.effectPlacementsByRequestId,
    proposal.effectRequestId,
  )
  if (Option.isNone(maybePlacement)) {
    return Effect.fail(
      new AcceptanceAuthorityProposalDeferred({
        effectRequestId: proposal.effectRequestId,
        proposalId: proposal.proposalId,
        reason: 'EffectPlacementPending',
      }),
    )
  }
  const placement = maybePlacement.value
  const request = maybeRequest.value
  if (
    proposal.effectAssignmentGeneration > placement.assignmentGeneration ||
    (proposal.effectAssignmentGeneration === placement.assignmentGeneration &&
      proposal.effectCancellationGeneration > placement.cancellationGeneration)
  ) {
    return Effect.fail(
      new AcceptanceAuthorityProposalDeferred({
        effectRequestId: proposal.effectRequestId,
        proposalId: proposal.proposalId,
        reason: 'PlacementGenerationPending',
      }),
    )
  }
  if (
    placement.placementStatus !== 'AssignedPreferred' &&
    placement.placementStatus !== 'AssignedFallback'
  ) {
    return Effect.fail(
      new AcceptanceAuthorityEffectResultMismatch({
        effectRequestId: proposal.effectRequestId,
        proposalId: proposal.proposalId,
        reason: 'NotAssigned',
      }),
    )
  }
  if (
    placement.assignedProcessorId !== proposal.executorProcessorId ||
    proposal.originatingProcessorId !== proposal.executorProcessorId
  ) {
    return Effect.fail(
      new AcceptanceAuthorityEffectResultMismatch({
        effectRequestId: proposal.effectRequestId,
        proposalId: proposal.proposalId,
        reason: 'WrongProcessor',
      }),
    )
  }
  if (request.idempotencyKey !== proposal.effectIdempotencyKey) {
    return Effect.fail(
      new AcceptanceAuthorityEffectResultMismatch({
        effectRequestId: proposal.effectRequestId,
        proposalId: proposal.proposalId,
        reason: 'WrongIdempotencyKey',
      }),
    )
  }
  if (request.causalOccurrenceId !== proposal.causationOccurrenceId) {
    return Effect.fail(
      new AcceptanceAuthorityEffectResultMismatch({
        effectRequestId: proposal.effectRequestId,
        proposalId: proposal.proposalId,
        reason: 'WrongCausation',
      }),
    )
  }
  if (placement.assignmentGeneration !== proposal.effectAssignmentGeneration) {
    return Effect.fail(
      new AcceptanceAuthorityEffectResultMismatch({
        effectRequestId: proposal.effectRequestId,
        proposalId: proposal.proposalId,
        reason: 'WrongAssignmentGeneration',
      }),
    )
  }
  if (
    placement.cancellationGeneration !== proposal.effectCancellationGeneration
  ) {
    return Effect.fail(
      new AcceptanceAuthorityEffectResultMismatch({
        effectRequestId: proposal.effectRequestId,
        proposalId: proposal.proposalId,
        reason: 'WrongCancellationGeneration',
      }),
    )
  }
  const isPermitted = Array.some(
    request.permittedResultEvents,
    permitted =>
      permitted.eventId === proposal.eventId &&
      proposal.eventVersion >= permitted.minimumVersion &&
      proposal.eventVersion <= permitted.maximumVersion,
  )
  if (isPermitted) {
    return kindValidation
  } else {
    return Effect.fail(
      new AcceptanceAuthorityEffectResultMismatch({
        effectRequestId: proposal.effectRequestId,
        proposalId: proposal.proposalId,
        reason: 'WrongResultEvent',
      }),
    )
  }
}

const isMatchingAcceptedEffectAlias = (
  proposal: InstantMessageProposalRecord,
  accepted: InstantAcceptedMessageOccurrenceRecordType,
): boolean =>
  proposal.proposalKind === 'EffectResult' &&
  accepted.proposalKind === 'EffectResult' &&
  proposal.actorId === accepted.actorId &&
  proposal.clientId === accepted.clientId &&
  proposal.causationOccurrenceId === accepted.causationId &&
  proposal.correlationId === accepted.correlationId &&
  proposal.effectAssignmentGeneration === accepted.effectAssignmentGeneration &&
  proposal.effectCancellationGeneration ===
    accepted.effectCancellationGeneration &&
  proposal.effectIdempotencyKey === accepted.effectIdempotencyKey &&
  proposal.effectRequestId === accepted.effectRequestId &&
  proposal.envelopeVersion === accepted.envelopeVersion &&
  proposal.eventId === accepted.eventId &&
  proposal.eventVersion === accepted.eventVersion &&
  proposal.executorProcessorId === accepted.executorProcessorId &&
  proposal.messageCategory === accepted.messageCategory &&
  proposal.originDeviceId === accepted.originDeviceId &&
  proposal.originatingProcessorId === accepted.originatingProcessorId &&
  proposal.payloadJson === accepted.payloadJson &&
  proposal.programId === accepted.programId &&
  proposal.programVersion === accepted.programVersion &&
  proposal.protocolVersion === accepted.protocolVersion &&
  proposal.policyGeneration === accepted.policyGeneration &&
  proposal.sessionId === accepted.sessionId &&
  proposal.subjectId === accepted.subjectId &&
  areAudiencesEqual(proposal.proposedAudience, accepted.audience)

const isMatchingAcceptedMessageAlias = (
  proposal: InstantMessageProposalRecord,
  accepted: InstantAcceptedMessageOccurrenceRecordType,
): boolean =>
  proposal.proposalKind === 'Message' &&
  accepted.proposalKind === 'Message' &&
  proposal.actorId === accepted.actorId &&
  proposal.clientId === accepted.clientId &&
  proposal.causationOccurrenceId === accepted.causationId &&
  proposal.correlationId === accepted.correlationId &&
  proposal.envelopeVersion === accepted.envelopeVersion &&
  proposal.eventId === accepted.eventId &&
  proposal.eventVersion === accepted.eventVersion &&
  proposal.messageCategory === accepted.messageCategory &&
  proposal.messageIdempotencyKey === accepted.messageIdempotencyKey &&
  proposal.originDeviceId === accepted.originDeviceId &&
  proposal.originatingProcessorId === accepted.originatingProcessorId &&
  proposal.payloadJson === accepted.payloadJson &&
  proposal.programId === accepted.programId &&
  proposal.programVersion === accepted.programVersion &&
  proposal.protocolVersion === accepted.protocolVersion &&
  proposal.policyGeneration === accepted.policyGeneration &&
  proposal.sessionId === accepted.sessionId &&
  proposal.subjectId === accepted.subjectId &&
  areAudiencesEqual(proposal.proposedAudience, accepted.audience)

const proposalFromAcceptedOccurrence = (
  occurrence: InstantAcceptedMessageOccurrenceRecordType,
): InstantMessageProposalRecord =>
  InstantMessageProposalRecord.make({
    actorId: occurrence.actorId,
    actorSequence: occurrence.actorSequence,
    causationOccurrenceId: occurrence.causationId,
    clientId: occurrence.clientId,
    correlationId: occurrence.correlationId,
    createdAtMs: occurrence.createdAtMs,
    effectAssignmentGeneration: occurrence.effectAssignmentGeneration,
    effectCancellationGeneration: occurrence.effectCancellationGeneration,
    effectIdempotencyKey: occurrence.effectIdempotencyKey,
    effectRequestId: occurrence.effectRequestId,
    envelopeJson: occurrence.proposedEnvelopeJson,
    envelopeVersion: occurrence.envelopeVersion,
    eventId: occurrence.eventId,
    eventVersion: occurrence.eventVersion,
    executorProcessorId: occurrence.executorProcessorId,
    id: occurrence.proposalId,
    messageCategory: occurrence.messageCategory,
    messageIdempotencyKey: occurrence.messageIdempotencyKey,
    occurrenceId: occurrence.occurrenceId,
    originDeviceId: occurrence.originDeviceId,
    originatingProcessorId: occurrence.originatingProcessorId,
    payloadJson: occurrence.payloadJson,
    programId: occurrence.programId,
    programVersion: occurrence.programVersion,
    protocolVersion: occurrence.protocolVersion,
    proposalId: occurrence.proposalId,
    proposalKind: occurrence.proposalKind,
    proposedAudience: occurrence.audience,
    policyGeneration: occurrence.policyGeneration,
    sessionId: occurrence.sessionId,
    subjectId: occurrence.subjectId,
  })

const validateRecoveredEffectResults = (
  state: AuthorityState,
): Effect.Effect<
  void,
  | AcceptanceAuthorityEffectResultMismatch
  | AcceptanceAuthorityProposalKindMismatch
> =>
  Effect.forEach(
    Array.filter(
      Array.fromIterable(HashMap.values(state.acceptedBySequence)),
      occurrence => occurrence.proposalKind === 'EffectResult',
    ),
    occurrence => {
      const maybePlacement =
        occurrence.effectRequestId === null ||
        occurrence.effectAssignmentGeneration === null ||
        occurrence.effectCancellationGeneration === null
          ? Option.none<InstantEffectPlacementRecordType>()
          : HashMap.get(
              state.effectPlacementsByPositionKey,
              makeInstantEffectPlacementPositionKey(
                occurrence.effectRequestId,
                occurrence.effectAssignmentGeneration,
                occurrence.effectCancellationGeneration,
              ),
            )
      const effectPlacementsByRequestId = Option.match(maybePlacement, {
        onNone: () =>
          occurrence.effectRequestId === null
            ? state.effectPlacementsByRequestId
            : HashMap.remove(
                state.effectPlacementsByRequestId,
                occurrence.effectRequestId,
              ),
        onSome: placement =>
          HashMap.set(
            state.effectPlacementsByRequestId,
            placement.requestId,
            placement,
          ),
      })
      return validateEffectResult(
        {
          ...state,
          effectPlacementsByRequestId,
        },
        proposalFromAcceptedOccurrence(occurrence),
      ).pipe(
        Effect.catchTag(
          'AcceptanceAuthorityProposalDeferred',
          () => Effect.void,
        ),
      )
    },
    { concurrency: 1, discard: true },
  )

const areAcceptedOccurrencesEqual = (
  left: InstantAcceptedMessageOccurrenceRecordType,
  right: InstantAcceptedMessageOccurrenceRecordType,
): boolean => encodeAcceptedOccurrence(left) === encodeAcceptedOccurrence(right)

const validateProposalAgainstAccepted = (
  proposal: InstantMessageProposalRecord,
  accepted: InstantAcceptedMessageOccurrenceRecordType,
): boolean =>
  proposal.actorId === accepted.actorId &&
  proposal.actorSequence === accepted.actorSequence &&
  areAudiencesEqual(proposal.proposedAudience, accepted.audience) &&
  proposal.clientId === accepted.clientId &&
  proposal.createdAtMs === accepted.createdAtMs &&
  proposal.effectAssignmentGeneration === accepted.effectAssignmentGeneration &&
  proposal.effectCancellationGeneration ===
    accepted.effectCancellationGeneration &&
  proposal.effectIdempotencyKey === accepted.effectIdempotencyKey &&
  proposal.effectRequestId === accepted.effectRequestId &&
  proposal.causationOccurrenceId === accepted.causationId &&
  proposal.correlationId === accepted.correlationId &&
  proposal.envelopeVersion === accepted.envelopeVersion &&
  proposal.eventId === accepted.eventId &&
  proposal.eventVersion === accepted.eventVersion &&
  proposal.executorProcessorId === accepted.executorProcessorId &&
  proposal.envelopeJson === accepted.proposedEnvelopeJson &&
  proposal.messageCategory === accepted.messageCategory &&
  proposal.messageIdempotencyKey === accepted.messageIdempotencyKey &&
  proposal.occurrenceId === accepted.occurrenceId &&
  proposal.originDeviceId === accepted.originDeviceId &&
  proposal.originatingProcessorId === accepted.originatingProcessorId &&
  proposal.payloadJson === accepted.payloadJson &&
  proposal.programId === accepted.programId &&
  proposal.programVersion === accepted.programVersion &&
  proposal.protocolVersion === accepted.protocolVersion &&
  proposal.proposalKind === accepted.proposalKind &&
  proposal.policyGeneration === accepted.policyGeneration &&
  proposal.sessionId === accepted.sessionId &&
  proposal.subjectId === accepted.subjectId

const validateAcceptedEffectResultIdentity = (
  state: AuthorityState,
  occurrence: InstantAcceptedMessageOccurrenceRecordType,
): Effect.Effect<void, AcceptanceAuthorityIdentityConflict> => {
  if (
    occurrence.proposalKind !== 'EffectResult' ||
    occurrence.effectIdempotencyKey === null
  ) {
    return Effect.void
  }
  const maybeExisting = HashMap.get(
    state.acceptedByEffectIdempotencyKey,
    occurrence.effectIdempotencyKey,
  )
  if (Option.isNone(maybeExisting)) {
    return Effect.void
  } else {
    return Effect.fail(
      new AcceptanceAuthorityIdentityConflict({
        identity: occurrence.effectIdempotencyKey,
        identityKind: 'EffectIdempotencyKey',
      }),
    )
  }
}

const validateAcceptedMessageIdentity = (
  state: AuthorityState,
  occurrence: InstantAcceptedMessageOccurrenceRecordType,
): Effect.Effect<void, AcceptanceAuthorityIdentityConflict> => {
  if (
    occurrence.proposalKind !== 'Message' ||
    occurrence.messageIdempotencyKey === null
  ) {
    return Effect.void
  }
  const maybeExisting = HashMap.get(
    state.acceptedByMessageIdempotencyKey,
    occurrence.messageIdempotencyKey,
  )
  if (Option.isNone(maybeExisting)) {
    return Effect.void
  } else {
    return Effect.fail(
      new AcceptanceAuthorityIdentityConflict({
        identity: occurrence.messageIdempotencyKey,
        identityKind: 'MessageIdempotencyKey',
      }),
    )
  }
}

type ValidateRecoveredRouting = (
  state: AuthorityState,
  occurrence: InstantAcceptedMessageOccurrenceRecordType,
) => Effect.Effect<
  void,
  | AcceptanceAuthorityEffectRequestRoutingMismatch
  | AcceptanceAuthorityEnvelopeError
  | AcceptanceAuthorityMessageCategoryError
  | AcceptanceAuthoritySynchronizationPolicyMismatch
>

const insertRecoveredOccurrence = (
  session: InstantProgramSessionRecord,
  state: AuthorityState,
  occurrence: InstantAcceptedMessageOccurrenceRecordType,
  validateRouting: ValidateRecoveredRouting,
): Effect.Effect<AuthorityState, AcceptanceAuthorityError> => {
  const maybeValidationIssue =
    instantAcceptedMessageOccurrenceValidationIssue(occurrence)
  if (Option.isSome(maybeValidationIssue)) {
    return Effect.fail(
      new AcceptanceAuthorityAcceptedOccurrenceInvalid({
        occurrenceId: occurrence.occurrenceId,
        reason: maybeValidationIssue.value,
      }),
    )
  }
  const validation = validateProposalActorSequence(state, occurrence).pipe(
    Effect.andThen(validateAcceptedEffectResultIdentity(state, occurrence)),
    Effect.andThen(validateAcceptedMessageIdentity(state, occurrence)),
    Effect.andThen(
      validateAcceptedPolicyGeneration(
        state,
        occurrence,
        session.sessionPolicy,
      ),
    ),
    Effect.andThen(validateRouting(state, occurrence)),
  )
  const maybeScopeMismatch = scopeMismatch(session, occurrence)
  if (Option.isSome(maybeScopeMismatch)) {
    return Effect.fail(maybeScopeMismatch.value)
  }
  if (occurrence.acceptingProcessorId !== session.authorityProcessorId) {
    return Effect.fail(
      new AcceptanceAuthorityProcessorMismatch({
        actualProcessorId: occurrence.acceptingProcessorId,
        expectedProcessorId: session.authorityProcessorId,
        occurrenceId: occurrence.occurrenceId,
      }),
    )
  }
  if (occurrence.acceptedSequence !== state.nextAcceptedSequence) {
    return Effect.fail(
      new AcceptanceAuthoritySequenceConflict({
        acceptedSequence: occurrence.acceptedSequence,
        expectedAcceptedSequence: state.nextAcceptedSequence,
        occurrenceId: occurrence.occurrenceId,
      }),
    )
  }
  if (
    occurrence.positionKey !==
    makeAcceptedOccurrencePositionKey(
      occurrence.sessionId,
      occurrence.acceptedSequence,
    )
  ) {
    return Effect.fail(
      new AcceptanceAuthoritySequenceConflict({
        acceptedSequence: occurrence.acceptedSequence,
        expectedAcceptedSequence: state.nextAcceptedSequence,
        occurrenceId: occurrence.occurrenceId,
      }),
    )
  }

  const maybeByOccurrence = HashMap.get(
    state.acceptedByOccurrenceId,
    occurrence.occurrenceId,
  )
  if (
    Option.isSome(maybeByOccurrence) &&
    !areAcceptedOccurrencesEqual(maybeByOccurrence.value, occurrence)
  ) {
    return Effect.fail(
      new AcceptanceAuthorityIdentityConflict({
        identity: occurrence.occurrenceId,
        identityKind: 'Occurrence',
      }),
    )
  }
  const maybeByProposal = HashMap.get(
    state.acceptedByProposalId,
    occurrence.proposalId,
  )
  if (
    Option.isSome(maybeByProposal) &&
    !areAcceptedOccurrencesEqual(maybeByProposal.value, occurrence)
  ) {
    return Effect.fail(
      new AcceptanceAuthorityIdentityConflict({
        identity: occurrence.proposalId,
        identityKind: 'Proposal',
      }),
    )
  }

  const nextEffectResults =
    occurrence.proposalKind !== 'EffectResult' ||
    occurrence.effectIdempotencyKey === null
      ? state.acceptedByEffectIdempotencyKey
      : HashMap.set(
          state.acceptedByEffectIdempotencyKey,
          occurrence.effectIdempotencyKey,
          occurrence,
        )
  const nextMessages =
    occurrence.proposalKind !== 'Message' ||
    occurrence.messageIdempotencyKey === null
      ? state.acceptedByMessageIdempotencyKey
      : HashMap.set(
          state.acceptedByMessageIdempotencyKey,
          occurrence.messageIdempotencyKey,
          occurrence,
        )
  const nextState = advanceActorSequenceHighWater(
    {
      ...state,
      acceptedByEffectIdempotencyKey: nextEffectResults,
      acceptedByMessageIdempotencyKey: nextMessages,
      acceptedByOccurrenceId: HashMap.set(
        state.acceptedByOccurrenceId,
        occurrence.occurrenceId,
        occurrence,
      ),
      acceptedByProposalId: HashMap.set(
        state.acceptedByProposalId,
        occurrence.proposalId,
        occurrence,
      ),
      acceptedBySequence: HashMap.set(
        state.acceptedBySequence,
        occurrence.acceptedSequence,
        occurrence,
      ),
      maximumAcceptedPolicyGeneration: Math.max(
        state.maximumAcceptedPolicyGeneration,
        occurrence.policyGeneration,
      ),
      nextAcceptedSequence: state.nextAcceptedSequence + 1,
      sessionPolicyByGeneration: HashMap.set(
        state.sessionPolicyByGeneration,
        occurrence.policyGeneration,
        occurrence.sessionPolicy,
      ),
    },
    occurrence,
  )
  return Effect.as(validation, nextState)
}

const recoverAccepted = (
  session: InstantProgramSessionRecord,
  occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecordType>,
  validateRouting: ValidateRecoveredRouting,
): Effect.Effect<AuthorityState, AcceptanceAuthorityError> => {
  const initialState: Effect.Effect<AuthorityState, AcceptanceAuthorityError> =
    Effect.succeed(emptyAuthorityState())
  return Array.reduce(
    Array.sort(occurrences, acceptedOrder),
    initialState,
    (stateEffect, occurrence) =>
      Effect.flatMap(stateEffect, state =>
        insertRecoveredOccurrence(session, state, occurrence, validateRouting),
      ),
  )
}

const reconcileRecoveredAccepted = (
  current: AuthorityState,
  recovered: AuthorityState,
): Effect.Effect<AuthorityState, AcceptanceAuthorityIdentityConflict> => {
  const maybeConflict = HashMap.reduce(
    recovered.acceptedBySequence,
    Option.none<AcceptanceAuthorityIdentityConflict>(),
    (conflict, occurrence, acceptedSequence) => {
      if (Option.isSome(conflict)) {
        return conflict
      }
      const maybeCurrent = HashMap.get(
        current.acceptedBySequence,
        acceptedSequence,
      )
      if (
        Option.isNone(maybeCurrent) ||
        areAcceptedOccurrencesEqual(maybeCurrent.value, occurrence)
      ) {
        return Option.none()
      } else {
        return Option.some(
          new AcceptanceAuthorityIdentityConflict({
            identity: occurrence.occurrenceId,
            identityKind: 'Occurrence',
          }),
        )
      }
    },
  )
  if (Option.isSome(maybeConflict)) {
    return Effect.fail(maybeConflict.value)
  }

  const nextAcceptedState =
    recovered.nextAcceptedSequence < current.nextAcceptedSequence
      ? current
      : recovered
  return Effect.succeed({
    ...nextAcceptedState,
    actorSequenceHighWaterByStream: mergeActorSequenceHighWater(
      nextAcceptedState.actorSequenceHighWaterByStream,
      current.actorSequenceHighWaterByStream,
    ),
    effectPlacementsByRequestId: current.effectPlacementsByRequestId,
    effectPlacementsByPositionKey: current.effectPlacementsByPositionKey,
    effectRequestsById: current.effectRequestsById,
    maybeCurrentSession: current.maybeCurrentSession,
  })
}

const recoverEffects = (
  session: InstantProgramSessionRecord,
  state: AuthorityState,
  requests: ReadonlyArray<InstantEffectRequestRecord>,
): Effect.Effect<
  AuthorityState,
  | AcceptanceAuthorityEffectRequestRoutingMismatch
  | AcceptanceAuthorityScopeMismatch
> => {
  const initialState: Effect.Effect<
    AuthorityState,
    | AcceptanceAuthorityEffectRequestRoutingMismatch
    | AcceptanceAuthorityScopeMismatch
  > = Effect.succeed({
    ...state,
    effectRequestsById: HashMap.empty<string, InstantEffectRequestRecord>(),
  })
  return Array.reduce(requests, initialState, (stateEffect, request) =>
    Effect.flatMap(
      stateEffect,
      (
        nextState,
      ): Effect.Effect<
        AuthorityState,
        | AcceptanceAuthorityEffectRequestRoutingMismatch
        | AcceptanceAuthorityScopeMismatch
      > => {
        const maybeScopeMismatch = scopeMismatch(session, request)
        if (Option.isSome(maybeScopeMismatch)) {
          return Effect.fail(maybeScopeMismatch.value)
        }
        const maybeCausalOccurrence = HashMap.get(
          nextState.acceptedByOccurrenceId,
          request.causalOccurrenceId,
        )
        if (Option.isNone(maybeCausalOccurrence)) {
          return Effect.succeed(nextState)
        } else {
          return Effect.as(validateEffectRequestRouting(nextState, request), {
            ...nextState,
            effectRequestsById: HashMap.set(
              nextState.effectRequestsById,
              request.requestId,
              request,
            ),
          })
        }
      },
    ),
  )
}

const isLaterPlacement = (
  candidate: InstantEffectPlacementRecordType,
  current: InstantEffectPlacementRecordType,
): boolean =>
  candidate.assignmentGeneration > current.assignmentGeneration ||
  (candidate.assignmentGeneration === current.assignmentGeneration &&
    candidate.cancellationGeneration > current.cancellationGeneration)

const recoverPlacements = (
  session: InstantProgramSessionRecord,
  state: AuthorityState,
  placements: ReadonlyArray<InstantEffectPlacementRecordType>,
): Effect.Effect<
  AuthorityState,
  AcceptanceAuthorityPlacementConflict | AcceptanceAuthorityScopeMismatch
> => {
  const initialState: Effect.Effect<
    AuthorityState,
    AcceptanceAuthorityPlacementConflict | AcceptanceAuthorityScopeMismatch
  > = Effect.succeed({
    ...state,
    effectPlacementsByRequestId: HashMap.empty<
      string,
      InstantEffectPlacementRecordType
    >(),
    effectPlacementsByPositionKey: HashMap.empty<
      string,
      InstantEffectPlacementRecordType
    >(),
  })
  return Array.reduce(placements, initialState, (stateEffect, placement) =>
    Effect.flatMap(
      stateEffect,
      (
        nextState,
      ): Effect.Effect<
        AuthorityState,
        AcceptanceAuthorityPlacementConflict | AcceptanceAuthorityScopeMismatch
      > => {
        const maybeScopeMismatch = scopeMismatch(session, placement)
        if (Option.isSome(maybeScopeMismatch)) {
          return Effect.fail(maybeScopeMismatch.value)
        }
        const maybePosition = HashMap.get(
          nextState.effectPlacementsByPositionKey,
          placement.positionKey,
        )
        if (
          Option.isSome(maybePosition) &&
          encodeEffectPlacement(maybePosition.value) !==
            encodeEffectPlacement(placement)
        ) {
          return Effect.fail(
            new AcceptanceAuthorityPlacementConflict({
              positionKey: placement.positionKey,
              requestId: placement.requestId,
            }),
          )
        }
        const nextPlacementsByPositionKey = HashMap.set(
          nextState.effectPlacementsByPositionKey,
          placement.positionKey,
          placement,
        )
        const maybeCurrent = HashMap.get(
          nextState.effectPlacementsByRequestId,
          placement.requestId,
        )
        if (Option.isNone(maybeCurrent)) {
          return Effect.succeed({
            ...nextState,
            effectPlacementsByRequestId: HashMap.set(
              nextState.effectPlacementsByRequestId,
              placement.requestId,
              placement,
            ),
            effectPlacementsByPositionKey: nextPlacementsByPositionKey,
          })
        }
        const current = maybeCurrent.value
        if (
          current.assignmentGeneration === placement.assignmentGeneration &&
          current.cancellationGeneration === placement.cancellationGeneration
        ) {
          if (
            encodeEffectPlacement(current) === encodeEffectPlacement(placement)
          ) {
            return Effect.succeed({
              ...nextState,
              effectPlacementsByPositionKey: nextPlacementsByPositionKey,
            })
          } else {
            return Effect.fail(
              new AcceptanceAuthorityPlacementConflict({
                positionKey: placement.positionKey,
                requestId: placement.requestId,
              }),
            )
          }
        }
        if (isLaterPlacement(placement, current)) {
          return Effect.succeed({
            ...nextState,
            effectPlacementsByRequestId: HashMap.set(
              nextState.effectPlacementsByRequestId,
              placement.requestId,
              placement,
            ),
            effectPlacementsByPositionKey: nextPlacementsByPositionKey,
          })
        } else {
          return Effect.succeed({
            ...nextState,
            effectPlacementsByPositionKey: nextPlacementsByPositionKey,
          })
        }
      },
    ),
  )
}

const isProposalRejection = (
  error: AcceptanceAuthorityError,
): error is AcceptanceAuthorityProposalRejection =>
  error._tag === 'AcceptanceAuthorityEffectResultMismatch' ||
  error._tag === 'AcceptanceAuthorityEnvelopeError' ||
  error._tag === 'AcceptanceAuthorityIdentityConflict' ||
  error._tag === 'AcceptanceAuthorityProposalKindMismatch' ||
  error._tag === 'AcceptanceAuthorityScopeMismatch' ||
  error._tag === 'AcceptanceAuthoritySynchronizationPolicyMismatch'

/** Creates a portable sequencer for ordering and admission, not Program execution. */
export const makeAdmissionSequencer = <Message>({
  acceptEnvelope,
  decodeAcceptedMessage,
  decodeProposedMessage,
  messageCategory,
  now,
  onProposalRejected = () => Effect.void,
  session,
  store,
}: AdmissionSequencerConfig<Message>): Effect.Effect<AdmissionSequencerService> =>
  Effect.gen(function* () {
    const stateRef = yield* SynchronizedRef.make<AuthorityState>({
      ...emptyAuthorityState(),
      maybeCurrentSession: Option.some(session),
    })
    const rejectedProposalIdsRef = yield* SynchronizedRef.make(
      HashSet.empty<string>(),
    )
    const synchronizedResolutionProposalIdsRef = yield* SynchronizedRef.make(
      HashSet.empty<string>(),
    )

    const classifyDecodedMessage = (
      decodedMessage: Message,
      proposalId: string,
    ): Effect.Effect<
      Synchronization.MessageCategory,
      AcceptanceAuthorityMessageCategoryError
    > =>
      Effect.try({
        try: () =>
          S.decodeUnknownSync(Synchronization.MessageCategory)(
            messageCategory(decodedMessage),
          ),
        catch: cause =>
          new AcceptanceAuthorityMessageCategoryError({ cause, proposalId }),
      })

    const classifyProposedMessage = (
      proposal: InstantMessageProposalRecord,
    ): Effect.Effect<
      Synchronization.MessageCategory,
      AcceptanceAuthorityEnvelopeError | AcceptanceAuthorityMessageCategoryError
    > =>
      decodeProposedMessage(proposal).pipe(
        Effect.mapError(
          cause =>
            new AcceptanceAuthorityEnvelopeError({
              cause,
              proposalId: proposal.proposalId,
            }),
        ),
        Effect.flatMap(decodedMessage =>
          classifyDecodedMessage(decodedMessage, proposal.proposalId),
        ),
      )

    const decodeAccepted = (
      occurrence: InstantAcceptedMessageOccurrenceRecordType,
    ): Effect.Effect<Message, AcceptanceAuthorityEnvelopeError> =>
      decodeAcceptedMessage(occurrence).pipe(
        Effect.mapError(
          cause =>
            new AcceptanceAuthorityEnvelopeError({
              cause,
              proposalId: occurrence.proposalId,
            }),
        ),
      )

    const classifyAcceptedMessage = (
      occurrence: InstantAcceptedMessageOccurrenceRecordType,
    ): Effect.Effect<
      Synchronization.MessageCategory,
      AcceptanceAuthorityEnvelopeError | AcceptanceAuthorityMessageCategoryError
    > =>
      decodeAccepted(occurrence).pipe(
        Effect.flatMap(decodedMessage =>
          classifyDecodedMessage(decodedMessage, occurrence.proposalId),
        ),
      )

    const routingForEffectResult = (
      state: AuthorityState,
      proposal: InstantMessageProposalRecord,
    ): Effect.Effect<
      CanonicalRouting,
      | AcceptanceAuthorityEffectResultMismatch
      | AcceptanceAuthorityProposalDeferred
    > => {
      const maybeCausalOccurrence = Option.flatMap(
        Option.fromNullishOr(proposal.causationOccurrenceId),
        causationOccurrenceId =>
          HashMap.get(state.acceptedByOccurrenceId, causationOccurrenceId),
      )
      if (Option.isNone(maybeCausalOccurrence)) {
        return Effect.fail(
          new AcceptanceAuthorityProposalDeferred({
            effectRequestId: proposal.effectRequestId,
            proposalId: proposal.proposalId,
            reason: 'CausalOccurrencePending',
          }),
        )
      }
      const causalOccurrence = maybeCausalOccurrence.value
      const maybeRequest = Option.flatMap(
        Option.fromNullishOr(proposal.effectRequestId),
        effectRequestId =>
          HashMap.get(state.effectRequestsById, effectRequestId),
      )
      if (Option.isNone(maybeRequest)) {
        return Effect.fail(
          new AcceptanceAuthorityProposalDeferred({
            effectRequestId: proposal.effectRequestId,
            proposalId: proposal.proposalId,
            reason: 'EffectRequestPending',
          }),
        )
      }
      if (
        maybeRequest.value.causalMessageCategory !==
          causalOccurrence.messageCategory ||
        maybeRequest.value.causalPolicyGeneration !==
          causalOccurrence.policyGeneration ||
        !areAudiencesEqual(
          maybeRequest.value.causalAudience,
          causalOccurrence.audience,
        )
      ) {
        return Effect.fail(
          new AcceptanceAuthorityEffectResultMismatch({
            effectRequestId: proposal.effectRequestId,
            proposalId: proposal.proposalId,
            reason: 'WrongCausalRouting',
          }),
        )
      } else {
        return Effect.succeed(routingFromOccurrence(causalOccurrence))
      }
    }

    const routingForProposal = (
      state: AuthorityState,
      proposal: InstantMessageProposalRecord,
    ): Effect.Effect<
      CanonicalRouting,
      | AcceptanceAuthorityEffectResultMismatch
      | AcceptanceAuthorityEnvelopeError
      | AcceptanceAuthorityMessageCategoryError
      | AcceptanceAuthorityProposalDeferred
      | AcceptanceAuthoritySynchronizationPolicyMismatch
    > =>
      Effect.gen(function* () {
        const routing = yield* (() => {
          if (proposal.proposalKind === 'EffectResult') {
            return routingForEffectResult(state, proposal)
          } else {
            return Effect.flatMap(classifyProposedMessage(proposal), category =>
              resolveMessageRouting(
                session.sessionPolicy,
                category,
                proposal.originatingProcessorId,
                proposal.proposalId,
              ),
            )
          }
        })()
        yield* validateProposalRoutingClaims(proposal, routing)
        return routing
      })

    const routingForRecoveredOccurrence = (
      state: AuthorityState,
      occurrence: InstantAcceptedMessageOccurrenceRecordType,
    ): Effect.Effect<
      CanonicalRouting,
      | AcceptanceAuthorityEffectRequestRoutingMismatch
      | AcceptanceAuthorityEnvelopeError
      | AcceptanceAuthorityMessageCategoryError
      | AcceptanceAuthoritySynchronizationPolicyMismatch
    > => {
      if (occurrence.proposalKind === 'Message') {
        return Effect.flatMap(classifyAcceptedMessage(occurrence), category =>
          resolveMessageRouting(
            occurrence.sessionPolicy,
            category,
            occurrence.originatingProcessorId,
            occurrence.proposalId,
          ),
        )
      } else if (
        occurrence.causationId === null ||
        occurrence.effectRequestId === null
      ) {
        return Effect.fail(
          new AcceptanceAuthorityEffectRequestRoutingMismatch({
            causalOccurrenceId: occurrence.causationId,
            requestId: occurrence.effectRequestId,
          }),
        )
      } else {
        const maybeCausalOccurrence = HashMap.get(
          state.acceptedByOccurrenceId,
          occurrence.causationId,
        )
        if (Option.isNone(maybeCausalOccurrence)) {
          return Effect.fail(
            new AcceptanceAuthorityEffectRequestRoutingMismatch({
              causalOccurrenceId: occurrence.causationId,
              requestId: occurrence.effectRequestId,
            }),
          )
        } else {
          return decodeAccepted(occurrence).pipe(
            Effect.as(routingFromOccurrence(maybeCausalOccurrence.value)),
          )
        }
      }
    }

    const validateRecoveredRouting: ValidateRecoveredRouting = (
      state,
      occurrence,
    ) =>
      Effect.gen(function* () {
        const routing = yield* routingForRecoveredOccurrence(state, occurrence)
        yield* validateAcceptedRouting(occurrence, routing)
      })

    const recoverAcceptedOccurrences = (
      occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecordType>,
    ): Effect.Effect<void, AcceptanceAuthorityError> =>
      Effect.gen(function* () {
        const rejectedProposalIds = yield* SynchronizedRef.get(
          rejectedProposalIdsRef,
        )
        yield* Effect.forEach(
          occurrences,
          occurrence =>
            HashSet.has(rejectedProposalIds, occurrence.proposalId)
              ? Effect.fail(
                  new AdmissionSequencerTerminalConflict({
                    proposalId: occurrence.proposalId,
                  }),
                )
              : Effect.void,
          { concurrency: 1, discard: true },
        )
        yield* SynchronizedRef.updateEffect(stateRef, state =>
          Effect.flatMap(
            recoverAccepted(session, occurrences, validateRecoveredRouting),
            recovered => reconcileRecoveredAccepted(state, recovered),
          ),
        )
        const state = yield* SynchronizedRef.get(stateRef)
        yield* validateSessionPolicyHistory(
          state,
          session.sessionPolicy,
          session.sessionId,
        )
      })

    const recoverEffectRequests = (
      requests: ReadonlyArray<InstantEffectRequestRecord>,
    ): Effect.Effect<
      void,
      | AcceptanceAuthorityEffectRequestRoutingMismatch
      | AcceptanceAuthorityScopeMismatch
    > =>
      SynchronizedRef.updateEffect(stateRef, state =>
        recoverEffects(session, state, requests),
      )

    const recoverEffectPlacements = (
      placements: ReadonlyArray<InstantEffectPlacementRecordType>,
    ): Effect.Effect<
      void,
      AcceptanceAuthorityPlacementConflict | AcceptanceAuthorityScopeMismatch
    > =>
      SynchronizedRef.updateEffect(stateRef, state =>
        recoverPlacements(session, state, placements),
      )

    const setCurrentSession = (
      sessions: ReadonlyArray<InstantProgramSessionRecord>,
    ): Effect.Effect<void> =>
      SynchronizedRef.update(stateRef, state => ({
        ...state,
        maybeCurrentSession: Array.findFirst(
          sessions,
          candidate => candidate.id === session.id,
        ),
      }))

    const validateCurrentSession = (
      state: AuthorityState,
    ): Effect.Effect<
      InstantProgramSessionRecord,
      | AcceptanceAuthorityChanged
      | AcceptanceAuthoritySessionMissing
      | AcceptanceAuthoritySessionPolicyChanged
      | AcceptanceAuthoritySessionRevoked
      | AcceptanceAuthorityScopeMismatch
    > => {
      if (Option.isNone(state.maybeCurrentSession)) {
        return Effect.fail(
          new AcceptanceAuthoritySessionMissing({
            sessionId: session.sessionId,
          }),
        )
      }
      const currentSession = state.maybeCurrentSession.value
      const maybeScopeMismatch = scopeMismatch(session, currentSession)
      if (currentSession.id !== session.id) {
        return Effect.fail(
          new AcceptanceAuthoritySessionMissing({
            sessionId: session.sessionId,
          }),
        )
      }
      if (Option.isSome(maybeScopeMismatch)) {
        return Effect.fail(maybeScopeMismatch.value)
      }
      if (currentSession.isRevoked) {
        return Effect.fail(
          new AcceptanceAuthoritySessionRevoked({
            sessionId: currentSession.sessionId,
          }),
        )
      }
      if (
        currentSession.authorityProcessorId !== session.authorityProcessorId
      ) {
        return Effect.fail(
          new AcceptanceAuthorityChanged({
            actualProcessorId: currentSession.authorityProcessorId,
            expectedProcessorId: session.authorityProcessorId,
            sessionId: session.sessionId,
          }),
        )
      }
      if (
        encodeSessionPolicy(currentSession.sessionPolicy) !==
        encodeSessionPolicy(session.sessionPolicy)
      ) {
        return Effect.fail(
          new AcceptanceAuthoritySessionPolicyChanged({
            actualPolicy: currentSession.sessionPolicy,
            expectedPolicy: session.sessionPolicy,
            sessionId: session.sessionId,
          }),
        )
      }
      return validateSessionPolicyHistory(
        state,
        currentSession.sessionPolicy,
        currentSession.sessionId,
      ).pipe(Effect.as(currentSession))
    }

    const admit = (
      proposal: InstantMessageProposalRecord,
    ): Effect.Effect<
      InstantAcceptedMessageOccurrenceRecordType,
      AcceptanceAuthorityError
    > =>
      SynchronizedRef.modifyEffect(stateRef, state =>
        Effect.gen(function* () {
          const currentSession = yield* validateCurrentSession(state)
          yield* validateRecoveredEffectResults(state)
          yield* validateProposalKind(proposal)
          const maybeScopeMismatch = scopeMismatch(session, proposal)
          if (Option.isSome(maybeScopeMismatch)) {
            return yield* Effect.fail(maybeScopeMismatch.value)
          }

          const rejectedProposalIds = yield* SynchronizedRef.get(
            rejectedProposalIdsRef,
          )
          if (HashSet.has(rejectedProposalIds, proposal.proposalId)) {
            return yield* Effect.fail(
              new AdmissionSequencerTerminalConflict({
                proposalId: proposal.proposalId,
              }),
            )
          }

          const maybeByProposal = HashMap.get(
            state.acceptedByProposalId,
            proposal.proposalId,
          )
          if (Option.isSome(maybeByProposal)) {
            if (
              validateProposalAgainstAccepted(proposal, maybeByProposal.value)
            ) {
              return Tuple.make(maybeByProposal.value, state)
            } else {
              return yield* Effect.fail(
                new AcceptanceAuthorityIdentityConflict({
                  identity: proposal.proposalId,
                  identityKind: 'Proposal',
                }),
              )
            }
          }

          const maybeByOccurrence = HashMap.get(
            state.acceptedByOccurrenceId,
            proposal.occurrenceId,
          )
          if (Option.isSome(maybeByOccurrence)) {
            return yield* Effect.fail(
              new AcceptanceAuthorityIdentityConflict({
                identity: proposal.occurrenceId,
                identityKind: 'Occurrence',
              }),
            )
          }

          yield* validateProposalActorSequence(state, proposal)
          yield* validateEffectResult(state, proposal)
          const routing = yield* routingForProposal(state, proposal)
          const maybeEffectRequest =
            proposal.effectRequestId === null
              ? Option.none<InstantEffectRequestRecord>()
              : HashMap.get(state.effectRequestsById, proposal.effectRequestId)
          const acceptedAtMs = now()
          const acceptedSequence = state.nextAcceptedSequence
          const envelopeJson = yield* acceptEnvelope(proposal, {
            acceptedAtMs,
            acceptedSequence,
            acceptingProcessorId: currentSession.authorityProcessorId,
            effectRequest: Option.getOrUndefined(maybeEffectRequest),
          }).pipe(
            Effect.mapError(
              cause =>
                new AcceptanceAuthorityEnvelopeError({
                  cause,
                  proposalId: proposal.proposalId,
                }),
            ),
          )

          if (
            proposal.proposalKind === 'Message' &&
            proposal.messageIdempotencyKey !== null
          ) {
            const maybeAcceptedMessage = HashMap.get(
              state.acceptedByMessageIdempotencyKey,
              proposal.messageIdempotencyKey,
            )
            if (Option.isSome(maybeAcceptedMessage)) {
              if (
                isMatchingAcceptedMessageAlias(
                  proposal,
                  maybeAcceptedMessage.value,
                )
              ) {
                return Tuple.make(maybeAcceptedMessage.value, state)
              } else {
                return yield* Effect.fail(
                  new AcceptanceAuthorityIdentityConflict({
                    identity: proposal.messageIdempotencyKey,
                    identityKind: 'MessageIdempotencyKey',
                  }),
                )
              }
            }
          }

          if (
            proposal.proposalKind === 'EffectResult' &&
            proposal.effectIdempotencyKey !== null
          ) {
            const maybeAcceptedEffect = HashMap.get(
              state.acceptedByEffectIdempotencyKey,
              proposal.effectIdempotencyKey,
            )
            if (Option.isSome(maybeAcceptedEffect)) {
              if (
                isMatchingAcceptedEffectAlias(
                  proposal,
                  maybeAcceptedEffect.value,
                )
              ) {
                return Tuple.make(maybeAcceptedEffect.value, state)
              } else {
                return yield* Effect.fail(
                  new AcceptanceAuthorityIdentityConflict({
                    identity: proposal.effectIdempotencyKey,
                    identityKind: 'EffectIdempotencyKey',
                  }),
                )
              }
            }
          }
          const occurrence = InstantAcceptedMessageOccurrenceRecord.make({
            acceptedAtMs,
            acceptedSequence,
            acceptingProcessorId: currentSession.authorityProcessorId,
            actorId: proposal.actorId,
            actorSequence: proposal.actorSequence,
            audience: routing.audience,
            causationId: proposal.causationOccurrenceId,
            clientId: proposal.clientId,
            correlationId: proposal.correlationId,
            createdAtMs: proposal.createdAtMs,
            effectAssignmentGeneration: proposal.effectAssignmentGeneration,
            effectCancellationGeneration: proposal.effectCancellationGeneration,
            effectIdempotencyKey: proposal.effectIdempotencyKey,
            effectRequestId: proposal.effectRequestId,
            envelopeJson,
            envelopeVersion: proposal.envelopeVersion,
            eventId: proposal.eventId,
            eventVersion: proposal.eventVersion,
            executorProcessorId: proposal.executorProcessorId,
            id: proposal.occurrenceId,
            messageCategory: routing.messageCategory,
            messageIdempotencyKey: proposal.messageIdempotencyKey,
            occurrenceId: proposal.occurrenceId,
            originDeviceId: proposal.originDeviceId,
            originatingProcessorId: proposal.originatingProcessorId,
            payloadJson: proposal.payloadJson,
            positionKey: makeAcceptedOccurrencePositionKey(
              proposal.sessionId,
              acceptedSequence,
            ),
            programId: proposal.programId,
            programVersion: proposal.programVersion,
            protocolVersion: proposal.protocolVersion,
            proposedEnvelopeJson: proposal.envelopeJson,
            proposalId: proposal.proposalId,
            proposalKind: proposal.proposalKind,
            policyGeneration: routing.policyGeneration,
            sessionPolicy: routing.sessionPolicy,
            sessionId: proposal.sessionId,
            subjectId: proposal.subjectId,
          })
          yield* validateRecoveredRouting(state, occurrence)
          yield* store.appendServerConfirmedAcceptedMessageOccurrence(
            occurrence,
          )
          const nextState = yield* insertRecoveredOccurrence(
            session,
            state,
            occurrence,
            validateRecoveredRouting,
          )
          return Tuple.make(occurrence, nextState)
        }),
      )

    const persistProposalResolution = (
      proposal: InstantMessageProposalRecord,
      rejectionReason: InstantMessageProposalRejectionReason,
    ): Effect.Effect<
      void,
      AdmissionSequencerResolutionWriteNotSynced | ProgramStoreError
    > =>
      Effect.gen(function* () {
        const resolution = InstantMessageProposalResolutionRecord.make({
          actorId: proposal.actorId,
          actorSequence: proposal.actorSequence,
          clientId: proposal.clientId,
          id: proposal.proposalId,
          programId: session.programId,
          programVersion: session.programVersion,
          protocolVersion: session.protocolVersion,
          proposalId: proposal.proposalId,
          rejectedAtMs: now(),
          rejectingProcessorId: session.authorityProcessorId,
          rejectionReason,
          sessionId: session.sessionId,
          subjectId: session.subjectId,
        })
        yield* store.appendServerConfirmedMessageProposalResolution(resolution)
        yield* SynchronizedRef.update(rejectedProposalIdsRef, proposalIds =>
          HashSet.add(proposalIds, proposal.proposalId),
        )
        yield* SynchronizedRef.update(
          synchronizedResolutionProposalIdsRef,
          proposalIds => HashSet.add(proposalIds, proposal.proposalId),
        )
      })

    const rejectProposal = (
      proposal: InstantMessageProposalRecord,
      rejection: AdmissionSequencerProposalRejection,
    ): Effect.Effect<
      void,
      AdmissionSequencerResolutionWriteNotSynced | ProgramStoreError
    > =>
      Effect.gen(function* () {
        yield* persistProposalResolution(
          proposal,
          messageProposalRejectionReason(rejection),
        )
        yield* onProposalRejected(proposal, rejection)
      })

    const resolveAcceptedAlias = (
      proposal: InstantMessageProposalRecord,
    ): Effect.Effect<
      void,
      AdmissionSequencerResolutionWriteNotSynced | ProgramStoreError
    > =>
      persistProposalResolution(
        proposal,
        InstantMessageProposalRejectionReason.make(
          proposal.proposalKind === 'Message'
            ? 'DuplicateMessage'
            : 'DuplicateEffectResult',
        ),
      )

    const scope = {
      sessionId: session.sessionId,
      subjectId: session.subjectId,
    }
    const observations = store.serverConfirmed
    const snapshots = Stream.zipLatest(
      Stream.zipLatest(
        Stream.zipLatest(
          observations.observeAcceptedMessageOccurrences(scope),
          observations.observeEffectRequests(scope),
        ),
        Stream.zipLatest(
          observations.observeEffectPlacements(scope),
          Stream.zipLatest(
            observations.observeMessageProposals(scope),
            observations.observeMessageProposalResolutions(scope),
          ),
        ),
      ),
      Stream.zipLatest(
        observations.observeProgramSessions(scope),
        observations.observeConnectionStatus,
      ),
    )
    const run = Stream.runForEach(
      snapshots,
      ([
        [
          [occurrences, effectRequests],
          [effectPlacements, [proposals, proposalResolutions]],
        ],
        [sessions, connectionStatus],
      ]) =>
        Effect.gen(function* () {
          yield* setCurrentSession(sessions)
          if (connectionStatus !== 'authenticated') {
            return
          }
          const state = yield* SynchronizedRef.get(stateRef)
          yield* validateCurrentSession(state)
          yield* recoverAcceptedOccurrences(occurrences)
          yield* recoverEffectRequests(effectRequests)
          yield* recoverEffectPlacements(effectPlacements)
          yield* SynchronizedRef.get(stateRef).pipe(
            Effect.flatMap(validateRecoveredEffectResults),
          )
          const validatedResolutionProposals = yield* SynchronizedRef.get(
            stateRef,
          ).pipe(
            Effect.flatMap(currentState =>
              validateResolutionProposals(
                session,
                currentState,
                proposals,
                proposalResolutions,
              ),
            ),
          )
          yield* SynchronizedRef.update(rejectedProposalIdsRef, proposalIds =>
            Array.reduce(
              validatedResolutionProposals,
              proposalIds,
              (nextProposalIds, proposal) =>
                HashSet.add(nextProposalIds, proposal.proposalId),
            ),
          )
          yield* SynchronizedRef.update(
            synchronizedResolutionProposalIdsRef,
            proposalIds =>
              Array.reduce(
                proposalResolutions,
                proposalIds,
                (nextProposalIds, resolution) =>
                  HashSet.add(nextProposalIds, resolution.proposalId),
              ),
          )
          const synchronizedResolutionProposalIds = yield* SynchronizedRef.get(
            synchronizedResolutionProposalIdsRef,
          )
          const resolvedProposalIds = Array.reduce(
            proposalResolutions,
            synchronizedResolutionProposalIds,
            (nextProposalIds, resolution) =>
              HashSet.add(nextProposalIds, resolution.proposalId),
          )
          const unresolvedProposals = Array.filter(
            Array.sort(proposals, proposalOrder),
            proposal => !HashSet.has(resolvedProposalIds, proposal.proposalId),
          )
          const initialDeferredStreams: Effect.Effect<
            HashSet.HashSet<string>,
            AcceptanceAuthorityError
          > = Effect.succeed(HashSet.empty())
          yield* Array.reduce(
            unresolvedProposals,
            initialDeferredStreams,
            (deferredStreamsEffect, proposal) =>
              Effect.flatMap(deferredStreamsEffect, deferredStreams => {
                const streamKey = actorSequenceStreamKey(proposal)
                if (HashSet.has(deferredStreams, streamKey)) {
                  return Effect.succeed(deferredStreams)
                } else {
                  return admit(proposal).pipe(
                    Effect.flatMap(occurrence =>
                      occurrence.proposalId === proposal.proposalId
                        ? Effect.void
                        : resolveAcceptedAlias(proposal),
                    ),
                    Effect.as(false),
                    Effect.catchIf(isProposalRejection, rejection =>
                      rejectProposal(proposal, rejection).pipe(
                        Effect.as(false),
                      ),
                    ),
                    Effect.catchTag('AcceptanceAuthorityProposalDeferred', () =>
                      Effect.succeed(true),
                    ),
                    Effect.map(isDeferred =>
                      isDeferred
                        ? HashSet.add(deferredStreams, streamKey)
                        : deferredStreams,
                    ),
                  )
                }
              }),
          )
        }),
    ).pipe(Effect.flatMap(() => Effect.never))

    return {
      admit,
      recoverAcceptedOccurrences,
      recoverEffectPlacements,
      recoverEffectRequests,
      run,
    }
  })

/** Compatibility constructor for the portable admission sequencer. */
export const makeAcceptanceAuthority = makeAdmissionSequencer
