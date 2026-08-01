import {
  Data,
  Effect,
  Encoding,
  Option,
  Result,
  Schema as S,
  Tuple,
} from 'effect'

import { p256 } from '@noble/curves/nist.js'
import { sha256 } from '@noble/hashes/sha2.js'

import {
  InstantV3EffectResultProposalRecord,
  type InstantV3EffectResultProposalRecord as InstantV3EffectResultProposalRecordType,
  InstantV3Identity,
  InstantV3NonNegativeInteger,
  InstantV3OrdinaryMessageProposalRecord,
  type InstantV3OrdinaryMessageProposalRecord as InstantV3OrdinaryMessageProposalRecordType,
  InstantV3OriginCertificateJson,
  type InstantV3OriginCertificateJson as InstantV3OriginCertificateJsonType,
  InstantV3OriginEnrollmentClaimRecord,
  type InstantV3OriginEnrollmentClaimRecord as InstantV3OriginEnrollmentClaimRecordType,
  InstantV3PositiveInteger,
  InstantV3ProgramId,
  InstantV3ProgramProtocolVersion,
  InstantV3ProgramSessionId,
  InstantV3Sha256Digest,
  type InstantV3Sha256Digest as InstantV3Sha256DigestType,
  parseInstantV3ProgramSessionId,
} from '../v3Schema/index.js'

const OriginPublicKeyByteLength = 33
const OriginPublicKeyTextLength = 44
const OriginSecretKeyByteLength = 32
const OriginSignatureByteLength = 64
const OriginSignatureTextLength = 86
const textEncoder = new TextEncoder()

const isCanonicalOriginPublicKey = (value: string): boolean => {
  if (value.length !== OriginPublicKeyTextLength) {
    return false
  }
  const decoded = Encoding.decodeBase64Url(value)
  if (Result.isFailure(decoded)) {
    return false
  }
  const bytes = decoded.success
  return (
    bytes.length === OriginPublicKeyByteLength &&
    Encoding.encodeBase64Url(bytes) === value &&
    p256.utils.isValidPublicKey(bytes, true)
  )
}

const isCanonicalOriginSignature = (value: string): boolean => {
  if (value.length !== OriginSignatureTextLength) {
    return false
  }
  const decoded = Encoding.decodeBase64Url(value)
  if (Result.isFailure(decoded)) {
    return false
  }
  const bytes = decoded.success
  if (
    bytes.length !== OriginSignatureByteLength ||
    Encoding.encodeBase64Url(bytes) !== value
  ) {
    return false
  }
  try {
    return !p256.Signature.fromBytes(bytes, 'compact').hasHighS()
  } catch {
    return false
  }
}

const OriginPublicKey = S.String.check(
  S.makeFilter(value =>
    isCanonicalOriginPublicKey(value)
      ? undefined
      : {
          path: [],
          issue:
            'Expected a canonical unpadded base64url compressed P-256 public key.',
        },
  ),
)

/** A Device identity encoded as its canonical compressed P-256 public key. */
export const OriginDeviceId = OriginPublicKey.pipe(S.brand('OriginDeviceId'))
/** A Device identity encoded as its canonical compressed P-256 public key. */
export type OriginDeviceId = typeof OriginDeviceId.Type

/** A Client identity encoded as its canonical compressed P-256 public key. */
export const OriginClientId = OriginPublicKey.pipe(S.brand('OriginClientId'))
/** A Client identity encoded as its canonical compressed P-256 public key. */
export type OriginClientId = typeof OriginClientId.Type

/** A Processor identity encoded as its canonical compressed P-256 public key. */
export const OriginProcessorId = OriginPublicKey.pipe(
  S.brand('OriginProcessorId'),
)
/** A Processor identity encoded as its canonical compressed P-256 public key. */
export type OriginProcessorId = typeof OriginProcessorId.Type

/** A canonical low-S compact P-256 signature encoded as unpadded base64url. */
export const OriginSignature = S.String.check(
  S.makeFilter(value =>
    isCanonicalOriginSignature(value)
      ? undefined
      : {
          path: [],
          issue:
            'Expected a canonical unpadded base64url low-S compact P-256 signature.',
        },
  ),
).pipe(S.brand('OriginSignature'))
/** A canonical low-S compact P-256 signature encoded as unpadded base64url. */
export type OriginSignature = typeof OriginSignature.Type

/** The independently evolvable wire format used by origin proofs. */
export const OriginProofFormatVersion = S.Literal(1)
/** The independently evolvable wire format used by origin proofs. */
export type OriginProofFormatVersion = typeof OriginProofFormatVersion.Type
/** The current origin-proof wire-format version. */
export const originProofFormatVersion = OriginProofFormatVersion.make(1)

/** The fixed domain separator for signed Device enrollment claims. */
export const OriginEnrollmentClaimDomain = S.Literal(
  'foldkit.instant.v3.origin-enrollment-claim',
)
/** The fixed domain separator for signed Device enrollment claims. */
export type OriginEnrollmentClaimDomain =
  typeof OriginEnrollmentClaimDomain.Type
/** The fixed domain separator for signed Device enrollment claims. */
export const originEnrollmentClaimDomain = OriginEnrollmentClaimDomain.make(
  'foldkit.instant.v3.origin-enrollment-claim',
)

/** The fixed domain separator for signed ordinary Message proposals. */
export const OriginOrdinaryProposalDomain = S.Literal(
  'foldkit.instant.v3.ordinary-message-proposal',
)
/** The fixed domain separator for signed ordinary Message proposals. */
export type OriginOrdinaryProposalDomain =
  typeof OriginOrdinaryProposalDomain.Type
/** The fixed domain separator for signed ordinary Message proposals. */
export const originOrdinaryProposalDomain = OriginOrdinaryProposalDomain.make(
  'foldkit.instant.v3.ordinary-message-proposal',
)

/** The fixed domain separator for an accepted ordinary origin-proof digest. */
export const OriginOrdinaryProofDigestDomain = S.Literal(
  'foldkit.instant.v3.ordinary-origin-proof-digest',
)
/** The fixed domain separator for an accepted ordinary origin-proof digest. */
export type OriginOrdinaryProofDigestDomain =
  typeof OriginOrdinaryProofDigestDomain.Type
/** The fixed domain separator for an accepted ordinary origin-proof digest. */
export const originOrdinaryProofDigestDomain =
  OriginOrdinaryProofDigestDomain.make(
    'foldkit.instant.v3.ordinary-origin-proof-digest',
  )

/** The fixed domain separator for signed effect-result proposals. */
export const OriginEffectResultDomain = S.Literal(
  'foldkit.instant.v3.effect-result-proposal',
)
/** The fixed domain separator for signed effect-result proposals. */
export type OriginEffectResultDomain = typeof OriginEffectResultDomain.Type
/** The fixed domain separator for signed effect-result proposals. */
export const originEffectResultDomain = OriginEffectResultDomain.make(
  'foldkit.instant.v3.effect-result-proposal',
)

/** Every enrollment claim field covered by its Device signature. */
export const OriginEnrollmentClaimSigningField = S.Literals([
  'claimedAtMs',
  'enrollmentClaimId',
  'enrollmentClaimPositionKey',
  'id',
  'instantAppId',
  'originDeviceId',
  'protocolVersion',
  'subjectId',
])
/** Every enrollment claim field covered by its Device signature. */
export type OriginEnrollmentClaimSigningField =
  typeof OriginEnrollmentClaimSigningField.Type
/** The explicit order in which every enrollment claim field is signed. */
export const originEnrollmentClaimSigningFields: ReadonlyArray<OriginEnrollmentClaimSigningField> =
  [
    'claimedAtMs',
    'enrollmentClaimId',
    'enrollmentClaimPositionKey',
    'id',
    'instantAppId',
    'originDeviceId',
    'protocolVersion',
    'subjectId',
  ]

/** Every ordinary proposal field covered by its origin signature. */
export const OriginOrdinaryProposalSigningField = S.Literals([
  'actorId',
  'actorSequence',
  'actorSequencePositionKey',
  'admissionClaimJson',
  'admissionOccurrenceId',
  'appSubjectDigest',
  'causationOccurrenceId',
  'clientId',
  'correlationId',
  'createdAtMs',
  'envelopeJson',
  'envelopeVersion',
  'eventId',
  'eventVersion',
  'id',
  'instantAppId',
  'messageIdempotencyKey',
  'messageIdempotencyPositionKey',
  'occurrenceId',
  'occurrencePositionKey',
  'originClientCertificateJson',
  'originDeviceId',
  'originPolicyGeneration',
  'originPolicyId',
  'originatingProcessorId',
  'originProcessorCertificateJson',
  'payloadJson',
  'programId',
  'programVersion',
  'protocolVersion',
  'proposalId',
  'proposalKind',
  'proposalPositionKey',
  'sessionEpochId',
  'sessionId',
  'subjectId',
])
/** Every ordinary proposal field covered by its origin signature. */
export type OriginOrdinaryProposalSigningField =
  typeof OriginOrdinaryProposalSigningField.Type
