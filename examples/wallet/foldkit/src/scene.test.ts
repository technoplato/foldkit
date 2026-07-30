import { Option } from 'effect'
import { Scene } from 'foldkit'
import { describe, expect, test } from 'vitest'
import {
  LoadTransactionHistory,
  Model,
  SucceededLoadTransactionHistory,
  SucceededLoadWallet,
  SucceededLoadWalletProfiles,
  TransactionHistoryPage,
  TransactionHistoryQuery,
  WalletProfile,
  WalletProgram,
  initialModel,
  update,
} from 'wallet-core-example'
import { simulatedPortfolio } from 'wallet-simulated-client-example'

import { walletFoldkitProgram } from './application.js'
import { view } from './view.js'

const loadedModel = (
  wallets: ReadonlyArray<typeof WalletProfile.Type> = [],
): Model => {
  const [walletModel] = update(
    initialModel,
    SucceededLoadWalletProfiles.make({ wallets }),
  )
  if (walletModel.portfolio._tag !== 'LoadingPortfolio') {
    throw new Error('Expected the Wallet portfolio to be loading')
  }
  const [model] = update(
    walletModel,
    SucceededLoadWallet.make({
      requestId: walletModel.portfolio.requestId,
      portfolio: simulatedPortfolio,
    }),
  )
  return Model.make({
    ...model,
    transactionHistory: initialModel.transactionHistory,
    transactions: [],
  })
}

const simulatedWallet = WalletProfile.make({
  walletId: 'simulated-wallet',
  displayName: 'Fixture',
  createdAt: 1_722_009_600_000,
  accounts: simulatedPortfolio.accounts,
})

