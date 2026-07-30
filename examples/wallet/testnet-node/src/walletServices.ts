import { Array as Array_, Context, Effect, Layer, Option, Stream } from 'effect'
import {
  BalanceSnapshot,
  PortfolioSnapshot,
  type TestFundingRequest,
  type TransactionHistoryQuery,
  type TransactionPayload,
  type TransactionPreview,
  type TransactionRecord,
  type TransferRequest,
  type ValidatedTransfer,
  WalletClient,
  WalletClientError,
  WalletCrypto,
  WalletCryptoError,
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

const unsupportedClient = () =>
  new WalletClientError({ code: 'UnsupportedCapability' })

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

const transportForAccountNetwork = (
  accountId: string,
  networkId: string,
  transports: ReadonlyArray<ChainTransportService>,
): Effect.Effect<ChainTransportService, WalletClientError> => {
  const maybeTransport = Array_.findFirst(
    transports,
    transport =>
      transport.account.accountId === accountId &&
      transport.network.networkId === networkId,
  )
  if (Option.isSome(maybeTransport)) {
    return Effect.succeed(maybeTransport.value)
  } else {
    return Effect.fail(unsupportedClient())
  }
}

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
): Stream.Stream<TransactionRecord, WalletClientError> => {
  const selectedTransports = Array_.filter(transports, transport =>
    Array_.contains(accountIds, transport.account.accountId),
  )
  const hasUnknownAccount = Array_.some(
    accountIds,
    accountId =>
      !Array_.some(
        transports,
        transport => transport.account.accountId === accountId,
      ),
  )
  if (hasUnknownAccount) {
    return Stream.fail(unsupportedClient())
  }
  if (
    Array_.some(
      selectedTransports,
      transport =>
        !Array_.contains(
          transport.network.capabilities,
          'TransactionObservation',
        ),
    )
  ) {
    return Stream.fail(unsupportedClient())
  }
  return Stream.mergeAll(
    Array_.map(selectedTransports, transport => transport.observeTransactions),
    { concurrency: 'unbounded' },
  )
}

const makeWalletNetworkServices = Effect.gen(function* () {
  const ethereum = yield* EthereumSepoliaTransport
  const solana = yield* SolanaDevnetTransport
  const transports = [ethereum, solana]

  const client = WalletClient.of({
    loadPortfolio: wallets => {
      const profileAccounts = Array_.flatMap(wallets, wallet => wallet.accounts)
      const hasUnsupportedProfile = Array_.some(
        profileAccounts,
        profileAccount =>
          !Array_.some(
            transports,
            transport =>
              transport.account.accountId === profileAccount.accountId &&
              transport.account.chainId === profileAccount.chainId &&
              transport.account.networkId === profileAccount.networkId &&
              transport.account.address === profileAccount.address,
          ),
      )
      if (hasUnsupportedProfile) {
        return Effect.fail(unsupportedClient())
      }
      return Effect.all(
        Array_.map(transports, transport => transport.loadPortfolio),
        { concurrency: 'unbounded' },
      ).pipe(
        Effect.map(portfolios =>
          PortfolioSnapshot.make({
            dataSource: 'Testnet',
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
      )
    },
    requestTestFunding: (request: TestFundingRequest) =>
      transportForAccountNetwork(
        request.accountId,
        request.networkId,
        transports,
      ).pipe(
        Effect.flatMap(transport => {
          if (Array_.contains(transport.network.capabilities, 'TestFunding')) {
            return transport.requestTestFunding(request)
          } else {
            return Effect.fail(unsupportedClient())
          }
        }),
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
    loadTransactionHistory: (query: TransactionHistoryQuery) =>
      transportForAccountNetwork(
        query.accountId,
        query.networkId,
        transports,
      ).pipe(
        Effect.flatMap(transport => {
          if (
            Array_.contains(
              transport.network.capabilities,
              'TransactionHistory',
            )
          ) {
            return transport.loadTransactionHistory(query)
          } else {
            return Effect.fail(unsupportedClient())
          }
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
  WalletClient | WalletCrypto | WalletSigner,
  never,
  | EthereumSepoliaTransport
  | SolanaDevnetTransport
  | EthereumSepoliaCustody
  | SolanaDevnetCustody
> = Layer.merge(WalletNetworkServicesLive, WalletSignerLive)
