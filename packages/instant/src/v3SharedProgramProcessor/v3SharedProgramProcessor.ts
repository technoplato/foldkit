import {
  Array,
  Data,
  Deferred,
  Effect,
  Fiber,
  HashMap,
  HashSet,
  Match as M,
  Option,
  Order,
  Result,
  Schema as S,
  Scope,
  Semaphore,
  Sink,
  Stream,
  SubscriptionRef,
  SynchronizedRef,
  Tuple,
} from 'effect'
import { type Program, Synchronization } from 'foldkit'

import {
  type OriginClientId,
  type OriginDeviceId,
  type OriginOrdinaryProposalSigningRecord,
  type OriginProcessorId,
  type OriginProofError,
  digestOriginOrdinaryMessageProposalProof,
  signOriginOrdinaryMessageProposal,
  verifyOriginOrdinaryMessageProposal,
} from '../originProof/index.js'
import {
  type V3ProgramStoreAppendError,
  V3ProgramStoreConnectionStatus,
  type V3ProgramStoreConnectionStatus as V3ProgramStoreConnectionStatusType,
  type V3ProgramStoreScope,
  type V3ProgramStoreService,
  type V3ProgramStoreTransactionOutcome,
} from '../v3ProgramStore/index.js'
import {
  InstantV3AcceptedMessageOccurrenceRecord,
  InstantV3AdmissionClaimJson,
  InstantV3CompositeKey,
  InstantV3EffectResultProposalRecord,
  type InstantV3EffectResultProposalRecord as InstantV3EffectResultProposalRecordType,
  InstantV3EntityId,
  InstantV3Identity,
  InstantV3MessageIdempotencyKey,
  InstantV3MessageProposalRecord,
  type InstantV3MessageProposalResolutionRecord,
  InstantV3NonNegativeInteger,
  type InstantV3OrdinaryMessageProposalRecord as InstantV3OrdinaryMessageProposalRecordType,
  type InstantV3OriginCertificateJson,
  type InstantV3ProgramSessionRecord,
  InstantV3TimestampMs,
  makeInstantV3MessageProposalActorSequencePositionKey,
  makeInstantV3MessageProposalEffectIdempotencyPositionKey,
  makeInstantV3MessageProposalEffectRequestResultPositionKey,
  makeInstantV3MessageProposalMessageIdempotencyPositionKey,
  makeInstantV3MessageProposalOccurrencePositionKey,
  makeInstantV3MessageProposalPositionKey,
  stringifyInstantV3CanonicalJson,
} from '../v3Schema/index.js'
import { finishCurrentObserverGeneration } from './observerLifecycle.js'

const BoundedText = S.String.check(S.isLengthBetween(1, 512))
const NullableIdentity = S.NullOr(InstantV3Identity)
const defaultInitialObservationReadinessTimeoutMs = 10_000

/** Program-owned event identity for one current Message value. */
export const V3SharedProgramEventMetadata = S.Struct({
  eventId: BoundedText,
  eventVersion: InstantV3NonNegativeInteger,
})
/** Program-owned event identity for one current Message value. */
export type V3SharedProgramEventMetadata =
  typeof V3SharedProgramEventMetadata.Type

const ProposedEnvelopeFields = {
  actorId: BoundedText,
  actorSequence: InstantV3NonNegativeInteger,
  causationOccurrenceId: NullableIdentity,
  clientId: BoundedText,
  correlationId: NullableIdentity,
  createdAtMs: InstantV3TimestampMs,
  eventId: BoundedText,
  eventVersion: InstantV3NonNegativeInteger,
  occurrenceId: InstantV3Identity,
  originDeviceId: BoundedText,
  originatingProcessorId: BoundedText,
  programId: BoundedText,
  programVersion: InstantV3NonNegativeInteger,
  protocolVersion: S.Literal(3),
  sessionId: BoundedText,
  subjectId: BoundedText,
}

const EffectResultEnvelopeFields = {
  causalAcceptedSequence:
    InstantV3EffectResultProposalRecord.fields.causalAcceptedSequence,
  causalAudience: InstantV3EffectResultProposalRecord.fields.causalAudience,
  causalMessageCategory:
    InstantV3EffectResultProposalRecord.fields.causalMessageCategory,
  causalOccurrenceId:
    InstantV3EffectResultProposalRecord.fields.causalOccurrenceId,
  causalOriginDeviceId:
    InstantV3EffectResultProposalRecord.fields.causalOriginDeviceId,
  causalOriginPolicyGeneration:
    InstantV3EffectResultProposalRecord.fields.causalOriginPolicyGeneration,
  causalOriginPolicyId:
    InstantV3EffectResultProposalRecord.fields.causalOriginPolicyId,
  causalOriginProofDigest:
    InstantV3EffectResultProposalRecord.fields.causalOriginProofDigest,
  causalOriginatingProcessorId:
    InstantV3EffectResultProposalRecord.fields.causalOriginatingProcessorId,
  causalPolicyGeneration:
    InstantV3EffectResultProposalRecord.fields.causalPolicyGeneration,
  causalProposalId: InstantV3EffectResultProposalRecord.fields.causalProposalId,
  effectAssignmentGeneration:
    InstantV3EffectResultProposalRecord.fields.effectAssignmentGeneration,
  effectCancellationGeneration:
    InstantV3EffectResultProposalRecord.fields.effectCancellationGeneration,
  effectIdempotencyKey:
    InstantV3EffectResultProposalRecord.fields.effectIdempotencyKey,
  effectIdempotencyPositionKey:
    InstantV3EffectResultProposalRecord.fields.effectIdempotencyPositionKey,
  effectPlacementId:
    InstantV3EffectResultProposalRecord.fields.effectPlacementId,
  effectRequestId: InstantV3EffectResultProposalRecord.fields.effectRequestId,
  effectRequestResultPositionKey:
    InstantV3EffectResultProposalRecord.fields.effectRequestResultPositionKey,
  executorClientCertificateJson:
    InstantV3EffectResultProposalRecord.fields.executorClientCertificateJson,
  executorOriginPolicyGeneration:
    InstantV3EffectResultProposalRecord.fields.executorOriginPolicyGeneration,
  executorOriginPolicyId:
    InstantV3EffectResultProposalRecord.fields.executorOriginPolicyId,
  executorProcessorCertificateJson:
    InstantV3EffectResultProposalRecord.fields.executorProcessorCertificateJson,
  executorProcessorId:
    InstantV3EffectResultProposalRecord.fields.executorProcessorId,
}

const AcceptedEnvelopeFields = {
  acceptedAtMs: InstantV3TimestampMs,
  acceptedSequence: S.Int.check(S.isGreaterThanOrEqualTo(1)),
  acceptingProcessorId: BoundedText,
  audience: Synchronization.Audience,
  messageCategory: Synchronization.MessageCategory,
  policyGeneration: InstantV3NonNegativeInteger,
  sessionPolicy: Synchronization.SessionPolicy,
}

/** Canonical provenance written before an ordinary Message is accepted. */
export const V3SharedProgramProposedEnvelope = S.TaggedStruct(
  'ProposedMessage',
  ProposedEnvelopeFields,
)
/** Canonical provenance written before an ordinary Message is accepted. */
export type V3SharedProgramProposedEnvelope =
  typeof V3SharedProgramProposedEnvelope.Type

/** Canonical provenance written before an effect-result Message is accepted. */
export const V3SharedProgramProposedEffectResultEnvelope = S.TaggedStruct(
  'ProposedEffectResult',
  {
    ...ProposedEnvelopeFields,
    ...EffectResultEnvelopeFields,
  },
)
/** Canonical provenance written before an effect-result Message is accepted. */
export type V3SharedProgramProposedEffectResultEnvelope =
  typeof V3SharedProgramProposedEffectResultEnvelope.Type

/** Canonical provenance frozen by the authority for an accepted Message. */
export const V3SharedProgramAcceptedOrdinaryEnvelope = S.TaggedStruct(
  'AcceptedMessage',
  {
    ...ProposedEnvelopeFields,
    ...AcceptedEnvelopeFields,
  },
)
/** Canonical provenance frozen by the authority for an accepted Message. */
export type V3SharedProgramAcceptedOrdinaryEnvelope =
  typeof V3SharedProgramAcceptedOrdinaryEnvelope.Type

/** Canonical provenance frozen for an accepted effect-result Message. */
export const V3SharedProgramAcceptedEffectResultEnvelope = S.TaggedStruct(
  'AcceptedEffectResult',
  {
    ...ProposedEnvelopeFields,
    ...EffectResultEnvelopeFields,
    ...AcceptedEnvelopeFields,
  },
)
/** Canonical provenance frozen for an accepted effect-result Message. */
export type V3SharedProgramAcceptedEffectResultEnvelope =
  typeof V3SharedProgramAcceptedEffectResultEnvelope.Type

/** Every canonical accepted ordinary or effect-result Message envelope. */
export const V3SharedProgramAcceptedEnvelope = S.Union([
  V3SharedProgramAcceptedOrdinaryEnvelope,
  V3SharedProgramAcceptedEffectResultEnvelope,
])
/** Every canonical accepted ordinary or effect-result Message envelope. */
export type V3SharedProgramAcceptedEnvelope =
  typeof V3SharedProgramAcceptedEnvelope.Type

/** Inputs authenticated by the Host before a Program admission claim is resolved. */
export const V3SharedProgramInvocationFacts = S.Struct({
  actorId: BoundedText,
  clientId: BoundedText,
  occurrenceId: InstantV3Identity,
  originatingProcessorId: BoundedText,
  sessionId: BoundedText,
  subjectId: BoundedText,
})
/** Inputs authenticated by the Host before a Program admission claim is resolved. */
export type V3SharedProgramInvocationFacts =
  typeof V3SharedProgramInvocationFacts.Type

/** Canonical fields produced by the Program-owned Message wire protocol. */
export type V3SharedProgramEncodedMessage = Readonly<{
  envelopeJson: string
  envelopeVersion: number
  eventId: string
  eventVersion: number
  payloadJson: string
}>

/** Provenance supplied before Program-owned event metadata is attached. */
export type V3SharedProgramProposedEnvelopeInput = Readonly<{
  actorId: string
  actorSequence: number
  causationOccurrenceId: string | null
  clientId: string
  correlationId: string | null
  createdAtMs: number
  occurrenceId: string
  originDeviceId: string
  originatingProcessorId: string
  programId: string
  programVersion: number
  protocolVersion: 3
  sessionId: string
  subjectId: string
}>

/** Causal and executor provenance needed before an effect result is signed. */
export type V3SharedProgramProposedEffectResultEnvelopeInput =
  V3SharedProgramProposedEnvelopeInput &
    Pick<
      InstantV3EffectResultProposalRecordType,
      | 'causalAcceptedSequence'
      | 'causalAudience'
      | 'causalMessageCategory'
      | 'causalOccurrenceId'
      | 'causalOriginDeviceId'
      | 'causalOriginPolicyGeneration'
      | 'causalOriginPolicyId'
      | 'causalOriginProofDigest'
      | 'causalOriginatingProcessorId'
      | 'causalPolicyGeneration'
      | 'causalProposalId'
      | 'effectAssignmentGeneration'
      | 'effectCancellationGeneration'
      | 'effectIdempotencyKey'
      | 'effectIdempotencyPositionKey'
      | 'effectPlacementId'
      | 'effectRequestId'
      | 'effectRequestResultPositionKey'
      | 'executorClientCertificateJson'
      | 'executorOriginPolicyGeneration'
      | 'executorOriginPolicyId'
      | 'executorProcessorCertificateJson'
      | 'executorProcessorId'
    >

/** Acceptance metadata appended without changing the proposed envelope. */
export type V3SharedProgramEnvelopeAcceptance = Readonly<{
  acceptedAtMs: number
  acceptedSequence: number
  acceptingProcessorId: string
  audience: Synchronization.Audience
  messageCategory: Synchronization.MessageCategory
  policyGeneration: number
  sessionPolicy: Synchronization.SessionPolicy
}>

/** A Program Message or canonical envelope failed strict wire validation. */
export class V3SharedProgramMessageProtocolError extends Data.TaggedError(
  'V3SharedProgramMessageProtocolError',
)<{
  readonly cause: unknown
  readonly operation:
    | 'AcceptEnvelope'
    | 'AcceptEffectResultEnvelope'
    | 'DecodeAccepted'
    | 'DecodeEffectResultProposed'
    | 'DecodeProposed'
    | 'EncodeProposed'
    | 'MakeAcceptedEnvelope'
    | 'ValidateAcceptedEnvelope'
    | 'ValidateProposedEnvelope'
}> {}

/** Schema-backed Program wire operations shared by the Client and authority. */
export type V3SharedProgramMessageProtocol<Message> = Readonly<{
  acceptEnvelope: (
    proposal: InstantV3OrdinaryMessageProposalRecordType,
    acceptance: V3SharedProgramEnvelopeAcceptance,
  ) => Effect.Effect<string, V3SharedProgramMessageProtocolError>
  acceptEffectResultEnvelope: (
    proposal: InstantV3EffectResultProposalRecordType,
    acceptance: V3SharedProgramEnvelopeAcceptance,
  ) => Effect.Effect<string, V3SharedProgramMessageProtocolError>
  decodeAccepted: (
    occurrence: InstantV3AcceptedMessageOccurrenceRecord,
  ) => Effect.Effect<Message, V3SharedProgramMessageProtocolError>
  decodeProposed: (
    proposal: InstantV3OrdinaryMessageProposalRecordType,
  ) => Effect.Effect<Message, V3SharedProgramMessageProtocolError>
  decodeEffectResultProposed: (
    proposal: InstantV3EffectResultProposalRecordType,
  ) => Effect.Effect<Message, V3SharedProgramMessageProtocolError>
  encodeProposed: (
    message: Message,
    envelope: V3SharedProgramProposedEnvelopeInput,
  ) => Effect.Effect<
    V3SharedProgramEncodedMessage,
    V3SharedProgramMessageProtocolError
  >
  encodeEffectResultProposed: (
    message: Message,
    envelope: V3SharedProgramProposedEffectResultEnvelopeInput,
  ) => Effect.Effect<
    V3SharedProgramEncodedMessage,
    V3SharedProgramMessageProtocolError
  >
  eventMetadata: (message: Message) => V3SharedProgramEventMetadata
  makeAcceptedEnvelope: (
    proposal: InstantV3MessageProposalRecord,
    acceptance: V3SharedProgramEnvelopeAcceptance,
  ) => Effect.Effect<string, V3SharedProgramMessageProtocolError>
  validateAcceptedEnvelope: (
    occurrence: InstantV3AcceptedMessageOccurrenceRecord,
    message: Message,
  ) => Effect.Effect<void, V3SharedProgramMessageProtocolError>
  validateProposedEnvelope: (
    proposal: InstantV3MessageProposalRecord,
    message: Message,
  ) => Effect.Effect<void, V3SharedProgramMessageProtocolError>
}>

