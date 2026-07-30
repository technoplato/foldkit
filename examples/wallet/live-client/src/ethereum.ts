import {
  Array,
  Cause,
  Effect,
  Option,
  Queue,
  Redacted,
  Schema as S,
  Stream,
} from 'effect'
import {
  type Transaction as EthereumRpcTransaction,
  createPublicClient,
  defineChain,
  getAddress,
  http,
  serializeTransaction,
  webSocket,
} from 'viem'
import {
  AccountBalance,
  AssetAmount,
  AtomicUnits,
  BlockExplorerConfirmation,
  ReceivingInstruction,
  RejectedTransfer,
  TestFundingReceipt,
  TransactionHistoryPage,
  type TransactionHistoryQuery,
  TransactionQuote,
  TransactionRecord,
  TransactionSubmission,
  TransferGuidance,
  type TransferRequest,
  ValidatedRecipient,
  type ValidatedTransfer,
  ValidatedTransfer as ValidatedTransferSchema,
  WalletClientError,
  makeTransactionPayload,
  maximumTransactionHistoryPageSize,
} from 'wallet-core-example'

import type { LiveNetworkAccount, LiveNetworkAdapter } from './adapter.js'
import type { EthereumLiveNetwork } from './catalog.js'

/** Protected EIP-1559 transaction facts passed from networking to custody. */
export const EthereumPreparedPayload = S.Struct({
  previewId: S.String,
  chainId: S.Number,
  nonce: S.Number,
  gas: S.String,
  maxFeePerGas: S.String,
  maxPriorityFeePerGas: S.String,
  to: S.String,
  value: S.String,
})
/** Protected EIP-1559 transaction facts passed from networking to custody. */
export type EthereumPreparedPayload = typeof EthereumPreparedPayload.Type
/** JSON encoding for a protected Ethereum transaction payload. */
export const EthereumPreparedPayloadJson = S.fromJsonString(
  EthereumPreparedPayload,
)

/** Protected signed Ethereum transaction returned by custody. */
export const EthereumSignedPayload = S.Struct({
  previewId: S.String,
  rawTransaction: S.String,
})
/** Protected signed Ethereum transaction returned by custody. */
export type EthereumSignedPayload = typeof EthereumSignedPayload.Type
/** JSON encoding for a protected signed Ethereum transaction. */
export const EthereumSignedPayloadJson = S.fromJsonString(EthereumSignedPayload)

const BlockscoutAddress = S.Struct({ hash: S.String })
const BlockscoutTransaction = S.Struct({
  timestamp: S.String,
  status: S.String,
  hash: S.String,
  from: BlockscoutAddress,
  to: S.NullOr(BlockscoutAddress),
  value: S.String,
})
const BlockscoutNextPage = S.Struct({
  block_number: S.Number,
  index: S.Number,
  items_count: S.Number,
})
const BlockscoutHistoryPage = S.Struct({
  items: S.Array(BlockscoutTransaction),
  next_page_params: S.NullOr(BlockscoutNextPage),
})
const BlockscoutNextPageJson = S.fromJsonString(BlockscoutNextPage)
const EthereumRpcHistoryCursor = S.Struct({
  blockNumber: S.String,
  transactionOffset: S.Int,
})
const EthereumRpcHistoryCursorJson = S.fromJsonString(EthereumRpcHistoryCursor)

const JsonRpcResponse = S.Struct({
  result: S.optional(S.Unknown),
  error: S.optional(S.Unknown),
})

const quoteLifetimeMilliseconds = 60_000

const unavailable = () => new WalletClientError({ code: 'Unavailable' })
const invalidResponse = () => new WalletClientError({ code: 'InvalidResponse' })
const rejected = () => new WalletClientError({ code: 'Rejected' })
const unsupported = () =>
  new WalletClientError({ code: 'UnsupportedCapability' })

const clientError = (error: unknown): WalletClientError =>
  error instanceof WalletClientError ? error : unavailable()

