import {
  Array,
  Data,
  Effect,
  HashMap,
  HashSet,
  Match as M,
  Option,
  Order,
  Ref,
  Result,
  Schema as S,
} from 'effect'
import { Synchronization } from 'foldkit'
import type { MessageAdmissionDefinition } from 'foldkit/program'

import {
  OriginClientId,
  OriginDeviceId,
  OriginEffectResultProofScope,
  OriginOrdinaryProposalProofScope,
  OriginProcessorId,
  digestOriginOrdinaryMessageProposalProof,
  verifyOriginEffectResultProposal,
  verifyOriginOrdinaryMessageProposal,
} from '../originProof/index.js'
import type {
  V3ProgramAuthorityCriticalSection,
  V3ProgramAuthorityMutationService,
  V3ProgramAuthorityStoreService,
  V3ProgramStoreAppendError,
  V3ProgramStoreScope,
} from '../v3ProgramStore/index.js'
import {
  V3ProgramAuthoritySnapshot,
  V3ProgramStoreAcceptedMessageOccurrenceTransaction,
  V3ProgramStoreWriteDisposition,
  findV3ProgramStoreAcceptedMessageOccurrenceMismatch,
} from '../v3ProgramStore/index.js'
import {
  InstantV3AcceptedEffectResultOccurrenceRecord,
  InstantV3AcceptedMessageOccurrenceRecord,
  InstantV3AcceptedMessageProposalResolutionRecord,
  InstantV3AcceptedOrdinaryMessageOccurrenceRecord,
  InstantV3AdmissionClaimJson,
  InstantV3CanonicalJson,
  InstantV3EffectPlacementRecord,
  InstantV3EffectRequestRecord,
  InstantV3EntityId,
  InstantV3MessageProposalRecord,
  type InstantV3MessageProposalRejectionReason,
  InstantV3OriginPolicyDecisionRecord,
  InstantV3ProgramSessionRecord,
  InstantV3RejectedMessageProposalResolutionRecord,
  InstantV3TimestampMs,
  makeInstantV3AcceptedActorSequencePositionKey,
  makeInstantV3AcceptedEffectIdempotencyPositionKey,
  makeInstantV3AcceptedEffectRequestResultPositionKey,
  makeInstantV3AcceptedMessageIdempotencyPositionKey,
  makeInstantV3AcceptedOccurrencePositionKey,
  makeInstantV3AcceptedProposalPositionKey,
  makeInstantV3AcceptedSequencePositionKey,
  makeInstantV3MessageProposalResolutionPositionKey,
  stringifyInstantV3CanonicalJson,
} from '../v3Schema/index.js'

/** The trusted wire operations required around a Program-owned Message Schema. */
export type V3AcceptanceAuthorityWireProtocol<Message> = Readonly<{
  makeAcceptedEnvelope: (
    proposal: InstantV3MessageProposalRecord,
    input: Readonly<{
      acceptedAtMs: InstantV3TimestampMs
      acceptedSequence: number
      acceptingProcessorId: string
      audience: Synchronization.Audience
      messageCategory: Synchronization.MessageCategory
      policyGeneration: number
      sessionPolicy: Synchronization.SessionPolicy
    }>,
  ) => Effect.Effect<InstantV3CanonicalJson, unknown>
  validateAcceptedEnvelope: (
    occurrence: InstantV3AcceptedMessageOccurrenceRecord,
    message: Message,
  ) => Effect.Effect<void, unknown>
  validateProposedEnvelope: (
    proposal: InstantV3MessageProposalRecord,
    message: Message,
  ) => Effect.Effect<void, unknown>
}>

/** One server-confirmed snapshot consumed by pure authority evaluation. */
export const V3AcceptanceAuthoritySnapshot = V3ProgramAuthoritySnapshot
/** One server-confirmed snapshot consumed by pure authority evaluation. */
export type V3AcceptanceAuthoritySnapshot = V3ProgramAuthoritySnapshot

/** A proposal awaits a causally prior row from another server-confirmed query. */
export const V3AcceptanceAuthorityDeferred = S.TaggedStruct('Deferred', {
  proposalId: S.String,
  reason: S.Literals([
    'AcceptedOccurrencePending',
    'EffectPlacementPending',
    'EffectRequestPending',
    'OriginPolicyPending',
    'ProgramSessionPending',
    'ProposalPending',
  ]),
})
/** A proposal awaits a causally prior row from another server-confirmed query. */
export type V3AcceptanceAuthorityDeferred =
  typeof V3AcceptanceAuthorityDeferred.Type

/** Pure evaluation selected an atomic Accepted guard and occurrence. */
export const V3AcceptanceAuthorityAccept = S.TaggedStruct('Accept', {
  transaction: V3ProgramStoreAcceptedMessageOccurrenceTransaction,
})
/** Pure evaluation selected an atomic Accepted guard and occurrence. */
export type V3AcceptanceAuthorityAccept =
  typeof V3AcceptanceAuthorityAccept.Type

/** Pure evaluation selected one terminal Rejected guard. */
export const V3AcceptanceAuthorityReject = S.TaggedStruct('Reject', {
  resolution: InstantV3RejectedMessageProposalResolutionRecord,
})
/** Pure evaluation selected one terminal Rejected guard. */
export type V3AcceptanceAuthorityReject =
  typeof V3AcceptanceAuthorityReject.Type

/** Pure evaluation found an already persisted Accepted terminal. */
export const V3AcceptanceAuthorityResolvedAccepted = S.TaggedStruct(
  'ResolvedAccepted',
  {
    occurrence: InstantV3AcceptedMessageOccurrenceRecord,
    resolution: InstantV3AcceptedMessageProposalResolutionRecord,
  },
)
/** Pure evaluation found an already persisted Accepted terminal. */
export type V3AcceptanceAuthorityResolvedAccepted =
  typeof V3AcceptanceAuthorityResolvedAccepted.Type

/** Pure evaluation found an already persisted Rejected terminal. */
export const V3AcceptanceAuthorityResolvedRejected = S.TaggedStruct(
  'ResolvedRejected',
  {
    resolution: InstantV3RejectedMessageProposalResolutionRecord,
  },
)
/** Pure evaluation found an already persisted Rejected terminal. */
export type V3AcceptanceAuthorityResolvedRejected =
  typeof V3AcceptanceAuthorityResolvedRejected.Type

/** Every deterministic evaluation result before an authority store write. */
export const V3AcceptanceAuthorityEvaluation = S.Union([
  V3AcceptanceAuthorityAccept,
  V3AcceptanceAuthorityReject,
  V3AcceptanceAuthorityResolvedAccepted,
  V3AcceptanceAuthorityResolvedRejected,
  V3AcceptanceAuthorityDeferred,
])
/** Every deterministic evaluation result before an authority store write. */
export type V3AcceptanceAuthorityEvaluation =
  typeof V3AcceptanceAuthorityEvaluation.Type

/** An accepted proposal and the authority-store write disposition. */
export const V3AcceptanceAuthorityAccepted = S.TaggedStruct('Accepted', {
  occurrence: InstantV3AcceptedMessageOccurrenceRecord,
  resolution: InstantV3AcceptedMessageProposalResolutionRecord,
  writeDisposition: S.Literals(['Appended', 'Idempotent']),
})
/** An accepted proposal and the authority-store write disposition. */
export type V3AcceptanceAuthorityAccepted =
  typeof V3AcceptanceAuthorityAccepted.Type

/** A rejected proposal and the authority-store write disposition. */
export const V3AcceptanceAuthorityRejected = S.TaggedStruct('Rejected', {
  resolution: InstantV3RejectedMessageProposalResolutionRecord,
  writeDisposition: S.Literals(['Appended', 'Idempotent']),
})
/** A rejected proposal and the authority-store write disposition. */
export type V3AcceptanceAuthorityRejected =
  typeof V3AcceptanceAuthorityRejected.Type

/** Every externally visible result of one v3 authority admission attempt. */
export const V3AcceptanceAuthorityOutcome = S.Union([
  V3AcceptanceAuthorityAccepted,
  V3AcceptanceAuthorityRejected,
  V3AcceptanceAuthorityDeferred,
])
/** Every externally visible result of one v3 authority admission attempt. */
export type V3AcceptanceAuthorityOutcome =
  typeof V3AcceptanceAuthorityOutcome.Type

/** The authority definition disagrees with its Program or v3 store scope. */
export class V3AcceptanceAuthorityConfigurationError extends Data.TaggedError(
  'V3AcceptanceAuthorityConfigurationError',
)<{
  readonly reason:
    | 'AcceptingProcessorId'
    | 'AuthorityCapability'
    | 'AuthorityCoordinator'
    | 'ProgramId'
    | 'ProgramVersion'
}> {}

/** Server-confirmed history cannot be deterministically replayed. */
export class V3AcceptanceAuthorityHistoryError extends Data.TaggedError(
  'V3AcceptanceAuthorityHistoryError',
)<{
  readonly occurrenceId: string
  readonly reason:
    | 'AcceptedAuthorityInvalid'
    | 'AcceptedEnvelopeInvalid'
    | 'AcceptedMessageInvalid'
    | 'AcceptedProofInvalid'
    | 'AcceptedRoutingInvalid'
    | 'AcceptedSequenceInvalid'
    | 'ModelInvalid'
    | 'ProgramDefect'
    | 'ScopeMismatch'
}> {}

/** A trusted Program or wire callback failed at the authority boundary. */
export class V3AcceptanceAuthorityEvaluationError extends Data.TaggedError(
  'V3AcceptanceAuthorityEvaluationError',
)<{
  readonly cause: unknown
  readonly operation:
    | 'AcceptedEnvelope'
    | 'CandidateModel'
    | 'MakeAcceptedEnvelope'
    | 'MessageCategory'
    | 'MessageSchema'
    | 'ProgramInit'
    | 'ProgramUpdate'
    | 'ProposedEnvelope'
  readonly proposalId: string
}> {}

/** A terminal row does not join its exact immutable proposal or occurrence. */
export class V3AcceptanceAuthorityTerminalHistoryError extends Data.TaggedError(
  'V3AcceptanceAuthorityTerminalHistoryError',
)<{
  readonly proposalId: string
  readonly reason:
    | 'AcceptedOccurrenceMissing'
    | 'AcceptedOccurrenceMismatch'
    | 'ProposalMetadataMismatch'
}> {}

/** Typed failures that stop deterministic authority operation. */
export type V3AcceptanceAuthorityError =
  | V3AcceptanceAuthorityConfigurationError
  | V3AcceptanceAuthorityEvaluationError
  | V3AcceptanceAuthorityHistoryError
  | V3AcceptanceAuthorityTerminalHistoryError
  | V3ProgramStoreAppendError

/** Static inputs shared by pure evaluation and the store-backed authority. */
export type V3AcceptanceAuthorityDefinition<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Claim,
  DecodeError,
  ResolutionError,
> = Readonly<{
  acceptingProcessorId: string
  admission: MessageAdmissionDefinition<
    Model,
    Message,
    Claim,
    DecodeError,
    ResolutionError,
    never,
    never,
    undefined
  >
  makeEntityId: () => InstantV3EntityId
  now: () => InstantV3TimestampMs
  scope: V3ProgramStoreScope
  wire: V3AcceptanceAuthorityWireProtocol<Message>
}>

