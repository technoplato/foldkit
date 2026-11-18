import { Array as Array_, Effect, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  WalletCreationRequest,
  WalletSigner,
  WalletVault,
  WalletVaultError,
  makeTransactionPayload,
} from 'wallet-core-example'
import { liveWalletNetworkDescriptors } from 'wallet-live-client-example'

import {
  type WalletVaultOwnerKey,
  type WalletVaultStorage,
  makeMemoryWalletVaultStorage,
  makeOwnerScopedLocalWalletResources,
} from './localWalletVault.js'

const michaelOwnerKey: WalletVaultOwnerKey =
  'MichaelMichaelMichaelMichaelMichaelMichael0'
const brandonOwnerKey: WalletVaultOwnerKey =
  'BrandonBrandonBrandonBrandonBrandonBrandon0'

const testNetworkIds: ReadonlyArray<string> = [
  'ethereum:sepolia',
  'solana:devnet',
]

const creationRequest = WalletCreationRequest.make({
  requestId: 'wallet-1',
  displayName: 'Wallet 1',
  networks: Array_.filter(liveWalletNetworkDescriptors, network =>
    Array_.contains(testNetworkIds, network.networkId),
  ),
})

const michaelFirstByte = 1
const brandonFirstByte = 101

const makeCountingRandomBytes = (firstByte = michaelFirstByte) => {
  let nextByte = firstByte
  return (byteCount: number): Uint8Array => {
    const bytes = new Uint8Array(byteCount)
    bytes.fill(nextByte)
    nextByte += 1
    return bytes
  }
}

const makeSharedBrowser = () => {
  const storages = new Map<string, WalletVaultStorage>()
  const opened: Array<string> = []
  const storageForOwner = (ownerKey: WalletVaultOwnerKey) => {
    opened.push(ownerKey)
    const existing = storages.get(ownerKey)
    if (existing !== undefined) {
      return existing
    }
    const storage = makeMemoryWalletVaultStorage(ownerKey)
    storages.set(ownerKey, storage)
    return storage
  }
  return { opened, storageForOwner }
}

const runWith = <A, E>(
  resources: Layer.Layer<WalletVault | WalletSigner>,
  effect: Effect.Effect<A, E, WalletVault | WalletSigner>,
): Promise<A> => Effect.runPromise(Effect.provide(effect, resources))

describe('owner-scoped custody', () => {
  it('opens no storage until the wallet is first used, then reuses it', async () => {
    const browser = makeSharedBrowser()
    const resources = makeOwnerScopedLocalWalletResources(
      makeCountingRandomBytes(),
      Effect.succeed(michaelOwnerKey),
      browser.storageForOwner,
    )

    const openedBeforeUse = await runWith(
      resources,
      Effect.sync(() => [...browser.opened]),
    )
    expect(openedBeforeUse).toEqual([])

    await runWith(
      resources,
      Effect.gen(function* () {
        const vault = yield* WalletVault
        yield* vault.loadWallets
        yield* vault.loadWallets
      }),
    )
    expect(browser.opened).toEqual([michaelOwnerKey])
  })

  it("never shows or signs another person's wallet on the same browser", async () => {
    const browser = makeSharedBrowser()
    const michael = makeOwnerScopedLocalWalletResources(
      makeCountingRandomBytes(),
      Effect.succeed(michaelOwnerKey),
      browser.storageForOwner,
    )
    const brandon = makeOwnerScopedLocalWalletResources(
      makeCountingRandomBytes(brandonFirstByte),
      Effect.succeed(brandonOwnerKey),
      browser.storageForOwner,
    )

    const michaelWallet = await runWith(
      michael,
      Effect.gen(function* () {
        const vault = yield* WalletVault
        return yield* vault.createWallet(creationRequest)
      }),
    )
    const michaelAccount = Option.getOrThrow(
      Array_.head(michaelWallet.accounts),
    )

    const brandonView = await runWith(
      brandon,
      Effect.gen(function* () {
        const vault = yield* WalletVault
        const signer = yield* WalletSigner
        const walletsBefore = yield* vault.loadWallets
        const signFailure = yield* Effect.flip(
          signer.signTransaction(
            makeTransactionPayload(
              michaelAccount.accountId,
              michaelAccount.networkId,
              '{}',
            ),
          ),
        )
        const ownWallet = yield* vault.createWallet(creationRequest)
        return { walletsBefore, signFailure, ownWallet }
      }),
    )

    expect(brandonView.walletsBefore).toEqual([])
    expect(brandonView.signFailure.code).toBe('UnsupportedAccount')
    const addressesOf = (wallet: typeof michaelWallet) =>
      Array_.map(wallet.accounts, account => account.address)
    expect(
      Array_.intersection(
        addressesOf(michaelWallet),
        addressesOf(brandonView.ownWallet),
      ),
    ).toEqual([])
  })

  it('opens nothing when the owner cannot be named, and asks again next time', async () => {
    const browser = makeSharedBrowser()
    const answers: Array<boolean> = [false, true]
    const resources = makeOwnerScopedLocalWalletResources(
      makeCountingRandomBytes(),
      Effect.suspend(() =>
        answers.shift() === true
          ? Effect.succeed(michaelOwnerKey)
          : Effect.fail(new WalletVaultError({ code: 'Unavailable' })),
      ),
      browser.storageForOwner,
    )

    const outcome = await runWith(
      resources,
      Effect.gen(function* () {
        const vault = yield* WalletVault
        const failure = yield* Effect.flip(vault.loadWallets)
        const openedAfterFailure = [...browser.opened]
        const wallets = yield* vault.loadWallets
        return { failure, openedAfterFailure, wallets }
      }),
    )

    expect(outcome.failure.code).toBe('Unavailable')
    expect(outcome.openedAfterFailure).toEqual([])
    expect(outcome.wallets).toEqual([])
    expect(browser.opened).toEqual([michaelOwnerKey])
  })
})
