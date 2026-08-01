import {
  Array,
  Data,
  Deferred,
  Effect,
  Exit,
  Fiber,
  HashMap,
  HashSet,
  Match as M,
  Option,
  Order,
  Schema as S,
  Scope,
  Semaphore,
  Stream,
  SubscriptionRef,
  SynchronizedRef,
  Tuple,
} from 'effect'
import { type Program, Synchronization } from 'foldkit'

import {
  type AcceptedOccurrenceCursorError,
  makeAcceptedOccurrenceCursor,
} from '../acceptedOccurrenceCursor/index.js'
import {
  ProgramStoreConnectionStatus,
  type ProgramStoreConnectionStatus as ProgramStoreConnectionStatusType,
  type ProgramStoreError,
  type ProgramStoreService,
  type ProgramStoreTransactionOutcome,
} from '../programStore/index.js'
import {
  type InstantAcceptedMessageOccurrenceRecord,
  type InstantAcceptedMessageOccurrenceValidationIssue,
  type InstantEffectRequestRecord,
  InstantMessageIdempotencyKey,
  type InstantMessageIdempotencyKey as InstantMessageIdempotencyKeyType,
  InstantMessageProposalRecord,
  type InstantMessageProposalRecord as InstantMessageProposalRecordType,
  type InstantMessageProposalResolutionRecord,
  InstantProgramProtocolVersion,
  instantAcceptedMessageOccurrenceValidationIssue,
  isInstantMessageProposalKindValid,
} from '../schema/index.js'

const AudienceJson = S.fromJsonString(Synchronization.Audience)
const encodeAudience = S.encodeSync(AudienceJson)
const SessionPolicyJson = S.fromJsonString(Synchronization.SessionPolicy)
const encodeSessionPolicy = S.encodeSync(SessionPolicyJson)

type ProposalRouting = Readonly<{
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
  occurrence: InstantAcceptedMessageOccurrenceRecord,
): ProposalRouting => ({
  audience: occurrence.audience,
  messageCategory: occurrence.messageCategory,
  policyGeneration: occurrence.policyGeneration,
  sessionPolicy: occurrence.sessionPolicy,
})

const Detached = S.TaggedStruct('Detached', {})
const Attached = S.TaggedStruct('Attached', {
  transportStatus: S.Union([
    S.Literal('unknown'),
    ProgramStoreConnectionStatus,
  ]),
})

/** The transport state of a shared Program Processor. */
export const SharedProgramConnection = S.Union([Detached, Attached])
/** The transport state of a shared Program Processor. */
export type SharedProgramConnection = typeof SharedProgramConnection.Type

const LiveReplay = S.TaggedStruct('Live', {})
const InspectingReplay = S.TaggedStruct('Inspecting', {
  frame: S.Int,
})

/** Whether the shell displays the projected live Model or an inert replay frame. */
export const SharedProgramReplayMode = S.Union([LiveReplay, InspectingReplay])
/** Whether the shell displays the projected live Model or an inert replay frame. */
export type SharedProgramReplayMode = typeof SharedProgramReplayMode.Type

/** How far one local proposal has progressed without implying acceptance. */
export const PendingProposalPersistence = S.Literals([
  'Local',
  'Enqueued',
  'Synced',
])
/** How far one local proposal has progressed without implying acceptance. */
export type PendingProposalPersistence = typeof PendingProposalPersistence.Type

/** One locally pending proposal and its non-authoritative persistence status. */
export const PendingProgramProposal = S.Struct({
  persistence: PendingProposalPersistence,
  proposal: InstantMessageProposalRecord,
})
/** One locally pending proposal and its non-authoritative persistence status. */
export type PendingProgramProposal = typeof PendingProgramProposal.Type

/** Builds the portable shell snapshot Schema for one shared Program. */
export const makeSharedProgramProcessorSnapshotSchema = <Model>(
  Model: S.Codec<Model, unknown, never, never>,
) =>
  S.Struct({
    acceptedModel: Model,
    acceptedSequence: S.Int,
    connection: SharedProgramConnection,
    displayedModel: Model,
    pendingProposals: S.Array(PendingProgramProposal),
    programId: S.String,
    programVersion: S.Int,
    protocolVersion: InstantProgramProtocolVersion,
    replayMode: SharedProgramReplayMode,
    sessionId: S.String,
    subjectId: S.String,
    synchronizationPolicy: Synchronization.SessionPolicy,
  })

/** One atomic shell view of live accepted state, pending proposals, and replay. */
export type SharedProgramProcessorSnapshot<Model> = Readonly<{
  acceptedModel: Model
  acceptedSequence: number
  connection: SharedProgramConnection
  displayedModel: Model
  pendingProposals: ReadonlyArray<PendingProgramProposal>
  programId: string
  programVersion: number
  protocolVersion: InstantProgramProtocolVersion
  replayMode: SharedProgramReplayMode
  sessionId: string
  subjectId: string
  synchronizationPolicy: Synchronization.SessionPolicy
}>

/** The subset of a live Foldkit ProgramRuntime consumed by this adapter. */
export type SharedProgramRuntime<Model, Message, Envelope, ReplayError> =
  Readonly<{
    project: (model: Model, messages: ReadonlyArray<Message>) => Model
    readModel: () => Model
    replay: Readonly<{
      inspect: (frame: number) => Effect.Effect<Model, ReplayError>
    }>
    run: (
      message: Message,
      options: Readonly<{ envelope: Envelope }>,
    ) => Effect.Effect<Model>
  }>

/** Metadata that identifies one versioned Message payload. */
export type SharedProgramEventMetadata = Readonly<{
  eventId: string
  eventVersion: number
}>

/** Context supplied while Schema-encoding one proposed Message. */
export type ProposedMessageEnvelopeInput = Readonly<{
  actorSequence: number
  clientId: string
  createdAtMs: number
  maybeCausationOccurrenceId: Option.Option<string>
  maybeCorrelationId: Option.Option<string>
  occurrenceId: string
  originDeviceId: string
  originatingProcessorId: string
  programId: string
  programVersion: number
  sessionId: string
  subjectId: string
}>

/** The Schema-backed wire data produced for one local Message. */
export type EncodedProgramMessage = Readonly<{
  envelopeJson: string
  envelopeVersion: number
  eventId: string
  eventVersion: number
  payloadJson: string
}>

/** A decoded accepted Message and its Foldkit provenance envelope. */
export type DecodedAcceptedProgramMessage<Message, Envelope> = Readonly<{
  envelope: Envelope
  message: Message
}>

/** A decoded proposed Message and its locally validated provenance envelope. */
export type DecodedProposedProgramMessage<Message, Envelope> = Readonly<{
  envelope: Envelope
  message: Message
}>

/** Schema-backed encoding and decoding at the Program Message protocol boundary. */
export type SharedProgramMessageCodec<Message, Envelope> = Readonly<{
  acceptEnvelope: (
    proposal: InstantMessageProposalRecordType,
    input: Readonly<{
      acceptedAtMs: number
      acceptedSequence: number
      acceptingProcessorId: string
      effectRequest?: InstantEffectRequestRecord | undefined
    }>,
  ) => Effect.Effect<string, SharedProgramCodecError>
  decodeAccepted: (
    occurrence: InstantAcceptedMessageOccurrenceRecord,
  ) => Effect.Effect<
    DecodedAcceptedProgramMessage<Message, Envelope>,
    SharedProgramCodecError
  >
  decodeProposed: (
    proposal: InstantMessageProposalRecordType,
  ) => Effect.Effect<
    DecodedProposedProgramMessage<Message, Envelope>,
    SharedProgramCodecError
  >
  encodeProposed: (
    message: Message,
    input: ProposedMessageEnvelopeInput,
  ) => Effect.Effect<EncodedProgramMessage, SharedProgramCodecError>
}>

/** Schema message codec configuration independent of any renderer or transport. */
export type SchemaProgramMessageCodecConfig<Message, Envelope> = Readonly<{
  Envelope: S.Codec<Envelope, unknown, never, never>
  Message: S.Codec<Message, unknown, never, never>
  acceptEnvelope: (
    envelope: Envelope,
    input: Readonly<{
      acceptedAtMs: number
      acceptedSequence: number
      acceptingProcessorId: string
    }>,
  ) => Envelope
  envelopeVersion: number
  eventMetadata: (message: Message) => SharedProgramEventMetadata
  makeProposedEnvelope: (
    message: Message,
    input: ProposedMessageEnvelopeInput,
  ) => Envelope
  validateProposedEnvelope: (
    envelope: Envelope,
    proposal: InstantMessageProposalRecordType,
  ) => Effect.Effect<void, unknown>
  validateAcceptedEnvelope: (
    envelope: Envelope,
    occurrence: InstantAcceptedMessageOccurrenceRecord,
  ) => Effect.Effect<void, unknown>
}>

/** A Message or provenance envelope failed its Program-owned Schema. */
export class SharedProgramCodecError extends Data.TaggedError(
  'SharedProgramCodecError',
)<{
  readonly cause: unknown
  readonly operation:
    | 'AcceptEnvelope'
    | 'DecodeAccepted'
    | 'DecodeProposed'
    | 'EncodeProposed'
}> {}

/** An accepted occurrence escaped the Processor's authenticated Program scope. */
export class SharedProgramScopeMismatch extends Data.TaggedError(
  'SharedProgramScopeMismatch',
)<{
  readonly occurrenceId: string
}> {}

/** A terminal record was not written by the Program session's sequencer. */
export class SharedProgramAdmissionSequencerMismatch extends Data.TaggedError(
  'SharedProgramAdmissionSequencerMismatch',
)<{
  readonly actualProcessorId: string
  readonly expectedProcessorId: string
  readonly recordId: string
  readonly recordKind: 'AcceptedOccurrence' | 'ProposalResolution'
}> {}

/** Inert replay inspection failed without dispatching a historical Message. */
export class SharedProgramReplayError extends Data.TaggedError(
  'SharedProgramReplayError',
)<{
  readonly cause: unknown
  readonly frame: number
}> {}

/** A host-owned durable actor sequence could not be advanced. */
export class SharedProgramActorSequenceError extends Data.TaggedError(
  'SharedProgramActorSequenceError',
)<{
  readonly cause: unknown
}> {}

/** An effect result could not inherit routing from its causal occurrence. */
export class SharedProgramCausalRoutingMissing extends Data.TaggedError(
  'SharedProgramCausalRoutingMissing',
)<{
  readonly causationOccurrenceId: string | null
}> {}

