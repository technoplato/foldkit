import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  AdapterTestFundingMethod,
  AssetAmount,
  AssetDescriptor,
  ChainDescriptor,
  ExternalTestFundingMethod,
  NativeAsset,
  NetworkDescriptor,
} from './currency.js'
import { BlockExplorerConfirmation } from './explorer.js'
import {
  AccountBalance,
  BalanceSnapshot,
  FirstTransactionWithRecipient,
  NetworkFailure,
  PortfolioSnapshot,
  TransactionQuote,
  TransactionRecord,
  TransactionSubmission,
  TransferRequest,
  UnfamiliarAddress,
  ValidatedRecipient,
  ValidatedTransfer,
  isPortfolioSnapshotConsistent,
  isTransactionSubmissionConsistent,
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
  chainId: chain.chainId,
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
        chains: [chain, chain],
      }),
    ).toBe(false)
    expect(
      isPortfolioSnapshotConsistent({
        ...portfolio,
        networks: [
          {
            ...network,
            capabilities: ['Transfer', 'TransactionObservation', 'Transfer'],
          },
        ],
      }),
    ).toBe(false)
    expect(
      isPortfolioSnapshotConsistent({
        ...portfolio,
        balanceSnapshot: BalanceSnapshot.make({
          ...portfolio.balanceSnapshot,
          balances: [
            ...portfolio.balanceSnapshot.balances,
            ...portfolio.balanceSnapshot.balances,
          ],
        }),
      }),
    ).toBe(false)
    expect(
      isPortfolioSnapshotConsistent({
        ...portfolio,
        accounts: [{ ...account, networkId: 'unknown' }],
      }),
    ).toBe(false)
    expect(
      isPortfolioSnapshotConsistent({
        ...portfolio,
        networks: [
          {
            ...network,
            capabilities: ['Transfer', 'TestFunding'],
          },
        ],
      }),
    ).toBe(false)
    expect(
      isPortfolioSnapshotConsistent({
        ...portfolio,
        networks: [
          {
            ...network,
            capabilities: ['Transfer', 'TestFunding'],
            testFundingMethod: AdapterTestFundingMethod.make({}),
          },
        ],
      }),
    ).toBe(true)
    expect(
      isPortfolioSnapshotConsistent({
        ...portfolio,
        networks: [
          {
            ...network,
            capabilities: ['Transfer', 'ExternalTestFunding'],
            testFundingMethod: ExternalTestFundingMethod.make({
              providerName: 'Unsafe Faucet',
              providerUrl: 'javascript:alert(1)',
            }),
          },
        ],
      }),
    ).toBe(false)
    expect(
      isPortfolioSnapshotConsistent({
        ...portfolio,
        networks: [
          {
            ...network,
            capabilities: ['Transfer', 'ExternalTestFunding'],
            testFundingMethod: ExternalTestFundingMethod.make({
              providerName: 'Faucet',
              providerUrl: 'https://example.com/faucet',
            }),
          },
        ],
      }),
    ).toBe(true)
    expect(
      isPortfolioSnapshotConsistent({
        ...portfolio,
        networks: [
          {
            ...network,
            environment: 'Mainnet',
            capabilities: ['Transfer', 'TestFunding'],
          },
        ],
      }),
    ).toBe(false)
    expect(
      isPortfolioSnapshotConsistent({
        ...portfolio,
        balanceSnapshot: BalanceSnapshot.make({
          observedAt: 2,
          balances: [],
          unavailableAccountIds: [account.accountId],
        }),
      }),
    ).toBe(true)
    expect(
      isPortfolioSnapshotConsistent({
        ...portfolio,
        balanceSnapshot: BalanceSnapshot.make({
          observedAt: 2,
          balances: portfolio.balanceSnapshot.balances,
          unavailableAccountIds: [account.accountId],
        }),
      }),
    ).toBe(false)
    expect(
      isPortfolioSnapshotConsistent({
        ...portfolio,
        balanceSnapshot: BalanceSnapshot.make({
          observedAt: 2,
          balances: [],
          unavailableAccountIds: ['unknown-account'],
        }),
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

  it('rejects mismatched submissions and unsafe explorer links', () => {
    const request = TransferRequest.make({
      transferId: 'transfer-submission',
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
    const preview = Option.getOrThrow(
      transactionPreviewFromQuote(
        portfolio,
        transfer,
        TransactionQuote.make({
          quoteId: 'quote-submission',
          estimatedFee: { ...amount, atomicUnits: '1' },
          resultingBalance: { ...amount, atomicUnits: '900' },
          expiresAt: 10,
        }),
        UnfamiliarAddress.make({}),
        FirstTransactionWithRecipient.make({}),
      ),
    )
    const submission = TransactionSubmission.make({
      previewId: preview.previewId,
      transactionId: 'transaction-submission',
      submittedAt: 1,
      maybeExplorerConfirmation: Option.some(
        BlockExplorerConfirmation.make({
          label: 'Explorer',
          transactionId: 'transaction-submission',
          url: 'https://example.com/tx/transaction-submission',
        }),
      ),
    })

    expect(isTransactionSubmissionConsistent(preview, submission)).toBe(true)
    expect(
      isTransactionSubmissionConsistent(preview, {
        ...submission,
        previewId: 'quote-mismatch',
      }),
    ).toBe(false)
    expect(
      isTransactionSubmissionConsistent(preview, {
        ...submission,
        maybeExplorerConfirmation: Option.some({
          ...Option.getOrThrow(submission.maybeExplorerConfirmation),
          url: 'javascript:alert(1)',
        }),
      }),
    ).toBe(false)
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
      [
        { ...record, status: 'Confirmed', observedAt: 2 },
        {
          ...record,
          recordId: 'record-2',
          transactionId: 'transaction-2',
          observedAt: 3,
        },
      ],
    )

    expect(Array.map(records, current => current.recordId)).toEqual([
      'record-2',
      'record-1',
    ])
    expect(
      Array.findFirst(records, current => current.recordId === 'record-1'),
    ).toEqual(Option.some({ ...record, status: 'Confirmed', observedAt: 2 }))

    const settledRecord = TransactionRecord.make({
      ...record,
      status: 'Confirmed',
      observedAt: 2,
    })
    const optimisticRecord = {
      ...record,
      recordId: 'optimistic-record',
      observedAt: 3,
    }
    expect(
      mergeTransactionRecords([settledRecord], [optimisticRecord]),
    ).toEqual([settledRecord])
    expect(
      mergeTransactionRecords([optimisticRecord], [settledRecord]),
    ).toEqual([settledRecord])

    const secondOutput = TransactionRecord.make({
      ...settledRecord,
      recordId: 'record-second-output',
      amount: { ...settledRecord.amount, atomicUnits: '2000' },
      counterpartyAddress: '0xsecond-destination',
      normalizedCounterpartyAddress: '0xsecond-destination',
    })
    expect(
      mergeTransactionRecords([settledRecord], [secondOutput]),
    ).toHaveLength(2)
  })

  it('decodes a network failure without adapter guidance', () => {
    const failure = S.decodeUnknownSync(NetworkFailure)({
      _tag: 'NetworkFailure',
      operation: 'SubmitTransaction',
      code: 'Unavailable',
    })

    expect(failure.code).toBe('Unavailable')
    expect(Option.isNone(failure.maybeGuidance)).toBe(true)
  })
})
