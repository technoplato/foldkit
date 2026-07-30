import { type Effect, Schema as S, type Stream } from 'effect'
import {
  AccountBalance,
  ReceivingInstruction,
  type SignedTransaction,
  TestFundingReceipt,
  type TestFundingRequest,
  TransactionHistoryPage,
  type TransactionHistoryQuery,
  type TransactionPayload,
  type TransactionPreview,
  type TransactionQuote,
  type TransactionRecord,
  type TransactionSubmission,
  type TransferRequest,
  type TransferValidation,
  type ValidatedTransfer,
  WalletAccount,
  type WalletClientError,
  WalletProfileAccount,
} from 'wallet-core-example'

import { LiveWalletNetwork } from './catalog.js'

/** One persisted account resolved against its exact live network adapter. */
export const LiveNetworkAccount = S.Struct({
  profile: WalletProfileAccount,
  account: WalletAccount,
  configuration: LiveWalletNetwork,
})
/** One persisted account resolved against its exact live network adapter. */
export type LiveNetworkAccount = typeof LiveNetworkAccount.Type

/** The complete executable surface implemented by one live chain adapter. */
export type LiveNetworkAdapter = Readonly<{
  configuration: LiveWalletNetwork
  loadBalance: (
    account: LiveNetworkAccount,
  ) => Effect.Effect<AccountBalance, WalletClientError>
  receivingInstruction: (account: LiveNetworkAccount) => ReceivingInstruction
  validateTransfer: (
    account: LiveNetworkAccount,
    request: TransferRequest,
  ) => Effect.Effect<TransferValidation, WalletClientError>
  previewTransfer: (
    account: LiveNetworkAccount,
    transfer: ValidatedTransfer,
  ) => Effect.Effect<TransactionQuote, WalletClientError>
  buildTransferPayload: (
    account: LiveNetworkAccount,
    preview: TransactionPreview,
  ) => Effect.Effect<TransactionPayload, WalletClientError>
  submitTransaction: (
    account: LiveNetworkAccount,
    transaction: SignedTransaction,
  ) => Effect.Effect<TransactionSubmission, WalletClientError>
  loadTransactionHistory: (
    account: LiveNetworkAccount,
    query: TransactionHistoryQuery,
  ) => Effect.Effect<TransactionHistoryPage, WalletClientError>
  observeTransactions: (
    account: LiveNetworkAccount,
  ) => Stream.Stream<TransactionRecord, WalletClientError>
  requestTestFunding: (
    account: LiveNetworkAccount,
    request: TestFundingRequest,
  ) => Effect.Effect<TestFundingReceipt, WalletClientError>
}>
