import { Effect, Layer } from 'effect'
import {
  WalletClipboardUnavailable,
  type WalletResources,
} from 'wallet-core-example'
import { makeLiveWalletClientLayer } from 'wallet-live-client-example'
import {
  type WalletRandomBytes,
  type WalletVaultStorage,
  makeMemoryWalletVaultStorage,
  makeOwnerScopedLocalWalletResources,
} from 'wallet-local-vault-example'

import { brandonWalletNetworks } from './wallet.js'

/** The owner partition every Brandon dot test wallet opens. */
export const testWalletOwnerKey = 'BrandonBrandonBrandonBrandonBrandonBrandon0'

const countingRandomBytes = (): WalletRandomBytes => {
  let nextByte = 1
  return byteCount => {
    const bytes = new Uint8Array(byteCount).fill(nextByte)
    nextByte += 1
    return bytes
  }
}

/**
 * The wallet's resources for a test: the real chain client on Brandon
 * dot's four networks, which reaches no chain until a wallet exists, and
 * a vault in memory. Each key is 32 copies of one byte, counting up from
 * 1, so a test knows every key it made.
 */
export const makeTestWalletResources = (
  storage: WalletVaultStorage = makeMemoryWalletVaultStorage(
    testWalletOwnerKey,
  ),
): Layer.Layer<WalletResources> =>
  Layer.mergeAll(
    makeLiveWalletClientLayer(brandonWalletNetworks),
    makeOwnerScopedLocalWalletResources(
      countingRandomBytes(),
      Effect.succeed(testWalletOwnerKey),
      () => storage,
    ),
    WalletClipboardUnavailable,
  )
