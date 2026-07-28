import { Schema as S } from 'effect'

import {
  AddressBookEntry,
  PortfolioSnapshot,
  SignatureProof,
  SigningChallenge,
  TransactionPreview,
  TransactionRecord,
  TransactionSubmission,
  TransferDraft,
  WalletFailure,
} from './model.js'

/** The host changed the editable transfer recipient. */
export const ChangedTransferRecipient = S.TaggedStruct(
  'ChangedTransferRecipient',
  { value: S.String },
)
/** The host requested a preview for the current valid transfer recipient. */
export const RequestedTransferPreview = S.TaggedStruct(
  'RequestedTransferPreview',
  {},
)

/** The host requested a fresh public portfolio snapshot. */
export const RequestedWalletRefresh = S.TaggedStruct(
  'RequestedWalletRefresh',
  {},
)
/** The LoadWallet Command loaded public wallet data. */
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
/** The host composed a public transfer draft. */
export const ComposedTransfer = S.TaggedStruct('ComposedTransfer', {
  draft: TransferDraft,
})
/** The PreviewTransaction Command produced a public preview. */
export const SucceededPreviewTransaction = S.TaggedStruct(
  'SucceededPreviewTransaction',
  { preview: TransactionPreview },
)
/** The PreviewTransaction Command failed. */
export const FailedPreviewTransaction = S.TaggedStruct(
  'FailedPreviewTransaction',
  { draft: TransferDraft, failure: WalletFailure },
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
  RequestedWalletRefresh,
  SucceededLoadWallet,
  FailedLoadWallet,
  ChangedTransferRecipient,
  RequestedTransferPreview,
  ImportedAddressBookEntries,
  AddedAddressBookEntry,
  RemovedAddressBookEntry,
  ComposedTransfer,
  SucceededPreviewTransaction,
  FailedPreviewTransaction,
  RequestedSignedTransactionSubmission,
  SucceededSubmitSignedTransaction,
  FailedSubmitSignedTransaction,
  RequestedChallengeSignature,
  SucceededSignChallenge,
  FailedSignChallenge,
  ObservedTransaction,
  FailedObserveTransactions,
  ResumedTransactionObservation,
])
/** Every fact accepted or produced by the Wallet Program. */
export type Message = typeof Message.Type
