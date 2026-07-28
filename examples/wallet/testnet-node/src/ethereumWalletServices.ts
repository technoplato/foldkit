import { Array, Context, Effect, Layer, Stream } from 'effect'
import {
  BalanceSnapshot,
  PortfolioSnapshot,
  WalletClient,
  WalletClientError,
  WalletCrypto,
  type WalletResources,
  WalletSigner,
  WalletSignerError,
} from 'wallet-core-example'

import {
  EthereumSepoliaCustody,
  EthereumSepoliaTransport,
} from './chainTransport.js'

const unsupportedClient = () => new WalletClientError({ code: 'Rejected' })

const makeEthereumWalletNetworkServices = Effect.gen(function* () {
  const ethereum = yield* EthereumSepoliaTransport

  const client = WalletClient.of({
    loadPortfolio: ethereum.loadPortfolio.pipe(
      Effect.map(portfolio =>
        PortfolioSnapshot.make({
          chains: [portfolio.chain],
          networks: [portfolio.network],
          assets: portfolio.assets,
          accounts: [portfolio.account],
          balanceSnapshot: BalanceSnapshot.make({
            observedAt: portfolio.observedAt,
            balances: portfolio.balances,
          }),
          receivingInstructions: portfolio.receivingInstructions,
        }),
      ),
    ),
    validateTransfer: request => ethereum.validateTransfer(request),
    previewTransfer: transfer => ethereum.previewTransfer(transfer),
    buildTransferPayload: preview => ethereum.buildTransferPayload(preview),
    submitTransaction: signed => ethereum.submitTransaction(signed),
    loadTransactionHistory: query => ethereum.loadTransactionHistory(query),
    observeTransactions: accountIds => {
      const hasUnknownAccount = Array.some(
        accountIds,
        accountId => accountId !== ethereum.account.accountId,
      )
      if (hasUnknownAccount) {
        return Stream.fail(unsupportedClient())
      }
      return Array.contains(accountIds, ethereum.account.accountId)
        ? ethereum.observeTransactions
        : Stream.empty
    },
  })

  const crypto = WalletCrypto.of({
    verifySignatureProof: (challenge, proof) =>
      ethereum.verifySignatureProof(challenge, proof),
  })

  return Context.make(WalletClient, client).pipe(
    Context.add(WalletCrypto, crypto),
  )
})

const makeEthereumWalletSigner = Effect.gen(function* () {
  const custody = yield* EthereumSepoliaCustody
  return WalletSigner.of({
    signTransaction: payload => {
      if (
        payload.accountId === custody.accountId &&
        payload.networkId === custody.networkId
      ) {
        return custody.signTransaction(payload)
      } else {
        return Effect.fail(
          new WalletSignerError({ code: 'UnsupportedAccount' }),
        )
      }
    },
    signChallenge: challenge => {
      if (challenge.accountId === custody.accountId) {
        return custody.signChallenge(challenge)
      } else {
        return Effect.fail(
          new WalletSignerError({ code: 'UnsupportedAccount' }),
        )
      }
    },
  })
})

/** WalletClient and WalletCrypto backed only by one Ethereum Sepolia transport. */
export const EthereumSepoliaWalletNetworkServicesLive: Layer.Layer<
  WalletClient | WalletCrypto,
  never,
  EthereumSepoliaTransport
> = Layer.effectContext(makeEthereumWalletNetworkServices)

/** WalletSigner backed only by one Ethereum Sepolia custody implementation. */
export const EthereumSepoliaWalletSignerLive: Layer.Layer<
  WalletSigner,
  never,
  EthereumSepoliaCustody
> = Layer.effect(WalletSigner, makeEthereumWalletSigner)

/** Complete wallet-core services backed only by Ethereum Sepolia. */
export const EthereumSepoliaWalletServicesLive: Layer.Layer<
  WalletResources,
  never,
  EthereumSepoliaTransport | EthereumSepoliaCustody
> = Layer.merge(
  EthereumSepoliaWalletNetworkServicesLive,
  EthereumSepoliaWalletSignerLive,
)
