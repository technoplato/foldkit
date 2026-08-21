import {
  Array,
  Cause,
  Data,
  Effect,
  Option,
  Order,
  Queue,
  Redacted,
  Schema as S,
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
  TransactionHistoryPage,
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

import { base64 } from '@scure/base'
import { getTransferSolInstruction } from '@solana-program/system'
import {
  type TransactionSigner,
  address,
  appendTransactionMessageInstructions,
  blockhash,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit'

import type { LiveNetworkAccount, LiveNetworkAdapter } from './adapter.js'
import type { SolanaLiveNetwork } from './catalog.js'

/** Protected Solana transfer facts passed from networking to custody. */
export const SolanaPreparedPayload = S.Struct({
  previewId: S.String,
  sourceAddress: S.String,
  destinationAddress: S.String,
  atomicUnits: S.String,
  blockhash: S.String,
  lastValidBlockHeight: S.String,
})
/** Protected Solana transfer facts passed from networking to custody. */
export type SolanaPreparedPayload = typeof SolanaPreparedPayload.Type
/** JSON encoding for a protected Solana transfer. */
export const SolanaPreparedPayloadJson = S.fromJsonString(SolanaPreparedPayload)

/** Protected signed Solana wire transaction returned by custody. */
export const SolanaSignedPayload = S.Struct({
  previewId: S.String,
  wireTransactionBase64: S.String,
})
/** Protected signed Solana wire transaction returned by custody. */
export type SolanaSignedPayload = typeof SolanaSignedPayload.Type
/** JSON encoding for a protected signed Solana wire transaction. */
export const SolanaSignedPayloadJson = S.fromJsonString(SolanaSignedPayload)

const SolanaBalanceResponse = S.Struct({
  result: S.Struct({ value: S.Number }),
})

const SolanaLatestBlockhashResponse = S.Struct({
  result: S.Struct({
    value: S.Struct({
      blockhash: S.String,
      lastValidBlockHeight: S.Number,
    }),
  }),
})

const SolanaFeeResponse = S.Struct({
  result: S.Struct({ value: S.NullOr(S.Number) }),
})

const SolanaSignatureResponse = S.Struct({ result: S.String })

const SolanaAccountInfoResponse = S.Struct({
  result: S.Struct({ value: S.NullOr(S.Unknown) }),
})

const SolanaRentExemptionResponse = S.Struct({
  result: S.Number,
})

const SolanaJsonRpcErrorBody = S.Struct({
  error: S.Struct({
    message: S.String,
    data: S.optional(S.Unknown),
  }),
})

const SolanaSignaturesResponse = S.Struct({
  result: S.Array(
    S.Struct({
      signature: S.String,
      blockTime: S.NullOr(S.Number),
    }),
  ),
})

const SolanaSystemTransferInstruction = S.Struct({
  program: S.Literal('system'),
  parsed: S.Struct({
    type: S.Literal('transfer'),
    info: S.Struct({
      source: S.String,
      destination: S.String,
      lamports: S.Union([S.String, S.Number, S.BigInt]),
    }),
  }),
})

const SolanaTransaction = S.Struct({
  blockTime: S.NullOr(S.Number),
  meta: S.NullOr(
    S.Struct({
      err: S.Unknown,
      innerInstructions: S.optional(
        S.Array(S.Struct({ instructions: S.Array(S.Unknown) })),
      ),
    }),
  ),
  transaction: S.Struct({
    message: S.Struct({ instructions: S.Array(S.Unknown) }),
  }),
})

const SolanaTransactionResponse = S.Struct({
  result: S.NullOr(SolanaTransaction),
})

const SolanaLogsNotification = S.Struct({
  params: S.Struct({
    result: S.Struct({ value: S.Struct({ signature: S.String }) }),
  }),
})

const quoteLifetimeMilliseconds = 60_000
const maximumObservedSignatures = 1_024
const maximumConcurrentHistoryLoads = 8
const observationTransactionAttempts = 20
const observationRetryMilliseconds = 250

const unavailable = () => new WalletClientError({ code: 'Unavailable' })
const invalidResponse = () => new WalletClientError({ code: 'InvalidResponse' })
const rejected = (guidance?: TransferGuidance) =>
  new WalletClientError(
    guidance === undefined
      ? { code: 'Rejected' }
      : { code: 'Rejected', guidance },
  )
const unsupported = () =>
  new WalletClientError({ code: 'UnsupportedCapability' })

class SolanaJsonRpcFailure extends Data.TaggedError('SolanaJsonRpcFailure')<{
  readonly rpcMessage: string
  readonly data?: unknown
}> {}

const isTransientSolanaRpcMessage = (message: string): boolean => {
  const haystack = message.toLowerCase()
  return (
    haystack.includes('too many requests') ||
    haystack.includes('rate limit') ||
    haystack.includes('blockhash not found') ||
    haystack.includes('node is unhealthy') ||
    haystack.includes('timed out')
  )
}

const isDestinationRentSolanaRpcFailure = (
  message: string,
  data: unknown,
): boolean => {
  const haystack = `${message} ${JSON.stringify(data ?? {})}`.toLowerCase()
  return (
    haystack.includes('insufficientfundsforrent') ||
    haystack.includes('insufficient funds for rent') ||
    (haystack.includes('rent') && haystack.includes('insufficient'))
  )
}

const destinationCreationRentGuidance = (
  rentLamports: bigint,
): TransferGuidance =>
  TransferGuidance.make({
    summary: 'This amount is too small to create the destination account.',
    details: [
      `A new Solana account needs at least ${rentLamports.toString()} lamports to stay rent-exempt.`,
      'Send at least that much, or send to an account that already exists.',
    ],
  })

const solanaRpcGuidance = (
  message: string,
  data: unknown,
): TransferGuidance => {
  if (isDestinationRentSolanaRpcFailure(message, data)) {
    return TransferGuidance.make({
      summary: 'This amount is too small to create the destination account.',
      details: [
        'A new Solana account needs enough lamports to stay rent-exempt.',
        'Send at least 1000000 lamports (0.001 SOL), or send to an account that already exists.',
      ],
    })
  }
  return TransferGuidance.make({
    summary: 'Solana rejected this transfer.',
    details: [message],
  })
}

const walletClientErrorFromUnknown = (error: unknown): WalletClientError => {
  if (error instanceof WalletClientError) {
    return error
  }
  if (error instanceof SolanaJsonRpcFailure) {
    if (isTransientSolanaRpcMessage(error.rpcMessage)) {
      return unavailable()
    }
    return rejected(solanaRpcGuidance(error.rpcMessage, error.data))
  }
  return unavailable()
}

const exactUnsignedInteger = (value: number): bigint => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw invalidResponse()
  }
  return BigInt(value)
}

