import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Wallet from 'wallet-core-example'

import { snapshotLogMessageWire } from '@foldkit/instant/snapshot-log'

import {
  ChangedWalletActivity,
  CompletedReportSentTransaction,
  FailedWalletActivity,
  GotWalletMessage,
  Message,
  ReceivedWalletActivity,
} from './message.js'
import {
  ClosedWallet,
  LoadedWalletActivity,
  type Model,
  OpenWallet,
  UnavailableWalletActivity,
  initialModel,
} from './model.js'
import type { WalletActivityEntry } from './page.js'
import { update } from './update.js'
import {
  activityInMode,
  publicAccountsOf,
  sentTransactionOf,
  sentTransactionPathOf,
  walletActivityAmountLabel,
  walletActivityNetworkLabel,
} from './walletActivity.js'
import { MessageWire } from './wire.js'

const entry = (
  fields: Partial<typeof WalletActivityEntry.Type> = {},
): typeof WalletActivityEntry.Type => ({
  transactionId: '5hSignature',
  networkId: 'solana:devnet',
  direction: 'Incoming',
  status: 'Confirmed',
  maybeFinality: Option.some('Included'),
  assetId: 'solana:devnet:sol',
  amountAtomic: '500000000',
  maybeCounterpartyAddress: Option.some('Sender1111'),
  observedAtMs: 1_793_490_000_000,
  maybeFailure: Option.none(),
  ...fields,
})

const profile = (
  walletId: string,
  accounts: ReadonlyArray<
    Readonly<{ networkId: string; chainId: string; address: string }>
  >,
) =>
  Wallet.WalletProfile.make({
    walletId,
    displayName: walletId,
    createdAt: 1,
    accounts: Array.map(accounts, account => ({
      ...account,
      accountId: `${walletId}:${account.networkId}`,
      displayName: account.networkId,
    })),
  })

const devnetSolana = {
  networkId: 'solana:devnet',
  chainId: 'solana',
  address: 'DevnetAddress',
}
const sepolia = {
  networkId: 'ethereum:sepolia',
  chainId: 'ethereum',
  address: '0xSepolia',
}
const mainnetSolana = {
  networkId: 'solana:mainnet-beta',
  chainId: 'solana',
  address: 'MainnetAddress',
}
const testnetSolana = {
  networkId: 'solana:testnet',
  chainId: 'solana',
  address: 'TestnetAddress',
}

const openWallet = (
  wallets: ReadonlyArray<ReturnType<typeof profile>>,
): Model['wallet'] => OpenWallet({ model: { ...Wallet.initialModel, wallets } })

describe('the public accounts a wallet tells the origin', () => {
  it('are none while the wallet is closed', () => {
    expect(publicAccountsOf(ClosedWallet())).toEqual([])
  })

  it("are each address on Brandon dot's four networks, once, and nothing else", () => {
    const accounts = publicAccountsOf(
      openWallet([
        profile('wallet-1', [
          devnetSolana,
          sepolia,
          mainnetSolana,
          testnetSolana,
        ]),
        profile('wallet-2', [devnetSolana]),
      ]),
    )
    expect(accounts).toEqual([
      { networkId: 'solana:devnet', address: 'DevnetAddress' },
      { networkId: 'ethereum:sepolia', address: '0xSepolia' },
      { networkId: 'solana:mainnet-beta', address: 'MainnetAddress' },
    ])
  })
})

