import { Effect, Exit, Option, Stream } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WalletAccount, WalletProfileAccount } from 'wallet-core-example'

import { LiveNetworkAccount } from './adapter.js'
import { liveWalletNetworkForId } from './catalog.js'
import { makeSolanaLiveAdapter } from './solana.js'

const configuration = (() => {
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
  configuration,
})

const sockets: Array<FakeSocket> = []

class FakeSocket extends EventTarget {
  readonly sent: Array<string> = []

  constructor(readonly url: string) {
    super()
    sockets.push(this)
    queueMicrotask(() => this.dispatchEvent(new Event('open')))
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {}

  receive(value: unknown): void {
    this.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify(value) }),
    )
  }
}

const settleAttempts = 200

const subscribedSocket = async (): Promise<FakeSocket> => {
  for (let attempt = 0; attempt < settleAttempts; attempt += 1) {
    const maybeSocket = sockets.at(-1)
    if (maybeSocket !== undefined && maybeSocket.sent.length > 0) {
      return maybeSocket
    }
    await new Promise(resolve => setTimeout(resolve, 1))
  }
  throw new Error('the adapter never subscribed')
}

afterEach(() => {
  vi.unstubAllGlobals()
  sockets.splice(0)
})

describe('Solana live observation', () => {
  it('ends when the RPC refuses the subscription, so the watcher reconnects', async () => {
    vi.stubGlobal('WebSocket', FakeSocket)
    const adapter = makeSolanaLiveAdapter(configuration)
    const run = Effect.runPromiseExit(
      Stream.runDrain(adapter.observeTransactions(account)),
    )
    const socket = await subscribedSocket()
    socket.receive({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32005, message: 'Too many requests' },
    })
    expect(Exit.isFailure(await run)).toBe(true)
  })

  it('ends when the server times the subscription out on an open socket', async () => {
    vi.stubGlobal('WebSocket', FakeSocket)
    const adapter = makeSolanaLiveAdapter(configuration)
    const run = Effect.runPromiseExit(
      Stream.runDrain(adapter.observeTransactions(account)),
    )
    const socket = await subscribedSocket()
    socket.receive({ jsonrpc: '2.0', id: 1, result: 7 })
    socket.receive({
      method: 'eth_subscription',
      params: {
        error: { code: -32000, message: 'Subscription timed out' },
        subscription: 7,
      },
    })
    expect(Exit.isFailure(await run)).toBe(true)
  })
})