/** Inputs that bind pure evaluation to a server-confirmed authority store. */
export type V3AcceptanceAuthorityConfig<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Claim,
  DecodeError,
  ResolutionError,
> = V3AcceptanceAuthorityDefinition<
  Model,
  Message,
  Claim,
  DecodeError,
  ResolutionError
> &
  Readonly<{
    store: V3ProgramAuthorityStoreService
  }>

/** A store-backed protocol-v3 acceptance and sequencing authority. */
export type V3AcceptanceAuthority = Readonly<{
  admit: (
    proposalId: string,
  ) => Effect.Effect<V3AcceptanceAuthorityOutcome, V3AcceptanceAuthorityError>
  processAvailable: Effect.Effect<
    ReadonlyArray<V3AcceptanceAuthorityOutcome>,
    V3AcceptanceAuthorityError
  >
  readServerConfirmedSnapshot: Effect.Effect<
    V3AcceptanceAuthoritySnapshot,
    V3AcceptanceAuthorityError
  >
}>

const proposalJson = S.fromJsonString(InstantV3MessageProposalRecord)
const encodeProposal = S.encodeSync(proposalJson)
const acceptedOccurrenceJson = S.fromJsonString(
  InstantV3AcceptedMessageOccurrenceRecord,
)
const encodeAcceptedOccurrence = S.encodeSync(acceptedOccurrenceJson)
const audienceEquivalence = S.toEquivalence(Synchronization.Audience)
const sessionPolicyEquivalence = S.toEquivalence(Synchronization.SessionPolicy)

type V3AcceptanceAuthorityRecordDefinition = Readonly<{
  acceptingProcessorId: string
  makeEntityId: () => InstantV3EntityId
  now: () => InstantV3TimestampMs
  scope: V3ProgramStoreScope
}>

const acceptedOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (occurrence: InstantV3AcceptedMessageOccurrenceRecord) =>
      occurrence.acceptedSequence,
  ),
  Order.mapInput(
    Order.String,
    (occurrence: InstantV3AcceptedMessageOccurrenceRecord) =>
      occurrence.occurrenceId,
  ),
)

const proposalOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (proposal: InstantV3MessageProposalRecord) => proposal.actorSequence,
  ),
  Order.mapInput(
    Order.String,
    (proposal: InstantV3MessageProposalRecord) => proposal.proposalId,
  ),
)

const exactScope = (
  scope: V3ProgramStoreScope,
  record: Readonly<{
    appSubjectDigest: string
    instantAppId: string
    programId: string
    programVersion: number
    protocolVersion: number
    sessionEpochId: string
    sessionId: string
    subjectId: string
  }>,
): boolean =>
  record.appSubjectDigest === scope.appSubjectDigest &&
  record.instantAppId === scope.instantAppId &&
  record.programId === scope.programId &&
  record.programVersion === scope.programVersion &&
  record.protocolVersion === scope.protocolVersion &&
  record.sessionEpochId === scope.sessionEpochId &&
  record.sessionId === scope.sessionId &&
  record.subjectId === scope.subjectId

const invocationFacts = (
  proposal: InstantV3MessageProposalRecord,
): Readonly<{
  actorId: string
  clientId: string
  occurrenceId: string
  originatingProcessorId: string
  sessionId: string
  subjectId: string
}> => ({
  actorId: proposal.actorId,
  clientId: proposal.clientId,
  occurrenceId: proposal.occurrenceId,
  originatingProcessorId: proposal.originatingProcessorId,
  sessionId: proposal.sessionId,
  subjectId: proposal.subjectId,
})

const rejectionResolution = (
  proposal: InstantV3MessageProposalRecord,
  definition: V3AcceptanceAuthorityRecordDefinition,
  reason: InstantV3MessageProposalRejectionReason,
): typeof InstantV3RejectedMessageProposalResolutionRecord.Type =>
  InstantV3RejectedMessageProposalResolutionRecord.make({
    actorId: proposal.actorId,
    actorSequence: proposal.actorSequence,
    appSubjectDigest: proposal.appSubjectDigest,
    clientId: proposal.clientId,
    id: definition.makeEntityId(),
    instantAppId: proposal.instantAppId,
    originDeviceId: proposal.originDeviceId,
    originatingProcessorId: proposal.originatingProcessorId,
    programId: proposal.programId,
    programVersion: proposal.programVersion,
    proposalId: proposal.proposalId,
    proposalKind: proposal.proposalKind,
    proposalTerminalPositionKey:
      makeInstantV3MessageProposalResolutionPositionKey(
        proposal.sessionId,
        proposal.proposalId,
      ),
    protocolVersion: proposal.protocolVersion,
    rejectedAtMs: definition.now(),
    rejectingProcessorId: definition.acceptingProcessorId,
    rejectionReason: reason,
    resolutionState: 'Rejected',
    sessionEpochId: proposal.sessionEpochId,
    sessionId: proposal.sessionId,
    subjectId: proposal.subjectId,
  })

const deferred = (
  proposalId: string,
  reason: V3AcceptanceAuthorityDeferred['reason'],
): V3AcceptanceAuthorityEvaluation =>
  V3AcceptanceAuthorityDeferred.make({ proposalId, reason })

const latestSession = (
  sessions: ReadonlyArray<typeof InstantV3ProgramSessionRecord.Type>,
): Option.Option<typeof InstantV3ProgramSessionRecord.Type> =>
  Array.head(
    Array.sort(
      sessions,
      Order.mapInput(
        Order.flip(Order.Number),
        (session: typeof InstantV3ProgramSessionRecord.Type) =>
          session.lifecycleGeneration,
      ),
    ),
  )

const latestPolicy = (
  decisions: ReadonlyArray<typeof InstantV3OriginPolicyDecisionRecord.Type>,
  originPolicyId: string,
): Option.Option<typeof InstantV3OriginPolicyDecisionRecord.Type> =>
  Array.head(
    Array.sort(
      Array.filter(
        decisions,
        decision => decision.originPolicyId === originPolicyId,
      ),
      Order.mapInput(
        Order.flip(Order.Number),
        (decision: typeof InstantV3OriginPolicyDecisionRecord.Type) =>
          decision.generation,
      ),
    ),
  )

const messagePayload = <Message extends Readonly<{ _tag: string }>>(
  Message: S.Codec<Message, unknown, never, never>,
  message: Message,
  proposalId: string,
): Effect.Effect<
  InstantV3CanonicalJson,
  V3AcceptanceAuthorityEvaluationError
> =>
  S.encodeEffect(Message)(message).pipe(
    Effect.flatMap(S.decodeUnknownEffect(S.Json)),
    Effect.map(stringifyInstantV3CanonicalJson),
    Effect.mapError(
      cause =>
        new V3AcceptanceAuthorityEvaluationError({
          cause,
          operation: 'MessageSchema',
          proposalId,
        }),
    ),
    Effect.catchDefect(cause =>
      Effect.fail(
        new V3AcceptanceAuthorityEvaluationError({
          cause,
          operation: 'MessageSchema',
          proposalId,
        }),
      ),
    ),
  )

const decodeMessage = <Message extends Readonly<{ _tag: string }>>(
  Message: S.Codec<Message, unknown, never, never>,
  payloadJson: string,
  proposalId: string,
): Effect.Effect<Message, V3AcceptanceAuthorityHistoryError> =>
  S.decodeUnknownEffect(S.fromJsonString(Message))(payloadJson).pipe(
    Effect.mapError(
      () =>
        new V3AcceptanceAuthorityHistoryError({
          occurrenceId: proposalId,
          reason: 'AcceptedMessageInvalid',
        }),
    ),
    Effect.catchDefect(() =>
      Effect.fail(
        new V3AcceptanceAuthorityHistoryError({
          occurrenceId: proposalId,
          reason: 'AcceptedMessageInvalid',
        }),
      ),
    ),
  )

const messageCategory = <Message extends Readonly<{ _tag: string }>>(
  synchronization:
    | Readonly<{
        messageCategory: (message: Message) => Synchronization.MessageCategory
      }>
    | undefined,
  sessionPolicy: Synchronization.SessionPolicy,
  message: Message,
  proposalId: string,
): Effect.Effect<
  Synchronization.MessageCategory,
  V3AcceptanceAuthorityEvaluationError
> => {
  if (synchronization === undefined) {
    if (sessionPolicy.mode._tag === 'Mirror') {
      return Effect.succeed('Domain')
    } else {
      return Effect.fail(
        new V3AcceptanceAuthorityEvaluationError({
          cause: new Error(
            'Partitioned synchronization requires Program metadata.',
          ),
          operation: 'MessageCategory',
          proposalId,
        }),
      )
    }
  }
  return Effect.try({
    try: () =>
      S.decodeUnknownSync(Synchronization.MessageCategory)(
        synchronization.messageCategory(message),
      ),
    catch: cause =>
      new V3AcceptanceAuthorityEvaluationError({
        cause,
        operation: 'MessageCategory',
        proposalId,
      }),
  })
}

const expectedRouting = (
  sessionPolicy: Synchronization.SessionPolicy,
  category: Synchronization.MessageCategory,
  originatingProcessorId: string,
): Result.Result<
  Synchronization.Audience,
  (typeof InstantV3RejectedMessageProposalResolutionRecord.Type)['rejectionReason']
> => {
  const routing = Synchronization.resolveAudience(
    sessionPolicy,
    category,
    originatingProcessorId,
  )
  if (routing._tag === 'ReadOnlyFollowerRejected') {
    return Result.fail('SynchronizationPolicyMismatch')
  } else {
    return Result.succeed(routing)
  }
}

const validateProposalMetadata = <Message extends Readonly<{ _tag: string }>>(
  Message: S.Codec<Message, unknown, never, never>,
  wire: V3AcceptanceAuthorityWireProtocol<Message>,
  proposal: InstantV3MessageProposalRecord,
  message: Message,
): Effect.Effect<void, V3AcceptanceAuthorityEvaluationError> =>
  Effect.gen(function* () {
    const canonicalPayload = yield* messagePayload(
      Message,
      message,
      proposal.proposalId,
    )
    if (canonicalPayload !== proposal.payloadJson) {
      return yield* new V3AcceptanceAuthorityEvaluationError({
        cause: new Error(
          'The resolved Message does not match the signed canonical event.',
        ),
        operation: 'MessageSchema',
        proposalId: proposal.proposalId,
      })
    }
    yield* wire.validateProposedEnvelope(proposal, message).pipe(
      Effect.catchCause(cause =>
        Effect.fail(
          new V3AcceptanceAuthorityEvaluationError({
            cause,
            operation: 'ProposedEnvelope',
            proposalId: proposal.proposalId,
          }),
        ),
      ),
    )
  })

const validateCandidateTransition = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Claim,
  DecodeError,
  ResolutionError,
