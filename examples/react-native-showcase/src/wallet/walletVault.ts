import { Layer } from 'effect'
import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'
import { WalletCrypto, WalletSigner, WalletVault } from 'wallet-core-example'
import {
  makePersistentLocalWalletResources,
  makePersistentLocalWalletVault,
} from 'wallet-local-vault-example'

import {
  type ExpoSecureStoreClient,
  makeExpoWalletVaultStorage,
} from './walletVaultStorage'

const walletKeychainService = 'foldkit.wallet.v1'

const ExpoSecureStore: ExpoSecureStoreClient = {
  isAvailable: SecureStore.isAvailableAsync,
  load: key =>
    SecureStore.getItemAsync(key, {
      keychainService: walletKeychainService,
    }),
  save: (key, value) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      keychainService: walletKeychainService,
    }),
  digestKey: value =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
}

/** Persistent native Wallet vault backed by iOS Keychain or Android Keystore. */
export const ExpoWalletVault: Layer.Layer<WalletVault> =
  makePersistentLocalWalletVault(
    byteCount => Crypto.getRandomBytes(byteCount),
    makeExpoWalletVaultStorage(ExpoSecureStore),
  )

/** Persistent native Wallet vault, signer, and crypto services. */
export const ExpoWalletResources: Layer.Layer<
  WalletVault | WalletSigner | WalletCrypto
> = makePersistentLocalWalletResources(
  byteCount => Crypto.getRandomBytes(byteCount),
  makeExpoWalletVaultStorage(ExpoSecureStore),
)
