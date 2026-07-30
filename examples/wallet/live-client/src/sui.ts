import {
  Array,
  Effect,
  Option,
  Order,
  Redacted,
  Schema as S,
  Schedule,
  Stream,
} from 'effect'
import {
  AccountBalance,
  AssetAmount,
  AtomicUnits,
  BlockExplorerConfirmation,
  ReceivingInstruction,
  RejectedTransfer,
  TestFundingReceipt,
  type TestFundingRequest,
  TransactionHistoryPage,
  TransactionHistoryQuery,
  TransactionQuote,
  TransactionRecord,
  TransactionSubmission,
  TransferGuidance,
  ValidatedRecipient,
  type ValidatedTransfer,
  ValidatedTransfer as ValidatedTransferSchema,
  WalletClientError,
  makeTransactionPayload,
  maximumTransactionHistoryPageSize,
} from 'wallet-core-example'

import type { SuiClientTypes } from '@mysten/sui/client'
import { requestSuiFromFaucetV2 } from '@mysten/sui/faucet'
import { SuiGrpcClient } from '@mysten/sui/grpc'
import { Transaction } from '@mysten/sui/transactions'
import {
  isValidSuiAddress,
  normalizeStructTag,
  normalizeSuiAddress,
} from '@mysten/sui/utils'
import { base64 } from '@scure/base'

import type { LiveNetworkAccount, LiveNetworkAdapter } from './adapter.js'
import type { SuiLiveNetwork } from './catalog.js'

/** Protected Sui transaction bytes passed from networking to custody. */
export const SuiPreparedPayload = S.Struct({
  previewId: S.String,
  transactionBytesBase64: S.String,
})
/** Protected Sui transaction bytes passed from networking to custody. */
export type SuiPreparedPayload = typeof SuiPreparedPayload.Type
/** JSON encoding for protected Sui transaction bytes. */
export const SuiPreparedPayloadJson = S.fromJsonString(SuiPreparedPayload)

/** Protected signed Sui transaction returned by custody. */
export const SuiSignedPayload = S.Struct({
  previewId: S.String,
  transactionBytesBase64: S.String,
  signature: S.String,
})
/** Protected signed Sui transaction returned by custody. */
export type SuiSignedPayload = typeof SuiSignedPayload.Type
/** JSON encoding for a protected signed Sui transaction. */
export const SuiSignedPayloadJson = S.fromJsonString(SuiSignedPayload)

const SuiGraphQlAddress = S.Struct({ address: S.String })
const SuiGraphQlCoinType = S.Struct({ repr: S.String })
const SuiGraphQlBalanceChange = S.Struct({
  amount: S.String,
  coinType: S.NullOr(SuiGraphQlCoinType),
  owner: S.NullOr(SuiGraphQlAddress),
})
const SuiGraphQlTransaction = S.Struct({
  digest: S.String,
  sender: S.NullOr(SuiGraphQlAddress),
  effects: S.NullOr(
    S.Struct({
      timestamp: S.NullOr(S.String),
      status: S.NullOr(S.Literals(['SUCCESS', 'FAILURE'])),
      balanceChanges: S.NullOr(
        S.Struct({
          pageInfo: S.Struct({ hasNextPage: S.Boolean }),
          nodes: S.Array(SuiGraphQlBalanceChange),
        }),
      ),
    }),
  ),
})
const SuiGraphQlHistoryResponse = S.Struct({
  data: S.optional(
    S.NullOr(
      S.Struct({
        transactions: S.NullOr(
          S.Struct({
            pageInfo: S.Struct({
              hasPreviousPage: S.Boolean,
              startCursor: S.NullOr(S.String),
            }),
            nodes: S.Array(SuiGraphQlTransaction),
          }),
        ),
      }),
    ),
  ),
  errors: S.optional(S.Array(S.Unknown)),
})

const historyQuery = `
  query WalletSuiHistory(
    $address: SuiAddress!
    $last: Int!
    $before: String
  ) {
    transactions(
      last: $last
      before: $before
      filter: { affectedAddress: $address }
    ) {
      pageInfo {
        hasPreviousPage
        startCursor
      }
      nodes {
        digest
        sender {
          address
        }
        effects {
          timestamp
          status
          balanceChanges(first: 50) {
            pageInfo {
              hasNextPage
            }
            nodes {
              amount
              coinType {
                repr
              }
              owner {
                address
              }
            }
          }
        }
      }
    }
  }
`