/** The explicit order in which every ordinary proposal field is signed. */
export const originOrdinaryProposalSigningFields: ReadonlyArray<OriginOrdinaryProposalSigningField> =
  [
    'actorId',
    'actorSequence',
    'actorSequencePositionKey',
    'admissionClaimJson',
    'admissionOccurrenceId',
    'appSubjectDigest',
    'causationOccurrenceId',
    'clientId',
    'correlationId',
    'createdAtMs',
    'envelopeJson',
    'envelopeVersion',
    'eventId',
    'eventVersion',
    'id',
    'instantAppId',
    'messageIdempotencyKey',
    'messageIdempotencyPositionKey',
    'occurrenceId',
    'occurrencePositionKey',
    'originClientCertificateJson',
    'originDeviceId',
    'originPolicyGeneration',
    'originPolicyId',
    'originatingProcessorId',
    'originProcessorCertificateJson',
    'payloadJson',
    'programId',
    'programVersion',
    'protocolVersion',
    'proposalId',
    'proposalKind',
    'proposalPositionKey',
    'sessionEpochId',
    'sessionId',
    'subjectId',
  ]

/** Every effect-result field covered by its executor signature. */
export const OriginEffectResultSigningField = S.Literals([
  'actorId',
  'actorSequence',
  'actorSequencePositionKey',
  'appSubjectDigest',
  'causalAcceptedSequence',
  'causalAudience',
  'causalMessageCategory',
  'causalOccurrenceId',
  'causalOriginDeviceId',
  'causalOriginPolicyGeneration',
  'causalOriginPolicyId',
  'causalOriginProofDigest',
  'causalOriginatingProcessorId',
  'causalPolicyGeneration',
  'causalProposalId',
  'causationOccurrenceId',
  'clientId',
  'correlationId',
  'createdAtMs',
  'effectAssignmentGeneration',
  'effectCancellationGeneration',
  'effectIdempotencyKey',
  'effectIdempotencyPositionKey',
  'effectPlacementId',
  'effectRequestId',
  'effectRequestResultPositionKey',
  'envelopeJson',
  'envelopeVersion',
  'eventId',
  'eventVersion',
  'executorClientCertificateJson',
  'executorOriginPolicyGeneration',
  'executorOriginPolicyId',
  'executorProcessorCertificateJson',
  'executorProcessorId',
  'id',
  'instantAppId',
  'occurrenceId',
  'occurrencePositionKey',
  'originDeviceId',
  'originatingProcessorId',
  'payloadJson',
  'programId',
  'programVersion',
  'proposalId',
  'proposalKind',
  'proposalPositionKey',
  'protocolVersion',
  'sessionEpochId',
  'sessionId',
  'subjectId',
])
/** Every effect-result field covered by its executor signature. */
export type OriginEffectResultSigningField =
  typeof OriginEffectResultSigningField.Type
/** The explicit order in which every effect-result field is signed. */
export const originEffectResultSigningFields: ReadonlyArray<OriginEffectResultSigningField> =
  [
    'actorId',
    'actorSequence',
    'actorSequencePositionKey',
    'appSubjectDigest',
    'causalAcceptedSequence',
    'causalAudience',
    'causalMessageCategory',
    'causalOccurrenceId',
    'causalOriginDeviceId',
    'causalOriginPolicyGeneration',
    'causalOriginPolicyId',
    'causalOriginProofDigest',
    'causalOriginatingProcessorId',
    'causalPolicyGeneration',
    'causalProposalId',
    'causationOccurrenceId',
    'clientId',
    'correlationId',
    'createdAtMs',
    'effectAssignmentGeneration',
    'effectCancellationGeneration',
    'effectIdempotencyKey',
    'effectIdempotencyPositionKey',
    'effectPlacementId',
    'effectRequestId',
    'effectRequestResultPositionKey',
    'envelopeJson',
    'envelopeVersion',
    'eventId',
    'eventVersion',
    'executorClientCertificateJson',
    'executorOriginPolicyGeneration',
    'executorOriginPolicyId',
    'executorProcessorCertificateJson',
    'executorProcessorId',
    'id',
    'instantAppId',
    'occurrenceId',
    'occurrencePositionKey',
    'originDeviceId',
    'originatingProcessorId',
    'payloadJson',
    'programId',
    'programVersion',
    'proposalId',
    'proposalKind',
    'proposalPositionKey',
    'protocolVersion',
    'sessionEpochId',
    'sessionId',
    'subjectId',
  ]

const OriginCertificateText = S.String.check(S.isLengthBetween(1, 128))

/** The signed scope of a Device-authorized Client identity. */
export const OriginClientCertificateClaims = S.Struct({
  clientId: OriginClientId,
  instantAppId: OriginCertificateText,
  originDeviceId: OriginDeviceId,
  subjectId: OriginCertificateText,
})
/** The signed scope of a Device-authorized Client identity. */
export type OriginClientCertificateClaims =
  typeof OriginClientCertificateClaims.Type

/** A Device signature authorizing one Client for an Instant subject. */
export const OriginClientCertificate = S.Struct({
  clientId: OriginClientId,
  instantAppId: OriginCertificateText,
  originDeviceId: OriginDeviceId,
  signature: OriginSignature,
  subjectId: OriginCertificateText,
  version: OriginProofFormatVersion,
})
/** A Device signature authorizing one Client for an Instant subject. */
export type OriginClientCertificate = typeof OriginClientCertificate.Type

type OriginProcessorCertificateSessionScope = Readonly<{
  programId: string
  programVersion: number
  sessionId: string
}>

const originProcessorCertificateSessionScopeFilter = S.makeFilter(
  (certificate: OriginProcessorCertificateSessionScope) => {
    const maybeSessionIdentity = parseInstantV3ProgramSessionId(
      certificate.sessionId,
    )
    return Option.isSome(maybeSessionIdentity) &&
      maybeSessionIdentity.value.programId === certificate.programId &&
      maybeSessionIdentity.value.programVersion === certificate.programVersion
      ? undefined
      : {
          path: ['sessionId'],
          issue:
            'A Processor certificate must match the Program identity encoded by its session.',
        }
  },
)

/** The signed scope of a Client-authorized Processor identity. */
export const OriginProcessorCertificateClaims = S.Struct({
  clientId: OriginClientId,
  instantAppId: OriginCertificateText,
  originDeviceId: OriginDeviceId,
  originPolicyGeneration: InstantV3PositiveInteger,
  originPolicyId: InstantV3Identity,
  originatingProcessorId: OriginProcessorId,
  programId: InstantV3ProgramId,
  programVersion: InstantV3NonNegativeInteger,
  protocolVersion: InstantV3ProgramProtocolVersion,
  sessionId: InstantV3ProgramSessionId,
  subjectId: OriginCertificateText,
}).check(originProcessorCertificateSessionScopeFilter)
/** The signed scope of a Client-authorized Processor identity. */
export type OriginProcessorCertificateClaims =
  typeof OriginProcessorCertificateClaims.Type

/** A Client signature authorizing one Processor for one Program session. */
export const OriginProcessorCertificate = S.Struct({
  clientId: OriginClientId,
  instantAppId: OriginCertificateText,
  originDeviceId: OriginDeviceId,
  originPolicyGeneration: InstantV3PositiveInteger,
  originPolicyId: InstantV3Identity,
  originatingProcessorId: OriginProcessorId,
  programId: InstantV3ProgramId,
  programVersion: InstantV3NonNegativeInteger,
  protocolVersion: InstantV3ProgramProtocolVersion,
  sessionId: InstantV3ProgramSessionId,
  signature: OriginSignature,
  subjectId: OriginCertificateText,
  version: OriginProofFormatVersion,
}).check(originProcessorCertificateSessionScopeFilter)
/** A Client signature authorizing one Processor for one Program session. */
export type OriginProcessorCertificate = typeof OriginProcessorCertificate.Type

/** The authenticated app-subject scope for one Device enrollment claim. */
export const OriginEnrollmentClaimProofScope = S.Struct({
  instantAppId: OriginCertificateText,
  subjectId: OriginCertificateText,
})
/** The authenticated app-subject scope for one Device enrollment claim. */
export type OriginEnrollmentClaimProofScope =
  typeof OriginEnrollmentClaimProofScope.Type

/** The external authority scope required for an ordinary Message proof. */
export const OriginOrdinaryProposalProofScope = S.Struct({
  clientId: OriginClientId,
  instantAppId: OriginCertificateText,
  originDeviceId: OriginDeviceId,
  originPolicyGeneration: InstantV3PositiveInteger,
  originPolicyId: InstantV3Identity,
  originatingProcessorId: OriginProcessorId,
  programId: InstantV3ProgramId,
  programVersion: InstantV3NonNegativeInteger,
  protocolVersion: InstantV3ProgramProtocolVersion,
  sessionId: InstantV3ProgramSessionId,
  subjectId: OriginCertificateText,
})
/** The external authority scope required for an ordinary Message proof. */
export type OriginOrdinaryProposalProofScope =
  typeof OriginOrdinaryProposalProofScope.Type

