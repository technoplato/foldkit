import { Context, Effect, Schema as S, Stream } from 'effect'
import {
  AccountBalance,
  AssetDescriptor,
  ChainDescriptor,
  NetworkDescriptor,
  ReceivingInstruction,
  type SignatureProof,
  type SignedTransaction,
  type SigningChallenge,
  type TransactionHistoryPage,
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
  type WalletCryptoError,
  type WalletSignerError,
} from 'wallet-core-example'

/** Normalized public portfolio data loaded by one chain transport. */
export const ChainPortfolio = S.Struct({
  chain: ChainDescriptor,
  network: NetworkDescriptor,
  assets: S.Array(AssetDescriptor),
  account: WalletAccount,
  observedAt: S.Number,
  balances: S.Array(AccountBalance),
  receivingInstructions: S.Array(ReceivingInstruction),
})
/** Normalized public portfolio data loaded by one chain transport. */
export type ChainPortfolio = typeof ChainPortfolio.Type

/** Networking and public cryptographic operations for one chain adapter. */
export type ChainTransportService = Readonly<{
  chain: ChainDescriptor
  network: NetworkDescriptor
  assets: ReadonlyArray<AssetDescriptor>
  account: WalletAccount
  loadPortfolio: Effect.Effect<ChainPortfolio, WalletClientError>
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
  observeTransactions: Stream.Stream<TransactionRecord, WalletClientError>
  verifySignatureProof: (
    challenge: SigningChallenge,
    proof: SignatureProof,
  ) => Effect.Effect<boolean, WalletCryptoError>
}>

/** Secret-bearing custody operations for one configured chain account. */
export type ChainCustodyService = Readonly<{
  accountId: string
  networkId: string
  signTransaction: (
    payload: TransactionPayload,
  ) => Effect.Effect<SignedTransaction, WalletSignerError>
  signChallenge: (
    challenge: SigningChallenge,
  ) => Effect.Effect<SignatureProof, WalletSignerError>
}>

/** Ethereum Sepolia networking isolated behind the normalized contract. */
export class EthereumSepoliaTransport extends Context.Service<
  EthereumSepoliaTransport,
  ChainTransportService
>()('WalletTestnetNode/EthereumSepoliaTransport') {}

/** Solana Devnet networking isolated behind the normalized contract. */
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
