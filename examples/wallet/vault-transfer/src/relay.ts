import { Context, Effect, Encoding, Layer, Result, Schema as S } from 'effect'

import {
  VaultTransferCrypto,
  deriveAuthenticatedPrincipalBinding,
  deriveTransferClaimVerifier,
} from './crypto.js'
import {
  AcknowledgedTransfer,
  type AuthenticatedPrincipal,
  AuthenticatedPrincipal as AuthenticatedPrincipalSchema,
  AuthenticatedRelayError,
  CancelledTransfer,
  type EncryptedRelayCapsule,
  EncryptedRelayCapsule as EncryptedRelayCapsuleSchema,
  PublishedTransfer,
  PurgedExpiredTransfers,
  PurgedTransfer,
  type ReserveTransferRequest,
  ReserveTransferRequest as ReserveTransferRequestSchema,
  ReservedTransfer,
  RetriedWinningTransferClaim,
  type TransferClaim,
  type TransferClaimOutcome,
  TransferClaim as TransferClaimSchema,
  type TransferEnvironment,
  type TransferReference,
  TransferReference as TransferReferenceSchema,
  type TransferReservation,
  WonTransferClaim,
  transferProtocolVersion,
} from './protocol.js'

const transferIdByteLength = 16
const transferIdAllocationAttempts = 8

type ReservedState = Readonly<{
  _tag: 'Reserved'
  claimVerifier: string
}>

type ReadyState = Readonly<{
  _tag: 'Ready'
  claimVerifier: string
  capsule: EncryptedRelayCapsule
}>

type ClaimedState = Readonly<{
  _tag: 'Claimed'
  claimVerifier: string
  capsule: EncryptedRelayCapsule
  claimantBinding: string
}>

type AcknowledgedState = Readonly<{
  _tag: 'Acknowledged'
  claimantBinding: string
}>

type CancelledState = Readonly<{
  _tag: 'Cancelled'
}>

type StoredTransferState =
  | ReservedState
  | ReadyState
  | ClaimedState
  | AcknowledgedState
  | CancelledState

type StoredTransfer = Readonly<{
  reservation: TransferReservation
  state: StoredTransferState
}>

/** Authenticated relay capabilities whose principal comes from the host context. */
export type AuthenticatedRelayService = Readonly<{
  reserve: (
    principal: AuthenticatedPrincipal,
    request: ReserveTransferRequest,
  ) => Effect.Effect<ReservedTransfer, AuthenticatedRelayError>
  publish: (
    principal: AuthenticatedPrincipal,
    capsule: EncryptedRelayCapsule,
  ) => Effect.Effect<PublishedTransfer, AuthenticatedRelayError>
  claim: (
    principal: AuthenticatedPrincipal,
    claim: TransferClaim,
  ) => Effect.Effect<TransferClaimOutcome, AuthenticatedRelayError>
  acknowledge: (
    principal: AuthenticatedPrincipal,
    reference: TransferReference,
  ) => Effect.Effect<AcknowledgedTransfer, AuthenticatedRelayError>
  cancel: (
    principal: AuthenticatedPrincipal,
    reference: TransferReference,
  ) => Effect.Effect<CancelledTransfer, AuthenticatedRelayError>
  purge: (
    principal: AuthenticatedPrincipal,
    reference: TransferReference,
  ) => Effect.Effect<PurgedTransfer, AuthenticatedRelayError>
  purgeExpired: Effect.Effect<PurgedExpiredTransfers, AuthenticatedRelayError>
}>

/** A host-owned authenticated relay, implemented locally or over a transport. */
export class AuthenticatedRelay extends Context.Service<
  AuthenticatedRelay,
  AuthenticatedRelayService
>()('Wallet/AuthenticatedRelay') {}

/** Deterministic host dependencies for the in-memory authenticated relay. */
export type InMemoryAuthenticatedRelayOptions = Readonly<{
  environment: TransferEnvironment
  transferLifetimeMs: number
  clock: () => number
  randomBytes: (byteLength: number) => Uint8Array
}>

