import { Context, Effect, Schema as S, Stream } from 'effect'
import {
  AccountBalance,
  type Network,
  type PreparedTransaction,
  ReceivingInstruction,
  type SignatureProof,
  type SignedTransaction,
  type SigningChallenge,
  type SigningDigest,
  type TransactionPreview,
  type TransactionQuote,
  type TransactionRecord,
  type TransactionSubmission,
  type TransferDraft,
  WalletAccount,
  type WalletClientError,
  type WalletCryptoError,
  type WalletSignerError,
} from 'wallet-core-example'

/** Public portfolio data loaded by one test-network transport. */
export const ChainPortfolio = S.Struct({
  account: WalletAccount,
  observedAt: S.Number,
  balances: S.Array(AccountBalance),
  receivingInstructions: S.Array(ReceivingInstruction),
})
/** Public portfolio data loaded by one test-network transport. */
export type ChainPortfolio = typeof ChainPortfolio.Type

/** Networking and public cryptographic operations for one chain. */
export type ChainTransportService = Readonly<{
  network: Network
  account: WalletAccount
  loadPortfolio: Effect.Effect<ChainPortfolio, WalletClientError>
  previewTransaction: (
    draft: TransferDraft,
  ) => Effect.Effect<TransactionQuote, WalletClientError>
  prepareTransaction: (
    preview: TransactionPreview,
  ) => Effect.Effect<PreparedTransaction, WalletClientError>
  submitTransaction: (
    transaction: SignedTransaction,
  ) => Effect.Effect<TransactionSubmission, WalletClientError>
  observeTransactions: Stream.Stream<TransactionRecord, WalletClientError>
  digestTransaction: (
    prepared: PreparedTransaction,
  ) => Effect.Effect<SigningDigest, WalletCryptoError>
  verifySignatureProof: (
    challenge: SigningChallenge,
    proof: SignatureProof,
  ) => Effect.Effect<boolean, WalletCryptoError>
}>

/** Secret-bearing custody operations for one configured chain account. */
export type ChainCustodyService = Readonly<{
  accountId: string
  signTransaction: (
    prepared: PreparedTransaction,
    digest: SigningDigest,
  ) => Effect.Effect<SignedTransaction, WalletSignerError>
  signChallenge: (
    challenge: SigningChallenge,
  ) => Effect.Effect<SignatureProof, WalletSignerError>
}>

/** Ethereum Sepolia networking isolated behind the wallet-core contract. */
export class EthereumSepoliaTransport extends Context.Service<
  EthereumSepoliaTransport,
  ChainTransportService
>()('WalletTestnetNode/EthereumSepoliaTransport') {}

/** Solana Devnet networking isolated behind the wallet-core contract. */
export class SolanaDevnetTransport extends Context.Service<
  SolanaDevnetTransport,
  ChainTransportService
>()('WalletTestnetNode/SolanaDevnetTransport') {}

/** Injected custody for the configured Ethereum Sepolia account. */
export class EthereumSepoliaCustody extends Context.Service<
  EthereumSepoliaCustody,
  ChainCustodyService
>()('WalletTestnetNode/EthereumSepoliaCustody') {}

/** Injected custody for the configured Solana Devnet account. */
export class SolanaDevnetCustody extends Context.Service<
  SolanaDevnetCustody,
  ChainCustodyService
>()('WalletTestnetNode/SolanaDevnetCustody') {}