>(
  definition: V3AcceptanceAuthorityDefinition<
    Model,
    Message,
    Claim,
    DecodeError,
    ResolutionError
  >,
  model: Model,
  message: Message,
  proposalId: string,
): Effect.Effect<void, V3AcceptanceAuthorityEvaluationError> =>
  Effect.gen(function* () {
    const nextModel = yield* Effect.try({
      try: () => {
        const [candidateModel] = definition.admission.program.update(
          model,
          message,
        )
        return candidateModel
      },
      catch: cause =>
        new V3AcceptanceAuthorityEvaluationError({
          cause,
          operation: 'ProgramUpdate',
          proposalId,
        }),
    })
    yield* S.decodeUnknownEffect(definition.admission.program.Model)(
      nextModel,
    ).pipe(
      Effect.asVoid,
      Effect.mapError(
        cause =>
          new V3AcceptanceAuthorityEvaluationError({
            cause,
            operation: 'CandidateModel',
            proposalId,
          }),
      ),
      Effect.catchDefect(cause =>
        Effect.fail(
          new V3AcceptanceAuthorityEvaluationError({
            cause,
            operation: 'CandidateModel',
            proposalId,
          }),
        ),
      ),
    )
  })

const acceptedMessage = <Message extends Readonly<{ _tag: string }>>(
  Message: S.Codec<Message, unknown, never, never>,
  wire: V3AcceptanceAuthorityWireProtocol<Message>,
  occurrence: InstantV3AcceptedMessageOccurrenceRecord,
): Effect.Effect<Message, V3AcceptanceAuthorityHistoryError> =>
  Effect.gen(function* () {
    const message = yield* decodeMessage(
      Message,
      occurrence.payloadJson,
      occurrence.occurrenceId,
    )
    const encoded = yield* messagePayload(
      Message,
      message,
      occurrence.proposalId,
    ).pipe(
      Effect.mapError(
        () =>
          new V3AcceptanceAuthorityHistoryError({
            occurrenceId: occurrence.occurrenceId,
            reason: 'AcceptedMessageInvalid',
          }),
      ),
    )
    if (encoded !== occurrence.payloadJson) {
      return yield* new V3AcceptanceAuthorityHistoryError({
        occurrenceId: occurrence.occurrenceId,
        reason: 'AcceptedMessageInvalid',
      })
    }
    yield* wire.validateAcceptedEnvelope(occurrence, message).pipe(
      Effect.catchCause(() =>
        Effect.fail(
          new V3AcceptanceAuthorityHistoryError({
            occurrenceId: occurrence.occurrenceId,
            reason: 'AcceptedEnvelopeInvalid',
          }),
        ),
      ),
    )
    return message
  })

const causalOriginPolicy = (
  causal: InstantV3AcceptedMessageOccurrenceRecord,
): Readonly<{ generation: number; originPolicyId: string }> =>
  causal.proposalKind === 'OrdinaryMessage'
    ? {
        generation: causal.originPolicyGeneration,
        originPolicyId: causal.originPolicyId,
      }
    : {
        generation: causal.executorOriginPolicyGeneration,
        originPolicyId: causal.executorOriginPolicyId,
      }

const acceptedEffectLineageMatches = (
  acceptedByOccurrenceId: HashMap.HashMap<
    string,
    InstantV3AcceptedMessageOccurrenceRecord
  >,
  occurrence: typeof InstantV3AcceptedEffectResultOccurrenceRecord.Type,
): boolean => {
  const maybeCausal = HashMap.get(
    acceptedByOccurrenceId,
    occurrence.causalOccurrenceId,
  )
  if (Option.isNone(maybeCausal)) {
    return false
  }
  const causal = maybeCausal.value
  const originPolicy = causalOriginPolicy(causal)
  const isPropagatedProofDigest =
    causal.proposalKind === 'OrdinaryMessage' ||
    occurrence.causalOriginProofDigest === causal.causalOriginProofDigest
  return (
    occurrence.causationId === causal.occurrenceId &&
    occurrence.causalAcceptedSequence === causal.acceptedSequence &&
    audienceEquivalence(occurrence.causalAudience, causal.audience) &&
    occurrence.causalMessageCategory === causal.messageCategory &&
    occurrence.causalOccurrenceId === causal.occurrenceId &&
    occurrence.causalOriginDeviceId === causal.originDeviceId &&
    occurrence.causalOriginPolicyGeneration === originPolicy.generation &&
    occurrence.causalOriginPolicyId === originPolicy.originPolicyId &&
    isPropagatedProofDigest &&
    occurrence.causalOriginatingProcessorId === causal.originatingProcessorId &&
    occurrence.causalPolicyGeneration === causal.policyGeneration &&
    occurrence.causalProposalId === causal.proposalId &&
    occurrence.messageCategory === causal.messageCategory &&
    audienceEquivalence(occurrence.audience, causal.audience) &&
    occurrence.policyGeneration === causal.policyGeneration &&
    sessionPolicyEquivalence(occurrence.sessionPolicy, causal.sessionPolicy)
  )
}

type V3AcceptanceAuthorityProjectionState<Model> = Readonly<{
  acceptedByOccurrenceId: HashMap.HashMap<
    string,
    InstantV3AcceptedMessageOccurrenceRecord
  >
  acceptedFingerprints: HashMap.HashMap<number, string>
  model: Model
  throughAcceptedSequence: number
}>

type V3AcceptanceAuthorityModelProjection<Model> = Readonly<{
  model: Model
  throughAcceptedSequence: number
}>

type V3AcceptanceAuthorityModelProjector<Model> = (
  occurrences: ReadonlyArray<InstantV3AcceptedMessageOccurrenceRecord>,
  processorId: string,
) => Effect.Effect<
  V3AcceptanceAuthorityModelProjection<Model>,
  V3AcceptanceAuthorityError
>

const initialProjectionState = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Claim,
  DecodeError,
  ResolutionError,
>(
  definition: V3AcceptanceAuthorityDefinition<
    Model,
    Message,
    Claim,
    DecodeError,
    ResolutionError
  >,
): Effect.Effect<
  V3AcceptanceAuthorityProjectionState<Model>,
  V3AcceptanceAuthorityError
> =>
  Effect.gen(function* () {
    const initialModel = yield* Effect.try({
      try: () => definition.admission.program.init()[0],
      catch: cause =>
        new V3AcceptanceAuthorityEvaluationError({
          cause,
          operation: 'ProgramInit',
          proposalId: 'history',
        }),
    })
    const model = yield* S.decodeUnknownEffect(
      definition.admission.program.Model,
    )(initialModel).pipe(
      Effect.mapError(
        () =>
          new V3AcceptanceAuthorityHistoryError({
            occurrenceId: 'init',
            reason: 'ModelInvalid',
          }),
      ),
    )
    return {
      acceptedByOccurrenceId: HashMap.empty(),
      acceptedFingerprints: HashMap.empty(),
      model,
      throughAcceptedSequence: 0,
    }
  })

const projectV3AcceptanceAuthorityModelIncrementally = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Claim,
  DecodeError,
  ResolutionError,
>(
  definition: V3AcceptanceAuthorityDefinition<
    Model,
    Message,
    Claim,
    DecodeError,
    ResolutionError
  >,
  occurrences: ReadonlyArray<InstantV3AcceptedMessageOccurrenceRecord>,
  processorId: string,
  maybeCached: Option.Option<V3AcceptanceAuthorityProjectionState<Model>>,
): Effect.Effect<
  V3AcceptanceAuthorityProjectionState<Model>,
  V3AcceptanceAuthorityError
> =>
  Effect.gen(function* () {
    const sorted = Array.sort(occurrences, acceptedOrder)
    let isCachedPrefixCurrent = Option.isSome(maybeCached)
    let expectedCachedSequence = 1
    if (Option.isSome(maybeCached)) {
      for (const occurrence of sorted) {
        if (
          occurrence.acceptedSequence >
          maybeCached.value.throughAcceptedSequence
        ) {
          break
        }
        const maybeFingerprint = HashMap.get(
          maybeCached.value.acceptedFingerprints,
          occurrence.acceptedSequence,
        )
        if (
          occurrence.acceptedSequence !== expectedCachedSequence ||
          Option.isNone(maybeFingerprint) ||
          maybeFingerprint.value !== encodeAcceptedOccurrence(occurrence)
        ) {
          isCachedPrefixCurrent = false
          break
        }
        expectedCachedSequence += 1
      }
      if (
        expectedCachedSequence - 1 !==
        maybeCached.value.throughAcceptedSequence
      ) {
        isCachedPrefixCurrent = false
      }
    }
    const base =
      isCachedPrefixCurrent && Option.isSome(maybeCached)
        ? maybeCached.value
        : yield* initialProjectionState(definition)
    let model = base.model
    let throughAcceptedSequence = base.throughAcceptedSequence
    let acceptedByOccurrenceId = base.acceptedByOccurrenceId
    let acceptedFingerprints = base.acceptedFingerprints
    for (const occurrence of sorted) {
      if (
        base.throughAcceptedSequence > 0 &&
        occurrence.acceptedSequence <= base.throughAcceptedSequence
      ) {
        continue
      }
      if (!exactScope(definition.scope, occurrence)) {
        return yield* new V3AcceptanceAuthorityHistoryError({
          occurrenceId: occurrence.occurrenceId,
          reason: 'ScopeMismatch',
        })
      }
      if (occurrence.acceptedSequence !== throughAcceptedSequence + 1) {
        return yield* new V3AcceptanceAuthorityHistoryError({
          occurrenceId: occurrence.occurrenceId,
          reason: 'AcceptedSequenceInvalid',
        })
      }
      if (occurrence.acceptingProcessorId !== definition.acceptingProcessorId) {
        return yield* new V3AcceptanceAuthorityHistoryError({
          occurrenceId: occurrence.occurrenceId,
          reason: 'AcceptedAuthorityInvalid',
        })
      }
      const message = yield* acceptedMessage(
        definition.admission.program.Message,
        definition.wire,
        occurrence,
      )
      if (occurrence.proposalKind === 'OrdinaryMessage') {
        const category = yield* messageCategory(
          definition.admission.program.synchronization,
          occurrence.sessionPolicy,
          message,
          occurrence.proposalId,
        ).pipe(
          Effect.mapError(
            () =>
              new V3AcceptanceAuthorityHistoryError({
                occurrenceId: occurrence.occurrenceId,
                reason: 'AcceptedRoutingInvalid',
              }),
          ),
        )
        const routing = expectedRouting(
          occurrence.sessionPolicy,
          category,
          occurrence.originatingProcessorId,
        )
        if (
          Result.isFailure(routing) ||
          occurrence.messageCategory !== category ||
          occurrence.policyGeneration !== occurrence.sessionPolicy.generation ||
          !audienceEquivalence(
            occurrence.audience,
            Result.getOrElse(routing, () => occurrence.audience),
          )
        ) {
          return yield* new V3AcceptanceAuthorityHistoryError({
            occurrenceId: occurrence.occurrenceId,
            reason: 'AcceptedRoutingInvalid',
          })
        }
      } else if (
        !acceptedEffectLineageMatches(acceptedByOccurrenceId, occurrence)
      ) {
        return yield* new V3AcceptanceAuthorityHistoryError({
          occurrenceId: occurrence.occurrenceId,
          reason: 'AcceptedRoutingInvalid',
        })
      }
      throughAcceptedSequence = occurrence.acceptedSequence
      acceptedByOccurrenceId = HashMap.set(
        acceptedByOccurrenceId,
        occurrence.occurrenceId,
        occurrence,
      )
      acceptedFingerprints = HashMap.set(
        acceptedFingerprints,
        occurrence.acceptedSequence,
        encodeAcceptedOccurrence(occurrence),
      )
      if (Synchronization.includesProcessor(occurrence.audience, processorId)) {
        const nextModel = yield* Effect.try({
          try: () => definition.admission.program.update(model, message)[0],
          catch: cause =>
            new V3AcceptanceAuthorityEvaluationError({
              cause,
              operation: 'ProgramUpdate',
              proposalId: occurrence.proposalId,
            }),
        })
        model = yield* S.decodeUnknownEffect(
          definition.admission.program.Model,
        )(nextModel).pipe(
          Effect.mapError(
            () =>
              new V3AcceptanceAuthorityHistoryError({
                occurrenceId: occurrence.occurrenceId,
                reason: 'ModelInvalid',
              }),
          ),
        )
      }
    }
    return {
      acceptedByOccurrenceId,
      acceptedFingerprints,
      model,
      throughAcceptedSequence,
    }
  })

