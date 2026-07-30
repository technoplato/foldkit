import {
  Array as Array_,
  Cause,
  Effect,
  Layer,
  Option,
  Order,
  Queue,
  Record as Record_,
  Redacted,
  Schema as S,
  Stream,
} from 'effect'
import {
  AccountBalance,
  AdapterTestFundingMethod,
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
  TestFundingReceipt,
  type TestFundingRequest,
  TransactionHistoryPage,
  type TransactionHistoryQuery,
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

import { getTransferSolInstruction } from '@solana-program/system'
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getTransferCheckedInstruction,
} from '@solana-program/token'
import {
  type GetTransactionApiResponseJsonParsed,
  type TransactionVersion,
  address,
  appendTransactionMessageInstructions,
  blockhash,
  compileTransaction,
  createKeyPairSignerFromBytes,
  createNoopSigner,
  createSignableMessage,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  devnet,
  getBase58Decoder,
  getBase58Encoder,
  getBase64EncodedWireTransaction,
  getPublicKeyFromAddress,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  signature,
  signatureBytes,
  verifySignature,
} from '@solana/kit'

import {
  type ChainPortfolio,
  SolanaDevnetCustody,
  SolanaDevnetTransport,
} from './chainTransport.js'
import { SolanaDevnetKeyConfig, SolanaDevnetNodeConfig } from './config.js'

const solDecimalPlaces = 9
const usdcDecimalPlaces = 6
const solanaChainId = 'solana'
const solanaNetworkId = 'solana:devnet'
const solanaSolAssetId = 'solana:devnet:sol'
const solanaUsdcAssetId = 'solana:devnet:usdc'
const quoteLifetimeMilliseconds = 60_000
const splTokenAccountSpace = 165n
const maximumObservedSignatures = 1_024

/** Circle's USDC mint on Solana Devnet. */
export const solanaDevnetUsdcAddress =
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'

const SolanaTransferAsset = S.Literals(['Sol', 'Usdc'])
type SolanaTransferAsset = typeof SolanaTransferAsset.Type

const SolanaPreparedPayload = S.Struct({
  previewId: S.String,
  asset: SolanaTransferAsset,
  sourceAddress: S.String,
  destinationAddress: S.String,
  atomicUnits: S.String,
  blockhash: S.String,
  lastValidBlockHeight: S.String,
})
const SolanaPreparedPayloadJson = S.fromJsonString(SolanaPreparedPayload)
type SolanaPreparedPayload = typeof SolanaPreparedPayload.Type

const SolanaSignedPayload = S.Struct({
  previewId: S.String,
  wireTransactionBase64: S.String,
})
const SolanaSignedPayloadJson = S.fromJsonString(SolanaSignedPayload)

const JsonRpcFeeResponse = S.Struct({
  result: S.Struct({ value: S.NullOr(S.Number) }),
})
const JsonRpcSendResponse = S.Struct({ result: S.String })
const JsonRpcSignaturesResponse = S.Struct({
  result: S.Array(
    S.Struct({
      signature: S.String,
      blockTime: S.NullOr(S.Number),
    }),
  ),
})

const AtomicAmount = S.Union([S.String, S.Number, S.BigInt])
type AtomicAmount = typeof AtomicAmount.Type

const SystemTransferInstruction = S.Struct({
  program: S.Literal('system'),
  parsed: S.Struct({
    type: S.Literal('transfer'),
    info: S.Struct({
      source: S.String,
      destination: S.String,
      lamports: AtomicAmount,
    }),
  }),
})

const TokenTransferInstruction = S.Struct({
  program: S.Literal('spl-token'),
  parsed: S.Struct({
    type: S.Literals(['transfer', 'transferChecked']),
    info: S.Struct({
      source: S.String,
      destination: S.String,
      authority: S.optional(S.String),
      amount: S.optional(AtomicAmount),
      tokenAmount: S.optional(
        S.Struct({
          amount: AtomicAmount,
          decimals: S.optional(S.Number),
        }),
      ),
      mint: S.optional(S.String),
    }),
  }),
})

const toClientError = () => new WalletClientError({ code: 'Unavailable' })
const invalidClientResponse = () =>
  new WalletClientError({ code: 'InvalidResponse' })
