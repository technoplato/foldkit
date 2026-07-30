import { Layer } from 'effect'
import {
  type WalletClient,
  type WalletClipboard,
  type WalletCrypto,
  type WalletResources,
  type WalletSigner,
  type WalletVault,
} from 'wallet-core-example'

/** Composes one complete host Wallet graph from explicit client and custody layers. */
export const mergeWalletResourceLayers = (
  walletClient: Layer.Layer<WalletClient>,
  walletCustody: Layer.Layer<WalletVault | WalletSigner | WalletCrypto>,
  walletClipboard: Layer.Layer<WalletClipboard>,
): Layer.Layer<WalletResources> =>
  Layer.mergeAll(walletClient, walletCustody, walletClipboard)