/** Reconstructs one Processor's pre-row Model while advancing through every global sequence. */
export const projectV3AcceptanceAuthorityModel = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Claim,
  DecodeError,
  ResolutionError,
>(
  definition: V3AcceptanceAuthorityDefinition<
    Model,
    Message,
    Claim,
    DecodeError,
    ResolutionError
  >,
  occurrences: ReadonlyArray<InstantV3AcceptedMessageOccurrenceRecord>,
  processorId: string,
): Effect.Effect<
  Readonly<{ model: Model; throughAcceptedSequence: number }>,
  V3AcceptanceAuthorityError
> =>
  Effect.gen(function* () {
    const projection = yield* projectV3AcceptanceAuthorityModelIncrementally(
      definition,
      occurrences,
      processorId,
      Option.none(),
    )
    return {
      model: projection.model,
      throughAcceptedSequence: projection.throughAcceptedSequence,
    }
  })

const terminalForProposal = (
  definition: V3AcceptanceAuthorityRecordDefinition,
  snapshot: V3AcceptanceAuthoritySnapshot,
  proposal: InstantV3MessageProposalRecord,
): Effect.Effect<
  Option.Option<V3AcceptanceAuthorityEvaluation>,
  V3AcceptanceAuthorityTerminalHistoryError
> => {
  const resolutions = Array.filter(
    snapshot.messageProposalResolutions,
    resolution => resolution.proposalId === proposal.proposalId,
  )
  const maybeResolution = Array.head(resolutions)
  if (Option.isNone(maybeResolution)) {
    return Effect.succeed(Option.none())
  }
  if (Option.isSome(Array.get(resolutions, 1))) {
    return Effect.fail(
      new V3AcceptanceAuthorityTerminalHistoryError({
        proposalId: proposal.proposalId,
        reason: 'ProposalMetadataMismatch',
      }),
    )
  }
  const resolution = maybeResolution.value
  if (
    resolution.actorId !== proposal.actorId ||
    resolution.actorSequence !== proposal.actorSequence ||
    resolution.clientId !== proposal.clientId ||
    resolution.originDeviceId !== proposal.originDeviceId ||
    resolution.originatingProcessorId !== proposal.originatingProcessorId ||
    resolution.proposalKind !== proposal.proposalKind ||
    !exactScope(
      {
        appSubjectDigest: proposal.appSubjectDigest,
        instantAppId: proposal.instantAppId,
        programId: proposal.programId,
        programVersion: proposal.programVersion,
        protocolVersion: proposal.protocolVersion,
        sessionEpochId: proposal.sessionEpochId,
        sessionId: proposal.sessionId,
        subjectId: proposal.subjectId,
      },
      resolution,
    )
  ) {
    return Effect.fail(
      new V3AcceptanceAuthorityTerminalHistoryError({
        proposalId: proposal.proposalId,
        reason: 'ProposalMetadataMismatch',
      }),
    )
  }
  if (resolution.resolutionState === 'Rejected') {
    if (resolution.rejectingProcessorId !== definition.acceptingProcessorId) {
      return Effect.fail(
        new V3AcceptanceAuthorityTerminalHistoryError({
          proposalId: proposal.proposalId,
          reason: 'ProposalMetadataMismatch',
        }),
      )
    }
    return Effect.succeed(
      Option.some(V3AcceptanceAuthorityResolvedRejected.make({ resolution })),
    )
  }
  if (resolution.acceptingProcessorId !== definition.acceptingProcessorId) {
    return Effect.fail(
      new V3AcceptanceAuthorityTerminalHistoryError({
        proposalId: proposal.proposalId,
        reason: 'ProposalMetadataMismatch',
      }),
    )
  }
  const matchingOccurrences = Array.filter(
    snapshot.acceptedMessageOccurrences,
    occurrence =>
      occurrence.id === resolution.acceptedMessageOccurrenceId &&
      occurrence.positionKey ===
        resolution.acceptedMessageOccurrencePositionKey,
  )
  const maybeOccurrence = Array.head(matchingOccurrences)
  if (Option.isNone(maybeOccurrence)) {
    const hasContradictoryProposalOccurrence = Array.some(
      snapshot.acceptedMessageOccurrences,
      occurrence => occurrence.proposalId === proposal.proposalId,
    )
    if (hasContradictoryProposalOccurrence) {
      return Effect.fail(
        new V3AcceptanceAuthorityTerminalHistoryError({
          proposalId: proposal.proposalId,
          reason: 'AcceptedOccurrenceMismatch',
        }),
      )
    }
    return Effect.succeed(
      Option.some(
        V3AcceptanceAuthorityDeferred.make({
          proposalId: proposal.proposalId,
          reason: 'AcceptedOccurrencePending',
        }),
      ),
    )
  }
  const maybeAtomicPairMismatch =
    findV3ProgramStoreAcceptedMessageOccurrenceMismatch({
      occurrence: maybeOccurrence.value,
      resolution,
    })
  if (
    Option.isSome(Array.get(matchingOccurrences, 1)) ||
    Option.isSome(maybeAtomicPairMismatch) ||
    !acceptedOccurrenceMatchesProposal(maybeOccurrence.value, proposal)
  ) {
    return Effect.fail(
      new V3AcceptanceAuthorityTerminalHistoryError({
        proposalId: proposal.proposalId,
        reason: 'AcceptedOccurrenceMismatch',
      }),
    )
  }
  return Effect.succeed(
    Option.some(
      V3AcceptanceAuthorityResolvedAccepted.make({
        occurrence: maybeOccurrence.value,
        resolution,
      }),
    ),
  )
}

const activeSession = (
  definition: V3AcceptanceAuthorityRecordDefinition,
  snapshot: V3AcceptanceAuthoritySnapshot,
  proposal: InstantV3MessageProposalRecord,
): Result.Result<
  typeof InstantV3ProgramSessionRecord.Type,
  V3AcceptanceAuthorityEvaluation
> => {
  const maybeSession = latestSession(snapshot.programSessions)
  if (Option.isNone(maybeSession)) {
    return Result.fail(deferred(proposal.proposalId, 'ProgramSessionPending'))
  }
  const session = maybeSession.value
  if (
    session.lifecycleState !== 'Active' ||
    session.authorityProcessorId !== definition.acceptingProcessorId ||
    !exactScope(definition.scope, session)
  ) {
    return Result.fail(
      V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(proposal, definition, 'ScopeMismatch'),
      }),
    )
  }
  return Result.succeed(session)
}

const activeOriginPolicy = (
  definition: V3AcceptanceAuthorityRecordDefinition,
  snapshot: V3AcceptanceAuthoritySnapshot,
  proposal: InstantV3MessageProposalRecord,
  policy: Readonly<{
    generation: number
    originDeviceId: string
    originPolicyId: string
  }>,
): Result.Result<
  typeof InstantV3OriginPolicyDecisionRecord.Type,
  V3AcceptanceAuthorityEvaluation
> => {
  const maybeDecision = latestPolicy(
    snapshot.originPolicyDecisions,
    policy.originPolicyId,
  )
  if (Option.isNone(maybeDecision)) {
    return Result.fail(deferred(proposal.proposalId, 'OriginPolicyPending'))
  }
  const decision = maybeDecision.value
  if (
    decision.instantAppId !== definition.scope.instantAppId ||
    decision.subjectId !== definition.scope.subjectId ||
    decision.protocolVersion !== definition.scope.protocolVersion ||
    decision.originDeviceId !== policy.originDeviceId ||
    decision.decisionState !== 'Active'
  ) {
    return Result.fail(
      V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(
          proposal,
          definition,
          'OriginPolicyDenied',
        ),
      }),
    )
  }
  if (decision.generation !== policy.generation) {
    if (
      decision.decisionState === 'Active' &&
      decision.generation < policy.generation
    ) {
      return Result.fail(deferred(proposal.proposalId, 'OriginPolicyPending'))
    }
    return Result.fail(
      V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(
          proposal,
          definition,
          'OriginPolicyGenerationMismatch',
        ),
      }),
    )
  }
  return Result.succeed(decision)
}

const commonAcceptedFields = (
  definition: V3AcceptanceAuthorityRecordDefinition,
  proposal: InstantV3MessageProposalRecord,
  sessionPolicy: Synchronization.SessionPolicy,
  acceptedSequence: number,
  acceptedAtMs: InstantV3TimestampMs,
  envelopeJson: InstantV3CanonicalJson,
  category: Synchronization.MessageCategory,
  audience: Synchronization.Audience,
) => ({
  acceptedAtMs,
  acceptedSequence,
  acceptedSequencePositionKey: makeInstantV3AcceptedSequencePositionKey(
    proposal.sessionId,
    acceptedSequence,
  ),
  acceptingProcessorId: definition.acceptingProcessorId,
  actorId: proposal.actorId,
  actorSequence: proposal.actorSequence,
  actorSequencePositionKey: makeInstantV3AcceptedActorSequencePositionKey(
    proposal.sessionId,
    proposal.actorId,
    proposal.clientId,
    proposal.actorSequence,
  ),
  appSubjectDigest: proposal.appSubjectDigest,
  audience,
  causationId: proposal.causationOccurrenceId,
  clientId: proposal.clientId,
  correlationId: proposal.correlationId,
  createdAtMs: proposal.createdAtMs,
  envelopeJson,
  envelopeVersion: proposal.envelopeVersion,
  eventId: proposal.eventId,
  eventVersion: proposal.eventVersion,
  id: definition.makeEntityId(),
  instantAppId: proposal.instantAppId,
  messageCategory: category,
  occurrenceId: proposal.occurrenceId,
  occurrencePositionKey: makeInstantV3AcceptedOccurrencePositionKey(
    proposal.sessionId,
    proposal.occurrenceId,
  ),
  originDeviceId: proposal.originDeviceId,
  originatingProcessorId: proposal.originatingProcessorId,
  payloadJson: proposal.payloadJson,
  policyGeneration: sessionPolicy.generation,
  positionKey: makeInstantV3AcceptedSequencePositionKey(
    proposal.sessionId,
    acceptedSequence,
  ),
  programId: proposal.programId,
  programVersion: proposal.programVersion,
  proposedEnvelopeJson: proposal.envelopeJson,
  proposalId: proposal.proposalId,
  proposalPositionKey: makeInstantV3AcceptedProposalPositionKey(
    proposal.sessionId,
    proposal.proposalId,
  ),
  protocolVersion: proposal.protocolVersion,
  sessionEpochId: proposal.sessionEpochId,
  sessionId: proposal.sessionId,
  sessionPolicy,
  subjectId: proposal.subjectId,
})