const unsupportedClientCapability = () =>
  new WalletClientError({ code: 'UnsupportedCapability' })
const isThirtyTwoByteHex = (value: string): boolean =>
  /^(?:0x)?[0-9a-fA-F]{64}$/.test(value)

const solanaChain = ChainDescriptor.make({
  chainId: solanaChainId,
  displayName: 'Solana',
})
const solanaNetwork = NetworkDescriptor.make({
  networkId: solanaNetworkId,
  chainId: solanaChainId,
  displayName: 'Solana Devnet',
  environment: 'Development',
  capabilities: [
    'Transfer',
    'TestFunding',
    'TransactionHistory',
    'TransactionObservation',
    'ChallengeSignature',
  ],
  testFundingMethod: AdapterTestFundingMethod.make({}),
})
const solAsset = AssetDescriptor.make({
  assetId: solanaSolAssetId,
  networkId: solanaNetworkId,
  displayName: 'Devnet SOL',
  symbol: 'SOL',
  decimalPlaces: solDecimalPlaces,
  kind: NativeAsset.make({}),
})
const usdcAsset = AssetDescriptor.make({
  assetId: solanaUsdcAssetId,
  networkId: solanaNetworkId,
  displayName: 'USDC',
  symbol: 'USDC',
  decimalPlaces: usdcDecimalPlaces,
  kind: IssuedAsset.make({ reference: solanaDevnetUsdcAddress }),
})
const solanaAssets = [solAsset, usdcAsset]

const assetAmount = (
  asset: SolanaTransferAsset,
  atomicUnits: bigint,
  observedAt: number,
): typeof AssetAmount.Type =>
  AssetAmount.make({
    assetId: asset === 'Sol' ? solanaSolAssetId : solanaUsdcAssetId,
    atomicUnits: S.decodeUnknownSync(AtomicUnits)(atomicUnits.toString()),
    observedAt,
  })

const atomicBigInt = (amount: AtomicAmount): bigint => BigInt(amount)

const assetForTransfer = (
  transfer: ValidatedTransfer,
): Effect.Effect<SolanaTransferAsset, WalletClientError> => {
  if (transfer.request.assetId === solanaSolAssetId) {
    return Effect.succeed('Sol')
  } else if (transfer.request.assetId === solanaUsdcAssetId) {
    return Effect.succeed('Usdc')
  } else {
    return Effect.fail(invalidClientResponse())
  }
}

const decodePreparedPayload = (prepared: TransactionPayload) =>
  S.decodeUnknownEffect(SolanaPreparedPayloadJson)(
    Redacted.value(prepared.payload),
  )

const decodeSignedPayload = (signed: SignedTransaction) =>
  S.decodeUnknownEffect(SolanaSignedPayloadJson)(Redacted.value(signed.payload))

const buildTransactionMessage = async (
  payload: SolanaPreparedPayload,
  signer:
    | ReturnType<typeof createNoopSigner>
    | Awaited<ReturnType<typeof createKeyPairSignerFromBytes>>,
) => {
  const destinationAddress = address(payload.destinationAddress)
  const mintAddress = address(solanaDevnetUsdcAddress)
  const instructions =
    payload.asset === 'Sol'
      ? [
          getTransferSolInstruction({
            source: signer,
            destination: destinationAddress,
            amount: BigInt(payload.atomicUnits),
          }),
        ]
      : await (async () => {
          const [sourceTokenAddress] = await findAssociatedTokenPda({
            owner: signer.address,
            tokenProgram: TOKEN_PROGRAM_ADDRESS,
            mint: mintAddress,
          })
          const [destinationTokenAddress] = await findAssociatedTokenPda({
            owner: destinationAddress,
            tokenProgram: TOKEN_PROGRAM_ADDRESS,
            mint: mintAddress,
          })
          const createDestination =
            await getCreateAssociatedTokenIdempotentInstructionAsync({
              payer: signer,
              ata: destinationTokenAddress,
              owner: destinationAddress,
              mint: mintAddress,
            })
          const transfer = getTransferCheckedInstruction({
            source: sourceTokenAddress,
            mint: mintAddress,
            destination: destinationTokenAddress,
            authority: signer,
            amount: BigInt(payload.atomicUnits),
            decimals: usdcDecimalPlaces,
          })
          return [createDestination, transfer]
        })()
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
  return appendTransactionMessageInstructions(instructions, messageWithLifetime)
}

