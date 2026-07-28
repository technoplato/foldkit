import { Array, Effect, Layer, Match as M, Option, Stream } from 'effect'
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
  type TransferDraft,
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
  operation: 'PreviewTransaction' | 'PrepareTransaction',
) => new WalletRemoteError({ operation, code: 'Rejected' })

const isEthereumSepoliaEth = (draft: TransferDraft): boolean =>
  M.value(draft.value.currency).pipe(
    M.withReturnType<boolean>(),
    M.tagsExhaustive({
      Eth: ({ network }) => network._tag === 'EthereumSepolia',
      Sol: () => false,
      Usdc: () => false,
    }),
  )

const authorizeDemoTransfer = (
  client: WalletClientService,
  draft: TransferDraft,
  operation: 'PreviewTransaction' | 'PrepareTransaction',
) =>
  Effect.gen(function* () {
    if (!isEthereumSepoliaEth(draft)) {
      return yield* Effect.fail(rejectedDemoTransfer(operation))
    }
    const atomicUnits = yield* Effect.try({
      try: () => BigInt(draft.value.atomicUnits),
      catch: () => rejectedDemoTransfer(operation),
    })
    if (atomicUnits <= 0n || atomicUnits > maximumDemoTransferAtomicUnits) {
      return yield* Effect.fail(rejectedDemoTransfer(operation))
    }
    const portfolio = yield* client.loadPortfolio.pipe(
      Effect.mapError(error => clientError('LoadPortfolio', error)),
    )
    const maybeAccount = Array.findFirst(
      portfolio.accounts,
      account => account.accountId === draft.accountId,
    )
    if (
      Option.isNone(maybeAccount) ||
      maybeAccount.value.network._tag !== 'EthereumSepolia' ||
      !isValidDemoRecipientAddress(draft.destinationAddress)
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
      WalletPreviewTransaction: ({ draft }) =>
        authorizeDemoTransfer(client, draft, 'PreviewTransaction').pipe(
          Effect.flatMap(() => client.previewTransaction(draft)),
          Effect.mapError(error =>
            error._tag === 'WalletRemoteError'
              ? error
              : clientError('PreviewTransaction', error),
          ),
        ),
      WalletPrepareTransaction: ({ preview }) =>
        authorizeDemoTransfer(client, preview.draft, 'PrepareTransaction').pipe(
          Effect.flatMap(() => client.prepareTransaction(preview)),
          Effect.mapError(error =>
            error._tag === 'WalletRemoteError'
              ? error
              : clientError('PrepareTransaction', error),
          ),
          Effect.flatMap(operations.putPrepared),
        ),
      WalletDigestTransaction: ({ prepared }) =>
        operations.getPrepared(prepared).pipe(
          Effect.flatMap(transaction =>
            crypto
              .digestTransaction(transaction)
              .pipe(
                Effect.mapError(error =>
                  cryptoError('DigestTransaction', error),
                ),
              ),
          ),
          Effect.flatMap(digest => operations.putDigest(prepared, digest)),
        ),
      WalletSignTransaction: ({ prepared, digest }) =>
        Effect.all({
          transaction: operations.getPrepared(prepared),
          signingDigest: operations.getDigest(prepared, digest),
        }).pipe(
          Effect.flatMap(({ transaction, signingDigest }) =>
            signer
              .signTransaction(transaction, signingDigest)
              .pipe(
                Effect.mapError(error => signerError('SignTransaction', error)),
              ),
          ),
          Effect.flatMap(signed => operations.putSigned(prepared, signed)),
        ),
      WalletSubmitTransaction: ({ signed }) =>
        operations
          .getSigned(signed)
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
      WalletObserveTransactions: ({ accounts }) =>
        client
          .observeTransactions(accounts)
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