describe('the activity on the page', () => {
  const loadedPortfolio = Wallet.LoadedPortfolio.make({
    snapshot: Wallet.PortfolioSnapshot.make({
      dataSource: 'Live',
      chains: [],
      networks: [],
      assets: [],
      accounts: [],
      balanceSnapshot: Wallet.BalanceSnapshot.make({
        observedAt: 1,
        balances: [],
      }),
      receivingInstructions: [],
    }),
  })
  const walletWithBalances: Model['wallet'] = OpenWallet({
    model: {
      ...Wallet.initialModel,
      wallets: [profile('wallet-1', [devnetSolana])],
      portfolio: loadedPortfolio,
    },
  })
  const commandNames = (result: ReturnType<typeof update>) =>
    Array.map(result[1], command => command.name)

  it('reads the origin again when the log says something changed', () => {
    const [model, commands] = update(
      initialModel,
      ChangedWalletActivity({ atMs: 1 }),
    )
    expect(model.walletActivityRevision).toBe(1)
    expect(commands).toEqual([])
  })

  it('takes the first read quietly, since the wallet just read the chain', () => {
    const result = update(
      { ...initialModel, wallet: walletWithBalances },
      ReceivedWalletActivity({ entries: [entry()] }),
    )
    expect(result[0].walletActivity).toEqual(
      LoadedWalletActivity({ entries: [entry()] }),
    )
    expect(commandNames(result)).toEqual([])
  })

  it('moves the balance at once when a new transaction appears', () => {
    const before = {
      ...initialModel,
      wallet: walletWithBalances,
      walletActivity: LoadedWalletActivity({ entries: [entry()] }),
    }
    const result = update(
      before,
      ReceivedWalletActivity({
        entries: [entry({ transactionId: 'incoming' }), entry()],
      }),
    )
    expect(commandNames(result)).toEqual(['RefreshWalletBalances'])
  })

  it('moves the balance at once when a pending send confirms', () => {
    const pending = entry({ status: 'Pending', maybeFinality: Option.none() })
    const result = update(
      {
        ...initialModel,
        wallet: walletWithBalances,
        walletActivity: LoadedWalletActivity({ entries: [pending] }),
      },
      ReceivedWalletActivity({ entries: [entry()] }),
    )
    expect(commandNames(result)).toEqual(['RefreshWalletBalances'])
  })

  it('does nothing more when the same rows come back', () => {
    const result = update(
      {
        ...initialModel,
        wallet: walletWithBalances,
        walletActivity: LoadedWalletActivity({ entries: [entry()] }),
      },
      ReceivedWalletActivity({ entries: [entry()] }),
    )
    expect(commandNames(result)).toEqual([])
  })

  it('keeps the last rows on screen when a read fails', () => {
    const [model] = update(
      {
        ...initialModel,
        walletActivity: LoadedWalletActivity({ entries: [entry()] }),
      },
      FailedWalletActivity(),
    )
    expect(model.walletActivity).toEqual(
      UnavailableWalletActivity({ entries: [entry()] }),
    )
  })
})

describe('an activity row', () => {
  const rows = [
    entry({ transactionId: 'devnet' }),
    entry({
      transactionId: 'sepolia',
      networkId: 'ethereum:sepolia',
      assetId: 'ethereum:sepolia:eth',
    }),
    entry({
      transactionId: 'mainnet',
      networkId: 'solana:mainnet-beta',
      assetId: 'solana:mainnet-beta:sol',
    }),
    entry({
      transactionId: 'ethereum',
      networkId: 'ethereum:mainnet',
      assetId: 'ethereum:mainnet:eth',
    }),
  ]
  const idsIn = (mode: typeof Wallet.WalletNetworkMode.Type) =>
    Array.map(activityInMode(rows, mode), row => row.transactionId)

  it('shows only in the mode of its network, so test money never reads as real', () => {
    expect(idsIn('Devnet')).toEqual(['devnet', 'sepolia'])
    expect(idsIn('Live')).toEqual(['mainnet', 'ethereum'])
    expect(idsIn('Testnet')).toEqual([])
  })

  it('names its amount in its asset, and its network in full', () => {
    expect(walletActivityAmountLabel(entry())).toBe('0.5 SOL')
    expect(
      walletActivityAmountLabel(
        entry({
          networkId: 'ethereum:mainnet',
          assetId: 'ethereum:mainnet:eth',
          amountAtomic: '1500000000000000000',
        }),
      ),
    ).toBe('1.5 ETH')
    expect(
      walletActivityAmountLabel(
        entry({ assetId: 'solana:devnet:UnknownMint' }),
      ),
    ).toBe('500000000 solana:devnet:UnknownMint')
    expect(walletActivityNetworkLabel(entry())).toBe('Solana Devnet')
    expect(
      walletActivityNetworkLabel(entry({ networkId: 'ethereum:mainnet' })),
    ).toBe('Ethereum Mainnet')
  })
})

