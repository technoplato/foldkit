import {
  Finality,
  type SentTransaction,
  type WalletActivityEntry,
  WatchedNetworkId,
} from 'brandon-core-example'
import { Array, Match as M, Option, Order, Schema as S } from 'effect'
import {
  AtomicUnits,
  type TransactionRecord,
  type TransactionStatus,
} from 'wallet-core-example'
import {
  type TransactionStanding,
  liveWalletNetworkForId,
} from 'wallet-live-client-example'

// ACTIVITY

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
  amountAtomic: AtomicUnits,
  maybeCounterpartyAddress: S.Option(S.String),
  observedAtMs: S.Number,
  maybeConfirmedAtMs: S.Option(S.Number),
  maybeFailure: S.Option(S.String),
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

/** The chain a network belongs to: `solana:devnet` is on `solana`. */
export const chainIdOfNetwork = (
  networkId: WatchedNetworkId,
): WatchedAccount['chainId'] =>
  M.value(networkId).pipe(
    M.withReturnType<WatchedAccount['chainId']>(),
    M.whenOr('solana:devnet', 'solana:mainnet-beta', () => 'solana'),
    M.whenOr('ethereum:sepolia', 'ethereum:mainnet', () => 'ethereum'),
    M.exhaustive,
  )

/** What the origin sends the page for one row: the row without its key. */
export const activityEntryOf = (row: ActivityRow): WalletActivityEntry => ({
  transactionId: row.transactionId,
  networkId: row.networkId,
  direction: row.direction,
  status: row.status,
  maybeFinality: row.maybeFinality,
  assetId: row.assetId,
  amountAtomic: row.amountAtomic,
  maybeCounterpartyAddress: row.maybeCounterpartyAddress,
  observedAtMs: row.observedAtMs,
  maybeFailure: row.maybeFailure,
})

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

const minuteMs = 60 * 1_000

const isOnSolana = (networkId: WatchedNetworkId): boolean =>
  chainIdOfNetwork(networkId) === 'solana'

/** A confirmed record this old is past anything its chain could undo. */
const finalAfterMs = (networkId: WatchedNetworkId): number =>
  isOnSolana(networkId) ? 5 * minuteMs : 60 * minuteMs

/** A send unknown this long has given up: a Solana blockhash has expired; an Ethereum one has left the mempool. */
const neverLandedAfterMs = (networkId: WatchedNetworkId): number =>
  isOnSolana(networkId) ? 3 * minuteMs : 60 * minuteMs

/**
 * How long until a Pending row counts as never landed, if it is Pending:
 * zero once its time is up. The chain says nothing when a send expires, so
 * the watcher asks one more time when this runs out.
 *
 * @example
 * ```typescript
 * msUntilNeverLanded(rowSeenAMinuteAgoOnSolana, nowMs) // Option.some(120_000)
 * ```
 */
export const msUntilNeverLanded = (
  row: ActivityRow,
  nowMs: number,
): Option.Option<number> =>
  row.status === 'Pending'
    ? Option.some(
        Math.max(
          0,
          row.observedAtMs + neverLandedAfterMs(row.networkId) - nowMs,
        ),
      )
    : Option.none()

const finalityOfRecord = (
  networkId: WatchedNetworkId,
  status: TransactionStatus,
  ageMs: number,
): Finality =>
  M.value(status).pipe(
    M.withReturnType<Finality>(),
    M.when('Pending', () => 'Seen'),
    M.when('Failed', () => 'Included'),
    M.when('Confirmed', () =>
      ageMs >= finalAfterMs(networkId) ? 'Final' : 'Included',
    ),
    M.exhaustive,
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
 * rather than file a test send under a real account. A confirmed record
 * older than its chain could undo is Final already, which spares a read
 * for every row of an old history: 5 minutes on Solana, an hour on Ethereum.
 */
export const observedActivityRow = (
  account: WatchedAccount,
  record: typeof TransactionRecord.Type,
  { nowMs }: Readonly<{ nowMs: number }>,
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
    maybeFinality: Option.some(
      finalityOfRecord(
        account.networkId,
        record.status,
        nowMs - record.observedAt,
      ),
    ),
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
    maybeFailure: Option.none(),
  }
}

/**
 * The row for a send the page reported: Pending, with no finality yet,
 * under its own account and in its own network's asset.
 *
 * @example
 * ```typescript
 * sentActivityRow(account.accountKey, sent, Date.now())
 * ```
 */
