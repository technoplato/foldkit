import {
  Array as Array_,
  Context,
  Effect,
  Layer,
  Match as M,
  Option,
  PubSub,
  Redacted,
  Schema as S,
  Stream,
} from 'effect'
import {
  AccountBalance,
  AtomicUnits,
  BalanceSnapshot,
  type Currency,
  type CurrencyDecimalPlaces,
  CurrencyValue,
  Eth,
  EthereumSepolia,
  EthereumSignatureProof,
  PortfolioSnapshot,
  ReceivingInstruction,
  type SignatureProof,
  type SignedTransaction,
  type SigningChallenge,
  Sol,
  SolanaDevnet,
  SolanaEd25519SignatureProof,
  TransactionPreview,
  TransactionRecord,
  TransactionSubmission,
  type TransferDraft,
  Usdc,
  WalletAccount,
  WalletClient,
  WalletClientError,
  WalletCrypto,
  WalletCryptoError,
  type WalletResources,
  WalletSigner,
  WalletSignerError,
  makePreparedTransaction,
  makeSignedTransaction,
  makeSigningDigest,
} from 'wallet-core-example'

const fixedObservedAt = 1_785_129_600_000
const fixedExpiresAt = fixedObservedAt + 5 * 60 * 1_000
const ethereumAccountId = 'simulated-ethereum-account'
const ethereumAddress = '0x1111111111111111111111111111111111111111'
const solanaAccountId = 'simulated-solana-account'
const solanaAddress = '7XSg97qfSE6n2J1aVfxyTLZgcV7R4sr1kPnCVTLMriYJ'
const sepoliaUsdcAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
const devnetUsdcAddress = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'

const ethereumNetwork = EthereumSepolia.make({})
const solanaNetwork = SolanaDevnet.make({})
const ethereumCurrency = Eth.make({ network: ethereumNetwork })
const solanaCurrency = Sol.make({ network: solanaNetwork })
const ethereumUsdcCurrency = Usdc.make({
  network: ethereumNetwork,
  tokenAddress: sepoliaUsdcAddress,
})
const solanaUsdcCurrency = Usdc.make({
  network: solanaNetwork,
  tokenAddress: devnetUsdcAddress,
})

const currencyValue = (
  currency: Currency,
  atomicUnits: AtomicUnits,
  decimalPlaces: CurrencyDecimalPlaces,
): typeof CurrencyValue.Type =>
  CurrencyValue.make({
    currency,
    atomicUnits,
    decimalPlaces,
    observedAt: fixedObservedAt,
  })

const ethereumAccount = WalletAccount.make({
  accountId: ethereumAccountId,
  network: ethereumNetwork,
  address: ethereumAddress,
  displayName: 'Simulated Sepolia Account',
})

const solanaAccount = WalletAccount.make({
  accountId: solanaAccountId,
  network: solanaNetwork,
  address: solanaAddress,
  displayName: 'Simulated Solana Account',
})

const accountBalances: ReadonlyArray<typeof AccountBalance.Type> = [
  AccountBalance.make({
    accountId: ethereumAccountId,
    value: currencyValue(ethereumCurrency, '2500000000000000000', 18),
  }),
  AccountBalance.make({
    accountId: ethereumAccountId,
    value: currencyValue(ethereumUsdcCurrency, '125500000', 6),
  }),
  AccountBalance.make({
    accountId: solanaAccountId,
    value: currencyValue(solanaCurrency, '7200000000', 9),
  }),
  AccountBalance.make({
    accountId: solanaAccountId,
    value: currencyValue(solanaUsdcCurrency, '90000000', 6),
  }),
]

