import {
  Array as Array_,
  Context,
  Effect,
  Layer,
  Option,
  Schema as S,
  Stream,
} from 'effect'
import {
  BalanceSnapshot,
  PortfolioSnapshot,
  TransactionHistoryPage,
  type TransactionHistoryQuery,
  type TransactionPayload,
  type TransactionPreview,
  type TransferRequest,
  type ValidatedTransfer,
  WalletClient,
  WalletClientError,
  WalletCrypto,
  WalletCryptoError,
  type WalletResources,
  WalletSigner,
  WalletSignerError,
} from 'wallet-core-example'

import {
  type ChainCustodyService,
  type ChainTransportService,
  EthereumSepoliaCustody,
  EthereumSepoliaTransport,
  SolanaDevnetCustody,
  SolanaDevnetTransport,
} from './chainTransport.js'

const HistoryCursorEntry = S.Struct({
  networkId: S.String,
  cursor: S.String,
})
const CompositeHistoryCursor = S.Array(HistoryCursorEntry)
const CompositeHistoryCursorJson = S.fromJsonString(CompositeHistoryCursor)

const unsupportedClient = () => new WalletClientError({ code: 'Rejected' })

const transportForRequest = (
  request: TransferRequest,
  transports: ReadonlyArray<ChainTransportService>,
): Effect.Effect<ChainTransportService, WalletClientError> => {
  const maybeTransport = Array_.findFirst(
    transports,
    transport =>
      transport.account.accountId === request.accountId &&
      Array_.some(transport.assets, asset => asset.assetId === request.assetId),
  )
  if (Option.isSome(maybeTransport)) {
    return Effect.succeed(maybeTransport.value)
  } else {
    return Effect.fail(unsupportedClient())
  }
}

const transportForPreview = (
  preview: TransactionPreview,
  transports: ReadonlyArray<ChainTransportService>,
) => transportForRequest(preview.transfer.request, transports)

const transportForPayload = (
  payload: TransactionPayload,
  transports: ReadonlyArray<ChainTransportService>,
): Effect.Effect<ChainTransportService, WalletClientError> => {
  const maybeTransport = Array_.findFirst(
    transports,
    transport =>
      transport.account.accountId === payload.accountId &&
      transport.network.networkId === payload.networkId,
  )
  if (Option.isSome(maybeTransport)) {
    return Effect.succeed(maybeTransport.value)
  } else {
    return Effect.fail(unsupportedClient())
  }
}

const custodyForPayload = (
  payload: TransactionPayload,
  custodyAdapters: ReadonlyArray<ChainCustodyService>,
): Effect.Effect<ChainCustodyService, WalletSignerError> => {
  const maybeCustody = Array_.findFirst(
    custodyAdapters,
    custody =>
      custody.accountId === payload.accountId &&
      custody.networkId === payload.networkId,
  )
  if (Option.isSome(maybeCustody)) {
    return Effect.succeed(maybeCustody.value)
  } else {
    return Effect.fail(new WalletSignerError({ code: 'UnsupportedAccount' }))
  }
}

const observationStream = (
  accountIds: ReadonlyArray<string>,
  transports: ReadonlyArray<ChainTransportService>,
) =>
  Stream.mergeAll(
    Array_.map(transports, transport =>
      Array_.contains(accountIds, transport.account.accountId)
        ? transport.observeTransactions
        : Stream.empty,
    ),
    { concurrency: 'unbounded' },
  )

const decodeHistoryCursors = (query: TransactionHistoryQuery) => {
  if (Option.isNone(query.maybeCursor)) {
    return []
  }
  return S.decodeUnknownSync(CompositeHistoryCursorJson)(
    query.maybeCursor.value,
  )
}

