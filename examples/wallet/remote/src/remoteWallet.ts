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
  WalletCrypto,
  WalletCryptoError,
  type WalletResources,
  WalletSigner,
  WalletSignerError,
  makePreparedTransaction,
  makeSignedTransaction,
  makeSigningDigest,
} from 'wallet-core-example'

import {
  PreparedTransactionHandle,
  SignedTransactionHandle,
  SigningDigestHandle,
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
): Layer.Layer<WalletResources> => {
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
        previewTransaction: draft =>
          remote
            .WalletPreviewTransaction({ draft })
            .pipe(Effect.mapError(toClientError)),
        prepareTransaction: preview =>
          remote.WalletPrepareTransaction({ preview }).pipe(
            Effect.map(handle =>
              makePreparedTransaction(
                handle.accountId,
                handle.network,
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
                network: signed.network,
              }),
            })
            .pipe(Effect.mapError(toClientError)),
        observeTransactions: accounts =>
          remote
            .WalletObserveTransactions({ accounts })
            .pipe(Stream.mapError(toClientError)),
      })

      const signer = WalletSigner.of({
        signTransaction: (prepared, digest) =>
          remote
            .WalletSignTransaction({
              prepared: PreparedTransactionHandle.make({
                operationId: Redacted.value(prepared.payload),
                accountId: prepared.accountId,
                network: prepared.network,
              }),
              digest: SigningDigestHandle.make({
                operationId: Redacted.value(digest),
              }),
            })
            .pipe(
              Effect.map(handle =>
                makeSignedTransaction(
                  handle.accountId,
                  handle.network,
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
        digestTransaction: prepared =>
          remote
            .WalletDigestTransaction({
              prepared: PreparedTransactionHandle.make({
                operationId: Redacted.value(prepared.payload),
                accountId: prepared.accountId,
                network: prepared.network,
              }),
            })
            .pipe(
              Effect.map(handle => makeSigningDigest(handle.operationId)),
              Effect.mapError(toCryptoError),
            ),
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

  return RemoteWalletResources
}
