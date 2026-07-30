import { Effect, Option, Schema as S } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AtomicUnits,
  TestFundingRequest,
  TransactionHistoryQuery,
  WalletAccount,
  WalletProfileAccount,
} from 'wallet-core-example'

import { LiveNetworkAccount } from './adapter.js'
import { liveWalletNetworkForId } from './catalog.js'
import { makeSolanaLiveAdapter } from './solana.js'

const solanaDevnetConfiguration = (() => {
  const maybeConfiguration = liveWalletNetworkForId('solana:devnet')
  if (
    Option.isNone(maybeConfiguration) ||
    maybeConfiguration.value._tag !== 'SolanaLiveNetwork'
  ) {
    throw new Error('Missing Solana Devnet configuration')
  }
  return maybeConfiguration.value
})()

const profile = WalletProfileAccount.make({
  accountId: 'wallet-1:solana:devnet',
  chainId: 'solana',
  networkId: 'solana:devnet',
  address: '11111111111111111111111111111111',
  displayName: 'Wallet 1 Solana Devnet',
})
const account = LiveNetworkAccount.make({
  profile,
  account: WalletAccount.make(profile),
  configuration: solanaDevnetConfiguration,
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Solana live adapter numeric boundaries', () => {
  it('loads exact safe-integer lamports', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Promise.resolve(
          new Response(JSON.stringify({ result: { value: 1_000_000_000 } }), {
            status: 200,
          }),
        ),
      ),
    )
    const adapter = makeSolanaLiveAdapter(solanaDevnetConfiguration)
    const balance = await Effect.runPromise(adapter.loadBalance(account))

    expect(balance.amount.atomicUnits).toBe('1000000000')
  })

  it('rejects imprecise numeric lamports from JSON-RPC', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ result: { value: Number.MAX_SAFE_INTEGER + 1 } }),
            { status: 200 },
          ),
        ),
      ),
    )
    const adapter = makeSolanaLiveAdapter(solanaDevnetConfiguration)
    const failure = await Effect.runPromise(
      adapter.loadBalance(account).pipe(Effect.flip),
    )

    expect(failure.code).toBe('InvalidResponse')
  })

  it('rejects invalid history limits and unsafe faucet amounts before I/O', async () => {
    const fetchRequest = vi.fn()
    vi.stubGlobal('fetch', fetchRequest)
    const adapter = makeSolanaLiveAdapter(solanaDevnetConfiguration)
    expect(() =>
      TransactionHistoryQuery.make({
        accountId: account.account.accountId,
        networkId: account.account.networkId,
        maybeCursor: Option.none(),
        limit: 0,
      }),
    ).toThrow()
    const fundingFailure = await Effect.runPromise(
      adapter
        .requestTestFunding(
          account,
          TestFundingRequest.make({
            requestId: 'funding-unsafe',
            accountId: account.account.accountId,
            chainId: account.account.chainId,
            networkId: account.account.networkId,
            environment: 'Development',
            assetId: solanaDevnetConfiguration.asset.assetId,
            atomicUnits: S.decodeUnknownSync(AtomicUnits)(
              (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString(),
            ),
          }),
        )
        .pipe(Effect.flip),
    )

    expect(fundingFailure.code).toBe('Rejected')
    expect(fetchRequest).not.toHaveBeenCalled()
  })
})
