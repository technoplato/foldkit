import { Effect, Encoding, Exit, Redacted } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  VaultTransferCrypto,
  type VaultTransferCryptoService,
  deriveTransferClaimVerifier,
  generateTransferSecrets,
  makeWebCryptoVaultTransferCrypto,
  openCanonicalWalletRecord,
  sealCanonicalWalletRecord,
} from './crypto.js'
import {
  AuthenticatedPrincipal,
  EncryptedRelayCapsule,
  TransferClaim,
  TransferSecrets,
  TransferTicket,
  TransferTicketError,
  projectTransferTicket,
} from './protocol.js'
import {
  type AuthenticatedRelayService,
  makeInMemoryAuthenticatedRelay,
} from './relay.js'
import {
  decodeTransferTicketFromQr,
  encodeTransferTicketForQr,
  makeTransferTicket,
} from './ticket.js'

const textEncoder = new TextEncoder()
const owner = AuthenticatedPrincipal.make({
  issuer: 'TestIdentity',
  subject: 'owner-1',
})
const otherOwner = AuthenticatedPrincipal.make({
  issuer: 'TestIdentity',
  subject: 'owner-2',
})
const claimantA = AuthenticatedPrincipal.make({
  issuer: 'TestIdentity',
  subject: 'claimant-a',
})
const claimantB = AuthenticatedPrincipal.make({
  issuer: 'TestIdentity',
  subject: 'claimant-b',
})
const canonicalRecord =
  '{"format":"WalletRecord/1","private":"PRIVATE_WALLET_RECORD_SENTINEL"}'

const makeDeterministicRandomBytes = (seed: number) => {
  let callCount = 0
  return (byteLength: number): Uint8Array => {
    callCount += 1
    return Uint8Array.from(
      { length: byteLength },
      (_, index) => (seed + callCount * 31 + index * 17) % 256,
    )
  }
}

const makeDeterministicCrypto = (seed: number): VaultTransferCryptoService => {
  const webCrypto = makeWebCryptoVaultTransferCrypto(globalThis.crypto)
  const randomBytes = makeDeterministicRandomBytes(seed)
  return {
    ...webCrypto,
    randomBytes: byteLength => Effect.succeed(randomBytes(byteLength)),
  }
}

const makePublishedFixture = async (record: string = canonicalRecord) => {
  const clock = { nowMs: 10_000 }
  const crypto = makeDeterministicCrypto(7)
  const relayRandomBytes = makeDeterministicRandomBytes(101)
  return Effect.runPromise(
    Effect.gen(function* () {
      const secrets = yield* generateTransferSecrets
      const claimVerifier = yield* deriveTransferClaimVerifier(
        secrets.claimToken,
      )
      const relay = yield* makeInMemoryAuthenticatedRelay({
        environment: 'Development',
        transferLifetimeMs: 1_000,
        clock: () => clock.nowMs,
        randomBytes: relayRandomBytes,
      })
      const reserved = yield* relay.reserve(owner, { claimVerifier })
      const ticket = yield* makeTransferTicket(reserved.reservation, secrets)
      const capsule = yield* sealCanonicalWalletRecord(
        Redacted.make(record, { label: 'canonical-wallet-record' }),
        ticket,
        reserved.reservation,
      )
      const published = yield* relay.publish(owner, capsule)
      return {
        clock,
        crypto,
        relay,
        secrets,
        ticket,
        capsule,
        reserved,
        published,
      }
    }).pipe(Effect.provideService(VaultTransferCrypto, crypto)),
  )
}

const runClaim = (
  relay: AuthenticatedRelayService,
  principal: AuthenticatedPrincipal,
  ticket: TransferTicket,
) =>
  relay.claim(
    principal,
    TransferClaim.make({
      transferId: ticket.transferId,
      claimToken: ticket.claimToken,
    }),
  )

const flipBase64UrlCharacter = (value: string): string =>
  `${value.startsWith('A') ? 'B' : 'A'}${value.slice(1)}`

const expectInvalidEnvelope = async (
  crypto: VaultTransferCryptoService,
  ticket: TransferTicket,
  capsule: EncryptedRelayCapsule,
) => {
  const error = await Effect.runPromise(
    openCanonicalWalletRecord(ticket, capsule).pipe(
      Effect.provideService(VaultTransferCrypto, crypto),
      Effect.flip,
    ),
  )
  expect(error.code).toBe('InvalidEnvelope')
}

const makeBarrier = (parties: number) => {
  let arrivals = 0
  let release = () => {}
  const released = new Promise<void>(resolve => {
    release = resolve
  })
  return async () => {
    arrivals += 1
    if (arrivals === parties) {
      release()
    }
    await released
  }
}

