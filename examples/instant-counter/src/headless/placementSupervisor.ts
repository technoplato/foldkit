import {
  Array,
  Data,
  Effect,
  Option,
  Order,
  Ref,
  Schema as S,
  Stream,
  Tuple,
} from 'effect'
import { Processor, Synchronization } from 'foldkit'

import {
  InstantAcceptedMessageOccurrenceRecord,
  type InstantAcceptedMessageOccurrenceValidationIssue,
  type InstantEffectPlacementRecord,
  InstantEffectRequestRecord,
  type InstantMessageProposalRecord,
  type InstantMessageProposalResolutionRecord,
  type InstantProgramSessionRecord,
  type ProcessorRoomService,
  type ProgramAuthorityStoreService,
  type SharedProgramCodecError,
  type SharedProgramMessageCodec,
  type SharedProgramProcessorService,
  instantAcceptedMessageOccurrenceValidationIssue,
  isInstantMessageProposalKindValid,
} from '@foldkit/instant'

import { commandForEffect } from '../domain/effect.js'
import { Message, type RequestedEffect } from '../domain/message.js'
import type { Model } from '../domain/model.js'
import { InstantCounterSynchronization } from '../domain/program.js'
import { isEffectPlacementEventId } from '../domain/wire.js'
import { decodeProcessorPresence } from '../shared/presence.js'
import {
  type EffectPlacementOrigin,
  makeEffectPlacementRecord,
  makeEffectRequestRecord,
  placementFact,
} from './placement.js'
import {
  type PlacementGeneration,
  replanEffectPlacement,
} from './placementLifecycle.js'

type AcceptedEffectRequest = Readonly<{
  envelope: Processor.MessageEnvelope
  message: RequestedEffect
  occurrence: InstantAcceptedMessageOccurrenceRecord
  origin: EffectPlacementOrigin
}>

type AcceptedHistory = Readonly<{
  acceptedOccurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>
  effectRequests: ReadonlyArray<AcceptedEffectRequest>
  messagesByOccurrenceId: ReadonlyMap<string, Message>
}>

type AcceptedHistoryCache = Readonly<{
  fingerprint: string
  history: AcceptedHistory
}>

/** A durable effect request conflicts with its accepted causative Message. */
export class EffectRequestConflict extends Data.TaggedError(
  'EffectRequestConflict',
)<{
  readonly requestId: string
}> {}

/** An accepted occurrence is not canonical for the configured v2 session. */
export class EffectPlacementAcceptedOccurrenceMismatch extends Data.TaggedError(
  'EffectPlacementAcceptedOccurrenceMismatch',
)<{
  readonly occurrenceId: string
  readonly reason:
    | InstantAcceptedMessageOccurrenceValidationIssue
    | 'AcceptingProcessor'
    | 'AudienceClaim'
    | 'CausalRoutingMissing'
    | 'FuturePolicyGeneration'
    | 'MessageCategoryClaim'
    | 'PolicyGenerationDecreased'
    | 'PolicyGenerationClaim'
    | 'ProgramId'
    | 'ProgramVersion'
    | 'ProtocolVersion'
    | 'ReadOnlyFollower'
    | 'SessionId'
    | 'SessionPolicyClaim'
    | 'SubjectId'
}> {}

/** Accepted history reused a durable sequence or identity for another row. */
export class EffectPlacementAcceptedHistoryConflict extends Data.TaggedError(
  'EffectPlacementAcceptedHistoryConflict',
)<{
  readonly acceptedSequence: number
  readonly identity: string
  readonly identityKind:
    | 'AcceptedSequence'
    | 'MessageIdempotencyKey'
    | 'Occurrence'
    | 'Proposal'
  readonly occurrenceId: string
}> {}

/** An observed placement escaped the configured authenticated Program scope. */
export class EffectPlacementRecordScopeMismatch extends Data.TaggedError(
  'EffectPlacementRecordScopeMismatch',
)<{
  readonly positionKey: string
  readonly reason:
    | 'ProgramId'
    | 'ProgramVersion'
    | 'ProtocolVersion'
    | 'SessionId'
    | 'SubjectId'
}> {}

/** The trusted Program classifier failed while validating accepted routing. */
export class EffectPlacementMessageCategoryError extends Data.TaggedError(
  'EffectPlacementMessageCategoryError',
)<{
  readonly cause: unknown
  readonly occurrenceId: string
}> {}

/** A terminal proposal resolution is not canonical for the configured session. */
export class EffectPlacementResolutionMismatch extends Data.TaggedError(
  'EffectPlacementResolutionMismatch',
)<{
  readonly proposalId: string
  readonly reason:
    | 'ProgramId'
    | 'ProgramVersion'
    | 'ProtocolVersion'
    | 'RejectingProcessor'
    | 'AcceptedAndRejected'
    | 'ActorId'
    | 'ActorSequence'
    | 'ClientId'
    | 'DuplicateProposal'
    | 'DuplicateResolution'
    | 'MissingProposal'
    | 'ProposalIdentity'
    | 'ProposalScope'
    | 'SessionId'
    | 'SubjectId'
}> {}