/** An accepted occurrence disagreed with its immutable synchronization routing. */
export class SharedProgramAcceptedRoutingMismatch extends Data.TaggedError(
  'SharedProgramAcceptedRoutingMismatch',
)<{
  readonly occurrenceId: string
  readonly reason:
    | 'AudienceClaim'
    | 'CausalRoutingMissing'
    | 'MessageCategoryClaim'
    | 'PolicyGenerationClaim'
    | 'ReadOnlyFollower'
    | 'SessionPolicyClaim'
}> {}

/** An accepted occurrence violated the semantic protocol-v2 row contract. */
export class SharedProgramAcceptedOccurrenceInvalid extends Data.TaggedError(
  'SharedProgramAcceptedOccurrenceInvalid',
)<{
  readonly occurrenceId: string
  readonly reason: InstantAcceptedMessageOccurrenceValidationIssue
}> {}

/** Accepted history reused one effect-result idempotency key. */
export class SharedProgramAcceptedEffectResultDuplicate extends Data.TaggedError(
  'SharedProgramAcceptedEffectResultDuplicate',
)<{
  readonly effectIdempotencyKey: string
  readonly occurrenceId: string
}> {}

/** Accepted history reused one ordinary-Message idempotency key. */
export class SharedProgramAcceptedMessageDuplicate extends Data.TaggedError(
  'SharedProgramAcceptedMessageDuplicate',
)<{
  readonly messageIdempotencyKey: string
  readonly occurrenceId: string
}> {}

/** Accepted history violated the configured ordered session-policy ledger. */
export class SharedProgramAcceptedPolicyHistoryMismatch extends Data.TaggedError(
  'SharedProgramAcceptedPolicyHistoryMismatch',
)<{
  readonly occurrenceId: string
  readonly reason:
    | 'FutureGeneration'
    | 'GenerationDecreased'
    | 'SessionPolicyClaim'
}> {}

/** A proposal resolution escaped the Processor's authenticated Program scope. */
export class SharedProgramProposalResolutionScopeMismatch extends Data.TaggedError(
  'SharedProgramProposalResolutionScopeMismatch',
)<{
  readonly resolutionId: string
}> {}

/** A terminal resolution did not join one matching proposal, or conflicted with acceptance. */
export class SharedProgramProposalResolutionMismatch extends Data.TaggedError(
  'SharedProgramProposalResolutionMismatch',
)<{
  readonly proposalId: string
  readonly reason:
    | 'AcceptedAndRejected'
    | 'ActorId'
    | 'ActorSequence'
    | 'ClientId'
    | 'DuplicateProposal'
    | 'DuplicateResolution'
    | 'MissingProposal'
    | 'ProposalIdentity'
    | 'ProposalScope'
}> {}

/** A Program returned an invalid synchronization category for a Message. */
export class SharedProgramMessageCategoryError extends Data.TaggedError(
  'SharedProgramMessageCategoryError',
)<{
  readonly cause: unknown
}> {}

/** A caller supplied an invalid globally unique ordinary-Message identity. */
export class SharedProgramMessageIdempotencyKeyInvalid extends Data.TaggedError(
  'SharedProgramMessageIdempotencyKeyInvalid',
)<{
  readonly cause: unknown
  readonly messageIdempotencyKey: string
}> {}

const acceptedOccurrenceOrder = Order.mapInput(
  Order.Number,
  (occurrence: InstantAcceptedMessageOccurrenceRecord) =>
    occurrence.acceptedSequence,
)

const validateAcceptedOccurrenceRecord = (
  occurrence: InstantAcceptedMessageOccurrenceRecord,
): Effect.Effect<void, SharedProgramAcceptedOccurrenceInvalid> => {
  const maybeIssue = instantAcceptedMessageOccurrenceValidationIssue(occurrence)
  if (Option.isNone(maybeIssue)) {
    return Effect.void
  } else {
    return Effect.fail(
      new SharedProgramAcceptedOccurrenceInvalid({
        occurrenceId: occurrence.occurrenceId,
        reason: maybeIssue.value,
      }),
    )
  }
}

const validateAcceptedPolicyHistory = (
  occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
  currentPolicy: Synchronization.SessionPolicy,
): Effect.Effect<void, SharedProgramAcceptedPolicyHistoryMismatch> => {
  const initialState: Effect.Effect<
    readonly [
      Option.Option<number>,
      HashMap.HashMap<number, Synchronization.SessionPolicy>,
    ],
    SharedProgramAcceptedPolicyHistoryMismatch
  > = Effect.succeed(
    Tuple.make(
      Option.none<number>(),
      HashMap.empty<number, Synchronization.SessionPolicy>(),
    ),
  )
  return Array.reduce(
    Array.sort(occurrences, acceptedOccurrenceOrder),
    initialState,
    (stateEffect, occurrence) =>
      Effect.flatMap(stateEffect, ([maybeLastGeneration, policies]) => {
        const fail = (
          reason: SharedProgramAcceptedPolicyHistoryMismatch['reason'],
        ): Effect.Effect<never, SharedProgramAcceptedPolicyHistoryMismatch> =>
          Effect.fail(
            new SharedProgramAcceptedPolicyHistoryMismatch({
              occurrenceId: occurrence.occurrenceId,
              reason,
            }),
          )
        const maybeCanonicalPolicy = HashMap.get(
          policies,
          occurrence.policyGeneration,
        )
        if (occurrence.policyGeneration > currentPolicy.generation) {
          return fail('FutureGeneration')
        } else if (
          Option.isSome(maybeLastGeneration) &&
          occurrence.policyGeneration < maybeLastGeneration.value
        ) {
          return fail('GenerationDecreased')
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
          return Effect.succeed(
            Tuple.make(
              Option.some(occurrence.policyGeneration),
              HashMap.set(
                policies,
                occurrence.policyGeneration,
                occurrence.sessionPolicy,
              ),
            ),
          )
        }
      }),
  ).pipe(Effect.asVoid)
}

const validateAcceptedEffectResultIdentities = (
  occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
): Effect.Effect<void, SharedProgramAcceptedEffectResultDuplicate> => {
  const initialAcceptedKeys: Effect.Effect<
    HashSet.HashSet<string>,
    SharedProgramAcceptedEffectResultDuplicate
  > = Effect.succeed(HashSet.empty<string>())
  return Array.reduce(
    Array.sort(occurrences, acceptedOccurrenceOrder),
    initialAcceptedKeys,
    (acceptedKeysEffect, occurrence) =>
      Effect.flatMap(acceptedKeysEffect, acceptedKeys => {
        if (
          occurrence.proposalKind !== 'EffectResult' ||
          occurrence.effectIdempotencyKey === null
        ) {
          return Effect.succeed(acceptedKeys)
        } else if (HashSet.has(acceptedKeys, occurrence.effectIdempotencyKey)) {
          return Effect.fail(
            new SharedProgramAcceptedEffectResultDuplicate({
              effectIdempotencyKey: occurrence.effectIdempotencyKey,
              occurrenceId: occurrence.occurrenceId,
            }),
          )
        } else {
          return Effect.succeed(
            HashSet.add(acceptedKeys, occurrence.effectIdempotencyKey),
          )
        }
      }),
  ).pipe(Effect.asVoid)
}

const validateAcceptedMessageIdentities = (
  occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
): Effect.Effect<void, SharedProgramAcceptedMessageDuplicate> => {
  const initialAcceptedKeys: Effect.Effect<
    HashSet.HashSet<string>,
    SharedProgramAcceptedMessageDuplicate
  > = Effect.succeed(HashSet.empty<string>())
  return Array.reduce(
    Array.sort(occurrences, acceptedOccurrenceOrder),
    initialAcceptedKeys,
    (acceptedKeysEffect, occurrence) =>
      Effect.flatMap(acceptedKeysEffect, acceptedKeys => {
        if (
          occurrence.proposalKind !== 'Message' ||
          occurrence.messageIdempotencyKey === null
        ) {
          return Effect.succeed(acceptedKeys)
        } else if (
          HashSet.has(acceptedKeys, occurrence.messageIdempotencyKey)
        ) {
          return Effect.fail(
            new SharedProgramAcceptedMessageDuplicate({
              messageIdempotencyKey: occurrence.messageIdempotencyKey,
              occurrenceId: occurrence.occurrenceId,
            }),
          )
        } else {
          return Effect.succeed(
            HashSet.add(acceptedKeys, occurrence.messageIdempotencyKey),
          )
        }
      }),
  ).pipe(Effect.asVoid)
}

/** A shared Program Processor could not be constructed safely. */
export type SharedProgramProcessorConstructionError = never

/** A local Message could not be converted into a durable proposal. */
export type SharedProgramProposalError =
  | SharedProgramActorSequenceError
  | SharedProgramCausalRoutingMissing
  | SharedProgramCodecError
  | SharedProgramMessageIdempotencyKeyInvalid
  | SharedProgramMessageCategoryError
  | typeof Synchronization.ReadOnlyFollowerRejected.Type

/** A shared Program Processor operation failed. */
export type SharedProgramProcessorError =
  | AcceptedOccurrenceCursorError
  | ProgramStoreError
  | SharedProgramAcceptedEffectResultDuplicate
  | SharedProgramAcceptedMessageDuplicate
  | SharedProgramAcceptedOccurrenceInvalid
  | SharedProgramAcceptedPolicyHistoryMismatch
  | SharedProgramAcceptedRoutingMismatch
  | SharedProgramAdmissionSequencerMismatch
  | SharedProgramCodecError
  | SharedProgramMessageCategoryError
  | SharedProgramProposalResolutionMismatch
  | SharedProgramProposalResolutionScopeMismatch
  | SharedProgramReplayError
  | SharedProgramScopeMismatch

/** Configuration for one authenticated shared Program Processor. */
export type SharedProgramProcessorConfig<
  Model,
  Message,
  Envelope,
  ReplayError,
> = Readonly<{
  admissionSequencerProcessorId: string
  actorId: string
  clientId: string
  codec: SharedProgramMessageCodec<Message, Envelope>
  makeId: () => string
  Model: S.Codec<Model, unknown, never, never>
  now: () => number
  nextActorSequence: Effect.Effect<number, unknown>
  originDeviceId: string
  originatingProcessorId: string
  programId: string
  programVersion: number
  protocolVersion: InstantProgramProtocolVersion
  runtime: SharedProgramRuntime<Model, Message, Envelope, ReplayError>
  sessionId: string
  store: ProgramStoreService
  subjectId: string
  synchronization: Program.ProgramSynchronization<Model, Message>
  synchronizationPolicy: Synchronization.SessionPolicy
  throughAcceptedSequence?: number
}>

/** Correlation required when a delegated effect result re-enters Message intake. */
export type CorrelatedProposalInput = Readonly<{
  maybeCausationOccurrenceId: Option.Option<string>
  maybeCorrelationId: Option.Option<string>
}>

