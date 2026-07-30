import { Schema as S } from 'effect'

/** The one supported wire and cryptographic protocol version. */
export const TransferProtocolVersion = S.Literals(['WalletVaultTransfer/1'])
/** The one supported wire and cryptographic protocol version. */
export type TransferProtocolVersion = typeof TransferProtocolVersion.Type

/** The protocol version used by new transfers. */
export const transferProtocolVersion: TransferProtocolVersion =
  'WalletVaultTransfer/1'

/** A fixed deployment environment selected by the host, never an arbitrary URL. */
export const TransferEnvironment = S.Literals([
  'Development',
  'Staging',
  'Production',
])
/** A fixed deployment environment selected by the host, never an arbitrary URL. */
export type TransferEnvironment = typeof TransferEnvironment.Type

const BoundedIdentity = S.String.check(S.isLengthBetween(1, 256))
const TransferId = S.String.check(S.isPattern(/^[A-Za-z0-9_-]{22}$/u))
const Sha256Base64Url = S.String.check(S.isPattern(/^[A-Za-z0-9_-]{43}$/u))
const NonceBase64Url = S.String.check(S.isPattern(/^[A-Za-z0-9_-]{16}$/u))
const AuthenticationTagBase64Url = S.String.check(
  S.isPattern(/^[A-Za-z0-9_-]{22}$/u),
)
const CiphertextBase64Url = S.String.check(S.isBase64Url(), S.isNonEmpty())
const TimestampMs = S.Int.check(S.isGreaterThanOrEqualTo(0))
const Secret256Bits = S.Uint8Array.check(S.isLengthBetween(32, 32))

/** A principal supplied by an authenticated host boundary, not a request body. */
export const AuthenticatedPrincipal = S.Struct({
  issuer: BoundedIdentity,
  subject: BoundedIdentity,
})
/** A principal supplied by an authenticated host boundary, not a request body. */
export type AuthenticatedPrincipal = typeof AuthenticatedPrincipal.Type

/** A Redacted independent 256-bit AES key carried only by the transfer ticket. */
export const TransferEncryptionKey = S.Redacted(Secret256Bits, {
  label: 'wallet-transfer-encryption-key',
  disallowJsonEncode: true,
})
/** A Redacted independent 256-bit AES key carried only by the transfer ticket. */
export type TransferEncryptionKey = typeof TransferEncryptionKey.Type

/** A Redacted independent 256-bit one-time claim token. */
export const TransferClaimToken = S.Redacted(Secret256Bits, {
  label: 'wallet-transfer-claim-token',
  disallowJsonEncode: true,
})
/** A Redacted independent 256-bit one-time claim token. */
export type TransferClaimToken = typeof TransferClaimToken.Type

/** Independently generated key and claim-token material before relay reservation. */
export const TransferSecrets = S.Struct({
  encryptionKey: TransferEncryptionKey,
  claimToken: TransferClaimToken,
})
/** Independently generated key and claim-token material before relay reservation. */
export type TransferSecrets = typeof TransferSecrets.Type

/** The secret QR ticket exchanged directly between the owner and recipient. */
export const TransferTicket = S.Struct({
  protocolVersion: TransferProtocolVersion,
  environment: TransferEnvironment,
  transferId: TransferId,
  encryptionKey: TransferEncryptionKey,
  claimToken: TransferClaimToken,
  expiresAtHintMs: TimestampMs,
})
/** The secret QR ticket exchanged directly between the owner and recipient. */
export type TransferTicket = typeof TransferTicket.Type

/** The safe subset of a transfer ticket allowed in Foldkit public state. */
export const TransferTicketPublicProjection = S.Struct({
  protocolVersion: TransferProtocolVersion,
  environment: TransferEnvironment,
  transferId: TransferId,
  expiresAtHintMs: TimestampMs,
})
/** The safe subset of a transfer ticket allowed in Foldkit public state. */
export type TransferTicketPublicProjection =
  typeof TransferTicketPublicProjection.Type

/** Projects a secret ticket into the only ticket shape allowed in public state. */
export const projectTransferTicket = (
  ticket: TransferTicket,
): TransferTicketPublicProjection =>
  TransferTicketPublicProjection.make({
    protocolVersion: ticket.protocolVersion,
    environment: ticket.environment,
    transferId: ticket.transferId,
    expiresAtHintMs: ticket.expiresAtHintMs,
  })

