import { Array, Match as M, Option, Order, Schema as S } from 'effect'
import type { TransactionRecord, TransactionStatus } from 'wallet-core-example'

// ACTIVITY

/** The four networks the watcher keeps apart. */
export const WatchedNetworkId = S.Literals([
  'solana:devnet',
  'solana:mainnet-beta',
  'ethereum:sepolia',
  'ethereum:mainnet',
])
/** The four networks the watcher keeps apart. */
export type WatchedNetworkId = typeof WatchedNetworkId.Type

/** How settled a transaction is: Solana processed, confirmed, finalized; Ethereum seen, in a block, finalized. */
export const Finality = S.Literals(['Seen', 'Included', 'Final'])
/** How settled a transaction is. */
export type Finality = typeof Finality.Type

/** One `walletAccounts` row: a public address the watcher listens to. */
export const WatchedAccount = S.Struct({
  accountKey: S.String,
  holder: S.String,
  chainId: S.Literals(['solana', 'ethereum']),
  networkId: WatchedNetworkId,
  address: S.String,
  maybeCursor: S.Option(S.String),
})
/** One `walletAccounts` row: a public address the watcher listens to. */
export type WatchedAccount = typeof WatchedAccount.Type

/** One `walletTransactions` row, as the watcher writes it. Public chain data only. */
export const ActivityRow = S.Struct({
  transactionKey: S.String,
  transactionId: S.String,
  networkId: WatchedNetworkId,
  direction: S.Literals(['Incoming', 'Outgoing']),
  status: S.Literals(['Pending', 'Confirmed', 'Failed']),
  maybeFinality: S.Option(Finality),
  assetId: S.String,
  amountAtomic: S.String,
  maybeCounterpartyAddress: S.Option(S.String),
  observedAtMs: S.Number,
  maybeConfirmedAtMs: S.Option(S.Number),
})
/** One `walletTransactions` row, as the watcher writes it. */
export type ActivityRow = typeof ActivityRow.Type

/**
 * An account's key: `brandon-dot:<hash>|solana:devnet|<address>`.
 *
 * @example
 * ```typescript
 * accountKeyOf({ holder, networkId: 'solana:devnet', address })
 * ```
 */
export const accountKeyOf = ({
  holder,
  networkId,
  address,
}: Readonly<{
  holder: string
  networkId: WatchedNetworkId
  address: string
}>): string => `${holder}|${networkId}|${address}`

/** A transaction's key under its account: `<accountKey>|<signature or hash>`. */
export const transactionKeyOf = (
  accountKey: string,
  transactionId: string,
): string => `${accountKey}|${transactionId}`

const scribeHolderPrefix = 'scribe:'

/**
 * Who owns an account's rows. A Scribe holder names its signed-in user,
 * and the rules let a client read a row only when the row's owner is that
 * user, so `scribe:2fd17171-…` owns as `2fd17171-…`. A Brandon dot
 * person's rows stay under the origin's owner, where no client reads them.
 *
 * @example
 * ```typescript
 * ownerUserIdOfHolder(`scribe:${userId}`, originOwnerUserId) // userId
 * ```
 */
export const ownerUserIdOfHolder = (
  holder: string,
  originOwnerUserId: string,
): string =>
  holder.startsWith(scribeHolderPrefix)
    ? holder.slice(scribeHolderPrefix.length)
    : originOwnerUserId

const finalityOfStatus = (status: TransactionStatus): Finality =>
  M.value(status).pipe(
    M.withReturnType<Finality>(),
    M.when('Pending', () => 'Seen'),
    M.orElse(() => 'Included'),
  )

const finalityRank = (maybeFinality: Option.Option<Finality>): number =>
  Option.match(maybeFinality, {
    onNone: () => 0,
    onSome: finality =>
      M.value(finality).pipe(
        M.withReturnType<number>(),
        M.when('Seen', () => 1),
        M.when('Included', () => 2),
        M.when('Final', () => 3),
        M.exhaustive,
      ),
  })

/**
 * The row a record from the chain makes for one account. A record on any
 * other network than the account's is a bug in the caller, so it throws
 * rather than file a test send under a real account.
 */
export const observedActivityRow = (
  account: WatchedAccount,
  record: typeof TransactionRecord.Type,
): ActivityRow => {
  if (record.networkId !== account.networkId) {
    throw new Error(
      `a ${record.networkId} record is not ${account.networkId}'s`,
    )
  }
  return {
    transactionKey: transactionKeyOf(account.accountKey, record.transactionId),
    transactionId: record.transactionId,
    networkId: account.networkId,
    direction: record.direction,
    status: record.status,
    maybeFinality: Option.some(finalityOfStatus(record.status)),
    assetId: record.amount.assetId,
    amountAtomic: record.amount.atomicUnits,
    maybeCounterpartyAddress: Option.liftPredicate(
      record.counterpartyAddress,
      address => address !== '',
    ),
    observedAtMs: record.observedAt,
    maybeConfirmedAtMs:
      record.status === 'Confirmed'
        ? Option.some(record.observedAt)
        : Option.none(),
  }
}

/**
 * What to write for an observation, given the row already held. A first
 * sighting writes; the same status and finality writes nothing; a row
 * only moves forward, keeping when it was first seen; a Final row never
 * changes.
 */
export const nextActivityRow = (
  maybeStored: Option.Option<ActivityRow>,
  observed: ActivityRow,
): Option.Option<ActivityRow> =>
  Option.match(maybeStored, {
    onNone: () => Option.some(observed),
    onSome: stored => {
      const isFinal = Option.contains(stored.maybeFinality, 'Final')
      const isSame =
        stored.status === observed.status &&
        finalityRank(stored.maybeFinality) ===
          finalityRank(observed.maybeFinality)
      const isBehind =
        finalityRank(observed.maybeFinality) <
        finalityRank(stored.maybeFinality)
      if (isFinal || isSame || isBehind) {
        return Option.none()
      } else {
        return Option.some({
          ...observed,
          observedAtMs: stored.observedAtMs,
          maybeConfirmedAtMs: Option.orElse(
            stored.maybeConfirmedAtMs,
            () => observed.maybeConfirmedAtMs,
          ),
        })
      }
    },
  })

const byObservedAt = Order.mapInput(
  Order.Number,
  (record: typeof TransactionRecord.Type) => record.observedAt,
)

/** The newest transaction among these records, or the cursor already held. */
export const newestTransactionId = (
  records: ReadonlyArray<typeof TransactionRecord.Type>,
  maybeCursor: Option.Option<string>,
): Option.Option<string> =>
  Array.match(records, {
    onEmpty: () => maybeCursor,
    onNonEmpty: nonEmptyRecords =>
      Option.some(Array.max(nonEmptyRecords, byObservedAt).transactionId),
  })
