import { Array } from 'effect'
import { Scene } from 'foldkit'
import { describe, expect, test } from 'vitest'
import {
  IdleSignature,
  IdleTransaction,
  LoadedPortfolio,
  Model,
  NoWalletIntent,
  ObservingTransactions,
  WalletProgram,
  initialModel,
  update,
} from 'wallet-core-example'
import { simulatedPortfolio } from 'wallet-simulated-client-example'

import { walletFoldkitProgram } from './application.js'
import { view } from './view.js'

const loadedModel = (): Model =>
  Model.make({
    portfolio: LoadedPortfolio.make({ snapshot: simulatedPortfolio }),
    walletIntent: NoWalletIntent.make({}),
    transferRecipient: initialModel.transferRecipient,
    addressBookEntries: [],
    transaction: IdleTransaction.make({}),
    signature: IdleSignature.make({}),
    transactionObservation: ObservingTransactions.make({
      accountIds: Array.map(
        simulatedPortfolio.accounts,
        account => account.accountId,
      ),
    }),
    transactionHistory: initialModel.transactionHistory,
    transactions: [],
  })

describe('Wallet Foldkit client', () => {
  test('uses the canonical exported Wallet Program identity', () => {
    expect(walletFoldkitProgram).toBe(WalletProgram)
    expect(walletFoldkitProgram.id).toBe(WalletProgram.id)
    expect(walletFoldkitProgram.version).toBe(WalletProgram.version)
  })

  test('renders the simple flow and keeps advanced wallet tools available', () => {
    Scene.scene(
      { update, view },
      Scene.with(loadedModel()),
      Scene.expect(Scene.text('Available balance')).toExist(),
      Scene.expect(Scene.text('2.5 ETH')).toExist(),
      Scene.expect(Scene.text('0.00001 ETH')).toExist(),
      Scene.expect(Scene.text('Recipient on Ethereum Sepolia')).toExist(),
      Scene.expect(Scene.text('Nothing sent yet.')).toExist(),
      Scene.expect(Scene.text('Simulated Sepolia Account')).toExist(),
      Scene.expect(
        Scene.text(
          '/wallet/receive/simulated-ethereum-account?asset=ethereum:sepolia:eth',
        ),
      ).toExist(),
      Scene.expect(Scene.text('Sign test challenge')).toExist(),
      Scene.expect(Scene.text('Replay')).toExist(),
      Scene.expect(
        Scene.text(
          'Open the Foldkit DevTools badge to inspect the authoritative Program journal.',
        ),
      ).toExist(),
    )
  })

  test('collects recipient input before adapter validation', () => {
    Scene.scene(
      { update, view },
      Scene.with(loadedModel()),
      Scene.type(
        Scene.label('Recipient on Ethereum Sepolia'),
        '0x1111111111111111111111111111111111111111111111111111111111111111',
      ),
      Scene.expect(
        Scene.role('button', { name: 'Preview send' }),
      ).toBeEnabled(),
    )

    Scene.scene(
      { update, view },
      Scene.with(loadedModel()),
      Scene.type(
        Scene.label('Recipient on Ethereum Sepolia'),
        '0x2222222222222222222222222222222222222222',
      ),
      Scene.expect(
        Scene.role('button', { name: 'Preview send' }),
      ).toBeEnabled(),
    )
  })
})
