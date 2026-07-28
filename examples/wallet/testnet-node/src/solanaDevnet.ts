import {
  Array as Array_,
  Cause,
  Effect,
  Layer,
  Match as M,
  Option,
  Queue,
  Record as Record_,
  Redacted,
  Schema as S,
  Stream,
} from 'effect'
import {
  AccountBalance,
  AtomicUnits,
  CurrencyValue,
  type PreparedTransaction,
  ReceivingInstruction,
  type SignatureProof,
  type SignedTransaction,
  type SigningChallenge,
  type SigningDigest,
  Sol,
  SolanaDevnet,
  SolanaEd25519SignatureProof,
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
const invalidCryptoPayload = () =>
  new WalletCryptoError({ code: 'InvalidPayload' })
const isThirtyTwoByteHex = (value: string): boolean =>
  /^(?:0x)?[0-9a-fA-F]{64}$/.test(value)

const solanaNetwork = SolanaDevnet.make({})
const solCurrency = Sol.make({ network: solanaNetwork })
const usdcCurrency = Usdc.make({
  network: solanaNetwork,
  tokenAddress: solanaDevnetUsdcAddress,
})

const currencyValue = (
  asset: SolanaTransferAsset,
  atomicUnits: bigint,
  observedAt: number,
): typeof CurrencyValue.Type =>
  CurrencyValue.make({
    currency: asset === 'Sol' ? solCurrency : usdcCurrency,
    atomicUnits: S.decodeUnknownSync(AtomicUnits)(atomicUnits.toString()),
    decimalPlaces: asset === 'Sol' ? solDecimalPlaces : usdcDecimalPlaces,
    observedAt,
  })

const atomicBigInt = (amount: AtomicAmount): bigint => BigInt(amount)

const assetForDraft = (
  draft: TransferDraft,
): Effect.Effect<SolanaTransferAsset, WalletClientError> =>
  M.value(draft.value.currency).pipe(
    M.withReturnType<Effect.Effect<SolanaTransferAsset, WalletClientError>>(),
    M.tagsExhaustive({
      Sol: ({ network }) =>
        network._tag === 'SolanaDevnet'
          ? Effect.succeed<SolanaTransferAsset>('Sol')
          : Effect.fail(invalidClientResponse()),
      Usdc: ({ network, tokenAddress }) =>
        network._tag === 'SolanaDevnet' &&
        tokenAddress === solanaDevnetUsdcAddress
          ? Effect.succeed<SolanaTransferAsset>('Usdc')
          : Effect.fail(invalidClientResponse()),
      Eth: () => Effect.fail(invalidClientResponse()),
    }),
  )

const decodePreparedPayload = (prepared: PreparedTransaction) =>
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

const digestMessage = async (
  messageBytes: Iterable<number>,
): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new Uint8Array(Array.from(messageBytes)),
  )
  return Buffer.from(digest).toString('hex')
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
    network: solanaNetwork,
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
          account,
          observedAt,
          balances: [
            AccountBalance.make({
              accountId: account.accountId,
              value: currencyValue('Sol', solBalanceResponse.value, observedAt),
            }),
            AccountBalance.make({
              accountId: account.accountId,
              value: currencyValue('Usdc', usdcBalance, observedAt),
            }),
          ],
          receivingInstructions: [
            ReceivingInstruction.make({
              accountId: account.accountId,
              network: solanaNetwork,
              currency: solCurrency,
              destinationAddress: account.address,
              maybeMemo: Option.none(),
              portableUri: `solana:${account.address}?cluster=devnet`,
            }),
            ReceivingInstruction.make({
              accountId: account.accountId,
              network: solanaNetwork,
              currency: usdcCurrency,
              destinationAddress: account.address,
              maybeMemo: Option.none(),
              portableUri: `solana:${account.address}?cluster=devnet&spl-token=${solanaDevnetUsdcAddress}`,
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
        draft.network._tag !== 'SolanaDevnet'
      ) {
        return yield* Effect.fail(invalidClientResponse())
      }
      const asset = yield* assetForDraft(draft)
      const destinationAddress = yield* Effect.try({
        try: () => address(draft.destinationAddress),
        catch: invalidClientResponse,
      })
      const atomicUnits = yield* Effect.try({
        try: () => BigInt(draft.value.atomicUnits),
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
            previewId: `${draft.transferId}:${observedAt}`,
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
        quoteId: `${draft.transferId}:${observedAt}`,
        estimatedFee: currencyValue('Sol', quote.fee, observedAt),
        resultingBalance: currencyValue(
          quote.resultingAsset,
          quote.resultingBalance,
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
      const destinationAddress = yield* Effect.try({
        try: () => address(preview.draft.destinationAddress),
        catch: invalidClientResponse,
      })
      const atomicUnits = yield* Effect.try({
        try: () => BigInt(preview.draft.value.atomicUnits),
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
      return makePreparedTransaction(
        account.accountId,
        solanaNetwork,
        S.encodeSync(SolanaPreparedPayloadJson)(payload),
      )
    })

  const submitTransaction = (
    signed: SignedTransaction,
  ): Effect.Effect<TransactionSubmission, WalletClientError> => {
    if (
      signed.accountId !== account.accountId ||
      signed.network._tag !== 'SolanaDevnet'
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
              maybeExplorerConfirmation: Option.some(
                blockExplorerConfirmation(solanaNetwork, response.result),
              ),
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
              transactionId: `${transactionSignature}:${instructionIndex}`,
              accountId: account.accountId,
              network: solanaNetwork,
              direction: isOutgoing ? 'Outgoing' : 'Incoming',
              status,
              value: currencyValue(
                'Sol',
                atomicBigInt(info.lamports),
                observedAt,
              ),
              counterpartyAddress: isOutgoing ? info.destination : info.source,
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
            transactionId: `${transactionSignature}:${instructionIndex}`,
            accountId: account.accountId,
            network: solanaNetwork,
            direction: isOutgoing ? 'Outgoing' : 'Incoming',
            status,
            value: currencyValue(
              'Usdc',
              atomicBigInt(maybeAmount.value),
              observedAt,
            ),
            counterpartyAddress: Option.getOrElse(
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

  return SolanaDevnetTransport.of({
    network: solanaNetwork,
    account,
    loadPortfolio,
    previewTransaction,
    prepareTransaction,
    submitTransaction,
    observeTransactions,
    digestTransaction: prepared => {
      if (
        prepared.accountId !== account.accountId ||
        prepared.network._tag !== 'SolanaDevnet'
      ) {
        return Effect.fail(invalidCryptoPayload())
      }
      return decodePreparedPayload(prepared).pipe(
        Effect.mapError(invalidCryptoPayload),
        Effect.flatMap(payload =>
          Effect.tryPromise({
            try: async () => {
              const message = await buildTransactionMessage(
                payload,
                createNoopSigner(address(payload.sourceAddress)),
              )
              const digest = await digestMessage(
                compileTransaction(message).messageBytes,
              )
              return makeSigningDigest(digest)
            },
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
          EthereumSignatureProof: () => Effect.succeed(false),
          SolanaEd25519SignatureProof: solanaProof => {
            if (
              challenge.accountId !== account.accountId ||
              challenge.digest.algorithm !== 'Sha256' ||
              !isThirtyTwoByteHex(challenge.digest.digestHex) ||
              solanaProof.challengeId !== challenge.challengeId ||
              solanaProof.accountId !== challenge.accountId ||
              solanaProof.publicKey !== account.address
            ) {
              return Effect.succeed(false)
            }
            return Effect.tryPromise({
              try: async () => {
                const publicKey = await getPublicKeyFromAddress(accountAddress)
                const proofBytes = getBase58Encoder().encode(
                  solanaProof.signatureBase58,
                )
                return verifySignature(
                  publicKey,
                  signatureBytes(proofBytes),
                  Buffer.from(
                    challenge.digest.digestHex.replace(/^0x/, ''),
                    'hex',
                  ),
                )
              },
              catch: () =>
                new WalletCryptoError({ code: 'VerificationFailed' }),
            })
          },
        }),
      ),
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
    signTransaction: (prepared: PreparedTransaction, digest: SigningDigest) => {
      if (
        prepared.accountId !== keyConfig.accountId ||
        prepared.network._tag !== 'SolanaDevnet'
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
              const transaction = compileTransaction(message)
              const computedDigest = await digestMessage(
                transaction.messageBytes,
              )
              if (computedDigest !== Redacted.value(digest)) {
                throw new Error('Solana signing digest mismatch')
              }
              const signed = await signTransactionMessageWithSigners(message)
              return makeSignedTransaction(
                prepared.accountId,
                solanaNetwork,
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
      challenge.digest.algorithm === 'Sha256' &&
      isThirtyTwoByteHex(challenge.digest.digestHex)
        ? Effect.tryPromise({
            try: async () => {
              const signatures = await signer.signMessages([
                createSignableMessage(
                  Buffer.from(
                    challenge.digest.digestHex.replace(/^0x/, ''),
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
              return SolanaEd25519SignatureProof.make({
                challengeId: challenge.challengeId,
                accountId: challenge.accountId,
                publicKey: signer.address,
                signatureBase58: getBase58Decoder().decode(
                  maybeSignature.value,
                ),
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
