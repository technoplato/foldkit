import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  EthereumSepolia,
  makePreparedTransaction,
  makeSignedTransaction,
  makeSigningDigest,
} from 'wallet-core-example'
import {
  PreparedTransactionHandle,
  SignedTransactionHandle,
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
  it('keeps protected transaction material behind matching opaque handles', async () => {
    const result = await runStore(
      Effect.gen(function* () {
        const store = yield* WalletOperationStore
        const network = EthereumSepolia.make({})
        const preparedTransaction = makePreparedTransaction(
          'sepolia-sender',
          network,
          'prepared-payload',
        )
        const signedTransaction = makeSignedTransaction(
          'sepolia-sender',
          network,
          'signed-payload',
        )
        const prepared = yield* store.putPrepared(preparedTransaction)
        const digest = yield* store.putDigest(
          prepared,
          makeSigningDigest('digest'),
        )
        const signed = yield* store.putSigned(prepared, signedTransaction)

        return {
          prepared: yield* store.getPrepared(prepared),
          digest: yield* store.getDigest(prepared, digest),
          signed: yield* store.getSigned(signed),
        }
      }),
    )

    expect(result.prepared.accountId).toBe('sepolia-sender')
    expect(result.digest).toBeDefined()
    expect(result.signed.accountId).toBe('sepolia-sender')
  })

  it('rejects handles that do not match server-owned material', async () => {
    const error = await runStore(
      Effect.gen(function* () {
        const store = yield* WalletOperationStore
        const network = EthereumSepolia.make({})
        const prepared = yield* store.putPrepared(
          makePreparedTransaction(
            'sepolia-sender',
            network,
            'prepared-payload',
          ),
        )
        return yield* store
          .getPrepared(
            PreparedTransactionHandle.make({
              operationId: prepared.operationId,
              accountId: 'different-account',
              network,
            }),
          )
          .pipe(Effect.flip)
      }),
    )

    expect(error.operation).toBe('DigestTransaction')
    expect(error.code).toBe('InvalidPayload')
  })

  it('rejects unknown signed-operation handles', async () => {
    const error = await runStore(
      Effect.gen(function* () {
        const store = yield* WalletOperationStore
        return yield* store
          .getSigned(
            SignedTransactionHandle.make({
              operationId: 'missing',
              accountId: 'sepolia-sender',
              network: EthereumSepolia.make({}),
            }),
          )
          .pipe(Effect.flip)
      }),
    )

    expect(error.operation).toBe('SubmitTransaction')
    expect(error.code).toBe('InvalidPayload')
  })
})
