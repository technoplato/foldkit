import { Context, Crypto, Effect, HashMap, Layer, Option, Ref } from 'effect'
import {
  type SignedTransaction,
  type TransactionPayload,
} from 'wallet-core-example'
import {
  SignedTransactionHandle,
  TransactionPayloadHandle,
  WalletRemoteError,
} from 'wallet-remote-example'

type WalletOperationState = Readonly<{
  transactions: HashMap.HashMap<string, TransactionPayload>
  signedTransactions: HashMap.HashMap<string, SignedTransaction>
}>

type WalletOperationStoreService = Readonly<{
  putTransaction: (
    transaction: TransactionPayload,
  ) => Effect.Effect<TransactionPayloadHandle>
  getTransaction: (
    handle: TransactionPayloadHandle,
  ) => Effect.Effect<TransactionPayload, WalletRemoteError>
  putSignedTransaction: (
    signed: SignedTransaction,
  ) => Effect.Effect<SignedTransactionHandle>
  getSignedTransaction: (
    handle: SignedTransactionHandle,
  ) => Effect.Effect<SignedTransaction, WalletRemoteError>
}>

/** Server-owned transaction material indexed by opaque client handles. */
export class WalletOperationStore extends Context.Service<
  WalletOperationStore,
  WalletOperationStoreService
>()('WalletTestnetServer/WalletOperationStore') {}

const missingOperation = (operation: 'SignTransaction' | 'SubmitTransaction') =>
  new WalletRemoteError({ operation, code: 'InvalidPayload' })

const makeWalletOperationStore = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto
  const state = yield* Ref.make<WalletOperationState>({
    transactions: HashMap.empty<string, TransactionPayload>(),
    signedTransactions: HashMap.empty<string, SignedTransaction>(),
  })
  const nextOperationId = Effect.orDie(crypto.randomUUIDv4)

  return WalletOperationStore.of({
    putTransaction: transaction =>
      Effect.gen(function* () {
        const operationId = yield* nextOperationId
        yield* Ref.update(state, current => ({
          ...current,
          transactions: HashMap.set(
            current.transactions,
            operationId,
            transaction,
          ),
        }))
        return TransactionPayloadHandle.make({
          operationId,
          accountId: transaction.accountId,
          networkId: transaction.networkId,
        })
      }),
    getTransaction: handle =>
      Ref.get(state).pipe(
        Effect.flatMap(current =>
          Effect.fromOption(
            HashMap.get(current.transactions, handle.operationId).pipe(
              Option.filter(
                transaction =>
                  transaction.accountId === handle.accountId &&
                  transaction.networkId === handle.networkId,
              ),
            ),
          ),
        ),
        Effect.mapError(() => missingOperation('SignTransaction')),
      ),
    putSignedTransaction: signed =>
      Effect.gen(function* () {
        const operationId = yield* nextOperationId
        yield* Ref.update(state, current => ({
          ...current,
          signedTransactions: HashMap.set(
            current.signedTransactions,
            operationId,
            signed,
          ),
        }))
        return SignedTransactionHandle.make({
          operationId,
          accountId: signed.accountId,
          networkId: signed.networkId,
        })
      }),
    getSignedTransaction: handle =>
      Ref.get(state).pipe(
        Effect.flatMap(current =>
          Effect.fromOption(
            HashMap.get(current.signedTransactions, handle.operationId).pipe(
              Option.filter(
                signed =>
                  signed.accountId === handle.accountId &&
                  signed.networkId === handle.networkId,
              ),
            ),
          ),
        ),
        Effect.mapError(() => missingOperation('SubmitTransaction')),
      ),
  })
})

/** In-memory storage for one server process's protected transaction material. */
export const WalletOperationStoreLive = Layer.effect(
  WalletOperationStore,
  makeWalletOperationStore,
)