const jsonRpc = async (
  rpcUrl: Redacted.Redacted<string>,
  method: string,
  params: ReadonlyArray<unknown>,
): Promise<unknown> => {
  const response = await fetch(Redacted.value(rpcUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!response.ok) {
    throw new Error('Solana JSON-RPC request failed')
  }
  return response.json()
}

const feeForMessage = async (
  rpcUrl: Redacted.Redacted<string>,
  messageBytes: Iterable<number>,
): Promise<bigint> => {
  const response = S.decodeUnknownSync(JsonRpcFeeResponse)(
    await jsonRpc(rpcUrl, 'getFeeForMessage', [
      Buffer.from(Array.from(messageBytes)).toString('base64'),
      { commitment: 'confirmed' },
    ]),
  )
  if (response.result.value === null) {
    throw new Error('Solana fee was unavailable')
  }
  return BigInt(response.result.value)
}

const makeSolanaTransport = Effect.gen(function* () {
  const config = yield* SolanaDevnetNodeConfig
  const accountAddress = yield* Effect.try({
    try: () => address(config.address),
    catch: invalidClientResponse,
  })
  const rpc = createSolanaRpc(devnet(Redacted.value(config.httpRpcUrl)))
  const rpcSubscriptions = createSolanaRpcSubscriptions(
    devnet(Redacted.value(config.webSocketRpcUrl)),
  )
  const account = WalletAccount.make({
    accountId: config.accountId,
    chainId: solanaChainId,
    networkId: solanaNetworkId,
    address: accountAddress,
    displayName: config.displayName,
  })
  const mintAddress = address(solanaDevnetUsdcAddress)
  const [accountTokenAddress] = yield* Effect.tryPromise({
    try: () =>
      findAssociatedTokenPda({
        owner: accountAddress,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
        mint: mintAddress,
      }),
    catch: invalidClientResponse,
  })

  const loadPortfolio: Effect.Effect<ChainPortfolio, WalletClientError> =
    Effect.tryPromise({
      try: async () => {
        const observedAt = Date.now()
        const [solBalanceResponse, tokenAccountsResponse] = await Promise.all([
          rpc.getBalance(accountAddress, { commitment: 'confirmed' }).send(),
          rpc
            .getTokenAccountsByOwner(
              accountAddress,
              { mint: mintAddress },
              { commitment: 'confirmed', encoding: 'jsonParsed' },
            )
            .send(),
        ])
        const usdcBalance = Array_.reduce(
          tokenAccountsResponse.value,
          0n,
          (total, tokenAccount) =>
            total +
            BigInt(tokenAccount.account.data.parsed.info.tokenAmount.amount),
        )
        return {
          chain: solanaChain,
          network: solanaNetwork,
          assets: solanaAssets,
          account,
          observedAt,
          balances: [
            AccountBalance.make({
              accountId: account.accountId,
              amount: assetAmount('Sol', solBalanceResponse.value, observedAt),
            }),
            AccountBalance.make({
              accountId: account.accountId,
              amount: assetAmount('Usdc', usdcBalance, observedAt),
            }),
          ],
          receivingInstructions: [
            ReceivingInstruction.make({
              accountId: account.accountId,
              assetId: solanaSolAssetId,
              destinationAddress: account.address,
              maybeMemo: Option.none(),
              portableUri: `solana:${account.address}?cluster=devnet`,
            }),
            ReceivingInstruction.make({
              accountId: account.accountId,
              assetId: solanaUsdcAssetId,
              destinationAddress: account.address,
              maybeMemo: Option.none(),
              portableUri: `solana:${account.address}?cluster=devnet&spl-token=${solanaDevnetUsdcAddress}`,
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
      (request.assetId !== solanaSolAssetId &&
        request.assetId !== solanaUsdcAssetId)
    ) {
      return Effect.succeed(
        RejectedTransfer.make({
          request,
          guidance: TransferGuidance.make({
            summary: 'This Solana adapter does not own that account or asset.',
            details: ['Choose a Solana Devnet account and asset.'],
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
        const destination = address(request.destinationAddress)
        return ValidatedTransferSchema.make({
          request,
          recipient: ValidatedRecipient.make({
            networkId: solanaNetworkId,
            address: destination,
            normalizedAddress: destination,
            displayAddress: destination,
          }),
        })
      },
      catch: () =>
        RejectedTransfer.make({
          request,
          guidance: TransferGuidance.make({
            summary: 'That is not a valid Solana address.',
            details: [
              'Solana addresses are base58-encoded public keys.',
              'Use a valid account address on Solana Devnet.',
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
        transfer.recipient.networkId !== solanaNetworkId
      ) {
        return yield* Effect.fail(invalidClientResponse())
      }
      const asset = yield* assetForTransfer(transfer)
      const destinationAddress = yield* Effect.try({
        try: () => address(transfer.recipient.address),
        catch: invalidClientResponse,
      })
      const atomicUnits = yield* Effect.try({
        try: () => BigInt(transfer.request.atomicUnits),
        catch: invalidClientResponse,
      })
      const observedAt = Date.now()
      const quote = yield* Effect.tryPromise({
        try: async () => {
          const [latestBlockhash, solBalance, tokenAccounts] =
            await Promise.all([
              rpc.getLatestBlockhash({ commitment: 'confirmed' }).send(),
              rpc
                .getBalance(accountAddress, { commitment: 'confirmed' })
                .send(),
              rpc
                .getTokenAccountsByOwner(
                  accountAddress,
                  { mint: mintAddress },
                  { commitment: 'confirmed', encoding: 'jsonParsed' },
                )
                .send(),
            ])
          const payload = SolanaPreparedPayload.make({
            previewId: `${transfer.request.transferId}:${observedAt}`,
            asset,
            sourceAddress: account.address,
            destinationAddress,
            atomicUnits: atomicUnits.toString(),
            blockhash: latestBlockhash.value.blockhash,
            lastValidBlockHeight:
              latestBlockhash.value.lastValidBlockHeight.toString(),
          })
          const message = await buildTransactionMessage(
            payload,
            createNoopSigner(accountAddress),
          )
          const transactionFee = await feeForMessage(
            config.httpRpcUrl,
            compileTransaction(message).messageBytes,
          )
          if (asset === 'Sol') {
            return {
              fee: transactionFee,
              resultingBalance: solBalance.value - atomicUnits - transactionFee,
              resultingAsset: asset,
            }
          } else {
            const usdcBalance = Array_.reduce(
              tokenAccounts.value,
              0n,
              (total, tokenAccount) =>
                total +
                BigInt(
                  tokenAccount.account.data.parsed.info.tokenAmount.amount,
                ),
            )
            const [destinationTokenAddress] = await findAssociatedTokenPda({
              owner: destinationAddress,
              tokenProgram: TOKEN_PROGRAM_ADDRESS,
              mint: mintAddress,
            })
            const [destinationTokenAccount, rent] = await Promise.all([
              rpc
                .getAccountInfo(destinationTokenAddress, {
                  commitment: 'confirmed',
                  encoding: 'base64',
                })
                .send(),
              rpc
                .getMinimumBalanceForRentExemption(splTokenAccountSpace)
                .send(),
            ])
            const accountCreationRent =
              destinationTokenAccount.value === null ? rent : 0n
            return {
              fee: transactionFee + accountCreationRent,
              resultingBalance: usdcBalance - atomicUnits,
              resultingAsset: asset,
            }
          }
        },
        catch: toClientError,
      })
      return TransactionQuote.make({
        quoteId: `${transfer.request.transferId}:${observedAt}`,
        estimatedFee: assetAmount('Sol', quote.fee, observedAt),
        resultingBalance: assetAmount(
          quote.resultingAsset,
          quote.resultingBalance,
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
      const destinationAddress = yield* Effect.try({
        try: () => address(preview.transfer.recipient.address),
        catch: invalidClientResponse,
      })
      const atomicUnits = yield* Effect.try({
        try: () => BigInt(preview.transfer.request.atomicUnits),
        catch: invalidClientResponse,
      })
      const latestBlockhash = yield* Effect.tryPromise({
        try: () => rpc.getLatestBlockhash({ commitment: 'confirmed' }).send(),
        catch: toClientError,
      })
      const payload = SolanaPreparedPayload.make({
        previewId: preview.previewId,
        asset,
        sourceAddress: account.address,
        destinationAddress,
        atomicUnits: atomicUnits.toString(),
        blockhash: latestBlockhash.value.blockhash,
        lastValidBlockHeight:
          latestBlockhash.value.lastValidBlockHeight.toString(),
      })
      return makeTransactionPayload(
        account.accountId,
        solanaNetworkId,
        S.encodeSync(SolanaPreparedPayloadJson)(payload),
      )
    })

  const submitTransaction = (
    signed: SignedTransaction,
  ): Effect.Effect<TransactionSubmission, WalletClientError> => {
    if (
      signed.accountId !== account.accountId ||
      signed.networkId !== solanaNetworkId
    ) {
      return Effect.fail(invalidClientResponse())
    }
    return decodeSignedPayload(signed).pipe(
      Effect.mapError(invalidClientResponse),
      Effect.flatMap(payload =>
        Effect.tryPromise({
          try: async () => {
            const response = S.decodeUnknownSync(JsonRpcSendResponse)(
              await jsonRpc(config.httpRpcUrl, 'sendTransaction', [
                payload.wireTransactionBase64,
                {
                  encoding: 'base64',
                  preflightCommitment: 'confirmed',
                },
              ]),
            )
            return TransactionSubmission.make({
              previewId: payload.previewId,
              transactionId: response.result,
              submittedAt: Date.now(),
              maybeExplorerConfirmation: Option.some({
                label: 'Solana Explorer',
                transactionId: response.result,
                url: `https://explorer.solana.com/tx/${response.result}?cluster=devnet`,
              }),
            })
          },
          catch: toClientError,
        }),
      ),
    )
  }

  const maybeTokenOwner = (
    tokenAddress: string,
    transaction: GetTransactionApiResponseJsonParsed<void | TransactionVersion> | null,
  ): Option.Option<string> => {
    if (transaction === null || transaction.meta === null) {
      return Option.none()
    }
    const tokenBalances = Array_.appendAll(
      transaction.meta.preTokenBalances ?? [],
      transaction.meta.postTokenBalances ?? [],
    )
    return Array_.findFirst(tokenBalances, tokenBalance => {
      const maybeAccount = Array_.get(
        transaction.transaction.message.accountKeys,
        tokenBalance.accountIndex,
      )
      return (
        Option.isSome(maybeAccount) &&
        maybeAccount.value.pubkey === tokenAddress
      )
    }).pipe(
      Option.flatMap(tokenBalance => Option.fromNullishOr(tokenBalance.owner)),
    )
  }

  const recordsForTransaction = async (
    transactionSignature: string,
    transaction: GetTransactionApiResponseJsonParsed<void | TransactionVersion> | null,
    observedAtFallback: number,
  ): Promise<ReadonlyArray<typeof TransactionRecord.Type>> => {
    if (transaction === null || transaction.meta === null) {
      return []
    }
    const observedAt =
      transaction.blockTime === null
        ? observedAtFallback
        : Number(transaction.blockTime) * 1_000
    const status = transaction.meta.err === null ? 'Confirmed' : 'Failed'
    const innerInstructions = Array_.flatMap(
      transaction.meta.innerInstructions ?? [],
      inner => inner.instructions,
    )
    const instructions = Array_.appendAll(
      transaction.transaction.message.instructions,
      innerInstructions,
    )
    return Array_.getSomes(
      Array_.map(instructions, (instruction, instructionIndex) => {
        const maybeSystem = S.decodeUnknownOption(SystemTransferInstruction)(
          instruction,
        )
        if (Option.isSome(maybeSystem)) {
          const info = maybeSystem.value.parsed.info
          const isOutgoing = info.source === account.address
          const isIncoming = info.destination === account.address
          if (!isOutgoing && !isIncoming) {
            return Option.none()
          }
          return Option.some(
            TransactionRecord.make({
              recordId: `${transactionSignature}:${instructionIndex}`,
              transactionId: `${transactionSignature}:${instructionIndex}`,
              accountId: account.accountId,
              networkId: solanaNetworkId,
              direction: isOutgoing ? 'Outgoing' : 'Incoming',
              status,
              amount: assetAmount(
                'Sol',
                atomicBigInt(info.lamports),
                observedAt,
              ),
              counterpartyAddress: isOutgoing ? info.destination : info.source,
              normalizedCounterpartyAddress: isOutgoing
                ? info.destination
                : info.source,
              observedAt,
            }),
          )
        }
        const maybeToken = S.decodeUnknownOption(TokenTransferInstruction)(
          instruction,
        )
        if (Option.isNone(maybeToken)) {
          return Option.none()
        }
        const info = maybeToken.value.parsed.info
        const isOutgoing = info.source === accountTokenAddress
        const isIncoming = info.destination === accountTokenAddress
        if (!isOutgoing && !isIncoming) {
          return Option.none()
        }
        const maybeAmount = Option.fromNullishOr(
          info.tokenAmount?.amount ?? info.amount,
        )
        if (Option.isNone(maybeAmount)) {
          return Option.none()
        }
        const counterpartyTokenAddress = isOutgoing
          ? info.destination
          : info.source
        const maybeCounterpartyOwner = maybeTokenOwner(
          counterpartyTokenAddress,
          transaction,
        )
        return Option.some(
          TransactionRecord.make({
            recordId: `${transactionSignature}:${instructionIndex}`,
            transactionId: `${transactionSignature}:${instructionIndex}`,
            accountId: account.accountId,
            networkId: solanaNetworkId,
            direction: isOutgoing ? 'Outgoing' : 'Incoming',
            status,
            amount: assetAmount(
              'Usdc',
              atomicBigInt(maybeAmount.value),
              observedAt,
            ),
            counterpartyAddress: Option.getOrElse(
              maybeCounterpartyOwner,
              () => counterpartyTokenAddress,
            ),
            normalizedCounterpartyAddress: Option.getOrElse(
              maybeCounterpartyOwner,
              () => counterpartyTokenAddress,
            ),
            observedAt,
          }),
        )
      }),
    )
  }

  const observeTransactions = Stream.callback<
    typeof TransactionRecord.Type,
    WalletClientError
  >(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const abortController = new AbortController()
        const observedSignatures = new Set<string>()
        const rememberSignature = (transactionSignature: string): boolean => {
          if (observedSignatures.has(transactionSignature)) {
            return false
          }
          observedSignatures.add(transactionSignature)
          if (observedSignatures.size > maximumObservedSignatures) {
            const oldestSignature = observedSignatures.values().next()
            if (!oldestSignature.done) {
              observedSignatures.delete(oldestSignature.value)
            }
          }
          return true
        }
        const observeAddress = async (
          subscribedAddress: typeof accountAddress,
        ) => {
          const notifications = await rpcSubscriptions
            .logsNotifications(
              { mentions: [subscribedAddress] },
              { commitment: 'confirmed' },
            )
            .subscribe({ abortSignal: abortController.signal })
          for await (const notification of notifications) {
            if (!rememberSignature(notification.value.signature)) {
              continue
            }
            const observedAt = Date.now()
            const transaction = await rpc
              .getTransaction(notification.value.signature, {
                commitment: 'confirmed',
                encoding: 'jsonParsed',
                maxSupportedTransactionVersion: 0,
              })
              .send()
            const records = await recordsForTransaction(
              notification.value.signature,
              transaction,
              observedAt,
            )
            Array_.forEach(records, record => {
              Queue.offerUnsafe(queue, record)
            })
          }
        }
        void Promise.all([
          observeAddress(accountAddress),
          observeAddress(accountTokenAddress),
        ]).catch(() => {
          if (!abortController.signal.aborted) {
            Queue.failCauseUnsafe(queue, Cause.fail(toClientError()))
          }
        })
        return abortController
      }),
      abortController =>
        Effect.sync(() => {
          abortController.abort()
        }),
    ).pipe(Effect.flatMap(() => Effect.never)),
  )

  const requestTestFunding = (
    request: TestFundingRequest,
  ): Effect.Effect<TestFundingReceipt, WalletClientError> => {
    if (
      request.accountId !== account.accountId ||
      request.chainId !== solanaChainId ||
      request.networkId !== solanaNetworkId ||
      request.environment !== 'Development' ||
      request.assetId !== solanaSolAssetId
    ) {
      return Effect.fail(unsupportedClientCapability())
    }
    const atomicUnits = BigInt(request.atomicUnits)
    if (atomicUnits <= 0n || atomicUnits > BigInt(Number.MAX_SAFE_INTEGER)) {
      return Effect.fail(new WalletClientError({ code: 'Rejected' }))
    }
    return Effect.tryPromise({
      try: async () => {
        const acceptedAt = Date.now()
        const response = S.decodeUnknownSync(JsonRpcSendResponse)(
          await jsonRpc(config.httpRpcUrl, 'requestAirdrop', [
            account.address,
            Number(atomicUnits),
            { commitment: 'confirmed' },
          ]),
        )
        return TestFundingReceipt.make({
          requestId: request.requestId,
          fundingId: response.result,
          acceptedAt,
          amount: assetAmount('Sol', atomicUnits, acceptedAt),
          maybeTransactionId: Option.some(response.result),
        })
      },
      catch: toClientError,
    })
  }

  const loadTransactionHistory = (
    query: TransactionHistoryQuery,
  ): Effect.Effect<TransactionHistoryPage, WalletClientError> => {
    if (
      query.accountId !== account.accountId ||
      query.networkId !== solanaNetworkId
    ) {
      return Effect.fail(unsupportedClientCapability())
    }
    return Effect.tryPromise({
      try: async () => {
        const signatureOptions = Option.isSome(query.maybeCursor)
          ? {
              commitment: 'confirmed',
              limit: query.limit,
              before: query.maybeCursor.value,
            }
          : { commitment: 'confirmed', limit: query.limit }
        const response = S.decodeUnknownSync(JsonRpcSignaturesResponse)(
          await jsonRpc(config.httpRpcUrl, 'getSignaturesForAddress', [
            account.address,
            signatureOptions,
          ]),
        )
        const recordGroups = await Promise.all(
          Array_.map(response.result, async item => {
            const transaction = await rpc
              .getTransaction(signature(item.signature), {
                commitment: 'confirmed',
                encoding: 'jsonParsed',
                maxSupportedTransactionVersion: 0,
              })
              .send()
            return recordsForTransaction(
              item.signature,
              transaction,
              item.blockTime === null ? Date.now() : item.blockTime * 1_000,
            )
          }),
        )
        const maybeLastSignature = Array_.last(response.result)
        return TransactionHistoryPage.make({
          records: Array_.sortWith(
            Array_.flatten(recordGroups),
            record => record.observedAt,
            Order.flip(Order.Number),
          ),
          maybeNextCursor:
            Array_.length(response.result) === query.limit &&
            Option.isSome(maybeLastSignature)
              ? Option.some(maybeLastSignature.value.signature)
              : Option.none(),
        })
      },
      catch: toClientError,
    })
  }

  return SolanaDevnetTransport.of({
    chain: solanaChain,
    network: solanaNetwork,
    assets: solanaAssets,
    account,
    loadPortfolio,
    validateTransfer,
    previewTransfer,
    buildTransferPayload,
    submitTransaction,
    requestTestFunding,
    loadTransactionHistory,
    observeTransactions,
    verifySignatureProof: (
      challenge: SigningChallenge,
      proof: SignatureProof,
    ) => {
      if (
        challenge.accountId !== account.accountId ||
        challenge.digest.encoding !== 'hex' ||
        !isThirtyTwoByteHex(challenge.digest.digest) ||
        proof.challengeId !== challenge.challengeId ||
        proof.accountId !== challenge.accountId ||
        proof.algorithm !== 'ed25519' ||
        proof.encoding !== 'base58' ||
        proof.publicIdentity !== account.address
      ) {
        return Effect.succeed(false)
      }
      return Effect.tryPromise({
        try: async () => {
          const publicKey = await getPublicKeyFromAddress(accountAddress)
          const proofBytes = getBase58Encoder().encode(proof.signature)
          return verifySignature(
            publicKey,
            signatureBytes(proofBytes),
            Buffer.from(challenge.digest.digest.replace(/^0x/, ''), 'hex'),
          )
        },
        catch: () => new WalletCryptoError({ code: 'VerificationFailed' }),
      })
    },
  })
})

/** @solana/kit-backed Solana Devnet networking with logs subscriptions. */
export const SolanaDevnetTransportLive = Layer.effect(
  SolanaDevnetTransport,
  makeSolanaTransport,
)

const makeSolanaCustody = Effect.gen(function* () {
  const nodeConfig = yield* SolanaDevnetNodeConfig
  const keyConfig = yield* SolanaDevnetKeyConfig
  const signer = yield* Effect.tryPromise({
    try: () =>
      createKeyPairSignerFromBytes(
        Buffer.from(Redacted.value(keyConfig.secretKeyBase64), 'base64'),
      ),
    catch: () => new WalletSignerError({ code: 'Unavailable' }),
  })
  const configuredAddress = yield* Effect.try({
    try: () => address(nodeConfig.address),
    catch: () => new WalletSignerError({ code: 'Unavailable' }),
  })
  if (
    keyConfig.accountId !== nodeConfig.accountId ||
    signer.address !== configuredAddress
  ) {
    return yield* Effect.fail(
      new WalletSignerError({ code: 'UnsupportedAccount' }),
    )
  }
  return SolanaDevnetCustody.of({
    accountId: keyConfig.accountId,
    networkId: solanaNetworkId,
    signTransaction: (prepared: TransactionPayload) => {
      if (
        prepared.accountId !== keyConfig.accountId ||
        prepared.networkId !== solanaNetworkId
      ) {
        return Effect.fail(
          new WalletSignerError({ code: 'UnsupportedAccount' }),
        )
      }
      return decodePreparedPayload(prepared).pipe(
        Effect.mapError(() => new WalletSignerError({ code: 'Unavailable' })),
        Effect.flatMap(payload =>
          Effect.tryPromise({
            try: async () => {
              if (payload.sourceAddress !== signer.address) {
                throw new Error('Solana transaction source mismatch')
              }
              const message = await buildTransactionMessage(payload, signer)
              const signed = await signTransactionMessageWithSigners(message)
              return makeSignedTransaction(
                prepared.accountId,
                solanaNetworkId,
                S.encodeSync(SolanaSignedPayloadJson)({
                  previewId: payload.previewId,
                  wireTransactionBase64:
                    getBase64EncodedWireTransaction(signed),
                }),
              )
            },
            catch: () => new WalletSignerError({ code: 'Denied' }),
          }),
        ),
      )
    },
    signChallenge: challenge =>
      challenge.accountId === keyConfig.accountId &&
      challenge.digest.encoding === 'hex' &&
      isThirtyTwoByteHex(challenge.digest.digest)
        ? Effect.tryPromise({
            try: async () => {
              const signatures = await signer.signMessages([
                createSignableMessage(
                  Buffer.from(
                    challenge.digest.digest.replace(/^0x/, ''),
                    'hex',
                  ),
                ),
              ])
              const maybeSignatures = Array_.head(signatures)
              if (Option.isNone(maybeSignatures)) {
                throw new Error('Solana signature was unavailable')
              }
              const maybeSignature = Record_.get(
                maybeSignatures.value,
                signer.address,
              )
              if (Option.isNone(maybeSignature)) {
                throw new Error('Solana signature was unavailable')
              }
              return SignatureProofSchema.make({
                challengeId: challenge.challengeId,
                accountId: challenge.accountId,
                algorithm: 'ed25519',
                publicIdentity: signer.address,
                signature: getBase58Decoder().decode(maybeSignature.value),
                encoding: 'base58',
              })
            },
            catch: () => new WalletSignerError({ code: 'Denied' }),
          })
        : Effect.fail(new WalletSignerError({ code: 'UnsupportedAccount' })),
  })
})

/** Optional Solana local-key custody backed by Redacted environment configuration. */
export const SolanaDevnetLocalCustodyLive = Layer.effect(
  SolanaDevnetCustody,
  makeSolanaCustody,
)
