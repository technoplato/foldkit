import { Layer } from 'effect'
import {
  WalletClipboardUnavailable,
  type WalletResources,
} from 'wallet-core-example'
import { LiveWalletClient } from 'wallet-live-client-example'
import { makePersistentLocalWalletResources } from 'wallet-local-vault-example'
import { MacOSKeychainWalletVaultStorage } from 'wallet-local-vault-example/macos-keychain'

const secureRandomBytes = (byteCount: number): Uint8Array =>
  globalThis.crypto.getRandomValues(new Uint8Array(byteCount))

/** Live multi-chain networking and macOS Keychain-backed local custody. */
export const MacOSLiveWalletResources: Layer.Layer<WalletResources> =
  Layer.mergeAll(
    LiveWalletClient,
    makePersistentLocalWalletResources(
      secureRandomBytes,
      MacOSKeychainWalletVaultStorage,
    ),
    WalletClipboardUnavailable,
  )