const acceptedResolution = (
  definition: V3AcceptanceAuthorityRecordDefinition,
  proposal: InstantV3MessageProposalRecord,
  occurrence: InstantV3AcceptedMessageOccurrenceRecord,
): typeof InstantV3AcceptedMessageProposalResolutionRecord.Type =>
  InstantV3AcceptedMessageProposalResolutionRecord.make({
    acceptedAtMs: occurrence.acceptedAtMs,
    acceptedMessageOccurrenceId: occurrence.id,
    acceptedMessageOccurrencePositionKey: occurrence.positionKey,
    acceptingProcessorId: definition.acceptingProcessorId,
    actorId: proposal.actorId,
    actorSequence: proposal.actorSequence,
    appSubjectDigest: proposal.appSubjectDigest,
    clientId: proposal.clientId,
    id: definition.makeEntityId(),
    instantAppId: proposal.instantAppId,
    originDeviceId: proposal.originDeviceId,
    originatingProcessorId: proposal.originatingProcessorId,
    programId: proposal.programId,
    programVersion: proposal.programVersion,
    proposalId: proposal.proposalId,
    proposalKind: proposal.proposalKind,
    proposalTerminalPositionKey:
      makeInstantV3MessageProposalResolutionPositionKey(
        proposal.sessionId,
        proposal.proposalId,
      ),
    protocolVersion: proposal.protocolVersion,
    resolutionState: 'Accepted',
    sessionEpochId: proposal.sessionEpochId,
    sessionId: proposal.sessionId,
    subjectId: proposal.subjectId,
  })

const proposalPresence = (
  snapshot: V3AcceptanceAuthoritySnapshot,
  proposal: InstantV3MessageProposalRecord,
): Result.Result<void, 'Conflict' | 'Missing'> => {
  const maybeStored = Array.findFirst(
    snapshot.messageProposals,
    candidate => candidate.proposalId === proposal.proposalId,
  )
  if (Option.isNone(maybeStored)) {
    return Result.fail('Missing')
  }
  if (encodeProposal(maybeStored.value) !== encodeProposal(proposal)) {
    return Result.fail('Conflict')
  }
  return Result.succeed(undefined)
}

const acceptedOccurrenceMatchesProposal = (
  occurrence: InstantV3AcceptedMessageOccurrenceRecord,
  proposal: InstantV3MessageProposalRecord,
): boolean => {
  const commonMatches =
    occurrence.actorId === proposal.actorId &&
    occurrence.actorSequence === proposal.actorSequence &&
    occurrence.appSubjectDigest === proposal.appSubjectDigest &&
    occurrence.causationId === proposal.causationOccurrenceId &&
    occurrence.clientId === proposal.clientId &&
    occurrence.correlationId === proposal.correlationId &&
    occurrence.createdAtMs === proposal.createdAtMs &&
    occurrence.envelopeVersion === proposal.envelopeVersion &&
    occurrence.eventId === proposal.eventId &&
    occurrence.eventVersion === proposal.eventVersion &&
    occurrence.instantAppId === proposal.instantAppId &&
    occurrence.occurrenceId === proposal.occurrenceId &&
    occurrence.originDeviceId === proposal.originDeviceId &&
    occurrence.originatingProcessorId === proposal.originatingProcessorId &&
    occurrence.payloadJson === proposal.payloadJson &&
    occurrence.programId === proposal.programId &&
    occurrence.programVersion === proposal.programVersion &&
    occurrence.proposedEnvelopeJson === proposal.envelopeJson &&
    occurrence.proposalId === proposal.proposalId &&
    occurrence.proposalKind === proposal.proposalKind &&
    occurrence.protocolVersion === proposal.protocolVersion &&
    occurrence.sessionEpochId === proposal.sessionEpochId &&
    occurrence.sessionId === proposal.sessionId &&
    occurrence.subjectId === proposal.subjectId
  if (!commonMatches) {
    return false
  }
  if (
    occurrence.proposalKind === 'OrdinaryMessage' &&
    proposal.proposalKind === 'OrdinaryMessage'
  ) {
    return (
      occurrence.admissionClaimJson === proposal.admissionClaimJson &&
      occurrence.admissionOccurrenceId === proposal.admissionOccurrenceId &&
      occurrence.messageIdempotencyKey === proposal.messageIdempotencyKey &&
      occurrence.originClientCertificateJson ===
        proposal.originClientCertificateJson &&
      occurrence.originPolicyGeneration === proposal.originPolicyGeneration &&
      occurrence.originPolicyId === proposal.originPolicyId &&
      occurrence.originProcessorCertificateJson ===
        proposal.originProcessorCertificateJson &&
      occurrence.originProposalSignature === proposal.originProposalSignature
    )
  }
  if (
    occurrence.proposalKind === 'EffectResult' &&
    proposal.proposalKind === 'EffectResult'
  ) {
    return (
      occurrence.causalAcceptedSequence === proposal.causalAcceptedSequence &&
      audienceEquivalence(occurrence.causalAudience, proposal.causalAudience) &&
      occurrence.causalMessageCategory === proposal.causalMessageCategory &&
      occurrence.causalOccurrenceId === proposal.causalOccurrenceId &&
      occurrence.causalOriginDeviceId === proposal.causalOriginDeviceId &&
      occurrence.causalOriginPolicyGeneration ===
        proposal.causalOriginPolicyGeneration &&
      occurrence.causalOriginPolicyId === proposal.causalOriginPolicyId &&
      occurrence.causalOriginProofDigest === proposal.causalOriginProofDigest &&
      occurrence.causalOriginatingProcessorId ===
        proposal.causalOriginatingProcessorId &&
      occurrence.causalPolicyGeneration === proposal.causalPolicyGeneration &&
      occurrence.causalProposalId === proposal.causalProposalId &&
      occurrence.effectAssignmentGeneration ===
        proposal.effectAssignmentGeneration &&
      occurrence.effectCancellationGeneration ===
        proposal.effectCancellationGeneration &&
      occurrence.effectIdempotencyKey === proposal.effectIdempotencyKey &&
      occurrence.effectPlacementId === proposal.effectPlacementId &&
      occurrence.effectRequestId === proposal.effectRequestId &&
      occurrence.executorClientCertificateJson ===
        proposal.executorClientCertificateJson &&
      occurrence.executorOriginPolicyGeneration ===
        proposal.executorOriginPolicyGeneration &&
      occurrence.executorOriginPolicyId === proposal.executorOriginPolicyId &&
      occurrence.executorProcessorCertificateJson ===
        proposal.executorProcessorCertificateJson &&
      occurrence.executorProcessorId === proposal.executorProcessorId &&
      occurrence.executorResultSignature === proposal.executorResultSignature
    )
  }
  return false
}

const acceptedIdentityConflict = (
  occurrences: ReadonlyArray<InstantV3AcceptedMessageOccurrenceRecord>,
  proposal: InstantV3MessageProposalRecord,
): boolean =>
  Array.some(
    occurrences,
    occurrence =>
      occurrence.occurrenceId === proposal.occurrenceId ||
      (occurrence.actorId === proposal.actorId &&
        occurrence.clientId === proposal.clientId &&
        occurrence.actorSequence >= proposal.actorSequence),
  )

const proposalCausalLineageMatches = (
  causal: InstantV3AcceptedMessageOccurrenceRecord,
  proposal: typeof InstantV3MessageProposalRecord.Type &
    Readonly<{ proposalKind: 'EffectResult' }>,
  digest: string,
): boolean => {
  const originPolicy = causalOriginPolicy(causal)
  return (
    causal.acceptedSequence === proposal.causalAcceptedSequence &&
    causal.occurrenceId === proposal.causalOccurrenceId &&
    causal.occurrenceId === proposal.causationOccurrenceId &&
    causal.proposalId === proposal.causalProposalId &&
    causal.originDeviceId === proposal.causalOriginDeviceId &&
    causal.originatingProcessorId === proposal.causalOriginatingProcessorId &&
    causal.messageCategory === proposal.causalMessageCategory &&
    causal.policyGeneration === proposal.causalPolicyGeneration &&
    audienceEquivalence(causal.audience, proposal.causalAudience) &&
    proposal.causalOriginProofDigest === digest &&
    proposal.causalOriginPolicyId === originPolicy.originPolicyId &&
    proposal.causalOriginPolicyGeneration === originPolicy.generation
  )
}

const acceptedProofChainDigest = (
  snapshot: V3AcceptanceAuthoritySnapshot,
  occurrence: InstantV3AcceptedMessageOccurrenceRecord,
): Effect.Effect<Option.Option<string>, V3AcceptanceAuthorityHistoryError> => {
  let proposalsById = HashMap.empty<string, InstantV3MessageProposalRecord>()
  for (const proposal of snapshot.messageProposals) {
    if (!HashMap.has(proposalsById, proposal.proposalId)) {
      proposalsById = HashMap.set(proposalsById, proposal.proposalId, proposal)
    }
  }
  let occurrencesById = HashMap.empty<
    string,
    InstantV3AcceptedMessageOccurrenceRecord
  >()
  for (const accepted of snapshot.acceptedMessageOccurrences) {
    if (!HashMap.has(occurrencesById, accepted.occurrenceId)) {
      occurrencesById = HashMap.set(
        occurrencesById,
        accepted.occurrenceId,
        accepted,
      )
    }
  }
  const digest = (
    current: InstantV3AcceptedMessageOccurrenceRecord,
    visitedOccurrenceIds: HashSet.HashSet<string>,
  ): Effect.Effect<Option.Option<string>, V3AcceptanceAuthorityHistoryError> =>
    Effect.gen(function* () {
      const failure = (): V3AcceptanceAuthorityHistoryError =>
        new V3AcceptanceAuthorityHistoryError({
          occurrenceId: current.occurrenceId,
          reason: 'AcceptedProofInvalid',
        })
      if (HashSet.has(visitedOccurrenceIds, current.occurrenceId)) {
        return yield* Effect.fail(failure())
      }
      const maybeProposal = HashMap.get(proposalsById, current.proposalId)
      if (Option.isNone(maybeProposal)) {
        return Option.none()
      }
      if (!acceptedOccurrenceMatchesProposal(current, maybeProposal.value)) {
        return yield* Effect.fail(failure())
      }
      const proposal = maybeProposal.value
      if (proposal.proposalKind === 'OrdinaryMessage') {
        yield* verifyOriginOrdinaryMessageProposal(
          proposal,
          OriginOrdinaryProposalProofScope.make({
            clientId: OriginClientId.make(proposal.clientId),
            instantAppId: proposal.instantAppId,
            originDeviceId: OriginDeviceId.make(proposal.originDeviceId),
            originPolicyGeneration: proposal.originPolicyGeneration,
            originPolicyId: proposal.originPolicyId,
            originatingProcessorId: OriginProcessorId.make(
              proposal.originatingProcessorId,
            ),
            programId: proposal.programId,
            programVersion: proposal.programVersion,
            protocolVersion: proposal.protocolVersion,
            sessionId: proposal.sessionId,
            subjectId: proposal.subjectId,
          }),
        ).pipe(Effect.mapError(failure))
        const originDigest = yield* digestOriginOrdinaryMessageProposalProof(
          proposal,
        ).pipe(Effect.mapError(failure))
        return Option.some(originDigest)
      }
      yield* verifyOriginEffectResultProposal(
        proposal,
        OriginEffectResultProofScope.make({
          clientId: OriginClientId.make(proposal.clientId),
          executorOriginPolicyGeneration:
            proposal.executorOriginPolicyGeneration,
          executorOriginPolicyId: proposal.executorOriginPolicyId,
          executorProcessorId: OriginProcessorId.make(
            proposal.executorProcessorId,
          ),
          instantAppId: proposal.instantAppId,
          originDeviceId: OriginDeviceId.make(proposal.originDeviceId),
          programId: proposal.programId,
          programVersion: proposal.programVersion,
          protocolVersion: proposal.protocolVersion,
          sessionId: proposal.sessionId,
          subjectId: proposal.subjectId,
        }),
      ).pipe(Effect.mapError(failure))
      const maybeCausal = HashMap.get(
        occurrencesById,
        proposal.causalOccurrenceId,
      )
      if (Option.isNone(maybeCausal)) {
        return Option.none()
      }
      if (maybeCausal.value.acceptedSequence >= current.acceptedSequence) {
        return yield* Effect.fail(failure())
      }
      const maybeDigest = yield* digest(
        maybeCausal.value,
        HashSet.add(visitedOccurrenceIds, current.occurrenceId),
      )
      if (Option.isNone(maybeDigest)) {
        return Option.none()
      }
      if (
        !proposalCausalLineageMatches(
          maybeCausal.value,
          proposal,
          maybeDigest.value,
        )
      ) {
        return yield* Effect.fail(failure())
      }
      return maybeDigest
    })
  return digest(occurrence, HashSet.empty())
}

