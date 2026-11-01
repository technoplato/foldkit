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
  RequestedSignedTransactionSubmission,
  RequestedWalletRefresh,
  SucceededLoadWallet,
  SucceededLoadWalletProfiles,
} from './message.js'
import {
  AccountBalance,
  BalanceSnapshot,
  FirstTransactionWithRecipient,
  LoadedPortfolio,
  type Model,
  PortfolioSnapshot,
  PreviewedTransaction,
  SigningChallengeState,
  SubmittingTransaction,
  TransactionPreview,
  TransferRequest,
  UnfamiliarAddress,
  ValidTransferAmount,
  ValidTransferRecipient,
  ValidatedRecipient,
  ValidatedTransfer,
  initialModel,
} from './model.js'
import { SendNetworkSelection } from './sendNetworkSelection.js'
import { makeWalletTestChallenge } from './signingChallenge.js'
import { restore, update } from './update.js'
import { LoadedWalletProfiles, WalletProfile } from './walletProfile.js'

const chain = ChainDescriptor.make({ chainId: 'solana', displayName: 'Solana' })
const network = NetworkDescriptor.make({
  networkId: 'solana:mainnet-beta',
  chainId: chain.chainId,
  displayName: 'Solana Mainnet Beta',
  environment: 'Mainnet',
  capabilities: ['Transfer', 'TransactionHistory', 'ChallengeSignature'],
})
const asset = AssetDescriptor.make({
  assetId: 'solana:mainnet-beta:sol',
  networkId: network.networkId,
  displayName: 'SOL',
  symbol: 'SOL',
  decimalPlaces: 9,
  kind: NativeAsset.make({}),
})
const account = {
  accountId: 'wallet-1:solana:mainnet-beta',
  chainId: chain.chainId,
  networkId: network.networkId,
  address: 'C5DLCjAX2UGrVDvoz8M4TYBCWSyUL9451GzG62SfQuih',
  displayName: 'Solana',
}
const wallet = WalletProfile.make({
  walletId: 'wallet-1',
  displayName: 'Wallet 1',
  createdAt: 1,
  accounts: [account],
})
const portfolio = PortfolioSnapshot.make({
  dataSource: 'Live',
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
          atomicUnits: '1000000000',
          observedAt: 1,
        }),
      }),
    ],
  }),
  receivingInstructions: [],
})
const strangerAddress = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'
const request = TransferRequest.make({
  transferId: 'transfer-1',
  accountId: account.accountId,
  assetId: asset.assetId,
  destinationAddress: strangerAddress,
  atomicUnits: '999995000',
  maybeMessage: Option.none(),
})
const preview = TransactionPreview.make({
  previewId: 'preview-1',
  transfer: ValidatedTransfer.make({
    request,
    recipient: ValidatedRecipient.make({
      networkId: network.networkId,
      address: strangerAddress,
      normalizedAddress: strangerAddress,
      displayAddress: strangerAddress,
    }),
  }),
  estimatedFee: AssetAmount.make({
    assetId: asset.assetId,
    atomicUnits: '5000',
    observedAt: 1,
  }),
  resultingBalance: AssetAmount.make({
    assetId: asset.assetId,
    atomicUnits: '0',
    observedAt: 1,
  }),
  expiresAt: 2,
  recipientFamiliarity: UnfamiliarAddress.make({}),
  recipientHistory: FirstTransactionWithRecipient.make({}),
})
const loadedModel: Model = {
  ...initialModel,
  walletProfileLoading: LoadedWalletProfiles.make({}),
  wallets: [wallet],
  walletNetworkMode: 'Live',
  portfolio: LoadedPortfolio.make({ snapshot: portfolio }),
  maybeSendNetworkSelection: Option.some(
    SendNetworkSelection.make({
      networkMode: 'Live',
      chainId: chain.chainId,
      networkId: network.networkId,
      accountId: account.accountId,
      assetId: asset.assetId,
    }),
  ),
}

/**
 * Restores a Model the way a reload or a link would, lets the vault answer
 * with the real wallet, then lets the portfolio load.
 */
const restoreAndHydrate = (model: Model) => {
  const [restoredModel, restoreCommands] = restore(model)
  const [profiledModel, profileCommands] = update(
    restoredModel,
    SucceededLoadWalletProfiles.make({ wallets: [wallet] }),
  )
  if (profiledModel.portfolio._tag !== 'LoadingPortfolio') {
    throw new Error('Expected the portfolio to load after the vault answered')
  }
  const [hydratedModel, resumedCommands] = update(
    profiledModel,
    SucceededLoadWallet.make({
      requestId: profiledModel.portfolio.requestId,
      portfolio,
    }),
  )
  return {
    hydratedModel,
    commandNames: [
      ...restoreCommands,
      ...profileCommands,
      ...resumedCommands,
    ].map(command => command.name),
  }
}