/** Correlation and durable semantic identity for one ordinary Message. */
export type IdempotentCorrelatedProposalInput = CorrelatedProposalInput &
  Readonly<{
    messageIdempotencyKey: InstantMessageIdempotencyKeyType
  }>

/** Correlation and exact placement generation required for an effect result. */
export type EffectResultProposalInput = CorrelatedProposalInput &
  Readonly<{
    effectAssignmentGeneration: number
    effectCancellationGeneration: number
    effectIdempotencyKey: string
    effectRequestId: string
  }>

/**
 * A live Processor bridge whose runtime Model advances only from accepted
 * occurrences while its live display projects this Client's pending Messages.
 */
export type SharedProgramProcessorService<Model, Message> = Readonly<{
  connect: Effect.Effect<void, SharedProgramProcessorError>
  disconnect: Effect.Effect<void>
  inspectReplay: (
    frame: number,
  ) => Effect.Effect<void, SharedProgramReplayError>
  propose: (
    message: Message,
  ) => Effect.Effect<
    InstantMessageProposalRecordType,
    SharedProgramProposalError
  >
  proposeCorrelated: (
    message: Message,
    input: CorrelatedProposalInput,
  ) => Effect.Effect<
    InstantMessageProposalRecordType,
    SharedProgramProposalError
  >
  proposeIdempotentCorrelated: (
    message: Message,
    input: IdempotentCorrelatedProposalInput,
  ) => Effect.Effect<
    InstantMessageProposalRecordType,
    SharedProgramProposalError
  >
  proposeEffectResult: (
    message: Message,
    input: EffectResultProposalInput,
  ) => Effect.Effect<
    InstantMessageProposalRecordType,
    SharedProgramProposalError
  >
  readSnapshot: Effect.Effect<SharedProgramProcessorSnapshot<Model>>
  returnLive: Effect.Effect<void>
  snapshots: Stream.Stream<SharedProgramProcessorSnapshot<Model>>
}>

/** Creates a Message codec whose payload and provenance are both Schema checked. */
export const makeSchemaProgramMessageCodec = <Message, Envelope>({
  Envelope,
  Message,
  acceptEnvelope,
  envelopeVersion,
  eventMetadata,
  makeProposedEnvelope,
  validateAcceptedEnvelope,
  validateProposedEnvelope,
}: SchemaProgramMessageCodecConfig<
  Message,
  Envelope
>): SharedProgramMessageCodec<Message, Envelope> => {
  const EnvelopeJson = S.fromJsonString(Envelope)
  const MessageJson = S.fromJsonString(Message)
  const decodeProposedRecord = (
    proposal: InstantMessageProposalRecordType,
    operation: 'AcceptEnvelope' | 'DecodeProposed',
  ): Effect.Effect<
    DecodedProposedProgramMessage<Message, Envelope>,
    SharedProgramCodecError
  > =>
    Effect.gen(function* () {
      const decoded = yield* Effect.try({
        try: () => ({
          envelope: S.decodeUnknownSync(EnvelopeJson)(proposal.envelopeJson),
          message: S.decodeUnknownSync(MessageJson)(proposal.payloadJson),
        }),
        catch: cause =>
          new SharedProgramCodecError({
            cause,
            operation,
          }),
      })
      yield* validateProposedEnvelope(decoded.envelope, proposal).pipe(
        Effect.mapError(
          cause =>
            new SharedProgramCodecError({
              cause,
              operation,
            }),
        ),
      )
      yield* Effect.try({
        try: () => {
          const metadata = eventMetadata(decoded.message)
          if (
            metadata.eventId !== proposal.eventId ||
            metadata.eventVersion !== proposal.eventVersion
          ) {
            throw new Error(
              'Proposed Message metadata does not match its proposal.',
            )
          }
        },
        catch: cause =>
          new SharedProgramCodecError({
            cause,
            operation,
          }),
      })
      return decoded
    })
  return {
    acceptEnvelope: (proposal, input) =>
      Effect.gen(function* () {
        const decoded = yield* decodeProposedRecord(proposal, 'AcceptEnvelope')
        return yield* Effect.try({
          try: () =>
            S.encodeSync(EnvelopeJson)(acceptEnvelope(decoded.envelope, input)),
          catch: cause =>
            new SharedProgramCodecError({
              cause,
              operation: 'AcceptEnvelope',
            }),
        })
      }),
    decodeAccepted: occurrence =>
      Effect.gen(function* () {
        const decoded = yield* Effect.try({
          try: () => ({
            envelope: S.decodeUnknownSync(EnvelopeJson)(
              occurrence.envelopeJson,
            ),
            message: S.decodeUnknownSync(MessageJson)(occurrence.payloadJson),
          }),
          catch: cause =>
            new SharedProgramCodecError({
              cause,
              operation: 'DecodeAccepted',
            }),
        })
        yield* validateAcceptedEnvelope(decoded.envelope, occurrence).pipe(
          Effect.mapError(
            cause =>
              new SharedProgramCodecError({
                cause,
                operation: 'DecodeAccepted',
              }),
          ),
        )
        yield* Effect.try({
          try: () => {
            const metadata = eventMetadata(decoded.message)
            if (
              metadata.eventId !== occurrence.eventId ||
              metadata.eventVersion !== occurrence.eventVersion
            ) {
              throw new Error(
                'Accepted Message metadata does not match its occurrence.',
              )
            }
          },
          catch: cause =>
            new SharedProgramCodecError({
              cause,
              operation: 'DecodeAccepted',
            }),
        })
        return decoded
      }),
    decodeProposed: proposal =>
      decodeProposedRecord(proposal, 'DecodeProposed'),
    encodeProposed: (message, input) =>
      Effect.try({
        try: () => {
          const metadata = eventMetadata(message)
          return {
            envelopeJson: S.encodeSync(EnvelopeJson)(
              makeProposedEnvelope(message, input),
            ),
            envelopeVersion,
            eventId: metadata.eventId,
            eventVersion: metadata.eventVersion,
            payloadJson: S.encodeSync(MessageJson)(message),
          }
        },
        catch: cause =>
          new SharedProgramCodecError({
            cause,
            operation: 'EncodeProposed',
          }),
      }),
  }
}

const pendingProposalOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (pending: PendingProgramProposal) => pending.proposal.actorSequence,
  ),
  Order.mapInput(
    Order.String,
    (pending: PendingProgramProposal) => pending.proposal.proposalId,
  ),
)

const pendingProposalsForProjection = (
  pendingProposals: ReadonlyArray<PendingProgramProposal>,
): ReadonlyArray<PendingProgramProposal> =>
  Array.dedupeWith(
    Array.sort(pendingProposals, pendingProposalOrder),
    (left, right) =>
      left.proposal.proposalId === right.proposal.proposalId ||
      (left.proposal.proposalKind === 'EffectResult' &&
        right.proposal.proposalKind === 'EffectResult' &&
        left.proposal.effectIdempotencyKey !== null &&
        left.proposal.effectIdempotencyKey ===
          right.proposal.effectIdempotencyKey) ||
      (left.proposal.proposalKind === 'Message' &&
        right.proposal.proposalKind === 'Message' &&
        left.proposal.messageIdempotencyKey !== null &&
        left.proposal.messageIdempotencyKey ===
          right.proposal.messageIdempotencyKey),
  )

const persistenceFromOutcome = (
  outcome: ProgramStoreTransactionOutcome,
): PendingProposalPersistence =>
  M.value(outcome).pipe(
    M.withReturnType<PendingProposalPersistence>(),
    M.tagsExhaustive({
      Enqueued: () => 'Enqueued',
      Synced: () => 'Synced',
    }),
  )

const updatePendingPersistence = <Model>(
  state: SharedProgramProcessorSnapshot<Model>,
  proposalId: string,
  persistence: PendingProposalPersistence,
): SharedProgramProcessorSnapshot<Model> => ({
  ...state,
  pendingProposals: Array.map(state.pendingProposals, pending =>
    pending.proposal.proposalId === proposalId
      ? PendingProgramProposal.make({
          persistence,
          proposal: pending.proposal,
        })
      : pending,
  ),
})

const removeAcceptedProposal = <Model>(
  state: SharedProgramProcessorSnapshot<Model>,
  occurrence: InstantAcceptedMessageOccurrenceRecord,
): SharedProgramProcessorSnapshot<Model> => ({
  ...state,
  pendingProposals: Array.filter(
    state.pendingProposals,
    pending =>
      pending.proposal.proposalId !== occurrence.proposalId &&
      (occurrence.effectIdempotencyKey === null ||
        pending.proposal.effectIdempotencyKey !==
          occurrence.effectIdempotencyKey) &&
      (occurrence.messageIdempotencyKey === null ||
        pending.proposal.messageIdempotencyKey !==
          occurrence.messageIdempotencyKey),
  ),
})

/** Creates an Effect-scoped bridge from a ProgramStore to one live ProgramRuntime. */
export const makeSharedProgramProcessor = <
  Model,
  Message,
  Envelope,
  ReplayError,