/** Inputs for the authority-owned durable effect placement reconciler. */
export type EffectPlacementSupervisorConfig = Readonly<{
  codec: SharedProgramMessageCodec<Message, Processor.MessageEnvelope>
  processor: SharedProgramProcessorService<Model, Message>
  room: ProcessorRoomService
  session: InstantProgramSessionRecord
  store: ProgramAuthorityStoreService
}>

const placementOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (placement: InstantEffectPlacementRecord) => placement.assignmentGeneration,
  ),
  Order.mapInput(
    Order.Number,
    (placement: InstantEffectPlacementRecord) =>
      placement.cancellationGeneration,
  ),
)

const acceptedOrder = Order.mapInput(
  Order.Number,
  (occurrence: InstantAcceptedMessageOccurrenceRecord) =>
    occurrence.acceptedSequence,
)

const requestRecordEquivalence = S.toEquivalence(InstantEffectRequestRecord)
const acceptedOccurrenceEquivalence = S.toEquivalence(
  InstantAcceptedMessageOccurrenceRecord,
)
const audienceEquivalence = S.toEquivalence(Synchronization.Audience)
const sessionPolicyEquivalence = S.toEquivalence(Synchronization.SessionPolicy)
const messageEquivalence = S.toEquivalence(Message)
const AcceptedOccurrencesJson = S.fromJsonString(
  S.Array(InstantAcceptedMessageOccurrenceRecord),
)

type FrozenRouting = Readonly<{
  audience: Synchronization.Audience
  messageCategory: Synchronization.MessageCategory
  policyGeneration: number
  sessionPolicy: Synchronization.SessionPolicy
}>

const failAcceptedOccurrence = (
  occurrence: InstantAcceptedMessageOccurrenceRecord,
  reason: EffectPlacementAcceptedOccurrenceMismatch['reason'],
): Effect.Effect<never, EffectPlacementAcceptedOccurrenceMismatch> =>
  Effect.fail(
    new EffectPlacementAcceptedOccurrenceMismatch({
      occurrenceId: occurrence.occurrenceId,
      reason,
    }),
  )

const validateAcceptedOccurrenceScope = (
  session: InstantProgramSessionRecord,
  occurrence: InstantAcceptedMessageOccurrenceRecord,
): Effect.Effect<void, EffectPlacementAcceptedOccurrenceMismatch> => {
  const maybeValidationIssue =
    instantAcceptedMessageOccurrenceValidationIssue(occurrence)
  if (Option.isSome(maybeValidationIssue)) {
    return failAcceptedOccurrence(occurrence, maybeValidationIssue.value)
  } else if (occurrence.programId !== session.programId) {
    return failAcceptedOccurrence(occurrence, 'ProgramId')
  } else if (occurrence.programVersion !== session.programVersion) {
    return failAcceptedOccurrence(occurrence, 'ProgramVersion')
  } else if (occurrence.protocolVersion !== session.protocolVersion) {
    return failAcceptedOccurrence(occurrence, 'ProtocolVersion')
  } else if (occurrence.sessionId !== session.sessionId) {
    return failAcceptedOccurrence(occurrence, 'SessionId')
  } else if (occurrence.subjectId !== session.subjectId) {
    return failAcceptedOccurrence(occurrence, 'SubjectId')
  } else if (occurrence.acceptingProcessorId !== session.authorityProcessorId) {
    return failAcceptedOccurrence(occurrence, 'AcceptingProcessor')
  } else {
    return Effect.void
  }
}

const validateAcceptedPolicyHistory = (
  session: InstantProgramSessionRecord,
  occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
): Effect.Effect<void, EffectPlacementAcceptedOccurrenceMismatch> => {
  const initialState: Effect.Effect<
    readonly [
      Option.Option<number>,
      ReadonlyMap<number, Synchronization.SessionPolicy>,
    ],
    EffectPlacementAcceptedOccurrenceMismatch
  > = Effect.succeed(
    Tuple.make(
      Option.none<number>(),
      new Map<number, Synchronization.SessionPolicy>(),
    ),
  )
  return Array.reduce(
    Array.sort(occurrences, acceptedOrder),
    initialState,
    (stateEffect, occurrence) =>
      Effect.flatMap(
        stateEffect,
        ([maybeLastGeneration, policiesByGeneration]) => {
          const canonicalPolicy = policiesByGeneration.get(
            occurrence.policyGeneration,
          )
          if (occurrence.policyGeneration > session.sessionPolicy.generation) {
            return failAcceptedOccurrence(occurrence, 'FuturePolicyGeneration')
          } else if (
            Option.isSome(maybeLastGeneration) &&
            occurrence.policyGeneration < maybeLastGeneration.value
          ) {
            return failAcceptedOccurrence(
              occurrence,
              'PolicyGenerationDecreased',
            )
          } else if (
            canonicalPolicy !== undefined &&
            !sessionPolicyEquivalence(canonicalPolicy, occurrence.sessionPolicy)
          ) {
            return failAcceptedOccurrence(occurrence, 'SessionPolicyClaim')
          } else if (
            occurrence.policyGeneration === session.sessionPolicy.generation &&
            !sessionPolicyEquivalence(
              occurrence.sessionPolicy,
              session.sessionPolicy,
            )
          ) {
            return failAcceptedOccurrence(occurrence, 'SessionPolicyClaim')
          } else {
            const nextPoliciesByGeneration = new Map(policiesByGeneration)
            nextPoliciesByGeneration.set(
              occurrence.policyGeneration,
              occurrence.sessionPolicy,
            )
            return Effect.succeed(
              Tuple.make(
                Option.some(occurrence.policyGeneration),
                nextPoliciesByGeneration,
              ),
            )
          }
        },
      ),
  ).pipe(Effect.asVoid)
}

