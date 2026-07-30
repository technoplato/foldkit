import { Schema as S } from 'effect'
import { Rpc, RpcGroup } from 'effect/unstable/rpc'
import {
  NetworkId,
  PortfolioSnapshot,
  SignatureProof,
  SigningChallenge,
  TestFundingReceipt,
  TestFundingRequest,
  TransactionHistoryPage,
  TransactionHistoryQuery,
  TransactionPreview,
  TransactionQuote,
  TransactionRecord,
  TransactionSubmission,
  TransferRequest,
  TransferValidation,
  ValidatedTransfer,
  WalletProfile,
} from 'wallet-core-example'

/** Operations exposed by the deliberately unauthenticated testnet bridge. */
export const WalletRemoteOperation = S.Literals([
  'LoadPortfolio',
  'RequestTestFunding',
  'ValidateTransfer',
  'PreviewTransfer',
  'BuildTransferPayload',
  'SignTransaction',
  'SubmitTransaction',
  'LoadTransactionHistory',
  'SignChallenge',
  'VerifySignatureProof',
  'ObserveTransactions',
])
/** Operations exposed by the deliberately unauthenticated testnet bridge. */
export type WalletRemoteOperation = typeof WalletRemoteOperation.Type

/** A sanitized failure returned by the testnet bridge. */
export class WalletRemoteError extends S.TaggedErrorClass<WalletRemoteError>()(
  'WalletRemoteError',
  {
    operation: WalletRemoteOperation,
    code: S.Literals([
      'Unavailable',
      'Rejected',
      'InvalidResponse',
      'Denied',
      'UnsupportedAccount',
      'InvalidPayload',
      'VerificationFailed',
      'UnsupportedCapability',
    ]),
  },
) {}

/** An opaque reference to server-owned transaction payload material. */
export const TransactionPayloadHandle = S.Struct({
  operationId: S.String,
  accountId: S.String,
  networkId: NetworkId,
})
/** An opaque reference to server-owned transaction payload material. */
export type TransactionPayloadHandle = typeof TransactionPayloadHandle.Type

/** An opaque reference to server-owned signed transaction material. */
export const SignedTransactionHandle = S.Struct({
  operationId: S.String,
  accountId: S.String,
  networkId: NetworkId,
})
/** An opaque reference to server-owned signed transaction material. */
export type SignedTransactionHandle = typeof SignedTransactionHandle.Type

/** Loads the public portfolio exposed by the testnet bridge. */
export const loadPortfolioRpc = Rpc.make('WalletLoadPortfolio', {
  payload: S.Struct({ wallets: S.Array(WalletProfile) }),
  success: PortfolioSnapshot,
  error: WalletRemoteError,
})

/** Requests non-production funds from one supported server adapter. */
export const requestTestFundingRpc = Rpc.make('WalletRequestTestFunding', {
  payload: S.Struct({ request: TestFundingRequest }),
  success: TestFundingReceipt,
  error: WalletRemoteError,
})

/** Validates one generic transfer through its selected server adapter. */
export const validateTransferRpc = Rpc.make('WalletValidateTransfer', {
  payload: S.Struct({ request: TransferRequest }),
  success: TransferValidation,
  error: WalletRemoteError,
})

/** Previews one adapter-validated transfer. */
export const previewTransferRpc = Rpc.make('WalletPreviewTransfer', {
  payload: S.Struct({ transfer: ValidatedTransfer }),
  success: TransactionQuote,
  error: WalletRemoteError,
})

/** Builds server-owned transaction material and returns an opaque handle. */
export const buildTransferPayloadRpc = Rpc.make('WalletBuildTransferPayload', {
  payload: S.Struct({ preview: TransactionPreview }),
  success: TransactionPayloadHandle,
  error: WalletRemoteError,
})

/** Signs server-owned transaction material behind the custody boundary. */
export const signTransactionRpc = Rpc.make('WalletSignTransaction', {
  payload: S.Struct({ transaction: TransactionPayloadHandle }),
  success: SignedTransactionHandle,
  error: WalletRemoteError,
})

/** Submits signed transaction material behind the custody boundary. */
export const submitTransactionRpc = Rpc.make('WalletSubmitTransaction', {
  payload: S.Struct({ signed: SignedTransactionHandle }),
  success: TransactionSubmission,
  error: WalletRemoteError,
})

/** Loads one finite page of normalized public transaction history. */
export const loadTransactionHistoryRpc = Rpc.make(
  'WalletLoadTransactionHistory',
  {
    payload: S.Struct({ query: TransactionHistoryQuery }),
    success: TransactionHistoryPage,
    error: WalletRemoteError,
  },
)

/** Signs one public challenge with the configured test wallet. */
export const signChallengeRpc = Rpc.make('WalletSignChallenge', {
  payload: S.Struct({ challenge: SigningChallenge }),
  success: SignatureProof,
  error: WalletRemoteError,
})

/** Verifies one public challenge proof with the configured test wallet. */
export const verifySignatureProofRpc = Rpc.make('WalletVerifySignatureProof', {
  payload: S.Struct({
    challenge: SigningChallenge,
    proof: SignatureProof,
  }),
  success: S.Boolean,
  error: WalletRemoteError,
})

/** Streams transactions observed for the requested public account identifiers. */
export const observeTransactionsRpc = Rpc.make('WalletObserveTransactions', {
  payload: S.Struct({ accountIds: S.Array(S.String) }),
  success: TransactionRecord,
  error: WalletRemoteError,
  stream: true,
})

/** The typed public protocol implemented by the testnet bridge. */
export const WalletRpcs = RpcGroup.make(
  loadPortfolioRpc,
  requestTestFundingRpc,
  validateTransferRpc,
  previewTransferRpc,
  buildTransferPayloadRpc,
  signTransactionRpc,
  submitTransactionRpc,
  loadTransactionHistoryRpc,
  signChallengeRpc,
  verifySignatureProofRpc,
  observeTransactionsRpc,
)
/** The typed public protocol implemented by the testnet bridge. */
export type WalletRpcs = typeof WalletRpcs
