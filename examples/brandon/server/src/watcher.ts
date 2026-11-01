import {
  Array,
  Data,
  Duration,
  Effect,
  Function,
  Option,
  Ref,
  Schedule,
  Schema as S,
  Stream,
} from 'effect'
import type { TransactionRecord } from 'wallet-core-example'
import type {
  LiveNetworkAccount,
  LiveNetworkAdapter,
} from 'wallet-live-client-example'

import {
  type ActivityRow,
  type WatchedAccount,
  newestTransactionId,
  nextActivityRow,
  observedActivityRow,
} from './activity.js'

// WATCHER

/**
 * Where the watcher keeps what it saw: `walletTransactions` and each
 * account's cursor. `announceChange` tells open pages that this account's
 * rows moved, naming nothing.
 */
export type ActivityStore = Readonly<{
  storedTransaction: (
    transactionKey: string,
  ) => Effect.Effect<Option.Option<ActivityRow>, Error>
  writeTransaction: (
    account: WatchedAccount,
    row: ActivityRow,
  ) => Effect.Effect<void, Error>
  writeCursor: (
    account: WatchedAccount,
    cursor: string,
  ) => Effect.Effect<void, Error>
  announceChange: (account: WatchedAccount) => Effect.Effect<void, Error>
}>

/** Why one watch of one account ended: the chain, the store, or no answer in time. */
export class WatchEnded extends Data.TaggedError('WatchEnded')<{
  reason: string
}> {}

/** How long the watcher waits on any one answer from a chain or the store. */
export const answerWithin = '5 seconds'

/**
 * How long one watch lasts before it backfills and listens again. The
 * chain's stream is how anything arrives; this bounds what a socket that
 * went deaf without closing can delay.
 */
export const maximumWatchLifetime = '10 minutes'

/** How one watch is bounded. */
export type WatchOptions = Readonly<{
  answerWithin: Duration.Input
  maximumLifetime: Duration.Input
}>

const historyPageLimit = 25
const maximumBackfillPages = 4
const shownAddressCharacters = 6

/** Reconnect after 1 s, doubling to at most 30 s, with jitter, forever. */
export const reconnectSchedule = Schedule.min([
  Schedule.exponential('1 second'),
  Schedule.spaced('30 seconds'),
]).pipe(Schedule.jittered)

const liveAccountOf = (
  adapter: LiveNetworkAdapter,
  account: WatchedAccount,
): LiveNetworkAccount => {
  const walletAccount = {
    accountId: account.accountKey,
    chainId: account.chainId,
    networkId: account.networkId,
    address: account.address,
    displayName: account.address,
  }
  return {
    profile: walletAccount,
    account: walletAccount,
    configuration: adapter.configuration,
  }
}

const shortAddress = (address: string): string =>
  `${address.slice(0, shownAddressCharacters)}…`

const ended = (reason: string) => new WatchEnded({ reason })

const CodedError = S.Struct({ _tag: S.String, code: S.String })

const reasonOf = (error: unknown): string => {
  if (S.is(CodedError)(error)) {
    return `${error._tag} ${error.code}`
  } else if (error instanceof Error && error.message !== '') {
    return error.message
  } else {
    return String(error)
  }
}

const inTime =
  (duration: Duration.Input) =>
  <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, WatchEnded> =>
    effect.pipe(
      Effect.mapError(error => ended(reasonOf(error))),
      Effect.timeoutOrElse({
        duration,
        orElse: () =>
          Effect.fail(
            ended(
              `no answer within ${Duration.format(Duration.fromInputUnsafe(duration))}`,
            ),
          ),
      }),
    )

const recordObservation = (
  account: WatchedAccount,
  store: ActivityStore,
  within: Duration.Input,
  record: typeof TransactionRecord.Type,
): Effect.Effect<boolean, WatchEnded> => {
  const observed = observedActivityRow(account, record)
  return Effect.gen(function* () {
    const maybeStored = yield* inTime(within)(
      store.storedTransaction(observed.transactionKey),
    )
    return yield* Option.match(nextActivityRow(maybeStored, observed), {
      onNone: () => Effect.succeed(false),
      onSome: row =>
        Effect.as(
          inTime(within)(store.writeTransaction(account, row)),
          true,
        ),
    })
  })
}

