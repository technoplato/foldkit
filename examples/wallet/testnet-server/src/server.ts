import { Array, Effect, Layer, Option, Stream } from 'effect'
import {
  HttpMiddleware,
  HttpRouter,
  HttpServer,
  HttpServerResponse,
} from 'effect/unstable/http'
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc'
import { createServer } from 'node:http'
import { isAddress } from 'viem'
import {
  type TransferRequest,
  WalletClient,
  type WalletClientError,
  type WalletClientService,
  WalletCrypto,
  type WalletCryptoError,
  WalletSigner,
  type WalletSignerError,
} from 'wallet-core-example'
import {
  WalletRemoteError,
  type WalletRemoteOperation,
  WalletRpcs,
} from 'wallet-remote-example'

import { NodeHttpServer } from '@effect/platform-node'

import { LocalTestWalletLive } from './localTestWallet.js'
import {
  WalletOperationStore,
  WalletOperationStoreLive,
} from './operationStore.js'

const testnetServerPort = 5197
const maximumDemoTransferAtomicUnits = 10_000_000_000_000n
const demoNetworkId = 'ethereum:sepolia'
const demoAssetId = 'ethereum:sepolia:eth'

/** Checks whether the public testnet bridge can address one Sepolia recipient. */
export const isValidDemoRecipientAddress = (address: string): boolean =>
  isAddress(address)

const clientError = (
  operation: WalletRemoteOperation,
  error: WalletClientError,
) => new WalletRemoteError({ operation, code: error.code })

const signerError = (
  operation: WalletRemoteOperation,
  error: WalletSignerError,
) => new WalletRemoteError({ operation, code: error.code })

const cryptoError = (
  operation: WalletRemoteOperation,
  error: WalletCryptoError,
) => new WalletRemoteError({ operation, code: error.code })

const rejectedDemoTransfer = (
  operation: 'ValidateTransfer' | 'PreviewTransfer' | 'BuildTransferPayload',
) => new WalletRemoteError({ operation, code: 'Rejected' })

const authorizeDemoTransfer = (
  client: WalletClientService,
  request: TransferRequest,
  operation: 'ValidateTransfer' | 'PreviewTransfer' | 'BuildTransferPayload',
) =>
  Effect.gen(function* () {
    const atomicUnits = yield* Effect.try({
      try: () => BigInt(request.atomicUnits),
      catch: () => rejectedDemoTransfer(operation),
    })
    if (
      request.assetId !== demoAssetId ||
      atomicUnits <= 0n ||
      atomicUnits > maximumDemoTransferAtomicUnits ||
      !isValidDemoRecipientAddress(request.destinationAddress)
    ) {
      return yield* Effect.fail(rejectedDemoTransfer(operation))
    }
    const portfolio = yield* client.loadPortfolio.pipe(
      Effect.mapError(error => clientError('LoadPortfolio', error)),
    )
    const maybeAccount = Array.findFirst(
      portfolio.accounts,
      account => account.accountId === request.accountId,
    )
    if (
      Option.isNone(maybeAccount) ||
      maybeAccount.value.networkId !== demoNetworkId
    ) {
      return yield* Effect.fail(rejectedDemoTransfer(operation))
    }
  })

const WalletRpcLive = WalletRpcs.toLayer(
  Effect.gen(function* () {
    const client = yield* WalletClient
    const signer = yield* WalletSigner
    const crypto = yield* WalletCrypto
    const operations = yield* WalletOperationStore

    return {
      WalletLoadPortfolio: () =>
        client.loadPortfolio.pipe(
          Effect.mapError(error => clientError('LoadPortfolio', error)),
        ),
      WalletValidateTransfer: ({ request }) =>
        authorizeDemoTransfer(client, request, 'ValidateTransfer').pipe(
          Effect.flatMap(() => client.validateTransfer(request)),
          Effect.mapError(error =>
            error._tag === 'WalletRemoteError'
              ? error
              : clientError('ValidateTransfer', error),
          ),
        ),
      WalletPreviewTransfer: ({ transfer }) =>
        authorizeDemoTransfer(client, transfer.request, 'PreviewTransfer').pipe(
          Effect.flatMap(() => client.previewTransfer(transfer)),
          Effect.mapError(error =>
            error._tag === 'WalletRemoteError'
              ? error
              : clientError('PreviewTransfer', error),
          ),
        ),
      WalletBuildTransferPayload: ({ preview }) =>
        authorizeDemoTransfer(
          client,
          preview.transfer.request,
          'BuildTransferPayload',
        ).pipe(
          Effect.flatMap(() => client.buildTransferPayload(preview)),
          Effect.mapError(error =>
            error._tag === 'WalletRemoteError'
              ? error
              : clientError('BuildTransferPayload', error),
          ),
          Effect.flatMap(operations.putTransaction),
        ),
      WalletSignTransaction: ({ transaction }) =>
        operations.getTransaction(transaction).pipe(
          Effect.flatMap(payload =>
            signer
              .signTransaction(payload)
              .pipe(
                Effect.mapError(error => signerError('SignTransaction', error)),
              ),
          ),
          Effect.flatMap(operations.putSignedTransaction),
        ),
      WalletSubmitTransaction: ({ signed }) =>
        operations
          .getSignedTransaction(signed)
          .pipe(
            Effect.flatMap(transaction =>
              client
                .submitTransaction(transaction)
                .pipe(
                  Effect.mapError(error =>
                    clientError('SubmitTransaction', error),
                  ),
                ),
            ),
          ),
      WalletLoadTransactionHistory: ({ query }) =>
        client
          .loadTransactionHistory(query)
          .pipe(
            Effect.mapError(error =>
              clientError('LoadTransactionHistory', error),
            ),
          ),
      WalletSignChallenge: ({ challenge }) =>
        signer
          .signChallenge(challenge)
          .pipe(Effect.mapError(error => signerError('SignChallenge', error))),
      WalletVerifySignatureProof: ({ challenge, proof }) =>
        crypto
          .verifySignatureProof(challenge, proof)
          .pipe(
            Effect.mapError(error =>
              cryptoError('VerifySignatureProof', error),
            ),
          ),
      WalletObserveTransactions: ({ accountIds }) =>
        client
          .observeTransactions(accountIds)
          .pipe(
            Stream.mapError(error => clientError('ObserveTransactions', error)),
          ),
    }
  }),
)

const WalletRpcAppLive = RpcServer.layerHttp({
  group: WalletRpcs,
  path: '/rpc',
  protocol: 'http',
}).pipe(
  Layer.provide(WalletRpcLive),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(WalletOperationStoreLive),
  Layer.provide(LocalTestWalletLive),
)

const HealthLive = HttpRouter.add(
  'GET',
  '/health',
  HttpServerResponse.json({
    service: 'Foldkit Sepolia test wallet',
    authentication: 'None',
    network: 'Ethereum Sepolia',
  }),
)

const HttpAppLive = Layer.unwrap(
  HttpRouter.toHttpEffect(Layer.merge(WalletRpcAppLive, HealthLive)).pipe(
    Effect.map(HttpServer.serve(HttpMiddleware.cors())),
  ),
)

/** The deliberately unauthenticated local Sepolia test-wallet server. */
export const WalletTestnetServerLive = HttpAppLive.pipe(
  HttpServer.withLogAddress,
  Layer.provide(
    NodeHttpServer.layer(createServer, { port: testnetServerPort }),
  ),
)
