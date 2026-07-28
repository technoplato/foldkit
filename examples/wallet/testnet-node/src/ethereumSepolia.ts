import {
  Array as Array_,
  Cause,
  Effect,
  Layer,
  Match as M,
  Option,
  Queue,
  Redacted,
  Schema as S,
  Stream,
} from 'effect'
import {
  createPublicClient,
  encodeFunctionData,
  getAddress,
  http,
  keccak256,
  parseAbi,
  parseAbiItem,
  parseTransaction,
  serializeTransaction,
  verifyMessage,
  webSocket,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import {
  AccountBalance,
  AtomicUnits,
  CurrencyValue,
  Eth,
  EthereumSepolia,
  EthereumSignatureProof,
  type PreparedTransaction,
  ReceivingInstruction,
  type SignatureProof,
  type SignedTransaction,
  type SigningChallenge,
  type SigningDigest,
  type TransactionPreview,
  TransactionQuote,
  TransactionRecord,
  TransactionSubmission,
  type TransferDraft,
  Usdc,
  WalletAccount,
  WalletClientError,
  WalletCryptoError,
  WalletSignerError,
  blockExplorerConfirmation,
  makePreparedTransaction,
  makeSignedTransaction,
  makeSigningDigest,
} from 'wallet-core-example'

import {
  type ChainPortfolio,
  EthereumSepoliaCustody,
  EthereumSepoliaTransport,
} from './chainTransport.js'
import {
  EthereumSepoliaKeyConfig,
  EthereumSepoliaNodeConfig,
} from './config.js'

const ethereumChainId = 11_155_111
const ethDecimalPlaces = 18
const usdcDecimalPlaces = 6
const quoteLifetimeMilliseconds = 60_000

/** Circle's USDC contract on Ethereum Sepolia. */
export const ethereumSepoliaUsdcAddress =
  '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'

const erc20Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 value) returns (bool)',
])
const erc20TransferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
)

const EthereumTransferAsset = S.Literals(['Eth', 'Usdc'])
type EthereumTransferAsset = typeof EthereumTransferAsset.Type

const EthereumPreparedPayload = S.Struct({
  previewId: S.String,
  asset: EthereumTransferAsset,
  chainId: S.Number,
  nonce: S.Number,
  gas: S.String,
  maxFeePerGas: S.String,
  maxPriorityFeePerGas: S.String,
  to: S.String,
  value: S.String,
  data: S.String,
})
const EthereumPreparedPayloadJson = S.fromJsonString(EthereumPreparedPayload)

const EthereumSignedPayload = S.Struct({
  previewId: S.String,
  rawTransaction: S.String,
})
const EthereumSignedPayloadJson = S.fromJsonString(EthereumSignedPayload)

const Erc20ObservedLog = S.Struct({
  args: S.Struct({
    from: S.optional(S.String),
    to: S.optional(S.String),
    value: S.optional(S.BigInt),
  }),
  blockNumber: S.NullOr(S.BigInt),
  logIndex: S.NullOr(S.Number),
  transactionHash: S.NullOr(S.String),
})

type EthereumPreparedPayload = typeof EthereumPreparedPayload.Type

const toClientError = () => new WalletClientError({ code: 'Unavailable' })
const invalidClientResponse = () =>
  new WalletClientError({ code: 'InvalidResponse' })
const invalidCryptoPayload = () =>
  new WalletCryptoError({ code: 'InvalidPayload' })
const isThirtyTwoByteHex = (value: string): boolean =>
  /^(?:0x)?[0-9a-fA-F]{64}$/.test(value)

const ethereumNetwork = EthereumSepolia.make({})
const ethCurrency = Eth.make({ network: ethereumNetwork })
const usdcCurrency = Usdc.make({
  network: ethereumNetwork,
  tokenAddress: ethereumSepoliaUsdcAddress,
})

