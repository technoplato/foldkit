import { Effect, Encoding, Redacted, Result, Schema as S } from 'effect'

import {
  TransferReservation,
  TransferSecrets,
  TransferTicket,
  TransferTicketError,
  transferProtocolVersion,
} from './protocol.js'

const transferTicketQrPrefix = 'wallet-transfer-ticket.v1.'
const maximumTransferTicketCharacterLength = 512
const SecretBase64Url = S.String.check(S.isPattern(/^[A-Za-z0-9_-]{43}$/u))
const TransferTicketWire = S.Tuple([
  TransferReservation.fields.protocolVersion,
  TransferReservation.fields.environment,
  TransferReservation.fields.transferId,
  SecretBase64Url,
  SecretBase64Url,
  TransferTicket.fields.expiresAtHintMs,
])

const invalidTicket = () => new TransferTicketError({ code: 'InvalidTicket' })

/** Builds a ticket from server-owned reservation metadata and client secrets. */
export const makeTransferTicket = (
  reservation: TransferReservation,
  secrets: TransferSecrets,
): Effect.Effect<TransferTicket, TransferTicketError> =>
  Effect.gen(function* () {
    const validatedReservation = yield* S.decodeUnknownEffect(
      TransferReservation,
    )(reservation).pipe(Effect.mapError(invalidTicket))
    const validatedSecrets = yield* S.decodeUnknownEffect(TransferSecrets)(
      secrets,
    ).pipe(Effect.mapError(invalidTicket))
    return TransferTicket.make({
      protocolVersion: transferProtocolVersion,
      environment: validatedReservation.environment,
      transferId: validatedReservation.transferId,
      encryptionKey: validatedSecrets.encryptionKey,
      claimToken: validatedSecrets.claimToken,
      expiresAtHintMs: validatedReservation.serverExpiresAtMs,
    })
  })

/** Encodes a validated ticket for QR transport and keeps the payload Redacted. */
export const encodeTransferTicketForQr = (
  ticket: TransferTicket,
): Effect.Effect<Redacted.Redacted<string>, TransferTicketError> =>
  Effect.gen(function* () {
    const validatedTicket = yield* S.decodeUnknownEffect(TransferTicket)(
      ticket,
    ).pipe(Effect.mapError(invalidTicket))
    const wire = TransferTicketWire.make([
      validatedTicket.protocolVersion,
      validatedTicket.environment,
      validatedTicket.transferId,
      Encoding.encodeBase64Url(Redacted.value(validatedTicket.encryptionKey)),
      Encoding.encodeBase64Url(Redacted.value(validatedTicket.claimToken)),
      validatedTicket.expiresAtHintMs,
    ])
    return Redacted.make(
      `${transferTicketQrPrefix}${Encoding.encodeBase64Url(
        JSON.stringify(wire),
      )}`,
      { label: 'wallet-transfer-qr-ticket' },
    )
  })

/** Decodes a Redacted QR payload with no URL or extensible routing field. */
export const decodeTransferTicketFromQr = (
  payload: Redacted.Redacted<string>,
): Effect.Effect<TransferTicket, TransferTicketError> =>
  Effect.gen(function* () {
    const encodedPayload = yield* Effect.try({
      try: () => Redacted.value(payload),
      catch: invalidTicket,
    })
    if (
      encodedPayload.length > maximumTransferTicketCharacterLength ||
      !encodedPayload.startsWith(transferTicketQrPrefix)
    ) {
      return yield* Effect.fail(invalidTicket())
    }
    const jsonResult = Encoding.decodeBase64UrlString(
      encodedPayload.slice(transferTicketQrPrefix.length),
    )
    if (Result.isFailure(jsonResult)) {
      return yield* Effect.fail(invalidTicket())
    }
    const parsed = yield* Effect.try({
      try: () => JSON.parse(jsonResult.success),
      catch: invalidTicket,
    })
    const wire = yield* S.decodeUnknownEffect(TransferTicketWire)(parsed).pipe(
      Effect.mapError(invalidTicket),
    )
    const [
      protocolVersion,
      environment,
      transferId,
      encodedKey,
      encodedToken,
      expiresAtHintMs,
    ] = wire
    const keyResult = Encoding.decodeBase64Url(encodedKey)
    const tokenResult = Encoding.decodeBase64Url(encodedToken)
    if (
      Result.isFailure(keyResult) ||
      Result.isFailure(tokenResult) ||
      keyResult.success.byteLength !== 32 ||
      tokenResult.success.byteLength !== 32
    ) {
      return yield* Effect.fail(invalidTicket())
    }
    const canonicalWire = TransferTicketWire.make([
      protocolVersion,
      environment,
      transferId,
      Encoding.encodeBase64Url(keyResult.success),
      Encoding.encodeBase64Url(tokenResult.success),
      expiresAtHintMs,
    ])
    const canonicalPayload = `${transferTicketQrPrefix}${Encoding.encodeBase64Url(
      JSON.stringify(canonicalWire),
    )}`
    if (canonicalPayload !== encodedPayload) {
      return yield* Effect.fail(invalidTicket())
    }
    return TransferTicket.make({
      protocolVersion,
      environment,
      transferId,
      encryptionKey: Redacted.make(keyResult.success, {
        label: 'wallet-transfer-encryption-key',
      }),
      claimToken: Redacted.make(tokenResult.success, {
        label: 'wallet-transfer-claim-token',
      }),
      expiresAtHintMs,
    })
  })