const assetAmount = (
  configuration: SolanaLiveNetwork,
  atomicUnits: bigint,
  observedAt: number,
): AssetAmount =>
  AssetAmount.make({
    assetId: configuration.asset.assetId,
    atomicUnits: S.decodeUnknownSync(AtomicUnits)(atomicUnits.toString()),
    observedAt,
  })

const postJsonRpc = async <A>(
  configuration: SolanaLiveNetwork,
  schema: S.ConstraintDecoder<A>,
  method: string,
  params: ReadonlyArray<unknown>,
): Promise<A> => {
  const response = await fetch(configuration.httpRpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!response.ok) {
    throw new Error('Solana JSON-RPC request failed')
  }
  const payload: unknown = await response.json()
  const maybeRpcError = S.decodeUnknownOption(SolanaJsonRpcErrorBody)(payload)
  if (Option.isSome(maybeRpcError)) {
    throw new SolanaJsonRpcFailure({
      rpcMessage: maybeRpcError.value.error.message,
      data: maybeRpcError.value.error.data,
    })
  }
  return S.decodeUnknownSync(schema)(payload)
}

/** Builds the canonical Solana transaction message signed by custody. */
export const buildSolanaTransactionMessage = (
  payload: SolanaPreparedPayload,
  signer: TransactionSigner,
) => {
  const instruction = getTransferSolInstruction({
    source: signer,
    destination: address(payload.destinationAddress),
    amount: BigInt(payload.atomicUnits),
  })
  const emptyMessage = createTransactionMessage({ version: 0 })
  const messageWithFeePayer = setTransactionMessageFeePayerSigner(
    signer,
    emptyMessage,
  )
  const messageWithLifetime = setTransactionMessageLifetimeUsingBlockhash(
    {
      blockhash: blockhash(payload.blockhash),
      lastValidBlockHeight: BigInt(payload.lastValidBlockHeight),
    },
    messageWithFeePayer,
  )
  return appendTransactionMessageInstructions(
    [instruction],
    messageWithLifetime,
  )
}

