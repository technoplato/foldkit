import { Array, Effect, Fiber, Option, Stream } from 'effect'
import { expect } from 'vitest'
import {
  FirstTransactionWithRecipient,
  SigningChallenge,
  TransactionPreview,
  TransferDraft,
  UnfamiliarAddress,
  WalletClient,
  WalletCrypto,
  WalletSigner,
} from 'wallet-core-example'

import { describe, it } from '@effect/vitest'

import {
  SimulatedWalletResources,
  simulatedPortfolio,
} from './simulatedWallet.js'

const maybeEthereumAccount = Array.head(simulatedPortfolio.accounts)
const maybeEthereumBalance = Array.head(
  simulatedPortfolio.balanceSnapshot.balances,
)

if (
  Option.isNone(maybeEthereumAccount) ||
  Option.isNone(maybeEthereumBalance)
) {
  throw new Error('Expected the simulated Ethereum fixtures')
}

const ethereumAccount = maybeEthereumAccount.value
const ethereumBalance = maybeEthereumBalance.value

const draft = TransferDraft.make({
  transferId: 'transfer-1',
  accountId: ethereumAccount.accountId,
  network: ethereumAccount.network,
  destinationAddress: '0x2222222222222222222222222222222222222222',
  value: {
    ...ethereumBalance.value,
    atomicUnits: '100000000000000000',
  },
  maybeMessage: Option.some('Dinner'),
})

describe('Simulated Wallet resources', () => {
  it.effect('loads, previews, signs, submits, and emits the transaction', () =>
    Effect.gen(function* () {
      const client = yield* WalletClient
      const signer = yield* WalletSigner
      const crypto = yield* WalletCrypto
      const portfolio = yield* client.loadPortfolio
      const quote = yield* client.previewTransaction(draft)
      const preview = TransactionPreview.make({
        previewId: quote.quoteId,
        draft,
        estimatedFee: quote.estimatedFee,
        resultingBalance: quote.resultingBalance,
        expiresAt: quote.expiresAt,
        recipientFamiliarity: UnfamiliarAddress.make({}),
        recipientHistory: FirstTransactionWithRecipient.make({}),
      })
      const observedFiber = yield* client
        .observeTransactions(portfolio.accounts)
        .pipe(Stream.runHead, Effect.forkChild)
      const prepared = yield* client.prepareTransaction(preview)
      const digest = yield* crypto.digestTransaction(prepared)
      const signed = yield* signer.signTransaction(prepared, digest)
      const submission = yield* client.submitTransaction(signed)
      const maybeObserved = yield* Fiber.join(observedFiber)

      expect(submission.previewId).toBe(preview.previewId)
      expect(
        Option.map(maybeObserved, value => value.transactionId),
      ).toStrictEqual(Option.some(submission.transactionId))
      expect(globalThis.String(signed.payload)).toBe('<redacted>')
    }).pipe(Effect.provide(SimulatedWalletResources)),
  )

  it.effect('signs and verifies one canonical challenge', () =>
    Effect.gen(function* () {
      const signer = yield* WalletSigner
      const crypto = yield* WalletCrypto
      const challenge = SigningChallenge.make({
        challengeId: 'challenge-1',
        accountId: ethereumAccount.accountId,
        digest: {
          algorithm: 'Keccak256',
          domain: 'foldkit.test.wallet',
          digestHex: '0x1234',
        },
      })
      const proof = yield* signer.signChallenge(challenge)
      const isVerified = yield* crypto.verifySignatureProof(challenge, proof)

      expect(isVerified).toBe(true)
      expect(proof.accountId).toBe(ethereumAccount.accountId)
    }).pipe(Effect.provide(SimulatedWalletResources)),
  )
})