/** Program-owned Schema and event metadata used to construct a v3 wire protocol. */
export type V3SharedProgramMessageProtocolConfig<Message> = Readonly<{
  Message: Program.ProgramSchema<Message>
  envelopeVersion: number
  eventMetadata: (message: Message) => V3SharedProgramEventMetadata
}>

const parseJson = (
  value: string,
  operation: V3SharedProgramMessageProtocolError['operation'],
): Effect.Effect<S.Json, V3SharedProgramMessageProtocolError> =>
  Effect.try({
    try: () => S.decodeUnknownSync(S.Json)(JSON.parse(value)),
    catch: cause =>
      new V3SharedProgramMessageProtocolError({ cause, operation }),
  })

const encodeCanonical = <Value>(
  schema: S.Codec<Value, unknown, never, never>,
  value: Value,
  operation: V3SharedProgramMessageProtocolError['operation'],
): Effect.Effect<string, V3SharedProgramMessageProtocolError> =>
  Effect.try({
    try: () => {
      const encoded = S.encodeUnknownSync(schema)(value)
      const json = S.decodeUnknownSync(S.Json)(encoded)
      return stringifyInstantV3CanonicalJson(json)
    },
    catch: cause =>
      new V3SharedProgramMessageProtocolError({ cause, operation }),
  })

const decodeCanonical = <Value>(
  schema: S.Codec<Value, unknown, never, never>,
  value: string,
  operation: V3SharedProgramMessageProtocolError['operation'],
): Effect.Effect<Value, V3SharedProgramMessageProtocolError> =>
  parseJson(value, operation).pipe(
    Effect.flatMap(json =>
      S.decodeUnknownEffect(schema, {
        errors: 'all',
        onExcessProperty: 'error',
      })(json),
    ),
    Effect.mapError(cause =>
      cause._tag === 'V3SharedProgramMessageProtocolError'
        ? cause
        : new V3SharedProgramMessageProtocolError({ cause, operation }),
    ),
  )

const proposedEnvelopeFromProposalFields = (
  proposal: InstantV3MessageProposalRecord,
) => ({
  actorId: proposal.actorId,
  actorSequence: proposal.actorSequence,
  causationOccurrenceId: proposal.causationOccurrenceId,
  clientId: proposal.clientId,
  correlationId: proposal.correlationId,
  createdAtMs: proposal.createdAtMs,
  eventId: proposal.eventId,
  eventVersion: proposal.eventVersion,
  occurrenceId: proposal.occurrenceId,
  originDeviceId: proposal.originDeviceId,
  originatingProcessorId: proposal.originatingProcessorId,
  programId: proposal.programId,
  programVersion: proposal.programVersion,
  protocolVersion: proposal.protocolVersion,
  sessionId: proposal.sessionId,
  subjectId: proposal.subjectId,
})

const proposedEnvelopeFromAcceptedFields = (
  occurrence: InstantV3AcceptedMessageOccurrenceRecord,
) => ({
  actorId: occurrence.actorId,
  actorSequence: occurrence.actorSequence,
  causationOccurrenceId: occurrence.causationId,
  clientId: occurrence.clientId,
  correlationId: occurrence.correlationId,
  createdAtMs: occurrence.createdAtMs,
  eventId: occurrence.eventId,
  eventVersion: occurrence.eventVersion,
  occurrenceId: occurrence.occurrenceId,
  originDeviceId: occurrence.originDeviceId,
  originatingProcessorId: occurrence.originatingProcessorId,
  programId: occurrence.programId,
  programVersion: occurrence.programVersion,
  protocolVersion: occurrence.protocolVersion,
  sessionId: occurrence.sessionId,
  subjectId: occurrence.subjectId,
})

const proposedEnvelopeFromProposal = (
  proposal: InstantV3OrdinaryMessageProposalRecordType,
): V3SharedProgramProposedEnvelope =>
  V3SharedProgramProposedEnvelope.make({
    ...proposedEnvelopeFromProposalFields(proposal),
  })

const proposedEnvelopeFromAccepted = (
  occurrence: Extract<
    InstantV3AcceptedMessageOccurrenceRecord,
    Readonly<{ proposalKind: 'OrdinaryMessage' }>
  >,
): V3SharedProgramProposedEnvelope =>
  V3SharedProgramProposedEnvelope.make({
    ...proposedEnvelopeFromAcceptedFields(occurrence),
  })

const proposedEffectResultEnvelopeFromProposal = (
  proposal: InstantV3EffectResultProposalRecordType,
): V3SharedProgramProposedEffectResultEnvelope =>
  V3SharedProgramProposedEffectResultEnvelope.make({
    ...proposedEnvelopeFromProposalFields(proposal),
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
    effectIdempotencyPositionKey: proposal.effectIdempotencyPositionKey,
    effectPlacementId: proposal.effectPlacementId,
    effectRequestId: proposal.effectRequestId,
    effectRequestResultPositionKey: proposal.effectRequestResultPositionKey,
    executorClientCertificateJson: proposal.executorClientCertificateJson,
    executorOriginPolicyGeneration: proposal.executorOriginPolicyGeneration,
    executorOriginPolicyId: proposal.executorOriginPolicyId,
    executorProcessorCertificateJson: proposal.executorProcessorCertificateJson,
    executorProcessorId: proposal.executorProcessorId,
  })

const proposedEffectResultEnvelopeFromAccepted = (
  occurrence: Extract<
    InstantV3AcceptedMessageOccurrenceRecord,
    Readonly<{ proposalKind: 'EffectResult' }>
  >,
): V3SharedProgramProposedEffectResultEnvelope =>
  V3SharedProgramProposedEffectResultEnvelope.make({
    ...proposedEnvelopeFromAcceptedFields(occurrence),
    causalAcceptedSequence: occurrence.causalAcceptedSequence,
    causalAudience: occurrence.causalAudience,
    causalMessageCategory: occurrence.causalMessageCategory,
    causalOccurrenceId: occurrence.causalOccurrenceId,
    causalOriginDeviceId: occurrence.causalOriginDeviceId,
    causalOriginPolicyGeneration: occurrence.causalOriginPolicyGeneration,
    causalOriginPolicyId: occurrence.causalOriginPolicyId,
    causalOriginProofDigest: occurrence.causalOriginProofDigest,
    causalOriginatingProcessorId: occurrence.causalOriginatingProcessorId,
    causalPolicyGeneration: occurrence.causalPolicyGeneration,
    causalProposalId: occurrence.causalProposalId,
    effectAssignmentGeneration: occurrence.effectAssignmentGeneration,
    effectCancellationGeneration: occurrence.effectCancellationGeneration,
    effectIdempotencyKey: occurrence.effectIdempotencyKey,
    effectIdempotencyPositionKey:
      makeInstantV3MessageProposalEffectIdempotencyPositionKey(
        occurrence.sessionId,
        occurrence.effectIdempotencyKey,
      ),
    effectPlacementId: occurrence.effectPlacementId,
    effectRequestId: occurrence.effectRequestId,
    effectRequestResultPositionKey:
      makeInstantV3MessageProposalEffectRequestResultPositionKey(
        occurrence.sessionId,
        occurrence.effectRequestId,
      ),
    executorClientCertificateJson: occurrence.executorClientCertificateJson,
    executorOriginPolicyGeneration: occurrence.executorOriginPolicyGeneration,
    executorOriginPolicyId: occurrence.executorOriginPolicyId,
    executorProcessorCertificateJson:
      occurrence.executorProcessorCertificateJson,
    executorProcessorId: occurrence.executorProcessorId,
  })

/** Creates the canonical Program-owned Message and envelope wire protocol. */
export const makeV3SharedProgramMessageProtocol = <Message>({
  Message,
  envelopeVersion,
  eventMetadata,
}: V3SharedProgramMessageProtocolConfig<Message>): V3SharedProgramMessageProtocol<Message> => {
  const validatedEventMetadata = (
    message: Message,
  ): V3SharedProgramEventMetadata =>
    S.decodeUnknownSync(V3SharedProgramEventMetadata)(eventMetadata(message))

  const metadata = (
    message: Message,
    operation: V3SharedProgramMessageProtocolError['operation'],
  ): Effect.Effect<
    V3SharedProgramEventMetadata,
    V3SharedProgramMessageProtocolError
  > =>
    Effect.try({
      try: () => validatedEventMetadata(message),
      catch: cause =>
        new V3SharedProgramMessageProtocolError({ cause, operation }),
    })

  const encodeProposed = (
    message: Message,
    envelope: V3SharedProgramProposedEnvelopeInput,
  ): Effect.Effect<
    V3SharedProgramEncodedMessage,
    V3SharedProgramMessageProtocolError
  > =>
    Effect.gen(function* () {
      const event = yield* metadata(message, 'EncodeProposed')
      const completeEnvelope = V3SharedProgramProposedEnvelope.make({
        ...envelope,
        eventId: event.eventId,
        eventVersion: event.eventVersion,
      })
      const payloadJson = yield* encodeCanonical(
        Message,
        message,
        'EncodeProposed',
      )
      const envelopeJson = yield* encodeCanonical(
        V3SharedProgramProposedEnvelope,
        completeEnvelope,
        'EncodeProposed',
      )
      return {
        envelopeJson,
        envelopeVersion,
        eventId: event.eventId,
        eventVersion: event.eventVersion,
        payloadJson,
      }
    })

  const encodeEffectResultProposed = (
    message: Message,
    envelope: V3SharedProgramProposedEffectResultEnvelopeInput,
  ): Effect.Effect<
    V3SharedProgramEncodedMessage,
    V3SharedProgramMessageProtocolError
  > =>
    Effect.gen(function* () {
      const event = yield* metadata(message, 'EncodeProposed')
      const completeEnvelope = V3SharedProgramProposedEffectResultEnvelope.make(
        {
          ...envelope,
          eventId: event.eventId,
          eventVersion: event.eventVersion,
        },
      )
      const payloadJson = yield* encodeCanonical(
        Message,
        message,
        'EncodeProposed',
      )
      const envelopeJson = yield* encodeCanonical(
        V3SharedProgramProposedEffectResultEnvelope,
        completeEnvelope,
        'EncodeProposed',
      )
      return {
        envelopeJson,
        envelopeVersion,
        eventId: event.eventId,
        eventVersion: event.eventVersion,
        payloadJson,
      }
    })

  const validateProposedEnvelope = (
    proposal: InstantV3MessageProposalRecord,
    message: Message,
  ): Effect.Effect<void, V3SharedProgramMessageProtocolError> =>
    Effect.gen(function* () {
      if (proposal.envelopeVersion !== envelopeVersion) {
        return yield* Effect.fail(
          new V3SharedProgramMessageProtocolError({
            cause: new Error('Unsupported proposed envelope version.'),
            operation: 'ValidateProposedEnvelope',
          }),
        )
      }
      const expectedPayloadJson = yield* encodeCanonical(
        Message,
        message,
        'ValidateProposedEnvelope',
      )
      const event = yield* metadata(message, 'ValidateProposedEnvelope')
      const expectedEnvelopeJson =
        proposal.proposalKind === 'OrdinaryMessage'
          ? yield* encodeCanonical(
              V3SharedProgramProposedEnvelope,
              proposedEnvelopeFromProposal(proposal),
              'ValidateProposedEnvelope',
            )
          : yield* encodeCanonical(
              V3SharedProgramProposedEffectResultEnvelope,
              proposedEffectResultEnvelopeFromProposal(proposal),
              'ValidateProposedEnvelope',
            )
      if (proposal.proposalKind === 'OrdinaryMessage') {
        yield* decodeCanonical(
          V3SharedProgramProposedEnvelope,
          proposal.envelopeJson,
          'ValidateProposedEnvelope',
        )
      } else {
        yield* decodeCanonical(
          V3SharedProgramProposedEffectResultEnvelope,
          proposal.envelopeJson,
          'ValidateProposedEnvelope',
        )
      }
      if (
        event.eventId !== proposal.eventId ||
        event.eventVersion !== proposal.eventVersion ||
        proposal.payloadJson !== expectedPayloadJson ||
        proposal.envelopeJson !== expectedEnvelopeJson
      ) {
        return yield* Effect.fail(
          new V3SharedProgramMessageProtocolError({
            cause: new Error('Proposed Message provenance is not canonical.'),
            operation: 'ValidateProposedEnvelope',
          }),
        )
      }
    })

  const decodeProposal = (
    proposal: InstantV3MessageProposalRecord,
    operation:
      | 'DecodeEffectResultProposed'
      | 'DecodeProposed'
      | 'MakeAcceptedEnvelope',
  ): Effect.Effect<Message, V3SharedProgramMessageProtocolError> =>
    Effect.gen(function* () {
      const message = yield* decodeCanonical(
        Message,
        proposal.payloadJson,
        operation,
      )
      yield* validateProposedEnvelope(proposal, message)
      return message
    })

  const decodeProposed = (
    proposal: InstantV3OrdinaryMessageProposalRecordType,
  ): Effect.Effect<Message, V3SharedProgramMessageProtocolError> =>
    decodeProposal(proposal, 'DecodeProposed')

  const decodeEffectResultProposed = (
    proposal: InstantV3EffectResultProposalRecordType,
  ): Effect.Effect<Message, V3SharedProgramMessageProtocolError> =>
    decodeProposal(proposal, 'DecodeEffectResultProposed')

  const makeAcceptedEnvelope = (
    proposal: InstantV3MessageProposalRecord,
    acceptance: V3SharedProgramEnvelopeAcceptance,
  ): Effect.Effect<string, V3SharedProgramMessageProtocolError> =>
    decodeProposal(proposal, 'MakeAcceptedEnvelope').pipe(
      Effect.flatMap(() => {
        if (proposal.proposalKind === 'OrdinaryMessage') {
          return encodeCanonical(
            V3SharedProgramAcceptedOrdinaryEnvelope,
            V3SharedProgramAcceptedOrdinaryEnvelope.make({
              ...proposedEnvelopeFromProposal(proposal),
              _tag: 'AcceptedMessage',
              ...acceptance,
            }),
            'MakeAcceptedEnvelope',
          )
        } else {
          return encodeCanonical(
            V3SharedProgramAcceptedEffectResultEnvelope,
            V3SharedProgramAcceptedEffectResultEnvelope.make({
              ...proposedEffectResultEnvelopeFromProposal(proposal),
              _tag: 'AcceptedEffectResult',
              ...acceptance,
            }),
            'MakeAcceptedEnvelope',
          )
        }
      }),
    )

  const acceptEnvelope = (
    proposal: InstantV3OrdinaryMessageProposalRecordType,
    acceptance: V3SharedProgramEnvelopeAcceptance,
  ): Effect.Effect<string, V3SharedProgramMessageProtocolError> =>
    makeAcceptedEnvelope(proposal, acceptance).pipe(
      Effect.mapError(
        cause =>
          new V3SharedProgramMessageProtocolError({
            cause,
            operation: 'AcceptEnvelope',
          }),
      ),
    )

  const acceptEffectResultEnvelope = (
    proposal: InstantV3EffectResultProposalRecordType,
    acceptance: V3SharedProgramEnvelopeAcceptance,
  ): Effect.Effect<string, V3SharedProgramMessageProtocolError> =>
    makeAcceptedEnvelope(proposal, acceptance).pipe(
      Effect.mapError(
        cause =>
          new V3SharedProgramMessageProtocolError({
            cause,
            operation: 'AcceptEffectResultEnvelope',
          }),
      ),
    )

  const validateAcceptedEnvelope = (
    occurrence: InstantV3AcceptedMessageOccurrenceRecord,
    message: Message,
  ): Effect.Effect<void, V3SharedProgramMessageProtocolError> =>
    Effect.gen(function* () {
      if (occurrence.envelopeVersion !== envelopeVersion) {
        return yield* Effect.fail(
          new V3SharedProgramMessageProtocolError({
            cause: new Error('Unsupported accepted envelope version.'),
            operation: 'ValidateAcceptedEnvelope',
          }),
        )
      }
      const expectedPayloadJson = yield* encodeCanonical(
        Message,
        message,
        'ValidateAcceptedEnvelope',
      )
      const event = yield* metadata(message, 'ValidateAcceptedEnvelope')
      const acceptance = {
        acceptedAtMs: occurrence.acceptedAtMs,
        acceptedSequence: occurrence.acceptedSequence,
        acceptingProcessorId: occurrence.acceptingProcessorId,
        audience: occurrence.audience,
        messageCategory: occurrence.messageCategory,
        policyGeneration: occurrence.policyGeneration,
        sessionPolicy: occurrence.sessionPolicy,
      }
      const expectedProposedEnvelopeJson =
        occurrence.proposalKind === 'OrdinaryMessage'
          ? yield* encodeCanonical(
              V3SharedProgramProposedEnvelope,
              proposedEnvelopeFromAccepted(occurrence),
              'ValidateAcceptedEnvelope',
            )
          : yield* encodeCanonical(
              V3SharedProgramProposedEffectResultEnvelope,
              proposedEffectResultEnvelopeFromAccepted(occurrence),
              'ValidateAcceptedEnvelope',
            )
      const expectedAcceptedEnvelopeJson =
        occurrence.proposalKind === 'OrdinaryMessage'
          ? yield* encodeCanonical(
              V3SharedProgramAcceptedOrdinaryEnvelope,
              V3SharedProgramAcceptedOrdinaryEnvelope.make({
                ...proposedEnvelopeFromAccepted(occurrence),
                _tag: 'AcceptedMessage',
                ...acceptance,
              }),
              'ValidateAcceptedEnvelope',
            )
          : yield* encodeCanonical(
              V3SharedProgramAcceptedEffectResultEnvelope,
              V3SharedProgramAcceptedEffectResultEnvelope.make({
                ...proposedEffectResultEnvelopeFromAccepted(occurrence),
                _tag: 'AcceptedEffectResult',
                ...acceptance,
              }),
              'ValidateAcceptedEnvelope',
            )
      if (occurrence.proposalKind === 'OrdinaryMessage') {
        yield* decodeCanonical(
          V3SharedProgramAcceptedOrdinaryEnvelope,
          occurrence.envelopeJson,
          'ValidateAcceptedEnvelope',
        )
      } else {
        yield* decodeCanonical(
          V3SharedProgramAcceptedEffectResultEnvelope,
          occurrence.envelopeJson,
          'ValidateAcceptedEnvelope',
        )
      }
      if (
        event.eventId !== occurrence.eventId ||
        event.eventVersion !== occurrence.eventVersion ||
        occurrence.payloadJson !== expectedPayloadJson ||
        occurrence.proposedEnvelopeJson !== expectedProposedEnvelopeJson ||
        occurrence.envelopeJson !== expectedAcceptedEnvelopeJson
      ) {
        return yield* Effect.fail(
          new V3SharedProgramMessageProtocolError({
            cause: new Error('Accepted Message provenance is not canonical.'),
            operation: 'ValidateAcceptedEnvelope',
          }),
        )
      }
    })

  const decodeAccepted = (
    occurrence: InstantV3AcceptedMessageOccurrenceRecord,
  ): Effect.Effect<Message, V3SharedProgramMessageProtocolError> =>
    Effect.gen(function* () {
      const message = yield* decodeCanonical(
        Message,
        occurrence.payloadJson,
        'DecodeAccepted',
      )
      yield* validateAcceptedEnvelope(occurrence, message)
      return message
    })

  return {
    acceptEffectResultEnvelope,
    acceptEnvelope,
    decodeAccepted,
    decodeEffectResultProposed,
    decodeProposed,
    encodeEffectResultProposed,
    encodeProposed,
    eventMetadata: validatedEventMetadata,
    makeAcceptedEnvelope,
    validateAcceptedEnvelope,
    validateProposedEnvelope,
  }
}

