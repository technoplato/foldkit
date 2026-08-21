import { Option, Schema as S } from 'effect'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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
  AdvancedClipPlayback,
  FailedCopyAddress,
  ObservedIncoming,
  PressedClear,
  PressedDigit,
  PressedEnter,
  RequestedCopyAddress,
  SucceededCopyAddress,
  SucceededLoadPortfolio,
  SucceededLoadProfiles,
  clipCompleteMs,
  init,
  restore,
  revealedLines,
  update,
} from './index.js'
import { clipSku, copyAddressLabel, settleLamports } from './model.js'

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
    expect(model.clipPlayback._tag).toBe('Idle')
    expect(model.lastControl._tag).toBe('Idle')
    expect(commands).toHaveLength(1)
    expect(restore(model)).toStrictEqual([model, []])
  })
})

describe('keypad', () => {
  test('each press records lastControl so hosts can light the key', () => {
    const [afterOne] = update(readyModel(), PressedDigit.make({ digit: '1' }))
    expect(afterOne.keypadBuffer).toBe('1')
    expect(afterOne.lastControl).toEqual({ _tag: 'Digit', digit: '1' })

    const [afterEnter] = update(afterOne, PressedEnter.make({}))
    expect(afterEnter.lastControl._tag).toBe('Enter')

    const [afterClear] = update(afterEnter, PressedClear.make({}))
    expect(afterClear.lastControl._tag).toBe('Clear')
    expect(afterClear.keypadBuffer).toBe('')
  })

  test('a tap while awaiting payment still records lastControl', () => {
    const awaiting = enterCode(readyModel(), '1428')
    expect(awaiting.vendPhase._tag).toBe('AwaitingPayment')
    const [next] = update(awaiting, PressedDigit.make({ digit: '9' }))
    expect(next.keypadBuffer).toBe(awaiting.keypadBuffer)
    expect(next.lastControl).toEqual({ _tag: 'Digit', digit: '9' })
  })

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

describe('copy SOL Devnet address', () => {
  test('labels the host button from clipboard state', () => {
    const ready = readyModel()
    expect(copyAddressLabel(ready.clipboard)).toBe('Copy Solana Pay')
    const [copied] = update(
      ready,
      SucceededCopyAddress.make({ address: account.address }),
    )
    expect(copyAddressLabel(copied.clipboard)).toBe('Copied')
    const [failed] = update(ready, FailedCopyAddress.make({ code: 'Denied' }))
    expect(copyAddressLabel(failed.clipboard)).toBe('Try copy again')
  })

  test('RequestedCopyAddress emits CopyAddress when the wallet is ready', () => {
    const ready = readyModel()
    const [, commands] = update(ready, RequestedCopyAddress.make({}))
    expect(commands).toHaveLength(1)
  })

  test('RequestedCopyAddress is a no-op before a receive address exists', () => {
    const [initial] = init()
    const [next, commands] = update(initial, RequestedCopyAddress.make({}))
    expect(next.clipboard._tag).toBe('idle')
    expect(commands).toHaveLength(0)
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
    expect(next.clipPlayback._tag).toBe('Playing')
    expect(revealedLines(next.clipPlayback)).toHaveLength(1)
  })

  test('clip playback reveals the TJ deal from state, not a video', () => {
    const awaiting = enterCode(readyModel(), '1428')
    const [dispensed] = update(
      awaiting,
      ObservedIncoming.make({
        transaction: incomingSol('1000000', 'Confirmed', 'tx-clip'),
      }),
    )
    const [playing] = update(
      dispensed,
      AdvancedClipPlayback.make({ elapsedMs: 16_500 }),
    )
    const lines = revealedLines(playing.clipPlayback)
    expect(lines.at(-1)?.text).toContain('14.28')
    const [done] = update(
      playing,
      AdvancedClipPlayback.make({ elapsedMs: clipCompleteMs }),
    )
    expect(done.clipPlayback._tag).toBe('Complete')
    expect(revealedLines(done.clipPlayback).at(-2)?.text).toBe('Okay. Deal.')
  })

  test('playback does not start before dispense', () => {
    const awaiting = enterCode(readyModel(), '1428')
    const [next] = update(
      awaiting,
      AdvancedClipPlayback.make({ elapsedMs: 16_500 }),
    )
    expect(next.clipPlayback._tag).toBe('Idle')
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