const relayError = (
  operation:
    | 'Reserve'
    | 'Publish'
    | 'Claim'
    | 'Acknowledge'
    | 'Cancel'
    | 'Purge'
    | 'PurgeExpired',
  code: 'Unavailable' | 'InvalidRequest' | 'Conflict',
) => new AuthenticatedRelayError({ operation, code })

const decodePrincipal = (
  principal: AuthenticatedPrincipal,
  operation:
    | 'Reserve'
    | 'Publish'
    | 'Claim'
    | 'Acknowledge'
    | 'Cancel'
    | 'Purge',
) =>
  S.decodeUnknownEffect(AuthenticatedPrincipalSchema)(principal).pipe(
    Effect.mapError(() => relayError(operation, 'InvalidRequest')),
  )

const readClock = (
  options: InMemoryAuthenticatedRelayOptions,
  operation:
    | 'Reserve'
    | 'Publish'
    | 'Claim'
    | 'Acknowledge'
    | 'Cancel'
    | 'PurgeExpired',
): Effect.Effect<number, AuthenticatedRelayError> =>
  Effect.try({
    try: () => {
      const now = options.clock()
      if (!Number.isSafeInteger(now) || now < 0) {
        throw new Error('Invalid clock')
      }
      return now
    },
    catch: () => relayError(operation, 'Unavailable'),
  })

const constantTimeBytesEqual = (
  left: Uint8Array,
  right: Uint8Array,
): boolean => {
  let difference = left.byteLength ^ right.byteLength
  for (const [index, leftByte] of left.entries()) {
    difference |= leftByte ^ (right.at(index) ?? 0)
  }
  return difference === 0
}

const constantTimeVerifierEqual = (left: string, right: string): boolean => {
  const leftResult = Encoding.decodeBase64Url(left)
  const rightResult = Encoding.decodeBase64Url(right)
  if (Result.isFailure(leftResult) || Result.isFailure(rightResult)) {
    return false
  }
  return constantTimeBytesEqual(leftResult.success, rightResult.success)
}

const isSameCapsule = (
  left: EncryptedRelayCapsule,
  right: EncryptedRelayCapsule,
): boolean =>
  left.protocolVersion === right.protocolVersion &&
  left.environment === right.environment &&
  left.transferId === right.transferId &&
  left.serverExpiresAtMs === right.serverExpiresAtMs &&
  left.ownerBinding === right.ownerBinding &&
  left.nonce === right.nonce &&
  left.ciphertext === right.ciphertext &&
  left.authenticationTag === right.authenticationTag

