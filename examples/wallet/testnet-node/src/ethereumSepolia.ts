import {
  Array as Array_,
  Cause,
  Effect,
  Layer,
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
  AssetAmount,
  AssetDescriptor,
  AtomicUnits,
  ChainDescriptor,
  IssuedAsset,
  NativeAsset,
  NetworkDescriptor,
  ReceivingInstruction,
  RejectedTransfer,
  type SignatureProof,
  SignatureProof as SignatureProofSchema,
  type SignedTransaction,
  type SigningChallenge,
  TransactionHistoryPage,
  type TransactionPayload,
  type TransactionPreview,
  TransactionQuote,
  TransactionRecord,
  TransactionSubmission,
  TransferGuidance,
  type TransferRequest,
  ValidatedRecipient,
  type ValidatedTransfer,
  ValidatedTransfer as ValidatedTransferSchema,
  WalletAccount,
  WalletClientError,
  WalletCryptoError,
  WalletSignerError,
  makeSignedTransaction,
  makeTransactionPayload,
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

const ethereumNumericChainId = 11_155_111
const ethereumChainId = 'ethereum'
const ethereumNetworkId = 'ethereum:sepolia'
const ethereumEthAssetId = 'ethereum:sepolia:eth'
const ethereumUsdcAssetId = 'ethereum:sepolia:usdc'
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
const isThirtyTwoByteHex = (value: string): boolean =>
  /^(?:0x)?[0-9a-fA-F]{64}$/.test(value)

const EthereumNetwork = S.TaggedStruct('Ethereum', {
  network: S.Literal('Sepolia'),
  chainId: S.Number,
})
const ethereumAdapterNetwork = EthereumNetwork.make({
  network: 'Sepolia',
  chainId: ethereumNumericChainId,
})
const ethereumChain = ChainDescriptor.make({
  chainId: ethereumChainId,
  displayName: 'Ethereum',
})
const ethereumNetwork = NetworkDescriptor.make({
  networkId: ethereumNetworkId,
  chainId: ethereumChainId,
  displayName: 'Ethereum Sepolia',
  environment: 'Testnet',
  capabilities: ['Transfer', 'TransactionObservation', 'ChallengeSignature'],
})
const ethAsset = AssetDescriptor.make({
  assetId: ethereumEthAssetId,
  networkId: ethereumNetworkId,
  displayName: 'Sepolia Ether',
  symbol: 'ETH',
  decimalPlaces: ethDecimalPlaces,
  kind: NativeAsset.make({}),
})
const usdcAsset = AssetDescriptor.make({
  assetId: ethereumUsdcAssetId,
  networkId: ethereumNetworkId,
  displayName: 'USDC',
  symbol: 'USDC',
  decimalPlaces: usdcDecimalPlaces,
  kind: IssuedAsset.make({ reference: ethereumSepoliaUsdcAddress }),
})
const ethereumAssets = [ethAsset, usdcAsset]

const assetAmount = (
  asset: EthereumTransferAsset,
  atomicUnits: bigint,
  observedAt: number,
): typeof AssetAmount.Type =>
  AssetAmount.make({
    assetId: asset === 'Eth' ? ethereumEthAssetId : ethereumUsdcAssetId,
    atomicUnits: S.decodeUnknownSync(AtomicUnits)(atomicUnits.toString()),
    observedAt,
  })

const assetForTransfer = (
  transfer: ValidatedTransfer,
): Effect.Effect<EthereumTransferAsset, WalletClientError> => {
  if (transfer.request.assetId === ethereumEthAssetId) {
    return Effect.succeed('Eth')
  } else if (transfer.request.assetId === ethereumUsdcAssetId) {
    return Effect.succeed('Usdc')
  } else {
    return Effect.fail(invalidClientResponse())
  }
}

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

const decodePreparedPayload = (prepared: TransactionPayload) =>
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
    networkId: ethereumNetworkId,
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
          chain: ethereumChain,
          network: ethereumNetwork,
          assets: ethereumAssets,
          account,
          observedAt,
          balances: [
            AccountBalance.make({
              accountId: account.accountId,
              amount: assetAmount('Eth', ethBalance, observedAt),
            }),
            AccountBalance.make({
              accountId: account.accountId,
              amount: assetAmount('Usdc', usdcBalance, observedAt),
            }),
          ],
          receivingInstructions: [
            ReceivingInstruction.make({
              accountId: account.accountId,
              assetId: ethereumEthAssetId,
              destinationAddress: account.address,
              maybeMemo: Option.none(),
              portableUri: `ethereum:${account.address}@${ethereumAdapterNetwork.chainId}`,
            }),
            ReceivingInstruction.make({
              accountId: account.accountId,
              assetId: ethereumUsdcAssetId,
              destinationAddress: account.address,
              maybeMemo: Option.none(),
              portableUri: `ethereum:${ethereumSepoliaUsdcAddress}@${ethereumAdapterNetwork.chainId}/transfer?address=${account.address}`,
            }),
          ],
        }
      },
      catch: toClientError,
    })

  const validateTransfer = (
    request: TransferRequest,
  ): Effect.Effect<
    typeof ValidatedTransferSchema.Type | typeof RejectedTransfer.Type,
    WalletClientError
  > => {
    if (
      request.accountId !== account.accountId ||
      (request.assetId !== ethereumEthAssetId &&
        request.assetId !== ethereumUsdcAssetId)
    ) {
      return Effect.succeed(
        RejectedTransfer.make({
          request,
          guidance: TransferGuidance.make({
            summary:
              'This Ethereum adapter does not own that account or asset.',
            details: ['Choose an Ethereum Sepolia account and asset.'],
          }),
        }),
      )
    }
    if (BigInt(request.atomicUnits) <= 0n) {
      return Effect.succeed(
        RejectedTransfer.make({
          request,
          guidance: TransferGuidance.make({
            summary: 'The transfer amount must be positive.',
            details: ['Enter a positive amount in atomic units.'],
          }),
        }),
      )
    }
    return Effect.try({
      try: () => {
        const address = getAddress(request.destinationAddress)
        return ValidatedTransferSchema.make({
          request,
          recipient: ValidatedRecipient.make({
            networkId: ethereumNetworkId,
            address,
            normalizedAddress: address.toLowerCase(),
            displayAddress: address,
          }),
        })
      },
      catch: () =>
        RejectedTransfer.make({
          request,
          guidance: TransferGuidance.make({
            summary: 'That is not a valid Ethereum address.',
            details: [
              'Ethereum addresses contain 20 bytes encoded as 0x-prefixed hexadecimal.',
              'Use a valid checksum or hexadecimal Ethereum address.',
            ],
          }),
        }),
    }).pipe(Effect.catch(rejection => Effect.succeed(rejection)))
  }

  const previewTransfer = (
    transfer: ValidatedTransfer,
  ): Effect.Effect<TransactionQuote, WalletClientError> =>
    Effect.gen(function* () {
      if (
        transfer.request.accountId !== account.accountId ||
        transfer.recipient.networkId !== ethereumNetworkId
      ) {
        return yield* Effect.fail(invalidClientResponse())
      }
      const asset = yield* assetForTransfer(transfer)
      const destination = yield* Effect.try({
        try: () => getAddress(transfer.recipient.address),
        catch: invalidClientResponse,
      })
      const atomicUnits = yield* Effect.try({
        try: () => BigInt(transfer.request.atomicUnits),
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
        quoteId: `${transfer.request.transferId}:${observedAt}`,
        estimatedFee: assetAmount('Eth', result.estimatedFee, observedAt),
        resultingBalance: assetAmount(
          result.resultingAsset,
          result.resultingBalance,
          observedAt,
        ),
        expiresAt: observedAt + quoteLifetimeMilliseconds,
      })
    })

  const buildTransferPayload = (
    preview: TransactionPreview,
  ): Effect.Effect<TransactionPayload, WalletClientError> =>
    Effect.gen(function* () {
      if (preview.transfer.request.accountId !== account.accountId) {
        return yield* Effect.fail(invalidClientResponse())
      }
      const asset = yield* assetForTransfer(preview.transfer)
      const destination = yield* Effect.try({
        try: () => getAddress(preview.transfer.recipient.address),
        catch: invalidClientResponse,
      })
      const atomicUnits = yield* Effect.try({
        try: () => BigInt(preview.transfer.request.atomicUnits),
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
            chainId: ethereumAdapterNetwork.chainId,
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
      return makeTransactionPayload(
        account.accountId,
        ethereumNetworkId,
        S.encodeSync(EthereumPreparedPayloadJson)(prepared),
      )
    })

  const submitTransaction = (
    signed: SignedTransaction,
  ): Effect.Effect<TransactionSubmission, WalletClientError> => {
    if (
      signed.accountId !== account.accountId ||
      signed.networkId !== ethereumNetworkId
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
              maybeExplorerConfirmation: Option.some({
                label: 'Etherscan',
                transactionId,
                url: `https://sepolia.etherscan.io/tx/${transactionId}`,
              }),
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
              recordId: `${log.transactionHash}:${log.logIndex}`,
              transactionId: `${log.transactionHash}:${log.logIndex}`,
              accountId: account.accountId,
              networkId: ethereumNetworkId,
              direction: isOutgoing ? 'Outgoing' : 'Incoming',
              status: 'Confirmed',
              amount: assetAmount(
                'Usdc',
                value,
                Number(block.timestamp) * 1_000,
              ),
              counterpartyAddress: isOutgoing ? to : from,
              normalizedCounterpartyAddress: getAddress(
                isOutgoing ? to : from,
              ).toLowerCase(),
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
                          recordId: transaction.hash,
                          transactionId: transaction.hash,
                          accountId: account.accountId,
                          networkId: ethereumNetworkId,
                          direction: isOutgoing ? 'Outgoing' : 'Incoming',
                          status:
                            receipt.status === 'success'
                              ? 'Confirmed'
                              : 'Failed',
                          amount: assetAmount(
                            'Eth',
                            transaction.value,
                            observedAt,
                          ),
                          counterpartyAddress: isOutgoing
                            ? (transaction.to ?? account.address)
                            : transaction.from,
                          normalizedCounterpartyAddress: getAddress(
                            isOutgoing
                              ? (transaction.to ?? account.address)
                              : transaction.from,
                          ).toLowerCase(),
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
    chain: ethereumChain,
    network: ethereumNetwork,
    assets: ethereumAssets,
    account,
    loadPortfolio,
    validateTransfer,
    previewTransfer,
    buildTransferPayload,
    submitTransaction,
    loadTransactionHistory: () =>
      Effect.succeed(
        TransactionHistoryPage.make({
          records: [],
          maybeNextCursor: Option.none(),
        }),
      ),
    observeTransactions,
    verifySignatureProof: (
      challenge: SigningChallenge,
      proof: SignatureProof,
    ) => {
      if (
        challenge.accountId !== account.accountId ||
        challenge.digest.algorithm !== 'keccak256' ||
        challenge.digest.encoding !== 'hex' ||
        !isThirtyTwoByteHex(challenge.digest.digest) ||
        proof.challengeId !== challenge.challengeId ||
        proof.accountId !== challenge.accountId ||
        proof.algorithm !== 'secp256k1' ||
        proof.encoding !== 'hex'
      ) {
        return Effect.succeed(false)
      }
      return Effect.tryPromise({
        try: async () => {
          const proofAddress = getAddress(proof.publicIdentity)
          if (proofAddress !== accountAddress) {
            return false
          }
          return verifyMessage({
            address: proofAddress,
            message: {
              raw: `0x${challenge.digest.digest.replace(/^0x/, '')}`,
            },
            signature: `0x${proof.signature.replace(/^0x/, '')}`,
          })
        },
        catch: () => new WalletCryptoError({ code: 'VerificationFailed' }),
      })
    },
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
    networkId: ethereumNetworkId,
    signTransaction: (prepared: TransactionPayload) => {
      if (
        prepared.accountId !== keyConfig.accountId ||
        prepared.networkId !== ethereumNetworkId
      ) {
        return Effect.fail(
          new WalletSignerError({ code: 'UnsupportedAccount' }),
        )
      }
      return decodePreparedPayload(prepared).pipe(
        Effect.mapError(() => new WalletSignerError({ code: 'Unavailable' })),
        Effect.flatMap(payload => {
          const serialized = serializePreparedTransaction(payload)
          return Effect.tryPromise({
            try: async () => {
              const rawTransaction = await localAccount.signTransaction(
                parseTransaction(serialized),
              )
              return makeSignedTransaction(
                prepared.accountId,
                ethereumNetworkId,
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
      challenge.digest.algorithm === 'keccak256' &&
      challenge.digest.encoding === 'hex' &&
      isThirtyTwoByteHex(challenge.digest.digest)
        ? Effect.tryPromise({
            try: async () =>
              SignatureProofSchema.make({
                challengeId: challenge.challengeId,
                accountId: challenge.accountId,
                algorithm: 'secp256k1',
                publicIdentity: localAccount.address,
                signature: await localAccount.signMessage({
                  message: {
                    raw: `0x${challenge.digest.digest.replace(/^0x/, '')}`,
                  },
                }),
                encoding: 'hex',
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
