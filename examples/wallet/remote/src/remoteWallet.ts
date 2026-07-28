import { Context, Effect, Layer, Match as M, Redacted, Stream } from 'effect'
import { FetchHttpClient } from 'effect/unstable/http'
import {
  RpcClient,
  RpcClientError,
  RpcSerialization,
} from 'effect/unstable/rpc'
import {
  WalletClient,
  WalletClientError,
  WalletClipboard,
  WalletClipboardUnavailable,
  WalletCrypto,
  WalletCryptoError,
  type WalletResources,
  WalletSigner,
  WalletSignerError,
  WalletVault,
  makeSignedTransaction,
  makeTransactionPayload,
} from 'wallet-core-example'
import { LocalWalletVault } from 'wallet-local-vault-example'

import {
  SignedTransactionHandle,
  TransactionPayloadHandle,
  type WalletRemoteError,
  WalletRpcs,
} from './walletRpc.js'

type RemoteCallError = WalletRemoteError | RpcClientError.RpcClientError

const toClientError = (error: RemoteCallError): WalletClientError =>
  M.value(error._tag === 'WalletRemoteError' ? error.code : 'Unavailable').pipe(
    M.withReturnType<WalletClientError>(),
    M.whenOr(
      'Rejected',
      'InvalidResponse',
      code => new WalletClientError({ code }),
    ),
    M.orElse(() => new WalletClientError({ code: 'Unavailable' })),
  )

const toSignerError = (error: RemoteCallError): WalletSignerError =>
  M.value(error._tag === 'WalletRemoteError' ? error.code : 'Unavailable').pipe(
    M.withReturnType<WalletSignerError>(),
    M.whenOr(
      'Denied',
      'UnsupportedAccount',
      code => new WalletSignerError({ code }),
    ),
    M.orElse(() => new WalletSignerError({ code: 'Unavailable' })),
  )

const toCryptoError = (error: RemoteCallError): WalletCryptoError =>
  M.value(error._tag === 'WalletRemoteError' ? error.code : 'Unavailable').pipe(
    M.withReturnType<WalletCryptoError>(),
    M.whenOr(
      'InvalidPayload',
      'VerificationFailed',
      code => new WalletCryptoError({ code }),
    ),
    M.orElse(() => new WalletCryptoError({ code: 'Unavailable' })),
  )

/** Builds Fetch-backed Wallet resources over the typed remote protocol. */
export const makeRemoteWalletResources = (
  endpoint: string,
  options: Readonly<{
    walletClipboard?: Layer.Layer<WalletClipboard>
    walletVault?: Layer.Layer<WalletVault>
  }> = {},
): Layer.Layer<WalletResources> => {
  const walletClipboard = options.walletClipboard ?? WalletClipboardUnavailable
  const walletVault = options.walletVault ?? LocalWalletVault
  const ProtocolLive = RpcClient.layerProtocolHttp({ url: endpoint }).pipe(
    Layer.provide([FetchHttpClient.layer, RpcSerialization.layerNdjson]),
  )

  const RemoteWalletResources = Layer.effectContext(
    Effect.gen(function* () {
      const remote = yield* RpcClient.make(WalletRpcs)
      const client = WalletClient.of({
        loadPortfolio: remote
          .WalletLoadPortfolio({})
          .pipe(Effect.mapError(toClientError)),
        validateTransfer: request =>
          remote
            .WalletValidateTransfer({ request })
            .pipe(Effect.mapError(toClientError)),
        previewTransfer: transfer =>
          remote
            .WalletPreviewTransfer({ transfer })
            .pipe(Effect.mapError(toClientError)),
        buildTransferPayload: preview =>
          remote.WalletBuildTransferPayload({ preview }).pipe(
            Effect.map(handle =>
              makeTransactionPayload(
                handle.accountId,
                handle.networkId,
                handle.operationId,
              ),
            ),
            Effect.mapError(toClientError),
          ),
        submitTransaction: signed =>
          remote
            .WalletSubmitTransaction({
              signed: SignedTransactionHandle.make({
                operationId: Redacted.value(signed.payload),
                accountId: signed.accountId,
                networkId: signed.networkId,
              }),
            })
            .pipe(Effect.mapError(toClientError)),
        loadTransactionHistory: query =>
          remote
            .WalletLoadTransactionHistory({ query })
            .pipe(Effect.mapError(toClientError)),
        observeTransactions: accountIds =>
          remote
            .WalletObserveTransactions({ accountIds })
            .pipe(Stream.mapError(toClientError)),
      })

      const signer = WalletSigner.of({
        signTransaction: transaction =>
          remote
            .WalletSignTransaction({
              transaction: TransactionPayloadHandle.make({
                operationId: Redacted.value(transaction.payload),
                accountId: transaction.accountId,
                networkId: transaction.networkId,
              }),
            })
            .pipe(
              Effect.map(handle =>
                makeSignedTransaction(
                  handle.accountId,
                  handle.networkId,
                  handle.operationId,
                ),
              ),
              Effect.mapError(toSignerError),
            ),
        signChallenge: challenge =>
          remote
            .WalletSignChallenge({ challenge })
            .pipe(Effect.mapError(toSignerError)),
      })

      const crypto = WalletCrypto.of({
        verifySignatureProof: (challenge, proof) =>
          remote
            .WalletVerifySignatureProof({ challenge, proof })
            .pipe(Effect.mapError(toCryptoError)),
      })

      return Context.make(WalletClient, client).pipe(
        Context.add(WalletSigner, signer),
        Context.add(WalletCrypto, crypto),
      )
    }),
  ).pipe(Layer.provide(ProtocolLive))

  return Layer.merge(
    Layer.merge(RemoteWalletResources, walletVault),
    walletClipboard,
  )
}