const assetAmount = (
  configuration: EthereumLiveNetwork,
  atomicUnits: bigint,
  observedAt: number,
): AssetAmount =>
  AssetAmount.make({
    assetId: configuration.asset.assetId,
    atomicUnits: S.decodeUnknownSync(AtomicUnits)(atomicUnits.toString()),
    observedAt,
  })

const chainForConfiguration = (configuration: EthereumLiveNetwork) =>
  defineChain({
    id: configuration.numericChainId,
    name: configuration.network.displayName,
    nativeCurrency: {
      name: configuration.asset.displayName,
      symbol: configuration.asset.symbol,
      decimals: configuration.asset.decimalPlaces,
    },
    rpcUrls: {
      default: {
        http: [configuration.httpRpcUrl],
        webSocket: [configuration.webSocketRpcUrl],
      },
    },
  })

const clientsForConfiguration = (configuration: EthereumLiveNetwork) => {
  const chain = chainForConfiguration(configuration)
  return {
    publicClient: createPublicClient({
      chain,
      transport: http(configuration.httpRpcUrl),
    }),
    subscriptionClient: createPublicClient({
      chain,
      transport: webSocket(configuration.webSocketRpcUrl),
    }),
  }
}

/** Serializes protected Ethereum facts into canonical EIP-1559 bytes. */
export const serializeEthereumPreparedTransaction = (
  payload: EthereumPreparedPayload,
): string =>
  serializeTransaction({
    type: 'eip1559',
    chainId: payload.chainId,
    nonce: payload.nonce,
    gas: BigInt(payload.gas),
    maxFeePerGas: BigInt(payload.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(payload.maxPriorityFeePerGas),
    to: getAddress(payload.to),
    value: BigInt(payload.value),
  })

const validateRequest = (
  configuration: EthereumLiveNetwork,
  account: LiveNetworkAccount,
  request: TransferRequest,
): Effect.Effect<
  ValidatedTransfer | typeof RejectedTransfer.Type,
  WalletClientError
> => {
  if (
    request.accountId !== account.account.accountId ||
    request.assetId !== configuration.asset.assetId
  ) {
    return Effect.fail(invalidResponse())
  }
  try {
    const destination = getAddress(request.destinationAddress)
    return Effect.succeed(
      ValidatedTransferSchema.make({
        request,
        recipient: ValidatedRecipient.make({
          networkId: configuration.network.networkId,
          address: destination,
          normalizedAddress: destination.toLowerCase(),
          displayAddress: destination,
        }),
      }),
    )
  } catch {
    return Effect.succeed(
      RejectedTransfer.make({
        request,
        guidance: TransferGuidance.make({
          summary: 'Enter a valid Ethereum address.',
          details: [
            'Ethereum addresses contain 0x followed by 40 hexadecimal characters.',
          ],
        }),
      }),
    )
  }
}

const queryStringForCursor = (
  maybeCursor: Option.Option<string>,
): Effect.Effect<string, WalletClientError> => {
  if (Option.isNone(maybeCursor)) {
    return Effect.succeed('')
  }
  return S.decodeUnknownEffect(BlockscoutNextPageJson)(maybeCursor.value).pipe(
    Effect.mapError(invalidResponse),
    Effect.map(cursor => {
      const params = new URLSearchParams()
      params.set('block_number', cursor.block_number.toString())
      params.set('index', cursor.index.toString())
      params.set('items_count', cursor.items_count.toString())
      return `?${params.toString()}`
    }),
  )
}

const historyRecord = (
  configuration: EthereumLiveNetwork,
  account: LiveNetworkAccount,
  transaction: typeof BlockscoutTransaction.Type,
): Option.Option<TransactionRecord> => {
  const accountAddress = getAddress(account.account.address)
  const from = getAddress(transaction.from.hash)
  const maybeTo = Option.fromNullishOr(transaction.to)
  const isOutgoing = from === accountAddress
  const isIncoming =
    Option.isSome(maybeTo) && getAddress(maybeTo.value.hash) === accountAddress
  const value = BigInt(transaction.value)
  if ((!isOutgoing && !isIncoming) || value <= 0n) {
    return Option.none()
  }
  const counterpartyAddress = isOutgoing
    ? Option.match(maybeTo, {
        onNone: () => accountAddress,
        onSome: to => getAddress(to.hash),
      })
    : from
  const observedAt = Date.parse(transaction.timestamp)
  return Option.some(
    TransactionRecord.make({
      recordId: `${transaction.hash}:${account.account.accountId}:eth`,
      transactionId: transaction.hash,
      accountId: account.account.accountId,
      networkId: configuration.network.networkId,
      direction: isOutgoing ? 'Outgoing' : 'Incoming',
      status: transaction.status === 'ok' ? 'Confirmed' : 'Failed',
      amount: assetAmount(configuration, value, observedAt),
      counterpartyAddress,
      normalizedCounterpartyAddress: counterpartyAddress.toLowerCase(),
      observedAt,
    }),
  )
}

const rpcTransactionRecord = (
  configuration: EthereumLiveNetwork,
  account: LiveNetworkAccount,
  transaction: Pick<EthereumRpcTransaction, 'hash' | 'from' | 'to' | 'value'>,
  observedAt: number,
  status: 'Confirmed' | 'Failed',
): Option.Option<TransactionRecord> => {
  const accountAddress = getAddress(account.account.address)
  const source = getAddress(transaction.from)
  const maybeDestination = Option.fromNullishOr(transaction.to)
  const isOutgoing = source === accountAddress
  const isIncoming =
    Option.isSome(maybeDestination) &&
    getAddress(maybeDestination.value) === accountAddress
  if ((!isOutgoing && !isIncoming) || transaction.value <= 0n) {
    return Option.none()
  }
  const counterpartyAddress = isOutgoing
    ? Option.getOrElse(maybeDestination, () => accountAddress)
    : source
  return Option.some(
    TransactionRecord.make({
      recordId: `${transaction.hash}:${account.account.accountId}:eth`,
      transactionId: transaction.hash,
      accountId: account.account.accountId,
      networkId: configuration.network.networkId,
      direction: isOutgoing ? 'Outgoing' : 'Incoming',
      status,
      amount: assetAmount(configuration, transaction.value, observedAt),
      counterpartyAddress,
      normalizedCounterpartyAddress: counterpartyAddress.toLowerCase(),
      observedAt,
    }),
  )
}

const postJsonRpc = async (
  url: string,
  method: string,
  params: ReadonlyArray<unknown>,
): Promise<typeof JsonRpcResponse.Type> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!response.ok) {
    throw new Error('Ethereum JSON-RPC request failed')
  }
  return S.decodeUnknownSync(JsonRpcResponse)(await response.json())
}

