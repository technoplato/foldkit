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
  type WalletCapability,
  WalletClient,
  WalletClientError,
  WalletClipboard,
  WalletClipboardUnavailable,
  WalletCrypto,
  WalletCryptoError,
  type WalletResources,
  WalletSigner,
  WalletSignerError,
  WalletVault,
  assetForId,
  makeSignedTransaction,
  makeTransactionPayload,
} from 'wallet-core-example'
import { LocalWalletVault } from 'wallet-local-vault-example'

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
  'TransactionHistory',
  'TransactionObservation',
  'ChallengeSignature',
]

const networks = [
  NetworkDescriptor.make({
    networkId: bitcoinRegtestNetworkId,
    chainId: bitcoinChainId,
    displayName: 'Bitcoin Regtest',
    environment: 'Local',
    capabilities: transferCapabilities,
  }),
  NetworkDescriptor.make({
    networkId: bitcoinTestnetNetworkId,
    chainId: bitcoinChainId,
    displayName: 'Bitcoin Testnet',
    environment: 'Testnet',
    capabilities: transferCapabilities,
  }),
  NetworkDescriptor.make({
    networkId: ethereumLocalnetNetworkId,
    chainId: ethereumChainId,
    displayName: 'Ethereum Localnet',
    environment: 'Local',
    capabilities: transferCapabilities,
  }),
  NetworkDescriptor.make({
    networkId: ethereumNetworkId,
    chainId: ethereumChainId,
    displayName: 'Ethereum Sepolia',
    environment: 'Testnet',
    capabilities: transferCapabilities,
  }),
  NetworkDescriptor.make({
    networkId: solanaNetworkId,
    chainId: solanaChainId,
    displayName: 'Solana Devnet',
    environment: 'Development',
    capabilities: transferCapabilities,
  }),
  NetworkDescriptor.make({
    networkId: solanaTestnetNetworkId,
    chainId: solanaChainId,
    displayName: 'Solana Testnet',
    environment: 'Testnet',
    capabilities: transferCapabilities,
  }),
  NetworkDescriptor.make({
    networkId: suiDevnetNetworkId,
    chainId: suiChainId,
    displayName: 'Sui Devnet',
    environment: 'Development',
    capabilities: transferCapabilities,
  }),
  NetworkDescriptor.make({
    networkId: suiTestnetNetworkId,
    chainId: suiChainId,
    displayName: 'Sui Testnet',
    environment: 'Testnet',
    capabilities: transferCapabilities,
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
  networkId: string,
  address: string,
  displayName: string,
  assetId: string,
  atomicUnits: (typeof AssetAmount.Type)['atomicUnits'],
) => ({
  account: WalletAccount.make({ accountId, networkId, address, displayName }),
  assetId,
  atomicUnits,
})

const simulatedHoldings = [
  simulatedHolding(
    bitcoinRegtestAccountId,
    bitcoinRegtestNetworkId,
    'bcrt1q2n0r7w3x8k9m4p6s5t2v7y9z3c8d4f6g0h2j5k',
    'Simulated Bitcoin Regtest Account',
    bitcoinRegtestAssetId,
    '5000000',
  ),
  simulatedHolding(
    bitcoinTestnetAccountId,
    bitcoinTestnetNetworkId,
    'tb1q2n0r7w3x8k9m4p6s5t2v7y9z3c8d4f6g0h2j5k',
    'Simulated Bitcoin Testnet Account',
    bitcoinTestnetAssetId,
    '5000000',
  ),
  simulatedHolding(
    ethereumLocalnetAccountId,
    ethereumLocalnetNetworkId,
    '0x4444444444444444444444444444444444444444',
    'Simulated Ethereum Localnet Account',
    ethereumLocalnetAssetId,
    '5000000000000000000',
  ),
  simulatedHolding(
    ethereumAccountId,
    ethereumNetworkId,
    ethereumAddress,
    'Simulated Sepolia Account',
    ethereumEthAssetId,
    '2500000000000000000',
  ),
  simulatedHolding(
    solanaAccountId,
    solanaNetworkId,
    solanaAddress,
    'Simulated Solana Devnet Account',
    solanaSolAssetId,
    '7200000000',
  ),
  simulatedHolding(
    solanaTestnetAccountId,
    solanaTestnetNetworkId,
    '11111111111111111111111111111111',
    'Simulated Solana Testnet Account',
    solanaTestnetAssetId,
    '7200000000',
  ),
  simulatedHolding(
    suiDevnetAccountId,
    suiDevnetNetworkId,
    '0x1111111111111111111111111111111111111111111111111111111111111111',
    'Simulated Sui Devnet Account',
    suiDevnetAssetId,
    '12000000000',
  ),
  simulatedHolding(
    suiTestnetAccountId,
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

/** Public deterministic normalized portfolio used by simulated hosts. */
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

/** Builds deterministic Wallet resources with a host-selected local vault. */
export const makeSimulatedWalletResources = (
  options: Readonly<{
    walletClipboard?: Layer.Layer<WalletClipboard>
    walletVault?: Layer.Layer<WalletVault>
  }> = {},
): Layer.Layer<WalletResources> => {
  const walletClipboard = options.walletClipboard ?? WalletClipboardUnavailable
  const walletVault = options.walletVault ?? LocalWalletVault
  return Layer.merge(
    Layer.merge(Layer.effectContext(makeSimulatedServices), walletVault),
    walletClipboard,
  )
}

/** Deterministic, side-effect-complete Wallet resources for demos and tests. */
export const SimulatedWalletResources: Layer.Layer<WalletResources> =
  makeSimulatedWalletResources()
