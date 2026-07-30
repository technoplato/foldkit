import {
  Context,
  Duration,
  Effect,
  Encoding,
  Layer,
  Match as M,
  Result,
  Schema as S,
  Scope,
} from 'effect'

import { VaultTransferCrypto, deriveTransferClaimVerifier } from './crypto.js'
import {
  AcknowledgedTransfer,
  type AuthenticatedPrincipal,
  AuthenticatedPrincipal as AuthenticatedPrincipalSchema,
  AuthenticatedRelayError,
  type AuthenticatedRelayOperation,
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
  type TransferClaimVerifier,
  TransferClaimVerifier as TransferClaimVerifierSchema,
  TransferCryptoError,
  type TransferEnvironment,
  TransferEnvironment as TransferEnvironmentSchema,
  type TransferReference,
  TransferReference as TransferReferenceSchema,
  TransferReservation as TransferReservationSchema,
  WonTransferClaim,
  transferProtocolVersion,
} from './protocol.js'

const transferIdByteLength = 16
const principalBindingByteLength = 32
const claimVerifierByteLength = 32
const transferIdAllocationAttempts = 8
const maximumTransferCount = 256
const maximumTransferLifetimeMs = 15 * 60 * 1_000
const TransferIdBytes = S.Uint8Array.check(
  S.isLengthBetween(transferIdByteLength, transferIdByteLength),
)
const PrincipalBindingBytes = S.Uint8Array.check(
  S.isLengthBetween(principalBindingByteLength, principalBindingByteLength),
)
const ClaimVerifierBytes = S.Uint8Array.check(
  S.isLengthBetween(claimVerifierByteLength, claimVerifierByteLength),
)

const ReservedState = S.TaggedStruct('Reserved', {
  claimVerifier: TransferClaimVerifierSchema,
})

const ReadyState = S.TaggedStruct('Ready', {
  claimVerifier: TransferClaimVerifierSchema,
  capsule: EncryptedRelayCapsuleSchema,
})

const ClaimedState = S.TaggedStruct('Claimed', {
  claimVerifier: TransferClaimVerifierSchema,
  capsule: EncryptedRelayCapsuleSchema,
  claimant: AuthenticatedPrincipalSchema,
})

const AcknowledgedState = S.TaggedStruct('Acknowledged', {
  claimant: AuthenticatedPrincipalSchema,
})

const CancelledState = S.TaggedStruct('Cancelled', {})

const StoredTransferState = S.Union([
  ReservedState,
  ReadyState,
  ClaimedState,
  AcknowledgedState,
  CancelledState,
])
type StoredTransferState = typeof StoredTransferState.Type

const StoredTransfer = S.Struct({
  reservation: TransferReservationSchema,
  owner: AuthenticatedPrincipalSchema,
  state: StoredTransferState,
})
type StoredTransfer = typeof StoredTransfer.Type

/** The principal established by the host authentication middleware. */
export class AuthenticatedRequestPrincipal extends Context.Service<
  AuthenticatedRequestPrincipal,
  AuthenticatedPrincipal
>()('Wallet/AuthenticatedRequestPrincipal') {}

/** Host-native constant-time comparison for two equal-length byte sequences. */
export type HostTimingSafeEqualService = Readonly<{
  compare: (
    left: Uint8Array,
    right: Uint8Array,
  ) => Effect.Effect<boolean, TransferCryptoError>
}>

/** The host timing-safe comparison capability used by the relay. */
export class HostTimingSafeEqual extends Context.Service<
  HostTimingSafeEqual,
  HostTimingSafeEqualService
>()('Wallet/HostTimingSafeEqual') {}

