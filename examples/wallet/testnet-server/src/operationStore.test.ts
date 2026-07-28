import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  makeSignedTransaction,
  makeTransactionPayload,
} from 'wallet-core-example'
import {
  SignedTransactionHandle,
  TransactionPayloadHandle,
} from 'wallet-remote-example'

import { NodeCrypto } from '@effect/platform-node'

import {
  WalletOperationStore,
  WalletOperationStoreLive,
} from './operationStore.js'

const runStore = <Value, Error>(
  effect: Effect.Effect<Value, Error, WalletOperationStore>,
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(WalletOperationStoreLive),
      Effect.provide(NodeCrypto.layer),
    ),
  )

describe('WalletOperationStore', () => {
  it('keeps generic protected transaction material behind opaque handles', async () => {
    const result = await runStore(
      Effect.gen(function* () {
        const store = yield* WalletOperationStore
        const transaction = makeTransactionPayload(
          'sepolia-sender',
          'ethereum:sepolia',
          'payload',
        )
        const signedTransaction = makeSignedTransaction(
          'sepolia-sender',
          'ethereum:sepolia',
          'signed-payload',
        )
        const transactionHandle = yield* store.putTransaction(transaction)
        const signedHandle =
          yield* store.putSignedTransaction(signedTransaction)

        return {
          transaction: yield* store.getTransaction(transactionHandle),
          signed: yield* store.getSignedTransaction(signedHandle),
        }
      }),
    )

    expect(result.transaction.accountId).toBe('sepolia-sender')
    expect(result.signed.networkId).toBe('ethereum:sepolia')
  })

  it('rejects handles that do not match server-owned material', async () => {
    const error = await runStore(
      Effect.gen(function* () {
        const store = yield* WalletOperationStore
        const transaction = yield* store.putTransaction(
          makeTransactionPayload(
            'sepolia-sender',
            'ethereum:sepolia',
            'payload',
          ),
        )
        return yield* store
          .getTransaction(
            TransactionPayloadHandle.make({
              operationId: transaction.operationId,
              accountId: 'different-account',
              networkId: 'ethereum:sepolia',
            }),
          )
          .pipe(Effect.flip)
      }),
    )

    expect(error.operation).toBe('SignTransaction')
    expect(error.code).toBe('InvalidPayload')
  })

  it('rejects unknown signed-operation handles', async () => {
    const error = await runStore(
      Effect.gen(function* () {
        const store = yield* WalletOperationStore
        return yield* store
          .getSignedTransaction(
            SignedTransactionHandle.make({
              operationId: 'missing',
              accountId: 'sepolia-sender',
              networkId: 'ethereum:sepolia',
            }),
          )
          .pipe(Effect.flip)
      }),
    )

    expect(error.operation).toBe('SubmitTransaction')
    expect(error.code).toBe('InvalidPayload')
  })
})
