import {
  Array as Array_,
  Context,
  Effect,
  Layer,
  Option,
  PubSub,
  Redacted,
  Ref,
  Schema as S,
  Stream,
} from 'effect'
import {
  AccountBalance,
  AdapterTestFundingMethod,
  AssetAmount,
  AssetDescriptor,
  BalanceSnapshot,
  ChainDescriptor,
  NativeAsset,
  NetworkDescriptor,
  PortfolioSnapshot,
  ReceivingInstruction,
  RejectedTransfer,
  SignatureProof,
  type SignedTransaction,
  type SigningChallenge,
  TestFundingReceipt,
  type TestFundingRequest,
  TransactionHistoryPage,
  TransactionPreview,
  TransactionRecord,
  TransactionSubmission,
  TransferGuidance,
  type TransferRequest,
  ValidatedRecipient,
  ValidatedTransfer,
  WalletAccount,
  type WalletCapability,
  WalletClient,
  WalletClientError,
  WalletClipboard,
  WalletClipboardUnavailable,
  WalletCrypto,
  WalletCryptoError,
  WalletProfile,
  type WalletResources,
  WalletSigner,
  WalletSignerError,
  WalletVault,
  WalletVaultError,
  assetForId,
  doesPortfolioIncludeWalletProfiles,
  makeSignedTransaction,
  makeTransactionPayload,
  mergeTransactionRecords,
} from 'wallet-core-example'

const fixedObservedAt = 1_785_129_600_000
const fixedExpiresAt = fixedObservedAt + 5 * 60 * 1_000
const bitcoinChainId = 'bitcoin'
const bitcoinRegtestNetworkId = 'bitcoin:regtest'
const bitcoinTestnetNetworkId = 'bitcoin:testnet'
const bitcoinRegtestAssetId = 'bitcoin:regtest:btc'
const bitcoinTestnetAssetId = 'bitcoin:testnet:btc'
const bitcoinRegtestAccountId = 'simulated-bitcoin-regtest-account'
const bitcoinTestnetAccountId = 'simulated-bitcoin-testnet-account'
const ethereumChainId = 'ethereum'
const ethereumLocalnetNetworkId = 'ethereum:localnet'
const ethereumNetworkId = 'ethereum:sepolia'
const ethereumLocalnetAssetId = 'ethereum:localnet:eth'
const ethereumEthAssetId = 'ethereum:sepolia:eth'
const ethereumLocalnetAccountId = 'simulated-ethereum-localnet-account'
const ethereumAccountId = 'simulated-ethereum-account'
const ethereumAddress = '0x1111111111111111111111111111111111111111'
const solanaChainId = 'solana'
const solanaNetworkId = 'solana:devnet'
const solanaTestnetNetworkId = 'solana:testnet'
const solanaSolAssetId = 'solana:devnet:sol'
const solanaTestnetAssetId = 'solana:testnet:sol'
const solanaAccountId = 'simulated-solana-account'
const solanaTestnetAccountId = 'simulated-solana-testnet-account'
const solanaAddress = '7XSg97qfSE6n2J1aVfxyTLZgcV7R4sr1kPnCVTLMriYJ'
const suiChainId = 'sui'
const suiDevnetNetworkId = 'sui:devnet'
const suiTestnetNetworkId = 'sui:testnet'
const suiDevnetAssetId = 'sui:devnet:sui'
const suiTestnetAssetId = 'sui:testnet:sui'
const suiDevnetAccountId = 'simulated-sui-devnet-account'
const suiTestnetAccountId = 'simulated-sui-testnet-account'

const chains = [
  ChainDescriptor.make({ chainId: bitcoinChainId, displayName: 'Bitcoin' }),
  ChainDescriptor.make({ chainId: ethereumChainId, displayName: 'Ethereum' }),
  ChainDescriptor.make({ chainId: solanaChainId, displayName: 'Solana' }),
  ChainDescriptor.make({ chainId: suiChainId, displayName: 'Sui' }),
]

const transferCapabilities: ReadonlyArray<WalletCapability> = [
  'Transfer',
  'TestFunding',
  'TransactionHistory',
  'TransactionObservation',
  'ChallengeSignature',
]
const adapterTestFundingMethod = AdapterTestFundingMethod.make({})