const currencyValue = (
  asset: EthereumTransferAsset,
  atomicUnits: bigint,
  observedAt: number,
): typeof CurrencyValue.Type =>
  CurrencyValue.make({
    currency: asset === 'Eth' ? ethCurrency : usdcCurrency,
    atomicUnits: S.decodeUnknownSync(AtomicUnits)(atomicUnits.toString()),
    decimalPlaces: asset === 'Eth' ? ethDecimalPlaces : usdcDecimalPlaces,
    observedAt,
  })

const assetForDraft = (
  draft: TransferDraft,
): Effect.Effect<EthereumTransferAsset, WalletClientError> =>
  M.value(draft.value.currency).pipe(
    M.withReturnType<Effect.Effect<EthereumTransferAsset, WalletClientError>>(),
    M.tagsExhaustive({
      Eth: ({ network }) =>
        network._tag === 'EthereumSepolia'
          ? Effect.succeed<EthereumTransferAsset>('Eth')
          : Effect.fail(invalidClientResponse()),
      Usdc: ({ network, tokenAddress }) => {
        if (network._tag !== 'EthereumSepolia') {
          return Effect.fail(invalidClientResponse())
        }
        return Effect.try({
          try: () =>
            getAddress(tokenAddress) === getAddress(ethereumSepoliaUsdcAddress),
          catch: invalidClientResponse,
        }).pipe(
          Effect.flatMap(isExpectedAddress =>
            isExpectedAddress
              ? Effect.succeed<EthereumTransferAsset>('Usdc')
              : Effect.fail(invalidClientResponse()),
          ),
        )
      },
      Sol: () => Effect.fail(invalidClientResponse()),
    }),
  )

