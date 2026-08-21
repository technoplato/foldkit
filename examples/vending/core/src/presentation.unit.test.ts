import { Option } from 'effect'
import { describe, expect, test } from 'vitest'
import {
  AccountBalance,
  AdapterTestFundingMethod,
  AssetAmount,
  AssetDescriptor,
  BalanceSnapshot,
  ChainDescriptor,
  NativeAsset,
  NetworkDescriptor,
  PortfolioSnapshot,
  ReceivingInstruction,
  WalletProfile,
} from 'wallet-core-example'

import {
  PressedDigit,
  PressedEnter,
  SucceededLoadPortfolio,
  SucceededLoadProfiles,
  init,
  update,
} from './index.js'
import { settleSolDisplay } from './model.js'
import { projectVendingDisplay } from './presentation.js'

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

describe('vending display projection', () => {
  test('ready wallet publishes a Solana Pay URI the wallet can paste', () => {
    const display = projectVendingDisplay(readyModel())
    expect(display.address).toBe(account.address)
    expect(display.solanaPayUri).toBe(
      `solana:${account.address}?amount=${settleSolDisplay}&label=the%20clip&cluster=devnet`,
    )
    expect(display.copyLabel).toBe('Copy Solana Pay')
    expect(display.solanaPayUri).toContain('amount=0.001')
  })

  test('awaiting payment keeps the same pay URI after Enter', () => {
    const [after1] = update(readyModel(), PressedDigit.make({ digit: '1' }))
    const [after4] = update(after1, PressedDigit.make({ digit: '4' }))
    const [after2] = update(after4, PressedDigit.make({ digit: '2' }))
    const [after8] = update(after2, PressedDigit.make({ digit: '8' }))
    const [awaiting] = update(after8, PressedEnter.make({}))
    const display = projectVendingDisplay(awaiting)
    expect(display.vendPhase).toBe('AwaitingPayment')
    expect(display.solanaPayUri).toContain(account.address)
    expect(display.solanaPayUri).toContain('amount=0.001')
  })
})