/** Authenticated relay operations that read identity only from Effect Context. */
export type AuthenticatedRelayService = Readonly<{
  reserve: (
    request: ReserveTransferRequest,
  ) => Effect.Effect<
    ReservedTransfer,
    AuthenticatedRelayError,
    AuthenticatedRequestPrincipal
  >
  publish: (
    capsule: EncryptedRelayCapsule,
  ) => Effect.Effect<
    PublishedTransfer,
    AuthenticatedRelayError,
    AuthenticatedRequestPrincipal
  >
  claim: (
    claim: TransferClaim,
  ) => Effect.Effect<
    TransferClaimOutcome,
    AuthenticatedRelayError,
    AuthenticatedRequestPrincipal
  >
  acknowledge: (
    reference: TransferReference,
  ) => Effect.Effect<
    AcknowledgedTransfer,
    AuthenticatedRelayError,
    AuthenticatedRequestPrincipal
  >
  cancel: (
    reference: TransferReference,
  ) => Effect.Effect<
    CancelledTransfer,
    AuthenticatedRelayError,
    AuthenticatedRequestPrincipal
  >
  purge: (
    reference: TransferReference,
  ) => Effect.Effect<
    PurgedTransfer,
    AuthenticatedRelayError,
    AuthenticatedRequestPrincipal
  >
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
  cleanupIntervalMs: number
  clock: () => number
}>

const relayError = (
  operation: AuthenticatedRelayOperation,
  code: 'Unavailable' | 'InvalidRequest' | 'Conflict',
) => new AuthenticatedRelayError({ operation, code })

const readAuthenticatedPrincipal = (
  operation: AuthenticatedRelayOperation,
): Effect.Effect<
  AuthenticatedPrincipal,
  AuthenticatedRelayError,
  AuthenticatedRequestPrincipal
> =>
  Effect.gen(function* () {
    const principal = yield* AuthenticatedRequestPrincipal
    return yield* S.decodeUnknownEffect(AuthenticatedPrincipalSchema)(
      principal,
    ).pipe(Effect.mapError(() => relayError(operation, 'InvalidRequest')))
  })