const V3Detached = S.TaggedStruct('Detached', {})
const V3Attached = S.TaggedStruct('Attached', {
  transportStatus: V3ProgramStoreConnectionStatus,
})

/** Whether this Processor currently owns a live store observation lifecycle. */
export const V3SharedProgramConnection = S.Union([V3Detached, V3Attached])
/** Whether this Processor currently owns a live store observation lifecycle. */
export type V3SharedProgramConnection = typeof V3SharedProgramConnection.Type

/** Non-authoritative persistence evidence for one unresolved local proposal. */
export const V3PendingProposalPersistence = S.Literals([
  'Local',
  'Enqueued',
  'Observed',
  'ServerConfirmed',
])
/** Non-authoritative persistence evidence for one unresolved local proposal. */
export type V3PendingProposalPersistence =
  typeof V3PendingProposalPersistence.Type

/** The claim still applies to the current optimistic Model. */
export const V3PendingProjectionApplied = S.TaggedStruct('Applied', {})
/** The accepted projection already contains this still-unjoined proposal. */
export const V3PendingProjectionAccepted = S.TaggedStruct('Accepted', {})
/** The claim is still awaiting authority but is stale against current state. */
export const V3PendingProjectionStale = S.TaggedStruct('Stale', {
  failureTag: S.String,
})
/** Whether one pending claim currently affects this Processor's optimistic Model. */
export const V3PendingProjection = S.Union([
  V3PendingProjectionAccepted,
  V3PendingProjectionApplied,
  V3PendingProjectionStale,
])
/** Whether one pending claim currently affects this Processor's optimistic Model. */
export type V3PendingProjection = typeof V3PendingProjection.Type

/** One unresolved ordinary proposal and its current local projection state. */
export type V3PendingProgramClaim = Readonly<{
  authorityState: 'AwaitingAuthority'
  persistence: V3PendingProposalPersistence
  projection: V3PendingProjection
  proposal: InstantV3OrdinaryMessageProposalRecordType
}>

/** A recent terminal authority outcome safe for Client presentation. */
export type V3TerminalProgramClaim = Readonly<{
  maybeRejectionReason: Option.Option<string>
  proposalId: string
  resolutionState: 'Accepted' | 'Rejected'
  resolvedAtMs: number
}>

/** Credential-free identity and policy for the current active Program session. */
export const V3SharedProgramActiveSession = S.Struct({
  lifecycleGeneration: InstantV3NonNegativeInteger,
  lifecyclePositionKey: InstantV3CompositeKey,
  lifecycleState: S.Literal('Active'),
  sessionPolicy: Synchronization.SessionPolicy,
})
/** Credential-free identity and policy for the current active Program session. */
export type V3SharedProgramActiveSession =
  typeof V3SharedProgramActiveSession.Type

/** One atomic view of accepted, optimistic, pending, and transport state. */
export type V3SharedProgramProcessorSnapshot<Model> = Readonly<{
  acceptedModel: Model
  activeProgramSession: Option.Option<V3SharedProgramActiveSession>
  activeSessionPolicy: Option.Option<Synchronization.SessionPolicy>
  connection: V3SharedProgramConnection
  lastError: Option.Option<V3SharedProgramProcessorError>
  optimisticModel: Model
  pendingClaims: ReadonlyArray<V3PendingProgramClaim>
  recentTerminalClaims: ReadonlyArray<V3TerminalProgramClaim>
  throughAcceptedSequence: number
  waitingForAcceptedSequence: Option.Option<number>
}>

/** A Program admission claim could not be strictly encoded or decoded. */
export class V3SharedProgramAdmissionClaimError extends Data.TaggedError(
  'V3SharedProgramAdmissionClaimError',
)<{
  readonly cause: unknown
  readonly operation: 'Decode' | 'Encode' | 'OccurrenceId'
  readonly proposalId: string | null
}> {}

/** A Program rejected or failed to resolve one current admission claim. */
export class V3SharedProgramAdmissionResolutionError extends Data.TaggedError(
  'V3SharedProgramAdmissionResolutionError',
)<{
  readonly cause: unknown
  readonly occurrenceId: string
  readonly proposalId: string | null
}> {}

/** A host action factory failed before its claim reached Program admission. */
export class V3SharedProgramActionError extends Data.TaggedError(
  'V3SharedProgramActionError',
)<{ readonly cause: unknown }> {}

/** A Host-supplied identity, sequence, or timestamp was invalid. */
export class V3SharedProgramIdentityError extends Data.TaggedError(
  'V3SharedProgramIdentityError',
)<{
  readonly cause: unknown
  readonly identity:
    | 'ActorSequence'
    | 'EntityId'
    | 'MessageIdempotencyKey'
    | 'OccurrenceId'
    | 'ProposalId'
    | 'Timestamp'
}> {}

/** An origin proof could not be produced or verified. */
export class V3SharedProgramOriginProofError extends Data.TaggedError(
  'V3SharedProgramOriginProofError',
)<{ readonly cause: OriginProofError; readonly proposalId: string }> {}

/** A store row escaped the configured authenticated Program session. */
export class V3SharedProgramScopeMismatch extends Data.TaggedError(
  'V3SharedProgramScopeMismatch',
)<{ readonly recordId: string }> {}

/** Accepted history reused an ordered position or contained incompatible rows. */
export class V3SharedProgramAcceptedHistoryError extends Data.TaggedError(
  'V3SharedProgramAcceptedHistoryError',
)<{
  readonly acceptedSequence: number
  readonly reason: 'ConflictingSequence' | 'DuplicateProposal'
  readonly recordId: string
}> {}

/** Accepted routing disagreed with the Program or a verified causal occurrence. */
export class V3SharedProgramAcceptedRoutingError extends Data.TaggedError(
  'V3SharedProgramAcceptedRoutingError',
)<{
  readonly cause: unknown
  readonly occurrenceId: string
  readonly reason:
    | 'AudienceMismatch'
    | 'CausalLineageMismatch'
    | 'MessageCategoryMismatch'
    | 'MissingCausalOccurrence'
    | 'MissingProgramSynchronization'
    | 'PolicyGenerationMismatch'
    | 'ProgramSynchronizationDefect'
    | 'ReadOnlyFollower'
    | 'SessionPolicyMismatch'
}> {}

/** Observed Program-session history cannot select one safe current policy. */
export class V3SharedProgramSessionHistoryError extends Data.TaggedError(
  'V3SharedProgramSessionHistoryError',
)<{
  readonly reason:
    | 'ConflictingGeneration'
    | 'LifecycleGenerationNotSequential'
    | 'PolicyGenerationNotSequential'
    | 'RevocationPolicyChanged'
    | 'ScopeMismatch'
    | 'SessionPermanentlyRevoked'
  readonly recordId: string
}> {}

/** No confirmed active Program-session policy is available for submission. */
export class V3SharedProgramSessionPolicyUnavailable extends Data.TaggedError(
  'V3SharedProgramSessionPolicyUnavailable',
)<{ readonly reason: 'InvalidHistory' | 'NeverConfirmed' | 'Revoked' }> {}

/** One required store observation did not produce its initial snapshot in time. */
export class V3SharedProgramObservationReadinessError extends Data.TaggedError(
  'V3SharedProgramObservationReadinessError',
)<{
  readonly source:
    | 'AcceptedMessageOccurrences'
    | 'ConnectionStatus'
    | 'MessageProposals'
    | 'MessageProposalResolutions'
    | 'ProgramSessions'
  readonly timeoutMs: number
}> {}

/** Local synchronization policy rejected a Message before optimistic append. */
export class V3SharedProgramSynchronizationPreflightError extends Data.TaggedError(
  'V3SharedProgramSynchronizationPreflightError',
)<{
  readonly cause: unknown
  readonly reason:
    | 'MissingProgramSynchronization'
    | 'ProgramSynchronizationDefect'
    | 'ReadOnlyFollower'
}> {}

/** A Program update defect was surfaced without executing its Commands. */
export class V3SharedProgramUpdateError extends Data.TaggedError(
  'V3SharedProgramUpdateError',
)<{
  readonly cause: unknown
  readonly occurrenceId: string
  readonly stage: 'Accepted' | 'Optimistic'
}> {}

/** An observed proposal conflicts with another row at the same immutable identity. */
export class V3SharedProgramProposalConflict extends Data.TaggedError(
  'V3SharedProgramProposalConflict',
)<{ readonly proposalId: string }> {}

/** Persistence failed after the local Program projection was retained. */
export class V3SharedProgramPersistenceError extends Data.TaggedError(
  'V3SharedProgramPersistenceError',
)<{
  readonly cause: V3ProgramStoreAppendError
  readonly persistence: 'Local'
  readonly projection: V3PendingProjection
  readonly proposal: InstantV3OrdinaryMessageProposalRecordType
}> {}

/** A terminal resolution disagrees with the proposal it names. */
export class V3SharedProgramResolutionMismatch extends Data.TaggedError(
  'V3SharedProgramResolutionMismatch',
)<{ readonly proposalId: string }> {}

/** Every failure surfaced by projection or observation without crashing the Client. */
export type V3SharedProgramProcessorError =
  | V3SharedProgramAcceptedHistoryError
  | V3SharedProgramAcceptedRoutingError
  | V3SharedProgramAdmissionClaimError
  | V3SharedProgramAdmissionResolutionError
  | V3SharedProgramMessageProtocolError
  | V3SharedProgramObservationReadinessError
  | V3SharedProgramOriginProofError
  | V3SharedProgramProposalConflict
  | V3SharedProgramResolutionMismatch
  | V3SharedProgramSessionHistoryError
  | V3SharedProgramScopeMismatch
  | V3SharedProgramUpdateError
  | import('../v3ProgramStore/index.js').V3ProgramStoreError

/** Failures possible while constructing and persisting one local claim. */
export type V3SharedProgramSubmissionError =
  | V3SharedProgramActionError
  | V3SharedProgramAdmissionClaimError
  | V3SharedProgramAdmissionResolutionError
  | V3SharedProgramIdentityError
  | V3SharedProgramMessageProtocolError
  | V3SharedProgramOriginProofError
  | V3SharedProgramPersistenceError
  | V3SharedProgramProposalConflict
  | V3SharedProgramSessionPolicyUnavailable
  | V3SharedProgramSynchronizationPreflightError
  | V3SharedProgramUpdateError

