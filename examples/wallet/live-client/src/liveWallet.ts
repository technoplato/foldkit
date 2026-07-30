import { Array, Effect, Layer, Match as M, Option, Ref, Stream } from 'effect'
import {
  BalanceSnapshot,
  PortfolioSnapshot,
  WalletAccount,
  WalletClient,
  WalletClientError,
  type WalletProfile,
} from 'wallet-core-example'

import { LiveNetworkAccount, type LiveNetworkAdapter } from './adapter.js'
import { makeBitcoinLiveAdapter } from './bitcoin.js'
import {
  type LiveWalletNetwork,
  liveWalletChains,
  liveWalletNetworks,
} from './catalog.js'
import { makeEthereumLiveAdapter } from './ethereum.js'
import { makeSolanaLiveAdapter } from './solana.js'
import { makeSuiLiveAdapter } from './sui.js'

type OperationalAccount = Readonly<{
  account: LiveNetworkAccount
  adapter: LiveNetworkAdapter
}>

const invalidResponse = () => new WalletClientError({ code: 'InvalidResponse' })
const unavailable = () => new WalletClientError({ code: 'Unavailable' })
const unsupported = () =>
  new WalletClientError({ code: 'UnsupportedCapability' })
const networkOperationTimeout = '30 seconds'
const maximumConcurrentBalanceLoads = 8

const withNetworkTimeout = <A>(
  operation: Effect.Effect<A, WalletClientError>,
): Effect.Effect<A, WalletClientError> =>
  operation.pipe(
    Effect.timeoutOption(networkOperationTimeout),
    Effect.flatMap(maybeResult =>
      Option.match(maybeResult, {
        onNone: () => Effect.fail(unavailable()),
        onSome: Effect.succeed,
      }),
    ),
  )

/** Builds the chain adapter selected by one exact live-network configuration. */
export const makeLiveNetworkAdapter = (
  configuration: LiveWalletNetwork,
): LiveNetworkAdapter =>
  M.value(configuration).pipe(
    M.tagsExhaustive({
      BitcoinLiveNetwork: makeBitcoinLiveAdapter,
      EthereumLiveNetwork: makeEthereumLiveAdapter,
      SolanaLiveNetwork: makeSolanaLiveAdapter,
      SuiLiveNetwork: makeSuiLiveAdapter,
    }),
  )

const operationalAccountsForProfiles = (
  wallets: ReadonlyArray<WalletProfile>,
  networks: ReadonlyArray<LiveWalletNetwork>,
): Effect.Effect<ReadonlyArray<OperationalAccount>, WalletClientError> => {
  const profileAccounts = Array.flatMap(wallets, wallet => wallet.accounts)
  const accountIds = new Set(
    Array.map(profileAccounts, account => account.accountId),
  )
  if (accountIds.size !== Array.length(profileAccounts)) {
    return Effect.fail(invalidResponse())
  }
  const operationalAccounts = Array.getSomes(
    Array.map(profileAccounts, profileAccount => {
      const maybeConfiguration = Array.findFirst(
        networks,
        configuration =>
          configuration.chain.chainId === profileAccount.chainId &&
          configuration.network.networkId === profileAccount.networkId,
      )
      if (Option.isNone(maybeConfiguration)) {
        return Option.none()
      }
      const account = WalletAccount.make({
        accountId: profileAccount.accountId,
        chainId: profileAccount.chainId,
        networkId: profileAccount.networkId,
        address: profileAccount.address,
        displayName: profileAccount.displayName,
      })
      const liveAccount = LiveNetworkAccount.make({
        profile: profileAccount,
        account,
        configuration: maybeConfiguration.value,
      })
      return Option.some({
        account: liveAccount,
        adapter: makeLiveNetworkAdapter(maybeConfiguration.value),
      })
    }),
  )
  if (Array.length(operationalAccounts) !== Array.length(profileAccounts)) {
    return Effect.fail(unsupported())
  }
  return Effect.succeed(operationalAccounts)
}

const accountForId = (
  accounts: ReadonlyArray<OperationalAccount>,
  accountId: string,
): Effect.Effect<OperationalAccount, WalletClientError> => {
  const maybeAccount = Array.findFirst(
    accounts,
    account => account.account.account.accountId === accountId,
  )
  return Option.match(maybeAccount, {
    onNone: () => Effect.fail(unsupported()),
    onSome: Effect.succeed,
  })
}