/** Public immutable metadata allocated by the authenticated relay. */
export const TransferReservation = S.Struct({
  protocolVersion: TransferProtocolVersion,
  environment: TransferEnvironment,
  transferId: TransferId,
  serverExpiresAtMs: TimestampMs,
  ownerBinding: Sha256Base64Url,
})
/** Public immutable metadata allocated by the authenticated relay. */
export type TransferReservation = typeof TransferReservation.Type

/** A SHA-256 verifier sent to the relay instead of the claim token. */
export const TransferClaimVerifier = Sha256Base64Url
/** A SHA-256 verifier sent to the relay instead of the claim token. */
export type TransferClaimVerifier = typeof TransferClaimVerifier.Type

/** Input for allocating a relay reservation. */
export const ReserveTransferRequest = S.Struct({
  claimVerifier: TransferClaimVerifier,
})
/** Input for allocating a relay reservation. */
export type ReserveTransferRequest = typeof ReserveTransferRequest.Type

/** An Expo Crypto compatible AES-GCM relay envelope with a detached tag. */
export const EncryptedRelayCapsule = S.Struct({
  protocolVersion: TransferProtocolVersion,
  environment: TransferEnvironment,
  transferId: TransferId,
  serverExpiresAtMs: TimestampMs,
  ownerBinding: Sha256Base64Url,
  nonce: NonceBase64Url,
  ciphertext: CiphertextBase64Url,
  authenticationTag: AuthenticationTagBase64Url,
})
/** An Expo Crypto compatible AES-GCM relay envelope with a detached tag. */
export type EncryptedRelayCapsule = typeof EncryptedRelayCapsule.Type

/** A one-time claim with no caller-controlled claimant identity. */
export const TransferClaim = S.Struct({
  transferId: TransferId,
  claimToken: TransferClaimToken,
})
/** A one-time claim with no caller-controlled claimant identity. */
export type TransferClaim = typeof TransferClaim.Type

/** A transfer identifier used by owner and winner lifecycle operations. */
export const TransferReference = S.Struct({
  transferId: TransferId,
})
/** A transfer identifier used by owner and winner lifecycle operations. */
export type TransferReference = typeof TransferReference.Type

/** A relay reservation outcome. */
export const ReservedTransfer = S.TaggedStruct('ReservedTransfer', {
  reservation: TransferReservation,
})
/** A relay reservation outcome. */
export type ReservedTransfer = typeof ReservedTransfer.Type

/** A successful encrypted capsule publication outcome. */
export const PublishedTransfer = S.TaggedStruct('PublishedTransfer', {
  transferId: TransferId,
  serverExpiresAtMs: TimestampMs,
})
/** A successful encrypted capsule publication outcome. */
export type PublishedTransfer = typeof PublishedTransfer.Type

/** The first successful claim by the one winning authenticated principal. */
export const WonTransferClaim = S.TaggedStruct('WonTransferClaim', {
  capsule: EncryptedRelayCapsule,
})
/** The first successful claim by the one winning authenticated principal. */
export type WonTransferClaim = typeof WonTransferClaim.Type

/** An idempotent retry by the already winning authenticated principal. */
export const RetriedWinningTransferClaim = S.TaggedStruct(
  'RetriedWinningTransferClaim',
  {
    capsule: EncryptedRelayCapsule,
  },
)
/** An idempotent retry by the already winning authenticated principal. */
export type RetriedWinningTransferClaim =
  typeof RetriedWinningTransferClaim.Type

/** The only successful claim outcomes. */
export const TransferClaimOutcome = S.Union([
  WonTransferClaim,
  RetriedWinningTransferClaim,
])
/** The only successful claim outcomes. */
export type TransferClaimOutcome = typeof TransferClaimOutcome.Type

/** A winner acknowledgement outcome. */
export const AcknowledgedTransfer = S.TaggedStruct('AcknowledgedTransfer', {
  transferId: TransferId,
})
/** A winner acknowledgement outcome. */
export type AcknowledgedTransfer = typeof AcknowledgedTransfer.Type