const nextAcceptedSequence = (
  snapshot: V3AcceptanceAuthoritySnapshot,
): number =>
  Option.match(
    Array.last(Array.sort(snapshot.acceptedMessageOccurrences, acceptedOrder)),
    {
      onNone: () => 1,
      onSome: occurrence => occurrence.acceptedSequence + 1,
    },
  )

const validateCausalLineage = (
  causal: InstantV3AcceptedMessageOccurrenceRecord,
  request: typeof InstantV3EffectRequestRecord.Type,
  proposal: typeof InstantV3MessageProposalRecord.Type &
    Readonly<{ proposalKind: 'EffectResult' }>,
  digest: string,
): boolean => {
  const originPolicy = causalOriginPolicy(causal)
  return (
    causal.acceptedSequence === proposal.causalAcceptedSequence &&
    causal.acceptedSequence === request.causalAcceptedSequence &&
    causal.occurrenceId === proposal.causalOccurrenceId &&
    causal.occurrenceId === request.causalOccurrenceId &&
    causal.occurrenceId === proposal.causationOccurrenceId &&
    causal.proposalId === proposal.causalProposalId &&
    causal.proposalId === request.causalProposalId &&
    causal.originDeviceId === proposal.causalOriginDeviceId &&
    causal.originDeviceId === request.causalOriginDeviceId &&
    causal.originatingProcessorId === proposal.causalOriginatingProcessorId &&
    causal.originatingProcessorId === request.causalOriginatingProcessorId &&
    causal.messageCategory === proposal.causalMessageCategory &&
    causal.messageCategory === request.causalMessageCategory &&
    causal.policyGeneration === proposal.causalPolicyGeneration &&
    causal.policyGeneration === request.causalPolicyGeneration &&
    audienceEquivalence(causal.audience, proposal.causalAudience) &&
    audienceEquivalence(causal.audience, request.causalAudience) &&
    proposal.causalOriginProofDigest === digest &&
    request.causalOriginProofDigest === digest &&
    proposal.causalOriginPolicyId === request.causalOriginPolicyId &&
    proposal.causalOriginPolicyGeneration ===
      request.causalOriginPolicyGeneration &&
    proposal.causalOriginPolicyId === originPolicy.originPolicyId &&
    proposal.causalOriginPolicyGeneration === originPolicy.generation
  )
}

const permittedEffectResult = (
  request: typeof InstantV3EffectRequestRecord.Type,
  proposal: InstantV3MessageProposalRecord,
): boolean =>
  Array.some(
    request.permittedResultEvents,
    range =>
      range.eventId === proposal.eventId &&
      proposal.eventVersion >= range.minimumVersion &&
      proposal.eventVersion <= range.maximumVersion,
  )

const latestPlacementForRequest = (
  placements: ReadonlyArray<typeof InstantV3EffectPlacementRecord.Type>,
  requestId: string,
): Option.Option<typeof InstantV3EffectPlacementRecord.Type> =>
  Array.head(
    Array.sort(
      Array.filter(placements, placement => placement.requestId === requestId),
      Order.combine(
        Order.mapInput(
          Order.flip(Order.Number),
          (placement: typeof InstantV3EffectPlacementRecord.Type) =>
            placement.assignmentGeneration,
        ),
        Order.mapInput(
          Order.flip(Order.Number),
          (placement: typeof InstantV3EffectPlacementRecord.Type) =>
            placement.cancellationGeneration,
        ),
      ),
    ),
  )

const ordinaryEvaluation = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Claim,
  DecodeError,
  ResolutionError,
>(
  definition: V3AcceptanceAuthorityDefinition<
    Model,
    Message,
    Claim,
    DecodeError,
    ResolutionError
  >,
  snapshot: V3AcceptanceAuthoritySnapshot,
  proposal: typeof InstantV3MessageProposalRecord.Type &
    Readonly<{ proposalKind: 'OrdinaryMessage' }>,
  session: typeof InstantV3ProgramSessionRecord.Type,
  projectedModel: Model,
): Effect.Effect<V3AcceptanceAuthorityEvaluation, V3AcceptanceAuthorityError> =>
  Effect.gen(function* () {
    const policy = activeOriginPolicy(definition, snapshot, proposal, {
      generation: proposal.originPolicyGeneration,
      originDeviceId: proposal.originDeviceId,
      originPolicyId: proposal.originPolicyId,
    })
    if (Result.isFailure(policy)) {
      return policy.failure
    }
    const proof = yield* Effect.result(
      verifyOriginOrdinaryMessageProposal(
        proposal,
        OriginOrdinaryProposalProofScope.make({
          clientId: OriginClientId.make(proposal.clientId),
          instantAppId: definition.scope.instantAppId,
          originDeviceId: OriginDeviceId.make(policy.success.originDeviceId),
          originPolicyGeneration: policy.success.generation,
          originPolicyId: policy.success.originPolicyId,
          originatingProcessorId: OriginProcessorId.make(
            proposal.originatingProcessorId,
          ),
          programId: definition.scope.programId,
          programVersion: definition.scope.programVersion,
          protocolVersion: definition.scope.protocolVersion,
          sessionId: definition.scope.sessionId,
          subjectId: definition.scope.subjectId,
        }),
      ),
    )
    if (Result.isFailure(proof)) {
      return V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(
          proposal,
          definition,
          'OriginProofInvalid',
        ),
      })
    }
    const boundedClaim = S.decodeUnknownResult(InstantV3AdmissionClaimJson)(
      proposal.admissionClaimJson,
    )
    if (Result.isFailure(boundedClaim)) {
      return V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(
          proposal,
          definition,
          'AdmissionClaimInvalid',
        ),
      })
    }
    const claimInput = Result.try({
      try: () => JSON.parse(boundedClaim.success),
      catch: cause => cause,
    })
    if (Result.isFailure(claimInput)) {
      return V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(
          proposal,
          definition,
          'AdmissionClaimInvalid',
        ),
      })
    }
    const decodedClaim = Result.try({
      try: () => definition.admission.decodeClaim(claimInput.success),
      catch: cause => cause,
    })
    if (
      Result.isFailure(decodedClaim) ||
      Result.isFailure(decodedClaim.success)
    ) {
      return V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(
          proposal,
          definition,
          'AdmissionClaimInvalid',
        ),
      })
    }
    const claim = decodedClaim.success.success
    const occurrenceId = Result.try({
      try: () => definition.admission.occurrenceId(claim),
      catch: cause => cause,
    })
    if (
      Result.isFailure(occurrenceId) ||
      occurrenceId.success !== proposal.admissionOccurrenceId ||
      proposal.admissionOccurrenceId !== proposal.occurrenceId
    ) {
      return V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(
          proposal,
          definition,
          'AdmissionClaimInvalid',
        ),
      })
    }
    const resolved = Result.try({
      try: () =>
        definition.admission.resolve(
          projectedModel,
          claim,
          invocationFacts(proposal),
        ),
      catch: cause => cause,
    })
    if (Result.isFailure(resolved) || Result.isFailure(resolved.success)) {
      return V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(
          proposal,
          definition,
          'AdmissionClaimRejected',
        ),
      })
    }
    const message = resolved.success.success
    const metadataValidation = yield* Effect.result(
      validateProposalMetadata(
        definition.admission.program.Message,
        definition.wire,
        proposal,
        message,
      ),
    )
    if (Result.isFailure(metadataValidation)) {
      return V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(
          proposal,
          definition,
          'EnvelopeInvalid',
        ),
      })
    }
    const categoryResult = yield* Effect.result(
      messageCategory(
        definition.admission.program.synchronization,
        session.sessionPolicy,
        message,
        proposal.proposalId,
      ),
    )
    if (Result.isFailure(categoryResult)) {
      return V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(
          proposal,
          definition,
          'SynchronizationPolicyMismatch',
        ),
      })
    }
    const routing = expectedRouting(
      session.sessionPolicy,
      categoryResult.success,
      proposal.originatingProcessorId,
    )
    if (Result.isFailure(routing)) {
      return V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(proposal, definition, routing.failure),
      })
    }
    const transition = yield* Effect.result(
      validateCandidateTransition(
        definition,
        projectedModel,
        message,
        proposal.proposalId,
      ),
    )
    if (Result.isFailure(transition)) {
      return V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(
          proposal,
          definition,
          'AdmissionClaimRejected',
        ),
      })
    }
    const duplicate = Array.some(
      snapshot.acceptedMessageOccurrences,
      occurrence =>
        occurrence.proposalKind === 'OrdinaryMessage' &&
        occurrence.messageIdempotencyPositionKey ===
          makeInstantV3AcceptedMessageIdempotencyPositionKey(
            proposal.sessionId,
            proposal.messageIdempotencyKey,
          ),
    )
    if (duplicate) {
      return V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(
          proposal,
          definition,
          'DuplicateOrdinaryMessage',
        ),
      })
    }
    const acceptedSequence = nextAcceptedSequence(snapshot)
    const acceptedAtMs = definition.now()
    const envelope = yield* definition.wire
      .makeAcceptedEnvelope(proposal, {
        acceptedAtMs,
        acceptedSequence,
        acceptingProcessorId: definition.acceptingProcessorId,
        audience: routing.success,
        messageCategory: categoryResult.success,
        policyGeneration: session.sessionPolicy.generation,
        sessionPolicy: session.sessionPolicy,
      })
      .pipe(
        Effect.catchCause(cause =>
          Effect.fail(
            new V3AcceptanceAuthorityEvaluationError({
              cause,
              operation: 'MakeAcceptedEnvelope',
              proposalId: proposal.proposalId,
            }),
          ),
        ),
      )
    const occurrence = InstantV3AcceptedOrdinaryMessageOccurrenceRecord.make({
      ...commonAcceptedFields(
        definition,
        proposal,
        session.sessionPolicy,
        acceptedSequence,
        acceptedAtMs,
        envelope,
        categoryResult.success,
        routing.success,
      ),
      admissionClaimJson: proposal.admissionClaimJson,
      admissionOccurrenceId: proposal.admissionOccurrenceId,
      messageIdempotencyKey: proposal.messageIdempotencyKey,
      messageIdempotencyPositionKey:
        makeInstantV3AcceptedMessageIdempotencyPositionKey(
          proposal.sessionId,
          proposal.messageIdempotencyKey,
        ),
      originClientCertificateJson: proposal.originClientCertificateJson,
      originPolicyGeneration: proposal.originPolicyGeneration,
      originPolicyId: proposal.originPolicyId,
      originProcessorCertificateJson: proposal.originProcessorCertificateJson,
      originProposalSignature: proposal.originProposalSignature,
      proposalKind: 'OrdinaryMessage',
    })
    const resolution = acceptedResolution(definition, proposal, occurrence)
    return V3AcceptanceAuthorityAccept.make({
      transaction: V3ProgramStoreAcceptedMessageOccurrenceTransaction.make({
        occurrence,
        resolution,
      }),
    })
  })

