import { Effect, Option } from 'effect'
import { getAddress } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WalletAccount, WalletProfileAccount } from 'wallet-core-example'

import { LiveNetworkAccount } from './adapter.js'
import { liveWalletNetworkForId } from './catalog.js'
import { makeEthereumLiveAdapter } from './ethereum.js'

const accountAddress = getAddress(`0x${'11'.repeat(20)}`)
const senderAddress = getAddress(`0x${'33'.repeat(20)}`)

const configuration = (() => {
  const maybeConfiguration = liveWalletNetworkForId('ethereum:sepolia')
  if (
    Option.isNone(maybeConfiguration) ||
    maybeConfiguration.value._tag !== 'EthereumLiveNetwork'
  ) {
    throw new Error('Missing Ethereum Sepolia configuration')
  }
  return maybeConfiguration.value
})()

const profile = WalletProfileAccount.make({
  accountId: 'wallet-1:ethereum:sepolia',
  chainId: 'ethereum',
  networkId: 'ethereum:sepolia',
  address: accountAddress,
  displayName: 'Wallet 1 Ethereum Sepolia',
})
const account = LiveNetworkAccount.make({
  profile,
  account: WalletAccount.make(profile),
  configuration,
})

const nextPageParams = {
  index: 136,
  value: '0',
  hash: `0x${'91'.repeat(32)}`,
  inserted_at: '2026-10-27T20:24:12.148565Z',
  block_number: 12007502,
  fee: '181693899077628',
}

const blockscoutPage = {
  items: [
    {
      timestamp: '2026-11-01T15:41:48.000000Z',
      status: 'ok',
      hash: `0x${'16'.repeat(32)}`,
      from: { hash: senderAddress },
      to: { hash: accountAddress },
      value: '222000000000000',
    },
  ],
  next_page_params: nextPageParams,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Ethereum history from Blockscout', () => {
  it('reads a page whose next-page fields changed, and sends every one back', async () => {
    const requested: Array<string> = []
    vi.stubGlobal('fetch', async (input: unknown) => {
      requested.push(String(input))
      return new Response(JSON.stringify(blockscoutPage), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    const adapter = makeEthereumLiveAdapter(configuration)
    const query = {
      accountId: profile.accountId,
      networkId: profile.networkId,
      limit: 25,
    }

    const first = await Effect.runPromise(
      adapter.loadTransactionHistory(account, {
        ...query,
        maybeCursor: Option.none(),
      }),
    )
    expect(first.records).toHaveLength(1)
    expect(first.records.at(0)?.direction).toBe('Incoming')
    expect(Option.isSome(first.maybeNextCursor)).toBe(true)

    await Effect.runPromise(
      adapter.loadTransactionHistory(account, {
        ...query,
        maybeCursor: first.maybeNextCursor,
      }),
    )
    const sent = new URL(requested.at(1) ?? '').searchParams
    expect(sent.get('block_number')).toBe('12007502')
    expect(sent.get('index')).toBe('136')
    expect(sent.get('hash')).toBe(nextPageParams.hash)
    expect(sent.get('inserted_at')).toBe(nextPageParams.inserted_at)
    expect(sent.get('fee')).toBe(nextPageParams.fee)
  })
})