/** The external authority scope required for an effect executor proof. */
export const OriginEffectResultProofScope = S.Struct({
  clientId: OriginClientId,
  executorOriginPolicyGeneration: InstantV3PositiveInteger,
  executorOriginPolicyId: InstantV3Identity,
  executorProcessorId: OriginProcessorId,
  instantAppId: OriginCertificateText,
  originDeviceId: OriginDeviceId,
  programId: InstantV3ProgramId,
  programVersion: InstantV3NonNegativeInteger,
  protocolVersion: InstantV3ProgramProtocolVersion,
  sessionId: InstantV3ProgramSessionId,
  subjectId: OriginCertificateText,
})
/** The external authority scope required for an effect executor proof. */
export type OriginEffectResultProofScope =
  typeof OriginEffectResultProofScope.Type

/** A host-owned Device key pair derived from caller-supplied secret bytes. */
export type OriginDeviceKeyPair = Readonly<{
  originDeviceId: OriginDeviceId
  secretKey: Uint8Array
}>

/** A host-owned Client key pair derived from caller-supplied secret bytes. */
export type OriginClientKeyPair = Readonly<{
  clientId: OriginClientId
  secretKey: Uint8Array
}>

/** A host-owned Processor key pair derived from caller-supplied secret bytes. */
export type OriginProcessorKeyPair = Readonly<{
  originatingProcessorId: OriginProcessorId
  secretKey: Uint8Array
}>

/** A supplied P-256 secret was not an exact valid 32-byte scalar. */
export class OriginProofSecretKeyError extends Data.TaggedError(
  'OriginProofSecretKeyError',
)<{
  readonly key: 'Client' | 'Device' | 'Processor'
  readonly reason: 'InvalidLength' | 'InvalidScalar'
}> {}

/** A supplied secret key did not derive the claimed self-certifying identity. */
export class OriginProofKeyMismatch extends Data.TaggedError(
  'OriginProofKeyMismatch',
)<{
  readonly actualId: string
  readonly expectedId: string
  readonly key: 'Client' | 'Device' | 'Processor'
}> {}

/** An origin-proof value failed strict Schema decoding. */
export class OriginProofDecodeError extends Data.TaggedError(
  'OriginProofDecodeError',
)<{
  readonly cause: unknown
  readonly target:
    | 'ClientCertificate'
    | 'ClientCertificateClaims'
    | 'ClientId'
    | 'DeviceId'
    | 'EffectResultProofScope'
    | 'EffectResultProposal'
    | 'EffectResultSigningRecord'
    | 'EnrollmentClaim'
    | 'EnrollmentClaimProofScope'
    | 'EnrollmentClaimSigningRecord'
    | 'OrdinaryProposal'
    | 'OrdinaryProposalProofScope'
    | 'OrdinaryProposalSigningRecord'
    | 'ProcessorCertificate'
    | 'ProcessorCertificateClaims'
    | 'ProcessorId'
    | 'Signature'
}> {}

/** A canonical origin-proof payload could not be encoded. */
export class OriginProofCanonicalizationError extends Data.TaggedError(
  'OriginProofCanonicalizationError',
)<{
  readonly cause: unknown
  readonly target:
    | 'ClientCertificate'
    | 'EffectResultProposal'
    | 'EnrollmentClaim'
    | 'OrdinaryProposal'
    | 'OrdinaryProof'
    | 'ProcessorCertificate'
}> {}

/** A P-256 operation failed without escaping as a defect. */
export class OriginProofCryptoError extends Data.TaggedError(
  'OriginProofCryptoError',
)<{
  readonly cause: unknown
  readonly operation: 'DerivePublicKey' | 'Digest' | 'Sign' | 'Verify'
}> {}

/** A certificate or proposal signature was cryptographically invalid. */
export class OriginProofSignatureInvalid extends Data.TaggedError(
  'OriginProofSignatureInvalid',
)<{
  readonly signer: 'Client' | 'Device' | 'ExecutorProcessor' | 'Processor'
}> {}

/** Two authenticated origin-proof scope claims disagreed. */
export class OriginProofScopeMismatch extends Data.TaggedError(
  'OriginProofScopeMismatch',
)<{
  readonly actual: number | string
  readonly expected: number | string
  readonly field:
    | 'clientId'
    | 'executorOriginPolicyGeneration'
    | 'executorOriginPolicyId'
    | 'executorProcessorId'
    | 'instantAppId'
    | 'originDeviceId'
    | 'originPolicyGeneration'
    | 'originPolicyId'
    | 'originatingProcessorId'
    | 'programId'
    | 'programVersion'
    | 'protocolVersion'
    | 'sessionId'
    | 'subjectId'
}> {}

/** Every typed failure produced by origin-proof construction or verification. */
export type OriginProofError =
  | OriginProofCanonicalizationError
  | OriginProofCryptoError
  | OriginProofDecodeError
  | OriginProofKeyMismatch
  | OriginProofScopeMismatch
  | OriginProofSecretKeyError
  | OriginProofSignatureInvalid

const ClientCertificateSigningTuple = S.Tuple([
  S.Literal('foldkit.instant.v3.client-certificate'),
  OriginProofFormatVersion,
  S.String,
  S.String,
  OriginDeviceId,
  OriginClientId,
])
const ClientCertificateSigningJson = S.fromJsonString(
  ClientCertificateSigningTuple,
)

const ProcessorCertificateSigningTuple = S.Tuple([
  S.Literal('foldkit.instant.v3.processor-certificate'),
  OriginProofFormatVersion,
  OriginCertificateText,
  OriginCertificateText,
  InstantV3ProgramSessionId,
  InstantV3ProgramId,
  InstantV3NonNegativeInteger,
  InstantV3ProgramProtocolVersion,
  InstantV3Identity,
  InstantV3PositiveInteger,
  OriginDeviceId,
  OriginClientId,
  OriginProcessorId,
])
const ProcessorCertificateSigningJson = S.fromJsonString(
  ProcessorCertificateSigningTuple,
)

const EnrollmentClaimSigningTuple = S.Tuple([
  OriginEnrollmentClaimDomain,
  OriginProofFormatVersion,
  InstantV3OriginEnrollmentClaimRecord.fields.claimedAtMs,
  InstantV3OriginEnrollmentClaimRecord.fields.enrollmentClaimId,
  InstantV3OriginEnrollmentClaimRecord.fields.enrollmentClaimPositionKey,
  InstantV3OriginEnrollmentClaimRecord.fields.id,
  InstantV3OriginEnrollmentClaimRecord.fields.instantAppId,
  InstantV3OriginEnrollmentClaimRecord.fields.originDeviceId,
  InstantV3OriginEnrollmentClaimRecord.fields.protocolVersion,
  InstantV3OriginEnrollmentClaimRecord.fields.subjectId,
])
const EnrollmentClaimSigningJson = S.fromJsonString(EnrollmentClaimSigningTuple)

const OrdinaryProposalSigningTuple = S.Tuple([
  OriginOrdinaryProposalDomain,
  OriginProofFormatVersion,
  InstantV3OrdinaryMessageProposalRecord.fields.actorId,
  InstantV3OrdinaryMessageProposalRecord.fields.actorSequence,
  InstantV3OrdinaryMessageProposalRecord.fields.actorSequencePositionKey,
  InstantV3OrdinaryMessageProposalRecord.fields.admissionClaimJson,
  InstantV3OrdinaryMessageProposalRecord.fields.admissionOccurrenceId,
  InstantV3OrdinaryMessageProposalRecord.fields.appSubjectDigest,
  InstantV3OrdinaryMessageProposalRecord.fields.causationOccurrenceId,
  InstantV3OrdinaryMessageProposalRecord.fields.clientId,
  InstantV3OrdinaryMessageProposalRecord.fields.correlationId,
  InstantV3OrdinaryMessageProposalRecord.fields.createdAtMs,
  InstantV3OrdinaryMessageProposalRecord.fields.envelopeJson,
  InstantV3OrdinaryMessageProposalRecord.fields.envelopeVersion,
  InstantV3OrdinaryMessageProposalRecord.fields.eventId,
  InstantV3OrdinaryMessageProposalRecord.fields.eventVersion,
  InstantV3OrdinaryMessageProposalRecord.fields.id,
  InstantV3OrdinaryMessageProposalRecord.fields.instantAppId,
  InstantV3OrdinaryMessageProposalRecord.fields.messageIdempotencyKey,
  InstantV3OrdinaryMessageProposalRecord.fields.messageIdempotencyPositionKey,
  InstantV3OrdinaryMessageProposalRecord.fields.occurrenceId,
  InstantV3OrdinaryMessageProposalRecord.fields.occurrencePositionKey,
  InstantV3OrdinaryMessageProposalRecord.fields.originClientCertificateJson,
  InstantV3OrdinaryMessageProposalRecord.fields.originDeviceId,
  InstantV3OrdinaryMessageProposalRecord.fields.originPolicyGeneration,
  InstantV3OrdinaryMessageProposalRecord.fields.originPolicyId,
  InstantV3OrdinaryMessageProposalRecord.fields.originatingProcessorId,
  InstantV3OrdinaryMessageProposalRecord.fields.originProcessorCertificateJson,
  InstantV3OrdinaryMessageProposalRecord.fields.payloadJson,
  InstantV3OrdinaryMessageProposalRecord.fields.programId,
  InstantV3OrdinaryMessageProposalRecord.fields.programVersion,
  InstantV3OrdinaryMessageProposalRecord.fields.protocolVersion,
  InstantV3OrdinaryMessageProposalRecord.fields.proposalId,
  InstantV3OrdinaryMessageProposalRecord.fields.proposalKind,
  InstantV3OrdinaryMessageProposalRecord.fields.proposalPositionKey,
  InstantV3OrdinaryMessageProposalRecord.fields.sessionEpochId,
  InstantV3OrdinaryMessageProposalRecord.fields.sessionId,
  InstantV3OrdinaryMessageProposalRecord.fields.subjectId,
])
const OrdinaryProposalSigningJson = S.fromJsonString(
  OrdinaryProposalSigningTuple,
)

