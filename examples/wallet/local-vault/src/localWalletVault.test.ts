import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  WalletCreationRequest,
  WalletVault,
  activeWalletAccounts,
} from 'wallet-core-example'

import { makeLocalWalletVault } from './localWalletVault.js'

const deterministicRandomBytes = (() => {
  let nextByte = 1
  return (byteCount: number): Uint8Array => {
    const bytes = new Uint8Array(byteCount)
    bytes.fill(nextByte)
    nextByte += 1
    return bytes
  }
})()

const TestWalletVault = makeLocalWalletVault(deterministicRandomBytes)

describe('local Wallet vault', () => {
  it('creates standards-derived public accounts and keeps requests idempotent', async () => {
    const request = WalletCreationRequest.make({
      requestId: 'wallet-1',
      displayName: 'Wallet 1',
    })
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
})