const serializePreparedTransaction = (payload: EthereumPreparedPayload) =>
  serializeTransaction({
    type: 'eip1559',
    chainId: payload.chainId,
    nonce: payload.nonce,
    gas: BigInt(payload.gas),
    maxFeePerGas: BigInt(payload.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(payload.maxPriorityFeePerGas),
    to: getAddress(payload.to),
    value: BigInt(payload.value),
    data: payload.data === '0x' ? undefined : `0x${payload.data.slice(2)}`,
  })

const decodePreparedPayload = (prepared: PreparedTransaction) =>
  S.decodeUnknownEffect(EthereumPreparedPayloadJson)(
    Redacted.value(prepared.payload),
  )

const decodeSignedPayload = (signed: SignedTransaction) =>
  S.decodeUnknownEffect(EthereumSignedPayloadJson)(
    Redacted.value(signed.payload),
  )

const makeEthereumTransport = Effect.gen(function* () {
  const config = yield* EthereumSepoliaNodeConfig
  const accountAddress = yield* Effect.try({
    try: () => getAddress(config.address),
    catch: invalidClientResponse,
  })
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(Redacted.value(config.httpRpcUrl)),
  })
  const subscriptionClient = createPublicClient({
    chain: sepolia,
    transport: webSocket(Redacted.value(config.webSocketRpcUrl)),
  })
  const account = WalletAccount.make({
    accountId: config.accountId,
    network: ethereumNetwork,
    address: accountAddress,
    displayName: config.displayName,
  })

  const loadPortfolio: Effect.Effect<ChainPortfolio, WalletClientError> =
    Effect.tryPromise({
      try: async () => {
        const observedAt = Date.now()
        const [ethBalance, usdcBalance] = await Promise.all([
          publicClient.getBalance({ address: accountAddress }),
          publicClient.readContract({
            abi: erc20Abi,
            address: getAddress(ethereumSepoliaUsdcAddress),
            functionName: 'balanceOf',
            args: [accountAddress],
          }),
        ])
        return {
          account,
          observedAt,
          balances: [
            AccountBalance.make({
              accountId: account.accountId,
              value: currencyValue('Eth', ethBalance, observedAt),
            }),
            AccountBalance.make({
              accountId: account.accountId,
              value: currencyValue('Usdc', usdcBalance, observedAt),
            }),
          ],
          receivingInstructions: [
            ReceivingInstruction.make({
              accountId: account.accountId,
              network: ethereumNetwork,
              currency: ethCurrency,
              destinationAddress: account.address,
              maybeMemo: Option.none(),
              portableUri: `ethereum:${account.address}@${ethereumChainId}`,
            }),
            ReceivingInstruction.make({
              accountId: account.accountId,
              network: ethereumNetwork,
              currency: usdcCurrency,
              destinationAddress: account.address,
              maybeMemo: Option.none(),
              portableUri: `ethereum:${ethereumSepoliaUsdcAddress}@${ethereumChainId}/transfer?address=${account.address}`,
            }),
          ],
        }
      },
      catch: toClientError,
    })

  const previewTransaction = (
    draft: TransferDraft,
  ): Effect.Effect<TransactionQuote, WalletClientError> =>
    Effect.gen(function* () {
      if (
        draft.accountId !== account.accountId ||
        draft.network._tag !== 'EthereumSepolia'
      ) {
        return yield* Effect.fail(invalidClientResponse())
      }
      const asset = yield* assetForDraft(draft)
      const destination = yield* Effect.try({
        try: () => getAddress(draft.destinationAddress),
        catch: invalidClientResponse,
      })
      const atomicUnits = yield* Effect.try({
        try: () => BigInt(draft.value.atomicUnits),
        catch: invalidClientResponse,
      })
      const observedAt = Date.now()
      const result = yield* Effect.tryPromise({
        try: async () => {
          const fees = await publicClient.estimateFeesPerGas({
            type: 'eip1559',
          })
          if (asset === 'Eth') {
            const [balance, gas] = await Promise.all([
              publicClient.getBalance({ address: accountAddress }),
              publicClient.estimateGas({
                account: accountAddress,
                to: destination,
                value: atomicUnits,
              }),
            ])
            const estimatedFee = gas * fees.maxFeePerGas
            return {
              estimatedFee,
              resultingBalance: balance - atomicUnits - estimatedFee,
              resultingAsset: asset,
            }
          } else {
            const [balance, gas] = await Promise.all([
              publicClient.readContract({
                abi: erc20Abi,
                address: getAddress(ethereumSepoliaUsdcAddress),
                functionName: 'balanceOf',
                args: [accountAddress],
              }),
              publicClient.estimateContractGas({
                abi: erc20Abi,
                account: accountAddress,
                address: getAddress(ethereumSepoliaUsdcAddress),
                functionName: 'transfer',
                args: [destination, atomicUnits],
              }),
            ])
            return {
              estimatedFee: gas * fees.maxFeePerGas,
              resultingBalance: balance - atomicUnits,
              resultingAsset: asset,
            }
          }
        },
        catch: toClientError,
      })
      return TransactionQuote.make({
        quoteId: `${draft.transferId}:${observedAt}`,
        estimatedFee: currencyValue('Eth', result.estimatedFee, observedAt),
        resultingBalance: currencyValue(
          result.resultingAsset,
          result.resultingBalance,
          observedAt,
        ),
        expiresAt: observedAt + quoteLifetimeMilliseconds,
      })
    })

  const prepareTransaction = (
    preview: TransactionPreview,
  ): Effect.Effect<PreparedTransaction, WalletClientError> =>
    Effect.gen(function* () {
      if (preview.draft.accountId !== account.accountId) {
        return yield* Effect.fail(invalidClientResponse())
      }
      const asset = yield* assetForDraft(preview.draft)
      const destination = yield* Effect.try({
        try: () => getAddress(preview.draft.destinationAddress),
        catch: invalidClientResponse,
      })
      const atomicUnits = yield* Effect.try({
        try: () => BigInt(preview.draft.value.atomicUnits),
        catch: invalidClientResponse,
      })
      const prepared = yield* Effect.tryPromise({
        try: async () => {
          const data =
            asset === 'Eth'
              ? '0x'
              : encodeFunctionData({
                  abi: erc20Abi,
                  functionName: 'transfer',
                  args: [destination, atomicUnits],
                })
          const to =
            asset === 'Eth'
              ? destination
              : getAddress(ethereumSepoliaUsdcAddress)
          const value = asset === 'Eth' ? atomicUnits : 0n
          const [nonce, fees, gas] = await Promise.all([
            publicClient.getTransactionCount({
              address: accountAddress,
              blockTag: 'pending',
            }),
            publicClient.estimateFeesPerGas({ type: 'eip1559' }),
            publicClient.estimateGas({
              account: accountAddress,
              to,
              value,
              data,
            }),
          ])
          return EthereumPreparedPayload.make({
            previewId: preview.previewId,
            asset,
            chainId: ethereumChainId,
            nonce,
            gas: gas.toString(),
            maxFeePerGas: fees.maxFeePerGas.toString(),
            maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
            to,
            value: value.toString(),
            data,
          })
        },
        catch: toClientError,
      })
      return makePreparedTransaction(
        account.accountId,
        ethereumNetwork,
        S.encodeSync(EthereumPreparedPayloadJson)(prepared),
      )
    })

  const submitTransaction = (
    signed: SignedTransaction,
  ): Effect.Effect<TransactionSubmission, WalletClientError> => {
    if (
      signed.accountId !== account.accountId ||
      signed.network._tag !== 'EthereumSepolia'
    ) {
      return Effect.fail(invalidClientResponse())
    }
    return decodeSignedPayload(signed).pipe(
      Effect.mapError(invalidClientResponse),
      Effect.flatMap(payload =>
        Effect.tryPromise({
          try: async () => {
            const transactionId = await publicClient.sendRawTransaction({
              serializedTransaction: `0x${payload.rawTransaction.slice(2)}`,
            })
            return TransactionSubmission.make({
              previewId: payload.previewId,
              transactionId,
              submittedAt: Date.now(),
              maybeExplorerConfirmation: Option.some(
                blockExplorerConfirmation(ethereumNetwork, transactionId),
              ),
            })
          },
          catch: toClientError,
        }),
      ),
    )
  }

  const offerUsdcLogs = (
    queue: Queue.Queue<
      typeof TransactionRecord.Type,
      WalletClientError | Cause.Done
    >,
    logs: ReadonlyArray<unknown>,
  ) => {
    Array_.forEach(logs, encodedLog => {
      const maybeLog = S.decodeUnknownOption(Erc20ObservedLog)(encodedLog)
      if (Option.isNone(maybeLog)) {
        return
      }
      const log = maybeLog.value
      const { from, to, value } = log.args
      if (
        from === undefined ||
        to === undefined ||
        value === undefined ||
        log.blockNumber === null ||
        log.logIndex === null ||
        log.transactionHash === null
      ) {
        return
      }
      void publicClient
        .getBlock({ blockNumber: log.blockNumber })
        .then(block => {
          const isOutgoing = getAddress(from) === getAddress(account.address)
          Queue.offerUnsafe(
            queue,
            TransactionRecord.make({
              transactionId: `${log.transactionHash}:${log.logIndex}`,
              accountId: account.accountId,
              network: ethereumNetwork,
              direction: isOutgoing ? 'Outgoing' : 'Incoming',
              status: 'Confirmed',
              value: currencyValue(
                'Usdc',
                value,
                Number(block.timestamp) * 1_000,
              ),
              counterpartyAddress: isOutgoing ? to : from,
              observedAt: Number(block.timestamp) * 1_000,
            }),
          )
        })
        .catch(() => {
          Queue.failCauseUnsafe(queue, Cause.fail(toClientError()))
        })
    })
  }

  const observeTransactions = Stream.callback<
    typeof TransactionRecord.Type,
    WalletClientError
  >(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const unwatchBlocks = subscriptionClient.watchBlockNumber({
          onBlockNumber: blockNumber => {
            void publicClient
              .getBlock({ blockNumber, includeTransactions: true })
              .then(block => {
                Array_.forEach(block.transactions, transaction => {
                  const isOutgoing =
                    getAddress(transaction.from) === getAddress(account.address)
                  const isIncoming =
                    transaction.to !== null &&
                    getAddress(transaction.to) === getAddress(account.address)
                  if (!isOutgoing && !isIncoming) {
                    return
                  }
                  void publicClient
                    .getTransactionReceipt({ hash: transaction.hash })
                    .then(receipt => {
                      const observedAt = Number(block.timestamp) * 1_000
                      Queue.offerUnsafe(
                        queue,
                        TransactionRecord.make({
                          transactionId: transaction.hash,
                          accountId: account.accountId,
                          network: ethereumNetwork,
                          direction: isOutgoing ? 'Outgoing' : 'Incoming',
                          status:
                            receipt.status === 'success'
                              ? 'Confirmed'
                              : 'Failed',
                          value: currencyValue(
                            'Eth',
                            transaction.value,
                            observedAt,
                          ),
                          counterpartyAddress: isOutgoing
                            ? (transaction.to ?? account.address)
                            : transaction.from,
                          observedAt,
                        }),
                      )
                    })
                    .catch(() => {
                      Queue.failCauseUnsafe(queue, Cause.fail(toClientError()))
                    })
                })
              })
              .catch(() => {
                Queue.failCauseUnsafe(queue, Cause.fail(toClientError()))
              })
          },
          onError: () => {
            Queue.failCauseUnsafe(queue, Cause.fail(toClientError()))
          },
        })
        const unwatchOutgoingUsdc = subscriptionClient.watchEvent({
          address: getAddress(ethereumSepoliaUsdcAddress),
          event: erc20TransferEvent,
          args: { from: accountAddress },
          poll: false,
          onLogs: logs => offerUsdcLogs(queue, logs),
          onError: () => {
            Queue.failCauseUnsafe(queue, Cause.fail(toClientError()))
          },
        })
        const unwatchIncomingUsdc = subscriptionClient.watchEvent({
          address: getAddress(ethereumSepoliaUsdcAddress),
          event: erc20TransferEvent,
          args: { to: accountAddress },
          poll: false,
          onLogs: logs => offerUsdcLogs(queue, logs),
          onError: () => {
            Queue.failCauseUnsafe(queue, Cause.fail(toClientError()))
          },
        })
        return () => {
          unwatchBlocks()
          unwatchOutgoingUsdc()
          unwatchIncomingUsdc()
        }
      }),
      unsubscribe => Effect.sync(unsubscribe),
    ).pipe(Effect.flatMap(() => Effect.never)),
  )

  return EthereumSepoliaTransport.of({
    network: ethereumNetwork,
    account,
    loadPortfolio,
    previewTransaction,
    prepareTransaction,
    submitTransaction,
    observeTransactions,
    digestTransaction: prepared => {
      if (
        prepared.accountId !== account.accountId ||
        prepared.network._tag !== 'EthereumSepolia'
      ) {
        return Effect.fail(invalidCryptoPayload())
      }
      return decodePreparedPayload(prepared).pipe(
        Effect.mapError(invalidCryptoPayload),
        Effect.flatMap(payload =>
          Effect.try({
            try: () =>
              makeSigningDigest(
                keccak256(serializePreparedTransaction(payload)),
              ),
            catch: invalidCryptoPayload,
          }),
        ),
      )
    },
    verifySignatureProof: (
      challenge: SigningChallenge,
      proof: SignatureProof,
    ) =>
      M.value(proof).pipe(
        M.withReturnType<Effect.Effect<boolean, WalletCryptoError>>(),
        M.tagsExhaustive({
          EthereumSignatureProof: ethereumProof => {
            if (
              challenge.accountId !== account.accountId ||
              challenge.digest.algorithm !== 'Keccak256' ||
              !isThirtyTwoByteHex(challenge.digest.digestHex) ||
              ethereumProof.challengeId !== challenge.challengeId ||
              ethereumProof.accountId !== challenge.accountId
            ) {
              return Effect.succeed(false)
            }
            return Effect.tryPromise({
              try: async () => {
                const proofAddress = getAddress(ethereumProof.address)
                if (proofAddress !== accountAddress) {
                  return false
                }
                return verifyMessage({
                  address: proofAddress,
                  message: {
                    raw: `0x${challenge.digest.digestHex.replace(/^0x/, '')}`,
                  },
                  signature: `0x${ethereumProof.signatureHex.replace(/^0x/, '')}`,
                })
              },
              catch: () =>
                new WalletCryptoError({ code: 'VerificationFailed' }),
            })
          },
          SolanaEd25519SignatureProof: () => Effect.succeed(false),
        }),
      ),
  })
})

