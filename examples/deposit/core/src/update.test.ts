import { Option, Schema as S } from 'effect'
import { describe, expect, test } from 'vitest'
import { AtomicUnits, TransactionRecord } from 'wallet-core-example'

import {
  CAPABILITY_TAGS,
  DEPOSIT_TAGS,
  FIAT_RAIL_TAGS,
  MESSAGE_TAGS,
  ObservedIncoming,
  RequestedCryptoDeposit,
  RequestedFiatDeposit,
  capabilitiesUnlockedBy,
  init,
  liveStripeChargeIsRepresentable,
  liveStripeChargeMessageIsRepresentable,
  restore,
  selectCryptoRail,
  update,
} from './index.js'

const incomingSol = (lamports: string, status: 'Confirmed' | 'Pending') =>
  TransactionRecord.make({
    recordId: `rec-${lamports}`,
    transactionId: `tx-${lamports}`,
    accountId: 'acct-sol-devnet',
    networkId: 'solana:devnet',
    direction: 'Incoming',
    status,
    amount: {
      assetId: 'solana:devnet:sol',
      atomicUnits: S.decodeUnknownSync(AtomicUnits)(lamports),
      observedAt: 1,
    },
    counterpartyAddress: 'counterparty',
    normalizedCounterpartyAddress: 'counterparty',
    observedAt: 1,
  })

describe('init', () => {
  test('starts loading profiles on SOL Devnet', () => {
    const [model, commands] = init()
    expect(model.selectedChain).toBe('sol')
    expect(model.selectedNetwork).toBe('devnet')
    expect(model.wallet._tag).toBe('loading-profiles')
    expect(model.sender.deposits).toEqual([])
    expect(model.sender.unlocked).toEqual([])
    expect(commands).toHaveLength(1)
    expect(restore(model)).toStrictEqual([model, []])
  })
})

describe('SOL Devnet deposit', () => {
  test('confirmed Incoming SOL unlocks capabilities', () => {
    const [initial] = init()
    const [next] = update(
      initial,
      ObservedIncoming.make({
        transaction: incomingSol('1000000000', 'Confirmed'),
      }),
    )
    expect(next.incoming).toHaveLength(1)
    expect(next.incoming[0]?.lamports).toBe('1000000000')
    expect(next.sender.deposits).toHaveLength(1)
    expect(next.sender.deposits[0]?._tag).toBe('crypto')
    expect(next.sender.unlocked.map(item => item._tag)).toEqual([
      ...CAPABILITY_TAGS,
    ])
    expect(capabilitiesUnlockedBy(next.sender.deposits)).toHaveLength(6)
  })
})

describe('UnsupportedRail', () => {
  test('btc/eth/sui/mainnet-sol refuse without a live command', () => {
    const [initial] = init()
    const cases: ReadonlyArray<
      readonly ['btc' | 'eth' | 'sui' | 'sol', 'devnet' | 'testnet' | 'mainnet']
    > = [
      ['btc', 'mainnet'],
      ['eth', 'mainnet'],
      ['sui', 'devnet'],
      ['sol', 'mainnet'],
      ['sol', 'testnet'],
    ]
    for (const [chain, network] of cases) {
      expect(selectCryptoRail(chain, network)._tag).toBe('unsupported')
      const [next, commands] = update(
        initial,
        RequestedCryptoDeposit.make({ chain, network }),
      )
      expect(commands).toEqual([])
      expect(Option.isSome(next.lastOutcome)).toBe(true)
      if (Option.isSome(next.lastOutcome)) {
        expect(next.lastOutcome.value).toEqual({
          _tag: 'refuse',
          why: 'unsupported-rail',
        })
      }
    }
  })

  test('sol-devnet is the live rail and does not refuse', () => {
    expect(selectCryptoRail('sol', 'devnet')._tag).toBe('sol-devnet')
    const [initial] = init()
    const [next, commands] = update(
      initial,
      RequestedCryptoDeposit.make({ chain: 'sol', network: 'devnet' }),
    )
    expect(commands).toEqual([])
    expect(Option.isSome(next.lastOutcome)).toBe(true)
    if (Option.isSome(next.lastOutcome)) {
      expect(next.lastOutcome.value._tag).toBe('ok')
    }
  })
})

describe('Fiat stripe-unconfigured', () => {
  test('RequestedFiatDeposit always refuses', () => {
    const [initial] = init()
    const [next, commands] = update(
      initial,
      RequestedFiatDeposit.make({
        method: 'stripe',
        currency: 'USD',
        amount: '100',
      }),
    )
    expect(commands).toEqual([])
    expect(Option.isSome(next.lastOutcome)).toBe(true)
    if (Option.isSome(next.lastOutcome)) {
      expect(next.lastOutcome.value).toEqual({
        _tag: 'refuse',
        why: 'stripe-unconfigured',
      })
    }
  })

  test('cannot construct a live stripe charge variant that executes', () => {
    expect(liveStripeChargeIsRepresentable).toBe(false)
    expect(liveStripeChargeMessageIsRepresentable).toBe(false)
    expect(FIAT_RAIL_TAGS).toEqual(['absent', 'stripe-unconfigured'])
    expect(
      (FIAT_RAIL_TAGS as ReadonlyArray<string>).includes('stripe-configured'),
    ).toBe(false)
    expect(
      (MESSAGE_TAGS as ReadonlyArray<string>).includes(
        'RequestedLiveStripeCharge',
      ),
    ).toBe(false)
  })
})

describe('ADT exhaustiveness', () => {
  test('Deposit, Capability, FiatRail, and Message tags are closed', () => {
    expect(DEPOSIT_TAGS).toEqual(['crypto', 'fiat'])
    expect(CAPABILITY_TAGS).toHaveLength(6)
    expect(FIAT_RAIL_TAGS).toHaveLength(2)
    expect(MESSAGE_TAGS.includes('RequestedFiatDeposit')).toBe(true)
    expect(MESSAGE_TAGS.includes('RequestedCryptoDeposit')).toBe(true)
    expect(MESSAGE_TAGS.includes('ObservedIncoming')).toBe(true)
  })
})