describe('a send the wallet just broadcast', () => {
  const recipient = 'Recipient1111'
  const preview = Wallet.TransactionPreview.make({
    previewId: 'preview-1',
    transfer: Wallet.ValidatedTransfer.make({
      request: Wallet.TransferRequest.make({
        transferId: 'transfer-1',
        accountId: 'wallet-1:solana:devnet',
        assetId: 'solana:devnet:sol',
        destinationAddress: recipient,
        atomicUnits: '250000000',
        maybeMessage: Option.none(),
      }),
      recipient: Wallet.ValidatedRecipient.make({
        networkId: 'solana:devnet',
        address: recipient,
        normalizedAddress: recipient,
        displayAddress: recipient,
      }),
    }),
    estimatedFee: Wallet.AssetAmount.make({
      assetId: 'solana:devnet:sol',
      atomicUnits: '5000',
      observedAt: 1,
    }),
    resultingBalance: Wallet.AssetAmount.make({
      assetId: 'solana:devnet:sol',
      atomicUnits: '1',
      observedAt: 1,
    }),
    expiresAt: 2,
    recipientFamiliarity: Wallet.UnfamiliarAddress.make({}),
    recipientHistory: Wallet.FirstTransactionWithRecipient.make({}),
  })
  const submission = Wallet.TransactionSubmission.make({
    previewId: 'preview-1',
    transactionId: '5hSent',
    submittedAt: 3,
    maybeExplorerConfirmation: Option.none(),
  })
  const walletModel = (
    transaction: Wallet.Model['transaction'],
    accounts: ReadonlyArray<typeof devnetSolana> = [devnetSolana],
  ): Wallet.Model => ({
    ...Wallet.initialModel,
    wallets: [profile('wallet-1', accounts)],
    transaction,
  })
  const submitted = Wallet.SubmittedTransaction.make({ preview, submission })

  it('names only what its chain shows to anyone', () => {
    expect(sentTransactionOf(walletModel(submitted))).toEqual(
      Option.some({
        networkId: 'solana:devnet',
        senderAddress: 'DevnetAddress',
        transactionId: '5hSent',
        recipientAddress: recipient,
        amountAtomic: '250000000',
      }),
    )
  })

  it('is nothing until the chain has taken it', () => {
    expect(
      sentTransactionOf(
        walletModel(Wallet.SubmittingTransaction.make({ preview })),
      ),
    ).toEqual(Option.none())
  })

  it('is nothing on a network Brandon dot does not follow', () => {
    expect(
      sentTransactionOf(
        walletModel(submitted, [
          { ...testnetSolana, address: 'TestnetAddress' },
        ]),
      ),
    ).toEqual(Option.none())
  })

  it('reaches the origin as a path, so nothing goes in a body', () => {
    expect(
      sentTransactionPathOf({
        networkId: 'solana:devnet',
        senderAddress: 'Sender',
        transactionId: '5hSent',
        recipientAddress: recipient,
        amountAtomic: '250000000',
      }),
    ).toBe(
      `/api/wallet/sent/solana%3Adevnet/Sender/5hSent/${recipient}/250000000`,
    )
  })

  it('is reported the moment the chain takes it, and once', () => {
    const before = {
      ...initialModel,
      wallet: OpenWallet({
        model: walletModel(Wallet.SubmittingTransaction.make({ preview })),
      }),
    }
    const [reported, commands] = update(
      before,
      GotWalletMessage({
        message: Wallet.SucceededSubmitSignedTransaction.make({ submission }),
      }),
    )
    expect(Array.map(commands, command => command.name)).toContain(
      'ReportSentTransaction',
    )
    const [again, moreCommands] = update(
      reported,
      CompletedReportSentTransaction(),
    )
    expect(again).toEqual(reported)
    expect(moreCommands).toEqual([])
  })

  it('stays off the log, as every word of the wallet does', () => {
    const forged = S.encodeSync(snapshotLogMessageWire(Message))(
      CompletedReportSentTransaction(),
    )
    expect(() => S.decodeUnknownSync(MessageWire)(forged)).toThrow()
  })
})

describe('the log', () => {
  it('carries the change notice, with no address, amount or person in it', () => {
    const fact = ChangedWalletActivity({ atMs: 1 })
    const encoded = S.encodeSync(MessageWire)(fact)
    expect(S.decodeUnknownSync(MessageWire)(encoded)).toEqual(fact)
    expect(encoded.tag).toBe('ChangedWalletActivity:{"atMs":1}')
  })

  it("refuses a person's rows someone wrote to the log", () => {
    const forged = S.encodeSync(snapshotLogMessageWire(Message))(
      ReceivedWalletActivity({ entries: [entry()] }),
    )
    expect(() => S.decodeUnknownSync(MessageWire)(forged)).toThrow()
  })
})
