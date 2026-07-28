import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  AssetAmount,
  AssetDescriptor,
  ChainDescriptor,
  NativeAsset,
  NetworkDescriptor,
} from './currency.js'
import {
  ComposedTransfer,
  SucceededLoadTransactionHistory,
  SucceededLoadWallet,
  SucceededValidateTransfer,
} from './message.js'
import {
  AccountBalance,
  BalanceSnapshot,
  PortfolioSnapshot,
  TransactionHistoryPage,
  TransferRequest,
  ValidatedRecipient,
  ValidatedTransfer,
  initialModel,
} from './model.js'
import { update } from './update.js'

const chain = ChainDescriptor.make({ chainId: 'solana', displayName: 'Solana' })
const network = NetworkDescriptor.make({
  networkId: 'solana:devnet',
  chainId: chain.chainId,
  displayName: 'Solana Devnet',
  environment: 'Development',
  capabilities: ['Transfer', 'TransactionHistory'],
})
const asset = AssetDescriptor.make({
  assetId: 'solana:devnet:sol',
  networkId: network.networkId,
  displayName: 'Devnet SOL',
  symbol: 'SOL',
  decimalPlaces: 9,
  kind: NativeAsset.make({}),
})
const account = {
  accountId: 'account-1',
  networkId: network.networkId,
  address: 'account-address',
  displayName: 'Account',
}
const portfolio = PortfolioSnapshot.make({
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
          atomicUnits: '1000',
          observedAt: 1,
        }),
      }),
    ],
  }),
  receivingInstructions: [],
})

describe('wallet update', () => {
  it('loads normalized catalogs and starts finite history loading', () => {
    const [model, commands] = update(
      initialModel,
      SucceededLoadWallet.make({ portfolio }),
    )

    expect(model.portfolio._tag).toBe('LoadedPortfolio')
    expect(model.transactionHistory._tag).toBe('LoadingTransactionHistory')
    expect(commands).toHaveLength(1)
  })

  it('moves one generic transfer through adapter validation', () => {
    const [loadedModel] = update(
      initialModel,
      SucceededLoadWallet.make({ portfolio }),
    )
    const request = TransferRequest.make({
      transferId: 'transfer-1',
      accountId: account.accountId,
      assetId: asset.assetId,
      destinationAddress: 'destination-address',
      atomicUnits: '10',
      maybeMessage: Option.none(),
    })
    const [validatingModel] = update(
      loadedModel,
      ComposedTransfer.make({ request }),
    )
    const [previewingModel, commands] = update(
      validatingModel,
      SucceededValidateTransfer.make({
        validation: ValidatedTransfer.make({
          request,
          recipient: ValidatedRecipient.make({
            networkId: network.networkId,
            address: request.destinationAddress,
            normalizedAddress: request.destinationAddress,
            displayAddress: request.destinationAddress,
          }),
        }),
      }),
    )

    expect(previewingModel.transaction._tag).toBe('PreviewingTransaction')
    expect(commands).toHaveLength(1)
  })

  it('accepts the matching history page', () => {
    const [loadingModel] = update(
      initialModel,
      SucceededLoadWallet.make({ portfolio }),
    )
    if (loadingModel.transactionHistory._tag !== 'LoadingTransactionHistory') {
      throw new Error('Expected transaction history to be loading')
    }
    const query = loadingModel.transactionHistory.query
    const [loadedModel] = update(
      loadingModel,
      SucceededLoadTransactionHistory.make({
        query,
        page: TransactionHistoryPage.make({
          records: [],
          maybeNextCursor: Option.none(),
        }),
      }),
    )

    expect(loadedModel.transactionHistory._tag).toBe('LoadedTransactionHistory')
  })
})
