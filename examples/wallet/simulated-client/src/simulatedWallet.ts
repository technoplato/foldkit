import {
  Array as Array_,
  Context,
  Effect,
  Layer,
  Option,
  PubSub,
  Redacted,
  Schema as S,
  Stream,
} from 'effect'
import {
  AccountBalance,
  AssetAmount,
  AssetDescriptor,
  BalanceSnapshot,
  ChainDescriptor,
  IssuedAsset,
  NativeAsset,
  NetworkDescriptor,
  PortfolioSnapshot,
  ReceivingInstruction,
  RejectedTransfer,
  SignatureProof,
  type SignedTransaction,
  type SigningChallenge,
  TransactionHistoryPage,
  TransactionPreview,
  TransactionRecord,
  TransactionSubmission,
  TransferGuidance,
  type TransferRequest,
  ValidatedRecipient,
  ValidatedTransfer,
  WalletAccount,
  WalletClient,
  WalletClientError,
  WalletCrypto,
  WalletCryptoError,
  type WalletResources,
  WalletSigner,
  WalletSignerError,
  assetForId,
  makeSignedTransaction,
  makeTransactionPayload,
} from 'wallet-core-example'

const fixedObservedAt = 1_785_129_600_000
const fixedExpiresAt = fixedObservedAt + 5 * 60 * 1_000
const ethereumChainId = 'ethereum'
const ethereumNetworkId = 'ethereum:sepolia'
const ethereumEthAssetId = 'ethereum:sepolia:eth'
const ethereumUsdcAssetId = 'ethereum:sepolia:usdc'
const ethereumAccountId = 'simulated-ethereum-account'
const ethereumAddress = '0x1111111111111111111111111111111111111111'
const solanaChainId = 'solana'
const solanaNetworkId = 'solana:devnet'
const solanaSolAssetId = 'solana:devnet:sol'
const solanaUsdcAssetId = 'solana:devnet:usdc'
const solanaAccountId = 'simulated-solana-account'
const solanaAddress = '7XSg97qfSE6n2J1aVfxyTLZgcV7R4sr1kPnCVTLMriYJ'
const sepoliaUsdcAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
const devnetUsdcAddress = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'

const ethereumChain = ChainDescriptor.make({
  chainId: ethereumChainId,
  displayName: 'Ethereum',
})
const solanaChain = ChainDescriptor.make({
  chainId: solanaChainId,
  displayName: 'Solana',
})
const ethereumNetwork = NetworkDescriptor.make({
  networkId: ethereumNetworkId,
  chainId: ethereumChainId,
  displayName: 'Ethereum Sepolia',
  environment: 'Testnet',
  capabilities: [
    'Transfer',
    'TransactionHistory',
    'TransactionObservation',
    'ChallengeSignature',
  ],
})
const solanaNetwork = NetworkDescriptor.make({
  networkId: solanaNetworkId,
  chainId: solanaChainId,
  displayName: 'Solana Devnet',
  environment: 'Development',
  capabilities: [
    'Transfer',
    'TransactionHistory',
    'TransactionObservation',
    'ChallengeSignature',
  ],
})
const ethereumEth = AssetDescriptor.make({
  assetId: ethereumEthAssetId,
  networkId: ethereumNetworkId,
  displayName: 'Sepolia Ether',
  symbol: 'ETH',
  decimalPlaces: 18,
  kind: NativeAsset.make({}),
})
const ethereumUsdc = AssetDescriptor.make({
  assetId: ethereumUsdcAssetId,
  networkId: ethereumNetworkId,
  displayName: 'USDC',
  symbol: 'USDC',
  decimalPlaces: 6,
  kind: IssuedAsset.make({ reference: sepoliaUsdcAddress }),
})
const solanaSol = AssetDescriptor.make({
  assetId: solanaSolAssetId,
  networkId: solanaNetworkId,
  displayName: 'Devnet SOL',
  symbol: 'SOL',
  decimalPlaces: 9,
  kind: NativeAsset.make({}),
})
const solanaUsdc = AssetDescriptor.make({
  assetId: solanaUsdcAssetId,
  networkId: solanaNetworkId,
  displayName: 'USDC',
  symbol: 'USDC',
  decimalPlaces: 6,
  kind: IssuedAsset.make({ reference: devnetUsdcAddress }),
})

const amount = (
  assetId: string,
  atomicUnits: (typeof AssetAmount.Type)['atomicUnits'],
  observedAt = fixedObservedAt,
): typeof AssetAmount.Type =>
  AssetAmount.make({ assetId, atomicUnits, observedAt })

