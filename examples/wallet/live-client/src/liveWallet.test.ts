import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  WalletClient,
  WalletProfile,
  WalletProfileAccount,
} from 'wallet-core-example'

import { LiveWalletClient } from './liveWallet.js'

const runWithLiveClient = <A, E>(effect: Effect.Effect<A, E, WalletClient>) =>
  Effect.runPromise(Effect.provide(effect, LiveWalletClient))

describe('live Wallet client', () => {
  it('loads the complete real catalog without inventing accounts or balances', async () => {
    const portfolio = await runWithLiveClient(
      Effect.gen(function* () {
        const client = yield* WalletClient
        return yield* client.loadPortfolio([])
      }),
    )

    expect(portfolio.dataSource).toBe('Live')
    expect(portfolio.chains).toHaveLength(4)
    expect(portfolio.networks).toHaveLength(12)
    expect(portfolio.assets).toHaveLength(12)
    expect(portfolio.accounts).toEqual([])
    expect(portfolio.balanceSnapshot.balances).toEqual([])
    expect(portfolio.balanceSnapshot.unavailableAccountIds).toEqual([])
    expect(portfolio.receivingInstructions).toEqual([])
  })

  it('fails closed for a restored account outside the adapter catalog', async () => {
    const wallet = WalletProfile.make({
      walletId: 'unsupported-wallet',
      displayName: 'Unsupported Wallet',
      createdAt: 1,
      accounts: [
        WalletProfileAccount.make({
          accountId: 'unsupported-wallet:unknown',
          chainId: 'unknown',
          networkId: 'unknown:network',
          address: 'unknown-address',
          displayName: 'Unknown Network',
        }),
      ],
    })

    const exit = await Effect.runPromiseExit(
      Effect.provide(
        Effect.gen(function* () {
          const client = yield* WalletClient
          return yield* client.loadPortfolio([wallet])
        }),
        LiveWalletClient,
      ),
    )

    expect(exit._tag).toBe('Failure')
  })
})
