import { Effect, Layer } from 'effect'
import { spawn } from 'node:child_process'
import {
  WalletClipboard,
  WalletClipboardError,
  type WalletResources,
} from 'wallet-core-example'
import { LiveWalletClient } from 'wallet-live-client-example'
import { makePersistentLocalWalletResources } from 'wallet-local-vault-example'
import {
  MacOSKeychainWalletVaultStorage,
  makeLocalMacOSKeychainWalletVaultStorage,
  nativeKeychainEntryFactory,
} from 'wallet-local-vault-example/macos-keychain'

const secureRandomBytes = (byteCount: number): Uint8Array =>
  globalThis.crypto.getRandomValues(new Uint8Array(byteCount))

const writeMacOSClipboard = (
  value: string,
): Effect.Effect<void, WalletClipboardError> =>
  Effect.tryPromise({
    try: () =>
      new Promise<void>((resolve, reject) => {
        const childProcess = spawn('/usr/bin/pbcopy', [], {
          stdio: ['pipe', 'ignore', 'ignore'],
        })
        childProcess.once('error', reject)
        childProcess.once('close', code => {
          if (code === 0) {
            resolve()
          } else {
            reject(new Error('pbcopy failed'))
          }
        })
        childProcess.stdin.end(value)
      }),
    catch: () => new WalletClipboardError({ code: 'Failed' }),
  })

/** Public clipboard writing through the native macOS pasteboard command. */
export const MacOSWalletClipboard = Layer.succeed(
  WalletClipboard,
  WalletClipboard.of({ writeText: writeMacOSClipboard }),
)

/** Live multi-chain networking and macOS Keychain-backed local custody. */
export const MacOSLiveWalletResources: Layer.Layer<WalletResources> =
  Layer.mergeAll(
    LiveWalletClient,
    makePersistentLocalWalletResources(
      secureRandomBytes,
      MacOSKeychainWalletVaultStorage,
    ),
    MacOSWalletClipboard,
  )

const vendingTillKeychainService = 'com.foldkit.vending.till.v1'

/** Live Devnet networking with a till-owned Keychain vault, not the personal wallet. */
export const MacOSVendingTillWalletResources: Layer.Layer<WalletResources> =
  Layer.mergeAll(
    LiveWalletClient,
    makePersistentLocalWalletResources(
      secureRandomBytes,
      makeLocalMacOSKeychainWalletVaultStorage(
        nativeKeychainEntryFactory,
        vendingTillKeychainService,
      ),
    ),
    MacOSWalletClipboard,
  )