describe('Wallet vault transfer ticket and cryptography', () => {
  it('round-trips a fixed-environment QR ticket with no URL field', async () => {
    const fixture = await makePublishedFixture()
    const encoded = await Effect.runPromise(
      encodeTransferTicketForQr(fixture.ticket),
    )
    const decoded = await Effect.runPromise(decodeTransferTicketFromQr(encoded))

    expect(decoded.environment).toBe('Development')
    expect(decoded.transferId).toBe(fixture.ticket.transferId)
    expect(decoded.expiresAtHintMs).toBe(fixture.ticket.expiresAtHintMs)
    expect(Array.from(Redacted.value(decoded.encryptionKey))).toEqual(
      Array.from(Redacted.value(fixture.ticket.encryptionKey)),
    )
    expect(Array.from(Redacted.value(decoded.claimToken))).toEqual(
      Array.from(Redacted.value(fixture.ticket.claimToken)),
    )
    expect(Redacted.value(encoded)).not.toContain('http://')
    expect(Redacted.value(encoded)).not.toContain('https://')

    const arbitraryUrlPayload = Redacted.make(
      `wallet-transfer-ticket.v1.${Encoding.encodeBase64Url(
        JSON.stringify({
          environment: 'Development',
          relayUrl: 'https://attacker.invalid',
        }),
      )}`,
    )
    const error = await Effect.runPromise(
      decodeTransferTicketFromQr(arbitraryUrlPayload).pipe(Effect.flip),
    )
    expect(error).toBeInstanceOf(TransferTicketError)
  })

  it('seals and opens exactly one opaque canonical Wallet record', async () => {
    const fixture = await makePublishedFixture()
    const opened = await Effect.runPromise(
      openCanonicalWalletRecord(fixture.ticket, fixture.capsule).pipe(
        Effect.provideService(VaultTransferCrypto, fixture.crypto),
      ),
    )

    expect(Redacted.value(opened)).toBe(canonicalRecord)
    expect(fixture.capsule.nonce).toHaveLength(16)
    expect(fixture.capsule.authenticationTag).toHaveLength(22)
  })

  it('rejects ciphertext, AAD, nonce, tag, and key tampering uniformly', async () => {
    const fixture = await makePublishedFixture()
    const tamperedCiphertext = EncryptedRelayCapsule.make({
      ...fixture.capsule,
      ciphertext: flipBase64UrlCharacter(fixture.capsule.ciphertext),
    })
    const tamperedAdditionalAuthenticatedData = EncryptedRelayCapsule.make({
      ...fixture.capsule,
      ownerBinding: flipBase64UrlCharacter(fixture.capsule.ownerBinding),
    })
    const tamperedNonce = EncryptedRelayCapsule.make({
      ...fixture.capsule,
      nonce: flipBase64UrlCharacter(fixture.capsule.nonce),
    })
    const tamperedTag = EncryptedRelayCapsule.make({
      ...fixture.capsule,
      authenticationTag: flipBase64UrlCharacter(
        fixture.capsule.authenticationTag,
      ),
    })
    const tamperedKeyBytes = Uint8Array.from(
      Redacted.value(fixture.ticket.encryptionKey),
    )
    tamperedKeyBytes.set(Uint8Array.of((tamperedKeyBytes.at(0) ?? 0) ^ 1))
    const tamperedKeyTicket = TransferTicket.make({
      protocolVersion: fixture.ticket.protocolVersion,
      environment: fixture.ticket.environment,
      transferId: fixture.ticket.transferId,
      encryptionKey: Redacted.make(tamperedKeyBytes, {
        label: 'wallet-transfer-encryption-key',
      }),
      claimToken: fixture.ticket.claimToken,
      expiresAtHintMs: fixture.ticket.expiresAtHintMs,
    })

    await expectInvalidEnvelope(
      fixture.crypto,
      fixture.ticket,
      tamperedCiphertext,
    )
    await expectInvalidEnvelope(
      fixture.crypto,
      fixture.ticket,
      tamperedAdditionalAuthenticatedData,
    )
    await expectInvalidEnvelope(fixture.crypto, fixture.ticket, tamperedNonce)
    await expectInvalidEnvelope(fixture.crypto, fixture.ticket, tamperedTag)
    await expectInvalidEnvelope(
      fixture.crypto,
      tamperedKeyTicket,
      fixture.capsule,
    )
  })
})

