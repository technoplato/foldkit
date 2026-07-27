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

  test('renders the same public portfolio, receiving payload, and workflows', () => {
    Scene.scene(
      { update, view },
      Scene.with(loadedModel()),
      Scene.expect(Scene.text('Simulated Sepolia Account')).toExist(),
      Scene.expect(
        Scene.text(
          'QR payload: /wallet/receive/simulated-ethereum-account?asset=eth',
        ),
      ).toExist(),
      Scene.expect(Scene.text('Transaction composition')).toExist(),
      Scene.expect(Scene.text('Observed transaction stream')).toExist(),
      Scene.expect(Scene.text('Challenge signing')).toExist(),
      Scene.expect(Scene.text('Foldkit DevTools')).toExist(),
    )
  })
})
