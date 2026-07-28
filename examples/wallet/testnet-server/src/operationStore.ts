import { Context, Crypto, Effect, HashMap, Layer, Option, Ref } from 'effect'
import {
  type PreparedTransaction,
  type SignedTransaction,
  type SigningDigest,
} from 'wallet-core-example'
import {
  PreparedTransactionHandle,
  SignedTransactionHandle,
  SigningDigestHandle,
  WalletRemoteError,
} from 'wallet-remote-example'

type DigestEntry = Readonly<{
  preparedOperationId: string
  digest: SigningDigest
}>

type SignedEntry = Readonly<{
  preparedOperationId: string
  signed: SignedTransaction
}>

type OperationState = Readonly<{
  prepared: HashMap.HashMap<string, PreparedTransaction>
  digests: HashMap.HashMap<string, DigestEntry>
  signed: HashMap.HashMap<string, SignedEntry>
}>

type WalletOperationStoreService = Readonly<{
  putPrepared: (
    prepared: PreparedTransaction,
  ) => Effect.Effect<PreparedTransactionHandle>
  getPrepared: (
    handle: PreparedTransactionHandle,
  ) => Effect.Effect<PreparedTransaction, WalletRemoteError>
  putDigest: (
    prepared: PreparedTransactionHandle,
    digest: SigningDigest,
  ) => Effect.Effect<SigningDigestHandle>
  getDigest: (
    prepared: PreparedTransactionHandle,
    digest: SigningDigestHandle,
  ) => Effect.Effect<SigningDigest, WalletRemoteError>
  putSigned: (
    prepared: PreparedTransactionHandle,
    signed: SignedTransaction,
  ) => Effect.Effect<SignedTransactionHandle>
  getSigned: (
    handle: SignedTransactionHandle,
  ) => Effect.Effect<SignedTransaction, WalletRemoteError>
}>

/** Server-owned transaction material indexed by opaque client handles. */
export class WalletOperationStore extends Context.Service<
  WalletOperationStore,
  WalletOperationStoreService
>()('WalletTestnetServer/WalletOperationStore') {}

const missingOperation = (
  operation: 'DigestTransaction' | 'SignTransaction' | 'SubmitTransaction',
) => new WalletRemoteError({ operation, code: 'InvalidPayload' })

const findPrepared = (
  state: OperationState,
  handle: PreparedTransactionHandle,
) =>
  HashMap.get(state.prepared, handle.operationId).pipe(
    Option.filter(
      prepared =>
        prepared.accountId === handle.accountId &&
        prepared.network._tag === handle.network._tag,
    ),
  )

const makeWalletOperationStore = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto
  const state = yield* Ref.make<OperationState>({
    prepared: HashMap.empty(),
    digests: HashMap.empty(),
    signed: HashMap.empty(),
  })
  const nextOperationId = Effect.orDie(crypto.randomUUIDv4)

  return WalletOperationStore.of({
    putPrepared: prepared =>
      Effect.gen(function* () {
        const operationId = yield* nextOperationId
        yield* Ref.update(state, current => ({
          ...current,
          prepared: HashMap.set(current.prepared, operationId, prepared),
        }))
        return PreparedTransactionHandle.make({
          operationId,
          accountId: prepared.accountId,
          network: prepared.network,
        })
      }),
    getPrepared: handle =>
      Ref.get(state).pipe(
        Effect.flatMap(current =>
          Effect.fromOption(findPrepared(current, handle)),
        ),
        Effect.mapError(() => missingOperation('DigestTransaction')),
      ),
    putDigest: (prepared, digest) =>
      Effect.gen(function* () {
        const operationId = yield* nextOperationId
        yield* Ref.update(state, current => ({
          ...current,
          digests: HashMap.set(current.digests, operationId, {
            preparedOperationId: prepared.operationId,
            digest,
          }),
        }))
        return SigningDigestHandle.make({ operationId })
      }),
    getDigest: (prepared, digest) =>
      Ref.get(state).pipe(
        Effect.flatMap(current =>
          Effect.fromOption(
            HashMap.get(current.digests, digest.operationId).pipe(
              Option.filter(
                entry => entry.preparedOperationId === prepared.operationId,
              ),
              Option.map(entry => entry.digest),
            ),
          ),
        ),
        Effect.mapError(() => missingOperation('SignTransaction')),
      ),
    putSigned: (prepared, signed) =>
      Effect.gen(function* () {
        const operationId = yield* nextOperationId
        yield* Ref.update(state, current => ({
          ...current,
          signed: HashMap.set(current.signed, operationId, {
            preparedOperationId: prepared.operationId,
            signed,
          }),
        }))
        return SignedTransactionHandle.make({
          operationId,
          accountId: signed.accountId,
          network: signed.network,
        })
      }),
    getSigned: handle =>
      Ref.get(state).pipe(
        Effect.flatMap(current =>
          Effect.fromOption(
            HashMap.get(current.signed, handle.operationId).pipe(
              Option.filter(
                entry =>
                  entry.signed.accountId === handle.accountId &&
                  entry.signed.network._tag === handle.network._tag,
              ),
              Option.map(entry => entry.signed),
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