const ethereumAccount = WalletAccount.make({
  accountId: ethereumAccountId,
  networkId: ethereumNetworkId,
  address: ethereumAddress,
  displayName: 'Simulated Sepolia Account',
})
const solanaAccount = WalletAccount.make({
  accountId: solanaAccountId,
  networkId: solanaNetworkId,
  address: solanaAddress,
  displayName: 'Simulated Solana Account',
})
const accountBalances: ReadonlyArray<typeof AccountBalance.Type> = [
  AccountBalance.make({
    accountId: ethereumAccountId,
    amount: amount(ethereumEthAssetId, '2500000000000000000'),
  }),
  AccountBalance.make({
    accountId: ethereumAccountId,
    amount: amount(ethereumUsdcAssetId, '125500000'),
  }),
  AccountBalance.make({
    accountId: solanaAccountId,
    amount: amount(solanaSolAssetId, '7200000000'),
  }),
  AccountBalance.make({
    accountId: solanaAccountId,
    amount: amount(solanaUsdcAssetId, '90000000'),
  }),
]

/** Public deterministic normalized portfolio used by simulated hosts. */
export const simulatedPortfolio = PortfolioSnapshot.make({
  chains: [ethereumChain, solanaChain],
  networks: [ethereumNetwork, solanaNetwork],
  assets: [ethereumEth, ethereumUsdc, solanaSol, solanaUsdc],
  accounts: [ethereumAccount, solanaAccount],
  balanceSnapshot: BalanceSnapshot.make({
    observedAt: fixedObservedAt,
    balances: accountBalances,
  }),
  receivingInstructions: [
    ReceivingInstruction.make({
      accountId: ethereumAccountId,
      assetId: ethereumEthAssetId,
      destinationAddress: ethereumAddress,
      maybeMemo: Option.none(),
      portableUri: `/wallet/receive/${ethereumAccountId}?asset=${ethereumEthAssetId}`,
    }),
    ReceivingInstruction.make({
      accountId: ethereumAccountId,
      assetId: ethereumUsdcAssetId,
      destinationAddress: ethereumAddress,
      maybeMemo: Option.none(),
      portableUri: `/wallet/receive/${ethereumAccountId}?asset=${ethereumUsdcAssetId}`,
    }),
    ReceivingInstruction.make({
      accountId: solanaAccountId,
      assetId: solanaSolAssetId,
      destinationAddress: solanaAddress,
      maybeMemo: Option.none(),
      portableUri: `/wallet/receive/${solanaAccountId}?asset=${solanaSolAssetId}`,
    }),
    ReceivingInstruction.make({
      accountId: solanaAccountId,
      assetId: solanaUsdcAssetId,
      destinationAddress: solanaAddress,
      maybeMemo: Option.none(),
      portableUri: `/wallet/receive/${solanaAccountId}?asset=${solanaUsdcAssetId}`,
    }),
  ],
})

const historicalTransactions: ReadonlyArray<typeof TransactionRecord.Type> = [
  TransactionRecord.make({
    recordId: 'simulated-history-1',
    transactionId: 'simulated-history-1',
    accountId: ethereumAccountId,
    networkId: ethereumNetworkId,
    direction: 'Incoming',
    status: 'Confirmed',
    amount: amount(
      ethereumEthAssetId,
      '500000000000000000',
      fixedObservedAt - 3_000,
    ),
    counterpartyAddress: '0x2222222222222222222222222222222222222222',
    normalizedCounterpartyAddress: '0x2222222222222222222222222222222222222222',
    observedAt: fixedObservedAt - 3_000,
  }),
  TransactionRecord.make({
    recordId: 'simulated-history-2',
    transactionId: 'simulated-history-2',
    accountId: ethereumAccountId,
    networkId: ethereumNetworkId,
    direction: 'Outgoing',
    status: 'Confirmed',
    amount: amount(ethereumUsdcAssetId, '2500000', fixedObservedAt - 2_000),
    counterpartyAddress: '0x3333333333333333333333333333333333333333',
    normalizedCounterpartyAddress: '0x3333333333333333333333333333333333333333',
    observedAt: fixedObservedAt - 2_000,
  }),
  TransactionRecord.make({
    recordId: 'simulated-history-3',
    transactionId: 'simulated-history-3',
    accountId: solanaAccountId,
    networkId: solanaNetworkId,
    direction: 'Incoming',
    status: 'Confirmed',
    amount: amount(solanaSolAssetId, '100000000', fixedObservedAt - 1_000),
    counterpartyAddress: '11111111111111111111111111111111',
    normalizedCounterpartyAddress: '11111111111111111111111111111111',
    observedAt: fixedObservedAt - 1_000,
  }),
]

const TransactionPreviewJson = S.fromJsonString(TransactionPreview)
const SignedPayload = S.Struct({
  preview: TransactionPreview,
  digest: S.String,
})
const SignedPayloadJson = S.fromJsonString(SignedPayload)