/** viem-backed Ethereum Sepolia networking with WebSocket observation. */
export const EthereumSepoliaTransportLive = Layer.effect(
  EthereumSepoliaTransport,
  makeEthereumTransport,
)

const makeEthereumCustody = Effect.gen(function* () {
  const nodeConfig = yield* EthereumSepoliaNodeConfig
  const keyConfig = yield* EthereumSepoliaKeyConfig
  const localAccount = yield* Effect.try({
    try: () =>
      privateKeyToAccount(
        `0x${Redacted.value(keyConfig.privateKeyHex).replace(/^0x/, '')}`,
      ),
    catch: () => new WalletSignerError({ code: 'Unavailable' }),
  })
  const configuredAddress = yield* Effect.try({
    try: () => getAddress(nodeConfig.address),
    catch: () => new WalletSignerError({ code: 'Unavailable' }),
  })
  if (
    keyConfig.accountId !== nodeConfig.accountId ||
    getAddress(localAccount.address) !== configuredAddress
  ) {
    return yield* Effect.fail(
      new WalletSignerError({ code: 'UnsupportedAccount' }),
    )
  }
  return EthereumSepoliaCustody.of({
    accountId: keyConfig.accountId,
    signTransaction: (prepared: PreparedTransaction, digest: SigningDigest) => {
      if (
        prepared.accountId !== keyConfig.accountId ||
        prepared.network._tag !== 'EthereumSepolia'
      ) {
        return Effect.fail(
          new WalletSignerError({ code: 'UnsupportedAccount' }),
        )
      }
      return decodePreparedPayload(prepared).pipe(
        Effect.mapError(() => new WalletSignerError({ code: 'Unavailable' })),
        Effect.flatMap(payload => {
          const serialized = serializePreparedTransaction(payload)
          if (keccak256(serialized) !== Redacted.value(digest)) {
            return Effect.fail(new WalletSignerError({ code: 'Denied' }))
          }
          return Effect.tryPromise({
            try: async () => {
              const rawTransaction = await localAccount.signTransaction(
                parseTransaction(serialized),
              )
              return makeSignedTransaction(
                prepared.accountId,
                ethereumNetwork,
                S.encodeSync(EthereumSignedPayloadJson)({
                  previewId: payload.previewId,
                  rawTransaction,
                }),
              )
            },
            catch: () => new WalletSignerError({ code: 'Denied' }),
          })
        }),
      )
    },
    signChallenge: challenge =>
      challenge.accountId === keyConfig.accountId &&
      challenge.digest.algorithm === 'Keccak256' &&
      isThirtyTwoByteHex(challenge.digest.digestHex)
        ? Effect.tryPromise({
            try: async () =>
              EthereumSignatureProof.make({
                challengeId: challenge.challengeId,
                accountId: challenge.accountId,
                address: localAccount.address,
                signatureHex: await localAccount.signMessage({
                  message: {
                    raw: `0x${challenge.digest.digestHex.replace(/^0x/, '')}`,
                  },
                }),
              }),
            catch: () => new WalletSignerError({ code: 'Denied' }),
          })
        : Effect.fail(new WalletSignerError({ code: 'UnsupportedAccount' })),
  })
})

/** Optional viem local-key custody backed by Redacted environment configuration. */
export const EthereumSepoliaLocalCustodyLive = Layer.effect(
  EthereumSepoliaCustody,
  makeEthereumCustody,
)
