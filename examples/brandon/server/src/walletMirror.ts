import type { WalletTransaction } from 'brandon-core-example'
import { Array, Effect, Option, Schema as S } from 'effect'

// WALLET MIRROR

/**
 * Every JSON-RPC method the mirror may call. Each one only reads what any
 * block explorer shows. This file holds no key, signs nothing, and has no
 * way to send a transaction.
 */
export const readOnlyRpcMethods = [
  'getBalance',
  'getSignaturesForAddress',
  'getTransaction',
] as const
type ReadOnlyRpcMethod = (typeof readOnlyRpcMethods)[number]

/** A network the mirror reads. */
export type WalletNetwork = 'Devnet' | 'Mainnet'

const rpcUrls: Readonly<Record<WalletNetwork, string>> = {
  Devnet: 'https://api.devnet.solana.com',
  Mainnet: 'https://api.mainnet-beta.solana.com',
}

const recentTransactions = 10
const millisPerSecond = 1_000

const RpcReply = S.Struct({ result: S.Unknown })

const Balance = S.Struct({ value: S.Number })

const SignatureInfo = S.Struct({
  signature: S.String,
  slot: S.Number,
  blockTime: S.NullishOr(S.Number),
  err: S.Unknown,
})

const Transaction = S.NullishOr(
  S.Struct({
    meta: S.NullishOr(
      S.Struct({
        preBalances: S.Array(S.Number),
        postBalances: S.Array(S.Number),
      }),
    ),
    transaction: S.Struct({
      message: S.Struct({
        accountKeys: S.Array(
          S.Union([S.String, S.Struct({ pubkey: S.String })]),
        ),
      }),
    }),
  }),
)
type Transaction = typeof Transaction.Type

const rpc = <A>(
  fetch: typeof globalThis.fetch,
  network: WalletNetwork,
  method: ReadOnlyRpcMethod,
  params: ReadonlyArray<unknown>,
  decode: (value: unknown) => A,
): Effect.Effect<A, Error> =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(rpcUrls[network], {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      })
      return decode(S.decodeUnknownSync(RpcReply)(await response.json()).result)
    },
    catch: cause => new Error(`${method} failed: ${String(cause)}`),
  })

const keyOf = (accountKey: string | Readonly<{ pubkey: string }>): string =>
  typeof accountKey === 'string' ? accountKey : accountKey.pubkey

const changeFor = (
  transaction: Transaction,
  address: string,
): Option.Option<string> => {
  const maybeTransaction = Option.fromNullishOr(transaction)
  return Option.flatMap(maybeTransaction, found =>
    Option.flatMap(
      Array.findFirstIndex(
        found.transaction.message.accountKeys,
        accountKey => keyOf(accountKey) === address,
      ),
      index =>
        Option.flatMap(Option.fromNullishOr(found.meta), meta =>
          Option.zipWith(
            Array.get(meta.preBalances, index),
            Array.get(meta.postBalances, index),
            (before, after) => (after - before).toString(),
          ),
        ),
    ),
  )
}

/** One address as a public chain reported it just now. */
export type MirroredAddress = Readonly<{
  balanceAtomic: string
  transactions: ReadonlyArray<WalletTransaction>
}>

/**
 * Reads one address's balance and recent transactions from a public RPC
 * endpoint. `known` holds the signatures already mirrored, whose details
 * never change, so they are not read again.
 */
export const mirrorAddress = (
  config: Readonly<{
    fetch: typeof globalThis.fetch
    address: string
    network: WalletNetwork
    known: ReadonlySet<string>
  }>,
): Effect.Effect<MirroredAddress, Error> =>
  Effect.gen(function* () {
    const { fetch, address, network, known } = config
    const balance = yield* rpc(
      fetch,
      network,
      'getBalance',
      [address],
      S.decodeUnknownSync(Balance),
    )
    const signatures = yield* rpc(
      fetch,
      network,
      'getSignaturesForAddress',
      [address, { limit: recentTransactions }],
      S.decodeUnknownSync(S.Array(SignatureInfo)),
    )
    const fresh = Array.filter(
      signatures,
      ({ signature }) => !known.has(signature),
    )
    const transactions = yield* Effect.forEach(fresh, info =>
      Effect.map(
        rpc(
          fetch,
          network,
          'getTransaction',
          [
            info.signature,
            { encoding: 'json', maxSupportedTransactionVersion: 0 },
          ],
          S.decodeUnknownSync(Transaction),
        ),
        transaction => ({
          signature: info.signature,
          slot: info.slot,
          maybeBlockTimeMs: Option.map(
            Option.fromNullishOr(info.blockTime),
            seconds => seconds * millisPerSecond,
          ),
          didSucceed: info.err === null || info.err === undefined,
          maybeChangeAtomic: changeFor(transaction, address),
        }),
      ),
    )
    return { balanceAtomic: BigInt(balance.value).toString(), transactions }
  })

/** One address the mirror follows. */
export type MirroredWallet = Readonly<{
  network: WalletNetwork
  address: string
  label: string
}>

/** The rows one mirror run writes, in the shape the schema names them. */
export const walletRowsFor = (
  wallet: MirroredWallet,
  mirrored: MirroredAddress,
  atMs: number,
) => {
  const addressKey = `Solana:${wallet.network}:${wallet.address}`
  return {
    address: {
      addressKey,
      chain: 'Solana',
      network: wallet.network,
      address: wallet.address,
      label: wallet.label,
      balanceAtomic: mirrored.balanceAtomic,
      mirroredAtMs: atMs,
    },
    transactions: Array.map(mirrored.transactions, transaction => ({
      transactionKey: `${addressKey}:${transaction.signature}`,
      signature: transaction.signature,
      slot: transaction.slot,
      didSucceed: transaction.didSucceed,
      ...Option.match(transaction.maybeBlockTimeMs, {
        onNone: () => ({}),
        onSome: blockTimeMs => ({ blockTimeMs }),
      }),
      ...Option.match(transaction.maybeChangeAtomic, {
        onNone: () => ({}),
        onSome: changeAtomic => ({ changeAtomic }),
      }),
    })),
  }
}