describe('a restored Wallet Model never signs on its own', () => {
  it('leaves a send cut off mid-signing unsigned and says it may already be on the network', () => {
    const { hydratedModel, commandNames } = restoreAndHydrate({
      ...loadedModel,
      transaction: SubmittingTransaction.make({ preview }),
    })

    expect(commandNames).not.toContain('SignAndSubmitTransaction')
    expect(hydratedModel.transaction).toMatchObject({
      _tag: 'FailedTransactionSubmission',
      preview: { previewId: preview.previewId },
      failure: {
        operation: 'SubmitTransaction',
        maybeGuidance: Option.some({
          summary:
            'This send stopped before it finished. It may already be on the network.',
          details: ['Check Activity before you send again.'],
        }),
      },
    })
  })

  it('drops a restored preview, so nothing can be confirmed until a fresh one', () => {
    const { hydratedModel, commandNames } = restoreAndHydrate({
      ...loadedModel,
      transaction: PreviewedTransaction.make({ preview }),
    })
    const [, confirmCommands] = update(
      hydratedModel,
      RequestedSignedTransactionSubmission.make({
        previewId: preview.previewId,
      }),
    )

    expect(hydratedModel.transaction._tag).toBe('IdleTransaction')
    expect(commandNames).not.toContain('SignAndSubmitTransaction')
    expect(confirmCommands).toHaveLength(0)
  })

  it('signs a send once when Refresh is tapped while it is being sent', () => {
    const sendingModel: Model = {
      ...loadedModel,
      transaction: SubmittingTransaction.make({ preview }),
    }
    const [refreshingModel] = update(
      sendingModel,
      RequestedWalletRefresh.make({}),
    )
    if (refreshingModel.portfolio._tag !== 'LoadingPortfolio') {
      throw new Error('Expected Refresh to reload the portfolio')
    }
    const [refreshedModel, commands] = update(
      refreshingModel,
      SucceededLoadWallet.make({
        requestId: refreshingModel.portfolio.requestId,
        portfolio,
      }),
    )

    expect(commands.map(command => command.name)).not.toContain(
      'SignAndSubmitTransaction',
    )
    expect(refreshedModel.transaction._tag).toBe('SubmittingTransaction')
  })

  it('takes the wallets from the vault, never from the restored Model', () => {
    const strangerWallet = WalletProfile.make({
      ...wallet,
      accounts: [{ ...account, address: strangerAddress }],
    })
    const [restoredModel, commands] = restore({
      ...loadedModel,
      wallets: [strangerWallet],
    })

    expect(restoredModel.wallets).toEqual([])
    expect(restoredModel.walletProfileLoading._tag).toBe(
      'LoadingWalletProfiles',
    )
    expect(commands.map(command => command.name)).toEqual([
      'LoadWalletProfiles',
    ])
  })

  it('never signs a restored challenge without a new request', () => {
    const { hydratedModel, commandNames } = restoreAndHydrate({
      ...loadedModel,
      signature: SigningChallengeState.make({
        challenge: makeWalletTestChallenge(
          'foldkit-wallet-access-challenge',
          account.accountId,
        ),
      }),
    })

    expect(commandNames).not.toContain('SignChallenge')
    expect(hydratedModel.signature._tag).toBe('IdleSignature')
  })
})

describe('Confirm signs only the send the screen shows', () => {
  const enteredModel: Model = {
    ...loadedModel,
    transferAmount: ValidTransferAmount.make({
      value: '0.999995',
      atomicUnits: request.atomicUnits,
    }),
    transferRecipient: ValidTransferRecipient.make({
      recipient: preview.transfer.recipient,
    }),
    transaction: PreviewedTransaction.make({ preview }),
  }

  it('signs the preview of the entered amount and recipient', () => {
    const [sendingModel, commands] = update(
      enteredModel,
      RequestedSignedTransactionSubmission.make({
        previewId: preview.previewId,
      }),
    )

    expect(sendingModel.transaction._tag).toBe('SubmittingTransaction')
    expect(commands.map(command => command.name)).toEqual([
      'SignAndSubmitTransaction',
    ])
  })

  it('refuses a preview whose amount is not the entered amount', () => {
    const [refusedModel, commands] = update(
      {
        ...enteredModel,
        transferAmount: ValidTransferAmount.make({
          value: '0.001',
          atomicUnits: '1000000',
        }),
      },
      RequestedSignedTransactionSubmission.make({
        previewId: preview.previewId,
      }),
    )

    expect(commands).toHaveLength(0)
    expect(refusedModel.transaction).toMatchObject({
      _tag: 'FailedTransactionPreview',
      failure: {
        maybeGuidance: Option.some({
          summary:
            'This preview is not what you entered, so nothing was signed.',
          details: ['Preview the send again.'],
        }),
      },
    })
  })

  it('refuses a preview whose recipient is not the entered recipient', () => {
    const [, commands] = update(
      {
        ...enteredModel,
        transferRecipient: ValidTransferRecipient.make({
          recipient: ValidatedRecipient.make({
            networkId: network.networkId,
            address: account.address,
            normalizedAddress: account.address,
            displayAddress: account.address,
          }),
        }),
      },
      RequestedSignedTransactionSubmission.make({
        previewId: preview.previewId,
      }),
    )

    expect(commands).toHaveLength(0)
  })

  it('refuses a preview from another network than the one selected', () => {
    const [, commands] = update(
      {
        ...enteredModel,
        maybeSendNetworkSelection: Option.some(
          SendNetworkSelection.make({
            networkMode: 'Devnet',
            chainId: chain.chainId,
            networkId: 'solana:devnet',
            accountId: 'wallet-1:solana:devnet',
            assetId: 'solana:devnet:sol',
          }),
        ),
      },
      RequestedSignedTransactionSubmission.make({
        previewId: preview.previewId,
      }),
    )

    expect(commands).toHaveLength(0)
  })
})
