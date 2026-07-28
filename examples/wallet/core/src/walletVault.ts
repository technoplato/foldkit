import { Context, Data, Effect } from 'effect'

import {
  type WalletCreationRequest,
  type WalletProfile,
} from './walletProfile.js'

/** A sanitized vault failure containing no secret key or host cause. */
export class WalletVaultError extends Data.TaggedError('WalletVaultError')<{
  readonly code: 'Unavailable' | 'InvalidKeyMaterial'
}> {}

/** Account-creation capabilities implemented by one injected custody Layer. */
export type WalletVaultService = Readonly<{
  createWallet: (
    request: WalletCreationRequest,
  ) => Effect.Effect<WalletProfile, WalletVaultError>
}>

/** An injected vault that owns all created Wallet private key material. */
export class WalletVault extends Context.Service<
  WalletVault,
  WalletVaultService
>()('Wallet/WalletVault') {}
