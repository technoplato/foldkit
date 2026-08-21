import { Schema as S } from 'effect'
import {
  PortfolioSnapshot,
  TestFundingReceipt,
  TestFundingRequest,
  TransactionRecord,
  WalletFailure,
  WalletProfile,
} from 'wallet-core-example'

import { Chain, FiatMethod, IsoCurrency, MinorUnits, Network } from './model.js'

/** Host selected a crypto rail option. */
export const SelectedCryptoRail = S.TaggedStruct('SelectedCryptoRail', {
  chain: Chain,
  network: Network,
})
/** Host requested a crypto deposit on the selected rail. */
export const RequestedCryptoDeposit = S.TaggedStruct('RequestedCryptoDeposit', {
  chain: Chain,
  network: Network,
})
/** Host requested a fiat deposit. Always refuses in v1. */
export const RequestedFiatDeposit = S.TaggedStruct('RequestedFiatDeposit', {
  method: FiatMethod,
  currency: IsoCurrency,
  amount: MinorUnits,
})
/** Host requested a Devnet SOL airdrop. */
export const RequestedTestFunding = S.TaggedStruct('RequestedTestFunding', {})
/** Host requested copying the public receive address. */
export const RequestedCopyAddress = S.TaggedStruct('RequestedCopyAddress', {})
/** Host requested creating a receive wallet. */
export const RequestedWalletCreation = S.TaggedStruct(
  'RequestedWalletCreation',
  {},
)

/** Vault restored public profiles. */
export const SucceededLoadProfiles = S.TaggedStruct('SucceededLoadProfiles', {
  wallets: S.Array(WalletProfile),
})
/** Vault could not restore public profiles. */
export const FailedLoadProfiles = S.TaggedStruct('FailedLoadProfiles', {
  code: S.Literals(['Unavailable', 'InvalidKeyMaterial']),
})
/** Vault created a public profile. */
export const SucceededCreateWallet = S.TaggedStruct('SucceededCreateWallet', {
  wallet: WalletProfile,
})
/** Vault could not create a public profile. */
export const FailedCreateWallet = S.TaggedStruct('FailedCreateWallet', {
  code: S.Literals(['Unavailable', 'InvalidKeyMaterial']),
})
/** Client loaded a public portfolio. */
export const SucceededLoadPortfolio = S.TaggedStruct('SucceededLoadPortfolio', {
  wallets: S.Array(WalletProfile),
  portfolio: PortfolioSnapshot,
})
/** Client could not load a public portfolio. */
export const FailedLoadPortfolio = S.TaggedStruct('FailedLoadPortfolio', {
  failure: WalletFailure,
})

/** A live adapter observed a public transaction. */
export const ObservedIncoming = S.TaggedStruct('ObservedIncoming', {
  transaction: TransactionRecord,
})
/** Observation failed. */
export const FailedObserveIncoming = S.TaggedStruct('FailedObserveIncoming', {
  failure: WalletFailure,
})
/** Test funding was accepted. */
export const SucceededTestFunding = S.TaggedStruct('SucceededTestFunding', {
  request: TestFundingRequest,
  receipt: TestFundingReceipt,
})
/** Test funding failed. */
export const FailedTestFunding = S.TaggedStruct('FailedTestFunding', {
  request: TestFundingRequest,
  failure: WalletFailure,
})
/** Clipboard wrote the public address. */
export const SucceededCopyAddress = S.TaggedStruct('SucceededCopyAddress', {
  address: S.String,
})
/** Clipboard write failed. */
export const FailedCopyAddress = S.TaggedStruct('FailedCopyAddress', {
  code: S.Literals(['Unavailable', 'Denied', 'Failed']),
})

/** Every Message accepted by the Deposit Program. */
export const Message = S.Union([
  SelectedCryptoRail,
  RequestedCryptoDeposit,
  RequestedFiatDeposit,
  RequestedTestFunding,
  RequestedCopyAddress,
  RequestedWalletCreation,
  SucceededLoadProfiles,
  FailedLoadProfiles,
  SucceededCreateWallet,
  FailedCreateWallet,
  SucceededLoadPortfolio,
  FailedLoadPortfolio,
  ObservedIncoming,
  FailedObserveIncoming,
  SucceededTestFunding,
  FailedTestFunding,
  SucceededCopyAddress,
  FailedCopyAddress,
])
/** A Deposit Message value. */
export type Message = typeof Message.Type

/** Tags that exist on Message. No live Stripe charge tag exists. */
export const MESSAGE_TAGS: ReadonlyArray<Message['_tag']> = [
  'SelectedCryptoRail',
  'RequestedCryptoDeposit',
  'RequestedFiatDeposit',
  'RequestedTestFunding',
  'RequestedCopyAddress',
  'RequestedWalletCreation',
  'SucceededLoadProfiles',
  'FailedLoadProfiles',
  'SucceededCreateWallet',
  'FailedCreateWallet',
  'SucceededLoadPortfolio',
  'FailedLoadPortfolio',
  'ObservedIncoming',
  'FailedObserveIncoming',
  'SucceededTestFunding',
  'FailedTestFunding',
  'SucceededCopyAddress',
  'FailedCopyAddress',
]

/** Type-level proof that a live Stripe charge message cannot be constructed. */
export type LiveStripeChargeMessageIsRepresentable =
  Extract<Message, { readonly _tag: 'RequestedLiveStripeCharge' }> extends never
    ? false
    : true

/** Runtime proof that a live Stripe charge message cannot be constructed. */
export const liveStripeChargeMessageIsRepresentable: LiveStripeChargeMessageIsRepresentable = false
