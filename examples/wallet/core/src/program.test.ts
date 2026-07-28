import { Effect, Layer, Option, Schema as S, Stream } from 'effect'
import { Runtime } from 'foldkit'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import {
  CurrencyValue,
  Eth,
  EthereumSepolia,
  EthereumSepoliaEthValue,
} from './currency.js'
import {
  ComposedTransfer,
  RequestedChallengeSignature,
  RequestedSignedTransactionSubmission,
} from './message.js'
import {
  AccountBalance,
  BalanceSnapshot,
  CryptoFailure,
  EthereumSepoliaEthTransactionPreview,
  EthereumSepoliaEthTransferDraft,
  EthereumSignatureProof,
  FirstTransactionWithRecipient,
  NetworkFailure,
  PortfolioSnapshot,
  ReceivingInstruction,
  SigningChallenge,
  SigningFailure,
  TransactionPreview,
  TransactionQuote,
  TransactionRecord,
  TransactionSubmission,
  UnfamiliarAddress,
  WalletAccount,
} from './model.js'
import { WalletProgram } from './program.js'
import { subscriptions } from './subscription.js'
import {
  LoadWallet,
  PreviewTransaction,
  SignAndSubmitTransaction,
  SignChallenge,
} from './update.js'
import {
  WalletClient,
  WalletClientError,
  type WalletClientService,
  WalletCrypto,
  WalletCryptoError,
  type WalletCryptoService,
  WalletSigner,
  WalletSignerError,
  type WalletSignerService,
  makePreparedTransaction,
  makeSignedTransaction,
  makeSigningDigest,
} from './walletClient.js'

const observedAt = 1_722_000_000_000
const ethereum = EthereumSepolia.make({})
const eth = Eth.make({ network: ethereum })
const account = WalletAccount.make({
  accountId: 'account-1',
  network: ethereum,
  address: '0xAccount',
  displayName: 'Sepolia Account',
})
const balance = CurrencyValue.make({
  currency: eth,
  atomicUnits: '1000000000000000000',
  decimalPlaces: 18,
  observedAt,
})
const fee = EthereumSepoliaEthValue.make({
  currency: eth,
  atomicUnits: '1000',
  decimalPlaces: 18,
  observedAt,
})
const resultingBalance = EthereumSepoliaEthValue.make({
  currency: eth,
  atomicUnits: '899999999999999000',
  decimalPlaces: 18,
  observedAt: observedAt + 1,
})
const portfolio = PortfolioSnapshot.make({
  accounts: [account],
  balanceSnapshot: BalanceSnapshot.make({
    observedAt,
    balances: [
      AccountBalance.make({ accountId: account.accountId, value: balance }),
    ],
  }),
  receivingInstructions: [
    ReceivingInstruction.make({
      accountId: account.accountId,
      network: ethereum,
      currency: eth,
      destinationAddress: account.address,
      maybeMemo: Option.none(),
      portableUri: `ethereum:${account.address}@sepolia`,
    }),
  ],
})
const draft = EthereumSepoliaEthTransferDraft.make({
  transferId: 'transfer-1',
  accountId: account.accountId,
  network: ethereum,
  destinationAddress: '0xRecipient',
  value: EthereumSepoliaEthValue.make({
    currency: eth,
    atomicUnits: '100000000000000000',
    decimalPlaces: 18,
    observedAt,
  }),
  maybeMessage: Option.some('Public transfer note'),
})
const quote = TransactionQuote.make({
  quoteId: 'quote-1',
  estimatedFee: fee,
  resultingBalance,
  expiresAt: observedAt + 60_000,
})
const preview = EthereumSepoliaEthTransactionPreview.make({
  previewId: quote.quoteId,
  draft,
  estimatedFee: fee,
  resultingBalance,
  expiresAt: quote.expiresAt,
  recipientFamiliarity: UnfamiliarAddress.make({}),
  recipientHistory: FirstTransactionWithRecipient.make({}),
})
const submission = TransactionSubmission.make({
  previewId: preview.previewId,
  transactionId: 'transaction-1',
  submittedAt: observedAt + 2,
})
const observedTransaction = TransactionRecord.make({
  transactionId: 'transaction-observed',
  accountId: account.accountId,
  network: ethereum,
  direction: 'Incoming',
  status: 'Confirmed',
  value: draft.value,
  counterpartyAddress: draft.destinationAddress,
  observedAt,
})
const challenge = SigningChallenge.make({
  challengeId: 'challenge-1',
  accountId: account.accountId,
  digest: {
    algorithm: 'Keccak256',
    domain: 'wallet.example/access/v1',
    digestHex: '0xPublicDigest',
  },
})
const proof = EthereumSignatureProof.make({
  challengeId: challenge.challengeId,
  accountId: challenge.accountId,
  address: account.address,
  signatureHex: '0xPublicSignature',
})