describe('in-memory authenticated relay', () => {
  it('uses the server clock and rejects a claim at the exact expiry boundary', async () => {
    const beforeBoundary = await makePublishedFixture()
    beforeBoundary.clock.nowMs =
      beforeBoundary.reserved.reservation.serverExpiresAtMs - 1
    const won = await Effect.runPromise(
      runClaim(beforeBoundary.relay, claimantA, beforeBoundary.ticket),
    )
    expect(won._tag).toBe('WonTransferClaim')

    const atBoundary = await makePublishedFixture()
    atBoundary.clock.nowMs = atBoundary.reserved.reservation.serverExpiresAtMs
    const error = await Effect.runPromise(
      runClaim(atBoundary.relay, claimantA, atBoundary.ticket).pipe(
        Effect.flip,
      ),
    )
    expect(error.code).toBe('Unavailable')

    const maintenanceBoundary = await makePublishedFixture()
    maintenanceBoundary.clock.nowMs =
      maintenanceBoundary.reserved.reservation.serverExpiresAtMs
    const purged = await Effect.runPromise(
      maintenanceBoundary.relay.purgeExpired,
    )
    expect(purged.count).toBe(1)
  })

  it('isolates owner operations by the authenticated principal', async () => {
    const fixture = await makePublishedFixture()
    const reference = { transferId: fixture.ticket.transferId }

    const publishError = await Effect.runPromise(
      fixture.relay.publish(otherOwner, fixture.capsule).pipe(Effect.flip),
    )
    const cancelError = await Effect.runPromise(
      fixture.relay.cancel(otherOwner, reference).pipe(Effect.flip),
    )
    const purgeError = await Effect.runPromise(
      fixture.relay.purge(otherOwner, reference).pipe(Effect.flip),
    )

    expect(publishError.code).toBe('Unavailable')
    expect(cancelError.code).toBe('Unavailable')
    expect(purgeError.code).toBe('Unavailable')
    const won = await Effect.runPromise(
      runClaim(fixture.relay, claimantA, fixture.ticket),
    )
    expect(won._tag).toBe('WonTransferClaim')
  })

  it('rejects a tampered claim token without revealing existence', async () => {
    const fixture = await makePublishedFixture()
    const tamperedToken = Uint8Array.from(
      Redacted.value(fixture.ticket.claimToken),
    )
    tamperedToken.set(Uint8Array.of((tamperedToken.at(0) ?? 0) ^ 1))
    const error = await Effect.runPromise(
      fixture.relay
        .claim(
          claimantA,
          TransferClaim.make({
            transferId: fixture.ticket.transferId,
            claimToken: Redacted.make(tamperedToken, {
              label: 'wallet-transfer-claim-token',
            }),
          }),
        )
        .pipe(Effect.flip),
    )

    expect(error.code).toBe('Unavailable')
    expect(error.operation).toBe('Claim')
  })

  it('allows exactly one concurrent winner and only that winner can retry', async () => {
    const fixture = await makePublishedFixture()
    const barrier = makeBarrier(2)
    const attempt = async (principal: AuthenticatedPrincipal) => {
      await barrier()
      return Effect.runPromiseExit(
        runClaim(fixture.relay, principal, fixture.ticket),
      )
    }

    const [firstExit, secondExit] = await Promise.all([
      attempt(claimantA),
      attempt(claimantB),
    ])
    const exits = [firstExit, secondExit]
    expect(exits.filter(Exit.isSuccess)).toHaveLength(1)
    expect(exits.filter(Exit.isFailure)).toHaveLength(1)

    const winner = Exit.isSuccess(firstExit) ? claimantA : claimantB
    const loser = Exit.isSuccess(firstExit) ? claimantB : claimantA
    const retry = await Effect.runPromise(
      runClaim(fixture.relay, winner, fixture.ticket),
    )
    const loserError = await Effect.runPromise(
      runClaim(fixture.relay, loser, fixture.ticket).pipe(Effect.flip),
    )

    expect(retry._tag).toBe('RetriedWinningTransferClaim')
    expect(loserError.code).toBe('Unavailable')
  })

  it('acknowledges idempotently, destroys claim access, and remains purgeable', async () => {
    const fixture = await makePublishedFixture()
    const reference = { transferId: fixture.ticket.transferId }
    await Effect.runPromise(runClaim(fixture.relay, claimantA, fixture.ticket))

    const acknowledged = await Effect.runPromise(
      fixture.relay.acknowledge(claimantA, reference),
    )
    const acknowledgedAgain = await Effect.runPromise(
      fixture.relay.acknowledge(claimantA, reference),
    )
    const claimError = await Effect.runPromise(
      runClaim(fixture.relay, claimantA, fixture.ticket).pipe(Effect.flip),
    )
    const otherClaimantError = await Effect.runPromise(
      fixture.relay.acknowledge(claimantB, reference).pipe(Effect.flip),
    )
    const cancelError = await Effect.runPromise(
      fixture.relay.cancel(owner, reference).pipe(Effect.flip),
    )
    const purged = await Effect.runPromise(
      fixture.relay.purge(owner, reference),
    )
    const afterPurgeError = await Effect.runPromise(
      fixture.relay.purge(owner, reference).pipe(Effect.flip),
    )

    expect(acknowledged._tag).toBe('AcknowledgedTransfer')
    expect(acknowledgedAgain._tag).toBe('AcknowledgedTransfer')
    expect(claimError.code).toBe('Unavailable')
    expect(otherClaimantError.code).toBe('Unavailable')
    expect(cancelError.code).toBe('Unavailable')
    expect(purged._tag).toBe('PurgedTransfer')
    expect(afterPurgeError.code).toBe('Unavailable')
  })

  it('makes cancellation terminal until explicit purge', async () => {
    const fixture = await makePublishedFixture()
    const reference = { transferId: fixture.ticket.transferId }

    const cancelled = await Effect.runPromise(
      fixture.relay.cancel(owner, reference),
    )
    const cancelledAgain = await Effect.runPromise(
      fixture.relay.cancel(owner, reference),
    )
    const claimError = await Effect.runPromise(
      runClaim(fixture.relay, claimantA, fixture.ticket).pipe(Effect.flip),
    )
    const publishError = await Effect.runPromise(
      fixture.relay.publish(owner, fixture.capsule).pipe(Effect.flip),
    )
    const purged = await Effect.runPromise(
      fixture.relay.purge(owner, reference),
    )

    expect(cancelled._tag).toBe('CancelledTransfer')
    expect(cancelledAgain._tag).toBe('CancelledTransfer')
    expect(claimError.code).toBe('Unavailable')
    expect(publishError.code).toBe('Conflict')
    expect(purged._tag).toBe('PurgedTransfer')
  })
})