/** Optional causal identities attached to one ordinary admission claim. */
export type V3SharedProgramClaimCorrelation = Readonly<{
  causationOccurrenceId: string | null
  correlationId: string | null
}>

const noCorrelation = (): V3SharedProgramClaimCorrelation => ({
  causationOccurrenceId: null,
  correlationId: null,
})

/** Host-owned origin and signing material fixed for one Processor occurrence. */
export type V3SharedProgramOrigin = Readonly<{
  actorId: string
  clientId: OriginClientId
  originClientCertificateJson: InstantV3OriginCertificateJson
  originDeviceId: OriginDeviceId
  originPolicyGeneration: number
  originPolicyId: string
  originProcessorCertificateJson: InstantV3OriginCertificateJson
  originatingProcessorId: OriginProcessorId
  processorSecretKey: Uint8Array
}>

/** Host-owned monotonic and unique value sources used by local submissions. */
export type V3SharedProgramIdentitySources = Readonly<{
  nextActorSequence: Effect.Effect<number, unknown>
  nextEntityId: Effect.Effect<string, unknown>
  nextMessageIdempotencyKey: Effect.Effect<string, unknown>
  nextOccurrenceId: Effect.Effect<string, unknown>
  nextProposalId: Effect.Effect<string, unknown>
  now: Effect.Effect<number, unknown>
}>

/** Configuration for one protocol-v3 optimistic shared Program Processor. */
export type V3SharedProgramProcessorConfig<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Claim,
  DecodeError,
  ResolutionError,
> = Readonly<{
  admission: Program.MessageAdmissionDefinition<
    Model,
    Message,
    Claim,
    DecodeError,
    ResolutionError
  >
  identities: V3SharedProgramIdentitySources
  initialObservationReadinessTimeoutMs?: number
  messageProtocol: V3SharedProgramMessageProtocol<Message>
  origin: V3SharedProgramOrigin
  scope: V3ProgramStoreScope
  store: V3ProgramStoreService
}>

/** The record, stable local projection, and persistence result of one submission. */
export type V3SharedProgramSubmission = Readonly<{
  outcome: V3ProgramStoreTransactionOutcome
  projection: V3PendingProjection
  proposal: InstantV3OrdinaryMessageProposalRecordType
}>

/** A claim factory that receives one fresh Host-owned occurrence identity. */
export type V3SharedProgramAction<Claim> = (occurrenceId: string) => Claim

/** A scoped controller for one optimistic protocol-v3 Program Processor. */
export type V3SharedProgramProcessor<Model, Claim> = Readonly<{
  connect: Effect.Effect<void>
  disconnect: Effect.Effect<void>
  readSnapshot: Effect.Effect<V3SharedProgramProcessorSnapshot<Model>>
  retryPending: (
    proposalId: string,
  ) => Effect.Effect<V3SharedProgramSubmission, V3SharedProgramSubmissionError>
  snapshots: Stream.Stream<V3SharedProgramProcessorSnapshot<Model>>
  submitAction: (
    action: V3SharedProgramAction<Claim>,
    correlation?: V3SharedProgramClaimCorrelation,
  ) => Effect.Effect<V3SharedProgramSubmission, V3SharedProgramSubmissionError>
  submitClaim: (
    claim: Claim,
    correlation?: V3SharedProgramClaimCorrelation,
  ) => Effect.Effect<V3SharedProgramSubmission, V3SharedProgramSubmissionError>
}>

type LocalPending = Readonly<{
  persistence: V3PendingProposalPersistence
  proposal: InstantV3OrdinaryMessageProposalRecordType
  source: 'Local' | 'Observed'
}>

type RetainedPending = Readonly<{
  projection: V3PendingProjection
  proposal: InstantV3OrdinaryMessageProposalRecordType
}>

type ObservedState = Readonly<{
  accepted: ReadonlyArray<InstantV3AcceptedMessageOccurrenceRecord>
  connectionStatus: V3ProgramStoreConnectionStatusType
  programSessions: ReadonlyArray<InstantV3ProgramSessionRecord>
  proposals: ReadonlyArray<InstantV3MessageProposalRecord>
  resolutions: ReadonlyArray<InstantV3MessageProposalResolutionRecord>
}>

type AcceptedProjectionState<Model> = Readonly<{
  acceptedByOccurrenceId: HashMap.HashMap<
    string,
    InstantV3AcceptedMessageOccurrenceRecord
  >
  acceptedFingerprints: HashMap.HashMap<number, string>
  acceptedProposalIds: HashSet.HashSet<string>
  model: Model
  proposalDependencies: HashMap.HashMap<string, string>
  revision: number
  throughAcceptedSequence: number
}>

type PendingProjectionState<Model> = Readonly<{
  acceptedRevision: number
  model: Model
  pendingClaims: ReadonlyArray<V3PendingProgramClaim>
  proposalFingerprints: ReadonlyArray<string>
  sessionPolicyFingerprint: string
}>

type SessionPolicyCache =
  | Readonly<{
      _tag: 'Active'
      policy: Synchronization.SessionPolicy
      session: V3SharedProgramActiveSession
    }>
  | Readonly<{ _tag: 'InvalidHistory' }>
  | Readonly<{ _tag: 'NeverConfirmed' }>
  | Readonly<{ _tag: 'Revoked' }>

type ObserverHandle = Readonly<{
  finished: Deferred.Deferred<void>
  fiber: Fiber.Fiber<void>
  generation: number
  lifecycle: 'Finishing' | 'Running'
}>

const pendingOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (pending: LocalPending) => pending.proposal.actorSequence,
  ),
  Order.mapInput(
    Order.String,
    (pending: LocalPending) => pending.proposal.proposalId,
  ),
)

const acceptedOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (occurrence: InstantV3AcceptedMessageOccurrenceRecord) =>
      occurrence.acceptedSequence,
  ),
  Order.mapInput(
    Order.String,
    (occurrence: InstantV3AcceptedMessageOccurrenceRecord) => occurrence.id,
  ),
)

const programSessionOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (session: InstantV3ProgramSessionRecord) => session.lifecycleGeneration,
  ),
  Order.mapInput(
    Order.String,
    (session: InstantV3ProgramSessionRecord) => session.id,
  ),
)

const encodeAcceptedOccurrence = S.encodeSync(
  S.fromJsonString(InstantV3AcceptedMessageOccurrenceRecord),
)
const encodeObservedProposal = S.encodeSync(
  S.fromJsonString(InstantV3MessageProposalRecord),
)
const encodeSessionPolicy = S.encodeSync(
  S.fromJsonString(Synchronization.SessionPolicy),
)

const persistenceFromOutcome = (
  outcome: V3ProgramStoreTransactionOutcome,
): V3PendingProposalPersistence =>
  M.value(outcome).pipe(
    M.withReturnType<V3PendingProposalPersistence>(),
    M.tagsExhaustive({
      Enqueued: () => 'Enqueued',
      ServerConfirmed: () => 'ServerConfirmed',
    }),
  )

const failureTag = (failure: unknown): string => {
  if (
    typeof failure === 'object' &&
    failure !== null &&
    '_tag' in failure &&
    typeof failure._tag === 'string'
  ) {
    return failure._tag
  } else {
    return 'UnknownAdmissionFailure'
  }
}

const isSameScope = (
  scope: V3ProgramStoreScope,
  record: V3ProgramStoreScope,
): boolean =>
  scope.appSubjectDigest === record.appSubjectDigest &&
  scope.instantAppId === record.instantAppId &&
  scope.programId === record.programId &&
  scope.programVersion === record.programVersion &&
  scope.protocolVersion === record.protocolVersion &&
  scope.sessionEpochId === record.sessionEpochId &&
  scope.sessionId === record.sessionId &&
  scope.subjectId === record.subjectId

const proposalResolutionMatches = (
  proposal: InstantV3OrdinaryMessageProposalRecordType,
  resolution: InstantV3MessageProposalResolutionRecord,
): boolean =>
  proposal.actorId === resolution.actorId &&
  proposal.actorSequence === resolution.actorSequence &&
  proposal.clientId === resolution.clientId &&
  proposal.originDeviceId === resolution.originDeviceId &&
  proposal.originatingProcessorId === resolution.originatingProcessorId &&
  proposal.proposalId === resolution.proposalId &&
  proposal.proposalKind === resolution.proposalKind

const updateProgram = <Model, Message extends Readonly<{ _tag: string }>>(
  program: Program.Program<Model, Message>,
  model: Model,
  message: Message,
  occurrenceId: string,
  stage: V3SharedProgramUpdateError['stage'],
): Effect.Effect<Model, V3SharedProgramUpdateError> =>
  Effect.gen(function* () {
    const nextModel = yield* Effect.try({
      try: () => Tuple.get(program.update(model, message), 0),
      catch: cause =>
        new V3SharedProgramUpdateError({ cause, occurrenceId, stage }),
    })
    return yield* S.decodeUnknownEffect(program.Model)(nextModel).pipe(
      Effect.mapError(
        cause => new V3SharedProgramUpdateError({ cause, occurrenceId, stage }),
      ),
      Effect.catchDefect(cause =>
        Effect.fail(
          new V3SharedProgramUpdateError({ cause, occurrenceId, stage }),
        ),
      ),
    )
  })

/** Creates an Effect-scoped optimistic Processor over a protocol-v3 Client store. */
export const makeV3SharedProgramProcessor = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Claim,
  DecodeError,
  ResolutionError,