const classifyAcceptedMessage = (
  occurrence: InstantAcceptedMessageOccurrenceRecord,
  message: Message,
): Effect.Effect<
  Synchronization.MessageCategory,
  EffectPlacementMessageCategoryError
> =>
  Effect.try({
    try: () =>
      S.decodeUnknownSync(Synchronization.MessageCategory)(
        InstantCounterSynchronization.messageCategory(message),
      ),
    catch: cause =>
      new EffectPlacementMessageCategoryError({
        cause,
        occurrenceId: occurrence.occurrenceId,
      }),
  })

const validateAcceptedRoutingClaims = (
  occurrence: InstantAcceptedMessageOccurrenceRecord,
  routing: FrozenRouting,
): Effect.Effect<void, EffectPlacementAcceptedOccurrenceMismatch> => {
  if (occurrence.messageCategory !== routing.messageCategory) {
    return failAcceptedOccurrence(occurrence, 'MessageCategoryClaim')
  } else if (
    occurrence.policyGeneration !== routing.policyGeneration ||
    occurrence.policyGeneration !== occurrence.sessionPolicy.generation
  ) {
    return failAcceptedOccurrence(occurrence, 'PolicyGenerationClaim')
  } else if (
    !sessionPolicyEquivalence(occurrence.sessionPolicy, routing.sessionPolicy)
  ) {
    return failAcceptedOccurrence(occurrence, 'SessionPolicyClaim')
  } else if (!audienceEquivalence(occurrence.audience, routing.audience)) {
    return failAcceptedOccurrence(occurrence, 'AudienceClaim')
  } else {
    return Effect.void
  }
}

const routingForAcceptedMessage = (
  occurrence: InstantAcceptedMessageOccurrenceRecord,
  message: Message,
): Effect.Effect<
  FrozenRouting,
  | EffectPlacementAcceptedOccurrenceMismatch
  | EffectPlacementMessageCategoryError
> =>
  Effect.flatMap(
    classifyAcceptedMessage(occurrence, message),
    messageCategory => {
      const audience = Synchronization.resolveAudience(
        occurrence.sessionPolicy,
        messageCategory,
        occurrence.originatingProcessorId,
      )
      if (audience._tag === 'ReadOnlyFollowerRejected') {
        return failAcceptedOccurrence(occurrence, 'ReadOnlyFollower')
      } else {
        return Effect.succeed({
          audience,
          messageCategory,
          policyGeneration: occurrence.sessionPolicy.generation,
          sessionPolicy: occurrence.sessionPolicy,
        })
      }
    },
  )

const validateResolutionScope = (
  session: InstantProgramSessionRecord,
  resolution: InstantMessageProposalResolutionRecord,
): Effect.Effect<void, EffectPlacementResolutionMismatch> => {
  const fail = (
    reason: EffectPlacementResolutionMismatch['reason'],
  ): Effect.Effect<never, EffectPlacementResolutionMismatch> =>
    Effect.fail(
      new EffectPlacementResolutionMismatch({
        proposalId: resolution.proposalId,
        reason,
      }),
    )
  if (resolution.programId !== session.programId) {
    return fail('ProgramId')
  } else if (resolution.programVersion !== session.programVersion) {
    return fail('ProgramVersion')
  } else if (resolution.protocolVersion !== session.protocolVersion) {
    return fail('ProtocolVersion')
  } else if (resolution.sessionId !== session.sessionId) {
    return fail('SessionId')
  } else if (resolution.subjectId !== session.subjectId) {
    return fail('SubjectId')
  } else if (resolution.rejectingProcessorId !== session.authorityProcessorId) {
    return fail('RejectingProcessor')
  } else {
    return Effect.void
  }
}

