import { Array, Effect, Option, Schema as S } from 'effect'

import { init } from '@instantdb/admin'

import {
  type ActivityRow,
  Finality,
  type WatchedAccount,
  WatchedNetworkId,
} from './activity.js'
import type { BrandonEnv } from './env.js'
import type { ActivityStore } from './watcher.js'

// ACTIVITY STORE

const formatVersion = 1

const AccountRow = S.Struct({
  id: S.String,
  accountKey: S.String,
  holder: S.String,
  chainId: S.Literals(['solana', 'ethereum']),
  networkId: WatchedNetworkId,
  address: S.String,
  cursor: S.optionalKey(S.NullOr(S.String)),
})
type AccountRow = typeof AccountRow.Type

const TransactionRow = S.Struct({
  transactionKey: S.String,
  transactionId: S.String,
  networkId: WatchedNetworkId,
  direction: S.Literals(['Incoming', 'Outgoing']),
  status: S.Literals(['Pending', 'Confirmed', 'Failed']),
  finality: S.optionalKey(S.NullOr(Finality)),
  assetId: S.String,
  amountAtomic: S.String,
  counterpartyAddress: S.optionalKey(S.NullOr(S.String)),
  observedAtMs: S.Number,
  confirmedAtMs: S.optionalKey(S.NullOr(S.Number)),
})
type TransactionRow = typeof TransactionRow.Type

const failure = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause))

const watchedAccountOf = (row: AccountRow): WatchedAccount => ({
  accountKey: row.accountKey,
  holder: row.holder,
  chainId: row.chainId,
  networkId: row.networkId,
  address: row.address,
  maybeCursor: Option.fromNullishOr(row.cursor),
})

const activityRowOf = (row: TransactionRow): ActivityRow => ({
  transactionKey: row.transactionKey,
  transactionId: row.transactionId,
  networkId: row.networkId,
  direction: row.direction,
  status: row.status,
  maybeFinality: Option.fromNullishOr(row.finality),
  assetId: row.assetId,
  amountAtomic: row.amountAtomic,
  maybeCounterpartyAddress: Option.fromNullishOr(row.counterpartyAddress),
  observedAtMs: row.observedAtMs,
  maybeConfirmedAtMs: Option.fromNullishOr(row.confirmedAtMs),
})

const decodeAccounts = (rows: unknown): ReadonlyArray<WatchedAccount> =>
  Array.map(S.decodeUnknownSync(S.Array(AccountRow))(rows), watchedAccountOf)

/** The watcher's store, plus the live list of accounts to watch. */
export type ActivityAdmin = ActivityStore &
  Readonly<{
    /**
     * Calls back with every `walletAccounts` row now and each time the list
     * changes, from Instant's own subscription, never a timer. Returns the
     * function that stops it.
     */
    followAccounts: (
      onAccounts: (accounts: ReadonlyArray<WatchedAccount>) => void,
      onFailure: (error: Error) => void,
    ) => () => void
  }>

/**
 * The watcher's reads and writes in Scribe's app, with the admin token:
 * `walletAccounts` and `walletTransactions` (ADR 0120). A Brandon dot
 * person's rows reach no client; this process and the origin read them.
 */
export const makeActivityAdmin = (config: BrandonEnv): ActivityAdmin => {
  const admin = init({ appId: config.appId, adminToken: config.adminToken })
  const owned = { ownerUserID: config.ownerUserID, formatVersion }
  const accountIds = new Map<string, string>()

  const run = <A>(work: () => Promise<A>): Effect.Effect<A, Error> =>
    Effect.tryPromise({ try: work, catch: failure })

  const accountIdOf = (account: WatchedAccount): Effect.Effect<string, Error> =>
    Option.match(Option.fromNullishOr(accountIds.get(account.accountKey)), {
      onSome: Effect.succeed,
      onNone: () =>
        Effect.flatMap(
          run(() =>
            admin.query({
              walletAccounts: {
                $: { where: { accountKey: account.accountKey } },
              },
            }),
          ),
          result =>
            Option.match(
              Array.head(
                S.decodeUnknownSync(S.Array(AccountRow))(
                  result['walletAccounts'] ?? [],
                ),
              ),
              {
                onNone: () =>
                  Effect.fail(
                    new Error(`no walletAccounts row for ${account.networkId}`),
                  ),
                onSome: row =>
                  Effect.sync(() => {
                    accountIds.set(account.accountKey, row.id)
                    return row.id
                  }),
              },
            ),
        ),
    })

  return {
    storedTransaction: transactionKey =>
      Effect.map(
        run(() =>
          admin.query({
            walletTransactions: { $: { where: { transactionKey } } },
          }),
        ),
        result =>
          Option.map(
            Array.head(
              S.decodeUnknownSync(S.Array(TransactionRow))(
                result['walletTransactions'] ?? [],
              ),
            ),
            activityRowOf,
          ),
      ),
    writeTransaction: (account, row) =>
      Effect.flatMap(accountIdOf(account), accountId =>
        run(() =>
          admin.transact(
            admin.tx['walletTransactions']!.lookup(
              'transactionKey',
              row.transactionKey,
            )
              .update({
                ...owned,
                transactionId: row.transactionId,
                networkId: row.networkId,
                direction: row.direction,
                status: row.status,
                finality: Option.getOrNull(row.maybeFinality),
                assetId: row.assetId,
                amountAtomic: row.amountAtomic,
                counterpartyAddress: Option.getOrNull(
                  row.maybeCounterpartyAddress,
                ),
                observedAtMs: row.observedAtMs,
                confirmedAtMs: Option.getOrNull(row.maybeConfirmedAtMs),
              })
              .link({ account: accountId }),
          ),
        ),
      ),
    writeCursor: (account, cursor) =>
      run(() =>
        admin.transact(
          admin.tx['walletAccounts']!.lookup(
            'accountKey',
            account.accountKey,
          ).update({ cursor }),
        ),
      ),
    followAccounts: (onAccounts, onFailure) => {
      const subscription = admin.subscribeQuery(
        { walletAccounts: {} },
        payload => {
          if (payload.type === 'ok') {
            try {
              onAccounts(decodeAccounts(payload.data['walletAccounts'] ?? []))
            } catch (cause) {
              onFailure(failure(cause))
            }
          } else {
            onFailure(new Error(`walletAccounts subscription: ${payload.error.message}`))
          }
        },
      )
      return () => subscription.close()
    },
  }
}