type SuiBalanceChangeFacts = Readonly<{
  address: string
  coinType: string
  amount: bigint
}>

type SuiTransactionFacts = Readonly<{
  digest: string
  sender: string
  status: 'Confirmed' | 'Failed'
  observedAt: number
  balanceChanges: ReadonlyArray<SuiBalanceChangeFacts>
}>

type PendingFundingReceipt = Readonly<{
  request: TestFundingRequest
  receipt: Promise<typeof TestFundingReceipt.Type>
}>

const quoteLifetimeMilliseconds = 60_000
const observationInterval = '2 seconds'
const maximumObservedTransactionStates = 1_024
const maximumFundingReceipts = 256
const suiCoinType = normalizeStructTag('0x2::sui::SUI')

const unavailable = () => new WalletClientError({ code: 'Unavailable' })
const invalidResponse = () => new WalletClientError({ code: 'InvalidResponse' })
const rejected = () => new WalletClientError({ code: 'Rejected' })
const unsupported = () =>
  new WalletClientError({ code: 'UnsupportedCapability' })

const clientError = (error: unknown): WalletClientError =>
  error instanceof WalletClientError ? error : unavailable()

const assetAmount = (
  configuration: SuiLiveNetwork,
  atomicUnits: bigint,
  observedAt: number,
): AssetAmount =>
  AssetAmount.make({
    assetId: configuration.asset.assetId,
    atomicUnits: S.decodeUnknownSync(AtomicUnits)(atomicUnits.toString()),
    observedAt,
  })

const sdkNetwork = (
  configuration: SuiLiveNetwork,
): 'devnet' | 'testnet' | 'mainnet' => {
  if (configuration.suiNetwork === 'Devnet') {
    return 'devnet'
  } else if (configuration.suiNetwork === 'Testnet') {
    return 'testnet'
  } else {
    return 'mainnet'
  }
}

const isExactAccount = (
  configuration: SuiLiveNetwork,
  account: LiveNetworkAccount,
): boolean =>
  account.configuration._tag === 'SuiLiveNetwork' &&
  account.configuration.chain.chainId === configuration.chain.chainId &&
  account.configuration.network.networkId === configuration.network.networkId &&
  account.configuration.asset.assetId === configuration.asset.assetId &&
  account.profile.accountId === account.account.accountId &&
  account.profile.chainId === account.account.chainId &&
  account.profile.networkId === account.account.networkId &&
  account.profile.address === account.account.address &&
  account.account.chainId === configuration.chain.chainId &&
  account.account.networkId === configuration.network.networkId &&
  isValidSuiAddress(account.account.address)

const isExactTransfer = (
  configuration: SuiLiveNetwork,
  account: LiveNetworkAccount,
  transfer: ValidatedTransfer,
): boolean =>
  isExactAccount(configuration, account) &&
  transfer.request.accountId === account.account.accountId &&
  transfer.request.assetId === configuration.asset.assetId &&
  transfer.recipient.networkId === configuration.network.networkId &&
  isValidSuiAddress(transfer.recipient.address) &&
  normalizeSuiAddress(transfer.recipient.address) ===
    transfer.recipient.normalizedAddress

const makeTransferTransaction = (
  sourceAddress: string,
  destinationAddress: string,
  atomicUnits: bigint,
): Transaction => {
  const transaction = new Transaction()
  transaction.setSender(sourceAddress)
  const [coin] = transaction.splitCoins(transaction.gas, [atomicUnits])
  transaction.transferObjects([coin], destinationAddress)
  return transaction
}

const gasFee = (effects: SuiClientTypes.TransactionEffects): bigint =>
  BigInt(effects.gasUsed.computationCost) +
  BigInt(effects.gasUsed.storageCost) -
  BigInt(effects.gasUsed.storageRebate)

const isSuiCoinType = (coinType: string): boolean => {
  try {
    return normalizeStructTag(coinType) === suiCoinType
  } catch {
    return false
  }
}