const makeLiveWalletClient = (networks: ReadonlyArray<LiveWalletNetwork>) =>
  Effect.gen(function* () {
    const currentAccounts = yield* Ref.make<ReadonlyArray<OperationalAccount>>(
      [],
    )
    return WalletClient.of({
      loadPortfolio: wallets =>
        operationalAccountsForProfiles(wallets, networks).pipe(
          Effect.tap(accounts => Ref.set(currentAccounts, accounts)),
          Effect.flatMap(accounts =>
            Effect.forEach(
              accounts,
              operational =>
                withNetworkTimeout(
                  operational.adapter.loadBalance(operational.account),
                ).pipe(
                  Effect.map(Option.some),
                  Effect.catch(() => Effect.succeed(Option.none())),
                ),
              { concurrency: maximumConcurrentBalanceLoads },
            ).pipe(
              Effect.map(maybeBalances => {
                const observedAt = Date.now()
                const unavailableAccountIds = Array.getSomes(
                  Array.zipWith(
                    accounts,
                    maybeBalances,
                    (operational, maybeBalance) =>
                      Option.isNone(maybeBalance)
                        ? Option.some(operational.account.account.accountId)
                        : Option.none(),
                  ),
                )
                return PortfolioSnapshot.make({
                  dataSource: 'Live',
                  chains: liveWalletChains,
                  networks: Array.map(
                    networks,
                    configuration => configuration.network,
                  ),
                  assets: Array.map(
                    networks,
                    configuration => configuration.asset,
                  ),
                  accounts: Array.map(
                    accounts,
                    operational => operational.account.account,
                  ),
                  balanceSnapshot: BalanceSnapshot.make({
                    observedAt,
                    balances: Array.getSomes(maybeBalances),
                    unavailableAccountIds,
                  }),
                  receivingInstructions: Array.map(accounts, operational =>
                    operational.adapter.receivingInstruction(
                      operational.account,
                    ),
                  ),
                })
              }),
            ),
          ),
        ),
      requestTestFunding: request =>
        Ref.get(currentAccounts).pipe(
          Effect.flatMap(accounts => accountForId(accounts, request.accountId)),
          Effect.flatMap(operational => {
            if (
              operational.account.account.chainId !== request.chainId ||
              operational.account.account.networkId !== request.networkId ||
              operational.account.configuration.asset.assetId !==
                request.assetId
            ) {
              return Effect.fail(unsupported())
            }
            return withNetworkTimeout(
              operational.adapter.requestTestFunding(
                operational.account,
                request,
              ),
            )
          }),
        ),
      validateTransfer: request =>
        Ref.get(currentAccounts).pipe(
          Effect.flatMap(accounts => accountForId(accounts, request.accountId)),
          Effect.flatMap(operational => {
            if (
              operational.account.configuration.asset.assetId !==
              request.assetId
            ) {
              return Effect.fail(invalidResponse())
            }
            return withNetworkTimeout(
              operational.adapter.validateTransfer(
                operational.account,
                request,
              ),
            )
          }),
        ),
      previewTransfer: transfer =>
        Ref.get(currentAccounts).pipe(
          Effect.flatMap(accounts =>
            accountForId(accounts, transfer.request.accountId),
          ),
          Effect.flatMap(operational => {
            if (
              operational.account.account.networkId !==
                transfer.recipient.networkId ||
              operational.account.configuration.asset.assetId !==
                transfer.request.assetId
            ) {
              return Effect.fail(invalidResponse())
            }
            return withNetworkTimeout(
              operational.adapter.previewTransfer(
                operational.account,
                transfer,
              ),
            )
          }),
        ),
      buildTransferPayload: preview =>
        Ref.get(currentAccounts).pipe(
          Effect.flatMap(accounts =>
            accountForId(accounts, preview.transfer.request.accountId),
          ),
          Effect.flatMap(operational =>
            withNetworkTimeout(
              operational.adapter.buildTransferPayload(
                operational.account,
                preview,
              ),
            ),
          ),
        ),
      submitTransaction: transaction =>
        Ref.get(currentAccounts).pipe(
          Effect.flatMap(accounts =>
            accountForId(accounts, transaction.accountId),
          ),
          Effect.flatMap(operational => {
            if (
              operational.account.account.networkId !== transaction.networkId
            ) {
              return Effect.fail(invalidResponse())
            }
            return withNetworkTimeout(
              operational.adapter.submitTransaction(
                operational.account,
                transaction,
              ),
            )
          }),
        ),
      loadTransactionHistory: query =>
        Ref.get(currentAccounts).pipe(
          Effect.flatMap(accounts => accountForId(accounts, query.accountId)),
          Effect.flatMap(operational => {
            if (operational.account.account.networkId !== query.networkId) {
              return Effect.fail(invalidResponse())
            }
            return withNetworkTimeout(
              operational.adapter.loadTransactionHistory(
                operational.account,
                query,
              ),
            )
          }),
        ),
      observeTransactions: accountIds =>
        Stream.fromEffect(Ref.get(currentAccounts)).pipe(
          Stream.flatMap(accounts => {
            const selectedAccounts = Array.getSomes(
              Array.map(accountIds, accountId =>
                Array.findFirst(
                  accounts,
                  operational =>
                    operational.account.account.accountId === accountId,
                ),
              ),
            )
            if (Array.length(selectedAccounts) !== Array.length(accountIds)) {
              return Stream.fail(unsupported())
            }
            return Stream.mergeAll(
              Array.map(selectedAccounts, operational =>
                operational.adapter.observeTransactions(operational.account),
              ),
              { concurrency: 'unbounded' },
            )
          }),
        ),
    })
  })

/** Builds real multi-chain networking with host-reachable endpoint overrides. */
export const makeLiveWalletClientLayer = (
  networks: ReadonlyArray<LiveWalletNetwork>,
): Layer.Layer<WalletClient> =>
  Layer.effect(WalletClient, makeLiveWalletClient(networks))

/** Real multi-chain Wallet networking selected by persisted public accounts. */
export const LiveWalletClient: Layer.Layer<WalletClient> =
  makeLiveWalletClientLayer(liveWalletNetworks)
