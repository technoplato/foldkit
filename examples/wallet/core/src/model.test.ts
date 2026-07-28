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
  PortfolioSnapshot,
  TransactionQuote,
  TransactionRecord,
  TransferRequest,
  UnfamiliarAddress,
  ValidatedRecipient,
  ValidatedTransfer,
  isPortfolioSnapshotConsistent,
  mergeTransactionRecords,
  transactionPreviewFromQuote,
} from './model.js'

const chain = ChainDescriptor.make({
  chainId: 'ethereum',
  displayName: 'Ethereum',
})
const network = NetworkDescriptor.make({
  networkId: 'ethereum:sepolia',
  chainId: chain.chainId,
  displayName: 'Sepolia',
  environment: 'Testnet',
  capabilities: ['Transfer', 'TransactionObservation'],
})
const asset = AssetDescriptor.make({
  assetId: 'ethereum:sepolia:eth',
  networkId: network.networkId,
  displayName: 'Sepolia ETH',
  symbol: 'ETH',
  decimalPlaces: 18,
  kind: NativeAsset.make({}),
})
const account = {
  accountId: 'account-1',
  networkId: network.networkId,
  address: '0xaccount',
  displayName: 'Account',
}
const amount = AssetAmount.make({
  assetId: asset.assetId,
  atomicUnits: '1000',
  observedAt: 1,
})
const portfolio = PortfolioSnapshot.make({
  dataSource: 'Fixture',
  chains: [chain],
  networks: [network],
  assets: [asset],
  accounts: [account],
  balanceSnapshot: BalanceSnapshot.make({
    observedAt: 1,
    balances: [AccountBalance.make({ accountId: account.accountId, amount })],
  }),
  receivingInstructions: [],
})

describe('normalized wallet model', () => {
  it('checks catalog relationships without knowing a chain tag', () => {
    expect(isPortfolioSnapshotConsistent(portfolio)).toBe(true)
    expect(
      isPortfolioSnapshotConsistent({
        ...portfolio,
        accounts: [{ ...account, networkId: 'unknown' }],
      }),
    ).toBe(false)
  })

  it('builds a generic preview from an adapter quote', () => {
    const request = TransferRequest.make({
      transferId: 'transfer-1',
      accountId: account.accountId,
      assetId: asset.assetId,
      destinationAddress: '0xdestination',
      atomicUnits: '100',
      maybeMessage: Option.none(),
    })
    const transfer = ValidatedTransfer.make({
      request,
      recipient: ValidatedRecipient.make({
        networkId: network.networkId,
        address: request.destinationAddress,
        normalizedAddress: request.destinationAddress,
        displayAddress: request.destinationAddress,
      }),
    })
    const maybePreview = transactionPreviewFromQuote(
      portfolio,
      transfer,
      TransactionQuote.make({
        quoteId: 'quote-1',
        estimatedFee: { ...amount, atomicUnits: '1' },
        resultingBalance: { ...amount, atomicUnits: '900' },
        expiresAt: 10,
      }),
      UnfamiliarAddress.make({}),
      FirstTransactionWithRecipient.make({}),
    )

    expect(Option.isSome(maybePreview)).toBe(true)
  })

  it('merges history and observation by stable record identity', () => {
    const record = TransactionRecord.make({
      recordId: 'record-1',
      transactionId: 'transaction-1',
      accountId: account.accountId,
      networkId: network.networkId,
      direction: 'Outgoing',
      status: 'Pending',
      amount,
      counterpartyAddress: '0xdestination',
      normalizedCounterpartyAddress: '0xdestination',
      observedAt: 1,
    })
    const records = mergeTransactionRecords(
      [record],
      [{ ...record, status: 'Confirmed', observedAt: 2 }],
    )

    expect(records).toEqual([{ ...record, status: 'Confirmed', observedAt: 2 }])
  })
})
