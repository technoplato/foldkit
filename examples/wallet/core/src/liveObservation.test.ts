import { Effect, Option, Stream } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ResumedTransactionObservation } from './message.js'
import {
  BalanceSnapshot,
  FailedTransactionObservation,
  LoadedPortfolio,
  type Model,
  NetworkFailure,
  ObservingTransactions,
  PortfolioSnapshot,
  initialModel,
} from './model.js'
import { SendNetworkSelection } from './sendNetworkSelection.js'
import { subscriptions } from './subscription.js'
import { update } from './update.js'
import { LoadedWalletProfiles, WalletProfile } from './walletProfile.js'

const account = {
  accountId: 'wallet-1:solana:devnet',
  chainId: 'solana',
  networkId: 'solana:devnet',
  address: 'C5DLCjAX2UGrVDvoz8M4TYBCWSyUL9451GzG62SfQuih',
  displayName: 'Solana',
}

const failedModel: Model = {
  ...initialModel,
  walletProfileLoading: LoadedWalletProfiles.make({}),
  wallets: [
    WalletProfile.make({
      walletId: 'wallet-1',
      displayName: 'Wallet 1',
      createdAt: 1,
      accounts: [account],
    }),
  ],
  portfolio: LoadedPortfolio.make({
    snapshot: PortfolioSnapshot.make({
      dataSource: 'Live',
      chains: [],
      networks: [],
      assets: [],
      accounts: [account],
      balanceSnapshot: BalanceSnapshot.make({ observedAt: 1, balances: [] }),
      receivingInstructions: [],
    }),
  }),
  maybeSendNetworkSelection: Option.some(
    SendNetworkSelection.make({
      networkMode: 'Devnet',
      chainId: account.chainId,
      networkId: account.networkId,
      accountId: account.accountId,
      assetId: 'solana:devnet:sol',
    }),
  ),
  transactionObservation: FailedTransactionObservation.make({
    failure: NetworkFailure.make({
      operation: 'ObserveTransactions',
      code: 'Unavailable',
    }),
  }),
}

afterEach(() => {
  vi.useRealTimers()
})

describe('a dropped live observation', () => {
  const resumeOf = (model: Model) =>
    subscriptions.resumeObservation.dependenciesToStream(
      subscriptions.resumeObservation.modelToDependencies(model),
    )

  it('resumes by itself after 15 seconds, with no click', async () => {
    vi.useFakeTimers()
    const collected = Effect.runPromise(
      Stream.runCollect(resumeOf(failedModel)),
    )
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await collected).toEqual([ResumedTransactionObservation.make({})])
  })

  it('waits for nothing while it is listening', async () => {
    const listening: Model = {
      ...failedModel,
      transactionObservation: ObservingTransactions.make({
        accountIds: [account.accountId],
      }),
    }
    expect(await Effect.runPromise(Stream.runCollect(resumeOf(listening)))).toEqual(
      [],
    )
  })

  it('reads fresh balances when it resumes, since money may have moved in the gap', () => {
    const [resumed, commands] = update(
      failedModel,
      ResumedTransactionObservation.make({}),
    )
    expect(resumed.transactionObservation._tag).toBe('ObservingTransactions')
    expect(commands.map(command => command.name)).toEqual([
      'RefreshWalletBalances',
    ])
  })
})
