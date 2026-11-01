import { Effect, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  mirrorAddress,
  readOnlyRpcMethods,
  walletRowsFor,
} from './walletMirror.js'

const address = 'So11111111111111111111111111111111111111112'

type Call = Readonly<{ url: string; method: string }>

const replyTo = (method: string): unknown => {
  if (method === 'getBalance') {
    return { value: 1_500_000_000 }
  } else if (method === 'getSignaturesForAddress') {
    return [
      { signature: 'sig-old', slot: 7, blockTime: 1_793_490_000, err: null },
      {
        signature: 'sig-failed',
        slot: 8,
        blockTime: null,
        err: { InstructionError: [] },
      },
    ]
  } else {
    return {
      meta: { preBalances: [10, 2_000], postBalances: [5, 1_500] },
      transaction: { message: { accountKeys: ['someone', address] } },
    }
  }
}

const RpcCall = S.fromJsonString(S.Struct({ method: S.String, id: S.Number }))

const fakeChain =
  (calls: Array<Call>): typeof globalThis.fetch =>
  async (url, init) => {
    const { method, id } = S.decodeUnknownSync(RpcCall)(init?.body)
    calls.push({ url: String(url), method })
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', id, result: replyTo(method) }),
    )
  }

describe('the wallet mirror', () => {
  it('asks a public chain API only to read', async () => {
    const calls: Array<Call> = []
    await Effect.runPromise(
      mirrorAddress({
        fetch: fakeChain(calls),
        address,
        network: 'Devnet',
        known: new Set(),
      }),
    )
    expect(calls.map(({ method }) => method)).toEqual([
      'getBalance',
      'getSignaturesForAddress',
      'getTransaction',
      'getTransaction',
    ])
    expect(
      calls.every(({ url }) => url === 'https://api.devnet.solana.com'),
    ).toBe(true)
  })

  it('knows no method that signs or sends', () => {
    expect(readOnlyRpcMethods).toEqual([
      'getBalance',
      'getSignaturesForAddress',
      'getTransaction',
    ])
  })

  it('reads a balance and each transaction’s change for this address', async () => {
    const mirrored = await Effect.runPromise(
      mirrorAddress({
        fetch: fakeChain([]),
        address,
        network: 'Devnet',
        known: new Set(),
      }),
    )
    expect(mirrored.balanceAtomic).toBe('1500000000')
    expect(mirrored.transactions).toEqual([
      {
        signature: 'sig-old',
        slot: 7,
        maybeBlockTimeMs: Option.some(1_793_490_000_000),
        didSucceed: true,
        maybeChangeAtomic: Option.some('-500'),
      },
      {
        signature: 'sig-failed',
        slot: 8,
        maybeBlockTimeMs: Option.none(),
        didSucceed: false,
        maybeChangeAtomic: Option.some('-500'),
      },
    ])
  })

  it('reads no transaction it already holds', async () => {
    const calls: Array<Call> = []
    await Effect.runPromise(
      mirrorAddress({
        fetch: fakeChain(calls),
        address,
        network: 'Devnet',
        known: new Set(['sig-old']),
      }),
    )
    expect(
      calls.filter(({ method }) => method === 'getTransaction'),
    ).toHaveLength(1)
  })

  it('writes no field that is not public chain data', async () => {
    const mirrored = await Effect.runPromise(
      mirrorAddress({
        fetch: fakeChain([]),
        address,
        network: 'Devnet',
        known: new Set(),
      }),
    )
    const rows = walletRowsFor(
      { network: 'Devnet', address, label: 'Devnet' },
      mirrored,
      1,
    )
    expect(JSON.stringify(rows)).not.toMatch(/secret|private|seed|mnemonic/i)
    expect(rows.address.addressKey).toBe(`Solana:Devnet:${address}`)
  })
})