/** An owner cancellation outcome. */
export const CancelledTransfer = S.TaggedStruct('CancelledTransfer', {
  transferId: TransferId,
})
/** An owner cancellation outcome. */
export type CancelledTransfer = typeof CancelledTransfer.Type

/** An explicit owner purge outcome. */
export const PurgedTransfer = S.TaggedStruct('PurgedTransfer', {
  transferId: TransferId,
})
/** An explicit owner purge outcome. */
export type PurgedTransfer = typeof PurgedTransfer.Type

/** A maintenance purge outcome containing only an aggregate count. */
export const PurgedExpiredTransfers = S.TaggedStruct('PurgedExpiredTransfers', {
  count: S.Int.check(S.isGreaterThanOrEqualTo(0)),
})
/** A maintenance purge outcome containing only an aggregate count. */
export type PurgedExpiredTransfers = typeof PurgedExpiredTransfers.Type

/** Every public authenticated relay outcome. */
export const AuthenticatedRelayOutcome = S.Union([
  ReservedTransfer,
  PublishedTransfer,
  WonTransferClaim,
  RetriedWinningTransferClaim,
  AcknowledgedTransfer,
  CancelledTransfer,
  PurgedTransfer,
  PurgedExpiredTransfers,
])
/** Every public authenticated relay outcome. */
export type AuthenticatedRelayOutcome = typeof AuthenticatedRelayOutcome.Type

/** Ticket failure codes that never echo ticket contents. */
export const TransferTicketErrorCode = S.Literals(['InvalidTicket'])
/** Ticket failure codes that never echo ticket contents. */
export type TransferTicketErrorCode = typeof TransferTicketErrorCode.Type

/** A sanitized ticket codec failure. */
export class TransferTicketError extends S.TaggedErrorClass<TransferTicketError>()(
  'TransferTicketError',
  {
    code: TransferTicketErrorCode,
  },
) {}

/** Cryptographic failure codes that do not distinguish tamper sources. */
export const TransferCryptoErrorCode = S.Literals([
  'Unavailable',
  'InvalidKeyMaterial',
  'InvalidEnvelope',
])
/** Cryptographic failure codes that do not distinguish tamper sources. */
export type TransferCryptoErrorCode = typeof TransferCryptoErrorCode.Type

/** A sanitized cryptographic failure with no host cause or sensitive bytes. */
export class TransferCryptoError extends S.TaggedErrorClass<TransferCryptoError>()(
  'TransferCryptoError',
  {
    code: TransferCryptoErrorCode,
  },
) {}

/** Relay operations named without transfer or principal data. */
export const AuthenticatedRelayOperation = S.Literals([
  'Reserve',
  'Publish',
  'Claim',
  'Acknowledge',
  'Cancel',
  'Purge',
  'PurgeExpired',
])
/** Relay operations named without transfer or principal data. */
export type AuthenticatedRelayOperation =
  typeof AuthenticatedRelayOperation.Type

/** Relay failure codes that do not reveal transfer existence. */
export const AuthenticatedRelayErrorCode = S.Literals([
  'Unavailable',
  'InvalidRequest',
  'Conflict',
])
/** Relay failure codes that do not reveal transfer existence. */
export type AuthenticatedRelayErrorCode =
  typeof AuthenticatedRelayErrorCode.Type

/** A sanitized authenticated relay failure. */
export class AuthenticatedRelayError extends S.TaggedErrorClass<AuthenticatedRelayError>()(
  'AuthenticatedRelayError',
  {
    operation: AuthenticatedRelayOperation,
    code: AuthenticatedRelayErrorCode,
  },
) {}

/** Host record-port failure codes that contain no storage detail. */
export const WalletTransferRecordPortErrorCode = S.Literals([
  'Unavailable',
  'InvalidRecord',
  'Conflict',
])
/** Host record-port failure codes that contain no storage detail. */
export type WalletTransferRecordPortErrorCode =
  typeof WalletTransferRecordPortErrorCode.Type

/** A sanitized host record-port failure. */
export class WalletTransferRecordPortError extends S.TaggedErrorClass<WalletTransferRecordPortError>()(
  'WalletTransferRecordPortError',
  {
    code: WalletTransferRecordPortErrorCode,
  },
) {}