const effectEvaluation = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Claim,
  DecodeError,
  ResolutionError,
>(
  definition: V3AcceptanceAuthorityDefinition<
    Model,
    Message,
    Claim,
    DecodeError,
    ResolutionError
  >,
  snapshot: V3AcceptanceAuthoritySnapshot,
  proposal: typeof InstantV3MessageProposalRecord.Type &
    Readonly<{ proposalKind: 'EffectResult' }>,
  projectModel: V3AcceptanceAuthorityModelProjector<Model>,
): Effect.Effect<V3AcceptanceAuthorityEvaluation, V3AcceptanceAuthorityError> =>
  Effect.gen(function* () {
    const policy = activeOriginPolicy(definition, snapshot, proposal, {
      generation: proposal.executorOriginPolicyGeneration,
      originDeviceId: proposal.originDeviceId,
      originPolicyId: proposal.executorOriginPolicyId,
    })
    if (Result.isFailure(policy)) {
      return policy.failure
    }
    const proof = yield* Effect.result(
      verifyOriginEffectResultProposal(
        proposal,
        OriginEffectResultProofScope.make({
          clientId: OriginClientId.make(proposal.clientId),
          executorOriginPolicyGeneration: policy.success.generation,
          executorOriginPolicyId: policy.success.originPolicyId,
          executorProcessorId: OriginProcessorId.make(
            proposal.executorProcessorId,
          ),
          instantAppId: definition.scope.instantAppId,
          originDeviceId: OriginDeviceId.make(policy.success.originDeviceId),
          programId: definition.scope.programId,
          programVersion: definition.scope.programVersion,
          protocolVersion: definition.scope.protocolVersion,
          sessionId: definition.scope.sessionId,
          subjectId: definition.scope.subjectId,
        }),
      ),
    )
    if (Result.isFailure(proof)) {
      return V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(
          proposal,
          definition,
          'OriginProofInvalid',
        ),
      })
    }
    const maybeRequest = Array.findFirst(
      snapshot.effectRequests,
      request => request.requestId === proposal.effectRequestId,
    )
    if (Option.isNone(maybeRequest)) {
      return deferred(proposal.proposalId, 'EffectRequestPending')
    }
    const request = maybeRequest.value
    const maybePlacement = latestPlacementForRequest(
      snapshot.effectPlacements,
      request.requestId,
    )
    if (Option.isNone(maybePlacement)) {
      return deferred(proposal.proposalId, 'EffectPlacementPending')
    }
    const placement = maybePlacement.value
    if (
      proposal.effectAssignmentGeneration > placement.assignmentGeneration ||
      (proposal.effectAssignmentGeneration === placement.assignmentGeneration &&
        proposal.effectCancellationGeneration >
          placement.cancellationGeneration)
    ) {
      return deferred(proposal.proposalId, 'EffectPlacementPending')
    }
    const maybeCausal = Array.findFirst(
      snapshot.acceptedMessageOccurrences,
      occurrence => occurrence.occurrenceId === request.causalOccurrenceId,
    )
    if (Option.isNone(maybeCausal)) {
      return deferred(proposal.proposalId, 'AcceptedOccurrencePending')
    }
    const causal = maybeCausal.value
    const maybeCausalProposal = Array.findFirst(
      snapshot.messageProposals,
      candidate => candidate.proposalId === causal.proposalId,
    )
    if (Option.isNone(maybeCausalProposal)) {
      return deferred(proposal.proposalId, 'ProposalPending')
    }
    const causalProposal = maybeCausalProposal.value
    if (!acceptedOccurrenceMatchesProposal(causal, causalProposal)) {
      return V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(
          proposal,
          definition,
          'CausalLinkageInvalid',
        ),
      })
    }
    const digest = yield* Effect.result(
      acceptedProofChainDigest(snapshot, causal),
    )
    if (Result.isFailure(digest)) {
      return V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(
          proposal,
          definition,
          'CausalLinkageInvalid',
        ),
      })
    }
    if (Option.isNone(digest.success)) {
      return deferred(proposal.proposalId, 'ProposalPending')
    }
    if (
      !exactScope(definition.scope, request) ||
      !exactScope(definition.scope, placement) ||
      !exactScope(definition.scope, causal) ||
      !exactScope(definition.scope, causalProposal) ||
      !validateCausalLineage(causal, request, proposal, digest.success.value)
    ) {
      return V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(
          proposal,
          definition,
          'CausalLinkageInvalid',
        ),
      })
    }
    if (
      proposal.effectAssignmentGeneration !== placement.assignmentGeneration ||
      proposal.effectCancellationGeneration !==
        placement.cancellationGeneration ||
      proposal.effectPlacementId !== placement.positionKey ||
      proposal.effectRequestId !== request.requestId ||
      proposal.effectIdempotencyKey !== request.idempotencyKey ||
      proposal.executorProcessorId !== placement.assignedProcessorId ||
      proposal.originatingProcessorId !== proposal.executorProcessorId ||
      !Synchronization.includesProcessor(
        causal.audience,
        request.originatingProcessorId,
      ) ||
      (placement.placementStatus !== 'AssignedPreferred' &&
        placement.placementStatus !== 'AssignedFallback') ||
      !permittedEffectResult(request, proposal)
    ) {
      return V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(
          proposal,
          definition,
          'EffectResultMismatch',
        ),
      })
    }
    const duplicate = Array.some(
      snapshot.acceptedMessageOccurrences,
      occurrence =>
        occurrence.proposalKind === 'EffectResult' &&
        (occurrence.effectIdempotencyPositionKey ===
          makeInstantV3AcceptedEffectIdempotencyPositionKey(
            proposal.sessionId,
            proposal.effectIdempotencyKey,
          ) ||
          occurrence.effectRequestResultPositionKey ===
            makeInstantV3AcceptedEffectRequestResultPositionKey(
              proposal.sessionId,
              proposal.effectRequestId,
            )),
    )
    if (duplicate) {
      return V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(
          proposal,
          definition,
          'DuplicateEffectResult',
        ),
      })
    }
    const messageResult = yield* Effect.result(
      decodeMessage(
        definition.admission.program.Message,
        proposal.payloadJson,
        proposal.proposalId,
      ),
    )
    if (Result.isFailure(messageResult)) {
      return V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(
          proposal,
          definition,
          'EnvelopeInvalid',
        ),
      })
    }
    const metadataValidation = yield* Effect.result(
      validateProposalMetadata(
        definition.admission.program.Message,
        definition.wire,
        proposal,
        messageResult.success,
      ),
    )
    if (Result.isFailure(metadataValidation)) {
      return V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(
          proposal,
          definition,
          'EnvelopeInvalid',
        ),
      })
    }
    const projected = yield* projectModel(
      snapshot.acceptedMessageOccurrences,
      request.originatingProcessorId,
    )
    const transition = yield* Effect.result(
      validateCandidateTransition(
        definition,
        projected.model,
        messageResult.success,
        proposal.proposalId,
      ),
    )
    if (Result.isFailure(transition)) {
      return V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(
          proposal,
          definition,
          'EffectResultMismatch',
        ),
      })
    }
    const acceptedSequence = nextAcceptedSequence(snapshot)
    const acceptedAtMs = definition.now()
    const envelope = yield* definition.wire
      .makeAcceptedEnvelope(proposal, {
        acceptedAtMs,
        acceptedSequence,
        acceptingProcessorId: definition.acceptingProcessorId,
        audience: causal.audience,
        messageCategory: causal.messageCategory,
        policyGeneration: causal.policyGeneration,
        sessionPolicy: causal.sessionPolicy,
      })
      .pipe(
        Effect.catchCause(cause =>
          Effect.fail(
            new V3AcceptanceAuthorityEvaluationError({
              cause,
              operation: 'MakeAcceptedEnvelope',
              proposalId: proposal.proposalId,
            }),
          ),
        ),
      )
    const occurrence = InstantV3AcceptedEffectResultOccurrenceRecord.make({
      ...commonAcceptedFields(
        definition,
        proposal,
        causal.sessionPolicy,
        acceptedSequence,
        acceptedAtMs,
        envelope,
        causal.messageCategory,
        causal.audience,
      ),
      causalAcceptedSequence: proposal.causalAcceptedSequence,
      causalAudience: proposal.causalAudience,
      causalMessageCategory: proposal.causalMessageCategory,
      causalOccurrenceId: proposal.causalOccurrenceId,
      causalOriginDeviceId: proposal.causalOriginDeviceId,
      causalOriginPolicyGeneration: proposal.causalOriginPolicyGeneration,
      causalOriginPolicyId: proposal.causalOriginPolicyId,
      causalOriginProofDigest: proposal.causalOriginProofDigest,
      causalOriginatingProcessorId: proposal.causalOriginatingProcessorId,
      causalPolicyGeneration: proposal.causalPolicyGeneration,
      causalProposalId: proposal.causalProposalId,
      effectAssignmentGeneration: proposal.effectAssignmentGeneration,
      effectCancellationGeneration: proposal.effectCancellationGeneration,
      effectIdempotencyKey: proposal.effectIdempotencyKey,
      effectIdempotencyPositionKey:
        makeInstantV3AcceptedEffectIdempotencyPositionKey(
          proposal.sessionId,
          proposal.effectIdempotencyKey,
        ),
      effectPlacementId: proposal.effectPlacementId,
      effectRequestId: proposal.effectRequestId,
      effectRequestResultPositionKey:
        makeInstantV3AcceptedEffectRequestResultPositionKey(
          proposal.sessionId,
          proposal.effectRequestId,
        ),
      executorClientCertificateJson: proposal.executorClientCertificateJson,
      executorOriginPolicyGeneration: proposal.executorOriginPolicyGeneration,
      executorOriginPolicyId: proposal.executorOriginPolicyId,
      executorProcessorCertificateJson:
        proposal.executorProcessorCertificateJson,
      executorProcessorId: proposal.executorProcessorId,
      executorResultSignature: proposal.executorResultSignature,
      proposalKind: 'EffectResult',
    })
    const resolution = acceptedResolution(definition, proposal, occurrence)
    return V3AcceptanceAuthorityAccept.make({
      transaction: V3ProgramStoreAcceptedMessageOccurrenceTransaction.make({
        occurrence,
        resolution,
      }),
    })
  })