/** Public deterministic portfolio used by every simulated host. */
export const simulatedPortfolio = PortfolioSnapshot.make({
  accounts: [ethereumAccount, solanaAccount],
  balanceSnapshot: BalanceSnapshot.make({
    observedAt: fixedObservedAt,
    balances: accountBalances,
  }),
  receivingInstructions: [
    ReceivingInstruction.make({
      accountId: ethereumAccountId,
      network: ethereumNetwork,
      currency: ethereumCurrency,
      destinationAddress: ethereumAddress,
      maybeMemo: Option.none(),
      portableUri: `/wallet/receive/${ethereumAccountId}?asset=eth`,
    }),
    ReceivingInstruction.make({
      accountId: ethereumAccountId,
      network: ethereumNetwork,
      currency: ethereumUsdcCurrency,
      destinationAddress: ethereumAddress,
      maybeMemo: Option.none(),
      portableUri: `/wallet/receive/${ethereumAccountId}?asset=usdc`,
    }),
    ReceivingInstruction.make({
      accountId: solanaAccountId,
      network: solanaNetwork,
      currency: solanaCurrency,
      destinationAddress: solanaAddress,
      maybeMemo: Option.none(),
      portableUri: `/wallet/receive/${solanaAccountId}?asset=sol`,
    }),
    ReceivingInstruction.make({
      accountId: solanaAccountId,
      network: solanaNetwork,
      currency: solanaUsdcCurrency,
      destinationAddress: solanaAddress,
      maybeMemo: Option.none(),
      portableUri: `/wallet/receive/${solanaAccountId}?asset=usdc`,
    }),
  ],
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

const feeForDraft = (draft: TransferDraft): typeof CurrencyValue.Type =>
  M.value(draft.network).pipe(
    M.withReturnType<typeof CurrencyValue.Type>(),
    M.tagsExhaustive({
      EthereumSepolia: () =>
        currencyValue(ethereumCurrency, '1000000000000000', 18),
      SolanaDevnet: () => currencyValue(solanaCurrency, '5000', 9),
    }),
  )

const balanceForDraft = (
  accountId: string,
  draft: TransferDraft,
): typeof CurrencyValue.Type => {
  const maybeBalance = Array_.findFirst(
    accountBalances,
    balance =>
      balance.accountId === accountId &&
      balance.value.currency._tag === draft.value.currency._tag,
  )
  if (Option.isNone(maybeBalance)) {
    return currencyValue(
      draft.value.currency,
      S.decodeUnknownSync(AtomicUnits)(`-${draft.value.atomicUnits}`),
      draft.value.decimalPlaces,
    )
  }
  const nextAtomicUnits =
    BigInt(maybeBalance.value.value.atomicUnits) -
    BigInt(draft.value.atomicUnits)
  return CurrencyValue.make({
    ...maybeBalance.value.value,
    atomicUnits: S.decodeUnknownSync(AtomicUnits)(nextAtomicUnits.toString()),
    observedAt: fixedObservedAt,
  })
}

const accountForId = (accountId: string) =>
  Array_.findFirst(
    simulatedPortfolio.accounts,
    account => account.accountId === accountId,
  )

const signingProof = (
  challenge: SigningChallenge,
): Effect.Effect<SignatureProof, WalletSignerError> => {
  const maybeAccount = accountForId(challenge.accountId)
  if (Option.isNone(maybeAccount)) {
    return Effect.fail(new WalletSignerError({ code: 'UnsupportedAccount' }))
  }
  const signature = stableHash(
    `${challenge.digest.domain}:${challenge.digest.digestHex}:${challenge.accountId}`,
  )
  return M.value(maybeAccount.value.network).pipe(
    M.withReturnType<Effect.Effect<SignatureProof, WalletSignerError>>(),
    M.tagsExhaustive({
      EthereumSepolia: () =>
        Effect.succeed(
          EthereumSignatureProof.make({
            challengeId: challenge.challengeId,
            accountId: challenge.accountId,
            address: maybeAccount.value.address,
            signatureHex: `0x${signature}`,
          }),
        ),
      SolanaDevnet: () =>
        Effect.succeed(
          SolanaEd25519SignatureProof.make({
            challengeId: challenge.challengeId,
            accountId: challenge.accountId,
            publicKey: maybeAccount.value.address,
            signatureBase58: `simulated${signature}`,
          }),
        ),
      SolanaTestnet: () =>
        Effect.succeed(
          SolanaEd25519SignatureProof.make({
            challengeId: challenge.challengeId,
            accountId: challenge.accountId,
            publicKey: maybeAccount.value.address,
            signatureBase58: `simulated${signature}`,
          }),
        ),
    }),
  )
}

const makeSimulatedServices = Effect.gen(function* () {
  const transactionChanges = yield* PubSub.unbounded<TransactionRecord>({
    replay: 1,
  })
  const client = WalletClient.of({
    loadPortfolio: Effect.succeed(simulatedPortfolio),
    previewTransaction: draft =>
      Effect.succeed({
        quoteId: `preview-${stableHash(draft.transferId)}`,
        estimatedFee: feeForDraft(draft),
        resultingBalance: balanceForDraft(draft.accountId, draft),
        expiresAt: fixedExpiresAt,
      }),
    prepareTransaction: preview =>
      Effect.succeed(
        makePreparedTransaction(
          preview.draft.accountId,
          preview.draft.network,
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
        const transactionId = `simulated-${stableHash(
          `${signedPayload.preview.previewId}:${signedPayload.digest}`,
        )}`
        const record = TransactionRecord.make({
          transactionId,
          accountId: signedPayload.preview.draft.accountId,
          network: signedPayload.preview.draft.network,
          direction: 'Outgoing',
          status: 'Confirmed',
          value: signedPayload.preview.draft.value,
          counterpartyAddress: signedPayload.preview.draft.destinationAddress,
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
    observeTransactions: accounts => {
      const accountIds = Array_.map(accounts, account => account.accountId)
      return Stream.fromPubSub(transactionChanges).pipe(
        Stream.filter(transaction =>
          Array_.contains(accountIds, transaction.accountId),
        ),
      )
    },
  })
  const signer = WalletSigner.of({
    signTransaction: (prepared, digest) => {
      const preview = S.decodeUnknownSync(TransactionPreviewJson)(
        Redacted.value(prepared.payload),
      )
      const payload = S.encodeSync(SignedPayloadJson)({
        preview,
        digest: Redacted.value(digest),
      })
      return Effect.succeed(
        makeSignedTransaction(prepared.accountId, prepared.network, payload),
      )
    },
    signChallenge: signingProof,
  })
  const crypto = WalletCrypto.of({
    digestTransaction: prepared =>
      Effect.succeed(
        makeSigningDigest(stableHash(Redacted.value(prepared.payload))),
      ),
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