const OrdinaryProofDigestTuple = S.Tuple([
  OriginOrdinaryProofDigestDomain,
  OriginProofFormatVersion,
  OriginSignature,
  S.String,
])
const OrdinaryProofDigestJson = S.fromJsonString(OrdinaryProofDigestTuple)

const EffectResultSigningTuple = S.Tuple([
  OriginEffectResultDomain,
  OriginProofFormatVersion,
  InstantV3EffectResultProposalRecord.fields.actorId,
  InstantV3EffectResultProposalRecord.fields.actorSequence,
  InstantV3EffectResultProposalRecord.fields.actorSequencePositionKey,
  InstantV3EffectResultProposalRecord.fields.appSubjectDigest,
  InstantV3EffectResultProposalRecord.fields.causalAcceptedSequence,
  InstantV3EffectResultProposalRecord.fields.causalAudience,
  InstantV3EffectResultProposalRecord.fields.causalMessageCategory,
  InstantV3EffectResultProposalRecord.fields.causalOccurrenceId,
  InstantV3EffectResultProposalRecord.fields.causalOriginDeviceId,
  InstantV3EffectResultProposalRecord.fields.causalOriginPolicyGeneration,
  InstantV3EffectResultProposalRecord.fields.causalOriginPolicyId,
  InstantV3EffectResultProposalRecord.fields.causalOriginProofDigest,
  InstantV3EffectResultProposalRecord.fields.causalOriginatingProcessorId,
  InstantV3EffectResultProposalRecord.fields.causalPolicyGeneration,
  InstantV3EffectResultProposalRecord.fields.causalProposalId,
  InstantV3EffectResultProposalRecord.fields.causationOccurrenceId,
  InstantV3EffectResultProposalRecord.fields.clientId,
  InstantV3EffectResultProposalRecord.fields.correlationId,
  InstantV3EffectResultProposalRecord.fields.createdAtMs,
  InstantV3EffectResultProposalRecord.fields.effectAssignmentGeneration,
  InstantV3EffectResultProposalRecord.fields.effectCancellationGeneration,
  InstantV3EffectResultProposalRecord.fields.effectIdempotencyKey,
  InstantV3EffectResultProposalRecord.fields.effectIdempotencyPositionKey,
  InstantV3EffectResultProposalRecord.fields.effectPlacementId,
  InstantV3EffectResultProposalRecord.fields.effectRequestId,
  InstantV3EffectResultProposalRecord.fields.effectRequestResultPositionKey,
  InstantV3EffectResultProposalRecord.fields.envelopeJson,
  InstantV3EffectResultProposalRecord.fields.envelopeVersion,
  InstantV3EffectResultProposalRecord.fields.eventId,
  InstantV3EffectResultProposalRecord.fields.eventVersion,
  InstantV3EffectResultProposalRecord.fields.executorClientCertificateJson,
  InstantV3EffectResultProposalRecord.fields.executorOriginPolicyGeneration,
  InstantV3EffectResultProposalRecord.fields.executorOriginPolicyId,
  InstantV3EffectResultProposalRecord.fields.executorProcessorCertificateJson,
  InstantV3EffectResultProposalRecord.fields.executorProcessorId,
  InstantV3EffectResultProposalRecord.fields.id,
  InstantV3EffectResultProposalRecord.fields.instantAppId,
  InstantV3EffectResultProposalRecord.fields.occurrenceId,
  InstantV3EffectResultProposalRecord.fields.occurrencePositionKey,
  InstantV3EffectResultProposalRecord.fields.originDeviceId,
  InstantV3EffectResultProposalRecord.fields.originatingProcessorId,
  InstantV3EffectResultProposalRecord.fields.payloadJson,
  InstantV3EffectResultProposalRecord.fields.programId,
  InstantV3EffectResultProposalRecord.fields.programVersion,
  InstantV3EffectResultProposalRecord.fields.proposalId,
  InstantV3EffectResultProposalRecord.fields.proposalKind,
  InstantV3EffectResultProposalRecord.fields.proposalPositionKey,
  InstantV3EffectResultProposalRecord.fields.protocolVersion,
  InstantV3EffectResultProposalRecord.fields.sessionEpochId,
  InstantV3EffectResultProposalRecord.fields.sessionId,
  InstantV3EffectResultProposalRecord.fields.subjectId,
])
const EffectResultSigningJson = S.fromJsonString(EffectResultSigningTuple)

const ClientCertificateJson = S.fromJsonString(OriginClientCertificate)
const ProcessorCertificateJson = S.fromJsonString(OriginProcessorCertificate)

const { claimSignature: _claimSignature, ...EnrollmentClaimSigningFields } =
  InstantV3OriginEnrollmentClaimRecord.fields
/** A Device enrollment claim before its exact signature is attached. */
export const OriginEnrollmentClaimSigningRecord = S.Struct(
  EnrollmentClaimSigningFields,
)
/** A Device enrollment claim before its exact signature is attached. */
export type OriginEnrollmentClaimSigningRecord =
  typeof OriginEnrollmentClaimSigningRecord.Type

const {
  originProposalSignature: _originProposalSignature,
  ...OrdinaryProposalSigningFields
} = InstantV3OrdinaryMessageProposalRecord.fields
/** An ordinary v3 proposal before its exact Processor signature is attached. */
export const OriginOrdinaryProposalSigningRecord = S.Struct(
  OrdinaryProposalSigningFields,
)
/** An ordinary v3 proposal before its exact Processor signature is attached. */
export type OriginOrdinaryProposalSigningRecord =
  typeof OriginOrdinaryProposalSigningRecord.Type

const {
  executorResultSignature: _executorResultSignature,
  ...EffectResultSigningFields
} = InstantV3EffectResultProposalRecord.fields
/** An effect-result v3 proposal before its exact executor signature is attached. */
export const OriginEffectResultSigningRecord = S.Struct(
  EffectResultSigningFields,
)
/** An effect-result v3 proposal before its exact executor signature is attached. */
export type OriginEffectResultSigningRecord =
  typeof OriginEffectResultSigningRecord.Type

const strictDecode =
  <A, I, R>(
    schema: S.Codec<A, I, R>,
    target: OriginProofDecodeError['target'],
  ) =>
  (value: unknown): Effect.Effect<A, OriginProofDecodeError, R> =>
    S.decodeUnknownEffect(schema, {
      errors: 'all',
      onExcessProperty: 'error',
    })(value).pipe(
      Effect.mapError(
        cause =>
          new OriginProofDecodeError({
            cause,
            target,
          }),
      ),
    )

