import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  WalletCreationRequest,
  WalletVault,
  WalletVaultError,
  activeWalletAccounts,
} from 'wallet-core-example'

import {
  makeLocalWalletVault,
  makeMemoryWalletVaultStorage,
  makePersistentLocalWalletVault,
} from './localWalletVault.js'

const makeDeterministicRandomBytes = () => {
  let nextByte = 1
  return (byteCount: number): Uint8Array => {
    const bytes = new Uint8Array(byteCount)
    bytes.fill(nextByte)
    nextByte += 1
    return bytes
  }
}

describe('local Wallet vault', () => {
  it('creates standards-derived public accounts and keeps requests idempotent', async () => {
    const request = WalletCreationRequest.make({
      requestId: 'wallet-1',
      displayName: 'Wallet 1',
    })
    const TestWalletVault = makeLocalWalletVault(makeDeterministicRandomBytes())
    const [first, second] = await Effect.runPromise(
      Effect.gen(function* () {
        const vault = yield* WalletVault
        return yield* Effect.all([
          vault.createWallet(request),
          vault.createWallet(request),
        ])
      }).pipe(Effect.provide(TestWalletVault)),
    )

    expect(second).toStrictEqual(first)
    expect(first.accounts.bitcoin.devnetAddresses.nativeSegwitAddress).toMatch(
      /^bcrt1/,
    )
    expect(first.accounts.bitcoin.testnetAddresses.nativeSegwitAddress).toMatch(
      /^tb1/,
    )
    expect(first.accounts.ethereum.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(first.accounts.sui.address).toMatch(/^0x[0-9a-f]{64}$/)
    expect(activeWalletAccounts(first, 'Testnet')).toHaveLength(4)
  })

  it('restores the same profiles and addresses through a reconstructed vault', async () => {
    const storage = makeMemoryWalletVaultStorage()
    const request = WalletCreationRequest.make({
      requestId: 'wallet-1',
      displayName: 'Wallet 1',
    })
    const first = await Effect.runPromise(
      Effect.gen(function* () {
        const vault = yield* WalletVault
        return yield* vault.createWallet(request)
      }).pipe(
        Effect.provide(
          makePersistentLocalWalletVault(
            makeDeterministicRandomBytes(),
            storage,
          ),
        ),
      ),
    )
    const restored = await Effect.runPromise(
      Effect.gen(function* () {
        const vault = yield* WalletVault
        return yield* vault.loadWallets
      }).pipe(
        Effect.provide(
          makePersistentLocalWalletVault(
            makeDeterministicRandomBytes(),
            storage,
          ),
        ),
      ),
    )

    expect(restored).toStrictEqual([first])
  })

  it('does not report creation success when durable storage fails', async () => {
    const request = WalletCreationRequest.make({
      requestId: 'wallet-1',
      displayName: 'Wallet 1',
    })
    const TestWalletVault = makePersistentLocalWalletVault(
      makeDeterministicRandomBytes(),
      {
        loadRecords: Effect.succeed([]),
        saveRecord: () =>
          Effect.fail(new Error('unavailable')).pipe(
            Effect.mapError(
              () => new WalletVaultError({ code: 'Unavailable' }),
            ),
          ),
      },
    )
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const vault = yield* WalletVault
        return yield* vault.createWallet(request)
      }).pipe(Effect.provide(TestWalletVault)),
    )

    expect(exit._tag).toBe('Failure')
  })
})