const stableHash = (value: string): string => {
  const codes = Array_.map(
    Array_.fromIterable(value),
    character => character.codePointAt(0) ?? 0,
  )
  const hash = Array_.reduce(codes, 2_166_136_261, (currentHash, code) =>
    Math.imul(currentHash ^ code, 16_777_619),
  )
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const accountForId = (accountId: string) =>
  Array_.findFirst(
    simulatedPortfolio.accounts,
    account => account.accountId === accountId,
  )

const normalizedAddress = (networkId: string, address: string): string =>
  networkId === ethereumNetworkId ? address.toLowerCase() : address

const isValidSimulatedAddress = (
  networkId: string,
  destinationAddress: string,
): boolean => {
  if (networkId === ethereumNetworkId) {
    return /^0x[0-9a-fA-F]{40}$/.test(destinationAddress)
  } else if (networkId === solanaNetworkId) {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(destinationAddress)
  } else {
    return false
  }
}

const invalidAddressGuidance = (networkId: string) => {
  if (networkId === ethereumNetworkId) {
    return TransferGuidance.make({
      summary: 'That is not a valid Ethereum address.',
      details: [
        'Ethereum addresses contain 20 bytes encoded as 0x-prefixed hexadecimal.',
        'Use a valid checksum or hexadecimal Ethereum address.',
      ],
    })
  } else {
    return TransferGuidance.make({
      summary: 'That is not a valid Solana address.',
      details: ['Solana addresses are base58-encoded public keys.'],
    })
  }
}

const validateTransfer = (request: TransferRequest) => {
  const maybeAccount = accountForId(request.accountId)
  const maybeAsset = assetForId(simulatedPortfolio.assets, request.assetId)
  if (
    Option.isNone(maybeAccount) ||
    Option.isNone(maybeAsset) ||
    maybeAccount.value.networkId !== maybeAsset.value.networkId ||
    BigInt(request.atomicUnits) <= 0n
  ) {
    return RejectedTransfer.make({
      request,
      guidance: TransferGuidance.make({
        summary: 'The simulated adapter rejected this transfer.',
        details: [
          'Choose an account and asset on the same network.',
          'Enter a non-empty recipient and a positive atomic amount.',
        ],
      }),
    })
  }
  const address = request.destinationAddress.trim()
  if (!isValidSimulatedAddress(maybeAccount.value.networkId, address)) {
    return RejectedTransfer.make({
      request,
      guidance: invalidAddressGuidance(maybeAccount.value.networkId),
    })
  }
  return ValidatedTransfer.make({
    request,
    recipient: ValidatedRecipient.make({
      networkId: maybeAccount.value.networkId,
      address,
      normalizedAddress: normalizedAddress(
        maybeAccount.value.networkId,
        address,
      ),
      displayAddress: address,
    }),
  })
}

const nativeAssetForNetwork = (networkId: string) =>
  Array_.findFirst(
    simulatedPortfolio.assets,
    asset => asset.networkId === networkId && asset.kind._tag === 'NativeAsset',
  )

const feeForTransfer = (
  transfer: ValidatedTransfer,
): typeof AssetAmount.Type => {
  const maybeNativeAsset = nativeAssetForNetwork(transfer.recipient.networkId)
  if (Option.isNone(maybeNativeAsset)) {
    return amount(transfer.request.assetId, '0')
  }
  return amount(
    maybeNativeAsset.value.assetId,
    transfer.recipient.networkId === ethereumNetworkId
      ? '1000000000000000'
      : '5000',
  )
}

const balanceForTransfer = (
  transfer: ValidatedTransfer,
): typeof AssetAmount.Type => {
  const maybeBalance = Array_.findFirst(
    accountBalances,
    balance =>
      balance.accountId === transfer.request.accountId &&
      balance.amount.assetId === transfer.request.assetId,
  )
  const nextAtomicUnits = Option.isSome(maybeBalance)
    ? BigInt(maybeBalance.value.amount.atomicUnits) -
      BigInt(transfer.request.atomicUnits)
    : -BigInt(transfer.request.atomicUnits)
  return amount(
    transfer.request.assetId,
    S.decodeUnknownSync(S.TemplateLiteral([S.BigInt]))(
      nextAtomicUnits.toString(),
    ),
  )
}

const signingProof = (
  challenge: SigningChallenge,
): Effect.Effect<SignatureProof, WalletSignerError> => {
  const maybeAccount = accountForId(challenge.accountId)
  if (Option.isNone(maybeAccount)) {
    return Effect.fail(new WalletSignerError({ code: 'UnsupportedAccount' }))
  }
  const signature = stableHash(
    `${challenge.digest.domain}:${challenge.digest.digest}:${challenge.accountId}`,
  )
  return Effect.succeed(
    SignatureProof.make({
      challengeId: challenge.challengeId,
      accountId: challenge.accountId,
      algorithm: `simulated-${maybeAccount.value.networkId}`,
      publicIdentity: maybeAccount.value.address,
      signature: `simulated${signature}`,
      encoding: 'text',
    }),
  )
}

const historyPage = (
  accountIds: ReadonlyArray<string>,
  maybeCursor: Option.Option<string>,
  limit: number,
): typeof TransactionHistoryPage.Type => {
  const offset = Option.match(maybeCursor, {
    onNone: () => 0,
    onSome: cursor => Number.parseInt(cursor, 10),
  })
  const filtered = Array_.filter(historicalTransactions, transaction =>
    Array_.contains(accountIds, transaction.accountId),
  )
  const records = Array_.take(Array_.drop(filtered, offset), limit)
  const nextOffset = offset + Array_.length(records)
  return TransactionHistoryPage.make({
    records,
    maybeNextCursor:
      nextOffset < Array_.length(filtered)
        ? Option.some(nextOffset.toString())
        : Option.none(),
  })
}

const makeSimulatedServices = Effect.gen(function* () {
  const transactionChanges = yield* PubSub.unbounded<TransactionRecord>({
    replay: 1,
  })
  const client = WalletClient.of({
    loadPortfolio: Effect.succeed(simulatedPortfolio),
    validateTransfer: request => Effect.succeed(validateTransfer(request)),
    previewTransfer: transfer =>
      Effect.succeed({
        quoteId: `preview-${stableHash(transfer.request.transferId)}`,
        estimatedFee: feeForTransfer(transfer),
        resultingBalance: balanceForTransfer(transfer),
        expiresAt: fixedExpiresAt,
      }),
    buildTransferPayload: preview =>
      Effect.succeed(
        makeTransactionPayload(
          preview.transfer.request.accountId,
          preview.transfer.recipient.networkId,
          S.encodeSync(TransactionPreviewJson)(preview),
        ),
      ),
    submitTransaction: (transaction: SignedTransaction) =>
      Effect.gen(function* () {
        const signedPayload = yield* S.decodeUnknownEffect(SignedPayloadJson)(
          Redacted.value(transaction.payload),
        ).pipe(
          Effect.mapError(
            () => new WalletClientError({ code: 'InvalidResponse' }),
          ),
        )
        const transfer = signedPayload.preview.transfer
        const transactionId = `simulated-${stableHash(
          `${signedPayload.preview.previewId}:${signedPayload.digest}`,
        )}`
        const record = TransactionRecord.make({
          recordId: transactionId,
          transactionId,
          accountId: transfer.request.accountId,
          networkId: transfer.recipient.networkId,
          direction: 'Outgoing',
          status: 'Confirmed',
          amount: amount(
            transfer.request.assetId,
            transfer.request.atomicUnits,
          ),
          counterpartyAddress: transfer.recipient.displayAddress,
          normalizedCounterpartyAddress: transfer.recipient.normalizedAddress,
          observedAt: fixedObservedAt,
        })
        yield* PubSub.publish(transactionChanges, record)
        return TransactionSubmission.make({
          previewId: signedPayload.preview.previewId,
          transactionId,
          submittedAt: fixedObservedAt,
          maybeExplorerConfirmation: Option.none(),
        })
      }),
    loadTransactionHistory: query =>
      Effect.succeed(
        historyPage(query.accountIds, query.maybeCursor, query.limit),
      ),
    observeTransactions: accountIds =>
      Stream.fromPubSub(transactionChanges).pipe(
        Stream.filter(transaction =>
          Array_.contains(accountIds, transaction.accountId),
        ),
      ),
  })
  const signer = WalletSigner.of({
    signTransaction: payload => {
      const preview = S.decodeUnknownSync(TransactionPreviewJson)(
        Redacted.value(payload.payload),
      )
      const digest = stableHash(Redacted.value(payload.payload))
      return Effect.succeed(
        makeSignedTransaction(
          payload.accountId,
          payload.networkId,
          S.encodeSync(SignedPayloadJson)({ preview, digest }),
        ),
      )
    },
    signChallenge: signingProof,
  })
  const crypto = WalletCrypto.of({
    verifySignatureProof: (challenge, proof) =>
      signingProof(challenge).pipe(
        Effect.map(
          expected => JSON.stringify(expected) === JSON.stringify(proof),
        ),
        Effect.mapError(
          () => new WalletCryptoError({ code: 'VerificationFailed' }),
        ),
      ),
  })
  return Context.make(WalletClient, client).pipe(
    Context.add(WalletSigner, signer),
    Context.add(WalletCrypto, crypto),
  )
})

/** Deterministic, side-effect-complete Wallet resources for demos and tests. */
export const SimulatedWalletResources: Layer.Layer<WalletResources> =
  Layer.effectContext(makeSimulatedServices)