const decodeClientCertificate = strictDecode(
  OriginClientCertificate,
  'ClientCertificate',
)
const decodeClientCertificateJson = strictDecode(
  ClientCertificateJson,
  'ClientCertificate',
)
const decodeClientCertificateClaims = strictDecode(
  OriginClientCertificateClaims,
  'ClientCertificateClaims',
)
const decodeClientId = strictDecode(OriginClientId, 'ClientId')
const decodeDeviceId = strictDecode(OriginDeviceId, 'DeviceId')
const decodeEffectResultProofScope = strictDecode(
  OriginEffectResultProofScope,
  'EffectResultProofScope',
)
const decodeEffectResultProposal = strictDecode(
  InstantV3EffectResultProposalRecord,
  'EffectResultProposal',
)
const decodeEffectResultSigningRecord = strictDecode(
  OriginEffectResultSigningRecord,
  'EffectResultSigningRecord',
)
const decodeEnrollmentClaim = strictDecode(
  InstantV3OriginEnrollmentClaimRecord,
  'EnrollmentClaim',
)
const decodeEnrollmentClaimProofScope = strictDecode(
  OriginEnrollmentClaimProofScope,
  'EnrollmentClaimProofScope',
)
const decodeEnrollmentClaimSigningRecord = strictDecode(
  OriginEnrollmentClaimSigningRecord,
  'EnrollmentClaimSigningRecord',
)
const decodeOrdinaryProposal = strictDecode(
  InstantV3OrdinaryMessageProposalRecord,
  'OrdinaryProposal',
)
const decodeOrdinaryProposalProofScope = strictDecode(
  OriginOrdinaryProposalProofScope,
  'OrdinaryProposalProofScope',
)
const decodeOrdinaryProposalSigningRecord = strictDecode(
  OriginOrdinaryProposalSigningRecord,
  'OrdinaryProposalSigningRecord',
)
const decodeProcessorCertificate = strictDecode(
  OriginProcessorCertificate,
  'ProcessorCertificate',
)
const decodeProcessorCertificateJson = strictDecode(
  ProcessorCertificateJson,
  'ProcessorCertificate',
)
const decodeProcessorCertificateClaims = strictDecode(
  OriginProcessorCertificateClaims,
  'ProcessorCertificateClaims',
)
const decodeProcessorId = strictDecode(OriginProcessorId, 'ProcessorId')
const decodeSignature = strictDecode(OriginSignature, 'Signature')

const validateSecretKey = (
  secretKey: Uint8Array,
  key: OriginProofSecretKeyError['key'],
): Effect.Effect<void, OriginProofSecretKeyError> => {
  if (secretKey.length !== OriginSecretKeyByteLength) {
    return Effect.fail(
      new OriginProofSecretKeyError({ key, reason: 'InvalidLength' }),
    )
  } else if (!p256.utils.isValidSecretKey(secretKey)) {
    return Effect.fail(
      new OriginProofSecretKeyError({ key, reason: 'InvalidScalar' }),
    )
  } else {
    return Effect.void
  }
}

const derivePublicKeyText = (
  secretKey: Uint8Array,
  key: OriginProofSecretKeyError['key'],
): Effect.Effect<string, OriginProofCryptoError | OriginProofSecretKeyError> =>
  validateSecretKey(secretKey, key).pipe(
    Effect.andThen(
      Effect.try({
        try: () => Encoding.encodeBase64Url(p256.getPublicKey(secretKey, true)),
        catch: cause =>
          new OriginProofCryptoError({
            cause,
            operation: 'DerivePublicKey',
          }),
      }),
    ),
  )

const ensureKeyMatches = (
  secretKey: Uint8Array,
  key: OriginProofSecretKeyError['key'],
  expectedId: string,
): Effect.Effect<
  void,
  OriginProofCryptoError | OriginProofKeyMismatch | OriginProofSecretKeyError
> =>
  Effect.gen(function* () {
    const actualId = yield* derivePublicKeyText(secretKey, key)
    if (actualId !== expectedId) {
      return yield* new OriginProofKeyMismatch({
        actualId,
        expectedId,
        key,
      })
    }
  })

const signBytes = (
  bytes: Uint8Array,
  secretKey: Uint8Array,
  key: OriginProofSecretKeyError['key'],
): Effect.Effect<
  OriginSignature,
  OriginProofCryptoError | OriginProofSecretKeyError
> =>
  validateSecretKey(secretKey, key).pipe(
    Effect.andThen(
      Effect.try({
        try: () =>
          p256.sign(bytes, secretKey, {
            extraEntropy: false,
            format: 'compact',
            lowS: true,
            prehash: true,
          }),
        catch: cause =>
          new OriginProofCryptoError({ cause, operation: 'Sign' }),
      }),
    ),
    Effect.map(signature =>
      OriginSignature.make(Encoding.encodeBase64Url(signature)),
    ),
  )

const verifyBytes = (
  bytes: Uint8Array,
  publicKeyText: string,
  signatureText: OriginSignature,
  signer: OriginProofSignatureInvalid['signer'],
): Effect.Effect<void, OriginProofCryptoError | OriginProofSignatureInvalid> =>
  Effect.gen(function* () {
    const publicKey = Result.getOrThrow(Encoding.decodeBase64Url(publicKeyText))
    const signature = Result.getOrThrow(Encoding.decodeBase64Url(signatureText))
    const isValid = yield* Effect.try({
      try: () =>
        p256.verify(signature, bytes, publicKey, {
          format: 'compact',
          lowS: true,
          prehash: true,
        }),
      catch: cause =>
        new OriginProofCryptoError({ cause, operation: 'Verify' }),
    })
    if (!isValid) {
      return yield* new OriginProofSignatureInvalid({ signer })
    }
  }).pipe(
    Effect.catchDefect(cause =>
      Effect.fail(new OriginProofCryptoError({ cause, operation: 'Verify' })),
    ),
  )

const encodeCanonicalBytes = <A, R>(
  schema: S.Codec<A, string, R>,
  value: A,
  target: OriginProofCanonicalizationError['target'],
): Effect.Effect<Uint8Array, OriginProofCanonicalizationError, R> =>
  S.encodeEffect(schema)(value).pipe(
    Effect.map(text => textEncoder.encode(text)),
    Effect.mapError(
      cause => new OriginProofCanonicalizationError({ cause, target }),
    ),
  )

const ensureScopeField = (
  field: OriginProofScopeMismatch['field'],
  expected: number | string,
  actual: number | string,
): Effect.Effect<void, OriginProofScopeMismatch> =>
  expected === actual
    ? Effect.void
    : Effect.fail(new OriginProofScopeMismatch({ actual, expected, field }))

const ensureCertificateChainScope = (
  clientCertificate: OriginClientCertificate,
  processorCertificate: OriginProcessorCertificate,
): Effect.Effect<void, OriginProofScopeMismatch> =>
  Effect.gen(function* () {
    yield* ensureScopeField(
      'instantAppId',
      clientCertificate.instantAppId,
      processorCertificate.instantAppId,
    )
    yield* ensureScopeField(
      'subjectId',
      clientCertificate.subjectId,
      processorCertificate.subjectId,
    )
    yield* ensureScopeField(
      'originDeviceId',
      clientCertificate.originDeviceId,
      processorCertificate.originDeviceId,
    )
    yield* ensureScopeField(
      'clientId',
      clientCertificate.clientId,
      processorCertificate.clientId,
    )
  })

type OriginBoundProposal = Readonly<{
  clientId: string
  instantAppId: string
  originDeviceId: string
  originatingProcessorId: string
  programId: string
  programVersion: number
  protocolVersion: number
  sessionId: string
  subjectId: string
}>

const ensureProcessorProposalScope = (
  proposal: OriginBoundProposal,
  processorCertificate: OriginProcessorCertificate,
  originPolicyId: string,
  originPolicyGeneration: number,
): Effect.Effect<void, OriginProofScopeMismatch> =>
  Effect.gen(function* () {
    yield* ensureScopeField(
      'instantAppId',
      processorCertificate.instantAppId,
      proposal.instantAppId,
    )
    yield* ensureScopeField(
      'subjectId',
      processorCertificate.subjectId,
      proposal.subjectId,
    )
    yield* ensureScopeField(
      'sessionId',
      processorCertificate.sessionId,
      proposal.sessionId,
    )
    yield* ensureScopeField(
      'programId',
      processorCertificate.programId,
      proposal.programId,
    )
    yield* ensureScopeField(
      'programVersion',
      processorCertificate.programVersion,
      proposal.programVersion,
    )
    yield* ensureScopeField(
      'protocolVersion',
      processorCertificate.protocolVersion,
      proposal.protocolVersion,
    )
    yield* ensureScopeField(
      'originDeviceId',
      processorCertificate.originDeviceId,
      proposal.originDeviceId,
    )
    yield* ensureScopeField(
      'clientId',
      processorCertificate.clientId,
      proposal.clientId,
    )
    yield* ensureScopeField(
      'originatingProcessorId',
      processorCertificate.originatingProcessorId,
      proposal.originatingProcessorId,
    )
    yield* ensureScopeField(
      'originPolicyId',
      processorCertificate.originPolicyId,
      originPolicyId,
    )
    yield* ensureScopeField(
      'originPolicyGeneration',
      processorCertificate.originPolicyGeneration,
      originPolicyGeneration,
    )
  })

const ensureOrdinaryExpectedScope = (
  proposal: InstantV3OrdinaryMessageProposalRecordType,
  processorCertificate: OriginProcessorCertificate,
  scope: OriginOrdinaryProposalProofScope,
): Effect.Effect<void, OriginProofScopeMismatch> =>
  Effect.gen(function* () {
    yield* ensureScopeField(
      'instantAppId',
      scope.instantAppId,
      processorCertificate.instantAppId,
    )
    yield* ensureScopeField('subjectId', scope.subjectId, proposal.subjectId)
    yield* ensureScopeField('sessionId', scope.sessionId, proposal.sessionId)
    yield* ensureScopeField('programId', scope.programId, proposal.programId)
    yield* ensureScopeField(
      'programVersion',
      scope.programVersion,
      proposal.programVersion,
    )
    yield* ensureScopeField(
      'protocolVersion',
      scope.protocolVersion,
      proposal.protocolVersion,
    )
    yield* ensureScopeField(
      'originDeviceId',
      scope.originDeviceId,
      proposal.originDeviceId,
    )
    yield* ensureScopeField('clientId', scope.clientId, proposal.clientId)
    yield* ensureScopeField(
      'originatingProcessorId',
      scope.originatingProcessorId,
      proposal.originatingProcessorId,
    )
    yield* ensureScopeField(
      'originPolicyId',
      scope.originPolicyId,
      proposal.originPolicyId,
    )
    yield* ensureScopeField(
      'originPolicyGeneration',
      scope.originPolicyGeneration,
      proposal.originPolicyGeneration,
    )
  })