const evaluateV3AcceptanceAuthorityProposalWithProjector = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Claim,
  DecodeError,
  ResolutionError,
>(
  definition: V3AcceptanceAuthorityDefinition<
    Model,
    Message,
    Claim,
    DecodeError,
    ResolutionError
  >,
  snapshot: V3AcceptanceAuthoritySnapshot,
  proposal: InstantV3MessageProposalRecord,
  projectModel: V3AcceptanceAuthorityModelProjector<Model>,
): Effect.Effect<V3AcceptanceAuthorityEvaluation, V3AcceptanceAuthorityError> =>
  Effect.gen(function* () {
    if (!exactScope(definition.scope, proposal)) {
      return V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(proposal, definition, 'ScopeMismatch'),
      })
    }
    const presence = proposalPresence(snapshot, proposal)
    if (Result.isFailure(presence)) {
      if (presence.failure === 'Conflict') {
        return V3AcceptanceAuthorityReject.make({
          resolution: rejectionResolution(
            proposal,
            definition,
            'IdentityConflict',
          ),
        })
      }
      return deferred(proposal.proposalId, 'ProposalPending')
    }
    const maybeTerminal = yield* terminalForProposal(
      definition,
      snapshot,
      proposal,
    )
    if (Option.isSome(maybeTerminal)) {
      return maybeTerminal.value
    }
    const maybeAcceptedProposal = Array.findFirst(
      snapshot.acceptedMessageOccurrences,
      occurrence => occurrence.proposalId === proposal.proposalId,
    )
    if (Option.isSome(maybeAcceptedProposal)) {
      if (
        acceptedOccurrenceMatchesProposal(maybeAcceptedProposal.value, proposal)
      ) {
        return deferred(proposal.proposalId, 'AcceptedOccurrencePending')
      }
      return V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(
          proposal,
          definition,
          'IdentityConflict',
        ),
      })
    }
    if (
      acceptedIdentityConflict(snapshot.acceptedMessageOccurrences, proposal)
    ) {
      return V3AcceptanceAuthorityReject.make({
        resolution: rejectionResolution(
          proposal,
          definition,
          'IdentityConflict',
        ),
      })
    }
    const sessionResult = activeSession(definition, snapshot, proposal)
    if (Result.isFailure(sessionResult)) {
      return sessionResult.failure
    }
    if (proposal.proposalKind === 'OrdinaryMessage') {
      const projected = yield* projectModel(
        snapshot.acceptedMessageOccurrences,
        proposal.originatingProcessorId,
      )
      return yield* ordinaryEvaluation(
        definition,
        snapshot,
        proposal,
        sessionResult.success,
        projected.model,
      )
    } else {
      return yield* effectEvaluation(
        definition,
        snapshot,
        proposal,
        projectModel,
      )
    }
  })

/** Evaluates one server-confirmed proposal without performing a store write. */
export const evaluateV3AcceptanceAuthorityProposal = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Claim,
  DecodeError,
  ResolutionError,
>(
  definition: V3AcceptanceAuthorityDefinition<
    Model,
    Message,
    Claim,
    DecodeError,
    ResolutionError
  >,
  snapshot: V3AcceptanceAuthoritySnapshot,
  proposal: InstantV3MessageProposalRecord,
): Effect.Effect<V3AcceptanceAuthorityEvaluation, V3AcceptanceAuthorityError> =>
  evaluateV3AcceptanceAuthorityProposalWithProjector(
    definition,
    snapshot,
    proposal,
    (occurrences, processorId) =>
      projectV3AcceptanceAuthorityModel(definition, occurrences, processorId),
  )

const outcomeFromEvaluation = (
  evaluation: V3AcceptanceAuthorityEvaluation,
  store: V3ProgramAuthorityMutationService,
): Effect.Effect<V3AcceptanceAuthorityOutcome, V3AcceptanceAuthorityError> =>
  M.value(evaluation).pipe(
    M.withReturnType<
      Effect.Effect<V3AcceptanceAuthorityOutcome, V3AcceptanceAuthorityError>
    >(),
    M.tagsExhaustive({
      Accept: ({ transaction }) =>
        store.appendServerConfirmedAcceptedMessageOccurrence(transaction).pipe(
          Effect.map(outcome =>
            V3AcceptanceAuthorityAccepted.make({
              occurrence: transaction.occurrence,
              resolution: transaction.resolution,
              writeDisposition: outcome.disposition,
            }),
          ),
        ),
      Deferred: value => Effect.succeed(value),
      Reject: ({ resolution }) =>
        store
          .appendServerConfirmedRejectedMessageProposalResolution(resolution)
          .pipe(
            Effect.map(outcome =>
              V3AcceptanceAuthorityRejected.make({
                resolution,
                writeDisposition: outcome.disposition,
              }),
            ),
          ),
      ResolvedAccepted: ({ occurrence, resolution }) =>
        Effect.succeed(
          V3AcceptanceAuthorityAccepted.make({
            occurrence,
            resolution,
            writeDisposition: V3ProgramStoreWriteDisposition.make('Idempotent'),
          }),
        ),
      ResolvedRejected: ({ resolution }) =>
        Effect.succeed(
          V3AcceptanceAuthorityRejected.make({
            resolution,
            writeDisposition: V3ProgramStoreWriteDisposition.make('Idempotent'),
          }),
        ),
    }),
  )

const MaximumAdmissionWriteAttempts = 8
const MaximumRetainedAuthorityProcessorProjections = 16

const isAuthorityWriteRace = (
  error: V3AcceptanceAuthorityError,
): error is Extract<
  V3ProgramStoreAppendError,
  Readonly<{
    _tag: 'V3ProgramStoreIdentityConflict' | 'V3ProgramStoreTerminalConflict'
  }>
> =>
  error._tag === 'V3ProgramStoreIdentityConflict' ||
  error._tag === 'V3ProgramStoreTerminalConflict'

/** Constructs a server-confirmed protocol-v3 acceptance and sequencing authority. */
export const makeV3AcceptanceAuthority = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Claim,
  DecodeError,
  ResolutionError,
>(
  config: V3AcceptanceAuthorityConfig<
    Model,
    Message,
    Claim,
    DecodeError,
    ResolutionError
  >,
): Effect.Effect<
  V3AcceptanceAuthority,
  V3AcceptanceAuthorityConfigurationError
> =>
  Effect.gen(function* () {
    if (config.admission.program.id !== config.scope.programId) {
      return yield* new V3AcceptanceAuthorityConfigurationError({
        reason: 'ProgramId',
      })
    }
    if (config.admission.program.version !== config.scope.programVersion) {
      return yield* new V3AcceptanceAuthorityConfigurationError({
        reason: 'ProgramVersion',
      })
    }
    if (config.acceptingProcessorId.length < 1) {
      return yield* new V3AcceptanceAuthorityConfigurationError({
        reason: 'AcceptingProcessorId',
      })
    }
    if (
      config.store.authorityCapability._tag !== 'ServerConfirmedAuthority' ||
      config.store.authorityCapability.protocolVersion !== 3
    ) {
      return yield* new V3AcceptanceAuthorityConfigurationError({
        reason: 'AuthorityCapability',
      })
    }
    if (
      config.store.coordinator.capability._tag !==
        'ExclusiveAuthorityCoordinator' ||
      config.store.coordinator.capability.protocolVersion !== 3
    ) {
      return yield* new V3AcceptanceAuthorityConfigurationError({
        reason: 'AuthorityCoordinator',
      })
    }

    const projectionCacheRef = yield* Ref.make(
      HashMap.empty<string, V3AcceptanceAuthorityProjectionState<Model>>(),
    )
    const projectModel: V3AcceptanceAuthorityModelProjector<Model> = (
      occurrences,
      processorId,
    ) =>
      Effect.gen(function* () {
        const cache = yield* Ref.get(projectionCacheRef)
        const projection =
          yield* projectV3AcceptanceAuthorityModelIncrementally(
            config,
            occurrences,
            processorId,
            HashMap.get(cache, processorId),
          )
        let nextCache = cache
        if (
          !HashMap.has(cache, processorId) &&
          HashMap.size(cache) >= MaximumRetainedAuthorityProcessorProjections
        ) {
          const maybeEvictedProcessorId = Array.head(
            Array.fromIterable(HashMap.keys(cache)),
          )
          if (Option.isSome(maybeEvictedProcessorId)) {
            nextCache = HashMap.remove(nextCache, maybeEvictedProcessorId.value)
          }
        }
        yield* Ref.set(
          projectionCacheRef,
          HashMap.set(nextCache, processorId, projection),
        )
        return {
          model: projection.model,
          throughAcceptedSequence: projection.throughAcceptedSequence,
        }
      })
    const readServerConfirmedSnapshot =
      config.store.coordinator.withCriticalSection(section =>
        section.readServerConfirmedSnapshot(config.scope),
      )

    const admitWithinCriticalSection = (
      section: V3ProgramAuthorityCriticalSection,
      proposalId: string,
    ): Effect.Effect<
      V3AcceptanceAuthorityOutcome,
      V3AcceptanceAuthorityError
    > =>
      Effect.gen(function* () {
        const snapshot = yield* section.readServerConfirmedSnapshot(
          config.scope,
        )
        const maybeProposal = Array.findFirst(
          snapshot.messageProposals,
          proposal => proposal.proposalId === proposalId,
        )
        if (Option.isNone(maybeProposal)) {
          return V3AcceptanceAuthorityDeferred.make({
            proposalId,
            reason: 'ProposalPending',
          })
        }
        const evaluation =
          yield* evaluateV3AcceptanceAuthorityProposalWithProjector(
            config,
            snapshot,
            maybeProposal.value,
            projectModel,
          )
        return yield* outcomeFromEvaluation(evaluation, section)
      })

    const admitAttempt = (
      proposalId: string,
      attemptsRemaining: number,
    ): Effect.Effect<
      V3AcceptanceAuthorityOutcome,
      V3AcceptanceAuthorityError
    > =>
      config.store.coordinator
        .withCriticalSection(section =>
          admitWithinCriticalSection(section, proposalId),
        )
        .pipe(
          Effect.catchIf(isAuthorityWriteRace, error => {
            if (attemptsRemaining > 1) {
              return admitAttempt(proposalId, attemptsRemaining - 1)
            } else {
              return Effect.fail(error)
            }
          }),
        )

    const admit = (
      proposalId: string,
    ): Effect.Effect<
      V3AcceptanceAuthorityOutcome,
      V3AcceptanceAuthorityError
    > => admitAttempt(proposalId, MaximumAdmissionWriteAttempts)

    const processAvailable = Effect.gen(function* () {
      const snapshot = yield* readServerConfirmedSnapshot
      const resolvedProposalIds = HashSet.fromIterable(
        Array.map(
          snapshot.messageProposalResolutions,
          resolution => resolution.proposalId,
        ),
      )
      const unresolved = Array.filter(
        Array.sort(snapshot.messageProposals, proposalOrder),
        proposal => !HashSet.has(resolvedProposalIds, proposal.proposalId),
      )
      return yield* Effect.forEach(
        unresolved,
        proposal => admit(proposal.proposalId),
        {
          concurrency: 1,
        },
      )
    })

    return { admit, processAvailable, readServerConfirmedSnapshot }
  })