/** Builds one real Ethereum network adapter. */
export const makeEthereumLiveAdapter = (
  configuration: EthereumLiveNetwork,
): LiveNetworkAdapter => {
  const { publicClient, subscriptionClient } =
    clientsForConfiguration(configuration)

  const loadRpcTransactionHistory = (
    account: LiveNetworkAccount,
    query: TransactionHistoryQuery,
  ): Effect.Effect<TransactionHistoryPage, WalletClientError> =>
    Effect.tryPromise({
      try: async () => {
        const startingCursor = async (): Promise<
          typeof EthereumRpcHistoryCursor.Type
        > => {
          if (Option.isNone(query.maybeCursor)) {
            return EthereumRpcHistoryCursor.make({
              blockNumber: (await publicClient.getBlockNumber()).toString(),
              transactionOffset: 0,
            })
          } else {
            try {
              const cursor = S.decodeUnknownSync(EthereumRpcHistoryCursorJson)(
                query.maybeCursor.value,
              )
              if (
                BigInt(cursor.blockNumber) < 0n ||
                cursor.transactionOffset < 0
              ) {
                throw invalidResponse()
              }
              return cursor
            } catch (error) {
              if (error instanceof WalletClientError) {
                throw error
              }
              throw invalidResponse()
            }
          }
        }
        const nextCursor = (
          blockNumber: bigint,
          transactionOffset: number,
        ): Option.Option<string> =>
          Option.some(
            S.encodeSync(EthereumRpcHistoryCursorJson)(
              EthereumRpcHistoryCursor.make({
                blockNumber: blockNumber.toString(),
                transactionOffset,
              }),
            ),
          )
        const scanBlocks = async (
          blockNumber: bigint,
          transactionOffset: number,
          records: ReadonlyArray<TransactionRecord>,
        ): Promise<TransactionHistoryPage> => {
          const block = await publicClient.getBlock({
            blockNumber,
            includeTransactions: true,
          })
          const maybeBlockRecords = await Promise.all(
            Array.map(block.transactions, async transaction => {
              if (typeof transaction === 'string') {
                return Option.none<TransactionRecord>()
              }
              const observedAt = Number(block.timestamp) * 1_000
              const maybeRecord = rpcTransactionRecord(
                configuration,
                account,
                transaction,
                observedAt,
                'Confirmed',
              )
              if (Option.isNone(maybeRecord)) {
                return Option.none<TransactionRecord>()
              }
              const receipt = await publicClient.getTransactionReceipt({
                hash: transaction.hash,
              })
              return Option.some(
                TransactionRecord.make({
                  ...maybeRecord.value,
                  status: receipt.status === 'success' ? 'Confirmed' : 'Failed',
                }),
              )
            }),
          )
          const blockRecords = Array.getSomes(maybeBlockRecords)
          const remainingRecords = Array.drop(blockRecords, transactionOffset)
          const availableCount = query.limit - Array.length(records)
          const selectedRecords = Array.take(remainingRecords, availableCount)
          const nextRecords = Array.appendAll(records, selectedRecords)
          const nextTransactionOffset =
            transactionOffset + Array.length(selectedRecords)
          if (Array.length(nextRecords) >= query.limit) {
            if (nextTransactionOffset < Array.length(blockRecords)) {
              return TransactionHistoryPage.make({
                records: nextRecords,
                maybeNextCursor: nextCursor(blockNumber, nextTransactionOffset),
              })
            } else if (blockNumber > 0n) {
              return TransactionHistoryPage.make({
                records: nextRecords,
                maybeNextCursor: nextCursor(blockNumber - 1n, 0),
              })
            } else {
              return TransactionHistoryPage.make({
                records: nextRecords,
                maybeNextCursor: Option.none(),
              })
            }
          } else if (blockNumber > 0n) {
            return scanBlocks(blockNumber - 1n, 0, nextRecords)
          } else {
            return TransactionHistoryPage.make({
              records: nextRecords,
              maybeNextCursor: Option.none(),
            })
          }
        }
        const cursor = await startingCursor()
        return scanBlocks(
          BigInt(cursor.blockNumber),
          cursor.transactionOffset,
          [],
        )
      },
      catch: clientError,
    })

  return {
    configuration,
    loadBalance: account =>
      Effect.tryPromise({
        try: async () => {
          const observedAt = Date.now()
          const balance = await publicClient.getBalance({
            address: getAddress(account.account.address),
          })
          return AccountBalance.make({
            accountId: account.account.accountId,
            amount: assetAmount(configuration, balance, observedAt),
          })
        },
        catch: unavailable,
      }),
    receivingInstruction: account =>
      ReceivingInstruction.make({
        accountId: account.account.accountId,
        assetId: configuration.asset.assetId,
        destinationAddress: account.account.address,
        maybeMemo: Option.none(),
        portableUri: `ethereum:${account.account.address}@${configuration.numericChainId.toString()}`,
      }),
    validateTransfer: (account, request) =>
      validateRequest(configuration, account, request),
    previewTransfer: (account, transfer) =>
      Effect.tryPromise({
        try: async () => {
          const source = getAddress(account.account.address)
          const destination = getAddress(transfer.recipient.address)
          const atomicUnits = BigInt(transfer.request.atomicUnits)
          const observedAt = Date.now()
          const [balance, fees, gas] = await Promise.all([
            publicClient.getBalance({ address: source }),
            publicClient.estimateFeesPerGas({ type: 'eip1559' }),
            publicClient.estimateGas({
              account: source,
              to: destination,
              value: atomicUnits,
            }),
          ])
          const fee = gas * fees.maxFeePerGas
          const resultingBalance = balance - atomicUnits - fee
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
        catch: error =>
          error instanceof WalletClientError ? error : unavailable(),
      }),
    buildTransferPayload: (account, preview) =>
      Effect.tryPromise({
        try: async () => {
          if (preview.expiresAt < Date.now()) {
            throw rejected()
          }
          const source = getAddress(account.account.address)
          const destination = getAddress(preview.transfer.recipient.address)
          const value = BigInt(preview.transfer.request.atomicUnits)
          const [nonce, fees, gas] = await Promise.all([
            publicClient.getTransactionCount({
              address: source,
              blockTag: 'pending',
            }),
            publicClient.estimateFeesPerGas({ type: 'eip1559' }),
            publicClient.estimateGas({
              account: source,
              to: destination,
              value,
            }),
          ])
          const payload = EthereumPreparedPayload.make({
            previewId: preview.previewId,
            chainId: configuration.numericChainId,
            nonce,
            gas: gas.toString(),
            maxFeePerGas: fees.maxFeePerGas.toString(),
            maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
            to: destination,
            value: value.toString(),
          })
          return makeTransactionPayload(
            account.account.accountId,
            configuration.network.networkId,
            S.encodeSync(EthereumPreparedPayloadJson)(payload),
          )
        },
        catch: error =>
          error instanceof WalletClientError ? error : unavailable(),
      }),
    submitTransaction: (account, transaction) => {
      if (
        transaction.accountId !== account.account.accountId ||
        transaction.networkId !== configuration.network.networkId
      ) {
        return Effect.fail(invalidResponse())
      }
      return S.decodeUnknownEffect(EthereumSignedPayloadJson)(
        Redacted.value(transaction.payload),
      ).pipe(
        Effect.mapError(invalidResponse),
        Effect.flatMap(payload =>
          Effect.tryPromise({
            try: async () => {
              const transactionId = await publicClient.sendRawTransaction({
                serializedTransaction: `0x${payload.rawTransaction.replace(/^0x/, '')}`,
              })
              return TransactionSubmission.make({
                previewId: payload.previewId,
                transactionId,
                submittedAt: Date.now(),
                maybeExplorerConfirmation: Option.map(
                  configuration.maybeExplorerTransactionBaseUrl,
                  explorerTransactionBaseUrl =>
                    BlockExplorerConfirmation.make({
                      label: configuration.network.displayName,
                      transactionId,
                      url: `${explorerTransactionBaseUrl}${transactionId}`,
                    }),
                ),
              })
            },
            catch: unavailable,
          }),
        ),
      )
    },
    loadTransactionHistory: (account, query) => {
      if (
        query.accountId !== account.account.accountId ||
        query.networkId !== configuration.network.networkId ||
        query.limit <= 0 ||
        query.limit > maximumTransactionHistoryPageSize
      ) {
        return Effect.fail(invalidResponse())
      }
      if (Option.isNone(configuration.maybeHistoryApiUrl)) {
        return loadRpcTransactionHistory(account, query)
      }
      const historyApiUrl = configuration.maybeHistoryApiUrl.value
      return queryStringForCursor(query.maybeCursor).pipe(
        Effect.flatMap(queryString =>
          Effect.tryPromise({
            try: async () => {
              const response = await fetch(
                `${historyApiUrl}/addresses/${account.account.address}/transactions${queryString}`,
              )
              if (!response.ok) {
                throw new Error('Blockscout request failed')
              }
              const page = S.decodeUnknownSync(BlockscoutHistoryPage)(
                await response.json(),
              )
              const records = Array.take(
                Array.getSomes(
                  Array.map(page.items, transaction =>
                    historyRecord(configuration, account, transaction),
                  ),
                ),
                query.limit,
              )
              return TransactionHistoryPage.make({
                records,
                maybeNextCursor:
                  page.next_page_params === null
                    ? Option.none()
                    : Option.some(
                        S.encodeSync(BlockscoutNextPageJson)(
                          page.next_page_params,
                        ),
                      ),
              })
            },
            catch: unavailable,
          }),
        ),
      )
    },
    observeTransactions: account =>
      Stream.callback<typeof TransactionRecord.Type, WalletClientError>(queue =>
        Effect.acquireRelease(
          Effect.sync(() =>
            subscriptionClient.watchBlockNumber({
              onBlockNumber: blockNumber => {
                void publicClient
                  .getBlock({ blockNumber, includeTransactions: true })
                  .then(block => {
                    Array.forEach(block.transactions, transaction => {
                      const maybeRecord = rpcTransactionRecord(
                        configuration,
                        account,
                        transaction,
                        Number(block.timestamp) * 1_000,
                        'Confirmed',
                      )
                      if (Option.isNone(maybeRecord)) {
                        return
                      }
                      void publicClient
                        .getTransactionReceipt({ hash: transaction.hash })
                        .then(receipt => {
                          Queue.offerUnsafe(
                            queue,
                            TransactionRecord.make({
                              ...maybeRecord.value,
                              status:
                                receipt.status === 'success'
                                  ? 'Confirmed'
                                  : 'Failed',
                            }),
                          )
                        })
                        .catch(() => {
                          Queue.failCauseUnsafe(
                            queue,
                            Cause.fail(unavailable()),
                          )
                        })
                    })
                  })
                  .catch(() => {
                    Queue.failCauseUnsafe(queue, Cause.fail(unavailable()))
                  })
              },
              onError: () => {
                Queue.failCauseUnsafe(queue, Cause.fail(unavailable()))
              },
            }),
          ),
          unwatch => Effect.sync(unwatch),
        ).pipe(Effect.flatMap(() => Effect.never)),
      ),
    requestTestFunding: (account, request) => {
      if (
        configuration.network.networkId !== 'ethereum:anvil' ||
        request.accountId !== account.account.accountId ||
        request.chainId !== configuration.chain.chainId ||
        request.networkId !== configuration.network.networkId ||
        request.environment !== configuration.network.environment ||
        request.assetId !== configuration.asset.assetId
      ) {
        return Effect.fail(unsupported())
      }
      const amount = BigInt(request.atomicUnits)
      if (amount <= 0n) {
        return Effect.fail(rejected())
      }
      return Effect.tryPromise({
        try: async () => {
          const currentBalance = await publicClient.getBalance({
            address: getAddress(account.account.address),
          })
          const nextBalance = currentBalance + amount
          const response = await postJsonRpc(
            configuration.httpRpcUrl,
            'anvil_setBalance',
            [account.account.address, `0x${nextBalance.toString(16)}`],
          )
          if (response.error !== undefined) {
            throw new Error('Anvil funding request failed')
          }
          const acceptedAt = Date.now()
          return TestFundingReceipt.make({
            requestId: request.requestId,
            fundingId: `anvil:${request.requestId}`,
            acceptedAt,
            amount: assetAmount(configuration, amount, acceptedAt),
            maybeTransactionId: Option.none(),
          })
        },
        catch: unavailable,
      })
    },
  }
}