describe('secret leakage boundaries', () => {
  it('keeps sentinel material out of projections, outcomes, and errors', async () => {
    const keySentinel = 'encryption-key-sentinel-00000000'
    const tokenSentinel = 'claim-token-sentinel-00000000000'
    const recordSentinel = 'PRIVATE_WALLET_RECORD_SENTINEL'
    const crypto = makeDeterministicCrypto(29)
    const clock = { nowMs: 20_000 }
    const relayRandomBytes = makeDeterministicRandomBytes(151)

    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const secrets = TransferSecrets.make({
          encryptionKey: Redacted.make(textEncoder.encode(keySentinel), {
            label: 'wallet-transfer-encryption-key',
          }),
          claimToken: Redacted.make(textEncoder.encode(tokenSentinel), {
            label: 'wallet-transfer-claim-token',
          }),
        })
        const claimVerifier = yield* deriveTransferClaimVerifier(
          secrets.claimToken,
        )
        const relay = yield* makeInMemoryAuthenticatedRelay({
          environment: 'Development',
          transferLifetimeMs: 1_000,
          clock: () => clock.nowMs,
          randomBytes: relayRandomBytes,
        })
        const reserved = yield* relay.reserve(owner, { claimVerifier })
        const ticket = yield* makeTransferTicket(reserved.reservation, secrets)
        const capsule = yield* sealCanonicalWalletRecord(
          Redacted.make(recordSentinel, {
            label: 'canonical-wallet-record',
          }),
          ticket,
          reserved.reservation,
        )
        const published = yield* relay.publish(owner, capsule)
        const qr = yield* encodeTransferTicketForQr(ticket)
        const invalidClaim = TransferClaim.make({
          transferId: ticket.transferId,
          claimToken: Redacted.make(new Uint8Array(32), {
            label: 'wallet-transfer-claim-token',
          }),
        })
        const error = yield* relay
          .claim(claimantA, invalidClaim)
          .pipe(Effect.flip)
        return {
          ticket,
          capsule,
          reserved,
          published,
          qr,
          error,
        }
      }).pipe(Effect.provideService(VaultTransferCrypto, crypto)),
    )

    const publicStrings = [
      JSON.stringify(projectTransferTicket(values.ticket)),
      JSON.stringify(values.capsule),
      JSON.stringify(values.reserved),
      JSON.stringify(values.published),
      JSON.stringify(values.ticket),
      String(values.ticket.encryptionKey),
      String(values.ticket.claimToken),
      String(values.qr),
      String(values.error),
      JSON.stringify(values.error),
    ]
    for (const publicString of publicStrings) {
      expect(publicString).not.toContain(keySentinel)
      expect(publicString).not.toContain(tokenSentinel)
      expect(publicString).not.toContain(recordSentinel)
    }
  })
})