const backfill = (
  adapter: LiveNetworkAdapter,
  account: WatchedAccount,
  within: Duration.Input,
): Effect.Effect<ReadonlyArray<typeof TransactionRecord.Type>, WatchEnded> => {
  const liveAccount = liveAccountOf(adapter, account)
  const loadPages = (
    maybePageCursor: Option.Option<string>,
    pageCount: number,
    loaded: ReadonlyArray<typeof TransactionRecord.Type>,
  ): Effect.Effect<ReadonlyArray<typeof TransactionRecord.Type>, WatchEnded> =>
    Effect.flatMap(
      inTime(within)(
        adapter.loadTransactionHistory(liveAccount, {
          accountId: account.accountKey,
          networkId: account.networkId,
          maybeCursor: maybePageCursor,
          limit: historyPageLimit,
        }),
      ),
      page => {
        const nextLoaded = Array.appendAll(loaded, page.records)
        const hasMetCursor = Option.exists(account.maybeCursor, cursor =>
          Array.some(page.records, record => record.transactionId === cursor),
        )
        if (
          hasMetCursor ||
          Option.isNone(page.maybeNextCursor) ||
          pageCount + 1 >= maximumBackfillPages
        ) {
          return Effect.succeed(nextLoaded)
        } else {
          return loadPages(page.maybeNextCursor, pageCount + 1, nextLoaded)
        }
      },
    )
  return loadPages(Option.none(), 0, [])
}

/**
 * One watch of one account: backfill its history back to the cursor it
 * holds, write what is new, then listen to the chain and write each
 * transaction as it moves forward. It ends with WatchEnded when the
 * chain's stream ends or fails, or any answer takes longer than
 * `answerWithin`, or a quiet watch reaches `maximumLifetime`; the caller
 * reconnects, and the next watch backfills whatever the gap missed. Open
 * pages get one notice for a whole backfill and one for each live change.
 */
export const watchOnce = (
  adapter: LiveNetworkAdapter,
  account: WatchedAccount,
  store: ActivityStore,
  options: WatchOptions = {
    answerWithin,
    maximumLifetime: maximumWatchLifetime,
  },
): Effect.Effect<never, WatchEnded> =>
  Effect.gen(function* () {
    const within = options.answerWithin
    const history = yield* backfill(adapter, account, within)
    const oldestFirst = Array.reverse(history)
    const writes = yield* Effect.forEach(oldestFirst, record =>
      recordObservation(account, store, within, record),
    )
    if (Array.some(writes, Function.identity)) {
      yield* inTime(within)(store.announceChange(account))
    }
    yield* Option.match(newestTransactionId(history, account.maybeCursor), {
      onNone: () => Effect.void,
      onSome: cursor => inTime(within)(store.writeCursor(account, cursor)),
    })
    yield* adapter.observeTransactions(liveAccountOf(adapter, account)).pipe(
      Stream.mapError(error => ended(`the chain's stream failed: ${error.code}`)),
      Stream.runForEach(record =>
        Effect.gen(function* () {
          const didWrite = yield* recordObservation(
            account,
            store,
            within,
            record,
          )
          if (didWrite) {
            yield* inTime(within)(store.announceChange(account))
          }
          yield* inTime(within)(store.writeCursor(account, record.transactionId))
        }),
      ),
      Effect.timeoutOrElse({
        duration: options.maximumLifetime,
        orElse: () => Effect.fail(ended('it reached its lifetime')),
      }),
    )
    return yield* Effect.fail(ended("the chain's stream ended"))
  })

/**
 * Watches one account for as long as it runs. Every drop is logged with
 * the network and the start of the address, then retried on `schedule`;
 * every retry backfills back to the newest cursor this watch wrote, so
 * nothing in the gap is missed and nothing is read twice.
 */
export const watchAccount = (
  adapter: LiveNetworkAdapter,
  account: WatchedAccount,
  store: ActivityStore,
  options: Readonly<{
    schedule: Schedule.Schedule<unknown, WatchEnded>
  }> = { schedule: reconnectSchedule },
): Effect.Effect<never> =>
  Effect.gen(function* () {
    const newestCursor = yield* Ref.make(account.maybeCursor)
    const trackingStore: ActivityStore = {
      ...store,
      writeCursor: (watched, cursor) =>
        Effect.andThen(
          store.writeCursor(watched, cursor),
          Ref.set(newestCursor, Option.some(cursor)),
        ),
    }
    return yield* Effect.flatMap(Ref.get(newestCursor), maybeCursor =>
      watchOnce(adapter, { ...account, maybeCursor }, trackingStore),
    ).pipe(
      Effect.tapError(({ reason }) =>
        Effect.sync(() => {
          console.error(
            `watcher: ${account.networkId} ${shortAddress(account.address)} dropped (${reason}); backfilling and listening again`,
          )
        }),
      ),
      Effect.retry(options.schedule),
    )
  }).pipe(Effect.orDie)
