import { Effect, Encoding, Redacted, Result, Schema as S } from 'effect'

import {
  type TransferReservation,
  type TransferSecrets,
  TransferTicket,
  TransferTicketError,
  transferProtocolVersion,
} from './protocol.js'

const transferTicketQrPrefix = 'wallet-transfer-ticket.v1.'
const SecretBase64Url = S.String.check(S.isPattern(/^[A-Za-z0-9_-]{43}$/u))
const TransferTicketWire = S.Tuple([
  S.Literals(['WalletVaultTransfer/1']),
  S.Literals(['Development', 'Staging', 'Production']),
  S.String.check(S.isPattern(/^[A-Za-z0-9_-]{22}$/u)),
  SecretBase64Url,
  SecretBase64Url,
  S.Int.check(S.isGreaterThanOrEqualTo(0)),
])

const invalidTicket = () => new TransferTicketError({ code: 'InvalidTicket' })

/** Builds a ticket from server-owned reservation metadata and client secrets. */
export const makeTransferTicket = (
  reservation: TransferReservation,
  secrets: TransferSecrets,
): Effect.Effect<TransferTicket, TransferTicketError> =>
  Effect.gen(function* () {
    const validatedReservation = yield* S.decodeUnknownEffect(
      S.Struct({
        protocolVersion: S.Literals(['WalletVaultTransfer/1']),
        environment: S.Literals(['Development', 'Staging', 'Production']),
        transferId: S.String.check(S.isPattern(/^[A-Za-z0-9_-]{22}$/u)),
        serverExpiresAtMs: S.Int.check(S.isGreaterThanOrEqualTo(0)),
        ownerBinding: S.String.check(S.isPattern(/^[A-Za-z0-9_-]{43}$/u)),
      }),
    )(reservation).pipe(Effect.mapError(invalidTicket))
    const validatedSecrets = yield* S.decodeUnknownEffect(
      S.Struct({
        encryptionKey: S.Redacted(
          S.Uint8Array.check(S.isLengthBetween(32, 32)),
          {
            label: 'wallet-transfer-encryption-key',
            disallowJsonEncode: true,
          },
        ),
        claimToken: S.Redacted(S.Uint8Array.check(S.isLengthBetween(32, 32)), {
          label: 'wallet-transfer-claim-token',
          disallowJsonEncode: true,
        }),
      }),
    )(secrets).pipe(Effect.mapError(invalidTicket))
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
    if (!encodedPayload.startsWith(transferTicketQrPrefix)) {
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
