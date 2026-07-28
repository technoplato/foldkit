import { Schema as S } from 'effect'

import { ClipboardCopyRequest } from './clipboard.js'
import {
  AddressBookEntry,
  PortfolioSnapshot,
  SignatureProof,
  SigningChallenge,
  TransactionHistoryPage,
  TransactionHistoryQuery,
  TransactionPreview,
  TransactionRecord,
  TransactionSubmission,
  TransferRequest,
  TransferValidation,
  ValidatedTransfer,
  WalletFailure,
} from './model.js'
import { SendNetworkSelection } from './sendNetworkSelection.js'
import {
  WalletCreationRequest,
  WalletNetworkMode,
  WalletProfile,
} from './walletProfile.js'

/** The host selected one global non-production network mode. */
export const SelectedWalletNetworkMode = S.TaggedStruct(
  'SelectedWalletNetworkMode',
  { networkMode: WalletNetworkMode },
)
/** The host selected one exact chain, network, account, and asset for sending. */
export const SelectedSendNetwork = S.TaggedStruct('SelectedSendNetwork', {
  selection: SendNetworkSelection,
})
/** The host requested creation of one complete multi-chain Wallet profile. */
export const RequestedWalletCreation = S.TaggedStruct(
  'RequestedWalletCreation',
  {},
)
/** The CreateWallet Command created one public multi-chain Wallet profile. */
export const SucceededCreateWallet = S.TaggedStruct('SucceededCreateWallet', {
  request: WalletCreationRequest,
  wallet: WalletProfile,
})
/** The CreateWallet Command failed without exposing a vault cause. */
export const FailedCreateWallet = S.TaggedStruct('FailedCreateWallet', {
  request: WalletCreationRequest,
  code: S.Literals(['Unavailable', 'InvalidKeyMaterial']),
})

/** The host requested writing one public value to its clipboard. */
export const RequestedClipboardCopy = S.TaggedStruct('RequestedClipboardCopy', {
  request: ClipboardCopyRequest,
})
/** The CopyToClipboard Command wrote one public value. */
export const SucceededCopyToClipboard = S.TaggedStruct(
  'SucceededCopyToClipboard',
  { request: ClipboardCopyRequest },
)
/** The CopyToClipboard Command could not write one public value. */
export const FailedCopyToClipboard = S.TaggedStruct('FailedCopyToClipboard', {
  request: ClipboardCopyRequest,
  code: S.Literals(['Unavailable', 'Denied', 'Failed']),
})

