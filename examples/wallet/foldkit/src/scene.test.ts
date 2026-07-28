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
    observedTransactions: [],
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
        Scene.text('/wallet/receive/simulated-ethereum-account?asset=eth'),
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

  test('validates recipient input before previewing a real testnet transfer', () => {
    Scene.scene(
      { update, view },
      Scene.with(loadedModel()),
      Scene.type(
        Scene.label('Recipient on Ethereum Sepolia'),
        '0x1111111111111111111111111111111111111111111111111111111111111111',
      ),
      Scene.expect(
        Scene.text(
          'That is not a valid address for Ethereum Sepolia. Valid addresses for Ethereum Sepolia look like 0x1234567890abcdef1234567890abcdef12345678 and follow the following rules.',
        ),
      ).toExist(),
      Scene.expect(
        Scene.text('It contains exactly 40 characters after the prefix.'),
      ).toExist(),
      Scene.expect(
        Scene.role('button', { name: 'Preview send' }),
      ).toBeDisabled(),
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