export const sentActivityRow = (
  accountKey: string,
  sent: SentTransaction,
  nowMs: number,
): ActivityRow => ({
  transactionKey: transactionKeyOf(accountKey, sent.transactionId),
  transactionId: sent.transactionId,
  networkId: sent.networkId,
  direction: 'Outgoing',
  status: 'Pending',
  maybeFinality: Option.none(),
  assetId: Option.getOrThrow(liveWalletNetworkForId(sent.networkId)).asset
    .assetId,
  amountAtomic: sent.amountAtomic,
  maybeCounterpartyAddress: Option.some(sent.recipientAddress),
  observedAtMs: nowMs,
  maybeConfirmedAtMs: Option.none(),
  maybeFailure: Option.none(),
})

/**
 * A row confirmed this recently that a provider cannot find is the provider
 * lagging, not a reorg: public RPCs answer from a pool of nodes. A real drop
 * still reads as one on the next answer after this.
 */
const providerLagMs = 30_000

const isFreshlyConfirmed = (row: ActivityRow, nowMs: number): boolean =>
  row.status === 'Confirmed' &&
  Option.exists(
    row.maybeConfirmedAtMs,
    confirmedAtMs => nowMs - confirmedAtMs < providerLagMs,
  )

const whenUnknown = (
  row: ActivityRow,
  nowMs: number,
): Option.Option<ActivityRow> =>
  M.value(row.status).pipe(
    M.withReturnType<Option.Option<ActivityRow>>(),
    M.when('Confirmed', () =>
      isFreshlyConfirmed(row, nowMs)
        ? Option.none()
        : Option.some({
            ...row,
            status: 'Pending' as const,
            maybeFinality: Option.none(),
            maybeConfirmedAtMs: Option.none(),
          }),
    ),
    M.when('Pending', () =>
      nowMs - row.observedAtMs >= neverLandedAfterMs(row.networkId)
        ? Option.some({
            ...row,
            status: 'Failed' as const,
            maybeFailure: Option.some('It never landed, so nothing was sent.'),
          })
        : Option.none(),
    ),
    M.when('Failed', () => Option.none()),
    M.exhaustive,
  )

/**
 * What to write when the chain says where a transaction stands, given the
 * row held. A Final row never changes. A row in a block that the chain no
 * longer knows went back in a reorg: Pending, finality cleared. A send it
 * never knew, past what its chain allows, never landed: Failed.
 */
export const settledActivityRow = (
  row: ActivityRow,
  standing: TransactionStanding,
  nowMs: number,
): Option.Option<ActivityRow> => {
  if (Option.contains(row.maybeFinality, 'Final')) {
    return Option.none()
  }
  const confirmedAt = Option.orElse(row.maybeConfirmedAtMs, () =>
    Option.some(nowMs),
  )
  return M.value(standing).pipe(
    M.withReturnType<Option.Option<ActivityRow>>(),
    M.when('Final', () =>
      Option.some({
        ...row,
        status: 'Confirmed' as const,
        maybeFinality: Option.some('Final' as const),
        maybeConfirmedAtMs: confirmedAt,
        maybeFailure: Option.none(),
      }),
    ),
    M.when('Included', () =>
      row.status === 'Confirmed'
        ? Option.none()
        : Option.some({
            ...row,
            status: 'Confirmed' as const,
            maybeFinality: Option.some('Included' as const),
            maybeConfirmedAtMs: confirmedAt,
            maybeFailure: Option.none(),
          }),
    ),
    M.when('Seen', () =>
      isFreshlyConfirmed(row, nowMs) ||
      (row.status === 'Pending' && Option.contains(row.maybeFinality, 'Seen'))
        ? Option.none()
        : Option.some({
            ...row,
            status: 'Pending' as const,
            maybeFinality: Option.some('Seen' as const),
            maybeConfirmedAtMs: Option.none(),
          }),
    ),
    M.when('FailedOnChain', () =>
      row.status === 'Failed'
        ? Option.none()
        : Option.some({
            ...row,
            status: 'Failed' as const,
            maybeFailure: Option.some('It failed on the chain.'),
          }),
    ),
    M.when('Unknown', () => whenUnknown(row, nowMs)),
    M.exhaustive,
  )
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
          maybeCounterpartyAddress: Option.orElse(
            observed.maybeCounterpartyAddress,
            () => stored.maybeCounterpartyAddress,
          ),
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