const preparedPayload = async (
  configuration: SolanaLiveNetwork,
  account: LiveNetworkAccount,
  previewId: string,
  destinationAddress: string,
  atomicUnits: string,
): Promise<SolanaPreparedPayload> => {
  const response = await postJsonRpc(
    configuration,
    SolanaLatestBlockhashResponse,
    'getLatestBlockhash',
    [{ commitment: 'confirmed' }],
  )
  return SolanaPreparedPayload.make({
    previewId,
    sourceAddress: account.account.address,
    destinationAddress: address(destinationAddress),
    atomicUnits,
    blockhash: response.result.value.blockhash,
    lastValidBlockHeight: exactUnsignedInteger(
      response.result.value.lastValidBlockHeight,
    ).toString(),
  })
}

const feeForPayload = async (
  configuration: SolanaLiveNetwork,
  payload: SolanaPreparedPayload,
): Promise<bigint> => {
  const signer = createNoopSigner(address(payload.sourceAddress))
  const transactionMessage = buildSolanaTransactionMessage(payload, signer)
  const messageBytes = compileTransaction(transactionMessage).messageBytes
  const response = await postJsonRpc(
    configuration,
    SolanaFeeResponse,
    'getFeeForMessage',
    [base64.encode(Uint8Array.from(messageBytes)), { commitment: 'confirmed' }],
  )
  if (response.result.value === null) {
    throw new Error('Solana fee was unavailable')
  }
  return exactUnsignedInteger(response.result.value)
}

const validateRequest = (
  configuration: SolanaLiveNetwork,
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
    const destination = address(request.destinationAddress)
    return Effect.succeed(
      ValidatedTransferSchema.make({
        request,
        recipient: ValidatedRecipient.make({
          networkId: configuration.network.networkId,
          address: destination,
          normalizedAddress: destination,
          displayAddress: destination,
        }),
      }),
    )
  } catch {
    return Effect.succeed(
      RejectedTransfer.make({
        request,
        guidance: TransferGuidance.make({
          summary: 'Enter a valid Solana address.',
          details: ['Solana addresses are base58-encoded public keys.'],
        }),
      }),
    )
  }
}