const defaultClient: WalletClientService = {
  loadPortfolio: Effect.succeed(portfolio),
  previewTransaction: () => Effect.succeed(quote),
  prepareTransaction: transactionPreview =>
    Effect.succeed(
      makePreparedTransaction(
        transactionPreview.draft.accountId,
        transactionPreview.draft.network,
        'prepared-private-payload',
      ),
    ),
  submitTransaction: () => Effect.succeed(submission),
  observeTransactions: () => Stream.empty,
}

const defaultSigner: WalletSignerService = {
  signTransaction: prepared =>
    Effect.succeed(
      makeSignedTransaction(
        prepared.accountId,
        prepared.network,
        'signed-private-payload',
      ),
    ),
  signChallenge: () => Effect.succeed(proof),
}

const defaultCrypto: WalletCryptoService = {
  digestTransaction: () =>
    Effect.succeed(makeSigningDigest('private-signing-digest')),
  verifySignatureProof: () => Effect.succeed(true),
}

const makeResources = (
  client: WalletClientService = defaultClient,
  signer: WalletSignerService = defaultSigner,
  crypto: WalletCryptoService = defaultCrypto,
) =>
  Layer.mergeAll(
    Layer.succeed(WalletClient, client),
    Layer.succeed(WalletSigner, signer),
    Layer.succeed(WalletCrypto, crypto),
  )

