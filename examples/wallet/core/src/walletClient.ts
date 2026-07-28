import { Context, Data, Effect, Redacted, Schema as S, Stream } from 'effect'

import { NetworkId } from './currency.js'
import {
  type PortfolioSnapshot,
  type SignatureProof,
  type SigningChallenge,
  type TransactionHistoryPage,
  type TransactionHistoryQuery,
  type TransactionPreview,
  type TransactionQuote,
  type TransactionRecord,
  type TransactionSubmission,
  type TransferRequest,
  type TransferValidation,
  type ValidatedTransfer,
} from './model.js'

/** An opaque transaction payload protected from logging and replay. */
export const TransactionPayload = S.Struct({
  accountId: S.String,
  networkId: NetworkId,
  payload: S.Redacted(S.String),
})
/** An opaque transaction payload protected from logging and replay. */
export type TransactionPayload = typeof TransactionPayload.Type

/** A signed transaction protected from logging and replay. */
export const SignedTransaction = S.Struct({
  accountId: S.String,
  networkId: NetworkId,
  payload: S.Redacted(S.String),
})
/** A signed transaction protected from logging and replay. */
export type SignedTransaction = typeof SignedTransaction.Type

/** Creates a protected payload built by one chain adapter. */
export const makeTransactionPayload = (
  accountId: string,
  networkId: NetworkId,
  payload: string,
): TransactionPayload =>
  TransactionPayload.make({
    accountId,
    networkId,
    payload: Redacted.make(payload),
  })

/** Creates a protected signed transaction returned by one custody adapter. */
export const makeSignedTransaction = (
  accountId: string,
  networkId: NetworkId,
  payload: string,
): SignedTransaction =>
  SignedTransaction.make({
    accountId,
    networkId,
    payload: Redacted.make(payload),
  })

/** A sanitized networking failure that contains no host cause. */
export class WalletClientError extends Data.TaggedError('WalletClientError')<{
  readonly code: 'Unavailable' | 'Rejected' | 'InvalidResponse'
}> {}

/** A sanitized signing failure that contains no key or host cause. */
export class WalletSignerError extends Data.TaggedError('WalletSignerError')<{
  readonly code: 'Unavailable' | 'Denied' | 'UnsupportedAccount'
}> {}

/** A sanitized cryptographic failure that contains no private payload. */
export class WalletCryptoError extends Data.TaggedError('WalletCryptoError')<{
  readonly code: 'Unavailable' | 'InvalidPayload' | 'VerificationFailed'
}> {}

/** Chain-agnostic networking capabilities implemented by host Layers. */
export type WalletClientService = Readonly<{
  loadPortfolio: Effect.Effect<PortfolioSnapshot, WalletClientError>
  validateTransfer: (
    request: TransferRequest,
  ) => Effect.Effect<TransferValidation, WalletClientError>
  previewTransfer: (
    transfer: ValidatedTransfer,
  ) => Effect.Effect<TransactionQuote, WalletClientError>
  buildTransferPayload: (
    preview: TransactionPreview,
  ) => Effect.Effect<TransactionPayload, WalletClientError>
  submitTransaction: (
    transaction: SignedTransaction,
  ) => Effect.Effect<TransactionSubmission, WalletClientError>
  loadTransactionHistory: (
    query: TransactionHistoryQuery,
  ) => Effect.Effect<TransactionHistoryPage, WalletClientError>
  observeTransactions: (
    accountIds: ReadonlyArray<string>,
  ) => Stream.Stream<TransactionRecord, WalletClientError>
}>

/** An injected Wallet client selected and composed by the host. */
export class WalletClient extends Context.Service<
  WalletClient,
  WalletClientService
>()('Wallet/WalletClient') {}

/** Signing capabilities implemented by injected account custody Layers. */
export type WalletSignerService = Readonly<{
  signTransaction: (
    payload: TransactionPayload,
  ) => Effect.Effect<SignedTransaction, WalletSignerError>
  signChallenge: (
    challenge: SigningChallenge,
  ) => Effect.Effect<SignatureProof, WalletSignerError>
}>

/** An injected signer that owns all private key access. */
export class WalletSigner extends Context.Service<
  WalletSigner,
  WalletSignerService
>()('Wallet/WalletSigner') {}

/** Public cryptographic verification implemented by injected adapters. */
export type WalletCryptoService = Readonly<{
  verifySignatureProof: (
    challenge: SigningChallenge,
    proof: SignatureProof,
  ) => Effect.Effect<boolean, WalletCryptoError>
}>

/** An injected cryptographic implementation with no renderer assumptions. */
export class WalletCrypto extends Context.Service<
  WalletCrypto,
  WalletCryptoService
>()('Wallet/WalletCrypto') {}

/** Every Effect service required by the Wallet Program. */
export type WalletResources = WalletClient | WalletSigner | WalletCrypto