const recordsForTransaction = (
  configuration: SolanaLiveNetwork,
  account: LiveNetworkAccount,
  transactionSignature: string,
  transaction: typeof SolanaTransaction.Type | null,
  observedAtFallback: number,
): ReadonlyArray<TransactionRecord> => {
  if (transaction === null || transaction.meta === null) {
    return []
  }
  const observedAt =
    transaction.blockTime === null
      ? observedAtFallback
      : transaction.blockTime * 1_000
  const status = transaction.meta.err === null ? 'Confirmed' : 'Failed'
  const innerInstructions = Array.flatMap(
    transaction.meta.innerInstructions ?? [],
    inner => inner.instructions,
  )
  const instructions = Array.appendAll(
    transaction.transaction.message.instructions,
    innerInstructions,
  )
  return Array.getSomes(
    Array.map(instructions, (instruction, instructionIndex) => {
      const maybeTransfer = S.decodeUnknownOption(
        SolanaSystemTransferInstruction,
      )(instruction)
      if (Option.isNone(maybeTransfer)) {
        return Option.none()
      }
      const info = maybeTransfer.value.parsed.info
      const isOutgoing = info.source === account.account.address
      const isIncoming = info.destination === account.account.address
      if (!isOutgoing && !isIncoming) {
        return Option.none()
      }
      if (
        typeof info.lamports === 'number' &&
        !Number.isSafeInteger(info.lamports)
      ) {
        return Option.none()
      }
      const atomicUnits = BigInt(info.lamports)
      if (atomicUnits <= 0n) {
        return Option.none()
      }
      const counterpartyAddress = isOutgoing ? info.destination : info.source
      return Option.some(
        TransactionRecord.make({
          recordId: `${transactionSignature}:${instructionIndex.toString()}:sol`,
          transactionId: transactionSignature,
          accountId: account.account.accountId,
          networkId: configuration.network.networkId,
          direction: isOutgoing ? 'Outgoing' : 'Incoming',
          status,
          amount: assetAmount(configuration, atomicUnits, observedAt),
          counterpartyAddress,
          normalizedCounterpartyAddress: counterpartyAddress,
          observedAt,
        }),
      )
    }),
  )
}

const loadTransaction = async (
  configuration: SolanaLiveNetwork,
  transactionSignature: string,
): Promise<typeof SolanaTransaction.Type | null> => {
  const response = await postJsonRpc(
    configuration,
    SolanaTransactionResponse,
    'getTransaction',
    [
      transactionSignature,
      {
        commitment: 'confirmed',
        encoding: 'jsonParsed',
        maxSupportedTransactionVersion: 0,
      },
    ],
  )
  return response.result
}

const loadObservedTransaction = async (
  configuration: SolanaLiveNetwork,
  transactionSignature: string,
  remainingAttempts = observationTransactionAttempts,
): Promise<typeof SolanaTransaction.Type> => {
  const transaction = await loadTransaction(configuration, transactionSignature)
  if (transaction !== null) {
    return transaction
  }
  if (remainingAttempts <= 1) {
    throw new Error('Observed Solana transaction was unavailable')
  }
  await new Promise(resolve =>
    setTimeout(resolve, observationRetryMilliseconds),
  )
  return loadObservedTransaction(
    configuration,
    transactionSignature,
    remainingAttempts - 1,
  )
}