const readClock = (
  options: InMemoryAuthenticatedRelayOptions,
  operation: AuthenticatedRelayOperation,
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

const isSamePrincipal = (
  left: AuthenticatedPrincipal,
  right: AuthenticatedPrincipal,
): boolean => left.issuer === right.issuer && left.subject === right.subject

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

const verifierForState = (
  state: StoredTransferState,
  dummyClaimVerifier: TransferClaimVerifier,
): TransferClaimVerifier =>
  M.value(state).pipe(
    M.tagsExhaustive({
      Reserved: () => dummyClaimVerifier,
      Ready: ready => ready.claimVerifier,
      Claimed: claimed => claimed.claimVerifier,
      Acknowledged: () => dummyClaimVerifier,
      Cancelled: () => dummyClaimVerifier,
    }),
  )

/** Builds a scoped in-memory relay with mandatory periodic expiry cleanup. */
export const makeInMemoryAuthenticatedRelay = (
  options: InMemoryAuthenticatedRelayOptions,
): Effect.Effect<
  AuthenticatedRelayService,
  AuthenticatedRelayError,
  VaultTransferCrypto | HostTimingSafeEqual | Scope.Scope
> =>
  Effect.gen(function* () {
    const environment = yield* S.decodeUnknownEffect(TransferEnvironmentSchema)(
      options.environment,
    ).pipe(Effect.mapError(() => relayError('Reserve', 'InvalidRequest')))
    if (
      !Number.isSafeInteger(options.transferLifetimeMs) ||
      options.transferLifetimeMs <= 0 ||
      options.transferLifetimeMs > maximumTransferLifetimeMs ||
      !Number.isSafeInteger(options.cleanupIntervalMs) ||
      options.cleanupIntervalMs <= 0 ||
      options.cleanupIntervalMs > options.transferLifetimeMs
    ) {
      return yield* Effect.fail(relayError('Reserve', 'InvalidRequest'))
    }

    const crypto = yield* VaultTransferCrypto
    const timingSafeEqual = yield* HostTimingSafeEqual
    const transfers = new Map<string, StoredTransfer>()
    const dummyClaimVerifierBytes = yield* crypto
      .randomBytes(claimVerifierByteLength)
      .pipe(
        Effect.flatMap(S.decodeUnknownEffect(ClaimVerifierBytes)),
        Effect.mapError(() => relayError('Claim', 'Unavailable')),
      )
    const dummyClaimVerifier = Encoding.encodeBase64Url(dummyClaimVerifierBytes)

    const purgeExpiredAt = (now: number): number => {
      let count = 0
      for (const [transferId, transfer] of transfers.entries()) {
        if (now >= transfer.reservation.serverExpiresAtMs) {
          transfers.delete(transferId)
          count += 1
        }
      }
      return count
    }

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

    const allocateTransferId = (
      attemptsRemaining: number,
    ): Effect.Effect<string, AuthenticatedRelayError> =>
      Effect.gen(function* () {
        if (attemptsRemaining === 0) {
          return yield* Effect.fail(relayError('Reserve', 'Unavailable'))
        }
        const random = yield* crypto.randomBytes(transferIdByteLength).pipe(
          Effect.flatMap(S.decodeUnknownEffect(TransferIdBytes)),
          Effect.mapError(() => relayError('Reserve', 'Unavailable')),
        )
        const transferId = Encoding.encodeBase64Url(random)
        if (transfers.has(transferId)) {
          return yield* allocateTransferId(attemptsRemaining - 1)
        }
        return transferId
      })

    const allocatePrincipalBinding = (
      operation: AuthenticatedRelayOperation,
    ): Effect.Effect<string, AuthenticatedRelayError> =>
      crypto.randomBytes(principalBindingByteLength).pipe(
        Effect.flatMap(S.decodeUnknownEffect(PrincipalBindingBytes)),
        Effect.map(Encoding.encodeBase64Url),
        Effect.mapError(() => relayError(operation, 'Unavailable')),
      )

    const compareClaimVerifiers = (
      expected: TransferClaimVerifier,
      actual: TransferClaimVerifier,
    ): Effect.Effect<boolean, AuthenticatedRelayError> =>
      Effect.gen(function* () {
        const expectedResult = Encoding.decodeBase64Url(expected)
        const actualResult = Encoding.decodeBase64Url(actual)
        if (
          Result.isFailure(expectedResult) ||
          Result.isFailure(actualResult)
        ) {
          return yield* Effect.fail(relayError('Claim', 'Unavailable'))
        }
        const expectedBytes = yield* S.decodeUnknownEffect(ClaimVerifierBytes)(
          expectedResult.success,
        ).pipe(Effect.mapError(() => relayError('Claim', 'Unavailable')))
        const actualBytes = yield* S.decodeUnknownEffect(ClaimVerifierBytes)(
          actualResult.success,
        ).pipe(Effect.mapError(() => relayError('Claim', 'Unavailable')))
        return yield* timingSafeEqual.compare(expectedBytes, actualBytes).pipe(
          Effect.flatMap(S.decodeUnknownEffect(S.Boolean)),
          Effect.mapError(() => relayError('Claim', 'Unavailable')),
        )
      })

    const cleanupCycle = Effect.sleep(
      Duration.millis(options.cleanupIntervalMs),
    ).pipe(
      Effect.andThen(
        readClock(options, 'PurgeExpired').pipe(
          Effect.tap(now =>
            Effect.sync(() => {
              purgeExpiredAt(now)
            }),
          ),
          Effect.catch(() => Effect.void),
        ),
      ),
    )
    yield* Effect.forkScoped(Effect.forever(cleanupCycle))

    return {
      reserve: request =>
        Effect.gen(function* () {
          const owner = yield* readAuthenticatedPrincipal('Reserve')
          const validatedRequest = yield* S.decodeUnknownEffect(
            ReserveTransferRequestSchema,
          )(request).pipe(
            Effect.mapError(() => relayError('Reserve', 'InvalidRequest')),
          )
          const transferId = yield* allocateTransferId(
            transferIdAllocationAttempts,
          )
          const ownerBinding = yield* allocatePrincipalBinding('Reserve')
          const now = yield* readClock(options, 'Reserve')
          const serverExpiresAtMs = now + options.transferLifetimeMs
          if (!Number.isSafeInteger(serverExpiresAtMs)) {
            return yield* Effect.fail(relayError('Reserve', 'InvalidRequest'))
          }
          return yield* Effect.sync(() => {
            purgeExpiredAt(now)
            if (transfers.size >= maximumTransferCount) {
              return Effect.fail(relayError('Reserve', 'Unavailable'))
            }
            const reservation = TransferReservationSchema.make({
              protocolVersion: transferProtocolVersion,
              environment,
              transferId,
              serverExpiresAtMs,
              ownerBinding,
            })
            transfers.set(
              transferId,
              StoredTransfer.make({
                reservation,
                owner,
                state: ReservedState.make({
                  claimVerifier: validatedRequest.claimVerifier,
                }),
              }),
            )
            return Effect.succeed(ReservedTransfer.make({ reservation }))
          }).pipe(Effect.flatten)
        }),
      publish: capsule =>
        Effect.gen(function* () {
          const owner = yield* readAuthenticatedPrincipal('Publish')
          const validatedCapsule = yield* S.decodeUnknownEffect(
            EncryptedRelayCapsuleSchema,
          )(capsule).pipe(
            Effect.mapError(() => relayError('Publish', 'InvalidRequest')),
          )
          const now = yield* readClock(options, 'Publish')
          const transfer = activeTransfer(validatedCapsule.transferId, now)
          if (
            transfer === undefined ||
            !isSamePrincipal(transfer.owner, owner)
          ) {
            return yield* Effect.fail(relayError('Publish', 'Unavailable'))
          }
          const reservation = transfer.reservation
          if (
            reservation.protocolVersion !== validatedCapsule.protocolVersion ||
            reservation.environment !== validatedCapsule.environment ||
            reservation.transferId !== validatedCapsule.transferId ||
            reservation.serverExpiresAtMs !==
              validatedCapsule.serverExpiresAtMs ||
            reservation.ownerBinding !== validatedCapsule.ownerBinding
          ) {
            return yield* Effect.fail(relayError('Publish', 'InvalidRequest'))
          }
          return yield* M.value(transfer.state).pipe(
            M.tagsExhaustive({
              Reserved: state =>
                Effect.sync(() => {
                  transfers.set(
                    validatedCapsule.transferId,
                    StoredTransfer.make({
                      reservation,
                      owner: transfer.owner,
                      state: ReadyState.make({
                        claimVerifier: state.claimVerifier,
                        capsule: validatedCapsule,
                      }),
                    }),
                  )
                  return PublishedTransfer.make({
                    transferId: reservation.transferId,
                    serverExpiresAtMs: reservation.serverExpiresAtMs,
                  })
                }),
              Ready: state => {
                if (isSameCapsule(state.capsule, validatedCapsule)) {
                  return Effect.succeed(
                    PublishedTransfer.make({
                      transferId: reservation.transferId,
                      serverExpiresAtMs: reservation.serverExpiresAtMs,
                    }),
                  )
                }
                return Effect.fail(relayError('Publish', 'Conflict'))
              },
              Claimed: () => Effect.fail(relayError('Publish', 'Conflict')),
              Acknowledged: () =>
                Effect.fail(relayError('Publish', 'Conflict')),
              Cancelled: () => Effect.fail(relayError('Publish', 'Conflict')),
            }),
          )
        }),
      claim: claim =>
        Effect.gen(function* () {
          const claimant = yield* readAuthenticatedPrincipal('Claim')
          const validatedClaim = yield* S.decodeUnknownEffect(
            TransferClaimSchema,
          )(claim).pipe(
            Effect.mapError(() => relayError('Claim', 'InvalidRequest')),
          )
          const claimVerifier = yield* deriveTransferClaimVerifier(
            validatedClaim.claimToken,
          ).pipe(
            Effect.provideService(VaultTransferCrypto, crypto),
            Effect.mapError(() => relayError('Claim', 'Unavailable')),
          )
          const now = yield* readClock(options, 'Claim')
          const transferBeforeComparison = activeTransfer(
            validatedClaim.transferId,
            now,
          )
          const expectedClaimVerifier =
            transferBeforeComparison === undefined
              ? dummyClaimVerifier
              : verifierForState(
                  transferBeforeComparison.state,
                  dummyClaimVerifier,
                )
          const isVerifierMatch = yield* compareClaimVerifiers(
            expectedClaimVerifier,
            claimVerifier,
          )
          const transfer = activeTransfer(validatedClaim.transferId, now)
          if (transfer === undefined) {
            return yield* Effect.fail(relayError('Claim', 'Unavailable'))
          }
          return yield* M.value(transfer.state).pipe(
            M.tagsExhaustive({
              Reserved: () => Effect.fail(relayError('Claim', 'Unavailable')),
              Ready: state => {
                if (!isVerifierMatch) {
                  return Effect.fail(relayError('Claim', 'Unavailable'))
                }
                transfers.set(
                  validatedClaim.transferId,
                  StoredTransfer.make({
                    reservation: transfer.reservation,
                    owner: transfer.owner,
                    state: ClaimedState.make({
                      claimVerifier: state.claimVerifier,
                      capsule: state.capsule,
                      claimant,
                    }),
                  }),
                )
                return Effect.succeed(
                  WonTransferClaim.make({ capsule: state.capsule }),
                )
              },
              Claimed: state => {
                if (
                  isVerifierMatch &&
                  isSamePrincipal(state.claimant, claimant)
                ) {
                  return Effect.succeed(
                    RetriedWinningTransferClaim.make({
                      capsule: state.capsule,
                    }),
                  )
                }
                return Effect.fail(relayError('Claim', 'Unavailable'))
              },
              Acknowledged: () =>
                Effect.fail(relayError('Claim', 'Unavailable')),
              Cancelled: () => Effect.fail(relayError('Claim', 'Unavailable')),
            }),
          )
        }),
      acknowledge: reference =>
        Effect.gen(function* () {
          const claimant = yield* readAuthenticatedPrincipal('Acknowledge')
          const validatedReference = yield* S.decodeUnknownEffect(
            TransferReferenceSchema,
          )(reference).pipe(
            Effect.mapError(() => relayError('Acknowledge', 'InvalidRequest')),
          )
          const now = yield* readClock(options, 'Acknowledge')
          const transfer = activeTransfer(validatedReference.transferId, now)
          if (transfer === undefined) {
            return yield* Effect.fail(relayError('Acknowledge', 'Unavailable'))
          }
          return yield* M.value(transfer.state).pipe(
            M.tagsExhaustive({
              Reserved: () =>
                Effect.fail(relayError('Acknowledge', 'Unavailable')),
              Ready: () =>
                Effect.fail(relayError('Acknowledge', 'Unavailable')),
              Claimed: state => {
                if (!isSamePrincipal(state.claimant, claimant)) {
                  return Effect.fail(relayError('Acknowledge', 'Unavailable'))
                }
                transfers.set(
                  validatedReference.transferId,
                  StoredTransfer.make({
                    reservation: transfer.reservation,
                    owner: transfer.owner,
                    state: AcknowledgedState.make({ claimant }),
                  }),
                )
                return Effect.succeed(
                  AcknowledgedTransfer.make({
                    transferId: validatedReference.transferId,
                  }),
                )
              },
              Acknowledged: state => {
                if (!isSamePrincipal(state.claimant, claimant)) {
                  return Effect.fail(relayError('Acknowledge', 'Unavailable'))
                }
                return Effect.succeed(
                  AcknowledgedTransfer.make({
                    transferId: validatedReference.transferId,
                  }),
                )
              },
              Cancelled: () =>
                Effect.fail(relayError('Acknowledge', 'Unavailable')),
            }),
          )
        }),
      cancel: reference =>
        Effect.gen(function* () {
          const owner = yield* readAuthenticatedPrincipal('Cancel')
          const validatedReference = yield* S.decodeUnknownEffect(
            TransferReferenceSchema,
          )(reference).pipe(
            Effect.mapError(() => relayError('Cancel', 'InvalidRequest')),
          )
          const now = yield* readClock(options, 'Cancel')
          const transfer = activeTransfer(validatedReference.transferId, now)
          if (
            transfer === undefined ||
            !isSamePrincipal(transfer.owner, owner)
          ) {
            return yield* Effect.fail(relayError('Cancel', 'Unavailable'))
          }
          return yield* M.value(transfer.state).pipe(
            M.tagsExhaustive({
              Reserved: () =>
                Effect.sync(() => {
                  transfers.set(
                    validatedReference.transferId,
                    StoredTransfer.make({
                      reservation: transfer.reservation,
                      owner: transfer.owner,
                      state: CancelledState.make({}),
                    }),
                  )
                  return CancelledTransfer.make({
                    transferId: validatedReference.transferId,
                  })
                }),
              Ready: () =>
                Effect.sync(() => {
                  transfers.set(
                    validatedReference.transferId,
                    StoredTransfer.make({
                      reservation: transfer.reservation,
                      owner: transfer.owner,
                      state: CancelledState.make({}),
                    }),
                  )
                  return CancelledTransfer.make({
                    transferId: validatedReference.transferId,
                  })
                }),
              Claimed: () => Effect.fail(relayError('Cancel', 'Conflict')),
              Acknowledged: () =>
                Effect.fail(relayError('Cancel', 'Unavailable')),
              Cancelled: () =>
                Effect.succeed(
                  CancelledTransfer.make({
                    transferId: validatedReference.transferId,
                  }),
                ),
            }),
          )
        }),
      purge: reference =>
        Effect.gen(function* () {
          const owner = yield* readAuthenticatedPrincipal('Purge')
          const validatedReference = yield* S.decodeUnknownEffect(
            TransferReferenceSchema,
          )(reference).pipe(
            Effect.mapError(() => relayError('Purge', 'InvalidRequest')),
          )
          const now = yield* readClock(options, 'Purge')
          const transfer = transfers.get(validatedReference.transferId)
          if (
            transfer === undefined ||
            !isSamePrincipal(transfer.owner, owner)
          ) {
            return yield* Effect.fail(relayError('Purge', 'Unavailable'))
          }
          if (now >= transfer.reservation.serverExpiresAtMs) {
            transfers.delete(validatedReference.transferId)
            return PurgedTransfer.make({
              transferId: validatedReference.transferId,
            })
          }
          return yield* M.value(transfer.state).pipe(
            M.tagsExhaustive({
              Reserved: () => Effect.fail(relayError('Purge', 'Conflict')),
              Ready: () => Effect.fail(relayError('Purge', 'Conflict')),
              Claimed: () => Effect.fail(relayError('Purge', 'Conflict')),
              Acknowledged: () =>
                Effect.sync(() => {
                  transfers.delete(validatedReference.transferId)
                  return PurgedTransfer.make({
                    transferId: validatedReference.transferId,
                  })
                }),
              Cancelled: () =>
                Effect.sync(() => {
                  transfers.delete(validatedReference.transferId)
                  return PurgedTransfer.make({
                    transferId: validatedReference.transferId,
                  })
                }),
            }),
          )
        }),
      purgeExpired: Effect.gen(function* () {
        const now = yield* readClock(options, 'PurgeExpired')
        return PurgedExpiredTransfers.make({
          count: purgeExpiredAt(now),
        })
      }),
    }
  })

/** Provides the scoped in-memory authenticated relay as an Effect Layer. */
export const makeInMemoryAuthenticatedRelayLayer = (
  options: InMemoryAuthenticatedRelayOptions,
) => Layer.effect(AuthenticatedRelay, makeInMemoryAuthenticatedRelay(options))