const ensureEffectResultExpectedScope = (
  proposal: InstantV3EffectResultProposalRecordType,
  processorCertificate: OriginProcessorCertificate,
  scope: OriginEffectResultProofScope,
): Effect.Effect<void, OriginProofScopeMismatch> =>
  Effect.gen(function* () {
    yield* ensureScopeField(
      'instantAppId',
      scope.instantAppId,
      processorCertificate.instantAppId,
    )
    yield* ensureScopeField('subjectId', scope.subjectId, proposal.subjectId)
    yield* ensureScopeField('sessionId', scope.sessionId, proposal.sessionId)
    yield* ensureScopeField('programId', scope.programId, proposal.programId)
    yield* ensureScopeField(
      'programVersion',
      scope.programVersion,
      proposal.programVersion,
    )
    yield* ensureScopeField(
      'protocolVersion',
      scope.protocolVersion,
      proposal.protocolVersion,
    )
    yield* ensureScopeField(
      'originDeviceId',
      scope.originDeviceId,
      proposal.originDeviceId,
    )
    yield* ensureScopeField('clientId', scope.clientId, proposal.clientId)
    yield* ensureScopeField(
      'executorProcessorId',
      scope.executorProcessorId,
      proposal.executorProcessorId,
    )
    yield* ensureScopeField(
      'executorOriginPolicyId',
      scope.executorOriginPolicyId,
      proposal.executorOriginPolicyId,
    )
    yield* ensureScopeField(
      'executorOriginPolicyGeneration',
      scope.executorOriginPolicyGeneration,
      proposal.executorOriginPolicyGeneration,
    )
  })

const verifyDecodedClientCertificate = (
  certificate: OriginClientCertificate,
): Effect.Effect<void, OriginProofError> =>
  Effect.gen(function* () {
    const bytes = yield* canonicalOriginClientCertificateBytes(certificate)
    yield* verifyBytes(
      bytes,
      certificate.originDeviceId,
      certificate.signature,
      'Device',
    )
  })

const verifyDecodedProcessorCertificate = (
  clientCertificate: OriginClientCertificate,
  processorCertificate: OriginProcessorCertificate,
): Effect.Effect<void, OriginProofError> =>
  Effect.gen(function* () {
    yield* ensureCertificateChainScope(clientCertificate, processorCertificate)
    const bytes =
      yield* canonicalOriginProcessorCertificateBytes(processorCertificate)
    yield* verifyBytes(
      bytes,
      processorCertificate.clientId,
      processorCertificate.signature,
      'Client',
    )
  })

/** Strictly decodes a self-certifying Device identity. */
export const decodeOriginDeviceId = (
  value: unknown,
): Effect.Effect<OriginDeviceId, OriginProofDecodeError> =>
  decodeDeviceId(value)

/** Strictly decodes a self-certifying Client identity. */
export const decodeOriginClientId = (
  value: unknown,
): Effect.Effect<OriginClientId, OriginProofDecodeError> =>
  decodeClientId(value)

/** Strictly decodes a self-certifying Processor identity. */
export const decodeOriginProcessorId = (
  value: unknown,
): Effect.Effect<OriginProcessorId, OriginProofDecodeError> =>
  decodeProcessorId(value)

/** Strictly decodes a canonical compact low-S origin signature. */
export const decodeOriginSignature = (
  value: unknown,
): Effect.Effect<OriginSignature, OriginProofDecodeError> =>
  decodeSignature(value)

/** Strictly decodes one canonical Device-signed Client certificate JSON value. */
export const decodeOriginClientCertificateJson = (
  value: unknown,
): Effect.Effect<OriginClientCertificate, OriginProofDecodeError> =>
  decodeClientCertificateJson(value)

/** Strictly decodes one canonical Client-signed Processor certificate JSON value. */
export const decodeOriginProcessorCertificateJson = (
  value: unknown,
): Effect.Effect<OriginProcessorCertificate, OriginProofDecodeError> =>
  decodeProcessorCertificateJson(value)

/** Deterministically derives a Device key pair from supplied host-owned bytes. */
export const deriveOriginDeviceKeyPair = (
  secretKey: Uint8Array,
): Effect.Effect<OriginDeviceKeyPair, OriginProofError> =>
  Effect.gen(function* () {
    const originDeviceId = OriginDeviceId.make(
      yield* derivePublicKeyText(secretKey, 'Device'),
    )
    return { originDeviceId, secretKey: Uint8Array.from(secretKey) }
  })

/** Deterministically derives a Client key pair from supplied host-owned bytes. */
export const deriveOriginClientKeyPair = (
  secretKey: Uint8Array,
): Effect.Effect<OriginClientKeyPair, OriginProofError> =>
  Effect.gen(function* () {
    const clientId = OriginClientId.make(
      yield* derivePublicKeyText(secretKey, 'Client'),
    )
    return { clientId, secretKey: Uint8Array.from(secretKey) }
  })

/** Deterministically derives a Processor key pair from supplied host-owned bytes. */
export const deriveOriginProcessorKeyPair = (
  secretKey: Uint8Array,
): Effect.Effect<OriginProcessorKeyPair, OriginProofError> =>
  Effect.gen(function* () {
    const originatingProcessorId = OriginProcessorId.make(
      yield* derivePublicKeyText(secretKey, 'Processor'),
    )
    return {
      originatingProcessorId,
      secretKey: Uint8Array.from(secretKey),
    }
  })

/** Encodes the exact Device-to-Client certificate signing tuple as UTF-8. */
export const canonicalOriginClientCertificateBytes = (
  certificate: OriginClientCertificateClaims | OriginClientCertificate,
): Effect.Effect<Uint8Array, OriginProofCanonicalizationError> =>
  encodeCanonicalBytes(
    ClientCertificateSigningJson,
    ClientCertificateSigningTuple.make([
      'foldkit.instant.v3.client-certificate',
      originProofFormatVersion,
      certificate.instantAppId,
      certificate.subjectId,
      certificate.originDeviceId,
      certificate.clientId,
    ]),
    'ClientCertificate',
  )

/** Encodes the exact Client-to-Processor certificate signing tuple as UTF-8. */
export const canonicalOriginProcessorCertificateBytes = (
  certificate: OriginProcessorCertificateClaims | OriginProcessorCertificate,
): Effect.Effect<Uint8Array, OriginProofCanonicalizationError> =>
  encodeCanonicalBytes(
    ProcessorCertificateSigningJson,
    ProcessorCertificateSigningTuple.make([
      'foldkit.instant.v3.processor-certificate',
      originProofFormatVersion,
      certificate.instantAppId,
      certificate.subjectId,
      certificate.sessionId,
      certificate.programId,
      certificate.programVersion,
      certificate.protocolVersion,
      certificate.originPolicyId,
      certificate.originPolicyGeneration,
      certificate.originDeviceId,
      certificate.clientId,
      certificate.originatingProcessorId,
    ]),
    'ProcessorCertificate',
  )

const encodeOriginCertificateJson = <A, R>(
  schema: S.Codec<A, string, R>,
  certificate: A,
  target: OriginProofCanonicalizationError['target'],
): Effect.Effect<
  InstantV3OriginCertificateJsonType,
  OriginProofCanonicalizationError,
  R
> =>
  S.encodeEffect(schema)(certificate).pipe(
    Effect.flatMap(value =>
      S.decodeUnknownEffect(InstantV3OriginCertificateJson)(value),
    ),
    Effect.mapError(
      cause => new OriginProofCanonicalizationError({ cause, target }),
    ),
  )

/** Encodes one verified Client certificate as bounded canonical v3 JSON. */
export const encodeOriginClientCertificateJson = (
  certificate: OriginClientCertificate,
): Effect.Effect<
  InstantV3OriginCertificateJsonType,
  OriginProofCanonicalizationError
> =>
  encodeOriginCertificateJson(
    ClientCertificateJson,
    certificate,
    'ClientCertificate',
  )

/** Encodes one verified Processor certificate as bounded canonical v3 JSON. */
export const encodeOriginProcessorCertificateJson = (
  certificate: OriginProcessorCertificate,
): Effect.Effect<
  InstantV3OriginCertificateJsonType,
  OriginProofCanonicalizationError