const normalizedBalanceChanges = (
  balanceChanges: ReadonlyArray<SuiBalanceChangeFacts>,
): ReadonlyArray<SuiBalanceChangeFacts> =>
  Array.getSomes(
    Array.map(balanceChanges, change => {
      if (
        !isSuiCoinType(change.coinType) ||
        !isValidSuiAddress(change.address)
      ) {
        return Option.none()
      }
      return Option.some({
        address: normalizeSuiAddress(change.address),
        coinType: suiCoinType,
        amount: change.amount,
      })
    }),
  )

const recordsForTransaction = (
  configuration: SuiLiveNetwork,
  account: LiveNetworkAccount,
  transaction: SuiTransactionFacts,
): ReadonlyArray<TransactionRecord> => {
  if (
    !isValidSuiAddress(transaction.sender) ||
    !Number.isFinite(transaction.observedAt)
  ) {
    return []
  }
  const accountAddress = normalizeSuiAddress(account.account.address)
  const senderAddress = normalizeSuiAddress(transaction.sender)
  const balanceChanges = normalizedBalanceChanges(transaction.balanceChanges)
  const accountAmount = Array.reduce(
    Array.filter(balanceChanges, change => change.address === accountAddress),
    0n,
    (total, change) => total + change.amount,
  )
  if (accountAmount > 0n && senderAddress !== accountAddress) {
    return [
      TransactionRecord.make({
        recordId: `${transaction.digest}:${account.account.accountId}:sui:incoming`,
        transactionId: transaction.digest,
        accountId: account.account.accountId,
        networkId: configuration.network.networkId,
        direction: 'Incoming',
        status: transaction.status,
        amount: assetAmount(
          configuration,
          accountAmount,
          transaction.observedAt,
        ),
        counterpartyAddress: senderAddress,
        normalizedCounterpartyAddress: senderAddress,
        observedAt: transaction.observedAt,
      }),
    ]
  }
  if (senderAddress !== accountAddress) {
    return []
  }
  const externalCredits = Array.filter(
    balanceChanges,
    change => change.address !== accountAddress && change.amount > 0n,
  )
  return Array.map(externalCredits, (change, changeIndex) =>
    TransactionRecord.make({
      recordId: `${transaction.digest}:${account.account.accountId}:sui:${changeIndex.toString()}`,
      transactionId: transaction.digest,
      accountId: account.account.accountId,
      networkId: configuration.network.networkId,
      direction: 'Outgoing',
      status: transaction.status,
      amount: assetAmount(configuration, change.amount, transaction.observedAt),
      counterpartyAddress: change.address,
      normalizedCounterpartyAddress: change.address,
      observedAt: transaction.observedAt,
    }),
  )
}

const recordsForGraphQlTransaction = (
  configuration: SuiLiveNetwork,
  account: LiveNetworkAccount,
  transaction: typeof SuiGraphQlTransaction.Type,
): ReadonlyArray<TransactionRecord> => {
  if (
    transaction.sender === null ||
    transaction.effects === null ||
    transaction.effects.timestamp === null ||
    transaction.effects.status === null ||
    transaction.effects.balanceChanges === null ||
    transaction.effects.balanceChanges.pageInfo.hasNextPage
  ) {
    return []
  }
  const observedAt = Date.parse(transaction.effects.timestamp)
  const balanceChanges = Array.getSomes(
    Array.map(transaction.effects.balanceChanges.nodes, change => {
      if (change.coinType === null || change.owner === null) {
        return Option.none()
      }
      try {
        return Option.some({
          address: change.owner.address,
          coinType: change.coinType.repr,
          amount: BigInt(change.amount),
        })
      } catch {
        return Option.none()
      }
    }),
  )
  return recordsForTransaction(configuration, account, {
    digest: transaction.digest,
    sender: transaction.sender.address,
    status: transaction.effects.status === 'SUCCESS' ? 'Confirmed' : 'Failed',
    observedAt,
    balanceChanges,
  })
}

const hasSameFundingRequest = (
  left: TestFundingRequest,
  right: TestFundingRequest,
): boolean =>
  left.requestId === right.requestId &&
  left.accountId === right.accountId &&
  left.chainId === right.chainId &&
  left.networkId === right.networkId &&
  left.environment === right.environment &&
  left.assetId === right.assetId &&
  left.atomicUnits === right.atomicUnits