const networks = [
  NetworkDescriptor.make({
    networkId: bitcoinRegtestNetworkId,
    chainId: bitcoinChainId,
    displayName: 'Bitcoin Regtest',
    environment: 'Local',
    capabilities: transferCapabilities,
    testFundingMethod: adapterTestFundingMethod,
  }),
  NetworkDescriptor.make({
    networkId: bitcoinTestnetNetworkId,
    chainId: bitcoinChainId,
    displayName: 'Bitcoin Testnet',
    environment: 'Testnet',
    capabilities: transferCapabilities,
    testFundingMethod: adapterTestFundingMethod,
  }),
  NetworkDescriptor.make({
    networkId: ethereumLocalnetNetworkId,
    chainId: ethereumChainId,
    displayName: 'Ethereum Localnet',
    environment: 'Local',
    capabilities: transferCapabilities,
    testFundingMethod: adapterTestFundingMethod,
  }),
  NetworkDescriptor.make({
    networkId: ethereumNetworkId,
    chainId: ethereumChainId,
    displayName: 'Ethereum Sepolia',
    environment: 'Testnet',
    capabilities: transferCapabilities,
    testFundingMethod: adapterTestFundingMethod,
  }),
  NetworkDescriptor.make({
    networkId: solanaNetworkId,
    chainId: solanaChainId,
    displayName: 'Solana Devnet',
    environment: 'Development',
    capabilities: transferCapabilities,
    testFundingMethod: adapterTestFundingMethod,
  }),
  NetworkDescriptor.make({
    networkId: solanaTestnetNetworkId,
    chainId: solanaChainId,
    displayName: 'Solana Testnet',
    environment: 'Testnet',
    capabilities: transferCapabilities,
    testFundingMethod: adapterTestFundingMethod,
  }),
  NetworkDescriptor.make({
    networkId: suiDevnetNetworkId,
    chainId: suiChainId,
    displayName: 'Sui Devnet',
    environment: 'Development',
    capabilities: transferCapabilities,
    testFundingMethod: adapterTestFundingMethod,
  }),
  NetworkDescriptor.make({
    networkId: suiTestnetNetworkId,
    chainId: suiChainId,
    displayName: 'Sui Testnet',
    environment: 'Testnet',
    capabilities: transferCapabilities,
    testFundingMethod: adapterTestFundingMethod,
  }),
]

const nativeAsset = (
  assetId: string,
  networkId: string,
  displayName: string,
  symbol: string,
  decimalPlaces: 8 | 9 | 18,
) =>
  AssetDescriptor.make({
    assetId,
    networkId,
    displayName,
    symbol,
    decimalPlaces,
    kind: NativeAsset.make({}),
  })

const assets = [
  nativeAsset(
    bitcoinRegtestAssetId,
    bitcoinRegtestNetworkId,
    'Regtest Bitcoin',
    'BTC',
    8,
  ),
  nativeAsset(
    bitcoinTestnetAssetId,
    bitcoinTestnetNetworkId,
    'Testnet Bitcoin',
    'BTC',
    8,
  ),
  nativeAsset(
    ethereumLocalnetAssetId,
    ethereumLocalnetNetworkId,
    'Local Ether',
    'ETH',
    18,
  ),
  nativeAsset(
    ethereumEthAssetId,
    ethereumNetworkId,
    'Sepolia Ether',
    'ETH',
    18,
  ),
  nativeAsset(solanaSolAssetId, solanaNetworkId, 'Devnet SOL', 'SOL', 9),
  nativeAsset(
    solanaTestnetAssetId,
    solanaTestnetNetworkId,
    'Testnet SOL',
    'SOL',
    9,
  ),
  nativeAsset(suiDevnetAssetId, suiDevnetNetworkId, 'Devnet SUI', 'SUI', 9),
  nativeAsset(suiTestnetAssetId, suiTestnetNetworkId, 'Testnet SUI', 'SUI', 9),
]

const amount = (
  assetId: string,
  atomicUnits: (typeof AssetAmount.Type)['atomicUnits'],
  observedAt = fixedObservedAt,
): typeof AssetAmount.Type =>
  AssetAmount.make({ assetId, atomicUnits, observedAt })

const simulatedHolding = (
  accountId: string,
  chainId: string,
  networkId: string,
  address: string,
  displayName: string,
  assetId: string,
  atomicUnits: (typeof AssetAmount.Type)['atomicUnits'],
) => ({
  account: WalletAccount.make({
    accountId,
    chainId,
    networkId,
    address,
    displayName,
  }),
  assetId,
  atomicUnits,
})