>({
  admission,
  identities,
  initialObservationReadinessTimeoutMs:
    configuredInitialObservationReadinessTimeoutMs,
  messageProtocol,
  origin,
  scope,
  store,
}: V3SharedProgramProcessorConfig<
  Model,
  Message,
  Claim,
  DecodeError,
  ResolutionError
>): Effect.Effect<V3SharedProgramProcessor<Model, Claim>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const initialObservationReadinessTimeoutMs =
      configuredInitialObservationReadinessTimeoutMs !== undefined &&
      Number.isFinite(configuredInitialObservationReadinessTimeoutMs) &&
      configuredInitialObservationReadinessTimeoutMs > 0
        ? configuredInitialObservationReadinessTimeoutMs
        : defaultInitialObservationReadinessTimeoutMs
    const ownerScope = yield* Effect.scope
    const lifecycleSemaphore = yield* Semaphore.make(1)
    const projectionSemaphore = yield* Semaphore.make(1)
    const submissionSemaphore = yield* Semaphore.make(1)
    const initialModel = Tuple.get(admission.program.init(), 0)
    const acceptedProjectionRef = yield* SynchronizedRef.make<
      AcceptedProjectionState<Model>
    >({
      acceptedByOccurrenceId: HashMap.empty(),
      acceptedFingerprints: HashMap.empty(),
      acceptedProposalIds: HashSet.empty(),
      model: initialModel,
      proposalDependencies: HashMap.empty(),
      revision: 0,
      throughAcceptedSequence: 0,
    })
    const pendingProjectionRef = yield* SynchronizedRef.make<
      PendingProjectionState<Model>
    >({
      acceptedRevision: 0,
      model: initialModel,
      pendingClaims: [],
      proposalFingerprints: [],
      sessionPolicyFingerprint: 'NeverConfirmed',
    })
    const localPendingRef = yield* SynchronizedRef.make<
      ReadonlyArray<LocalPending>
    >([])
    const observedStateRef = yield* SynchronizedRef.make<ObservedState>({
      accepted: [],
      connectionStatus: 'Closed',
      programSessions: [],
      proposals: [],
      resolutions: [],
    })
    const sessionPolicyCacheRef =
      yield* SynchronizedRef.make<SessionPolicyCache>({
        _tag: 'NeverConfirmed',
      })
    const observerFiberRef = yield* SynchronizedRef.make<
      Option.Option<ObserverHandle>
    >(Option.none())
    const observerGenerationRef = yield* SynchronizedRef.make(0)
    const isConnectedRef = yield* SynchronizedRef.make(false)
    const snapshotRef = yield* SubscriptionRef.make<
      V3SharedProgramProcessorSnapshot<Model>
    >({
      acceptedModel: initialModel,
      activeProgramSession: Option.none(),
      activeSessionPolicy: Option.none(),
      connection: V3Detached.make({}),
      lastError: Option.none(),
      optimisticModel: initialModel,
      pendingClaims: [],
      recentTerminalClaims: [],
      throughAcceptedSequence: 0,
      waitingForAcceptedSequence: Option.some(1),
    })

    const invocationFacts = (
      proposal: InstantV3OrdinaryMessageProposalRecordType,
    ): V3SharedProgramInvocationFacts =>
      V3SharedProgramInvocationFacts.make({
        actorId: proposal.actorId,
        clientId: proposal.clientId,
        occurrenceId: proposal.occurrenceId,
        originatingProcessorId: proposal.originatingProcessorId,
        sessionId: proposal.sessionId,
        subjectId: proposal.subjectId,
      })

    const decodeClaim = (
      proposal: InstantV3OrdinaryMessageProposalRecordType,
    ): Effect.Effect<Claim, V3SharedProgramAdmissionClaimError> =>
      Effect.gen(function* () {
        const json = yield* Effect.try({
          try: () => JSON.parse(proposal.admissionClaimJson),
          catch: cause =>
            new V3SharedProgramAdmissionClaimError({
              cause,
              operation: 'Decode',
              proposalId: proposal.proposalId,
            }),
        })
        const decoded = yield* Effect.try({
          try: () => admission.decodeClaim(json),
          catch: cause =>
            new V3SharedProgramAdmissionClaimError({
              cause,
              operation: 'Decode',
              proposalId: proposal.proposalId,
            }),
        })
        if (Result.isFailure(decoded)) {
          return yield* Effect.fail(
            new V3SharedProgramAdmissionClaimError({
              cause: decoded.failure,
              operation: 'Decode',
              proposalId: proposal.proposalId,
            }),
          )
        }
        return decoded.success
      })

    const resolveClaim = (
      model: Model,
      proposal: InstantV3OrdinaryMessageProposalRecordType,
    ): Effect.Effect<
      Message,
      | V3SharedProgramAdmissionClaimError
      | V3SharedProgramAdmissionResolutionError
      | V3SharedProgramOriginProofError
    > =>
      Effect.gen(function* () {
        yield* verifyOriginOrdinaryMessageProposal(proposal, {
          clientId: origin.clientId,
          instantAppId: scope.instantAppId,
          originDeviceId: origin.originDeviceId,
          originPolicyGeneration: origin.originPolicyGeneration,
          originPolicyId: origin.originPolicyId,
          originatingProcessorId: origin.originatingProcessorId,
          programId: scope.programId,
          programVersion: scope.programVersion,
          protocolVersion: scope.protocolVersion,
          sessionId: scope.sessionId,
          subjectId: scope.subjectId,
        }).pipe(
          Effect.mapError(
            cause =>
              new V3SharedProgramOriginProofError({
                cause,
                proposalId: proposal.proposalId,
              }),
          ),
        )
        const claim = yield* decodeClaim(proposal)
        const resolved = yield* Effect.try({
          try: () => admission.resolve(model, claim, invocationFacts(proposal)),
          catch: cause =>
            new V3SharedProgramAdmissionResolutionError({
              cause,
              occurrenceId: proposal.occurrenceId,
              proposalId: proposal.proposalId,
            }),
        })
        if (Result.isFailure(resolved)) {
          return yield* Effect.fail(
            new V3SharedProgramAdmissionResolutionError({
              cause: resolved.failure,
              occurrenceId: proposal.occurrenceId,
              proposalId: proposal.proposalId,
            }),
          )
        }
        return resolved.success
      })

    const validatePendingMessage = (
      model: Model,
      proposal: InstantV3OrdinaryMessageProposalRecordType,
    ): Effect.Effect<
      Message,
      | V3SharedProgramAdmissionClaimError
      | V3SharedProgramAdmissionResolutionError
      | V3SharedProgramMessageProtocolError
      | V3SharedProgramOriginProofError
    > =>
      Effect.gen(function* () {
        const resolved = yield* resolveClaim(model, proposal)
        const decoded = yield* messageProtocol.decodeProposed(proposal)
        const canonicalResolved = yield* messageProtocol.encodeProposed(
          resolved,
          proposedEnvelopeFromProposal(proposal),
        )
        const canonicalDecoded = yield* messageProtocol.encodeProposed(
          decoded,
          proposedEnvelopeFromProposal(proposal),
        )
        if (
          canonicalResolved.payloadJson !== canonicalDecoded.payloadJson ||
          canonicalResolved.payloadJson !== proposal.payloadJson ||
          canonicalResolved.envelopeJson !== proposal.envelopeJson
        ) {
          return yield* Effect.fail(
            new V3SharedProgramMessageProtocolError({
              cause: new Error(
                'Resolved Message does not match the signed proposal wire value.',
              ),
              operation: 'DecodeProposed',
            }),
          )
        }
        return resolved
      })

    const audienceEquivalence = S.toEquivalence(Synchronization.Audience)
    const sessionPolicyEquivalence = S.toEquivalence(
      Synchronization.SessionPolicy,
    )

    const validateProgramSessionHistory = (
      rows: ReadonlyArray<InstantV3ProgramSessionRecord>,
    ): Effect.Effect<
      Option.Option<InstantV3ProgramSessionRecord>,
      V3SharedProgramSessionHistoryError
    > =>
      Effect.gen(function* () {
        const sorted = Array.sort(rows, programSessionOrder)
        const maybeFirst = Array.head(sorted)
        if (Option.isNone(maybeFirst)) {
          return Option.none()
        }
        let expectedLifecycleGeneration = 1
        let maybePrevious = Option.none<InstantV3ProgramSessionRecord>()
        for (const session of sorted) {
          if (!isSameScope(scope, session)) {
            return yield* Effect.fail(
              new V3SharedProgramSessionHistoryError({
                reason: 'ScopeMismatch',
                recordId: session.id,
              }),
            )
          }
          if (session.lifecycleGeneration !== expectedLifecycleGeneration) {
            return yield* Effect.fail(
              new V3SharedProgramSessionHistoryError({
                reason:
                  session.lifecycleGeneration < expectedLifecycleGeneration
                    ? 'ConflictingGeneration'
                    : 'LifecycleGenerationNotSequential',
                recordId: session.id,
              }),
            )
          }
          if (Option.isNone(maybePrevious)) {
            if (
              session.lifecycleState !== 'Active' ||
              session.previousLifecyclePositionKey !== null
            ) {
              return yield* Effect.fail(
                new V3SharedProgramSessionHistoryError({
                  reason: 'LifecycleGenerationNotSequential',
                  recordId: session.id,
                }),
              )
            }
          } else {
            const previous = maybePrevious.value
            if (previous.lifecycleState === 'Revoked') {
              return yield* Effect.fail(
                new V3SharedProgramSessionHistoryError({
                  reason: 'SessionPermanentlyRevoked',
                  recordId: session.id,
                }),
              )
            }
            if (
              session.previousLifecyclePositionKey !==
                previous.lifecyclePositionKey ||
              session.authorityProcessorId !== previous.authorityProcessorId ||
              session.processorRoomId !== previous.processorRoomId ||
              session.originPolicyProtocolVersion !==
                previous.originPolicyProtocolVersion ||
              session.createdAtMs < previous.createdAtMs
            ) {
              return yield* Effect.fail(
                new V3SharedProgramSessionHistoryError({
                  reason: 'ScopeMismatch',
                  recordId: session.id,
                }),
              )
            }
            if (session.lifecycleState === 'Revoked') {
              if (
                !sessionPolicyEquivalence(
                  session.sessionPolicy,
                  previous.sessionPolicy,
                )
              ) {
                return yield* Effect.fail(
                  new V3SharedProgramSessionHistoryError({
                    reason: 'RevocationPolicyChanged',
                    recordId: session.id,
                  }),
                )
              }
            } else if (
              session.sessionPolicy.generation !==
              previous.sessionPolicy.generation + 1
            ) {
              return yield* Effect.fail(
                new V3SharedProgramSessionHistoryError({
                  reason: 'PolicyGenerationNotSequential',
                  recordId: session.id,
                }),
              )
            }
          }
          maybePrevious = Option.some(session)
          expectedLifecycleGeneration += 1
        }
        return maybePrevious
      })

    const sessionPolicyCacheFor = (
      rows: ReadonlyArray<InstantV3ProgramSessionRecord>,
    ): Effect.Effect<SessionPolicyCache, V3SharedProgramSessionHistoryError> =>
      Effect.gen(function* () {
        const result = yield* Effect.result(validateProgramSessionHistory(rows))
        if (Result.isFailure(result)) {
          return yield* Effect.fail(result.failure)
        }
        if (Option.isSome(result.success)) {
          const session = result.success.value
          if (session.lifecycleState === 'Active') {
            return {
              _tag: 'Active',
              policy: session.sessionPolicy,
              session: V3SharedProgramActiveSession.make({
                lifecycleGeneration: session.lifecycleGeneration,
                lifecyclePositionKey: session.lifecyclePositionKey,
                lifecycleState: session.lifecycleState,
                sessionPolicy: session.sessionPolicy,
              }),
            }
          } else {
            return { _tag: 'Revoked' }
          }
        } else {
          return { _tag: 'NeverConfirmed' }
        }
      })

    const preflightSynchronizationWithCache = (
      cache: SessionPolicyCache,
      message: Message,
    ): Effect.Effect<
      void,
      | V3SharedProgramSessionPolicyUnavailable
      | V3SharedProgramSynchronizationPreflightError
    > =>
      Effect.gen(function* () {
        if (cache._tag !== 'Active') {
          return yield* Effect.fail(
            new V3SharedProgramSessionPolicyUnavailable({
              reason: cache._tag,
            }),
          )
        }
        const synchronization = admission.program.synchronization
        let messageCategory: Synchronization.MessageCategory
        if (synchronization === undefined) {
          if (cache.policy.mode._tag !== 'Mirror') {
            return yield* Effect.fail(
              new V3SharedProgramSynchronizationPreflightError({
                cause: new Error(
                  'A partitioned session requires Program synchronization metadata.',
                ),
                reason: 'MissingProgramSynchronization',
              }),
            )
          }
          messageCategory = 'Domain'
        } else {
          messageCategory = yield* Effect.try({
            try: () =>
              S.decodeUnknownSync(Synchronization.MessageCategory)(
                synchronization.messageCategory(message),
              ),
            catch: cause =>
              new V3SharedProgramSynchronizationPreflightError({
                cause,
                reason: 'ProgramSynchronizationDefect',
              }),
          })
        }
        const decision = Synchronization.resolveAudience(
          cache.policy,
          messageCategory,
          origin.originatingProcessorId,
        )
        if (decision._tag === 'ReadOnlyFollowerRejected') {
          return yield* Effect.fail(
            new V3SharedProgramSynchronizationPreflightError({
              cause: decision,
              reason: 'ReadOnlyFollower',
            }),
          )
        }
      })

    const preflightSynchronization = (
      message: Message,
    ): Effect.Effect<
      void,
      | V3SharedProgramSessionPolicyUnavailable
      | V3SharedProgramSynchronizationPreflightError
    > =>
      SynchronizedRef.get(sessionPolicyCacheRef).pipe(
        Effect.flatMap(cache =>
          preflightSynchronizationWithCache(cache, message),
        ),
      )

    const acceptedRoutingFailure = (
      occurrence: InstantV3AcceptedMessageOccurrenceRecord,
      reason: V3SharedProgramAcceptedRoutingError['reason'],
      cause: unknown,
    ): V3SharedProgramAcceptedRoutingError =>
      new V3SharedProgramAcceptedRoutingError({
        cause,
        occurrenceId: occurrence.occurrenceId,
        reason,
      })

    const validateOrdinaryAcceptedRouting = (
      message: Message,
      occurrence: Extract<
        InstantV3AcceptedMessageOccurrenceRecord,
        Readonly<{ proposalKind: 'OrdinaryMessage' }>
      >,
    ): Effect.Effect<void, V3SharedProgramAcceptedRoutingError> =>
      Effect.gen(function* () {
        if (
          occurrence.policyGeneration !== occurrence.sessionPolicy.generation
        ) {
          return yield* Effect.fail(
            acceptedRoutingFailure(
              occurrence,
              'PolicyGenerationMismatch',
              new Error(
                'Accepted policy generation does not match its session policy.',
              ),
            ),
          )
        }
        const synchronization = admission.program.synchronization
        if (synchronization === undefined) {
          if (occurrence.sessionPolicy.mode._tag !== 'Mirror') {
            return yield* Effect.fail(
              acceptedRoutingFailure(
                occurrence,
                'MissingProgramSynchronization',
                new Error(
                  'A partitioned session requires Program synchronization metadata.',
                ),
              ),
            )
          }
          if (
            !audienceEquivalence(
              occurrence.audience,
              Synchronization.SessionAudience.make({}),
            )
          ) {
            return yield* Effect.fail(
              acceptedRoutingFailure(
                occurrence,
                'AudienceMismatch',
                new Error('Mirror routing must use the session audience.'),
              ),
            )
          }
          return
        }
        const messageCategory = yield* Effect.try({
          try: () =>
            S.decodeUnknownSync(Synchronization.MessageCategory)(
              synchronization.messageCategory(message),
            ),
          catch: cause =>
            acceptedRoutingFailure(
              occurrence,
              'ProgramSynchronizationDefect',
              cause,
            ),
        })
        if (messageCategory !== occurrence.messageCategory) {
          return yield* Effect.fail(
            acceptedRoutingFailure(
              occurrence,
              'MessageCategoryMismatch',
              new Error(
                'Accepted category does not match the Program classification.',
              ),
            ),
          )
        }
        const decision = Synchronization.resolveAudience(
          occurrence.sessionPolicy,
          messageCategory,
          occurrence.originatingProcessorId,
        )
        if (decision._tag === 'ReadOnlyFollowerRejected') {
          return yield* Effect.fail(
            acceptedRoutingFailure(
              occurrence,
              'ReadOnlyFollower',
              new Error(
                'A read-only follower cannot originate followed navigation.',
              ),
            ),
          )
        }
        if (!audienceEquivalence(occurrence.audience, decision)) {
          return yield* Effect.fail(
            acceptedRoutingFailure(
              occurrence,
              'AudienceMismatch',
              new Error(
                'Accepted audience does not match the Program synchronization policy.',
              ),
            ),
          )
        }
      })

    const acceptedOrdinaryMatchesProposal = (
      occurrence: Extract<
        InstantV3AcceptedMessageOccurrenceRecord,
        Readonly<{ proposalKind: 'OrdinaryMessage' }>
      >,
      proposal: InstantV3OrdinaryMessageProposalRecordType,
    ): boolean =>
      isSameScope(scope, proposal) &&
      occurrence.actorId === proposal.actorId &&
      occurrence.actorSequence === proposal.actorSequence &&
      occurrence.causationId === proposal.causationOccurrenceId &&
      occurrence.clientId === proposal.clientId &&
      occurrence.correlationId === proposal.correlationId &&
      occurrence.createdAtMs === proposal.createdAtMs &&
      occurrence.envelopeVersion === proposal.envelopeVersion &&
      occurrence.eventId === proposal.eventId &&
      occurrence.eventVersion === proposal.eventVersion &&
      occurrence.occurrenceId === proposal.occurrenceId &&
      occurrence.originDeviceId === proposal.originDeviceId &&
      occurrence.originatingProcessorId === proposal.originatingProcessorId &&
      occurrence.payloadJson === proposal.payloadJson &&
      occurrence.proposedEnvelopeJson === proposal.envelopeJson &&
      occurrence.proposalId === proposal.proposalId &&
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

    const validateEffectResultAcceptedRouting = (
      occurrence: Extract<
        InstantV3AcceptedMessageOccurrenceRecord,
        Readonly<{ proposalKind: 'EffectResult' }>
      >,
      acceptedByOccurrenceId: HashMap.HashMap<
        string,
        InstantV3AcceptedMessageOccurrenceRecord
      >,
      proposalsById: HashMap.HashMap<string, InstantV3MessageProposalRecord>,
    ): Effect.Effect<boolean, V3SharedProgramAcceptedRoutingError> =>
      Effect.gen(function* () {
        const maybeCausal = HashMap.get(
          acceptedByOccurrenceId,
          occurrence.causalOccurrenceId,
        )
        if (Option.isNone(maybeCausal)) {
          return yield* Effect.fail(
            acceptedRoutingFailure(
              occurrence,
              'MissingCausalOccurrence',
              new Error(
                'An effect result must follow its causal accepted occurrence.',
              ),
            ),
          )
        }
        const causal = maybeCausal.value
        const causalOriginPolicy =
          causal.proposalKind === 'OrdinaryMessage'
            ? {
                generation: causal.originPolicyGeneration,
                originPolicyId: causal.originPolicyId,
              }
            : {
                generation: causal.executorOriginPolicyGeneration,
                originPolicyId: causal.executorOriginPolicyId,
              }
        const causalOriginProofDigest =
          causal.proposalKind === 'OrdinaryMessage'
            ? yield* Effect.gen(function* () {
                const maybeProposal = HashMap.get(
                  proposalsById,
                  causal.proposalId,
                )
                if (Option.isNone(maybeProposal)) {
                  return Option.none<string>()
                }
                if (
                  maybeProposal.value.proposalKind !== 'OrdinaryMessage' ||
                  !acceptedOrdinaryMatchesProposal(causal, maybeProposal.value)
                ) {
                  return yield* Effect.fail(
                    acceptedRoutingFailure(
                      occurrence,
                      'CausalLineageMismatch',
                      new Error(
                        'The causal accepted occurrence does not join its original proposal.',
                      ),
                    ),
                  )
                }
                const digest = yield* digestOriginOrdinaryMessageProposalProof(
                  maybeProposal.value,
                ).pipe(
                  Effect.mapError(cause =>
                    acceptedRoutingFailure(
                      occurrence,
                      'CausalLineageMismatch',
                      cause,
                    ),
                  ),
                )
                return Option.some<string>(digest)
              })
            : Option.some<string>(causal.causalOriginProofDigest)
        if (Option.isNone(causalOriginProofDigest)) {
          return false
        }
        if (
          occurrence.causationId !== causal.occurrenceId ||
          occurrence.causalAcceptedSequence !== causal.acceptedSequence ||
          !audienceEquivalence(occurrence.causalAudience, causal.audience) ||
          occurrence.causalMessageCategory !== causal.messageCategory ||
          occurrence.causalOccurrenceId !== causal.occurrenceId ||
          occurrence.causalOriginDeviceId !== causal.originDeviceId ||
          occurrence.causalOriginPolicyGeneration !==
            causalOriginPolicy.generation ||
          occurrence.causalOriginPolicyId !==
            causalOriginPolicy.originPolicyId ||
          occurrence.causalOriginProofDigest !==
            causalOriginProofDigest.value ||
          occurrence.causalOriginatingProcessorId !==
            causal.originatingProcessorId ||
          occurrence.causalPolicyGeneration !== causal.policyGeneration ||
          occurrence.causalProposalId !== causal.proposalId
        ) {
          return yield* Effect.fail(
            acceptedRoutingFailure(
              occurrence,
              'CausalLineageMismatch',
              new Error(
                'Effect-result causal routing or origin lineage does not match.',
              ),
            ),
          )
        }
        if (occurrence.messageCategory !== causal.messageCategory) {
          return yield* Effect.fail(
            acceptedRoutingFailure(
              occurrence,
              'MessageCategoryMismatch',
              new Error(
                'An effect result must inherit its causal Message category.',
              ),
            ),
          )
        }
        if (!audienceEquivalence(occurrence.audience, causal.audience)) {
          return yield* Effect.fail(
            acceptedRoutingFailure(
              occurrence,
              'AudienceMismatch',
              new Error(
                'An effect result must inherit its causal frozen audience.',
              ),
            ),
          )
        }
        if (occurrence.policyGeneration !== causal.policyGeneration) {
          return yield* Effect.fail(
            acceptedRoutingFailure(
              occurrence,
              'PolicyGenerationMismatch',
              new Error(
                'An effect result must inherit its causal policy generation.',
              ),
            ),
          )
        }
        if (
          !sessionPolicyEquivalence(
            occurrence.sessionPolicy,
            causal.sessionPolicy,
          )
        ) {
          return yield* Effect.fail(
            acceptedRoutingFailure(
              occurrence,
              'SessionPolicyMismatch',
              new Error(
                'An effect result must inherit its causal session policy.',
              ),
            ),
          )
        }
        return true
      })

    const projectAccepted = (
      rows: ReadonlyArray<InstantV3AcceptedMessageOccurrenceRecord>,
      proposals: ReadonlyArray<InstantV3MessageProposalRecord>,
    ): Effect.Effect<
      Readonly<{
        acceptedProposalIds: HashSet.HashSet<string>
        model: Model
        revision: number
        throughAcceptedSequence: number
        waitingForAcceptedSequence: Option.Option<number>
      }>,
      V3SharedProgramProcessorError
    > =>
      Effect.gen(function* () {
        const sorted = Array.sort(rows, acceptedOrder)
        let proposalsById = HashMap.empty<
          string,
          InstantV3MessageProposalRecord
        >()
        for (const proposal of proposals) {
          if (!HashMap.has(proposalsById, proposal.proposalId)) {
            proposalsById = HashMap.set(
              proposalsById,
              proposal.proposalId,
              proposal,
            )
          }
        }
        const cached = yield* SynchronizedRef.get(acceptedProjectionRef)
        let isCachedPrefixCurrent = true
        let expectedCachedSequence = 1
        for (const occurrence of sorted) {
          if (occurrence.acceptedSequence > cached.throughAcceptedSequence) {
            break
          }
          const maybeFingerprint = HashMap.get(
            cached.acceptedFingerprints,
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
        if (expectedCachedSequence - 1 !== cached.throughAcceptedSequence) {
          isCachedPrefixCurrent = false
        }
        if (isCachedPrefixCurrent) {
          for (const [proposalId, fingerprint] of cached.proposalDependencies) {
            const maybeProposal = HashMap.get(proposalsById, proposalId)
            if (
              Option.isNone(maybeProposal) ||
              encodeObservedProposal(maybeProposal.value) !== fingerprint
            ) {
              isCachedPrefixCurrent = false
              break
            }
          }
        }
        const base: AcceptedProjectionState<Model> = isCachedPrefixCurrent
          ? cached
          : {
              acceptedByOccurrenceId: HashMap.empty(),
              acceptedFingerprints: HashMap.empty(),
              acceptedProposalIds: HashSet.empty(),
              model: initialModel,
              proposalDependencies: HashMap.empty(),
              revision: cached.revision + 1,
              throughAcceptedSequence: 0,
            }
        let model = base.model
        let expectedSequence = base.throughAcceptedSequence + 1
        let acceptedByOccurrenceId = base.acceptedByOccurrenceId
        let acceptedFingerprints = base.acceptedFingerprints
        let seenProposalIds = base.acceptedProposalIds
        let proposalDependencies = base.proposalDependencies
        for (const occurrence of sorted) {
          if (occurrence.acceptedSequence < expectedSequence) {
            if (
              base.throughAcceptedSequence > 0 &&
              occurrence.acceptedSequence <= base.throughAcceptedSequence
            ) {
              continue
            }
            return yield* Effect.fail(
              new V3SharedProgramAcceptedHistoryError({
                acceptedSequence: occurrence.acceptedSequence,
                reason: 'ConflictingSequence',
                recordId: occurrence.id,
              }),
            )
          }
          if (!isSameScope(scope, occurrence)) {
            return yield* Effect.fail(
              new V3SharedProgramScopeMismatch({ recordId: occurrence.id }),
            )
          }
          if (occurrence.acceptedSequence > expectedSequence) {
            break
          }
          if (occurrence.acceptedSequence < expectedSequence) {
            return yield* Effect.fail(
              new V3SharedProgramAcceptedHistoryError({
                acceptedSequence: occurrence.acceptedSequence,
                reason: 'ConflictingSequence',
                recordId: occurrence.id,
              }),
            )
          }
          if (HashSet.has(seenProposalIds, occurrence.proposalId)) {
            return yield* Effect.fail(
              new V3SharedProgramAcceptedHistoryError({
                acceptedSequence: occurrence.acceptedSequence,
                reason: 'DuplicateProposal',
                recordId: occurrence.id,
              }),
            )
          }
          const message = yield* messageProtocol.decodeAccepted(occurrence)
          if (occurrence.proposalKind === 'OrdinaryMessage') {
            yield* validateOrdinaryAcceptedRouting(message, occurrence)
          } else {
            const isReady = yield* validateEffectResultAcceptedRouting(
              occurrence,
              acceptedByOccurrenceId,
              proposalsById,
            )
            if (!isReady) {
              break
            }
            const maybeCausal = HashMap.get(
              acceptedByOccurrenceId,
              occurrence.causalOccurrenceId,
            )
            if (
              Option.isSome(maybeCausal) &&
              maybeCausal.value.proposalKind === 'OrdinaryMessage'
            ) {
              const maybeProposal = HashMap.get(
                proposalsById,
                maybeCausal.value.proposalId,
              )
              if (Option.isSome(maybeProposal)) {
                proposalDependencies = HashMap.set(
                  proposalDependencies,
                  maybeProposal.value.proposalId,
                  encodeObservedProposal(maybeProposal.value),
                )
              }
            }
          }
          if (
            Synchronization.includesProcessor(
              occurrence.audience,
              origin.originatingProcessorId,
            )
          ) {
            model = yield* updateProgram(
              admission.program,
              model,
              message,
              occurrence.occurrenceId,
              'Accepted',
            )
          }
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
          seenProposalIds = HashSet.add(seenProposalIds, occurrence.proposalId)
          expectedSequence += 1
        }
        const revision =
          expectedSequence - 1 === base.throughAcceptedSequence
            ? base.revision
            : base.revision + 1
        yield* SynchronizedRef.set(acceptedProjectionRef, {
          acceptedByOccurrenceId,
          acceptedFingerprints,
          acceptedProposalIds: seenProposalIds,
          model,
          proposalDependencies,
          revision,
          throughAcceptedSequence: expectedSequence - 1,
        })
        return {
          acceptedProposalIds: seenProposalIds,
          model,
          revision,
          throughAcceptedSequence: expectedSequence - 1,
          waitingForAcceptedSequence: Option.some(expectedSequence),
        }
      })

    const localObservedProposals = (
      proposals: ReadonlyArray<InstantV3MessageProposalRecord>,
    ): ReadonlyArray<InstantV3OrdinaryMessageProposalRecordType> =>
      Array.filter(
        proposals,
        (proposal): proposal is InstantV3OrdinaryMessageProposalRecordType =>
          proposal.proposalKind === 'OrdinaryMessage' &&
          proposal.actorId === origin.actorId &&
          proposal.clientId === origin.clientId &&
          proposal.originDeviceId === origin.originDeviceId &&
          proposal.originatingProcessorId === origin.originatingProcessorId &&
          isSameScope(scope, proposal),
      )

    const mergePending = (
      local: ReadonlyArray<LocalPending>,
      observed: ReadonlyArray<InstantV3OrdinaryMessageProposalRecordType>,
    ): Effect.Effect<
      ReadonlyArray<LocalPending>,
      V3SharedProgramProposalConflict
    > =>
      Effect.gen(function* () {
        const merged: Array<LocalPending> = []
        let pendingByProposalId = HashMap.empty<string, LocalPending>()
        for (const entry of local) {
          if (entry.source === 'Local') {
            merged.push(entry)
            if (!HashMap.has(pendingByProposalId, entry.proposal.proposalId)) {
              pendingByProposalId = HashMap.set(
                pendingByProposalId,
                entry.proposal.proposalId,
                entry,
              )
            }
          }
        }
        for (const proposal of observed) {
          const maybeExisting = HashMap.get(
            pendingByProposalId,
            proposal.proposalId,
          )
          if (Option.isNone(maybeExisting)) {
            const entry: LocalPending = {
              persistence: 'Observed',
              proposal,
              source: 'Observed',
            }
            merged.push(entry)
            pendingByProposalId = HashMap.set(
              pendingByProposalId,
              proposal.proposalId,
              entry,
            )
          } else if (
            maybeExisting.value.proposal.originProposalSignature !==
              proposal.originProposalSignature ||
            maybeExisting.value.proposal.payloadJson !== proposal.payloadJson ||
            maybeExisting.value.proposal.envelopeJson !== proposal.envelopeJson
          ) {
            return yield* Effect.fail(
              new V3SharedProgramProposalConflict({
                proposalId: proposal.proposalId,
              }),
            )
          }
        }
        return Array.sort(merged, pendingOrder)
      })

    const unresolvedPending = (
      pending: ReadonlyArray<LocalPending>,
      resolutions: ReadonlyArray<InstantV3MessageProposalResolutionRecord>,
      accepted: ReadonlyArray<InstantV3AcceptedMessageOccurrenceRecord>,
      throughAcceptedSequence: number,
    ): Effect.Effect<
      ReadonlyArray<LocalPending>,
      V3SharedProgramResolutionMismatch | V3SharedProgramScopeMismatch
    > =>
      Effect.gen(function* () {
        let resolutionsByProposalId = HashMap.empty<
          string,
          ReadonlyArray<InstantV3MessageProposalResolutionRecord>
        >()
        for (const resolution of resolutions) {
          const maybeCurrent = HashMap.get(
            resolutionsByProposalId,
            resolution.proposalId,
          )
          resolutionsByProposalId = HashMap.set(
            resolutionsByProposalId,
            resolution.proposalId,
            Option.isSome(maybeCurrent)
              ? Array.append(maybeCurrent.value, resolution)
              : [resolution],
          )
        }
        let acceptedByReference = HashMap.empty<
          string,
          ReadonlyArray<InstantV3AcceptedMessageOccurrenceRecord>
        >()
        let acceptedProposalIds = HashSet.empty<string>()
        for (const occurrence of accepted) {
          const referenceKey = stringifyInstantV3CanonicalJson([
            occurrence.id,
            occurrence.positionKey,
          ])
          const maybeCurrent = HashMap.get(acceptedByReference, referenceKey)
          acceptedByReference = HashMap.set(
            acceptedByReference,
            referenceKey,
            Option.isSome(maybeCurrent)
              ? Array.append(maybeCurrent.value, occurrence)
              : [occurrence],
          )
          acceptedProposalIds = HashSet.add(
            acceptedProposalIds,
            occurrence.proposalId,
          )
        }
        const unresolved: Array<LocalPending> = []
        for (const entry of pending) {
          const maybeMatching = HashMap.get(
            resolutionsByProposalId,
            entry.proposal.proposalId,
          )
          if (Option.isNone(maybeMatching)) {
            unresolved.push(entry)
            continue
          }
          const matching = maybeMatching.value
          const maybeResolution = Array.head(matching)
          if (Option.isNone(maybeResolution)) {
            unresolved.push(entry)
            continue
          }
          const resolution = maybeResolution.value
          if (!isSameScope(scope, resolution)) {
            return yield* Effect.fail(
              new V3SharedProgramScopeMismatch({ recordId: resolution.id }),
            )
          }
          if (
            Option.isSome(Array.get(matching, 1)) ||
            !proposalResolutionMatches(entry.proposal, resolution)
          ) {
            return yield* Effect.fail(
              new V3SharedProgramResolutionMismatch({
                proposalId: entry.proposal.proposalId,
              }),
            )
          }
          if (resolution.resolutionState === 'Accepted') {
            const referenceKey = stringifyInstantV3CanonicalJson([
              resolution.acceptedMessageOccurrenceId,
              resolution.acceptedMessageOccurrencePositionKey,
            ])
            const maybeReferencedOccurrences = HashMap.get(
              acceptedByReference,
              referenceKey,
            )
            if (Option.isNone(maybeReferencedOccurrences)) {
              if (HashSet.has(acceptedProposalIds, entry.proposal.proposalId)) {
                return yield* Effect.fail(
                  new V3SharedProgramResolutionMismatch({
                    proposalId: entry.proposal.proposalId,
                  }),
                )
              }
              unresolved.push(entry)
              continue
            }
            const referencedOccurrences = maybeReferencedOccurrences.value
            const maybeOccurrence = Array.head(referencedOccurrences)
            if (Option.isNone(maybeOccurrence)) {
              unresolved.push(entry)
              continue
            }
            const occurrence = maybeOccurrence.value
            if (
              Option.isSome(Array.get(referencedOccurrences, 1)) ||
              !isSameScope(scope, occurrence) ||
              occurrence.proposalKind !== 'OrdinaryMessage' ||
              !acceptedOrdinaryMatchesProposal(occurrence, entry.proposal)
            ) {
              return yield* Effect.fail(
                new V3SharedProgramResolutionMismatch({
                  proposalId: entry.proposal.proposalId,
                }),
              )
            }
            if (occurrence.acceptedSequence > throughAcceptedSequence) {
              unresolved.push(entry)
            }
          }
        }
        return unresolved
      })

    const projectPending = (
      acceptedModel: Model,
      acceptedProposalIds: HashSet.HashSet<string>,
      acceptedRevision: number,
      pending: ReadonlyArray<LocalPending>,
      sessionPolicyCache: SessionPolicyCache,
    ): Effect.Effect<
      Readonly<{
        model: Model
        pendingClaims: ReadonlyArray<V3PendingProgramClaim>
      }>,
      V3SharedProgramUpdateError
    > =>
      Effect.gen(function* () {
        const sorted = Array.sort(pending, pendingOrder)
        const cached = yield* SynchronizedRef.get(pendingProjectionRef)
        const sessionPolicyFingerprint =
          sessionPolicyCache._tag === 'Active'
            ? encodeSessionPolicy(sessionPolicyCache.policy)
            : sessionPolicyCache._tag
        const cachedClaimCount = Array.length(cached.pendingClaims)
        const cachedPrefix = Array.take(sorted, cachedClaimCount)
        const isCachedPrefixCurrent =
          cached.acceptedRevision === acceptedRevision &&
          cached.sessionPolicyFingerprint === sessionPolicyFingerprint &&
          Array.length(cachedPrefix) === cachedClaimCount &&
          Array.every(
            Array.zip(cachedPrefix, cached.proposalFingerprints),
            ([entry, fingerprint]) =>
              encodeObservedProposal(entry.proposal) === fingerprint,
          )
        let model = isCachedPrefixCurrent ? cached.model : acceptedModel
        const pendingClaims: Array<V3PendingProgramClaim> =
          isCachedPrefixCurrent
            ? Array.zipWith(
                cached.pendingClaims,
                cachedPrefix,
                (claim, entry) => ({
                  ...claim,
                  persistence: entry.persistence,
                  proposal: entry.proposal,
                }),
              )
            : []
        const suffix = isCachedPrefixCurrent
          ? Array.drop(sorted, cachedClaimCount)
          : sorted
        for (const entry of suffix) {
          if (HashSet.has(acceptedProposalIds, entry.proposal.proposalId)) {
            pendingClaims.push({
              authorityState: 'AwaitingAuthority',
              persistence: entry.persistence,
              projection: V3PendingProjectionAccepted.make({}),
              proposal: entry.proposal,
            })
            continue
          }
          const resolved = yield* Effect.result(
            validatePendingMessage(model, entry.proposal),
          )
          if (Result.isFailure(resolved)) {
            pendingClaims.push({
              authorityState: 'AwaitingAuthority',
              persistence: entry.persistence,
              projection: V3PendingProjectionStale.make({
                failureTag: failureTag(resolved.failure),
              }),
              proposal: entry.proposal,
            })
          } else {
            const synchronizationPreflight = yield* Effect.result(
              preflightSynchronizationWithCache(
                sessionPolicyCache,
                resolved.success,
              ),
            )
            if (Result.isFailure(synchronizationPreflight)) {
              pendingClaims.push({
                authorityState: 'AwaitingAuthority',
                persistence: entry.persistence,
                projection: V3PendingProjectionStale.make({
                  failureTag: failureTag(synchronizationPreflight.failure),
                }),
                proposal: entry.proposal,
              })
            } else {
              model = yield* updateProgram(
                admission.program,
                model,
                resolved.success,
                entry.proposal.occurrenceId,
                'Optimistic',
              )
              pendingClaims.push({
                authorityState: 'AwaitingAuthority',
                persistence: entry.persistence,
                projection: V3PendingProjectionApplied.make({}),
                proposal: entry.proposal,
              })
            }
          }
        }
        yield* SynchronizedRef.set(pendingProjectionRef, {
          acceptedRevision,
          model,
          pendingClaims,
          proposalFingerprints: Array.map(sorted, entry =>
            encodeObservedProposal(entry.proposal),
          ),
          sessionPolicyFingerprint,
        })
        return { model, pendingClaims }
      })

    const setLastError = (
      error: V3SharedProgramProcessorError,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const sessionPolicyCache = yield* SynchronizedRef.get(
          sessionPolicyCacheRef,
        )
        yield* SubscriptionRef.update(snapshotRef, snapshot => ({
          ...snapshot,
          activeProgramSession:
            sessionPolicyCache._tag === 'Active'
              ? Option.some(sessionPolicyCache.session)
              : Option.none(),
          activeSessionPolicy:
            sessionPolicyCache._tag === 'Active'
              ? Option.some(sessionPolicyCache.policy)
              : Option.none(),
          lastError: Option.some(error),
        }))
      })

    const setReconciliationError = (
      error: V3SharedProgramProcessorError,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        yield* SynchronizedRef.set(sessionPolicyCacheRef, {
          _tag: 'InvalidHistory',
        })
        yield* SubscriptionRef.update(snapshotRef, snapshot => ({
          ...snapshot,
          activeProgramSession: Option.none(),
          activeSessionPolicy: Option.none(),
          lastError: Option.some(error),
        }))
      })

    const reconcile: Effect.Effect<
      V3SharedProgramProcessorSnapshot<Model>,
      V3SharedProgramProcessorError
    > = projectionSemaphore.withPermit(
      Effect.gen(function* () {
        const observed = yield* SynchronizedRef.get(observedStateRef)
        const sessionPolicyCache = yield* sessionPolicyCacheFor(
          observed.programSessions,
        )
        const accepted = yield* projectAccepted(
          observed.accepted,
          observed.proposals,
        )
        const local = yield* SynchronizedRef.get(localPendingRef)
        const merged = yield* mergePending(
          local,
          localObservedProposals(observed.proposals),
        )
        const unresolved = yield* unresolvedPending(
          merged,
          observed.resolutions,
          observed.accepted,
          accepted.throughAcceptedSequence,
        )
        const pendingProjection = yield* projectPending(
          accepted.model,
          accepted.acceptedProposalIds,
          accepted.revision,
          unresolved,
          sessionPolicyCache,
        )
        const isConnected = yield* SynchronizedRef.get(isConnectedRef)
        const recentTerminalClaims = Array.take(
          Array.sort(
            Array.map(
              Array.filter(
                observed.resolutions,
                resolution =>
                  resolution.originatingProcessorId ===
                    origin.originatingProcessorId &&
                  resolution.proposalKind === 'OrdinaryMessage',
              ),
              resolution => ({
                maybeRejectionReason:
                  resolution.resolutionState === 'Rejected'
                    ? Option.some(resolution.rejectionReason)
                    : Option.none<string>(),
                proposalId: resolution.proposalId,
                resolutionState: resolution.resolutionState,
                resolvedAtMs:
                  resolution.resolutionState === 'Accepted'
                    ? resolution.acceptedAtMs
                    : resolution.rejectedAtMs,
              }),
            ),
            Order.mapInput(
              Order.flip(Order.Number),
              (claim: V3TerminalProgramClaim) => claim.resolvedAtMs,
            ),
          ),
          20,
        )
        const nextSnapshot: V3SharedProgramProcessorSnapshot<Model> = {
          acceptedModel: accepted.model,
          activeProgramSession:
            sessionPolicyCache._tag === 'Active'
              ? Option.some(sessionPolicyCache.session)
              : Option.none(),
          activeSessionPolicy:
            sessionPolicyCache._tag === 'Active'
              ? Option.some(sessionPolicyCache.policy)
              : Option.none(),
          connection: isConnected
            ? V3Attached.make({
                transportStatus: observed.connectionStatus,
              })
            : V3Detached.make({}),
          lastError: Option.none(),
          optimisticModel: pendingProjection.model,
          pendingClaims: pendingProjection.pendingClaims,
          recentTerminalClaims,
          throughAcceptedSequence: accepted.throughAcceptedSequence,
          waitingForAcceptedSequence: accepted.waitingForAcceptedSequence,
        }
        yield* SynchronizedRef.set(sessionPolicyCacheRef, sessionPolicyCache)
        yield* SynchronizedRef.set(localPendingRef, unresolved)
        yield* SubscriptionRef.set(snapshotRef, nextSnapshot)
        return nextSnapshot
      }),
    )

    const updateLocalPersistence = (
      proposalId: string,
      persistence: V3PendingProposalPersistence,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        yield* SynchronizedRef.update(localPendingRef, pending =>
          Array.map(pending, entry =>
            entry.proposal.proposalId === proposalId
              ? { ...entry, persistence, source: 'Local' }
              : entry,
          ),
        )
        yield* SubscriptionRef.update(snapshotRef, snapshot => ({
          ...snapshot,
          pendingClaims: Array.map(snapshot.pendingClaims, pending =>
            pending.proposal.proposalId === proposalId
              ? { ...pending, persistence }
              : pending,
          ),
        }))
      })

    const retainPendingLocally = (
      proposalId: string,
    ): Effect.Effect<Option.Option<RetainedPending>> =>
      projectionSemaphore.withPermit(
        Effect.gen(function* () {
          const pending = yield* SynchronizedRef.get(localPendingRef)
          const maybePending = Array.findFirst(
            pending,
            entry => entry.proposal.proposalId === proposalId,
          )
          if (Option.isNone(maybePending)) {
            return Option.none()
          }
          yield* SynchronizedRef.set(
            localPendingRef,
            Array.map(pending, entry =>
              entry.proposal.proposalId === proposalId
                ? { ...entry, source: 'Local' }
                : entry,
            ),
          )
          const snapshot = yield* SubscriptionRef.get(snapshotRef)
          const maybeClaim = Array.findFirst(
            snapshot.pendingClaims,
            claim => claim.proposal.proposalId === proposalId,
          )
          if (Option.isNone(maybeClaim)) {
            return Option.none()
          } else {
            return Option.some({
              projection: maybeClaim.value.projection,
              proposal: maybePending.value.proposal,
            })
          }
        }),
      )

    const persist = (
      proposal: InstantV3OrdinaryMessageProposalRecordType,
    ): Effect.Effect<
      Readonly<{
        outcome: V3ProgramStoreTransactionOutcome
        proposal: InstantV3OrdinaryMessageProposalRecordType
      }>,
      V3ProgramStoreAppendError
    > =>
      store.appendMessageProposal(proposal).pipe(
        Effect.tap(outcome =>
          updateLocalPersistence(
            proposal.proposalId,
            persistenceFromOutcome(outcome),
          ),
        ),
        Effect.map(outcome => ({ outcome, proposal })),
      )

    const persistWithReceipt = (
      retained: RetainedPending,
    ): Effect.Effect<
      V3SharedProgramSubmission,
      V3SharedProgramPersistenceError
    > =>
      persist(retained.proposal).pipe(
        Effect.map(persisted => ({
          ...persisted,
          projection: retained.projection,
        })),
        Effect.mapError(
          cause =>
            new V3SharedProgramPersistenceError({
              cause,
              persistence: 'Local',
              projection: retained.projection,
              proposal: retained.proposal,
            }),
        ),
      )

    const decodeGenerated = <Value>(
      schema: S.Codec<Value, unknown, never, never>,
      source: Effect.Effect<unknown, unknown>,
      identity: V3SharedProgramIdentityError['identity'],
    ): Effect.Effect<Value, V3SharedProgramIdentityError> =>
      source.pipe(
        Effect.flatMap(value => S.decodeUnknownEffect(schema)(value)),
        Effect.mapError(
          cause => new V3SharedProgramIdentityError({ cause, identity }),
        ),
      )

    const encodeClaim = (
      claim: Claim,
    ): Effect.Effect<string, V3SharedProgramAdmissionClaimError> =>
      Effect.try({
        try: () => {
          const encoded = S.encodeUnknownSync(admission.Claim)(claim)
          const json = S.decodeUnknownSync(S.Json)(encoded)
          return InstantV3AdmissionClaimJson.make(
            stringifyInstantV3CanonicalJson(json),
          )
        },
        catch: cause =>
          new V3SharedProgramAdmissionClaimError({
            cause,
            operation: 'Encode',
            proposalId: null,
          }),
      })

    const occurrenceIdForClaim = (
      claim: Claim,
    ): Effect.Effect<string, V3SharedProgramAdmissionClaimError> =>
      Effect.try({
        try: () => InstantV3Identity.make(admission.occurrenceId(claim)),
        catch: cause =>
          new V3SharedProgramAdmissionClaimError({
            cause,
            operation: 'OccurrenceId',
            proposalId: null,
          }),
      })

    const buildProposal = (
      claim: Claim,
      correlation: V3SharedProgramClaimCorrelation,
    ): Effect.Effect<
      InstantV3OrdinaryMessageProposalRecordType,
      Exclude<V3SharedProgramSubmissionError, V3ProgramStoreAppendError>
    > =>
      Effect.gen(function* () {
        const current = yield* SubscriptionRef.get(snapshotRef)
        const occurrenceId = yield* occurrenceIdForClaim(claim)
        const invocation = V3SharedProgramInvocationFacts.make({
          actorId: origin.actorId,
          clientId: origin.clientId,
          occurrenceId,
          originatingProcessorId: origin.originatingProcessorId,
          sessionId: scope.sessionId,
          subjectId: scope.subjectId,
        })
        const resolved = yield* Effect.try({
          try: () =>
            admission.resolve(current.optimisticModel, claim, invocation),
          catch: cause =>
            new V3SharedProgramAdmissionResolutionError({
              cause,
              occurrenceId,
              proposalId: null,
            }),
        })
        if (Result.isFailure(resolved)) {
          return yield* Effect.fail(
            new V3SharedProgramAdmissionResolutionError({
              cause: resolved.failure,
              occurrenceId,
              proposalId: null,
            }),
          )
        }
        yield* preflightSynchronization(resolved.success)
        yield* updateProgram(
          admission.program,
          current.optimisticModel,
          resolved.success,
          occurrenceId,
          'Optimistic',
        )
        const actorSequence = yield* decodeGenerated(
          InstantV3NonNegativeInteger,
          identities.nextActorSequence,
          'ActorSequence',
        )
        const createdAtMs = yield* decodeGenerated(
          InstantV3TimestampMs,
          identities.now,
          'Timestamp',
        )
        const entityId = yield* decodeGenerated(
          InstantV3EntityId,
          identities.nextEntityId,
          'EntityId',
        )
        const proposalId = yield* decodeGenerated(
          InstantV3Identity,
          identities.nextProposalId,
          'ProposalId',
        )
        const messageIdempotencyKey = yield* decodeGenerated(
          InstantV3MessageIdempotencyKey,
          identities.nextMessageIdempotencyKey,
          'MessageIdempotencyKey',
        )
        const event = yield* Effect.try({
          try: () => {
            const encoded = S.encodeUnknownSync(admission.program.Message)(
              resolved.success,
            )
            return S.decodeUnknownSync(S.Json)(encoded)
          },
          catch: cause =>
            new V3SharedProgramMessageProtocolError({
              cause,
              operation: 'EncodeProposed',
            }),
        })
        const payloadJson = stringifyInstantV3CanonicalJson(event)
        const envelope: V3SharedProgramProposedEnvelopeInput = {
          actorId: origin.actorId,
          actorSequence,
          causationOccurrenceId: correlation.causationOccurrenceId,
          clientId: origin.clientId,
          correlationId: correlation.correlationId,
          createdAtMs,
          occurrenceId,
          originDeviceId: origin.originDeviceId,
          originatingProcessorId: origin.originatingProcessorId,
          programId: scope.programId,
          programVersion: scope.programVersion,
          protocolVersion: scope.protocolVersion,
          sessionId: scope.sessionId,
          subjectId: scope.subjectId,
        }
        const encoded = yield* messageProtocol.encodeProposed(
          resolved.success,
          envelope,
        )
        if (encoded.payloadJson !== payloadJson) {
          return yield* Effect.fail(
            new V3SharedProgramMessageProtocolError({
              cause: new Error(
                'Program Message protocol disagrees with Program.Message.',
              ),
              operation: 'EncodeProposed',
            }),
          )
        }
        const admissionClaimJson = yield* encodeClaim(claim)
        const signingRecord: OriginOrdinaryProposalSigningRecord = {
          ...scope,
          actorId: origin.actorId,
          actorSequence,
          actorSequencePositionKey:
            makeInstantV3MessageProposalActorSequencePositionKey(
              scope.sessionId,
              origin.actorId,
              origin.clientId,
              actorSequence,
            ),
          admissionClaimJson,
          admissionOccurrenceId: occurrenceId,
          causationOccurrenceId: correlation.causationOccurrenceId,
          clientId: origin.clientId,
          correlationId: correlation.correlationId,
          createdAtMs,
          envelopeJson: encoded.envelopeJson,
          envelopeVersion: encoded.envelopeVersion,
          eventId: encoded.eventId,
          eventVersion: encoded.eventVersion,
          id: entityId,
          messageIdempotencyKey,
          messageIdempotencyPositionKey:
            makeInstantV3MessageProposalMessageIdempotencyPositionKey(
              scope.sessionId,
              messageIdempotencyKey,
            ),
          occurrenceId,
          occurrencePositionKey:
            makeInstantV3MessageProposalOccurrencePositionKey(
              scope.sessionId,
              occurrenceId,
            ),
          originClientCertificateJson: origin.originClientCertificateJson,
          originDeviceId: origin.originDeviceId,
          originPolicyGeneration: origin.originPolicyGeneration,
          originPolicyId: origin.originPolicyId,
          originProcessorCertificateJson: origin.originProcessorCertificateJson,
          originatingProcessorId: origin.originatingProcessorId,
          payloadJson: encoded.payloadJson,
          proposalId,
          proposalKind: 'OrdinaryMessage',
          proposalPositionKey: makeInstantV3MessageProposalPositionKey(
            scope.sessionId,
            proposalId,
          ),
        }
        return yield* signOriginOrdinaryMessageProposal(
          signingRecord,
          origin.processorSecretKey,
        ).pipe(
          Effect.mapError(
            cause => new V3SharedProgramOriginProofError({ cause, proposalId }),
          ),
        )
      })

    const appendLocal = (
      proposal: InstantV3OrdinaryMessageProposalRecordType,
    ): Effect.Effect<void, V3SharedProgramProposalConflict> =>
      SynchronizedRef.modify(localPendingRef, pending => {
        const maybeExisting = Array.findFirst(
          pending,
          entry => entry.proposal.proposalId === proposal.proposalId,
        )
        if (Option.isSome(maybeExisting)) {
          return Tuple.make(
            Option.some(
              new V3SharedProgramProposalConflict({
                proposalId: proposal.proposalId,
              }),
            ),
            pending,
          )
        } else {
          return Tuple.make(
            Option.none<V3SharedProgramProposalConflict>(),
            Array.sort(
              [...pending, { persistence: 'Local', proposal, source: 'Local' }],
              pendingOrder,
            ),
          )
        }
      }).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.void,
            onSome: Effect.fail,
          }),
        ),
      )

    const removeLocal = (proposalId: string): Effect.Effect<void> =>
      SynchronizedRef.update(localPendingRef, pending =>
        Array.filter(
          pending,
          entry => entry.proposal.proposalId !== proposalId,
        ),
      )

    const submittedProjection = (
      snapshot: V3SharedProgramProcessorSnapshot<Model>,
      proposalId: string,
    ): Effect.Effect<V3PendingProjection, V3SharedProgramProposalConflict> => {
      const maybePending = Array.findFirst(
        snapshot.pendingClaims,
        pending => pending.proposal.proposalId === proposalId,
      )
      if (Option.isSome(maybePending)) {
        return Effect.succeed(maybePending.value.projection)
      } else {
        return Effect.fail(new V3SharedProgramProposalConflict({ proposalId }))
      }
    }

    const submitClaim = (
      claim: Claim,
      correlation: V3SharedProgramClaimCorrelation = noCorrelation(),
    ): Effect.Effect<
      V3SharedProgramSubmission,
      V3SharedProgramSubmissionError
    > =>
      submissionSemaphore.withPermit(
        Effect.gen(function* () {
          const proposal = yield* buildProposal(claim, correlation)
          yield* appendLocal(proposal)
          const reconciled = yield* Effect.result(reconcile)
          if (Result.isFailure(reconciled)) {
            yield* removeLocal(proposal.proposalId)
            yield* setReconciliationError(reconciled.failure)
            return yield* Effect.fail(
              new V3SharedProgramSessionPolicyUnavailable({
                reason: 'InvalidHistory',
              }),
            )
          }
          const projection = yield* submittedProjection(
            reconciled.success,
            proposal.proposalId,
          )
          return yield* persistWithReceipt({ projection, proposal })
        }),
      )

    const submitAction = (
      action: V3SharedProgramAction<Claim>,
      correlation: V3SharedProgramClaimCorrelation = noCorrelation(),
    ): Effect.Effect<
      V3SharedProgramSubmission,
      V3SharedProgramSubmissionError
    > =>
      decodeGenerated(
        InstantV3Identity,
        identities.nextOccurrenceId,
        'OccurrenceId',
      ).pipe(
        Effect.flatMap(occurrenceId =>
          Effect.try({
            try: () => action(occurrenceId),
            catch: cause => new V3SharedProgramActionError({ cause }),
          }).pipe(
            Effect.flatMap(claim =>
              occurrenceIdForClaim(claim).pipe(
                Effect.flatMap(claimedOccurrenceId => {
                  if (claimedOccurrenceId === occurrenceId) {
                    return submitClaim(claim, correlation)
                  } else {
                    return Effect.fail(
                      new V3SharedProgramIdentityError({
                        cause: new Error(
                          'Action claim did not retain its allocated occurrence identity.',
                        ),
                        identity: 'OccurrenceId',
                      }),
                    )
                  }
                }),
              ),
            ),
          ),
        ),
      )

    const retryPending = (
      proposalId: string,
    ): Effect.Effect<
      V3SharedProgramSubmission,
      V3SharedProgramSubmissionError
    > =>
      submissionSemaphore.withPermit(
        Effect.gen(function* () {
          const maybeProposal = yield* retainPendingLocally(proposalId)
          if (Option.isNone(maybeProposal)) {
            return yield* Effect.fail(
              new V3SharedProgramProposalConflict({ proposalId }),
            )
          } else {
            return yield* persistWithReceipt(maybeProposal.value)
          }
        }),
      )

    const flushPending: Effect.Effect<void> = Effect.gen(function* () {
      const sessionPolicyCache = yield* SynchronizedRef.get(
        sessionPolicyCacheRef,
      )
      if (sessionPolicyCache._tag !== 'Active') {
        return
      }
      const pending = yield* SynchronizedRef.get(localPendingRef)
      const snapshot = yield* SubscriptionRef.get(snapshotRef)
      const appliedProposalIds = HashSet.fromIterable(
        Array.map(
          Array.filter(
            snapshot.pendingClaims,
            pendingClaim => pendingClaim.projection._tag === 'Applied',
          ),
          pendingClaim => pendingClaim.proposal.proposalId,
        ),
      )
      yield* Effect.forEach(
        Array.filter(
          pending,
          entry =>
            entry.persistence !== 'ServerConfirmed' &&
            HashSet.has(appliedProposalIds, entry.proposal.proposalId),
        ),
        entry =>
          retainPendingLocally(entry.proposal.proposalId).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.void,
                onSome: retained =>
                  persist(retained.proposal).pipe(Effect.ignore),
              }),
            ),
          ),
        { concurrency: 1, discard: true },
      )
    })

    const awaitInitialObservation = <Value, ObservationError>(
      source: V3SharedProgramObservationReadinessError['source'],
      stream: Stream.Stream<Value, ObservationError>,
    ): Stream.Stream<
      Value,
      ObservationError | V3SharedProgramObservationReadinessError
    > =>
      Stream.unwrap(
        Stream.peel(stream, Sink.head()).pipe(
          Effect.timeoutOption(initialObservationReadinessTimeoutMs),
          Effect.flatMap(
            Option.match({
              onNone: () =>
                Effect.fail(
                  new V3SharedProgramObservationReadinessError({
                    source,
                    timeoutMs: initialObservationReadinessTimeoutMs,
                  }),
                ),
              onSome: ([maybeInitial, remaining]) => {
                if (Option.isSome(maybeInitial)) {
                  return Effect.succeed(
                    Stream.concat(
                      Stream.succeed(maybeInitial.value),
                      remaining,
                    ),
                  )
                } else {
                  return Effect.fail(
                    new V3SharedProgramObservationReadinessError({
                      source,
                      timeoutMs: initialObservationReadinessTimeoutMs,
                    }),
                  )
                }
              },
            }),
          ),
        ),
      )

    const observations = Stream.zipLatest(
      Stream.zipLatest(
        Stream.zipLatest(
          awaitInitialObservation(
            'AcceptedMessageOccurrences',
            store.observations.observeAcceptedMessageOccurrences(scope),
          ),
          awaitInitialObservation(
            'MessageProposals',
            store.observations.observeMessageProposals(scope),
          ),
        ),
        Stream.zipLatest(
          awaitInitialObservation(
            'MessageProposalResolutions',
            store.observations.observeMessageProposalResolutions(scope),
          ),
          awaitInitialObservation(
            'ConnectionStatus',
            store.observations.observeConnectionStatus,
          ),
        ),
      ),
      awaitInitialObservation(
        'ProgramSessions',
        store.observations.observeProgramSessions(scope),
      ),
    )

    const markObservationsFinishing = (
      generation: number,
    ): Effect.Effect<void> =>
      SynchronizedRef.update(observerFiberRef, maybeHandle =>
        Option.map(maybeHandle, handle =>
          handle.generation === generation
            ? { ...handle, lifecycle: 'Finishing' }
            : handle,
        ),
      )

    const runObservations = (generation: number): Effect.Effect<void> =>
      Stream.runForEach(
        observations,
        ([
          [[accepted, proposals], [resolutions, connectionStatus]],
          programSessions,
        ]) =>
          Effect.gen(function* () {
            yield* SynchronizedRef.set(observedStateRef, {
              accepted,
              connectionStatus,
              programSessions,
              proposals,
              resolutions,
            })
            const reconciled = yield* Effect.result(reconcile)
            if (Result.isFailure(reconciled)) {
              yield* setReconciliationError(reconciled.failure)
            } else if (connectionStatus === 'Authenticated') {
              yield* flushPending
            }
          }),
      ).pipe(
        Effect.catch(error =>
          markObservationsFinishing(generation).pipe(
            Effect.andThen(setLastError(error)),
          ),
        ),
        Effect.onExit(() => markObservationsFinishing(generation)),
      )

    const finishObservations = (generation: number): Effect.Effect<void> =>
      finishCurrentObserverGeneration(observerFiberRef, generation, () =>
        SynchronizedRef.set(isConnectedRef, false).pipe(
          Effect.andThen(
            SubscriptionRef.update(snapshotRef, snapshot => ({
              ...snapshot,
              connection: V3Detached.make({}),
            })),
          ),
        ),
      ).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.void,
            onSome: handle => Deferred.succeed(handle.finished, undefined),
          }),
        ),
      )

    const startObservations = Effect.gen(function* () {
      const generation = yield* SynchronizedRef.updateAndGet(
        observerGenerationRef,
        current => current + 1,
      )
      const startGate = yield* Deferred.make<void>()
      const finished = yield* Deferred.make<void>()
      const fiber = yield* Effect.forkIn(
        Deferred.await(startGate).pipe(
          Effect.andThen(runObservations(generation)),
          Effect.ensuring(finishObservations(generation)),
        ),
        ownerScope,
      )
      yield* SynchronizedRef.set(
        observerFiberRef,
        Option.some({ fiber, finished, generation, lifecycle: 'Running' }),
      )
      yield* SynchronizedRef.set(isConnectedRef, true)
      yield* Deferred.succeed(startGate, undefined)
    })

    const connect: Effect.Effect<void> = lifecycleSemaphore.withPermit(
      SynchronizedRef.get(observerFiberRef).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => startObservations,
            onSome: handle =>
              handle.lifecycle === 'Running'
                ? Effect.void
                : Deferred.await(handle.finished).pipe(
                    Effect.andThen(startObservations),
                  ),
          }),
        ),
      ),
    )

    const disconnect: Effect.Effect<void> = lifecycleSemaphore.withPermit(
      SynchronizedRef.set(isConnectedRef, false).pipe(
        Effect.andThen(
          SynchronizedRef.getAndSet(
            observerFiberRef,
            Option.none<ObserverHandle>(),
          ),
        ),
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.void,
            onSome: handle => Fiber.interrupt(handle.fiber),
          }),
        ),
        Effect.andThen(
          SubscriptionRef.update(snapshotRef, snapshot => ({
            ...snapshot,
            connection: V3Detached.make({}),
          })),
        ),
      ),
    )

    yield* Scope.addFinalizer(ownerScope, disconnect)

    return {
      connect,
      disconnect,
      readSnapshot: SubscriptionRef.get(snapshotRef),
      retryPending,
      snapshots: SubscriptionRef.changes(snapshotRef),
      submitAction,
      submitClaim,
    }
  })
