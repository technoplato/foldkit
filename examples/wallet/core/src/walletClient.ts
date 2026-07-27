import { Context, Data, Effect, Redacted, Stream } from 'effect'

import { type Network } from './currency.js'
import {
  type PortfolioSnapshot,
  type SignatureProof,
  type SigningChallenge,
  type TransactionPreview,
  type TransactionQuote,
  type TransactionRecord,
  type TransactionSubmission,
  type TransferDraft,
  type WalletAccount,
} from './model.js'

/** A prepared transaction whose encoded payload is protected from logging. */
export type PreparedTransaction = Readonly<{
  accountId: string
  network: Network
  payload: Redacted.Redacted<string>
}>

/** A signing digest protected from logging. */
export type SigningDigest = Redacted.Redacted<string>

/** A signed transaction whose encoded payload is protected from logging. */
export type SignedTransaction = Readonly<{
  accountId: string
  network: Network
  payload: Redacted.Redacted<string>
}>

/** Creates a protected prepared transaction for a WalletClient Layer. */
export const makePreparedTransaction = (
  accountId: string,
  network: Network,
  payload: string,
): PreparedTransaction => ({
  accountId,
  network,
  payload: Redacted.make(payload),
})

/** Creates a protected signing digest for a WalletCrypto Layer. */
export const makeSigningDigest = (digest: string): SigningDigest =>
  Redacted.make(digest)

/** Creates a protected signed transaction for a WalletSigner Layer. */
export const makeSignedTransaction = (
  accountId: string,
  network: Network,
  payload: string,
): SignedTransaction => ({
  accountId,
  network,
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

/** Networking capabilities implemented by one injected chain Layer. */
export type WalletClientService = Readonly<{
  loadPortfolio: Effect.Effect<PortfolioSnapshot, WalletClientError>
  previewTransaction: (
    draft: TransferDraft,
  ) => Effect.Effect<TransactionQuote, WalletClientError>
  prepareTransaction: (
    preview: TransactionPreview,
  ) => Effect.Effect<PreparedTransaction, WalletClientError>
  submitTransaction: (
    transaction: SignedTransaction,
  ) => Effect.Effect<TransactionSubmission, WalletClientError>
  observeTransactions: (
    accounts: ReadonlyArray<WalletAccount>,
  ) => Stream.Stream<TransactionRecord, WalletClientError>
}>

/** An injected networking client selected by the host. */
export class WalletClient extends Context.Service<
  WalletClient,
  WalletClientService
>()('Wallet/WalletClient') {}

/** Signing capabilities implemented by an injected account custody Layer. */
export type WalletSignerService = Readonly<{
  signTransaction: (
    prepared: PreparedTransaction,
    digest: SigningDigest,
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

/** Cryptographic capabilities implemented by an injected platform Layer. */
export type WalletCryptoService = Readonly<{
  digestTransaction: (
    prepared: PreparedTransaction,
  ) => Effect.Effect<SigningDigest, WalletCryptoError>
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