const resolveEmptyHistory = (accountId: string, networkId: string) =>
  Scene.Command.resolve(
    LoadTransactionHistory,
    SucceededLoadTransactionHistory.make({
      query: TransactionHistoryQuery.make({
        accountId,
        networkId,
        maybeCursor: Option.none(),
        limit: 50,
      }),
      page: TransactionHistoryPage.make({
        records: [],
        maybeNextCursor: Option.none(),
      }),
    }),
  )

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
      Scene.expect(Scene.text('Fixture data')).toExist(),
      Scene.expect(
        Scene.text('Deterministic test values. No network was contacted.'),
      ).toExist(),
      Scene.expect(Scene.text('Your wallets')).toExist(),
      Scene.expect(Scene.text('No wallets yet.')).toExist(),
      Scene.expect(
        Scene.text('Switches every wallet and chain together.'),
      ).toExist(),
      Scene.expect(Scene.text('2.5 ETH')).toExist(),
      Scene.expect(
        Scene.role('group', { name: 'Cryptocurrency and network' }),
      ).toExist(),
      Scene.expect(
        Scene.role('button', { name: /ETH · Ethereum Sepolia/ }),
      ).toHaveClass('selected'),
      Scene.expect(Scene.label('Amount in ETH')).toExist(),
      Scene.expect(
        Scene.text('Enter an amount or use the small test amount.'),
      ).toExist(),
      Scene.expect(Scene.text('Recipient on Ethereum Sepolia')).toExist(),
      Scene.expect(Scene.text('No transactions found.')).toExist(),
      Scene.expect(Scene.text('Simulated Sepolia Account')).toExist(),
      Scene.expect(Scene.text('Copy address')).toExist(),
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

  test('shows each active account balance with its public receiving payload', () => {
    const wallet = Scene.role('article', { name: 'Fixture wallet' })
    Scene.scene(
      { update, view },
      Scene.with(loadedModel([simulatedWallet])),
      Scene.expect(Scene.within(wallet, Scene.text('2.5 ETH'))).toExist(),
      Scene.expect(
        Scene.within(
          wallet,
          Scene.text(
            '/wallet/receive/simulated-ethereum-account?asset=ethereum:sepolia:eth',
          ),
        ),
      ).toExist(),
      Scene.expect(
        Scene.within(
          wallet,
          Scene.selector(
            '[data-wallet-qr-value="/wallet/receive/simulated-ethereum-account?asset=ethereum:sepolia:eth"]',
          ),
        ),
      ).toExist(),
    )
  })

  test('fills the adapter-suggested small amount and explains preview readiness', () => {
    Scene.scene(
      { update, view },
      Scene.with(loadedModel()),
      Scene.click(
        Scene.role('button', {
          name: 'Use small test amount: 0.000000000000000001 ETH · 1 wei',
        }),
      ),
      Scene.expect(Scene.label('Amount in ETH')).toHaveValue(
        '0.000000000000000001',
      ),
      Scene.expect(Scene.text('Enter a recipient address.')).toExist(),
      Scene.type(
        Scene.label('Recipient on Ethereum Sepolia'),
        '0x2222222222222222222222222222222222222222',
      ),
      Scene.expect(Scene.text('Ready to preview.')).toExist(),
      Scene.expect(
        Scene.role('button', { name: 'Preview send' }),
      ).toBeEnabled(),
    )
  })

  test('collects recipient input before adapter validation', () => {
    Scene.scene(
      { update, view },
      Scene.with(loadedModel()),
      Scene.type(Scene.label('Amount in ETH'), '0.00001'),
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
      Scene.type(Scene.label('Amount in ETH'), '0.00001'),
      Scene.type(
        Scene.label('Recipient on Ethereum Sepolia'),
        '0x2222222222222222222222222222222222222222',
      ),
      Scene.expect(
        Scene.role('button', { name: 'Preview send' }),
      ).toBeEnabled(),
    )
  })

  test('requires an exact amount before requesting test funds', () => {
    Scene.scene(
      { update, view },
      Scene.with(loadedModel()),
      Scene.expect(
        Scene.role('button', {
          name: 'Enter amount to request test funds',
        }),
      ).toBeDisabled(),
      Scene.type(Scene.label('Amount in ETH'), '0.01'),
      Scene.expect(
        Scene.role('button', { name: 'Request test funds' }),
      ).toBeEnabled(),
    )
  })

  test('rebinds visible wallet data across mode and cryptocurrency changes', () => {
    Scene.scene(
      { update, view },
      Scene.with(loadedModel()),
      Scene.type(Scene.label('Amount in ETH'), '1.25'),
      Scene.type(
        Scene.label('Recipient on Ethereum Sepolia'),
        '0x2222222222222222222222222222222222222222',
      ),
      Scene.change(Scene.label('Wallet network mode'), 'Devnet'),
      resolveEmptyHistory(
        'simulated-ethereum-localnet-account',
        'ethereum:localnet',
      ),
      Scene.expect(Scene.text('Recipient on Ethereum Localnet')).toExist(),
      Scene.expect(Scene.label('Amount in ETH')).toHaveValue(''),
      Scene.click(
        Scene.role('button', {
          name: /SUI · Sui Devnet/,
        }),
      ),
      resolveEmptyHistory('simulated-sui-devnet-account', 'sui:devnet'),
      Scene.expect(Scene.text('Recipient on Sui Devnet')).toExist(),
      Scene.expect(Scene.label('Amount in SUI')).toHaveValue(''),
      Scene.expect(Scene.text('12 SUI')).toExist(),
      Scene.change(Scene.label('Wallet network mode'), 'Live'),
      Scene.expect(
        Scene.text(
          'No transferable assets are available for this network mode.',
        ),
      ).toExist(),
      Scene.expect(Scene.text('No adapter account available')).toExist(),
      Scene.change(Scene.label('Wallet network mode'), 'Testnet'),
      resolveEmptyHistory('simulated-ethereum-account', 'ethereum:sepolia'),
      Scene.expect(Scene.text('Recipient on Ethereum Sepolia')).toExist(),
      Scene.expect(Scene.label('Amount in ETH')).toHaveValue(''),
      Scene.expect(Scene.text('2.5 ETH')).toExist(),
    )
  })
})
