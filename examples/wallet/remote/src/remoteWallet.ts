import { Context, Effect, Layer, Redacted, Stream } from 'effect'
import { FetchHttpClient } from 'effect/unstable/http'
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc'
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
  WalletRpcs,
} from './walletRpc.js'

const clientUnavailable = () => new WalletClientError({ code: 'Unavailable' })
const signerUnavailable = () => new WalletSignerError({ code: 'Unavailable' })
const cryptoUnavailable = () => new WalletCryptoError({ code: 'Unavailable' })

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
          .pipe(Effect.mapError(clientUnavailable)),
        previewTransaction: draft =>
          remote
            .WalletPreviewTransaction({ draft })
            .pipe(Effect.mapError(clientUnavailable)),
        prepareTransaction: preview =>
          remote.WalletPrepareTransaction({ preview }).pipe(
            Effect.map(handle =>
              makePreparedTransaction(
                handle.accountId,
                handle.network,
                handle.operationId,
              ),
            ),
            Effect.mapError(clientUnavailable),
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
            .pipe(Effect.mapError(clientUnavailable)),
        observeTransactions: accounts =>
          remote
            .WalletObserveTransactions({ accounts })
            .pipe(Stream.mapError(clientUnavailable)),
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
              Effect.mapError(signerUnavailable),
            ),
        signChallenge: challenge =>
          remote
            .WalletSignChallenge({ challenge })
            .pipe(Effect.mapError(signerUnavailable)),
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
              Effect.mapError(cryptoUnavailable),
            ),
        verifySignatureProof: (challenge, proof) =>
          remote
            .WalletVerifySignatureProof({ challenge, proof })
            .pipe(Effect.mapError(cryptoUnavailable)),
      })

      return Context.make(WalletClient, client).pipe(
        Context.add(WalletSigner, signer),
        Context.add(WalletCrypto, crypto),
      )
    }),
  ).pipe(Layer.provide(ProtocolLive))

  return RemoteWalletResources
}