const simulatedHoldings = [
  simulatedHolding(
    bitcoinRegtestAccountId,
    bitcoinChainId,
    bitcoinRegtestNetworkId,
    'bcrt1q2n0r7w3x8k9m4p6s5t2v7y9z3c8d4f6g0h2j5k',
    'Simulated Bitcoin Regtest Account',
    bitcoinRegtestAssetId,
    '5000000',
  ),
  simulatedHolding(
    bitcoinTestnetAccountId,
    bitcoinChainId,
    bitcoinTestnetNetworkId,
    'tb1q2n0r7w3x8k9m4p6s5t2v7y9z3c8d4f6g0h2j5k',
    'Simulated Bitcoin Testnet Account',
    bitcoinTestnetAssetId,
    '5000000',
  ),
  simulatedHolding(
    ethereumLocalnetAccountId,
    ethereumChainId,
    ethereumLocalnetNetworkId,
    '0x4444444444444444444444444444444444444444',
    'Simulated Ethereum Localnet Account',
    ethereumLocalnetAssetId,
    '5000000000000000000',
  ),
  simulatedHolding(
    ethereumAccountId,
    ethereumChainId,
    ethereumNetworkId,
    ethereumAddress,
    'Simulated Sepolia Account',
    ethereumEthAssetId,
    '2500000000000000000',
  ),
  simulatedHolding(
    solanaAccountId,
    solanaChainId,
    solanaNetworkId,
    solanaAddress,
    'Simulated Solana Devnet Account',
    solanaSolAssetId,
    '7200000000',
  ),
  simulatedHolding(
    solanaTestnetAccountId,
    solanaChainId,
    solanaTestnetNetworkId,
    '11111111111111111111111111111111',
    'Simulated Solana Testnet Account',
    solanaTestnetAssetId,
    '7200000000',
  ),
  simulatedHolding(
    suiDevnetAccountId,
    suiChainId,
    suiDevnetNetworkId,
    '0x1111111111111111111111111111111111111111111111111111111111111111',
    'Simulated Sui Devnet Account',
    suiDevnetAssetId,
    '12000000000',
  ),
  simulatedHolding(
    suiTestnetAccountId,
    suiChainId,
    suiTestnetNetworkId,
    '0x2222222222222222222222222222222222222222222222222222222222222222',
    'Simulated Sui Testnet Account',
    suiTestnetAssetId,
    '12000000000',
  ),
]

const accounts = Array_.map(simulatedHoldings, holding => holding.account)
const accountBalances = Array_.map(simulatedHoldings, holding =>
  AccountBalance.make({
    accountId: holding.account.accountId,
    amount: amount(holding.assetId, holding.atomicUnits),
  }),
)

/** Public deterministic normalized portfolio used only by explicit test hosts. */
export const simulatedPortfolio = PortfolioSnapshot.make({
  dataSource: 'Fixture',
  chains,
  networks,
  assets,
  accounts,
  balanceSnapshot: BalanceSnapshot.make({
    observedAt: fixedObservedAt,
    balances: accountBalances,
  }),
  receivingInstructions: Array_.map(simulatedHoldings, holding =>
    ReceivingInstruction.make({
      accountId: holding.account.accountId,
      assetId: holding.assetId,
      destinationAddress: holding.account.address,
      maybeMemo: Option.none(),
      portableUri: `/wallet/receive/${holding.account.accountId}?asset=${holding.assetId}`,
    }),
  ),
})

const historicalTransactions = Array_.map(simulatedHoldings, holding => {
  const transactionId = `simulated-history-${holding.account.accountId}`
  return TransactionRecord.make({
    recordId: transactionId,
    transactionId,
    accountId: holding.account.accountId,
    networkId: holding.account.networkId,
    direction: 'Incoming',
    status: 'Confirmed',
    amount: amount(
      holding.assetId,
      holding.atomicUnits,
      fixedObservedAt - 1_000,
    ),
    counterpartyAddress: holding.account.address,
    normalizedCounterpartyAddress: holding.account.address.toLowerCase(),
    observedAt: fixedObservedAt - 1_000,
  })
})

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

const chainIdForNetwork = (networkId: string): Option.Option<string> =>
  Option.map(
    Array_.findFirst(
      simulatedPortfolio.networks,
      network => network.networkId === networkId,
    ),
    network => network.chainId,
  )

const normalizedAddress = (networkId: string, address: string): string =>
  Option.match(chainIdForNetwork(networkId), {
    onNone: () => address,
    onSome: chainId =>
      chainId === bitcoinChainId ||
      chainId === ethereumChainId ||
      chainId === suiChainId
        ? address.toLowerCase()
        : address,
  })

