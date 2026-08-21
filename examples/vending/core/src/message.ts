import { Schema as S } from 'effect'
import { NonNegativeInt } from 'foldkit/adt'
import {
  PortfolioSnapshot,
  TestFundingReceipt,
  TestFundingRequest,
  TransactionRecord,
  WalletFailure,
  WalletProfile,
} from 'wallet-core-example'

import { Digit } from './model.js'

/** Host pressed a keypad digit. */
export const PressedDigit = S.TaggedStruct('PressedDigit', {
  digit: Digit,
})
/** Host pressed Enter on the keypad. */
export const PressedEnter = S.TaggedStruct('PressedEnter', {})
/** Host pressed Clear on the keypad. */
export const PressedClear = S.TaggedStruct('PressedClear', {})
/** Host declared the vend wait timed out. */
export const ReportedVendTimeout = S.TaggedStruct('ReportedVendTimeout', {})
/** Host advanced clip playback to this elapsed millisecond. */
export const AdvancedClipPlayback = S.TaggedStruct('AdvancedClipPlayback', {
  elapsedMs: NonNegativeInt,
})
/** Host requested copying the public receive address. */
export const RequestedCopyAddress = S.TaggedStruct('RequestedCopyAddress', {})
/** Host requested creating a receive wallet. */
export const RequestedWalletCreation = S.TaggedStruct(
  'RequestedWalletCreation',
  {},
)
/** Host requested a Devnet SOL airdrop. */
export const RequestedTestFunding = S.TaggedStruct('RequestedTestFunding', {})

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

/** Every Message accepted by the Vending Program. */
export const Message = S.Union([
  PressedDigit,
  PressedEnter,
  PressedClear,
  ReportedVendTimeout,
  AdvancedClipPlayback,
  RequestedCopyAddress,
  RequestedWalletCreation,
  RequestedTestFunding,
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
/** A Vending Message value. */
export type Message = typeof Message.Type