describe('Wallet Commands', () => {
  it('round-trips public optional fields through JSON codecs', () => {
    const transactionPreviewJson = S.fromJsonString(TransactionPreview)
    const portfolioSnapshotJson = S.fromJsonString(PortfolioSnapshot)

    expect(
      S.decodeSync(transactionPreviewJson)(
        S.encodeSync(transactionPreviewJson)(preview),
      ),
    ).toStrictEqual(preview)
    expect(
      S.decodeSync(portfolioSnapshotJson)(
        S.encodeSync(portfolioSnapshotJson)(portfolio),
      ),
    ).toStrictEqual(portfolio)
  })

  it.effect('loads and previews through the injected network Layer', () =>
    Effect.gen(function* () {
      const resources = makeResources()
      const loaded = yield* LoadWallet().effect.pipe(Effect.provide(resources))
      const previewed = yield* PreviewTransaction({
        draft,
        recipientFamiliarity: UnfamiliarAddress.make({}),
        recipientHistory: FirstTransactionWithRecipient.make({}),
      }).effect.pipe(Effect.provide(resources))

      expect(loaded).toMatchObject({
        _tag: 'SucceededLoadWallet',
        portfolio,
      })
      expect(previewed).toMatchObject({
        _tag: 'SucceededPreviewTransaction',
        preview,
      })
    }),
  )

  it.effect(
    'keeps private transaction material inside the injected Layers',
    () =>
      Effect.gen(function* () {
        const command = SignAndSubmitTransaction({ preview })
        const result = yield* command.effect.pipe(
          Effect.provide(makeResources()),
        )

        expect(result).toStrictEqual({
          _tag: 'SucceededSubmitSignedTransaction',
          submission,
        })
        expect(JSON.stringify(command.args)).not.toContain('private')
        expect(JSON.stringify(result)).not.toContain('private')
      }),
  )

  it.effect('signs and verifies a canonical public challenge', () =>
    Effect.gen(function* () {
      const result = yield* SignChallenge({ challenge }).effect.pipe(
        Effect.provide(makeResources()),
      )

      expect(result).toStrictEqual({
        _tag: 'SucceededSignChallenge',
        challenge,
        proof,
      })
    }),
  )

  it.effect('maps every networking stage to a public network failure', () =>
    Effect.gen(function* () {
      const unavailable = new WalletClientError({ code: 'Unavailable' })
      const loadResult = yield* LoadWallet().effect.pipe(
        Effect.provide(
          makeResources({
            ...defaultClient,
            loadPortfolio: Effect.fail(unavailable),
          }),
        ),
      )
      const previewResult = yield* PreviewTransaction({
        draft,
        recipientFamiliarity: UnfamiliarAddress.make({}),
        recipientHistory: FirstTransactionWithRecipient.make({}),
      }).effect.pipe(
        Effect.provide(
          makeResources({
            ...defaultClient,
            previewTransaction: () => Effect.fail(unavailable),
          }),
        ),
      )
      const prepareResult = yield* SignAndSubmitTransaction({
        preview,
      }).effect.pipe(
        Effect.provide(
          makeResources({
            ...defaultClient,
            prepareTransaction: () => Effect.fail(unavailable),
          }),
        ),
      )
      const submitResult = yield* SignAndSubmitTransaction({
        preview,
      }).effect.pipe(
        Effect.provide(
          makeResources({
            ...defaultClient,
            submitTransaction: () => Effect.fail(unavailable),
          }),
        ),
      )

      expect(loadResult).toMatchObject({
        _tag: 'FailedLoadWallet',
        failure: NetworkFailure.make({
          operation: 'LoadPortfolio',
          code: 'Unavailable',
        }),
      })
      expect(previewResult).toMatchObject({
        _tag: 'FailedPreviewTransaction',
        failure: NetworkFailure.make({
          operation: 'PreviewTransaction',
          code: 'Unavailable',
        }),
      })
      expect(prepareResult).toMatchObject({
        _tag: 'FailedSubmitSignedTransaction',
        failure: NetworkFailure.make({
          operation: 'PrepareTransaction',
          code: 'Unavailable',
        }),
      })
      expect(submitResult).toMatchObject({
        _tag: 'FailedSubmitSignedTransaction',
        failure: NetworkFailure.make({
          operation: 'SubmitTransaction',
          code: 'Unavailable',
        }),
      })
    }),
  )

  it.effect('maps signing and cryptographic stages to public failures', () =>
    Effect.gen(function* () {
      const cryptoError = new WalletCryptoError({ code: 'InvalidPayload' })
      const signerError = new WalletSignerError({ code: 'Denied' })
      const digestResult = yield* SignAndSubmitTransaction({
        preview,
      }).effect.pipe(
        Effect.provide(
          makeResources(defaultClient, defaultSigner, {
            ...defaultCrypto,
            digestTransaction: () => Effect.fail(cryptoError),
          }),
        ),
      )
      const signingResult = yield* SignAndSubmitTransaction({
        preview,
      }).effect.pipe(
        Effect.provide(
          makeResources(defaultClient, {
            ...defaultSigner,
            signTransaction: () => Effect.fail(signerError),
          }),
        ),
      )
      const challengeSigningResult = yield* SignChallenge({
        challenge,
      }).effect.pipe(
        Effect.provide(
          makeResources(defaultClient, {
            ...defaultSigner,
            signChallenge: () => Effect.fail(signerError),
          }),
        ),
      )
      const challengeVerificationResult = yield* SignChallenge({
        challenge,
      }).effect.pipe(
        Effect.provide(
          makeResources(defaultClient, defaultSigner, {
            ...defaultCrypto,
            verifySignatureProof: () => Effect.succeed(false),
          }),
        ),
      )
      const challengeCryptoResult = yield* SignChallenge({
        challenge,
      }).effect.pipe(
        Effect.provide(
          makeResources(defaultClient, defaultSigner, {
            ...defaultCrypto,
            verifySignatureProof: () => Effect.fail(cryptoError),
          }),
        ),
      )

      expect(digestResult).toMatchObject({
        _tag: 'FailedSubmitSignedTransaction',
        failure: CryptoFailure.make({
          operation: 'DigestTransaction',
          code: 'InvalidPayload',
        }),
      })
      expect(signingResult).toMatchObject({
        _tag: 'FailedSubmitSignedTransaction',
        failure: SigningFailure.make({
          operation: 'SignTransaction',
          code: 'Denied',
        }),
      })
      expect(challengeSigningResult).toMatchObject({
        _tag: 'FailedSignChallenge',
        failure: SigningFailure.make({
          operation: 'SignChallenge',
          code: 'Denied',
        }),
      })
      expect(challengeVerificationResult).toMatchObject({
        _tag: 'FailedSignChallenge',
        failure: CryptoFailure.make({
          operation: 'VerifyChallenge',
          code: 'VerificationFailed',
        }),
      })
      expect(challengeCryptoResult).toMatchObject({
        _tag: 'FailedSignChallenge',
        failure: CryptoFailure.make({
          operation: 'VerifyChallenge',
          code: 'InvalidPayload',
        }),
      })
    }),
  )
})