/** Builds one real Solana network adapter. */
export const makeSolanaLiveAdapter = (
  configuration: SolanaLiveNetwork,
): LiveNetworkAdapter => ({
  configuration,
  loadBalance: account =>
    Effect.tryPromise({
      try: async () => {
        const observedAt = Date.now()
        const response = await postJsonRpc(
          configuration,
          SolanaBalanceResponse,
          'getBalance',
          [account.account.address, { commitment: 'confirmed' }],
        )
        return AccountBalance.make({
          accountId: account.account.accountId,
          amount: assetAmount(
            configuration,
            exactUnsignedInteger(response.result.value),
            observedAt,
          ),
        })
      },
      catch: error =>
        error instanceof WalletClientError ? error : unavailable(),
    }),
  receivingInstruction: account =>
    ReceivingInstruction.make({
      accountId: account.account.accountId,
      assetId: configuration.asset.assetId,
      destinationAddress: account.account.address,
      maybeMemo: Option.none(),
      portableUri: `solana:${account.account.address}${configuration.explorerClusterQuery}`,
    }),
  validateTransfer: (account, request) =>
    validateRequest(configuration, account, request),
  previewTransfer: (account, transfer) =>
    Effect.tryPromise({
      try: async () => {
        const observedAt = Date.now()
        const payload = await preparedPayload(
          configuration,
          account,
          `${transfer.request.transferId}:${observedAt.toString()}`,
          transfer.recipient.address,
          transfer.request.atomicUnits,
        )
        const [balanceResponse, fee, destinationAccount, rentLamports] =
          await Promise.all([
            postJsonRpc(configuration, SolanaBalanceResponse, 'getBalance', [
              account.account.address,
              { commitment: 'confirmed' },
            ]),
            feeForPayload(configuration, payload),
            postJsonRpc(
              configuration,
              SolanaAccountInfoResponse,
              'getAccountInfo',
              [
                transfer.recipient.address,
                { commitment: 'confirmed', encoding: 'base64' },
              ],
            ),
            postJsonRpc(
              configuration,
              SolanaRentExemptionResponse,
              'getMinimumBalanceForRentExemption',
              [0],
            ).then(response => exactUnsignedInteger(response.result)),
          ])
        if (
          destinationAccount.result.value === null &&
          BigInt(transfer.request.atomicUnits) < rentLamports
        ) {
          throw rejected(destinationCreationRentGuidance(rentLamports))
        }
        const resultingBalance =
          exactUnsignedInteger(balanceResponse.result.value) -
          BigInt(transfer.request.atomicUnits) -
          fee
        if (resultingBalance < 0n) {
          throw rejected(
            TransferGuidance.make({
              summary:
                'The sender does not have enough SOL for this transfer and fee.',
              details: ['Reduce the amount or add SOL to the sending account.'],
            }),
          )
        }
        return TransactionQuote.make({
          quoteId: payload.previewId,
          estimatedFee: assetAmount(configuration, fee, observedAt),
          resultingBalance: assetAmount(
            configuration,
            resultingBalance,
            observedAt,
          ),
          expiresAt: observedAt + quoteLifetimeMilliseconds,
        })
      },
      catch: walletClientErrorFromUnknown,
    }),
  buildTransferPayload: (account, preview) => {
    if (preview.expiresAt < Date.now()) {
      return Effect.fail(rejected())
    }
    return Effect.tryPromise({
      try: async () => {
        const payload = await preparedPayload(
          configuration,
          account,
          preview.previewId,
          preview.transfer.recipient.address,
          preview.transfer.request.atomicUnits,
        )
        return makeTransactionPayload(
          account.account.accountId,
          configuration.network.networkId,
          S.encodeSync(SolanaPreparedPayloadJson)(payload),
        )
      },
      catch: unavailable,
    })
  },
  submitTransaction: (account, transaction) => {
    if (
      transaction.accountId !== account.account.accountId ||
      transaction.networkId !== configuration.network.networkId
    ) {
      return Effect.fail(invalidResponse())
    }
    return S.decodeUnknownEffect(SolanaSignedPayloadJson)(
      Redacted.value(transaction.payload),
    ).pipe(
      Effect.mapError(invalidResponse),
      Effect.flatMap(payload =>
        Effect.tryPromise({
          try: async () => {
            const response = await postJsonRpc(
              configuration,
              SolanaSignatureResponse,
              'sendTransaction',
              [
                payload.wireTransactionBase64,
                {
                  encoding: 'base64',
                  preflightCommitment: 'confirmed',
                },
              ],
            )
            const transactionId = response.result
            return TransactionSubmission.make({
              previewId: payload.previewId,
              transactionId,
              submittedAt: Date.now(),
              maybeExplorerConfirmation: Option.some(
                BlockExplorerConfirmation.make({
                  label: configuration.network.displayName,
                  transactionId,
                  url: `https://explorer.solana.com/tx/${transactionId}${configuration.explorerClusterQuery}`,
                }),
              ),
            })
          },
          catch: walletClientErrorFromUnknown,
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
    const signatureOptions = Option.isSome(query.maybeCursor)
      ? {
          commitment: 'confirmed',
          limit: query.limit,
          before: query.maybeCursor.value,
        }
      : { commitment: 'confirmed', limit: query.limit }
    return Effect.tryPromise({
      try: () =>
        postJsonRpc(
          configuration,
          SolanaSignaturesResponse,
          'getSignaturesForAddress',
          [account.account.address, signatureOptions],
        ),
      catch: unavailable,
    }).pipe(
      Effect.flatMap(response =>
        Effect.forEach(
          response.result,
          item =>
            Effect.tryPromise({
              try: async () => {
                const transaction = await loadTransaction(
                  configuration,
                  item.signature,
                )
                return recordsForTransaction(
                  configuration,
                  account,
                  item.signature,
                  transaction,
                  item.blockTime === null ? Date.now() : item.blockTime * 1_000,
                )
              },
              catch: unavailable,
            }),
          { concurrency: maximumConcurrentHistoryLoads },
        ).pipe(
          Effect.map(recordGroups => {
            const maybeLastSignature = Array.last(response.result)
            return TransactionHistoryPage.make({
              records: Array.sortWith(
                Array.flatten(recordGroups),
                record => record.observedAt,
                Order.flip(Order.Number),
              ),
              maybeNextCursor:
                Array.length(response.result) === query.limit &&
                Option.isSome(maybeLastSignature)
                  ? Option.some(maybeLastSignature.value.signature)
                  : Option.none(),
            })
          }),
        ),
      ),
    )
  },
  observeTransactions: account =>
    Stream.callback<typeof TransactionRecord.Type, WalletClientError>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const socket = new WebSocket(configuration.webSocketRpcUrl)
          const observedSignatures = new Set<string>()
          socket.addEventListener('open', () => {
            socket.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'logsSubscribe',
                params: [
                  { mentions: [account.account.address] },
                  { commitment: 'confirmed' },
                ],
              }),
            )
          })
          socket.addEventListener('message', event => {
            try {
              const maybeNotification = S.decodeUnknownOption(
                SolanaLogsNotification,
              )(JSON.parse(String(event.data)))
              if (Option.isNone(maybeNotification)) {
                return
              }
              const transactionSignature =
                maybeNotification.value.params.result.value.signature
              if (observedSignatures.has(transactionSignature)) {
                return
              }
              observedSignatures.add(transactionSignature)
              if (observedSignatures.size > maximumObservedSignatures) {
                const oldestSignature = observedSignatures.values().next()
                if (!oldestSignature.done) {
                  observedSignatures.delete(oldestSignature.value)
                }
              }
              void loadObservedTransaction(configuration, transactionSignature)
                .then(transaction => {
                  const records = recordsForTransaction(
                    configuration,
                    account,
                    transactionSignature,
                    transaction,
                    Date.now(),
                  )
                  Array.forEach(records, record => {
                    Queue.offerUnsafe(queue, record)
                  })
                })
                .catch(() => {
                  Queue.failCauseUnsafe(queue, Cause.fail(unavailable()))
                })
            } catch {
              Queue.failCauseUnsafe(queue, Cause.fail(invalidResponse()))
            }
          })
          socket.addEventListener('error', () => {
            Queue.failCauseUnsafe(queue, Cause.fail(unavailable()))
          })
          socket.addEventListener('close', () => {
            Queue.failCauseUnsafe(queue, Cause.fail(unavailable()))
          })
          return socket
        }),
        socket => Effect.sync(() => socket.close()),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
  requestTestFunding: (account, request) => {
    if (
      configuration.network.environment === 'Mainnet' ||
      request.accountId !== account.account.accountId ||
      request.chainId !== configuration.chain.chainId ||
      request.networkId !== configuration.network.networkId ||
      request.environment !== configuration.network.environment ||
      request.assetId !== configuration.asset.assetId
    ) {
      return Effect.fail(unsupported())
    }
    const atomicUnits = BigInt(request.atomicUnits)
    if (atomicUnits <= 0n || atomicUnits > BigInt(Number.MAX_SAFE_INTEGER)) {
      return Effect.fail(rejected())
    }
    return Effect.tryPromise({
      try: async () => {
        const response = await postJsonRpc(
          configuration,
          SolanaSignatureResponse,
          'requestAirdrop',
          [
            account.account.address,
            Number(atomicUnits),
            { commitment: 'confirmed' },
          ],
        )
        const acceptedAt = Date.now()
        return TestFundingReceipt.make({
          requestId: request.requestId,
          fundingId: response.result,
          acceptedAt,
          amount: assetAmount(configuration, atomicUnits, acceptedAt),
          maybeTransactionId: Option.some(response.result),
        })
      },
      catch: unavailable,
    })
  },
})