> =>
  encodeOriginCertificateJson(
    ProcessorCertificateJson,
    certificate,
    'ProcessorCertificate',
  )

/** Encodes every Device enrollment claim field except its signature. */
export const canonicalOriginEnrollmentClaimBytes = (
  claim:
    | OriginEnrollmentClaimSigningRecord
    | InstantV3OriginEnrollmentClaimRecordType,
): Effect.Effect<Uint8Array, OriginProofCanonicalizationError> =>
  encodeCanonicalBytes(
    EnrollmentClaimSigningJson,
    EnrollmentClaimSigningTuple.make([
      originEnrollmentClaimDomain,
      originProofFormatVersion,
      claim.claimedAtMs,
      claim.enrollmentClaimId,
      claim.enrollmentClaimPositionKey,
      claim.id,
      claim.instantAppId,
      claim.originDeviceId,
      claim.protocolVersion,
      claim.subjectId,
    ]),
    'EnrollmentClaim',
  )

/** Encodes every ordinary proposal field except its origin signature. */
export const canonicalOriginOrdinaryProposalBytes = (
  proposal:
    | OriginOrdinaryProposalSigningRecord
    | InstantV3OrdinaryMessageProposalRecordType,
): Effect.Effect<Uint8Array, OriginProofCanonicalizationError> =>
  encodeCanonicalBytes(
    OrdinaryProposalSigningJson,
    OrdinaryProposalSigningTuple.make([
      originOrdinaryProposalDomain,
      originProofFormatVersion,
      proposal.actorId,
      proposal.actorSequence,
      proposal.actorSequencePositionKey,
      proposal.admissionClaimJson,
      proposal.admissionOccurrenceId,
      proposal.appSubjectDigest,
      proposal.causationOccurrenceId,
      proposal.clientId,
      proposal.correlationId,
      proposal.createdAtMs,
      proposal.envelopeJson,
      proposal.envelopeVersion,
      proposal.eventId,
      proposal.eventVersion,
      proposal.id,
      proposal.instantAppId,
      proposal.messageIdempotencyKey,
      proposal.messageIdempotencyPositionKey,
      proposal.occurrenceId,
      proposal.occurrencePositionKey,
      proposal.originClientCertificateJson,
      proposal.originDeviceId,
      proposal.originPolicyGeneration,
      proposal.originPolicyId,
      proposal.originatingProcessorId,
      proposal.originProcessorCertificateJson,
      proposal.payloadJson,
      proposal.programId,
      proposal.programVersion,
      proposal.protocolVersion,
      proposal.proposalId,
      proposal.proposalKind,
      proposal.proposalPositionKey,
      proposal.sessionEpochId,
      proposal.sessionId,
      proposal.subjectId,
    ]),
    'OrdinaryProposal',
  )

/** Encodes the complete signed ordinary proof for stable causal hashing. */
export const canonicalOriginOrdinaryProofBytes = (
  proposal: InstantV3OrdinaryMessageProposalRecordType,
): Effect.Effect<Uint8Array, OriginProofError> =>
  Effect.gen(function* () {
    const signature = yield* decodeSignature(proposal.originProposalSignature)
    const signingBytes = yield* canonicalOriginOrdinaryProposalBytes(proposal)
    return yield* encodeCanonicalBytes(
      OrdinaryProofDigestJson,
      OrdinaryProofDigestTuple.make([
        originOrdinaryProofDigestDomain,
        originProofFormatVersion,
        signature,
        Encoding.encodeBase64Url(signingBytes),
      ]),
      'OrdinaryProof',
    )
  })

/** Computes the lowercase SHA-256 digest retained by causal effect lineage. */
export const digestOriginOrdinaryMessageProposalProof = (
  proposal: unknown,
): Effect.Effect<InstantV3Sha256DigestType, OriginProofError> =>
  Effect.gen(function* () {
    const decodedProposal = yield* decodeOrdinaryProposal(proposal)
    const bytes = yield* canonicalOriginOrdinaryProofBytes(decodedProposal)
    const digest = yield* Effect.try({
      try: () => sha256(bytes),
      catch: cause =>
        new OriginProofCryptoError({ cause, operation: 'Digest' }),
    })
    return InstantV3Sha256Digest.make(Encoding.encodeHex(digest))
  })

/** Encodes every effect-result proposal field except its executor signature. */
export const canonicalOriginEffectResultBytes = (
  proposal:
    | OriginEffectResultSigningRecord
    | InstantV3EffectResultProposalRecordType,
): Effect.Effect<Uint8Array, OriginProofCanonicalizationError> =>
  encodeCanonicalBytes(
    EffectResultSigningJson,
    EffectResultSigningTuple.make([
      originEffectResultDomain,
      originProofFormatVersion,
      proposal.actorId,
      proposal.actorSequence,
      proposal.actorSequencePositionKey,
      proposal.appSubjectDigest,
      proposal.causalAcceptedSequence,
      proposal.causalAudience,
      proposal.causalMessageCategory,
      proposal.causalOccurrenceId,
      proposal.causalOriginDeviceId,
      proposal.causalOriginPolicyGeneration,
      proposal.causalOriginPolicyId,
      proposal.causalOriginProofDigest,
      proposal.causalOriginatingProcessorId,
      proposal.causalPolicyGeneration,
      proposal.causalProposalId,
      proposal.causationOccurrenceId,
      proposal.clientId,
      proposal.correlationId,
      proposal.createdAtMs,
      proposal.effectAssignmentGeneration,
      proposal.effectCancellationGeneration,
      proposal.effectIdempotencyKey,
      proposal.effectIdempotencyPositionKey,
      proposal.effectPlacementId,
      proposal.effectRequestId,
      proposal.effectRequestResultPositionKey,
      proposal.envelopeJson,
      proposal.envelopeVersion,
      proposal.eventId,
      proposal.eventVersion,
      proposal.executorClientCertificateJson,
      proposal.executorOriginPolicyGeneration,
      proposal.executorOriginPolicyId,
      proposal.executorProcessorCertificateJson,
      proposal.executorProcessorId,
      proposal.id,
      proposal.instantAppId,
      proposal.occurrenceId,
      proposal.occurrencePositionKey,
      proposal.originDeviceId,
      proposal.originatingProcessorId,
      proposal.payloadJson,
      proposal.programId,
      proposal.programVersion,
      proposal.proposalId,
      proposal.proposalKind,
      proposal.proposalPositionKey,
      proposal.protocolVersion,
      proposal.sessionEpochId,
      proposal.sessionId,
      proposal.subjectId,
    ]),
    'EffectResultProposal',
  )

/** Creates a Device-signed Client certificate after checking key ownership. */
export const makeOriginClientCertificate = (
  claims: OriginClientCertificateClaims,
  deviceSecretKey: Uint8Array,
): Effect.Effect<OriginClientCertificate, OriginProofError> =>
  Effect.gen(function* () {
    const decodedClaims = yield* decodeClientCertificateClaims(claims)
    yield* ensureKeyMatches(
      deviceSecretKey,
      'Device',
      decodedClaims.originDeviceId,
    )
    const bytes = yield* canonicalOriginClientCertificateBytes(decodedClaims)
    const signature = yield* signBytes(bytes, deviceSecretKey, 'Device')
    return OriginClientCertificate.make({
      ...decodedClaims,
      signature,
      version: originProofFormatVersion,
    })
  })

/** Creates a Client-signed Processor certificate after checking key ownership. */
export const makeOriginProcessorCertificate = (
  claims: OriginProcessorCertificateClaims,
  clientSecretKey: Uint8Array,
): Effect.Effect<OriginProcessorCertificate, OriginProofError> =>
  Effect.gen(function* () {
    const decodedClaims = yield* decodeProcessorCertificateClaims(claims)
    yield* ensureKeyMatches(clientSecretKey, 'Client', decodedClaims.clientId)
    const bytes = yield* canonicalOriginProcessorCertificateBytes(decodedClaims)
    const signature = yield* signBytes(bytes, clientSecretKey, 'Client')
    return OriginProcessorCertificate.make({
      ...decodedClaims,
      signature,
      version: originProofFormatVersion,
    })
  })

/** Verifies a strictly decoded Device-signed Client certificate. */
export const verifyOriginClientCertificate = (
  certificate: unknown,
): Effect.Effect<OriginClientCertificate, OriginProofError> =>
  Effect.gen(function* () {
    const decoded = yield* decodeClientCertificate(certificate)
    yield* verifyDecodedClientCertificate(decoded)
    return decoded
  })

/** Verifies a strict Device-to-Client-to-Processor certificate chain. */
export const verifyOriginProcessorCertificate = (
  clientCertificate: unknown,
  processorCertificate: unknown,
): Effect.Effect<OriginProcessorCertificate, OriginProofError> =>
  Effect.gen(function* () {
    const decodedClientCertificate =
      yield* verifyOriginClientCertificate(clientCertificate)
    const decodedProcessorCertificate =
      yield* decodeProcessorCertificate(processorCertificate)
    yield* verifyDecodedProcessorCertificate(
      decodedClientCertificate,
      decodedProcessorCertificate,
    )
    return decodedProcessorCertificate
  })