/** Builds a deterministic in-memory relay while retaining the crypto service. */
export const makeInMemoryAuthenticatedRelay = (
  options: InMemoryAuthenticatedRelayOptions,
): Effect.Effect<AuthenticatedRelayService, never, VaultTransferCrypto> =>
  Effect.gen(function* () {
    const crypto = yield* VaultTransferCrypto
    const transfers = new Map<string, StoredTransfer>()

    const principalBinding = (
      principal: AuthenticatedPrincipal,
      operation:
        | 'Reserve'
        | 'Publish'
        | 'Claim'
        | 'Acknowledge'
        | 'Cancel'
        | 'Purge',
    ): Effect.Effect<string, AuthenticatedRelayError> =>
      deriveAuthenticatedPrincipalBinding(principal).pipe(
        Effect.provideService(VaultTransferCrypto, crypto),
        Effect.mapError(() => relayError(operation, 'Unavailable')),
      )

    const activeTransfer = (
      transferId: string,
      now: number,
    ): StoredTransfer | undefined => {
      const transfer = transfers.get(transferId)
      if (
        transfer !== undefined &&
        now >= transfer.reservation.serverExpiresAtMs
      ) {
        transfers.delete(transferId)
        return undefined
      }
      return transfer
    }

    const allocateTransferId = (attemptsRemaining: number): string => {
      if (attemptsRemaining === 0) {
        throw new Error('Transfer ID allocation exhausted')
      }
      const random = options.randomBytes(transferIdByteLength)
      if (random.byteLength !== transferIdByteLength) {
        throw new Error('Invalid transfer ID random bytes')
      }
      const transferId = Encoding.encodeBase64Url(random)
      if (transfers.has(transferId)) {
        return allocateTransferId(attemptsRemaining - 1)
      }
      return transferId
    }

    return {
      reserve: (principal, request) =>
        Effect.gen(function* () {
          const validatedPrincipal = yield* decodePrincipal(
            principal,
            'Reserve',
          )
          const validatedRequest = yield* S.decodeUnknownEffect(
            ReserveTransferRequestSchema,
          )(request).pipe(
            Effect.mapError(() => relayError('Reserve', 'InvalidRequest')),
          )
          if (
            !Number.isSafeInteger(options.transferLifetimeMs) ||
            options.transferLifetimeMs <= 0
          ) {
            return yield* Effect.fail(relayError('Reserve', 'InvalidRequest'))
          }
          const now = yield* readClock(options, 'Reserve')
          const serverExpiresAtMs = now + options.transferLifetimeMs
          if (!Number.isSafeInteger(serverExpiresAtMs)) {
            return yield* Effect.fail(relayError('Reserve', 'InvalidRequest'))
          }
          const ownerBinding = yield* principalBinding(
            validatedPrincipal,
            'Reserve',
          )
          return yield* Effect.try({
            try: () => {
              const transferId = allocateTransferId(
                transferIdAllocationAttempts,
              )
              const reservation = {
                protocolVersion: transferProtocolVersion,
                environment: options.environment,
                transferId,
                serverExpiresAtMs,
                ownerBinding,
              }
              transfers.set(transferId, {
                reservation,
                state: {
                  _tag: 'Reserved',
                  claimVerifier: validatedRequest.claimVerifier,
                },
              })
              return ReservedTransfer.make({ reservation })
            },
            catch: () => relayError('Reserve', 'Unavailable'),
          })
        }),
      publish: (principal, capsule) =>
        Effect.gen(function* () {
          const validatedPrincipal = yield* decodePrincipal(
            principal,
            'Publish',
          )
          const validatedCapsule = yield* S.decodeUnknownEffect(
            EncryptedRelayCapsuleSchema,
          )(capsule).pipe(
            Effect.mapError(() => relayError('Publish', 'InvalidRequest')),
          )
          const ownerBinding = yield* principalBinding(
            validatedPrincipal,
            'Publish',
          )
          const now = yield* readClock(options, 'Publish')
          return yield* Effect.sync(() => {
            const transfer = activeTransfer(validatedCapsule.transferId, now)
            if (
              transfer === undefined ||
              transfer.reservation.ownerBinding !== ownerBinding
            ) {
              return Effect.fail(relayError('Publish', 'Unavailable'))
            }
            const reservation = transfer.reservation
            if (
              reservation.protocolVersion !==
                validatedCapsule.protocolVersion ||
              reservation.environment !== validatedCapsule.environment ||
              reservation.transferId !== validatedCapsule.transferId ||
              reservation.serverExpiresAtMs !==
                validatedCapsule.serverExpiresAtMs ||
              reservation.ownerBinding !== validatedCapsule.ownerBinding
            ) {
              return Effect.fail(relayError('Publish', 'InvalidRequest'))
            }
            if (transfer.state._tag === 'Reserved') {
              transfers.set(validatedCapsule.transferId, {
                reservation,
                state: {
                  _tag: 'Ready',
                  claimVerifier: transfer.state.claimVerifier,
                  capsule: validatedCapsule,
                },
              })
              return Effect.succeed(
                PublishedTransfer.make({
                  transferId: reservation.transferId,
                  serverExpiresAtMs: reservation.serverExpiresAtMs,
                }),
              )
            }
            if (
              transfer.state._tag === 'Ready' &&
              isSameCapsule(transfer.state.capsule, validatedCapsule)
            ) {
              return Effect.succeed(
                PublishedTransfer.make({
                  transferId: reservation.transferId,
                  serverExpiresAtMs: reservation.serverExpiresAtMs,
                }),
              )
            }
            return Effect.fail(relayError('Publish', 'Conflict'))
          }).pipe(Effect.flatten)
        }),
      claim: (principal, claim) =>
        Effect.gen(function* () {
          const validatedPrincipal = yield* decodePrincipal(principal, 'Claim')
          const validatedClaim = yield* S.decodeUnknownEffect(
            TransferClaimSchema,
          )(claim).pipe(
            Effect.mapError(() => relayError('Claim', 'InvalidRequest')),
          )
          const claimantBinding = yield* principalBinding(
            validatedPrincipal,
            'Claim',
          )
          const claimVerifier = yield* deriveTransferClaimVerifier(
            validatedClaim.claimToken,
          ).pipe(
            Effect.provideService(VaultTransferCrypto, crypto),
            Effect.mapError(() => relayError('Claim', 'Unavailable')),
          )
          const now = yield* readClock(options, 'Claim')
          return yield* Effect.sync(
            (): Effect.Effect<
              TransferClaimOutcome,
              AuthenticatedRelayError
            > => {
              const transfer = activeTransfer(validatedClaim.transferId, now)
              if (transfer === undefined) {
                return Effect.fail(relayError('Claim', 'Unavailable'))
              }
              if (transfer.state._tag === 'Ready') {
                if (
                  !constantTimeVerifierEqual(
                    transfer.state.claimVerifier,
                    claimVerifier,
                  )
                ) {
                  return Effect.fail(relayError('Claim', 'Unavailable'))
                }
                transfers.set(validatedClaim.transferId, {
                  reservation: transfer.reservation,
                  state: {
                    _tag: 'Claimed',
                    claimVerifier: transfer.state.claimVerifier,
                    capsule: transfer.state.capsule,
                    claimantBinding,
                  },
                })
                return Effect.succeed(
                  WonTransferClaim.make({
                    capsule: transfer.state.capsule,
                  }),
                )
              }
              if (
                transfer.state._tag === 'Claimed' &&
                transfer.state.claimantBinding === claimantBinding &&
                constantTimeVerifierEqual(
                  transfer.state.claimVerifier,
                  claimVerifier,
                )
              ) {
                return Effect.succeed(
                  RetriedWinningTransferClaim.make({
                    capsule: transfer.state.capsule,
                  }),
                )
              }
              return Effect.fail(relayError('Claim', 'Unavailable'))
            },
          ).pipe(Effect.flatten)
        }),
      acknowledge: (principal, reference) =>
        Effect.gen(function* () {
          const validatedPrincipal = yield* decodePrincipal(
            principal,
            'Acknowledge',
          )
          const validatedReference = yield* S.decodeUnknownEffect(
            TransferReferenceSchema,
          )(reference).pipe(
            Effect.mapError(() => relayError('Acknowledge', 'InvalidRequest')),
          )
          const claimantBinding = yield* principalBinding(
            validatedPrincipal,
            'Acknowledge',
          )
          const now = yield* readClock(options, 'Acknowledge')
          return yield* Effect.sync(() => {
            const transfer = activeTransfer(validatedReference.transferId, now)
            if (transfer === undefined) {
              return Effect.fail(relayError('Acknowledge', 'Unavailable'))
            }
            if (
              transfer.state._tag === 'Claimed' &&
              transfer.state.claimantBinding === claimantBinding
            ) {
              transfers.set(validatedReference.transferId, {
                reservation: transfer.reservation,
                state: {
                  _tag: 'Acknowledged',
                  claimantBinding,
                },
              })
              return Effect.succeed(
                AcknowledgedTransfer.make({
                  transferId: validatedReference.transferId,
                }),
              )
            }
            if (
              transfer.state._tag === 'Acknowledged' &&
              transfer.state.claimantBinding === claimantBinding
            ) {
              return Effect.succeed(
                AcknowledgedTransfer.make({
                  transferId: validatedReference.transferId,
                }),
              )
            }
            return Effect.fail(relayError('Acknowledge', 'Unavailable'))
          }).pipe(Effect.flatten)
        }),
      cancel: (principal, reference) =>
        Effect.gen(function* () {
          const validatedPrincipal = yield* decodePrincipal(principal, 'Cancel')
          const validatedReference = yield* S.decodeUnknownEffect(
            TransferReferenceSchema,
          )(reference).pipe(
            Effect.mapError(() => relayError('Cancel', 'InvalidRequest')),
          )
          const ownerBinding = yield* principalBinding(
            validatedPrincipal,
            'Cancel',
          )
          const now = yield* readClock(options, 'Cancel')
          return yield* Effect.sync(() => {
            const transfer = activeTransfer(validatedReference.transferId, now)
            if (
              transfer === undefined ||
              transfer.reservation.ownerBinding !== ownerBinding
            ) {
              return Effect.fail(relayError('Cancel', 'Unavailable'))
            }
            if (
              transfer.state._tag === 'Reserved' ||
              transfer.state._tag === 'Ready'
            ) {
              transfers.set(validatedReference.transferId, {
                reservation: transfer.reservation,
                state: { _tag: 'Cancelled' },
              })
              return Effect.succeed(
                CancelledTransfer.make({
                  transferId: validatedReference.transferId,
                }),
              )
            }
            if (transfer.state._tag === 'Cancelled') {
              return Effect.succeed(
                CancelledTransfer.make({
                  transferId: validatedReference.transferId,
                }),
              )
            }
            if (transfer.state._tag === 'Claimed') {
              return Effect.fail(relayError('Cancel', 'Conflict'))
            }
            return Effect.fail(relayError('Cancel', 'Unavailable'))
          }).pipe(Effect.flatten)
        }),
      purge: (principal, reference) =>
        Effect.gen(function* () {
          const validatedPrincipal = yield* decodePrincipal(principal, 'Purge')
          const validatedReference = yield* S.decodeUnknownEffect(
            TransferReferenceSchema,
          )(reference).pipe(
            Effect.mapError(() => relayError('Purge', 'InvalidRequest')),
          )
          const ownerBinding = yield* principalBinding(
            validatedPrincipal,
            'Purge',
          )
          return yield* Effect.sync(() => {
            const transfer = transfers.get(validatedReference.transferId)
            if (
              transfer === undefined ||
              transfer.reservation.ownerBinding !== ownerBinding
            ) {
              return Effect.fail(relayError('Purge', 'Unavailable'))
            }
            transfers.delete(validatedReference.transferId)
            return Effect.succeed(
              PurgedTransfer.make({
                transferId: validatedReference.transferId,
              }),
            )
          }).pipe(Effect.flatten)
        }),
      purgeExpired: Effect.gen(function* () {
        const now = yield* readClock(options, 'PurgeExpired')
        return yield* Effect.sync(() => {
          let count = 0
          for (const [transferId, transfer] of transfers.entries()) {
            if (now >= transfer.reservation.serverExpiresAtMs) {
              transfers.delete(transferId)
              count += 1
            }
          }
          return PurgedExpiredTransfers.make({ count })
        })
      }),
    }
  })

/** Provides the in-memory authenticated relay as an Effect Layer. */
export const makeInMemoryAuthenticatedRelayLayer = (
  options: InMemoryAuthenticatedRelayOptions,
) => Layer.effect(AuthenticatedRelay, makeInMemoryAuthenticatedRelay(options))
