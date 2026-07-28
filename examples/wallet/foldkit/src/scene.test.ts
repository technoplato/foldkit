import { Array } from 'effect'
import { Scene } from 'foldkit'
import { describe, expect, test } from 'vitest'
import {
  IdleSignature,
  IdleTransaction,
  LoadedPortfolio,
  Model,
  ObservingTransactions,
  WalletProgram,
  update,
} from 'wallet-core-example'
import { simulatedPortfolio } from 'wallet-simulated-client-example'

import { walletFoldkitProgram } from './application.js'
import { view } from './view.js'

const loadedModel = (): Model =>
  Model.make({
    portfolio: LoadedPortfolio.make({ snapshot: simulatedPortfolio }),
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
})