const verifyEmbeddedCertificateChain = (
  clientCertificateJson: InstantV3OriginCertificateJsonType,
  processorCertificateJson: InstantV3OriginCertificateJsonType,
): Effect.Effect<
  readonly [OriginClientCertificate, OriginProcessorCertificate],
  OriginProofError
> =>
  Effect.gen(function* () {
    const clientCertificate = yield* decodeClientCertificateJson(
      clientCertificateJson,
    )
    const processorCertificate = yield* decodeProcessorCertificateJson(
      processorCertificateJson,
    )
    yield* verifyDecodedClientCertificate(clientCertificate)
    yield* verifyDecodedProcessorCertificate(
      clientCertificate,
      processorCertificate,
    )
    return Tuple.make(clientCertificate, processorCertificate)
  })

/** Signs one exact Device enrollment claim after checking Device-key ownership. */
export const signOriginEnrollmentClaim = (
  claim: OriginEnrollmentClaimSigningRecord,
  deviceSecretKey: Uint8Array,
): Effect.Effect<InstantV3OriginEnrollmentClaimRecordType, OriginProofError> =>
  Effect.gen(function* () {
    const decodedClaim = yield* decodeEnrollmentClaimSigningRecord(claim)
    yield* decodeDeviceId(decodedClaim.originDeviceId)
    yield* ensureKeyMatches(
      deviceSecretKey,
      'Device',
      decodedClaim.originDeviceId,
    )
    const bytes = yield* canonicalOriginEnrollmentClaimBytes(decodedClaim)
    const claimSignature = yield* signBytes(bytes, deviceSecretKey, 'Device')
    return yield* decodeEnrollmentClaim({
      ...decodedClaim,
      claimSignature,
    })
  })

/** Verifies one Device enrollment claim against authenticated app-subject scope. */
export const verifyOriginEnrollmentClaim = (
  claim: unknown,
  expectedScope: OriginEnrollmentClaimProofScope,
): Effect.Effect<InstantV3OriginEnrollmentClaimRecordType, OriginProofError> =>
  Effect.gen(function* () {
    const decodedClaim = yield* decodeEnrollmentClaim(claim)
    const decodedScope = yield* decodeEnrollmentClaimProofScope(expectedScope)
    const originDeviceId = yield* decodeDeviceId(decodedClaim.originDeviceId)
    const claimSignature = yield* decodeSignature(decodedClaim.claimSignature)
    yield* ensureScopeField(
      'instantAppId',
      decodedScope.instantAppId,
      decodedClaim.instantAppId,
    )
    yield* ensureScopeField(
      'subjectId',
      decodedScope.subjectId,
      decodedClaim.subjectId,
    )
    const bytes = yield* canonicalOriginEnrollmentClaimBytes(decodedClaim)
    yield* verifyBytes(bytes, originDeviceId, claimSignature, 'Device')
    return decodedClaim
  })

/** Signs one ordinary v3 Message proposal through its embedded origin chain. */
export const signOriginOrdinaryMessageProposal = (
  proposal: OriginOrdinaryProposalSigningRecord,
  processorSecretKey: Uint8Array,
): Effect.Effect<
  InstantV3OrdinaryMessageProposalRecordType,
  OriginProofError
> =>
  Effect.gen(function* () {
    const decodedProposal = yield* decodeOrdinaryProposalSigningRecord(proposal)
    const [, processorCertificate] = yield* verifyEmbeddedCertificateChain(
      decodedProposal.originClientCertificateJson,
      decodedProposal.originProcessorCertificateJson,
    )
    yield* decodeDeviceId(decodedProposal.originDeviceId)
    yield* decodeClientId(decodedProposal.clientId)
    yield* decodeProcessorId(decodedProposal.originatingProcessorId)
    yield* ensureProcessorProposalScope(
      decodedProposal,
      processorCertificate,
      decodedProposal.originPolicyId,
      decodedProposal.originPolicyGeneration,
    )
    yield* ensureKeyMatches(
      processorSecretKey,
      'Processor',
      decodedProposal.originatingProcessorId,
    )
    const bytes = yield* canonicalOriginOrdinaryProposalBytes(decodedProposal)
    const originProposalSignature = yield* signBytes(
      bytes,
      processorSecretKey,
      'Processor',
    )
    return yield* decodeOrdinaryProposal({
      ...decodedProposal,
      originProposalSignature,
    })
  })

/** Verifies one ordinary v3 Message proposal and its current authority scope. */
export const verifyOriginOrdinaryMessageProposal = (
  proposal: unknown,
  expectedScope: OriginOrdinaryProposalProofScope,
): Effect.Effect<
  InstantV3OrdinaryMessageProposalRecordType,
  OriginProofError
> =>
  Effect.gen(function* () {
    const decodedProposal = yield* decodeOrdinaryProposal(proposal)
    const decodedScope = yield* decodeOrdinaryProposalProofScope(expectedScope)
    const [, processorCertificate] = yield* verifyEmbeddedCertificateChain(
      decodedProposal.originClientCertificateJson,
      decodedProposal.originProcessorCertificateJson,
    )
    yield* decodeDeviceId(decodedProposal.originDeviceId)
    yield* decodeClientId(decodedProposal.clientId)
    yield* decodeProcessorId(decodedProposal.originatingProcessorId)
    const signature = yield* decodeSignature(
      decodedProposal.originProposalSignature,
    )
    yield* ensureProcessorProposalScope(
      decodedProposal,
      processorCertificate,
      decodedProposal.originPolicyId,
      decodedProposal.originPolicyGeneration,
    )
    yield* ensureOrdinaryExpectedScope(
      decodedProposal,
      processorCertificate,
      decodedScope,
    )
    const bytes = yield* canonicalOriginOrdinaryProposalBytes(decodedProposal)
    yield* verifyBytes(
      bytes,
      processorCertificate.originatingProcessorId,
      signature,
      'Processor',
    )
    return decodedProposal
  })

/** Signs one effect-result proposal through its distinct executor chain. */
export const signOriginEffectResultProposal = (
  proposal: OriginEffectResultSigningRecord,
  executorSecretKey: Uint8Array,
): Effect.Effect<InstantV3EffectResultProposalRecordType, OriginProofError> =>
  Effect.gen(function* () {
    const decodedProposal = yield* decodeEffectResultSigningRecord(proposal)
    const [, processorCertificate] = yield* verifyEmbeddedCertificateChain(
      decodedProposal.executorClientCertificateJson,
      decodedProposal.executorProcessorCertificateJson,
    )
    yield* decodeDeviceId(decodedProposal.originDeviceId)
    yield* decodeClientId(decodedProposal.clientId)
    yield* decodeProcessorId(decodedProposal.originatingProcessorId)
    yield* ensureProcessorProposalScope(
      decodedProposal,
      processorCertificate,
      decodedProposal.executorOriginPolicyId,
      decodedProposal.executorOriginPolicyGeneration,
    )
    yield* ensureKeyMatches(
      executorSecretKey,
      'Processor',
      decodedProposal.executorProcessorId,
    )
    const bytes = yield* canonicalOriginEffectResultBytes(decodedProposal)
    const executorResultSignature = yield* signBytes(
      bytes,
      executorSecretKey,
      'Processor',
    )
    return yield* decodeEffectResultProposal({
      ...decodedProposal,
      executorResultSignature,
    })
  })

/** Verifies one effect-result proposal and its current executor authority scope. */
export const verifyOriginEffectResultProposal = (
  proposal: unknown,
  expectedScope: OriginEffectResultProofScope,
): Effect.Effect<InstantV3EffectResultProposalRecordType, OriginProofError> =>
  Effect.gen(function* () {
    const decodedProposal = yield* decodeEffectResultProposal(proposal)
    const decodedScope = yield* decodeEffectResultProofScope(expectedScope)
    const [, processorCertificate] = yield* verifyEmbeddedCertificateChain(
      decodedProposal.executorClientCertificateJson,
      decodedProposal.executorProcessorCertificateJson,
    )
    yield* decodeDeviceId(decodedProposal.originDeviceId)
    yield* decodeClientId(decodedProposal.clientId)
    yield* decodeProcessorId(decodedProposal.originatingProcessorId)
    const signature = yield* decodeSignature(
      decodedProposal.executorResultSignature,
    )
    yield* ensureProcessorProposalScope(
      decodedProposal,
      processorCertificate,
      decodedProposal.executorOriginPolicyId,
      decodedProposal.executorOriginPolicyGeneration,
    )
    yield* ensureEffectResultExpectedScope(
      decodedProposal,
      processorCertificate,
      decodedScope,
    )
    const bytes = yield* canonicalOriginEffectResultBytes(decodedProposal)
    yield* verifyBytes(
      bytes,
      processorCertificate.originatingProcessorId,
      signature,
      'ExecutorProcessor',
    )
    return decodedProposal
  })