const isValidSimulatedAddress = (
  networkId: string,
  destinationAddress: string,
): boolean => {
  const maybeChainId = chainIdForNetwork(networkId)
  if (Option.isNone(maybeChainId)) {
    return false
  }
  if (maybeChainId.value === bitcoinChainId) {
    return /^(bcrt1|tb1)[023456789acdefghjklmnpqrstuvwxyz]{20,}$/.test(
      destinationAddress,
    )
  } else if (maybeChainId.value === ethereumChainId) {
    return /^0x[0-9a-fA-F]{40}$/.test(destinationAddress)
  } else if (maybeChainId.value === solanaChainId) {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(destinationAddress)
  } else {
    return /^0x[0-9a-fA-F]{64}$/.test(destinationAddress)
  }
}

const invalidAddressGuidance = (networkId: string) => {
  const chainId = Option.getOrElse(
    chainIdForNetwork(networkId),
    () => 'unknown',
  )
  if (chainId === bitcoinChainId) {
    return TransferGuidance.make({
      summary: 'That is not a valid Bitcoin address for this network mode.',
      details: [
        'Use a Bech32 Regtest or Testnet address for the selected rail.',
      ],
    })
  } else if (chainId === ethereumChainId) {
    return TransferGuidance.make({
      summary: 'That is not a valid Ethereum address.',
      details: [
        'Ethereum addresses contain 20 bytes encoded as 0x-prefixed hexadecimal.',
        'Use a valid checksum or hexadecimal Ethereum address.',
      ],
    })
  } else if (chainId === solanaChainId) {
    return TransferGuidance.make({
      summary: 'That is not a valid Solana address.',
      details: ['Solana addresses are base58-encoded public keys.'],
    })
  } else {
    return TransferGuidance.make({
      summary: 'That is not a valid Sui address.',
      details: [
        'Sui addresses contain 32 bytes encoded as 0x-prefixed hexadecimal.',
      ],
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
  const chainId = Option.getOrElse(
    chainIdForNetwork(transfer.recipient.networkId),
    () => 'unknown',
  )
  const atomicUnits = (() => {
    if (chainId === bitcoinChainId) {
      return '500'
    } else if (chainId === ethereumChainId) {
      return '1000000000000000'
    } else if (chainId === suiChainId) {
      return '1000000'
    } else {
      return '5000'
    }
  })()
  return amount(maybeNativeAsset.value.assetId, atomicUnits)
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
  transactions: ReadonlyArray<TransactionRecord>,
  accountId: string,
  networkId: string,
  maybeCursor: Option.Option<string>,
  limit: number,
): Effect.Effect<TransactionHistoryPage, WalletClientError> => {
  const offset = Option.match(maybeCursor, {
    onNone: () => 0,
    onSome: cursor => Number.parseInt(cursor, 10),
  })
  if (!Number.isInteger(offset) || offset < 0) {
    return Effect.fail(new WalletClientError({ code: 'InvalidResponse' }))
  }
  const filtered = mergeTransactionRecords(
    [],
    Array_.filter(
      transactions,
      transaction =>
        transaction.accountId === accountId &&
        transaction.networkId === networkId,
    ),
  )
  const records = Array_.take(Array_.drop(filtered, offset), limit)
  const nextOffset = offset + Array_.length(records)
  return Effect.succeed(
    TransactionHistoryPage.make({
      records,
      maybeNextCursor:
        nextOffset < Array_.length(filtered)
          ? Option.some(nextOffset.toString())
          : Option.none(),
    }),
  )
}

const makeSimulatedServices = Effect.gen(function* () {
  const transactionChanges = yield* PubSub.unbounded<TransactionRecord>({
    replay: 1,
  })
  const transactions = yield* Ref.make<ReadonlyArray<TransactionRecord>>(
    historicalTransactions,
  )
  const client = WalletClient.of({
    loadPortfolio: wallets =>
      doesPortfolioIncludeWalletProfiles(simulatedPortfolio, wallets)
        ? Effect.succeed(simulatedPortfolio)
        : Effect.fail(new WalletClientError({ code: 'UnsupportedCapability' })),
    requestTestFunding: (request: TestFundingRequest) => {
      const maybeAccount = accountForId(request.accountId)
      const maybeNetwork = Array_.findFirst(
        simulatedPortfolio.networks,
        network => network.networkId === request.networkId,
      )
      const maybeAsset = assetForId(simulatedPortfolio.assets, request.assetId)
      if (
        Option.isNone(maybeAccount) ||
        Option.isNone(maybeNetwork) ||
        Option.isNone(maybeAsset) ||
        maybeAccount.value.chainId !== request.chainId ||
        maybeAccount.value.networkId !== request.networkId ||
        maybeNetwork.value.chainId !== request.chainId ||
        maybeNetwork.value.environment !== request.environment ||
        maybeAsset.value.networkId !== request.networkId ||
        !Array_.contains(maybeNetwork.value.capabilities, 'TestFunding') ||
        BigInt(request.atomicUnits) <= 0n
      ) {
        return Effect.fail(
          new WalletClientError({ code: 'UnsupportedCapability' }),
        )
      }
      const fundingId = `simulated-funding-${stableHash(request.requestId)}`
      const record = TransactionRecord.make({
        recordId: fundingId,
        transactionId: fundingId,
        accountId: request.accountId,
        networkId: request.networkId,
        direction: 'Incoming',
        status: 'Confirmed',
        amount: amount(request.assetId, request.atomicUnits),
        counterpartyAddress: 'simulated-test-funding',
        normalizedCounterpartyAddress: 'simulated-test-funding',
        observedAt: fixedObservedAt,
      })
      return Effect.gen(function* () {
        yield* Ref.update(transactions, current =>
          mergeTransactionRecords(current, [record]),
        )
        yield* PubSub.publish(transactionChanges, record)
        return TestFundingReceipt.make({
          requestId: request.requestId,
          fundingId,
          acceptedAt: fixedObservedAt,
          amount: record.amount,
          maybeTransactionId: Option.some(fundingId),
        })
      })
    },
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
        yield* Ref.update(transactions, current =>
          mergeTransactionRecords(current, [record]),
        )
        yield* PubSub.publish(transactionChanges, record)
        return TransactionSubmission.make({
          previewId: signedPayload.preview.previewId,
          transactionId,
          submittedAt: fixedObservedAt,
          maybeExplorerConfirmation: Option.none(),
        })
      }),
    loadTransactionHistory: query => {
      const maybeAccount = accountForId(query.accountId)
      if (
        Option.isNone(maybeAccount) ||
        maybeAccount.value.networkId !== query.networkId
      ) {
        return Effect.fail(
          new WalletClientError({ code: 'UnsupportedCapability' }),
        )
      }
      return Ref.get(transactions).pipe(
        Effect.flatMap(records =>
          historyPage(
            records,
            query.accountId,
            query.networkId,
            query.maybeCursor,
            query.limit,
          ),
        ),
      )
    },
    observeTransactions: accountIds => {
      const hasUnknownAccount = Array_.some(accountIds, accountId =>
        Option.isNone(accountForId(accountId)),
      )
      if (hasUnknownAccount) {
        return Stream.fail(
          new WalletClientError({ code: 'UnsupportedCapability' }),
        )
      }
      return Stream.fromPubSub(transactionChanges).pipe(
        Stream.filter(transaction =>
          Array_.contains(accountIds, transaction.accountId),
        ),
      )
    },
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

/** Deterministic test-only vault whose profiles match the fixture portfolio. */
export const SimulatedWalletVault: Layer.Layer<WalletVault> = Layer.effect(
  WalletVault,
  Effect.sync(() => {
    const walletsById = new Map<string, WalletProfile>()
    return WalletVault.of({
      loadWallets: Effect.sync(() => Array_.fromIterable(walletsById.values())),
      createWallet: request =>
        Effect.suspend(() => {
          const existing = walletsById.get(request.requestId)
          if (existing !== undefined) {
            return Effect.succeed(existing)
          }
          const accounts = Array_.getSomes(
            Array_.map(request.networks, network =>
              Array_.findFirst(
                simulatedPortfolio.accounts,
                account =>
                  account.chainId === network.chainId &&
                  account.networkId === network.networkId,
              ),
            ),
          )
          if (Array_.length(accounts) !== Array_.length(request.networks)) {
            return Effect.fail(
              new WalletVaultError({ code: 'InvalidKeyMaterial' }),
            )
          }
          const wallet = WalletProfile.make({
            walletId: request.requestId,
            displayName: request.displayName,
            createdAt: fixedObservedAt + walletsById.size,
            accounts,
          })
          walletsById.set(wallet.walletId, wallet)
          return Effect.succeed(wallet)
        }),
    })
  }),
)

/** Builds deterministic test-only Wallet resources with a host-selected vault. */
export const makeSimulatedWalletResources = (
  options: Readonly<{
    walletClipboard?: Layer.Layer<WalletClipboard>
    walletVault?: Layer.Layer<WalletVault>
  }> = {},
): Layer.Layer<WalletResources> => {
  const walletClipboard = options.walletClipboard ?? WalletClipboardUnavailable
  const walletVault = options.walletVault ?? SimulatedWalletVault
  return Layer.merge(
    Layer.merge(Layer.effectContext(makeSimulatedServices), walletVault),
    walletClipboard,
  )
}

/** Deterministic Wallet resources that production hosts must never select. */
export const SimulatedWalletResources: Layer.Layer<WalletResources> =
  makeSimulatedWalletResources()