>({
  admissionSequencerProcessorId,
  actorId,
  clientId,
  codec,
  makeId,
  Model,
  nextActorSequence,
  now,
  originDeviceId,
  originatingProcessorId,
  programId,
  programVersion,
  protocolVersion,
  runtime,
  sessionId,
  store,
  subjectId,
  synchronization,
  synchronizationPolicy,
  throughAcceptedSequence = 0,
}: SharedProgramProcessorConfig<
  Model,
  Message,
  Envelope,
  ReplayError
>): Effect.Effect<
  SharedProgramProcessorService<Model, Message>,
  SharedProgramProcessorConstructionError,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const scope = yield* Effect.scope
    const cursor = yield* makeAcceptedOccurrenceCursor(
      sessionId,
      throughAcceptedSequence,
    )
    type ActiveTransportLifecycle = Readonly<{
      _tag: 'Active'
      generation: number
      initialized: Deferred.Deferred<void, SharedProgramProcessorError>
      observerFibers: ReadonlyArray<
        Fiber.Fiber<never, SharedProgramProcessorError>
      >
    }>
    type DisconnectingTransportLifecycle = Readonly<{
      _tag: 'Disconnecting'
      completed: Deferred.Deferred<void>
      connection: SharedProgramConnection
      generation: number
      initialized: Deferred.Deferred<void, SharedProgramProcessorError>
      observerFibers: ReadonlyArray<
        Fiber.Fiber<never, SharedProgramProcessorError>
      >
    }>
    type TransportLifecycle =
      | ActiveTransportLifecycle
      | DisconnectingTransportLifecycle
      | Readonly<{
          _tag: 'Disconnected'
          generation: number
        }>
    const transportLifecycleRef =
      yield* SynchronizedRef.make<TransportLifecycle>({
        _tag: 'Disconnected',
        generation: 0,
      })
    const transportCallbackSemaphore = yield* Semaphore.make(1)
    const projectionSemaphore = yield* Semaphore.make(1)
    const acceptedEffectIdempotencyKeys = yield* SynchronizedRef.make(
      HashSet.empty<string>(),
    )
    const acceptedMessageIdempotencyKeys = yield* SynchronizedRef.make(
      HashSet.empty<string>(),
    )
    const acceptedProposalIds = yield* SynchronizedRef.make(
      HashSet.empty<string>(),
    )
    const validatedAcceptedProposalIds = yield* SynchronizedRef.make(
      HashSet.empty<string>(),
    )
    const acceptedRoutingByOccurrenceId = yield* SynchronizedRef.make(
      HashMap.empty<string, ProposalRouting>(),
    )
    const rejectedProposalIds = yield* SynchronizedRef.make(
      HashSet.empty<string>(),
    )
    const observedProposalsRef = yield* SynchronizedRef.make<
      ReadonlyArray<InstantMessageProposalRecordType>
    >([])
    const observedProposalResolutionsRef = yield* SynchronizedRef.make<
      ReadonlyArray<InstantMessageProposalResolutionRecord>
    >([])
    const initialModel = S.decodeUnknownSync(Model)(runtime.readModel())
    const snapshotRef = yield* SubscriptionRef.make<
      SharedProgramProcessorSnapshot<Model>
    >({
      acceptedModel: initialModel,
      acceptedSequence: throughAcceptedSequence,
      connection: Detached.make({}),
      displayedModel: initialModel,
      pendingProposals: [],
      programId,
      programVersion,
      protocolVersion,
      replayMode: LiveReplay.make({}),
      sessionId,
      subjectId,
      synchronizationPolicy,
    })

    const classifyMessage = (
      message: Message,
    ): Effect.Effect<
      Synchronization.MessageCategory,
      SharedProgramMessageCategoryError
    > =>
      Effect.try({
        try: () =>
          S.decodeUnknownSync(Synchronization.MessageCategory)(
            synchronization.messageCategory(message),
          ),
        catch: cause => new SharedProgramMessageCategoryError({ cause }),
      })

    const routingForMessage = (
      message: Message,
      routingOriginatingProcessorId: string,
    ): Effect.Effect<
      ProposalRouting,
      | SharedProgramMessageCategoryError
      | typeof Synchronization.ReadOnlyFollowerRejected.Type
    > =>
      Effect.flatMap(classifyMessage(message), messageCategory => {
        const routingDecision = Synchronization.resolveAudience(
          synchronizationPolicy,
          messageCategory,
          routingOriginatingProcessorId,
        )
        if (routingDecision._tag === 'ReadOnlyFollowerRejected') {
          return Effect.fail(routingDecision)
        } else {
          return Effect.succeed({
            audience: routingDecision,
            messageCategory,
            policyGeneration: synchronizationPolicy.generation,
            sessionPolicy: synchronizationPolicy,
          })
        }
      })

    const validateAcceptedRoutingClaims = (
      occurrence: InstantAcceptedMessageOccurrenceRecord,
      routing: ProposalRouting,
    ): Effect.Effect<void, SharedProgramAcceptedRoutingMismatch> => {
      const fail = (
        reason: SharedProgramAcceptedRoutingMismatch['reason'],
      ): Effect.Effect<never, SharedProgramAcceptedRoutingMismatch> =>
        Effect.fail(
          new SharedProgramAcceptedRoutingMismatch({
            occurrenceId: occurrence.occurrenceId,
            reason,
          }),
        )
      if (occurrence.messageCategory !== routing.messageCategory) {
        return fail('MessageCategoryClaim')
      } else if (occurrence.policyGeneration !== routing.policyGeneration) {
        return fail('PolicyGenerationClaim')
      } else if (
        occurrence.policyGeneration !== occurrence.sessionPolicy.generation
      ) {
        return fail('PolicyGenerationClaim')
      } else if (
        encodeSessionPolicy(occurrence.sessionPolicy) !==
        encodeSessionPolicy(routing.sessionPolicy)
      ) {
        return fail('SessionPolicyClaim')
      } else if (!areAudiencesEqual(occurrence.audience, routing.audience)) {
        return fail('AudienceClaim')
      } else {
        return Effect.void
      }
    }

    const validateAcceptedRouting = (
      occurrence: InstantAcceptedMessageOccurrenceRecord,
      message: Message,
    ): Effect.Effect<
      void,
      SharedProgramAcceptedRoutingMismatch | SharedProgramMessageCategoryError
    > => {
      if (occurrence.proposalKind === 'EffectResult') {
        return SynchronizedRef.get(acceptedRoutingByOccurrenceId).pipe(
          Effect.flatMap(routingByOccurrenceId => {
            const maybeRouting = Option.flatMap(
              Option.fromNullishOr(occurrence.causationId),
              causationOccurrenceId =>
                HashMap.get(routingByOccurrenceId, causationOccurrenceId),
            )
            if (Option.isSome(maybeRouting)) {
              return validateAcceptedRoutingClaims(
                occurrence,
                maybeRouting.value,
              )
            } else {
              return Effect.fail(
                new SharedProgramAcceptedRoutingMismatch({
                  occurrenceId: occurrence.occurrenceId,
                  reason: 'CausalRoutingMissing',
                }),
              )
            }
          }),
        )
      } else {
        return Effect.flatMap(classifyMessage(message), messageCategory => {
          const routingDecision = Synchronization.resolveAudience(
            occurrence.sessionPolicy,
            messageCategory,
            occurrence.originatingProcessorId,
          )
          if (routingDecision._tag === 'ReadOnlyFollowerRejected') {
            return Effect.fail(
              new SharedProgramAcceptedRoutingMismatch({
                occurrenceId: occurrence.occurrenceId,
                reason: 'ReadOnlyFollower',
              }),
            )
          } else {
            return validateAcceptedRoutingClaims(occurrence, {
              audience: routingDecision,
              messageCategory,
              policyGeneration: occurrence.sessionPolicy.generation,
              sessionPolicy: occurrence.sessionPolicy,
            })
          }
        })
      }
    }

    const routingForEffectResult = (
      correlation: CorrelatedProposalInput,
    ): Effect.Effect<ProposalRouting, SharedProgramCausalRoutingMissing> =>
      SynchronizedRef.get(acceptedRoutingByOccurrenceId).pipe(
        Effect.flatMap(routingByOccurrenceId => {
          const maybeRouting = Option.flatMap(
            correlation.maybeCausationOccurrenceId,
            causationOccurrenceId =>
              HashMap.get(routingByOccurrenceId, causationOccurrenceId),
          )
          if (Option.isSome(maybeRouting)) {
            return Effect.succeed(maybeRouting.value)
          } else {
            return Effect.fail(
              new SharedProgramCausalRoutingMissing({
                causationOccurrenceId: Option.getOrNull(
                  correlation.maybeCausationOccurrenceId,
                ),
              }),
            )
          }
        }),
      )

    const isProposalRoutingValid = (
      proposal: InstantMessageProposalRecordType,
      message: Message,
    ): Effect.Effect<boolean> => {
      const canonicalRouting =
        proposal.proposalKind === 'EffectResult'
          ? SynchronizedRef.get(acceptedRoutingByOccurrenceId).pipe(
              Effect.map(routingByOccurrenceId =>
                Option.flatMap(
                  Option.fromNullishOr(proposal.causationOccurrenceId),
                  causationOccurrenceId =>
                    HashMap.get(routingByOccurrenceId, causationOccurrenceId),
                ),
              ),
            )
          : Effect.option(
              routingForMessage(message, proposal.originatingProcessorId),
            )
      return canonicalRouting.pipe(
        Effect.map(
          Option.exists(
            routing =>
              routing.messageCategory === proposal.messageCategory &&
              routing.policyGeneration === proposal.policyGeneration &&
              areAudiencesEqual(routing.audience, proposal.proposedAudience),
          ),
        ),
      )
    }

    const projectPendingModel = (
      acceptedModel: Model,
      pendingProposals: ReadonlyArray<PendingProgramProposal>,
    ): Effect.Effect<Model> =>
      Effect.forEach(
        pendingProposalsForProjection(pendingProposals),
        pending =>
          pending.proposal.originatingProcessorId === originatingProcessorId &&
          Synchronization.includesProcessor(
            pending.proposal.proposedAudience,
            originatingProcessorId,
          ) &&
          isInstantMessageProposalKindValid(pending.proposal)
            ? codec.decodeProposed(pending.proposal).pipe(
                Effect.flatMap(decoded =>
                  isProposalRoutingValid(
                    pending.proposal,
                    decoded.message,
                  ).pipe(
                    Effect.map(isValid =>
                      isValid
                        ? Option.some(decoded.message)
                        : Option.none<Message>(),
                    ),
                  ),
                ),
                Effect.catch(() => Effect.succeed(Option.none<Message>())),
              )
            : Effect.succeed(Option.none<Message>()),
        { concurrency: 1 },
      ).pipe(
        Effect.map(Array.getSomes),
        Effect.map(messages => runtime.project(acceptedModel, messages)),
      )

    const withLiveProjection = (
      snapshot: SharedProgramProcessorSnapshot<Model>,
    ): Effect.Effect<SharedProgramProcessorSnapshot<Model>> => {
      if (snapshot.replayMode._tag === 'Inspecting') {
        return Effect.succeed(snapshot)
      } else {
        return projectPendingModel(
          snapshot.acceptedModel,
          snapshot.pendingProposals,
        ).pipe(
          Effect.map(displayedModel => ({
            ...snapshot,
            displayedModel,
          })),
        )
      }
    }

    const updateProjectedSnapshot = (
      update: (
        snapshot: SharedProgramProcessorSnapshot<Model>,
      ) => SharedProgramProcessorSnapshot<Model>,
    ): Effect.Effect<void> =>
      projectionSemaphore.withPermit(
        SubscriptionRef.modifyEffect(snapshotRef, snapshot =>
          withLiveProjection(update(snapshot)).pipe(
            Effect.map(nextSnapshot => Tuple.make(undefined, nextSnapshot)),
          ),
        ),
      )

    const setConnection = (
      connection: SharedProgramConnection,
    ): Effect.Effect<void> =>
      SubscriptionRef.update(snapshotRef, snapshot => ({
        ...snapshot,
        connection,
      }))

    const setTransportStatus = (
      transportStatus: ProgramStoreConnectionStatusType,
    ): Effect.Effect<void> =>
      setConnection(
        Attached.make({
          transportStatus,
        }),
      )

    const decodeAcceptedOccurrence = (
      occurrence: InstantAcceptedMessageOccurrenceRecord,
    ): Effect.Effect<
      DecodedAcceptedProgramMessage<Message, Envelope>,
      SharedProgramProcessorError
    > => {
      const maybeValidationIssue =
        instantAcceptedMessageOccurrenceValidationIssue(occurrence)
      if (Option.isSome(maybeValidationIssue)) {
        return Effect.fail(
          new SharedProgramAcceptedOccurrenceInvalid({
            occurrenceId: occurrence.occurrenceId,
            reason: maybeValidationIssue.value,
          }),
        )
      }
      if (
        occurrence.programId !== programId ||
        occurrence.programVersion !== programVersion ||
        occurrence.protocolVersion !== protocolVersion ||
        occurrence.sessionId !== sessionId ||
        occurrence.subjectId !== subjectId
      ) {
        return Effect.fail(
          new SharedProgramScopeMismatch({
            occurrenceId: occurrence.occurrenceId,
          }),
        )
      }
      if (occurrence.acceptingProcessorId !== admissionSequencerProcessorId) {
        return Effect.fail(
          new SharedProgramAdmissionSequencerMismatch({
            actualProcessorId: occurrence.acceptingProcessorId,
            expectedProcessorId: admissionSequencerProcessorId,
            recordId: occurrence.occurrenceId,
            recordKind: 'AcceptedOccurrence',
          }),
        )
      }
      return codec
        .decodeAccepted(occurrence)
        .pipe(
          Effect.tap(decoded =>
            validateAcceptedRouting(occurrence, decoded.message),
          ),
        )
    }

    const modelAfterAcceptedOccurrence = (
      occurrence: InstantAcceptedMessageOccurrenceRecord,
    ): Effect.Effect<Model, SharedProgramProcessorError> =>
      Effect.flatMap(decodeAcceptedOccurrence(occurrence), decoded =>
        Synchronization.includesProcessor(
          occurrence.audience,
          originatingProcessorId,
        )
          ? runtime.run(decoded.message, {
              envelope: decoded.envelope,
            })
          : SubscriptionRef.get(snapshotRef).pipe(
              Effect.map(snapshot => snapshot.acceptedModel),
            ),
      )

    const rememberAcceptedOccurrenceRouting = (
      occurrence: InstantAcceptedMessageOccurrenceRecord,
    ): Effect.Effect<void> =>
      SynchronizedRef.update(
        acceptedRoutingByOccurrenceId,
        routingByOccurrenceId =>
          HashMap.set(
            routingByOccurrenceId,
            occurrence.occurrenceId,
            routingFromOccurrence(occurrence),
          ),
      )

    const commitAcceptedOccurrence = (
      occurrence: InstantAcceptedMessageOccurrenceRecord,
      acceptedModel: Model,
    ): Effect.Effect<void, AcceptedOccurrenceCursorError> =>
      projectionSemaphore.withPermit(
        Effect.gen(function* () {
          yield* cursor.commit(occurrence)
          yield* SynchronizedRef.update(acceptedProposalIds, proposalIds =>
            HashSet.add(proposalIds, occurrence.proposalId),
          )
          yield* rememberAcceptedOccurrenceRouting(occurrence)
          if (
            occurrence.proposalKind === 'EffectResult' &&
            occurrence.effectIdempotencyKey !== null
          ) {
            const effectIdempotencyKey = occurrence.effectIdempotencyKey
            yield* SynchronizedRef.update(
              acceptedEffectIdempotencyKeys,
              acceptedKeys => HashSet.add(acceptedKeys, effectIdempotencyKey),
            )
          }
          if (
            occurrence.proposalKind === 'Message' &&
            occurrence.messageIdempotencyKey !== null
          ) {
            const messageIdempotencyKey = occurrence.messageIdempotencyKey
            yield* SynchronizedRef.update(
              acceptedMessageIdempotencyKeys,
              acceptedKeys => HashSet.add(acceptedKeys, messageIdempotencyKey),
            )
          }
          yield* SubscriptionRef.modifyEffect(snapshotRef, snapshot => {
            const nextSnapshot = removeAcceptedProposal(snapshot, occurrence)
            return withLiveProjection({
              ...nextSnapshot,
              acceptedModel,
              acceptedSequence: occurrence.acceptedSequence,
            }).pipe(
              Effect.map(projectedSnapshot =>
                Tuple.make(undefined, projectedSnapshot),
              ),
            )
          })
        }),
      )

    const drainStagedOccurrences: Effect.Effect<
      void,
      SharedProgramProcessorError
    > = Effect.suspend(() =>
      cursor.next.pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.void,
            onSome: occurrence =>
              Effect.uninterruptibleMask(restore =>
                restore(modelAfterAcceptedOccurrence(occurrence)).pipe(
                  Effect.flatMap(acceptedModel =>
                    commitAcceptedOccurrence(occurrence, acceptedModel),
                  ),
                ),
              ).pipe(Effect.andThen(drainStagedOccurrences)),
          }),
        ),
      ),
    )

    const recoverCheckpointedAcceptedIdentities = (
      occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
    ): Effect.Effect<void, SharedProgramProcessorError> =>
      projectionSemaphore.withPermit(
        Effect.forEach(
          Array.filter(
            occurrences,
            occurrence =>
              occurrence.acceptedSequence <= throughAcceptedSequence,
          ),
          occurrence =>
            Effect.gen(function* () {
              yield* decodeAcceptedOccurrence(occurrence)
              yield* SynchronizedRef.update(acceptedProposalIds, proposalIds =>
                HashSet.add(proposalIds, occurrence.proposalId),
              )
              yield* rememberAcceptedOccurrenceRouting(occurrence)
              if (
                occurrence.proposalKind === 'EffectResult' &&
                occurrence.effectIdempotencyKey !== null
              ) {
                const effectIdempotencyKey = occurrence.effectIdempotencyKey
                yield* SynchronizedRef.update(
                  acceptedEffectIdempotencyKeys,
                  acceptedKeys =>
                    HashSet.add(acceptedKeys, effectIdempotencyKey),
                )
              }
              if (
                occurrence.proposalKind === 'Message' &&
                occurrence.messageIdempotencyKey !== null
              ) {
                const messageIdempotencyKey = occurrence.messageIdempotencyKey
                yield* SynchronizedRef.update(
                  acceptedMessageIdempotencyKeys,
                  acceptedKeys =>
                    HashSet.add(acceptedKeys, messageIdempotencyKey),
                )
              }
            }),
          { concurrency: 1, discard: true },
        ),
      )

    const ingestSnapshot = (
      occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
    ): Effect.Effect<void, SharedProgramProcessorError> =>
      Effect.gen(function* () {
        const rejectedIds = yield* SynchronizedRef.get(rejectedProposalIds)
        yield* Effect.forEach(
          occurrences,
          occurrence =>
            HashSet.has(rejectedIds, occurrence.proposalId)
              ? Effect.fail(
                  new SharedProgramProposalResolutionMismatch({
                    proposalId: occurrence.proposalId,
                    reason: 'AcceptedAndRejected',
                  }),
                )
              : Effect.void,
          { concurrency: 1, discard: true },
        )
        yield* Effect.forEach(occurrences, validateAcceptedOccurrenceRecord, {
          concurrency: 1,
          discard: true,
        })
        yield* validateAcceptedPolicyHistory(occurrences, synchronizationPolicy)
        yield* validateAcceptedEffectResultIdentities(occurrences)
        yield* validateAcceptedMessageIdentities(occurrences)
        const committedMessageKeys = yield* SynchronizedRef.get(
          acceptedMessageIdempotencyKeys,
        )
        const committedProposalIds =
          yield* SynchronizedRef.get(acceptedProposalIds)
        yield* Effect.forEach(
          occurrences,
          occurrence =>
            occurrence.messageIdempotencyKey !== null &&
            HashSet.has(
              committedMessageKeys,
              occurrence.messageIdempotencyKey,
            ) &&
            !HashSet.has(committedProposalIds, occurrence.proposalId)
              ? Effect.fail(
                  new SharedProgramAcceptedMessageDuplicate({
                    messageIdempotencyKey: occurrence.messageIdempotencyKey,
                    occurrenceId: occurrence.occurrenceId,
                  }),
                )
              : Effect.void,
          { concurrency: 1, discard: true },
        )
        yield* recoverCheckpointedAcceptedIdentities(occurrences)
        yield* cursor.stage(occurrences)
        yield* drainStagedOccurrences
        yield* SynchronizedRef.update(
          validatedAcceptedProposalIds,
          proposalIds =>
            Array.reduce(
              occurrences,
              proposalIds,
              (nextProposalIds, occurrence) =>
                HashSet.add(nextProposalIds, occurrence.proposalId),
            ),
        )
      })

    const recoverClientProposals = (
      proposals: ReadonlyArray<InstantMessageProposalRecordType>,
    ): Effect.Effect<void> =>
      projectionSemaphore.withPermit(
        Effect.gen(function* () {
          const acceptedIds = yield* SynchronizedRef.get(acceptedProposalIds)
          const acceptedEffectKeys = yield* SynchronizedRef.get(
            acceptedEffectIdempotencyKeys,
          )
          const acceptedMessageKeys = yield* SynchronizedRef.get(
            acceptedMessageIdempotencyKeys,
          )
          const rejectedIds = yield* SynchronizedRef.get(rejectedProposalIds)
          const recoverable = Array.filter(
            proposals,
            proposal =>
              proposal.clientId === clientId &&
              proposal.originatingProcessorId === originatingProcessorId &&
              proposal.programId === programId &&
              proposal.programVersion === programVersion &&
              proposal.protocolVersion === protocolVersion &&
              proposal.sessionId === sessionId &&
              proposal.subjectId === subjectId &&
              !HashSet.has(acceptedIds, proposal.proposalId) &&
              !HashSet.has(rejectedIds, proposal.proposalId) &&
              (proposal.proposalKind !== 'EffectResult' ||
                proposal.effectIdempotencyKey === null ||
                !HashSet.has(
                  acceptedEffectKeys,
                  proposal.effectIdempotencyKey,
                )) &&
              (proposal.proposalKind !== 'Message' ||
                proposal.messageIdempotencyKey === null ||
                !HashSet.has(
                  acceptedMessageKeys,
                  proposal.messageIdempotencyKey,
                )),
          )
          const observedProposalIds = HashSet.fromIterable(
            Array.map(recoverable, proposal => proposal.proposalId),
          )
          yield* SubscriptionRef.modifyEffect(snapshotRef, snapshot => {
            const retainedProposals = Array.map(
              Array.filter(
                snapshot.pendingProposals,
                pending =>
                  !HashSet.has(
                    observedProposalIds,
                    pending.proposal.proposalId,
                  ) &&
                  !HashSet.has(acceptedIds, pending.proposal.proposalId) &&
                  !HashSet.has(rejectedIds, pending.proposal.proposalId) &&
                  (pending.proposal.messageIdempotencyKey === null ||
                    !HashSet.has(
                      acceptedMessageKeys,
                      pending.proposal.messageIdempotencyKey,
                    )),
              ),
              pending =>
                PendingProgramProposal.make({
                  persistence: 'Local',
                  proposal: pending.proposal,
                }),
            )
            const observedProposals = Array.map(recoverable, proposal => {
              const maybeExisting = Array.findFirst(
                snapshot.pendingProposals,
                pending => pending.proposal.proposalId === proposal.proposalId,
              )
              return PendingProgramProposal.make({
                persistence: Option.match(maybeExisting, {
                  onNone: () => 'Enqueued',
                  onSome: pending => pending.persistence,
                }),
                proposal,
              })
            })
            return withLiveProjection({
              ...snapshot,
              pendingProposals: Array.sort(
                [...retainedProposals, ...observedProposals],
                pendingProposalOrder,
              ),
            }).pipe(
              Effect.map(nextSnapshot => Tuple.make(undefined, nextSnapshot)),
            )
          })
        }),
      )

    const validateProposalResolutions = (
      proposals: ReadonlyArray<InstantMessageProposalRecordType>,
      resolutions: ReadonlyArray<InstantMessageProposalResolutionRecord>,
    ): Effect.Effect<
      ReadonlyArray<InstantMessageProposalResolutionRecord>,
      | SharedProgramProposalResolutionMismatch
      | SharedProgramProposalResolutionScopeMismatch
    > =>
      Effect.gen(function* () {
        const initialResolutionProposalIds: Effect.Effect<
          HashSet.HashSet<string>,
          SharedProgramProposalResolutionMismatch
        > = Effect.succeed(HashSet.empty())
        yield* Array.reduce(
          resolutions,
          initialResolutionProposalIds,
          (proposalIdsEffect, resolution) =>
            Effect.flatMap(proposalIdsEffect, proposalIds => {
              if (HashSet.has(proposalIds, resolution.proposalId)) {
                return Effect.fail(
                  new SharedProgramProposalResolutionMismatch({
                    proposalId: resolution.proposalId,
                    reason: 'DuplicateResolution',
                  }),
                )
              } else {
                return Effect.succeed(
                  HashSet.add(proposalIds, resolution.proposalId),
                )
              }
            }),
        )
        const acceptedIds = yield* SynchronizedRef.get(acceptedProposalIds)
        const validatedAcceptedIds = yield* SynchronizedRef.get(
          validatedAcceptedProposalIds,
        )
        const validateResolution = (
          resolution: InstantMessageProposalResolutionRecord,
        ): Effect.Effect<
          Option.Option<InstantMessageProposalResolutionRecord>,
          | SharedProgramProposalResolutionMismatch
          | SharedProgramProposalResolutionScopeMismatch
        > => {
          if (
            resolution.programId !== programId ||
            resolution.programVersion !== programVersion ||
            resolution.protocolVersion !== protocolVersion ||
            resolution.sessionId !== sessionId ||
            resolution.subjectId !== subjectId
          ) {
            return Effect.fail(
              new SharedProgramProposalResolutionScopeMismatch({
                resolutionId: resolution.id,
              }),
            )
          }
          if (
            HashSet.has(acceptedIds, resolution.proposalId) ||
            HashSet.has(validatedAcceptedIds, resolution.proposalId)
          ) {
            return Effect.fail(
              new SharedProgramProposalResolutionMismatch({
                proposalId: resolution.proposalId,
                reason: 'AcceptedAndRejected',
              }),
            )
          }
          if (resolution.id !== resolution.proposalId) {
            return Effect.fail(
              new SharedProgramProposalResolutionMismatch({
                proposalId: resolution.proposalId,
                reason: 'ProposalIdentity',
              }),
            )
          }
          const matchingProposals = Array.filter(
            proposals,
            proposal => proposal.proposalId === resolution.proposalId,
          )
          const maybeProposal = Array.head(matchingProposals)
          if (Option.isNone(maybeProposal)) {
            return Effect.succeed(Option.none())
          }
          if (Option.isSome(Array.get(matchingProposals, 1))) {
            return Effect.fail(
              new SharedProgramProposalResolutionMismatch({
                proposalId: resolution.proposalId,
                reason: 'DuplicateProposal',
              }),
            )
          }
          const proposal = maybeProposal.value
          if (
            proposal.programId !== programId ||
            proposal.programVersion !== programVersion ||
            proposal.protocolVersion !== protocolVersion ||
            proposal.sessionId !== sessionId ||
            proposal.subjectId !== subjectId
          ) {
            return Effect.fail(
              new SharedProgramProposalResolutionMismatch({
                proposalId: resolution.proposalId,
                reason: 'ProposalScope',
              }),
            )
          }
          if (proposal.id !== proposal.proposalId) {
            return Effect.fail(
              new SharedProgramProposalResolutionMismatch({
                proposalId: resolution.proposalId,
                reason: 'ProposalIdentity',
              }),
            )
          }
          if (resolution.actorId !== proposal.actorId) {
            return Effect.fail(
              new SharedProgramProposalResolutionMismatch({
                proposalId: resolution.proposalId,
                reason: 'ActorId',
              }),
            )
          }
          if (resolution.clientId !== proposal.clientId) {
            return Effect.fail(
              new SharedProgramProposalResolutionMismatch({
                proposalId: resolution.proposalId,
                reason: 'ClientId',
              }),
            )
          }
          if (resolution.actorSequence !== proposal.actorSequence) {
            return Effect.fail(
              new SharedProgramProposalResolutionMismatch({
                proposalId: resolution.proposalId,
                reason: 'ActorSequence',
              }),
            )
          }
          return Effect.succeed(Option.some(resolution))
        }
        const maybeValidatedResolutions = yield* Effect.forEach(
          resolutions,
          validateResolution,
          {
            concurrency: 1,
          },
        )
        return Array.getSomes(maybeValidatedResolutions)
      })

    const reconcileObservedProposalResolutions: Effect.Effect<
      void,
      | SharedProgramAdmissionSequencerMismatch
      | SharedProgramProposalResolutionMismatch
      | SharedProgramProposalResolutionScopeMismatch
    > = projectionSemaphore.withPermit(
      Effect.gen(function* () {
        const observedProposals =
          yield* SynchronizedRef.get(observedProposalsRef)
        const observedResolutions = yield* SynchronizedRef.get(
          observedProposalResolutionsRef,
        )
        const validatedResolutions = yield* validateProposalResolutions(
          observedProposals,
          observedResolutions,
        )
        yield* Effect.forEach(
          observedResolutions,
          resolution =>
            resolution.rejectingProcessorId === admissionSequencerProcessorId
              ? Effect.void
              : Effect.fail(
                  new SharedProgramAdmissionSequencerMismatch({
                    actualProcessorId: resolution.rejectingProcessorId,
                    expectedProcessorId: admissionSequencerProcessorId,
                    recordId: resolution.id,
                    recordKind: 'ProposalResolution',
                  }),
                ),
          { discard: true },
        )
        const nextRejectedIds = yield* SynchronizedRef.updateAndGet(
          rejectedProposalIds,
          rejectedIds =>
            Array.reduce(
              validatedResolutions,
              rejectedIds,
              (proposalIds, resolution) =>
                HashSet.add(proposalIds, resolution.proposalId),
            ),
        )
        yield* SubscriptionRef.modifyEffect(snapshotRef, snapshot =>
          withLiveProjection({
            ...snapshot,
            pendingProposals: Array.filter(
              snapshot.pendingProposals,
              pending =>
                !HashSet.has(nextRejectedIds, pending.proposal.proposalId),
            ),
          }).pipe(
            Effect.map(nextSnapshot => Tuple.make(undefined, nextSnapshot)),
          ),
        )
      }),
    )

    const recoverProposalResolutions = (
      resolutions: ReadonlyArray<InstantMessageProposalResolutionRecord>,
    ): Effect.Effect<
      void,
      | SharedProgramAdmissionSequencerMismatch
      | SharedProgramProposalResolutionMismatch
      | SharedProgramProposalResolutionScopeMismatch
    > =>
      SynchronizedRef.set(observedProposalResolutionsRef, resolutions).pipe(
        Effect.andThen(reconcileObservedProposalResolutions),
      )

    const whenTransportActive = <Error, Requirements>(
      generation: number,
      effect: Effect.Effect<void, Error, Requirements>,
    ): Effect.Effect<boolean, Error, Requirements> =>
      transportCallbackSemaphore.withPermit(
        Effect.gen(function* () {
          const lifecycle = yield* SynchronizedRef.get(transportLifecycleRef)
          if (
            lifecycle._tag === 'Active' &&
            lifecycle.generation === generation
          ) {
            yield* effect
            return true
          } else {
            return false
          }
        }),
      )

    const setTransportErrored = setConnection(
      Attached.make({
        transportStatus: 'errored',
      }),
    )

    const persistPending = (
      pending: PendingProgramProposal,
    ): Effect.Effect<boolean> =>
      store.appendMessageProposal(pending.proposal).pipe(
        Effect.matchEffect({
          onFailure: () => Effect.succeed(false),
          onSuccess: outcome =>
            SubscriptionRef.update(snapshotRef, snapshot =>
              updatePendingPersistence(
                snapshot,
                pending.proposal.proposalId,
                persistenceFromOutcome(outcome),
              ),
            ).pipe(Effect.as(true)),
        }),
      )

    const flushPending = (generation: number): Effect.Effect<void> =>
      SubscriptionRef.get(snapshotRef).pipe(
        Effect.flatMap(snapshot =>
          Effect.forEach(
            Array.filter(
              snapshot.pendingProposals,
              pending => pending.persistence === 'Local',
            ),
            pending =>
              persistPending(pending).pipe(
                Effect.flatMap(didPersist =>
                  didPersist
                    ? Effect.void
                    : Effect.gen(function* () {
                        const lifecycle = yield* SynchronizedRef.get(
                          transportLifecycleRef,
                        )
                        if (
                          lifecycle._tag === 'Active' &&
                          lifecycle.generation === generation
                        ) {
                          yield* setTransportErrored
                        }
                      }),
                ),
              ),
            {
              concurrency: 1,
              discard: true,
            },
          ),
        ),
      )

    type TransportTeardownPlan =
      | Readonly<{
          _tag: 'AlreadyDisconnected'
        }>
      | Readonly<{
          _tag: 'AwaitingTeardown'
          completed: Deferred.Deferred<void>
          initialized: Deferred.Deferred<void, SharedProgramProcessorError>
        }>
      | Readonly<{
          _tag: 'StartedTeardown'
          completed: Deferred.Deferred<void>
          lifecycle: ActiveTransportLifecycle
        }>

    const transportTeardownResult = (
      plan: TransportTeardownPlan,
      lifecycle: TransportLifecycle,
    ): readonly [TransportTeardownPlan, TransportLifecycle] =>
      Tuple.make(plan, lifecycle)

    const disconnectedTransportLifecycle = (
      generation: number,
    ): TransportLifecycle => ({
      _tag: 'Disconnected',
      generation,
    })

    const runTransportTeardown = (
      lifecycle: ActiveTransportLifecycle,
      completed: Deferred.Deferred<void>,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        yield* transportCallbackSemaphore.withPermit(
          Effect.gen(function* () {
            yield* Effect.forEach(
              lifecycle.observerFibers,
              fiber => Effect.forkIn(Fiber.interrupt(fiber), scope),
              { discard: true },
            )
            yield* SynchronizedRef.modifyEffect(
              transportLifecycleRef,
              currentLifecycle => {
                if (
                  currentLifecycle._tag === 'Disconnecting' &&
                  currentLifecycle.generation === lifecycle.generation &&
                  currentLifecycle.completed === completed
                ) {
                  return Effect.gen(function* () {
                    yield* setConnection(currentLifecycle.connection)
                    yield* Deferred.succeed(completed, undefined)
                    return Tuple.make(
                      undefined,
                      disconnectedTransportLifecycle(lifecycle.generation),
                    )
                  })
                } else {
                  return Effect.succeed(Tuple.make(undefined, currentLifecycle))
                }
              },
            )
          }),
        )
      })

    const initiateTransportTeardown = (
      maybeExpectedGeneration: Option.Option<number>,
      connection: SharedProgramConnection,
    ): Effect.Effect<Option.Option<Deferred.Deferred<void>>> =>
      Effect.uninterruptible(
        SynchronizedRef.modifyEffect(
          transportLifecycleRef,
          currentLifecycle => {
            if (currentLifecycle._tag === 'Active') {
              if (
                Option.isSome(maybeExpectedGeneration) &&
                maybeExpectedGeneration.value !== currentLifecycle.generation
              ) {
                return Effect.succeed(
                  transportTeardownResult(
                    { _tag: 'AlreadyDisconnected' },
                    currentLifecycle,
                  ),
                )
              }
              return Effect.gen(function* () {
                const completed = yield* Deferred.make<void>()
                yield* setConnection(connection)
                return transportTeardownResult(
                  {
                    _tag: 'StartedTeardown',
                    completed,
                    lifecycle: currentLifecycle,
                  },
                  {
                    _tag: 'Disconnecting',
                    completed,
                    connection,
                    generation: currentLifecycle.generation,
                    initialized: currentLifecycle.initialized,
                    observerFibers: currentLifecycle.observerFibers,
                  },
                )
              })
            } else if (currentLifecycle._tag === 'Disconnecting') {
              const isExplicitDisconnect = Option.isNone(
                maybeExpectedGeneration,
              )
              if (isExplicitDisconnect) {
                return setConnection(connection).pipe(
                  Effect.as(
                    transportTeardownResult(
                      {
                        _tag: 'AwaitingTeardown',
                        completed: currentLifecycle.completed,
                        initialized: currentLifecycle.initialized,
                      },
                      {
                        ...currentLifecycle,
                        connection,
                      },
                    ),
                  ),
                )
              } else {
                return Effect.succeed(
                  transportTeardownResult(
                    {
                      _tag: 'AwaitingTeardown',
                      completed: currentLifecycle.completed,
                      initialized: currentLifecycle.initialized,
                    },
                    currentLifecycle,
                  ),
                )
              }
            } else if (Option.isNone(maybeExpectedGeneration)) {
              return setConnection(connection).pipe(
                Effect.as(
                  transportTeardownResult(
                    { _tag: 'AlreadyDisconnected' },
                    currentLifecycle,
                  ),
                ),
              )
            } else {
              return Effect.succeed(
                transportTeardownResult(
                  { _tag: 'AlreadyDisconnected' },
                  currentLifecycle,
                ),
              )
            }
          },
        ).pipe(
          Effect.flatMap(plan => {
            if (plan._tag === 'StartedTeardown') {
              return Effect.gen(function* () {
                const teardownFiber = yield* Effect.forkIn(
                  runTransportTeardown(plan.lifecycle, plan.completed),
                  scope,
                )
                yield* Effect.sync(() => {
                  teardownFiber.addObserver(exit => {
                    Deferred.doneUnsafe(plan.completed, exit)
                  })
                })
                if (Option.isNone(maybeExpectedGeneration)) {
                  yield* Deferred.interrupt(plan.lifecycle.initialized)
                }
                return Option.some(plan.completed)
              })
            } else if (plan._tag === 'AwaitingTeardown') {
              return Effect.gen(function* () {
                if (Option.isNone(maybeExpectedGeneration)) {
                  yield* Deferred.interrupt(plan.initialized)
                }
                return Option.some(plan.completed)
              })
            } else {
              return Effect.succeed(Option.none())
            }
          }),
        ),
      )

    const connect: Effect.Effect<void, SharedProgramProcessorError> =
      Effect.suspend(() =>
        Effect.uninterruptible(
          SynchronizedRef.modifyEffect(
            transportLifecycleRef,
            currentLifecycle => {
              if (currentLifecycle._tag === 'Active') {
                return Effect.succeed(
                  Tuple.make(
                    Deferred.await(currentLifecycle.initialized),
                    currentLifecycle,
                  ),
                )
              } else if (currentLifecycle._tag === 'Disconnecting') {
                return Effect.succeed(
                  Tuple.make(
                    Deferred.await(currentLifecycle.completed).pipe(
                      Effect.andThen(connect),
                    ),
                    currentLifecycle,
                  ),
                )
              }
              return Effect.gen(function* () {
                const generation = currentLifecycle.generation + 1
                yield* SynchronizedRef.set(observedProposalsRef, [])
                yield* SynchronizedRef.set(observedProposalResolutionsRef, [])
                const initialized = yield* Deferred.make<
                  void,
                  SharedProgramProcessorError
                >()
                yield* setConnection(
                  Attached.make({
                    transportStatus: 'unknown',
                  }),
                )
                const acceptedInitialized = yield* Deferred.make<
                  void,
                  SharedProgramProcessorError
                >()
                const connectionInitialized = yield* Deferred.make<void>()
                const proposalsInitialized = yield* Deferred.make<
                  void,
                  SharedProgramProcessorError
                >()
                const proposalsObserved = yield* Deferred.make<void>()
                const resolutionsInitialized = yield* Deferred.make<
                  void,
                  SharedProgramProcessorError
                >()
                const transportExited = yield* Deferred.make<
                  never,
                  SharedProgramProcessorError
                >()
                const isFirstAcceptedSnapshot =
                  yield* SynchronizedRef.make(true)
                const isFirstProposalSnapshot =
                  yield* SynchronizedRef.make(true)
                const isFirstResolutionSnapshot =
                  yield* SynchronizedRef.make(true)
                const observeAccepted = Stream.runForEach(
                  store.observeAcceptedMessageOccurrences({
                    sessionId,
                    subjectId,
                  }),
                  occurrences =>
                    whenTransportActive(
                      generation,
                      Effect.gen(function* () {
                        yield* ingestSnapshot(occurrences)
                        yield* reconcileObservedProposalResolutions
                        const isFirst = yield* SynchronizedRef.getAndSet(
                          isFirstAcceptedSnapshot,
                          false,
                        )
                        if (isFirst) {
                          yield* Deferred.succeed(
                            acceptedInitialized,
                            undefined,
                          )
                        }
                      }),
                    ).pipe(Effect.asVoid),
                ).pipe(
                  Effect.andThen(Effect.never),
                  Effect.onExit(exit =>
                    Effect.gen(function* () {
                      yield* Deferred.done(transportExited, exit)
                      if (Exit.isFailure(exit)) {
                        yield* Deferred.done(acceptedInitialized, exit)
                      }
                    }),
                  ),
                )
                const observeConnection = Stream.runForEach(
                  store.observeConnectionStatus,
                  transportStatus =>
                    whenTransportActive(
                      generation,
                      Effect.gen(function* () {
                        yield* setTransportStatus(transportStatus)
                        if (transportStatus === 'authenticated') {
                          yield* flushPending(generation)
                        }
                        yield* Deferred.succeed(
                          connectionInitialized,
                          undefined,
                        )
                      }),
                    ).pipe(Effect.asVoid),
                ).pipe(
                  Effect.andThen(Effect.never),
                  Effect.onExit(exit =>
                    Effect.gen(function* () {
                      yield* Deferred.done(transportExited, exit)
                      if (Exit.isFailure(exit)) {
                        yield* Deferred.interrupt(connectionInitialized)
                      }
                    }),
                  ),
                )
                const observeProposals = Stream.runForEach(
                  store.observeMessageProposals({
                    sessionId,
                    subjectId,
                  }),
                  proposals =>
                    Effect.gen(function* () {
                      yield* SynchronizedRef.set(
                        observedProposalsRef,
                        proposals,
                      )
                      yield* Deferred.succeed(proposalsObserved, undefined)
                      const isFirst = yield* SynchronizedRef.getAndSet(
                        isFirstProposalSnapshot,
                        false,
                      )
                      if (isFirst) {
                        yield* Effect.all(
                          [
                            Deferred.await(acceptedInitialized),
                            Deferred.await(resolutionsInitialized),
                          ],
                          { concurrency: 'unbounded', discard: true },
                        )
                      }
                      yield* whenTransportActive(
                        generation,
                        Effect.gen(function* () {
                          yield* reconcileObservedProposalResolutions
                          yield* recoverClientProposals(proposals)
                          if (isFirst) {
                            yield* Deferred.succeed(
                              proposalsInitialized,
                              undefined,
                            )
                          }
                        }),
                      )
                    }).pipe(Effect.asVoid),
                ).pipe(
                  Effect.andThen(Effect.never),
                  Effect.onExit(exit =>
                    Effect.gen(function* () {
                      yield* Deferred.done(transportExited, exit)
                      if (Exit.isFailure(exit)) {
                        yield* Deferred.done(proposalsInitialized, exit)
                      }
                    }),
                  ),
                )
                const observeResolutions = Stream.runForEach(
                  store.observeMessageProposalResolutions({
                    sessionId,
                    subjectId,
                  }),
                  resolutions =>
                    whenTransportActive(
                      generation,
                      Effect.gen(function* () {
                        yield* Deferred.await(proposalsObserved)
                        yield* recoverProposalResolutions(resolutions)
                        const isFirst = yield* SynchronizedRef.getAndSet(
                          isFirstResolutionSnapshot,
                          false,
                        )
                        if (isFirst) {
                          yield* Deferred.succeed(
                            resolutionsInitialized,
                            undefined,
                          )
                        }
                      }),
                    ).pipe(Effect.asVoid),
                ).pipe(
                  Effect.andThen(Effect.never),
                  Effect.onExit(exit =>
                    Effect.gen(function* () {
                      yield* Deferred.done(transportExited, exit)
                      if (Exit.isFailure(exit)) {
                        yield* Deferred.done(resolutionsInitialized, exit)
                      }
                    }),
                  ),
                )
                const observerFibers = yield* Effect.forEach(
                  [
                    observeAccepted,
                    observeConnection,
                    observeProposals,
                    observeResolutions,
                  ],
                  observer => Effect.forkIn(observer, scope),
                )
                const lifecycle: ActiveTransportLifecycle = {
                  _tag: 'Active',
                  generation,
                  initialized,
                  observerFibers,
                }
                const initialize = Effect.all(
                  [
                    Deferred.await(acceptedInitialized),
                    Deferred.await(connectionInitialized),
                    Deferred.await(proposalsInitialized),
                    Deferred.await(resolutionsInitialized),
                  ],
                  {
                    concurrency: 'unbounded',
                    discard: true,
                  },
                ).pipe(
                  Effect.andThen(
                    Effect.gen(function* () {
                      const isActive = yield* whenTransportActive(
                        generation,
                        flushPending(generation),
                      )
                      if (!isActive) {
                        return yield* Effect.interrupt
                      }
                    }),
                  ),
                )
                const supervise = Effect.gen(function* () {
                  const initializationExit = yield* Effect.exit(initialize)
                  if (Exit.isFailure(initializationExit)) {
                    const maybeCompleted = yield* initiateTransportTeardown(
                      Option.some(generation),
                      Attached.make({
                        transportStatus: 'errored',
                      }),
                    )
                    if (Option.isSome(maybeCompleted)) {
                      yield* Deferred.await(maybeCompleted.value)
                    }
                    yield* Deferred.done(initialized, initializationExit)
                  } else {
                    yield* Deferred.done(initialized, initializationExit)
                    yield* Effect.exit(Deferred.await(transportExited))
                    yield* initiateTransportTeardown(
                      Option.some(generation),
                      Attached.make({
                        transportStatus: 'errored',
                      }),
                    )
                  }
                })
                yield* Effect.uninterruptible(
                  Effect.flatMap(Effect.forkIn(supervise, scope), fiber =>
                    Effect.sync(() => {
                      fiber.addObserver(exit => {
                        Deferred.doneUnsafe(initialized, exit)
                      })
                    }),
                  ),
                )
                return Tuple.make(Deferred.await(initialized), lifecycle)
              })
            },
          ),
        ).pipe(Effect.flatten),
      )

    const disconnect: Effect.Effect<void> = initiateTransportTeardown(
      Option.none(),
      Detached.make({}),
    ).pipe(
      Effect.flatMap(maybeCompleted => {
        if (Option.isSome(maybeCompleted)) {
          return Deferred.await(maybeCompleted.value)
        } else {
          return Effect.void
        }
      }),
    )

    const appendPending = (
      proposal: InstantMessageProposalRecordType,
    ): Effect.Effect<boolean> =>
      projectionSemaphore.withPermit(
        Effect.gen(function* () {
          const acceptedKeys = yield* SynchronizedRef.get(
            acceptedEffectIdempotencyKeys,
          )
          const acceptedMessageKeys = yield* SynchronizedRef.get(
            acceptedMessageIdempotencyKeys,
          )
          if (
            proposal.proposalKind === 'EffectResult' &&
            proposal.effectIdempotencyKey !== null &&
            HashSet.has(acceptedKeys, proposal.effectIdempotencyKey)
          ) {
            return false
          }
          if (
            proposal.proposalKind === 'Message' &&
            proposal.messageIdempotencyKey !== null &&
            HashSet.has(acceptedMessageKeys, proposal.messageIdempotencyKey)
          ) {
            return false
          }
          yield* SubscriptionRef.modifyEffect(snapshotRef, snapshot =>
            withLiveProjection({
              ...snapshot,
              pendingProposals: Array.sort(
                [
                  ...snapshot.pendingProposals,
                  PendingProgramProposal.make({
                    persistence: 'Local',
                    proposal,
                  }),
                ],
                pendingProposalOrder,
              ),
            }).pipe(
              Effect.map(nextSnapshot => Tuple.make(undefined, nextSnapshot)),
            ),
          )
          return true
        }),
      )

    const proposeWithKind = (
      message: Message,
      correlation: CorrelatedProposalInput,
      maybeMessageIdempotencyKey: Option.Option<InstantMessageIdempotencyKeyType>,
      effectResult: Option.Option<EffectResultProposalInput>,
    ): Effect.Effect<
      InstantMessageProposalRecordType,
      SharedProgramProposalError
    > =>
      Effect.gen(function* () {
        const routing = yield* Option.isSome(effectResult)
          ? routingForEffectResult(correlation)
          : routingForMessage(message, originatingProcessorId)
        const actorSequence = yield* nextActorSequence.pipe(
          Effect.mapError(
            cause =>
              new SharedProgramActorSequenceError({
                cause,
              }),
          ),
        )
        const occurrenceId = makeId()
        const createdAtMs = now()
        const encoded = yield* codec.encodeProposed(message, {
          actorSequence,
          clientId,
          createdAtMs,
          maybeCausationOccurrenceId: correlation.maybeCausationOccurrenceId,
          maybeCorrelationId: correlation.maybeCorrelationId,
          occurrenceId,
          originDeviceId,
          originatingProcessorId,
          programId,
          programVersion,
          sessionId,
          subjectId,
        })
        const proposal = InstantMessageProposalRecord.make({
          actorId,
          actorSequence,
          causationOccurrenceId: Option.getOrNull(
            correlation.maybeCausationOccurrenceId,
          ),
          clientId,
          correlationId: Option.getOrNull(correlation.maybeCorrelationId),
          createdAtMs,
          effectAssignmentGeneration: Option.match(effectResult, {
            onNone: () => null,
            onSome: result => result.effectAssignmentGeneration,
          }),
          effectCancellationGeneration: Option.match(effectResult, {
            onNone: () => null,
            onSome: result => result.effectCancellationGeneration,
          }),
          effectIdempotencyKey: Option.match(effectResult, {
            onNone: () => null,
            onSome: result => result.effectIdempotencyKey,
          }),
          effectRequestId: Option.match(effectResult, {
            onNone: () => null,
            onSome: result => result.effectRequestId,
          }),
          envelopeJson: encoded.envelopeJson,
          envelopeVersion: encoded.envelopeVersion,
          eventId: encoded.eventId,
          eventVersion: encoded.eventVersion,
          executorProcessorId: Option.match(effectResult, {
            onNone: () => null,
            onSome: () => originatingProcessorId,
          }),
          id: occurrenceId,
          messageCategory: routing.messageCategory,
          messageIdempotencyKey: Option.getOrNull(maybeMessageIdempotencyKey),
          occurrenceId,
          originDeviceId,
          originatingProcessorId,
          payloadJson: encoded.payloadJson,
          programId,
          programVersion,
          protocolVersion,
          proposalId: occurrenceId,
          proposalKind: Option.isSome(effectResult)
            ? 'EffectResult'
            : 'Message',
          proposedAudience: routing.audience,
          policyGeneration: routing.policyGeneration,
          sessionId,
          subjectId,
        })
        const didAppend = yield* appendPending(proposal)
        if (didAppend) {
          const lifecycle = yield* SynchronizedRef.get(transportLifecycleRef)
          const maybeTransportGeneration =
            lifecycle._tag === 'Active'
              ? Option.some(lifecycle.generation)
              : Option.none()
          const didPersist = yield* persistPending(
            PendingProgramProposal.make({
              persistence: 'Local',
              proposal,
            }),
          )
          if (!didPersist && Option.isSome(maybeTransportGeneration)) {
            yield* whenTransportActive(
              maybeTransportGeneration.value,
              setTransportErrored,
            )
          }
        }
        return proposal
      })

    const inspectReplay = (
      frame: number,
    ): Effect.Effect<void, SharedProgramReplayError> =>
      projectionSemaphore.withPermit(
        runtime.replay.inspect(frame).pipe(
          Effect.mapError(
            cause =>
              new SharedProgramReplayError({
                cause,
                frame,
              }),
          ),
          Effect.flatMap(displayedModel =>
            SubscriptionRef.update(snapshotRef, snapshot => ({
              ...snapshot,
              displayedModel,
              replayMode: InspectingReplay.make({ frame }),
            })),
          ),
        ),
      )

    const returnLive = updateProjectedSnapshot(snapshot => ({
      ...snapshot,
      replayMode: LiveReplay.make({}),
    }))

    return {
      connect,
      disconnect,
      inspectReplay,
      propose: message =>
        proposeWithKind(
          message,
          {
            maybeCausationOccurrenceId: Option.none(),
            maybeCorrelationId: Option.none(),
          },
          Option.none(),
          Option.none(),
        ),
      proposeCorrelated: (message, input) =>
        proposeWithKind(message, input, Option.none(), Option.none()),
      proposeIdempotentCorrelated: (message, input) =>
        S.decodeUnknownEffect(InstantMessageIdempotencyKey)(
          input.messageIdempotencyKey,
        ).pipe(
          Effect.mapError(
            cause =>
              new SharedProgramMessageIdempotencyKeyInvalid({
                cause,
                messageIdempotencyKey: input.messageIdempotencyKey,
              }),
          ),
          Effect.flatMap(messageIdempotencyKey =>
            proposeWithKind(
              message,
              input,
              Option.some(messageIdempotencyKey),
              Option.none(),
            ),
          ),
        ),
      proposeEffectResult: (message, input) =>
        proposeWithKind(message, input, Option.none(), Option.some(input)),
      readSnapshot: SubscriptionRef.get(snapshotRef),
      returnLive,
      snapshots: SubscriptionRef.changes(snapshotRef),
    }
  })