/** The host changed the editable transfer recipient. */
export const ChangedTransferRecipient = S.TaggedStruct(
  'ChangedTransferRecipient',
  { value: S.String },
)
/** The host requested a preview for the current transfer recipient. */
export const RequestedTransferPreview = S.TaggedStruct(
  'RequestedTransferPreview',
  {},
)
/** The host requested a fresh public portfolio snapshot. */
export const RequestedWalletRefresh = S.TaggedStruct(
  'RequestedWalletRefresh',
  {},
)
/** The LoadWallet Command loaded normalized public wallet data. */
export const SucceededLoadWallet = S.TaggedStruct('SucceededLoadWallet', {
  portfolio: PortfolioSnapshot,
})
/** The LoadWallet Command failed with a sanitized failure. */
export const FailedLoadWallet = S.TaggedStruct('FailedLoadWallet', {
  failure: WalletFailure,
})
/** The host imported a complete public address book. */
export const ImportedAddressBookEntries = S.TaggedStruct(
  'ImportedAddressBookEntries',
  { entries: S.Array(AddressBookEntry) },
)
/** The host added or replaced one public address-book entry. */
export const AddedAddressBookEntry = S.TaggedStruct('AddedAddressBookEntry', {
  entry: AddressBookEntry,
})
/** The host removed one public address-book entry. */
export const RemovedAddressBookEntry = S.TaggedStruct(
  'RemovedAddressBookEntry',
  { entryId: S.String },
)
/** The host composed one generic public transfer request. */
export const ComposedTransfer = S.TaggedStruct('ComposedTransfer', {
  request: TransferRequest,
})
/** The ValidateTransfer Command produced a portable validation result. */
export const SucceededValidateTransfer = S.TaggedStruct(
  'SucceededValidateTransfer',
  { validation: TransferValidation },
)
/** The ValidateTransfer Command could not reach the selected adapter. */
export const FailedValidateTransfer = S.TaggedStruct('FailedValidateTransfer', {
  request: TransferRequest,
  failure: WalletFailure,
})
/** The PreviewTransfer Command produced a public preview. */
export const SucceededPreviewTransaction = S.TaggedStruct(
  'SucceededPreviewTransaction',
  { preview: TransactionPreview },
)
/** The PreviewTransfer Command failed. */
export const FailedPreviewTransaction = S.TaggedStruct(
  'FailedPreviewTransaction',
  { transfer: ValidatedTransfer, failure: WalletFailure },
)
/** The host requested submission of one preview as a signed transaction. */
export const RequestedSignedTransactionSubmission = S.TaggedStruct(
  'RequestedSignedTransactionSubmission',
  { previewId: S.String },
)
/** The SignAndSubmitTransaction Command submitted a signed transaction. */
export const SucceededSubmitSignedTransaction = S.TaggedStruct(
  'SucceededSubmitSignedTransaction',
  { submission: TransactionSubmission },
)
/** The SignAndSubmitTransaction Command failed. */
export const FailedSubmitSignedTransaction = S.TaggedStruct(
  'FailedSubmitSignedTransaction',
  { preview: TransactionPreview, failure: WalletFailure },
)
/** The host requested a signature over one public canonical challenge. */
export const RequestedChallengeSignature = S.TaggedStruct(
  'RequestedChallengeSignature',
  { challenge: SigningChallenge },
)
/** The SignChallenge Command produced a verified public proof. */
export const SucceededSignChallenge = S.TaggedStruct('SucceededSignChallenge', {
  challenge: SigningChallenge,
  proof: SignatureProof,
})
/** The SignChallenge Command failed to sign or verify the challenge. */
export const FailedSignChallenge = S.TaggedStruct('FailedSignChallenge', {
  challenge: SigningChallenge,
  failure: WalletFailure,
})
/** The host requested the next available transaction-history page. */
export const RequestedNextTransactionHistoryPage = S.TaggedStruct(
  'RequestedNextTransactionHistoryPage',
  {},
)
/** The LoadTransactionHistory Command loaded one normalized history page. */
export const SucceededLoadTransactionHistory = S.TaggedStruct(
  'SucceededLoadTransactionHistory',
  { query: TransactionHistoryQuery, page: TransactionHistoryPage },
)
/** The LoadTransactionHistory Command failed. */
export const FailedLoadTransactionHistory = S.TaggedStruct(
  'FailedLoadTransactionHistory',
  { query: TransactionHistoryQuery, failure: WalletFailure },
)
/** A live network Subscription observed a public transaction record. */
export const ObservedTransaction = S.TaggedStruct('ObservedTransaction', {
  transaction: TransactionRecord,
})
/** A live network Subscription failed with a sanitized failure. */
export const FailedObserveTransactions = S.TaggedStruct(
  'FailedObserveTransactions',
  { failure: WalletFailure },
)
/** The host resumed live transaction observation after a failure. */
export const ResumedTransactionObservation = S.TaggedStruct(
  'ResumedTransactionObservation',
  {},
)

/** Every fact accepted or produced by the Wallet Program. */
export const Message = S.Union([
  SelectedWalletNetworkMode,
  SelectedSendNetwork,
  RequestedWalletCreation,
  SucceededCreateWallet,
  FailedCreateWallet,
  RequestedClipboardCopy,
  SucceededCopyToClipboard,
  FailedCopyToClipboard,
  RequestedWalletRefresh,
  SucceededLoadWallet,
  FailedLoadWallet,
  ChangedTransferRecipient,
  RequestedTransferPreview,
  ImportedAddressBookEntries,
  AddedAddressBookEntry,
  RemovedAddressBookEntry,
  ComposedTransfer,
  SucceededValidateTransfer,
  FailedValidateTransfer,
  SucceededPreviewTransaction,
  FailedPreviewTransaction,
  RequestedSignedTransactionSubmission,
  SucceededSubmitSignedTransaction,
  FailedSubmitSignedTransaction,
  RequestedChallengeSignature,
  SucceededSignChallenge,
  FailedSignChallenge,
  RequestedNextTransactionHistoryPage,
  SucceededLoadTransactionHistory,
  FailedLoadTransactionHistory,
  ObservedTransaction,
  FailedObserveTransactions,
  ResumedTransactionObservation,
])
/** Every fact accepted or produced by the Wallet Program. */
export type Message = typeof Message.Type
