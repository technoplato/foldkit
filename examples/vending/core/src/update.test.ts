import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { Option, Schema as S } from 'effect'
import { describe, expect, test } from 'vitest'
import { AtomicUnits, TransactionRecord } from 'wallet-core-example'
import {
  AdapterTestFundingMethod,
  AssetDescriptor,
  ChainDescriptor,
  NativeAsset,
  NetworkDescriptor,
} from 'wallet-core-example'
import {
  AccountBalance,
  AssetAmount,
  BalanceSnapshot,
  PortfolioSnapshot,
  ReceivingInstruction,
  WalletProfile,
} from 'wallet-core-example'

import {
  ObservedIncoming,
  PressedClear,
  PressedDigit,
  PressedEnter,
  SucceededLoadPortfolio,
  SucceededLoadProfiles,
  init,
  restore,
  update,
} from './index.js'
import { clipSku, settleLamports } from './model.js'

const incomingSol = (
  lamports: string,
  status: 'Confirmed' | 'Pending',
  transactionId = `tx-${lamports}-${status}`,
) =>
  TransactionRecord.make({
    recordId: `rec-${transactionId}`,
    transactionId,
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

const chain = ChainDescriptor.make({
  chainId: 'solana',
  displayName: 'Solana',
})
const network = NetworkDescriptor.make({
  chainId: 'solana',
  networkId: 'solana:devnet',
  displayName: 'Solana Devnet',
  environment: 'Development',
  capabilities: [
    'Transfer',
    'TestFunding',
    'TransactionHistory',
    'TransactionObservation',
  ],
  testFundingMethod: AdapterTestFundingMethod.make({}),
})
const asset = AssetDescriptor.make({
  assetId: 'solana:devnet:sol',
  networkId: 'solana:devnet',
  displayName: 'Devnet SOL',
  symbol: 'SOL',
  decimalPlaces: 9,
  kind: NativeAsset.make({}),
})
const account = {
  accountId: 'acct-sol-devnet',
  chainId: 'solana',
  networkId: 'solana:devnet',
  address: 'DevnetVendReceive111111111111111111111111111',
  displayName: 'Vending',
}
const wallet = WalletProfile.make({
  walletId: 'wallet-vending',
  displayName: 'Vending',
  createdAt: 1,
  accounts: [account],
})
const portfolio = PortfolioSnapshot.make({
  dataSource: 'Fixture',
  chains: [chain],
  networks: [network],
  assets: [asset],
  accounts: [account],
  balanceSnapshot: BalanceSnapshot.make({
    observedAt: 1,
    balances: [
      AccountBalance.make({
        accountId: account.accountId,
        amount: AssetAmount.make({
          assetId: asset.assetId,
          atomicUnits: '0',
          observedAt: 1,
        }),
      }),
    ],
  }),
  receivingInstructions: [
    ReceivingInstruction.make({
      accountId: account.accountId,
      assetId: asset.assetId,
      destinationAddress: account.address,
      maybeMemo: Option.none(),
      portableUri: `solana:${account.address}`,
    }),
  ],
})

const readyModel = () => {
  const [initial] = init()
  const [afterProfiles] = update(
    initial,
    SucceededLoadProfiles.make({ wallets: [wallet] }),
  )
  const [ready] = update(
    afterProfiles,
    SucceededLoadPortfolio.make({ wallets: [wallet], portfolio }),
  )
  return ready
}

const enterCode = (model: ReturnType<typeof readyModel>, code: string) => {
  let next = model
  for (const digit of code) {
    if (
      digit !== '0' &&
      digit !== '1' &&
      digit !== '2' &&
      digit !== '3' &&
      digit !== '4' &&
      digit !== '5' &&
      digit !== '6' &&
      digit !== '7' &&
      digit !== '8' &&
      digit !== '9'
    ) {
      throw new Error(`not a digit: ${digit}`)
    }
    const [afterDigit] = update(next, PressedDigit.make({ digit }))
    next = afterDigit
  }
  const [afterEnter] = update(next, PressedEnter.make({}))
  return afterEnter
}

describe('init', () => {
  test('seeds the clip at 14.28 listed and 0.001 SOL settle', () => {
    const [model, commands] = init()
    expect(model.listPriceDisplay).toBe('14.28')
    expect(model.settleLamports).toBe(1_000_000n)
    expect(model.settleLamports).toBe(settleLamports)
    expect(model.catalog).toEqual([clipSku])
    expect(model.vendPhase._tag).toBe('Idle')
    expect(model.selection._tag).toBe('Idle')
    expect(commands).toHaveLength(1)
    expect(restore(model)).toStrictEqual([model, []])
  })
})

describe('keypad', () => {
  test('wrong code → WrongCode', () => {
    const next = enterCode(readyModel(), '0000')
    expect(next.vendPhase._tag).toBe('WrongCode')
    expect(next.selection._tag).toBe('Dialed')
  })

  test('right code → AwaitingPayment with address', () => {
    const next = enterCode(readyModel(), '1428')
    expect(next.vendPhase._tag).toBe('AwaitingPayment')
    expect(next.selection._tag).toBe('Locked')
    if (next.selection._tag === 'Locked') {
      expect(next.selection.sku.code).toBe('1428')
      expect(next.selection.sku.name).toBe('the clip')
      expect(next.selection.address).toBe(account.address)
    }
  })

  test('clear resets WrongCode', () => {
    const wrong = enterCode(readyModel(), '9999')
    const [cleared] = update(wrong, PressedClear.make({}))
    expect(cleared.vendPhase._tag).toBe('Idle')
    expect(cleared.keypadBuffer).toBe('')
  })
})

describe('incoming settlement', () => {
  test('incoming Confirmed >= settleLamports → Dispensed', () => {
    const awaiting = enterCode(readyModel(), '1428')
    const [next] = update(
      awaiting,
      ObservedIncoming.make({
        transaction: incomingSol('1000000', 'Confirmed'),
      }),
    )
    expect(next.vendPhase._tag).toBe('Dispensed')
    expect(next.incoming).toHaveLength(1)
  })

  test('below threshold → still AwaitingPayment', () => {
    const awaiting = enterCode(readyModel(), '1428')
    const [next] = update(
      awaiting,
      ObservedIncoming.make({
        transaction: incomingSol('999999', 'Confirmed'),
      }),
    )
    expect(next.vendPhase._tag).toBe('AwaitingPayment')
    expect(next.incoming).toHaveLength(1)
  })

  test('pending incoming does not vend', () => {
    const awaiting = enterCode(readyModel(), '1428')
    const [next] = update(
      awaiting,
      ObservedIncoming.make({
        transaction: incomingSol('1000000', 'Pending'),
      }),
    )
    expect(next.vendPhase._tag).toBe('AwaitingPayment')
  })
})

describe('view-agnostic core', () => {
  test('3JS does not live in update()', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./update.ts', import.meta.url)),
      'utf8',
    )
    expect(source.toLowerCase().includes('three')).toBe(false)
    expect(source.toLowerCase().includes('webgl')).toBe(false)
    expect(source.includes('requestAnimationFrame')).toBe(false)
  })
})