const validateTerminalEvidence = (
  session: InstantProgramSessionRecord,
  occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
  proposals: ReadonlyArray<InstantMessageProposalRecord>,
  resolutions: ReadonlyArray<InstantMessageProposalResolutionRecord>,
): Effect.Effect<void, EffectPlacementResolutionMismatch> => {
  const acceptedProposalIds = new Set(
    Array.map(occurrences, occurrence => occurrence.proposalId),
  )
  const initialResolutionProposalIds: Effect.Effect<
    ReadonlySet<string>,
    EffectPlacementResolutionMismatch
  > = Effect.succeed(new Set())
  const uniqueResolutions = Array.reduce(
    resolutions,
    initialResolutionProposalIds,
    (proposalIdsEffect, resolution) =>
      Effect.flatMap(proposalIdsEffect, proposalIds => {
        if (proposalIds.has(resolution.proposalId)) {
          return Effect.fail(
            new EffectPlacementResolutionMismatch({
              proposalId: resolution.proposalId,
              reason: 'DuplicateResolution',
            }),
          )
        } else {
          return Effect.succeed(
            new Set([...proposalIds, resolution.proposalId]),
          )
        }
      }),
  )
  return Effect.andThen(
    uniqueResolutions,
    Effect.forEach(
      resolutions,
      resolution =>
        Effect.gen(function* () {
          yield* validateResolutionScope(session, resolution)
          if (acceptedProposalIds.has(resolution.proposalId)) {
            return yield* Effect.fail(
              new EffectPlacementResolutionMismatch({
                proposalId: resolution.proposalId,
                reason: 'AcceptedAndRejected',
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
              new EffectPlacementResolutionMismatch({
                proposalId: resolution.proposalId,
                reason: 'MissingProposal',
              }),
            )
          }
          if (Option.isSome(Array.get(matchingProposals, 1))) {
            return yield* Effect.fail(
              new EffectPlacementResolutionMismatch({
                proposalId: resolution.proposalId,
                reason: 'DuplicateProposal',
              }),
            )
          }
          const proposal = maybeProposal.value
          if (
            proposal.programId !== session.programId ||
            proposal.programVersion !== session.programVersion ||
            proposal.protocolVersion !== session.protocolVersion ||
            proposal.sessionId !== session.sessionId ||
            proposal.subjectId !== session.subjectId
          ) {
            return yield* Effect.fail(
              new EffectPlacementResolutionMismatch({
                proposalId: resolution.proposalId,
                reason: 'ProposalScope',
              }),
            )
          }
          if (
            resolution.id !== resolution.proposalId ||
            proposal.id !== proposal.proposalId
          ) {
            return yield* Effect.fail(
              new EffectPlacementResolutionMismatch({
                proposalId: resolution.proposalId,
                reason: 'ProposalIdentity',
              }),
            )
          }
          if (resolution.actorId !== proposal.actorId) {
            return yield* Effect.fail(
              new EffectPlacementResolutionMismatch({
                proposalId: resolution.proposalId,
                reason: 'ActorId',
              }),
            )
          }
          if (resolution.clientId !== proposal.clientId) {
            return yield* Effect.fail(
              new EffectPlacementResolutionMismatch({
                proposalId: resolution.proposalId,
                reason: 'ClientId',
              }),
            )
          }
          if (resolution.actorSequence !== proposal.actorSequence) {
            return yield* Effect.fail(
              new EffectPlacementResolutionMismatch({
                proposalId: resolution.proposalId,
                reason: 'ActorSequence',
              }),
            )
          }
        }),
      { concurrency: 1, discard: true },
    ),
  )
}

const validatePlacementScope = (
  session: InstantProgramSessionRecord,
  placement: InstantEffectPlacementRecord,
): Effect.Effect<void, EffectPlacementRecordScopeMismatch> => {
  const fail = (
    reason: EffectPlacementRecordScopeMismatch['reason'],
  ): Effect.Effect<never, EffectPlacementRecordScopeMismatch> =>
    Effect.fail(
      new EffectPlacementRecordScopeMismatch({
        positionKey: placement.positionKey,
        reason,
      }),
    )
  if (placement.programId !== session.programId) {
    return fail('ProgramId')
  } else if (placement.programVersion !== session.programVersion) {
    return fail('ProgramVersion')
  } else if (placement.protocolVersion !== session.protocolVersion) {
    return fail('ProtocolVersion')
  } else if (placement.sessionId !== session.sessionId) {
    return fail('SessionId')
  } else if (placement.subjectId !== session.subjectId) {
    return fail('SubjectId')
  } else {
    return Effect.void
  }
}

type AcceptedOccurrenceIndex = Readonly<{
  byMessageIdempotencyKey: ReadonlyMap<
    string,
    InstantAcceptedMessageOccurrenceRecord
  >
  byOccurrenceId: ReadonlyMap<string, InstantAcceptedMessageOccurrenceRecord>
  byProposalId: ReadonlyMap<string, InstantAcceptedMessageOccurrenceRecord>
  bySequence: ReadonlyMap<number, InstantAcceptedMessageOccurrenceRecord>
}>

const emptyAcceptedOccurrenceIndex = (): AcceptedOccurrenceIndex => ({
  byMessageIdempotencyKey: new Map(),
  byOccurrenceId: new Map(),
  byProposalId: new Map(),
  bySequence: new Map(),
})

const failAcceptedHistoryConflict = (
  occurrence: InstantAcceptedMessageOccurrenceRecord,
  identity: string,
  identityKind: EffectPlacementAcceptedHistoryConflict['identityKind'],
): Effect.Effect<never, EffectPlacementAcceptedHistoryConflict> =>
  Effect.fail(
    new EffectPlacementAcceptedHistoryConflict({
      acceptedSequence: occurrence.acceptedSequence,
      identity,
      identityKind,
      occurrenceId: occurrence.occurrenceId,
    }),
  )

const indexAcceptedOccurrences = (
  initialIndex: AcceptedOccurrenceIndex,
  occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
): Effect.Effect<
  AcceptedOccurrenceIndex,
  EffectPlacementAcceptedHistoryConflict
> => {
  const initialIndexEffect: Effect.Effect<
    AcceptedOccurrenceIndex,
    EffectPlacementAcceptedHistoryConflict
  > = Effect.succeed(initialIndex)
  return Array.reduce(
    Array.sort(occurrences, acceptedOrder),
    initialIndexEffect,
    (indexEffect, occurrence) =>
      Effect.flatMap(indexEffect, index => {
        const occurrenceAtSequence = index.bySequence.get(
          occurrence.acceptedSequence,
        )
        if (occurrenceAtSequence !== undefined) {
          if (acceptedOccurrenceEquivalence(occurrenceAtSequence, occurrence)) {
            return Effect.succeed(index)
          } else {
            return failAcceptedHistoryConflict(
              occurrence,
              String(occurrence.acceptedSequence),
              'AcceptedSequence',
            )
          }
        }
        if (index.byOccurrenceId.has(occurrence.occurrenceId)) {
          return failAcceptedHistoryConflict(
            occurrence,
            occurrence.occurrenceId,
            'Occurrence',
          )
        }
        if (index.byProposalId.has(occurrence.proposalId)) {
          return failAcceptedHistoryConflict(
            occurrence,
            occurrence.proposalId,
            'Proposal',
          )
        }
        if (
          occurrence.messageIdempotencyKey !== null &&
          index.byMessageIdempotencyKey.has(occurrence.messageIdempotencyKey)
        ) {
          return failAcceptedHistoryConflict(
            occurrence,
            occurrence.messageIdempotencyKey,
            'MessageIdempotencyKey',
          )
        }
        const nextByMessageIdempotencyKey = new Map(
          index.byMessageIdempotencyKey,
        )
        const nextByOccurrenceId = new Map(index.byOccurrenceId)
        const nextByProposalId = new Map(index.byProposalId)
        const nextBySequence = new Map(index.bySequence)
        nextByOccurrenceId.set(occurrence.occurrenceId, occurrence)
        if (occurrence.messageIdempotencyKey !== null) {
          nextByMessageIdempotencyKey.set(
            occurrence.messageIdempotencyKey,
            occurrence,
          )
        }
        nextByProposalId.set(occurrence.proposalId, occurrence)
        nextBySequence.set(occurrence.acceptedSequence, occurrence)
        return Effect.succeed({
          byMessageIdempotencyKey: nextByMessageIdempotencyKey,
          byOccurrenceId: nextByOccurrenceId,
          byProposalId: nextByProposalId,
          bySequence: nextBySequence,
        })
      }),
  )
}

const contiguousAcceptedPrefix = (
  index: AcceptedOccurrenceIndex,
): ReadonlyArray<InstantAcceptedMessageOccurrenceRecord> =>
  Array.takeWhile(
    Array.sort(Array.fromIterable(index.bySequence.values()), acceptedOrder),
    (occurrence, index) => occurrence.acceptedSequence === index + 1,
  )

const extendCanonicalAcceptedPrefix = (
  session: InstantProgramSessionRecord,
  initialIndex: AcceptedOccurrenceIndex,
  occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
): Effect.Effect<
  readonly [
    AcceptedOccurrenceIndex,
    ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
  ],
  | EffectPlacementAcceptedHistoryConflict
  | EffectPlacementAcceptedOccurrenceMismatch
> =>
  Effect.gen(function* () {
    yield* Effect.forEach(
      occurrences,
      occurrence => validateAcceptedOccurrenceScope(session, occurrence),
      { concurrency: 1, discard: true },
    )
    const nextIndex = yield* indexAcceptedOccurrences(initialIndex, occurrences)
    return Tuple.make(nextIndex, contiguousAcceptedPrefix(nextIndex))
  })

const acceptedEffectRequests = (
  codec: SharedProgramMessageCodec<Message, Processor.MessageEnvelope>,
  session: InstantProgramSessionRecord,
  occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
): Effect.Effect<
  AcceptedHistory,
  | EffectPlacementAcceptedOccurrenceMismatch
  | EffectPlacementMessageCategoryError
  | SharedProgramCodecError
> =>
  Effect.gen(function* () {
    yield* validateAcceptedPolicyHistory(session, occurrences)
    const routingByOccurrenceId = new Map<string, FrozenRouting>()
    const seenRequestIds = new Set<string>()
    const messagesByOccurrenceId = new Map<string, Message>()
    const acceptedRequests = yield* Effect.forEach(
      occurrences,
      occurrence =>
        Effect.gen(function* () {
          const decoded = yield* codec.decodeAccepted(occurrence)
          messagesByOccurrenceId.set(occurrence.occurrenceId, decoded.message)
          const routing = yield* (() => {
            if (occurrence.proposalKind === 'Message') {
              return routingForAcceptedMessage(occurrence, decoded.message)
            }
            const causalRouting =
              occurrence.causationId === null
                ? undefined
                : routingByOccurrenceId.get(occurrence.causationId)
            if (causalRouting === undefined) {
              return failAcceptedOccurrence(occurrence, 'CausalRoutingMissing')
            } else {
              return Effect.succeed(causalRouting)
            }
          })()
          yield* validateAcceptedRoutingClaims(occurrence, routing)
          routingByOccurrenceId.set(occurrence.occurrenceId, routing)
          if (
            decoded.message._tag !== 'RequestedEffect' ||
            seenRequestIds.has(decoded.message.requestId)
          ) {
            return Option.none<AcceptedEffectRequest>()
          }
          seenRequestIds.add(decoded.message.requestId)
          return Option.some({
            envelope: decoded.envelope,
            message: decoded.message,
            occurrence,
            origin: {
              causalAudience: occurrence.audience,
              causalMessageCategory: occurrence.messageCategory,
              causalOccurrenceId: occurrence.occurrenceId,
              causalPolicyGeneration: occurrence.policyGeneration,
              ingressProcessorId: occurrence.acceptingProcessorId,
              originClientId: occurrence.clientId,
              originatingProcessorId: occurrence.originatingProcessorId,
            },
          })
        }),
      { concurrency: 1 },
    )
    return {
      acceptedOccurrences: occurrences,
      effectRequests: Array.getSomes(acceptedRequests),
      messagesByOccurrenceId,
    }
  })

const acceptedHistoryFingerprint = (
  occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
): string =>
  S.encodeSync(AcceptedOccurrencesJson)(Array.sort(occurrences, acceptedOrder))

const sortedPlacementsForRequest = (
  placements: ReadonlyArray<InstantEffectPlacementRecord>,
  requestId: string,
): ReadonlyArray<InstantEffectPlacementRecord> =>
  Array.sort(
    Array.filter(placements, placement => placement.requestId === requestId),
    placementOrder,
  )

const previousAssignments = (
  placements: ReadonlyArray<InstantEffectPlacementRecord>,
): ReadonlyMap<string, string> => {
  const assignments = new Map<string, string>()
  Array.forEach(Array.sort(placements, placementOrder), placement => {
    if (
      placement.placementDecision._tag === 'AssignedPreferred' ||
      placement.placementDecision._tag === 'AssignedFallback'
    ) {
      assignments.set(
        placement.requestId,
        placement.placementDecision.processorId,
      )
    }
  })
  return assignments
}

const placementGeneration = (
  placement: InstantEffectPlacementRecord,
): PlacementGeneration => ({
  assignmentGeneration: placement.assignmentGeneration,
  cancellationGeneration: placement.cancellationGeneration,
  decision: placement.placementDecision,
})

const hasPlacementFactProvenance = (
  request: AcceptedEffectRequest,
  value: Readonly<{
    actorId: string
    causationOccurrenceId: string | null
    correlationId: string | null
    eventId: string
    messageIdempotencyKey: string | null
    originatingProcessorId: string
  }>,
  authorityProcessorId: string,
  messageIdempotencyKey: string,
): boolean =>
  value.actorId === authorityProcessorId &&
  value.originatingProcessorId === authorityProcessorId &&
  value.causationOccurrenceId === request.occurrence.occurrenceId &&
  value.correlationId === Option.getOrNull(request.envelope.correlationId) &&
  value.messageIdempotencyKey === messageIdempotencyKey &&
  isEffectPlacementEventId(value.eventId)

const acceptedPlacementFactPrefixLength = (
  request: AcceptedEffectRequest,
  authorityProcessorId: string,
  placements: ReadonlyArray<InstantEffectPlacementRecord>,
  occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
  messagesByOccurrenceId: ReadonlyMap<string, Message>,
): number =>
  Array.reduce(
    Array.sort(occurrences, acceptedOrder),
    0,
    (prefixLength, occurrence) => {
      const maybePlacement = Array.get(placements, prefixLength)
      const message = messagesByOccurrenceId.get(occurrence.occurrenceId)
      if (
        Option.isSome(maybePlacement) &&
        message !== undefined &&
        hasPlacementFactProvenance(
          request,
          {
            actorId: occurrence.actorId,
            causationOccurrenceId: occurrence.causationId,
            correlationId: occurrence.correlationId,
            eventId: occurrence.eventId,
            messageIdempotencyKey: occurrence.messageIdempotencyKey,
            originatingProcessorId: occurrence.originatingProcessorId,
          },
          authorityProcessorId,
          maybePlacement.value.positionKey,
        ) &&
        messageEquivalence(
          message,
          placementFact(
            request.message,
            maybePlacement.value.placementDecision,
          ),
        )
      ) {
        return prefixLength + 1
      } else {
        return prefixLength
      }
    },
  )

const isPendingProposalScopeValid = (
  session: InstantProgramSessionRecord,
  proposal: InstantMessageProposalRecord,
): boolean =>
  proposal.id === proposal.proposalId &&
  proposal.proposalId === proposal.occurrenceId &&
  proposal.proposalKind === 'Message' &&
  proposal.programId === session.programId &&
  proposal.programVersion === session.programVersion &&
  proposal.protocolVersion === session.protocolVersion &&
  proposal.sessionId === session.sessionId &&
  proposal.subjectId === session.subjectId &&
  isInstantMessageProposalKindValid(proposal)

const isPendingProposalRoutingValid = (
  session: InstantProgramSessionRecord,
  proposal: InstantMessageProposalRecord,
  message: Message,
): boolean => {
  const maybeMessageCategory = Option.flatMap(
    Option.liftThrowable(InstantCounterSynchronization.messageCategory)(
      message,
    ),
    S.decodeUnknownOption(Synchronization.MessageCategory),
  )
  if (Option.isNone(maybeMessageCategory)) {
    return false
  }
  const audience = Synchronization.resolveAudience(
    session.sessionPolicy,
    maybeMessageCategory.value,
    proposal.originatingProcessorId,
  )
  if (audience._tag === 'ReadOnlyFollowerRejected') {
    return false
  }
  return (
    proposal.messageCategory === maybeMessageCategory.value &&
    proposal.policyGeneration === session.sessionPolicy.generation &&
    audienceEquivalence(proposal.proposedAudience, audience)
  )
}

const pendingPlacementFactProposalIds = (
  codec: SharedProgramMessageCodec<Message, Processor.MessageEnvelope>,
  request: AcceptedEffectRequest,
  authorityProcessorId: string,
  placement: InstantEffectPlacementRecord,
  session: InstantProgramSessionRecord,
  occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
  proposals: ReadonlyArray<InstantMessageProposalRecord>,
  resolutions: ReadonlyArray<InstantMessageProposalResolutionRecord>,
): Effect.Effect<ReadonlySet<string>> => {
  const terminalProposalIds = new Set([
    ...Array.map(occurrences, occurrence => occurrence.proposalId),
    ...Array.map(resolutions, resolution => resolution.proposalId),
  ])
  const expectedMessage = placementFact(
    request.message,
    placement.placementDecision,
  )
  return Effect.map(
    Effect.forEach(
      Array.filter(
        proposals,
        proposal =>
          !terminalProposalIds.has(proposal.proposalId) &&
          isPendingProposalScopeValid(session, proposal) &&
          hasPlacementFactProvenance(
            request,
            proposal,
            authorityProcessorId,
            placement.positionKey,
          ),
      ),
      proposal =>
        Effect.map(
          Effect.option(codec.decodeProposed(proposal)),
          maybeDecoded => {
            if (
              Option.isSome(maybeDecoded) &&
              isPendingProposalRoutingValid(
                session,
                proposal,
                maybeDecoded.value.message,
              ) &&
              messageEquivalence(maybeDecoded.value.message, expectedMessage)
            ) {
              return Option.some(proposal.proposalId)
            } else {
              return Option.none<string>()
            }
          },
        ),
      { concurrency: 1 },
    ),
    proposalIds => new Set(Array.getSomes(proposalIds)),
  )
}

const reconcileLocalPlacementFactProposalIds = (
  proposalsById: Map<string, string>,
  occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
  resolutions: ReadonlyArray<InstantMessageProposalResolutionRecord>,
): void => {
  const terminalProposalIds = new Set([
    ...Array.map(occurrences, occurrence => occurrence.proposalId),
    ...Array.map(resolutions, resolution => resolution.proposalId),
  ])
  const acceptedMessageIdempotencyKeys = new Set(
    Array.getSomes(
      Array.map(occurrences, occurrence =>
        Option.fromNullishOr(occurrence.messageIdempotencyKey),
      ),
    ),
  )
  Array.forEach(
    Array.fromIterable(proposalsById),
    ([proposalId, messageIdempotencyKey]) => {
      if (
        terminalProposalIds.has(proposalId) ||
        acceptedMessageIdempotencyKeys.has(messageIdempotencyKey)
      ) {
        proposalsById.delete(proposalId)
      }
    },
  )
}

/** Reconciles accepted effect requests, room liveness, and append-only placements. */
export const runEffectPlacementSupervisor = ({
  codec,
  processor,
  room,
  session,
  store,
}: EffectPlacementSupervisorConfig) =>
  Effect.gen(function* () {
    const appendedRequestIds = new Set<string>()
    const appendedPlacementKeys = new Set<string>()
    const localPlacementFactProposals = new Map<string, Map<string, string>>()
    const acceptedOccurrenceIndex = yield* Ref.make(
      emptyAcceptedOccurrenceIndex(),
    )
    const acceptedHistoryCache = yield* Ref.make(
      Option.none<AcceptedHistoryCache>(),
    )
    const scope = {
      sessionId: session.sessionId,
      subjectId: session.subjectId,
    }
    const observations = store.serverConfirmed
    const snapshots = Stream.zipLatest(
      Stream.zipLatest(
        observations.observeAcceptedMessageOccurrences(scope),
        observations.observeEffectRequests(scope),
      ),
      Stream.zipLatest(
        Stream.zipLatest(
          observations.observeEffectPlacements(scope),
          observations.observeMessageProposals(scope),
        ),
        Stream.zipLatest(
          observations.observeMessageProposalResolutions(scope),
          room.observePresence,
        ),
      ),
    )

    return yield* Stream.runForEach(
      snapshots,
      ([
        [occurrences, requests],
        [[placements, proposals], [resolutions, presence]],
      ]) =>
        Effect.gen(function* () {
          yield* validateTerminalEvidence(
            session,
            occurrences,
            proposals,
            resolutions,
          )
          yield* Effect.forEach(
            placements,
            placement => validatePlacementScope(session, placement),
            { concurrency: 1, discard: true },
          )
          const currentAcceptedOccurrenceIndex = yield* Ref.get(
            acceptedOccurrenceIndex,
          )
          const [nextAcceptedOccurrenceIndex, acceptedOccurrences] =
            yield* extendCanonicalAcceptedPrefix(
              session,
              currentAcceptedOccurrenceIndex,
              occurrences,
            )
          yield* Ref.set(acceptedOccurrenceIndex, nextAcceptedOccurrenceIndex)
          const fingerprint = acceptedHistoryFingerprint(acceptedOccurrences)
          const maybeCachedHistory = yield* Ref.get(acceptedHistoryCache)
          const acceptedHistory = yield* (() => {
            if (
              Option.isSome(maybeCachedHistory) &&
              maybeCachedHistory.value.fingerprint === fingerprint
            ) {
              return Effect.succeed(maybeCachedHistory.value.history)
            } else {
              return acceptedEffectRequests(
                codec,
                session,
                acceptedOccurrences,
              ).pipe(
                Effect.tap(history =>
                  Ref.set(
                    acceptedHistoryCache,
                    Option.some({ fingerprint, history }),
                  ),
                ),
              )
            }
          })()
          const processors = decodeProcessorPresence(presence)
          const priorAssignments = previousAssignments(placements)

          yield* Effect.forEach(
            acceptedHistory.effectRequests,
            acceptedRequest =>
              Effect.gen(function* () {
                const maybeDurableRequest = Array.findFirst(
                  requests,
                  request =>
                    request.requestId === acceptedRequest.message.requestId,
                )
                if (Option.isNone(maybeDurableRequest)) {
                  if (
                    !appendedRequestIds.has(acceptedRequest.message.requestId)
                  ) {
                    const request = makeEffectRequestRecord(
                      session,
                      acceptedRequest.message,
                      acceptedRequest.origin,
                      Date.now(),
                    )
                    yield* store.appendServerConfirmedEffectRequest(request)
                    appendedRequestIds.add(request.requestId)
                  }
                  return
                }

                const request = maybeDurableRequest.value
                const expectedRequest = makeEffectRequestRecord(
                  session,
                  acceptedRequest.message,
                  acceptedRequest.origin,
                  request.requestedAtMs,
                )
                if (!requestRecordEquivalence(request, expectedRequest)) {
                  return yield* Effect.fail(
                    new EffectRequestConflict({
                      requestId: request.requestId,
                    }),
                  )
                }

                const requestPlacements = sortedPlacementsForRequest(
                  placements,
                  request.requestId,
                )
                const maybeCurrent = Option.map(
                  Array.last(requestPlacements),
                  placementGeneration,
                )
                const command = commandForEffect(acceptedRequest.message)
                const manifest = command.effectManifest
                if (manifest === undefined || manifest.formatVersion !== 2) {
                  return yield* Effect.die(
                    'An accepted effect request has no version-two manifest.',
                  )
                }
                const maybeNextPlacement = replanEffectPlacement({
                  ingressProcessorId: acceptedRequest.origin.ingressProcessorId,
                  manifest,
                  maybeCurrent,
                  originClientId: acceptedRequest.origin.originClientId,
                  previousAssignments: priorAssignments,
                  processors,
                })
                if (Option.isSome(maybeNextPlacement)) {
                  const next = maybeNextPlacement.value
                  const placement = makeEffectPlacementRecord(
                    request,
                    next.decision,
                    next.assignmentGeneration,
                    next.cancellationGeneration,
                    Date.now(),
                  )
                  if (!appendedPlacementKeys.has(placement.positionKey)) {
                    yield* store.appendServerConfirmedEffectPlacement(placement)
                    appendedPlacementKeys.add(placement.positionKey)
                  }
                }

                const acceptedFactPrefixLength =
                  acceptedPlacementFactPrefixLength(
                    acceptedRequest,
                    session.authorityProcessorId,
                    requestPlacements,
                    acceptedHistory.acceptedOccurrences,
                    acceptedHistory.messagesByOccurrenceId,
                  )
                const maybeUnreportedPlacement = Array.get(
                  requestPlacements,
                  acceptedFactPrefixLength,
                )
                const durablePendingProposalIds = yield* Option.match(
                  maybeUnreportedPlacement,
                  {
                    onNone: () => Effect.succeed(new Set<string>()),
                    onSome: placement =>
                      pendingPlacementFactProposalIds(
                        codec,
                        acceptedRequest,
                        session.authorityProcessorId,
                        placement,
                        session,
                        acceptedHistory.acceptedOccurrences,
                        proposals,
                        resolutions,
                      ),
                  },
                )
                const localProposalsById =
                  localPlacementFactProposals.get(request.requestId) ??
                  new Map<string, string>()
                reconcileLocalPlacementFactProposalIds(
                  localProposalsById,
                  acceptedHistory.acceptedOccurrences,
                  resolutions,
                )
                localPlacementFactProposals.set(
                  request.requestId,
                  localProposalsById,
                )
                const isPlacementFactPending =
                  durablePendingProposalIds.size > 0 ||
                  localProposalsById.size > 0
                if (
                  !isPlacementFactPending &&
                  Option.isSome(maybeUnreportedPlacement)
                ) {
                  const placement = maybeUnreportedPlacement.value
                  const proposal = yield* processor.proposeIdempotentCorrelated(
                    placementFact(
                      acceptedRequest.message,
                      placement.placementDecision,
                    ),
                    {
                      messageIdempotencyKey: placement.positionKey,
                      maybeCausationOccurrenceId: Option.some(
                        acceptedRequest.occurrence.occurrenceId,
                      ),
                      maybeCorrelationId:
                        acceptedRequest.envelope.correlationId,
                    },
                  )
                  localProposalsById.set(
                    proposal.proposalId,
                    placement.positionKey,
                  )
                }
              }),
            { concurrency: 1, discard: true },
          )
        }),
    ).pipe(Effect.flatMap(() => Effect.never))
  })