/** Builds one real Sui network adapter. */
export const makeSuiLiveAdapter = (
  configuration: SuiLiveNetwork,
): LiveNetworkAdapter => {
  const client = new SuiGrpcClient({
    network: sdkNetwork(configuration),
    baseUrl: configuration.grpcUrl,
  })
  const pendingFundingReceipts = new Map<string, PendingFundingReceipt>()

  const adapter: LiveNetworkAdapter = {
    configuration,
    loadBalance: account => {
      if (!isExactAccount(configuration, account)) {
        return Effect.fail(invalidResponse())
      }
      return Effect.tryPromise({
        try: async () => {
          const observedAt = Date.now()
          const response = await client.getBalance({
            owner: normalizeSuiAddress(account.account.address),
          })
          return AccountBalance.make({
            accountId: account.account.accountId,
            amount: assetAmount(
              configuration,
              BigInt(response.balance.balance),
              observedAt,
            ),
          })
        },
        catch: clientError,
      })
    },
    receivingInstruction: account =>
      ReceivingInstruction.make({
        accountId: account.account.accountId,
        assetId: configuration.asset.assetId,
        destinationAddress: normalizeSuiAddress(account.account.address),
        maybeMemo: Option.none(),
        portableUri: `sui:${normalizeSuiAddress(account.account.address)}?network=${encodeURIComponent(configuration.network.networkId)}`,
      }),
    validateTransfer: (account, request) => {
      if (
        !isExactAccount(configuration, account) ||
        request.accountId !== account.account.accountId ||
        request.assetId !== configuration.asset.assetId
      ) {
        return Effect.fail(invalidResponse())
      }
      if (!isValidSuiAddress(request.destinationAddress)) {
        return Effect.succeed(
          RejectedTransfer.make({
            request,
            guidance: TransferGuidance.make({
              summary: 'Enter a valid Sui address.',
              details: [
                'Sui addresses contain 32 bytes encoded as hexadecimal.',
              ],
            }),
          }),
        )
      }
      const destinationAddress = normalizeSuiAddress(request.destinationAddress)
      return Effect.succeed(
        ValidatedTransferSchema.make({
          request,
          recipient: ValidatedRecipient.make({
            networkId: configuration.network.networkId,
            address: destinationAddress,
            normalizedAddress: destinationAddress,
            displayAddress: destinationAddress,
          }),
        }),
      )
    },
    previewTransfer: (account, transfer) => {
      if (!isExactTransfer(configuration, account, transfer)) {
        return Effect.fail(invalidResponse())
      }
      const atomicUnits = BigInt(transfer.request.atomicUnits)
      if (atomicUnits <= 0n) {
        return Effect.fail(rejected())
      }
      return Effect.tryPromise({
        try: async () => {
          const observedAt = Date.now()
          const transaction = makeTransferTransaction(
            normalizeSuiAddress(account.account.address),
            transfer.recipient.address,
            atomicUnits,
          )
          const [balanceResponse, simulation] = await Promise.all([
            client.getBalance({ owner: account.account.address }),
            client.simulateTransaction({
              transaction,
              include: { effects: true },
            }),
          ])
          if (
            simulation.$kind !== 'Transaction' ||
            simulation.Transaction.effects === undefined
          ) {
            throw rejected()
          }
          const fee = gasFee(simulation.Transaction.effects)
          const resultingBalance =
            BigInt(balanceResponse.balance.balance) - atomicUnits - fee
          if (resultingBalance < 0n) {
            throw rejected()
          }
          return TransactionQuote.make({
            quoteId: `${transfer.request.transferId}:${observedAt.toString()}`,
            estimatedFee: assetAmount(configuration, fee, observedAt),
            resultingBalance: assetAmount(
              configuration,
              resultingBalance,
              observedAt,
            ),
            expiresAt: observedAt + quoteLifetimeMilliseconds,
          })
        },
        catch: clientError,
      })
    },
    buildTransferPayload: (account, preview) => {
      if (
        !isExactTransfer(configuration, account, preview.transfer) ||
        preview.expiresAt < Date.now()
      ) {
        return Effect.fail(rejected())
      }
      return Effect.tryPromise({
        try: async () => {
          const atomicUnits = BigInt(preview.transfer.request.atomicUnits)
          if (atomicUnits <= 0n) {
            throw rejected()
          }
          const transaction = makeTransferTransaction(
            normalizeSuiAddress(account.account.address),
            preview.transfer.recipient.address,
            atomicUnits,
          )
          const transactionBytes = await transaction.build({ client })
          const payload = SuiPreparedPayload.make({
            previewId: preview.previewId,
            transactionBytesBase64: base64.encode(transactionBytes),
          })
          return makeTransactionPayload(
            account.account.accountId,
            configuration.network.networkId,
            S.encodeSync(SuiPreparedPayloadJson)(payload),
          )
        },
        catch: clientError,
      })
    },
    submitTransaction: (account, transaction) => {
      if (
        !isExactAccount(configuration, account) ||
        transaction.accountId !== account.account.accountId ||
        transaction.networkId !== configuration.network.networkId
      ) {
        return Effect.fail(invalidResponse())
      }
      return S.decodeUnknownEffect(SuiSignedPayloadJson)(
        Redacted.value(transaction.payload),
      ).pipe(
        Effect.mapError(invalidResponse),
        Effect.flatMap(payload =>
          Effect.tryPromise({
            try: async () => {
              const transactionBytes = base64.decode(
                payload.transactionBytesBase64,
              )
              const transactionData =
                Transaction.from(transactionBytes).getData()
              if (
                transactionData.sender === undefined ||
                transactionData.sender === null ||
                normalizeSuiAddress(transactionData.sender) !==
                  normalizeSuiAddress(account.account.address)
              ) {
                throw invalidResponse()
              }
              const response = await client.executeTransaction({
                transaction: transactionBytes,
                signatures: [payload.signature],
              })
              const submittedTransaction =
                response.$kind === 'Transaction'
                  ? response.Transaction
                  : response.FailedTransaction
              return TransactionSubmission.make({
                previewId: payload.previewId,
                transactionId: submittedTransaction.digest,
                submittedAt: Date.now(),
                maybeExplorerConfirmation: Option.some(
                  BlockExplorerConfirmation.make({
                    label: configuration.network.displayName,
                    transactionId: submittedTransaction.digest,
                    url: `${configuration.explorerTransactionBaseUrl}${submittedTransaction.digest}`,
                  }),
                ),
              })
            },
            catch: clientError,
          }),
        ),
      )
    },
    loadTransactionHistory: (account, query) => {
      if (
        !isExactAccount(configuration, account) ||
        query.accountId !== account.account.accountId ||
        query.networkId !== configuration.network.networkId ||
        query.limit <= 0 ||
        query.limit > maximumTransactionHistoryPageSize
      ) {
        return Effect.fail(invalidResponse())
      }
      return Effect.tryPromise({
        try: async () => {
          const response = await fetch(configuration.graphQlUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              query: historyQuery,
              variables: {
                address: normalizeSuiAddress(account.account.address),
                last: query.limit,
                before: Option.getOrNull(query.maybeCursor),
              },
            }),
          })
          if (!response.ok) {
            throw unavailable()
          }
          let page: typeof SuiGraphQlHistoryResponse.Type
          try {
            page = S.decodeUnknownSync(SuiGraphQlHistoryResponse)(
              await response.json(),
            )
          } catch {
            throw invalidResponse()
          }
          if (
            page.data === undefined ||
            page.data === null ||
            page.data.transactions === null ||
            (page.errors !== undefined &&
              Array.isReadonlyArrayNonEmpty(page.errors))
          ) {
            throw invalidResponse()
          }
          const transactions = page.data.transactions
          const unsortedRecords: ReadonlyArray<TransactionRecord> =
            Array.flatMap(
              transactions.nodes,
              (transaction): ReadonlyArray<TransactionRecord> =>
                recordsForGraphQlTransaction(
                  configuration,
                  account,
                  transaction,
                ),
            )
          const records = Array.sortWith(
            unsortedRecords,
            record => record.observedAt,
            Order.flip(Order.Number),
          )
          return TransactionHistoryPage.make({
            records,
            maybeNextCursor:
              transactions.pageInfo.hasPreviousPage &&
              transactions.pageInfo.startCursor !== null
                ? Option.some(transactions.pageInfo.startCursor)
                : Option.none(),
          })
        },
        catch: clientError,
      })
    },
    observeTransactions: account => {
      if (!isExactAccount(configuration, account)) {
        return Stream.fail(invalidResponse())
      }
      const query = TransactionHistoryQuery.make({
        accountId: account.account.accountId,
        networkId: configuration.network.networkId,
        maybeCursor: Option.none(),
        limit: 50,
      })
      const seenObservationIds = new Set<string>()
      return Stream.fromEffectSchedule(
        adapter.loadTransactionHistory(account, query),
        Schedule.spaced(observationInterval),
      ).pipe(
        Stream.flatMap(page => Stream.fromIterable(page.records)),
        Stream.filter(record => {
          const observationId = record.recordId + ':' + record.status
          if (seenObservationIds.has(observationId)) {
            return false
          }
          seenObservationIds.add(observationId)
          if (seenObservationIds.size > maximumObservedTransactionStates) {
            const oldestObservationId = seenObservationIds.values().next()
            if (!oldestObservationId.done) {
              seenObservationIds.delete(oldestObservationId.value)
            }
          }
          return true
        }),
      )
    },
    requestTestFunding: (account, request) => {
      if (
        !isExactAccount(configuration, account) ||
        request.accountId !== account.account.accountId ||
        request.chainId !== configuration.chain.chainId ||
        request.networkId !== configuration.network.networkId ||
        request.assetId !== configuration.asset.assetId
      ) {
        return Effect.fail(invalidResponse())
      }
      if (configuration.network.environment === 'Mainnet') {
        return Effect.fail(unsupported())
      }
      if (
        request.environment !== configuration.network.environment ||
        Option.isNone(configuration.maybeFaucetUrl)
      ) {
        return Effect.fail(invalidResponse())
      }
      const faucetUrl = configuration.maybeFaucetUrl.value
      if (BigInt(request.atomicUnits) <= 0n) {
        return Effect.fail(rejected())
      }
      return Effect.tryPromise({
        try: async () => {
          const pendingRequest = pendingFundingReceipts.get(request.requestId)
          if (pendingRequest !== undefined) {
            if (!hasSameFundingRequest(pendingRequest.request, request)) {
              throw invalidResponse()
            }
            return pendingRequest.receipt
          }
          const receipt = (async () => {
            const response = await requestSuiFromFaucetV2({
              host: faucetUrl,
              recipient: normalizeSuiAddress(account.account.address),
            })
            if (
              response.coins_sent === null ||
              Array.isReadonlyArrayEmpty(response.coins_sent)
            ) {
              throw invalidResponse()
            }
            const amounts = Array.map(response.coins_sent, coin => {
              if (!Number.isSafeInteger(coin.amount) || coin.amount <= 0) {
                throw invalidResponse()
              }
              return BigInt(coin.amount)
            })
            const receivedAmount = Array.reduce(
              amounts,
              0n,
              (total, amount) => total + amount,
            )
            const maybeFirstCoin = Array.head(response.coins_sent)
            if (Option.isNone(maybeFirstCoin)) {
              throw invalidResponse()
            }
            const transactionId = maybeFirstCoin.value.transferTxDigest
            const hasOneTransaction = Array.every(
              response.coins_sent,
              coin => coin.transferTxDigest === transactionId,
            )
            const coinIds = Array.map(response.coins_sent, coin => coin.id)
            const acceptedAt = Date.now()
            return TestFundingReceipt.make({
              requestId: request.requestId,
              fundingId: hasOneTransaction ? transactionId : coinIds.join(':'),
              acceptedAt,
              amount: assetAmount(configuration, receivedAmount, acceptedAt),
              maybeTransactionId: hasOneTransaction
                ? Option.some(transactionId)
                : Option.none(),
            })
          })()
          pendingFundingReceipts.set(request.requestId, {
            request,
            receipt,
          })
          if (pendingFundingReceipts.size > maximumFundingReceipts) {
            const oldestRequestId = pendingFundingReceipts.keys().next()
            if (!oldestRequestId.done) {
              pendingFundingReceipts.delete(oldestRequestId.value)
            }
          }
          try {
            return await receipt
          } catch (error) {
            pendingFundingReceipts.delete(request.requestId)
            throw error
          }
        },
        catch: clientError,
      })
    },
  }
  return adapter
}