const makeWalletNetworkServices = Effect.gen(function* () {
  const ethereum = yield* EthereumSepoliaTransport
  const solana = yield* SolanaDevnetTransport
  const transports = [ethereum, solana]

  const client = WalletClient.of({
    loadPortfolio: Effect.all(
      Array_.map(transports, transport => transport.loadPortfolio),
      { concurrency: 'unbounded' },
    ).pipe(
      Effect.map(portfolios =>
        PortfolioSnapshot.make({
          chains: Array_.map(portfolios, portfolio => portfolio.chain),
          networks: Array_.map(portfolios, portfolio => portfolio.network),
          assets: Array_.flatMap(portfolios, portfolio => portfolio.assets),
          accounts: Array_.map(portfolios, portfolio => portfolio.account),
          balanceSnapshot: BalanceSnapshot.make({
            observedAt: Array_.reduce(portfolios, 0, (latest, portfolio) =>
              Math.max(latest, portfolio.observedAt),
            ),
            balances: Array_.flatMap(
              portfolios,
              portfolio => portfolio.balances,
            ),
          }),
          receivingInstructions: Array_.flatMap(
            portfolios,
            portfolio => portfolio.receivingInstructions,
          ),
        }),
      ),
    ),
    validateTransfer: request =>
      transportForRequest(request, transports).pipe(
        Effect.flatMap(transport => transport.validateTransfer(request)),
      ),
    previewTransfer: (transfer: ValidatedTransfer) =>
      transportForRequest(transfer.request, transports).pipe(
        Effect.flatMap(transport => transport.previewTransfer(transfer)),
      ),
    buildTransferPayload: preview =>
      transportForPreview(preview, transports).pipe(
        Effect.flatMap(transport => transport.buildTransferPayload(preview)),
      ),
    submitTransaction: signed =>
      transportForPayload(signed, transports).pipe(
        Effect.flatMap(transport => transport.submitTransaction(signed)),
      ),
    loadTransactionHistory: query =>
      Effect.try({
        try: () => decodeHistoryCursors(query),
        catch: () => new WalletClientError({ code: 'InvalidResponse' }),
      }).pipe(
        Effect.flatMap(cursors => {
          const selectedTransports = Array_.filter(
            transports,
            transport =>
              Array_.contains(query.accountIds, transport.account.accountId) &&
              Array_.contains(
                transport.network.capabilities,
                'TransactionHistory',
              ),
          )
          return Effect.all(
            Array_.map(selectedTransports, transport => {
              const maybeCursor = Array_.findFirst(
                cursors,
                cursor => cursor.networkId === transport.network.networkId,
              ).pipe(Option.map(cursor => cursor.cursor))
              return transport.loadTransactionHistory({
                ...query,
                accountIds: [transport.account.accountId],
                maybeCursor,
              })
            }),
            { concurrency: 'unbounded' },
          ).pipe(
            Effect.map(pages => {
              const nextCursors = Array_.getSomes(
                Array_.map(pages, (page, index) =>
                  Option.flatMap(
                    Array_.get(selectedTransports, index),
                    transport =>
                      Option.map(page.maybeNextCursor, cursor =>
                        HistoryCursorEntry.make({
                          networkId: transport.network.networkId,
                          cursor,
                        }),
                      ),
                  ),
                ),
              )
              return TransactionHistoryPage.make({
                records: Array_.flatMap(pages, page => page.records),
                maybeNextCursor: Array_.match(nextCursors, {
                  onEmpty: () => Option.none(),
                  onNonEmpty: cursors =>
                    Option.some(
                      S.encodeSync(CompositeHistoryCursorJson)(cursors),
                    ),
                }),
              })
            }),
          )
        }),
      ),
    observeTransactions: accountIds =>
      observationStream(accountIds, transports),
  })

  const crypto = WalletCrypto.of({
    verifySignatureProof: (challenge, proof) => {
      const maybeTransport = Array_.findFirst(
        transports,
        transport => transport.account.accountId === challenge.accountId,
      )
      if (Option.isSome(maybeTransport)) {
        return maybeTransport.value.verifySignatureProof(challenge, proof)
      } else {
        return Effect.fail(new WalletCryptoError({ code: 'InvalidPayload' }))
      }
    },
  })

  return Context.make(WalletClient, client).pipe(
    Context.add(WalletCrypto, crypto),
  )
})

const makeWalletSigner = Effect.gen(function* () {
  const ethereum = yield* EthereumSepoliaCustody
  const solana = yield* SolanaDevnetCustody
  const custodyAdapters = [ethereum, solana]

  return WalletSigner.of({
    signTransaction: payload =>
      custodyForPayload(payload, custodyAdapters).pipe(
        Effect.flatMap(custody => custody.signTransaction(payload)),
      ),
    signChallenge: challenge => {
      const maybeCustody = Array_.findFirst(
        custodyAdapters,
        custody => custody.accountId === challenge.accountId,
      )
      if (Option.isSome(maybeCustody)) {
        return maybeCustody.value.signChallenge(challenge)
      } else {
        return Effect.fail(
          new WalletSignerError({ code: 'UnsupportedAccount' }),
        )
      }
    },
  })
})

/** WalletClient and WalletCrypto backed by injected Sepolia and Devnet transports. */
export const WalletNetworkServicesLive: Layer.Layer<
  WalletClient | WalletCrypto,
  never,
  EthereumSepoliaTransport | SolanaDevnetTransport
> = Layer.effectContext(makeWalletNetworkServices)

/** WalletSigner backed by injected Sepolia and Devnet custody. */
export const WalletSignerLive: Layer.Layer<
  WalletSigner,
  never,
  EthereumSepoliaCustody | SolanaDevnetCustody
> = Layer.effect(WalletSigner, makeWalletSigner)

/** Complete wallet-core services backed by injected test-network adapters. */
export const WalletServicesLive: Layer.Layer<
  WalletResources,
  never,
  | EthereumSepoliaTransport
  | SolanaDevnetTransport
  | EthereumSepoliaCustody
  | SolanaDevnetCustody
> = Layer.merge(WalletNetworkServicesLive, WalletSignerLive)