describe('Wallet Subscription and Program replay', () => {
  it.effect(
    'emits observed transactions and sanitized observation failures',
    () =>
      Effect.gen(function* () {
        const successClient: WalletClientService = {
          ...defaultClient,
          observeTransactions: () => Stream.make(observedTransaction),
        }
        const failureClient: WalletClientService = {
          ...defaultClient,
          observeTransactions: () =>
            Stream.fail(new WalletClientError({ code: 'Rejected' })),
        }
        const successMessages = yield* subscriptions.transactionChanges
          .dependenciesToStream({ accounts: [account], isEnabled: true })
          .pipe(
            Stream.runCollect,
            Effect.provide(Layer.succeed(WalletClient, successClient)),
          )
        const failureMessages = yield* subscriptions.transactionChanges
          .dependenciesToStream({ accounts: [account], isEnabled: true })
          .pipe(
            Stream.runCollect,
            Effect.provide(Layer.succeed(WalletClient, failureClient)),
          )

        expect(successMessages).toStrictEqual([
          { _tag: 'ObservedTransaction', transaction: observedTransaction },
        ])
        expect(failureMessages).toStrictEqual([
          {
            _tag: 'FailedObserveTransactions',
            failure: NetworkFailure.make({
              operation: 'ObserveTransactions',
              code: 'Rejected',
            }),
          },
        ])
      }),
  )

  it.effect('never records private transaction material in a replay tape', () =>
    Effect.gen(function* () {
      const tape = yield* Runtime.recordReplayTape(
        WalletProgram,
        makeResources(),
        [
          ComposedTransfer.make({ draft }),
          RequestedSignedTransactionSubmission.make({
            previewId: preview.previewId,
          }),
          RequestedChallengeSignature.make({ challenge }),
        ],
      )
      const serializedTape = JSON.stringify(tape)

      expect(serializedTape).not.toContain('prepared-private-payload')
      expect(serializedTape).not.toContain('private-signing-digest')
      expect(serializedTape).not.toContain('signed-private-payload')
      expect(serializedTape).not.toContain('payload')
      expect(
        tape.transitions.map(transition => transition.message._tag),
      ).toContain('SucceededSubmitSignedTransaction')
      expect(
        tape.transitions.map(transition => transition.message._tag),
      ).toContain('SucceededSignChallenge')
    }),
  )
})
