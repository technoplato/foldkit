import { Schema as S } from 'effect'
import { Rpc, RpcGroup } from 'effect/unstable/rpc'
import {
  Network,
  PortfolioSnapshot,
  SignatureProof,
  SigningChallenge,
  TransactionPreview,
  TransactionQuote,
  TransactionRecord,
  TransactionSubmission,
  TransferDraft,
  WalletAccount,
} from 'wallet-core-example'

/** Operations exposed by the deliberately unauthenticated testnet bridge. */
export const WalletRemoteOperation = S.Literals([
  'LoadPortfolio',
  'PreviewTransaction',
  'PrepareTransaction',
  'DigestTransaction',
  'SignTransaction',
  'SubmitTransaction',
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
    ]),
  },
) {}

/** An opaque reference to server-owned prepared transaction material. */
export const PreparedTransactionHandle = S.Struct({
  operationId: S.String,
  accountId: S.String,
  network: Network,
})
/** An opaque reference to server-owned prepared transaction material. */
export type PreparedTransactionHandle = typeof PreparedTransactionHandle.Type

/** An opaque reference to a server-owned transaction digest. */
export const SigningDigestHandle = S.Struct({ operationId: S.String })
/** An opaque reference to a server-owned transaction digest. */
export type SigningDigestHandle = typeof SigningDigestHandle.Type

/** An opaque reference to server-owned signed transaction material. */
export const SignedTransactionHandle = S.Struct({
  operationId: S.String,
  accountId: S.String,
  network: Network,
})
/** An opaque reference to server-owned signed transaction material. */
export type SignedTransactionHandle = typeof SignedTransactionHandle.Type

/** Loads the public portfolio exposed by the testnet bridge. */
export const loadPortfolioRpc = Rpc.make('WalletLoadPortfolio', {
  payload: S.Struct({}),
  success: PortfolioSnapshot,
  error: WalletRemoteError,
})

/** Previews a testnet transaction without signing or submitting it. */
export const previewTransactionRpc = Rpc.make('WalletPreviewTransaction', {
  payload: S.Struct({ draft: TransferDraft }),
  success: TransactionQuote,
  error: WalletRemoteError,
})

/** Prepares server-owned transaction material and returns an opaque handle. */
export const prepareTransactionRpc = Rpc.make('WalletPrepareTransaction', {
  payload: S.Struct({ preview: TransactionPreview }),
  success: PreparedTransactionHandle,
  error: WalletRemoteError,
})

/** Digests prepared transaction material behind the custody boundary. */
export const digestTransactionRpc = Rpc.make('WalletDigestTransaction', {
  payload: S.Struct({ prepared: PreparedTransactionHandle }),
  success: SigningDigestHandle,
  error: WalletRemoteError,
})

/** Signs prepared transaction material behind the custody boundary. */
export const signTransactionRpc = Rpc.make('WalletSignTransaction', {
  payload: S.Struct({
    prepared: PreparedTransactionHandle,
    digest: SigningDigestHandle,
  }),
  success: SignedTransactionHandle,
  error: WalletRemoteError,
})

/** Submits signed transaction material behind the custody boundary. */
export const submitTransactionRpc = Rpc.make('WalletSubmitTransaction', {
  payload: S.Struct({ signed: SignedTransactionHandle }),
  success: TransactionSubmission,
  error: WalletRemoteError,
})

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

/** Streams transactions observed for the requested public accounts. */
export const observeTransactionsRpc = Rpc.make('WalletObserveTransactions', {
  payload: S.Struct({ accounts: S.Array(WalletAccount) }),
  success: TransactionRecord,
  error: WalletRemoteError,
  stream: true,
})

/** The typed public protocol implemented by the testnet bridge. */
export const WalletRpcs = RpcGroup.make(
  loadPortfolioRpc,
  previewTransactionRpc,
  prepareTransactionRpc,
  digestTransactionRpc,
  signTransactionRpc,
  submitTransactionRpc,
  signChallengeRpc,
  verifySignatureProofRpc,
  observeTransactionsRpc,
)
/** The typed public protocol implemented by the testnet bridge. */
export type WalletRpcs = typeof WalletRpcs
