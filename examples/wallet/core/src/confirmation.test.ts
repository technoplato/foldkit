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
  AccountBalance,
  BalanceSnapshot,
  FirstTransactionWithRecipient,
  LoadedPortfolio,
  type Model,
  PortfolioSnapshot,
  TransactionPreview,
  TransferRequest,
  UnfamiliarAddress,
  ValidatedRecipient,
  ValidatedTransfer,
  initialModel,
} from './model.js'
import {
  availableWalletNetworkModes,
  transferConfirmation,
  walletNetworkModeLabel,
} from './presentation.js'
import { LoadedWalletProfiles } from './walletProfile.js'

const chain = ChainDescriptor.make({ chainId: 'solana', displayName: 'Solana' })
const devnet = NetworkDescriptor.make({
  networkId: 'solana:devnet',
  chainId: chain.chainId,
  displayName: 'Solana Devnet',
  environment: 'Development',
  capabilities: ['Transfer'],
})
const mainnet = NetworkDescriptor.make({
  networkId: 'solana:mainnet-beta',
  chainId: chain.chainId,
  displayName: 'Solana Mainnet Beta',
  environment: 'Mainnet',
  capabilities: ['Transfer'],
})
const assetOf = (network: NetworkDescriptor) =>
  AssetDescriptor.make({
    assetId: `${network.networkId}:sol`,
    networkId: network.networkId,
    displayName: 'SOL',
    symbol: 'SOL',
    decimalPlaces: 9,
    kind: NativeAsset.make({}),
  })
const strangerAddress = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'
const accountId = 'wallet-1:solana:mainnet-beta'
const portfolio = PortfolioSnapshot.make({
  dataSource: 'Live',
  chains: [chain],
  networks: [devnet, mainnet],
  assets: [assetOf(devnet), assetOf(mainnet)],
  accounts: [
    {
      accountId,
      chainId: chain.chainId,
      networkId: mainnet.networkId,
      address: 'C5DLCjAX2UGrVDvoz8M4TYBCWSyUL9451GzG62SfQuih',
      displayName: 'Solana',
    },
  ],
  balanceSnapshot: BalanceSnapshot.make({
    observedAt: 1,
    balances: [
      AccountBalance.make({
        accountId,
        amount: AssetAmount.make({
          assetId: assetOf(mainnet).assetId,
          atomicUnits: '1000000000',
          observedAt: 1,
        }),
      }),
    ],
  }),
  receivingInstructions: [],
})
const loadedModel: Model = {
  ...initialModel,
  walletProfileLoading: LoadedWalletProfiles.make({}),
  portfolio: LoadedPortfolio.make({ snapshot: portfolio }),
}
const amountOf = (atomicUnits: '999995000' | '5000' | '0') =>
  AssetAmount.make({
    assetId: assetOf(mainnet).assetId,
    atomicUnits,
    observedAt: 1,
  })
const preview = TransactionPreview.make({
  previewId: 'preview-1',
  transfer: ValidatedTransfer.make({
    request: TransferRequest.make({
      transferId: 'transfer-1',
      accountId,
      assetId: assetOf(mainnet).assetId,
      destinationAddress: strangerAddress,
      atomicUnits: '999995000',
      maybeMessage: Option.none(),
    }),
    recipient: ValidatedRecipient.make({
      networkId: mainnet.networkId,
      address: strangerAddress,
      normalizedAddress: strangerAddress,
      displayAddress: strangerAddress,
    }),
  }),
  estimatedFee: amountOf('5000'),
  resultingBalance: amountOf('0'),
  expiresAt: 2,
  recipientFamiliarity: UnfamiliarAddress.make({}),
  recipientHistory: FirstTransactionWithRecipient.make({}),
})

describe('the confirm step', () => {
  it('says exactly what will be signed: amount, full address, network, fee', () => {
    expect(transferConfirmation(loadedModel, preview)).toEqual(
      Option.some({
        amountLabel: '0.999995 SOL',
        recipientAddress: strangerAddress,
        networkName: 'Solana Mainnet Beta',
        feeLabel: '0.000005 SOL',
        balanceAfterLabel: '0 SOL',
        isRealMoney: true,
      }),
    )
  })
})

describe('the network modes', () => {
  it('calls the mainnet mode Mainnet', () => {
    expect(walletNetworkModeLabel('Live')).toBe('Mainnet')
    expect(walletNetworkModeLabel('Devnet')).toBe('Devnet')
  })

  it('offers only the modes this host has networks for', () => {
    expect(availableWalletNetworkModes(loadedModel)).toEqual(['Devnet', 'Live'])
  })
})
