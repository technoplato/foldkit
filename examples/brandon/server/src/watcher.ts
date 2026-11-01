import {
  Array,
  Clock,
  Data,
  Duration,
  Effect,
  Fiber,
  Function,
  Option,
  Ref,
  Schema as S,
  type Scope,
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
  settledActivityRow,
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
  unsettledTransactions: (
    account: WatchedAccount,
  ) => Effect.Effect<ReadonlyArray<ActivityRow>, Error>
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

/** How long a watch waits before it tries a failed backfill again. */
export const backfillEvery = '30 seconds'

/** How one watch is bounded. */
export type WatchOptions = Readonly<{
  answerWithin: Duration.Input
  maximumLifetime: Duration.Input
  backfillEvery: Duration.Input
}>

const defaultWatchOptions: WatchOptions = {
  answerWithin,
  maximumLifetime: maximumWatchLifetime,
  backfillEvery,
}

const historyPageLimit = 25
const maximumBackfillPages = 4
const shownAddressCharacters = 6

/** At most this many transactions of one account are followed to Final at a time. */
const maximumSettling = 8

const firstReconnectDelayMs = 1_000
const maximumReconnectDelayMs = 30_000
const heldLongEnoughMs = 60_000
const reconnectJitter = 0.2

/**
 * How long to wait before reconnect number `attempt`: 1 s, doubling to at
 * most 30 s.
 *
 * @example
 * ```typescript
 * reconnectDelayMs(1) // 2000
 * ```
 */
export const reconnectDelayMs = (attempt: number): number =>
  Math.min(firstReconnectDelayMs * 2 ** attempt, maximumReconnectDelayMs)

/**
 * The next attempt, after a watch that held this long. Only a watch that
 * held for a minute starts the count over: an RPC can accept a subscription
 * and refuse it seconds later, and an answer alone proves nothing (#1545).
 */
export const nextReconnectAttempt = (
  attempt: number,
  heldMs: number,
): number => (heldMs >= heldLongEnoughMs ? 0 : attempt + 1)

const jitteredReconnectDelayMs = (attempt: number): number =>
  reconnectDelayMs(attempt) *
  (1 - reconnectJitter + Math.random() * 2 * reconnectJitter)

/**
 * A line for the watcher's log, which launchd keeps with no times of its
 * own: `2026-11-01T16:40:00.000Z watcher: …`.
 */
export const stamped = (line: string): string =>
  `${new Date().toISOString()} ${line}`

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
  return Effect.gen(function* () {
    const observed = observedActivityRow(account, record, {
      nowMs: yield* Clock.currentTimeMillis,
    })
    const maybeStored = yield* inTime(within)(
      store.storedTransaction(observed.transactionKey),
    )
    return yield* Option.match(nextActivityRow(maybeStored, observed), {
      onNone: () => Effect.succeed(false),
      onSome: row =>
        Effect.as(inTime(within)(store.writeTransaction(account, row)), true),
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

const recordHistory = (
  adapter: LiveNetworkAdapter,
  account: WatchedAccount,
  store: ActivityStore,
  within: Duration.Input,
  hasLiveCursor: Ref.Ref<boolean>,
): Effect.Effect<void, WatchEnded> =>
  Effect.gen(function* () {
    const history = yield* backfill(adapter, account, within)
    const writes = yield* Effect.forEach(Array.reverse(history), record =>
      recordObservation(account, store, within, record),
    )
    if (Array.some(writes, Function.identity)) {
      yield* inTime(within)(store.announceChange(account))
    }
    if (!(yield* Ref.get(hasLiveCursor))) {
      yield* Option.match(newestTransactionId(history, account.maybeCursor), {
        onNone: () => Effect.void,
        onSome: cursor => inTime(within)(store.writeCursor(account, cursor)),
      })
    }
  })

/**
 * Follows every transaction of this account not yet Final, each on the chain
 * itself, and writes each move; the next watch picks up anything still open.
 */
const settleUnsettled = (
  adapter: LiveNetworkAdapter,
  account: WatchedAccount,
  store: ActivityStore,
  within: Duration.Input,
  settling: Set<string>,
): Effect.Effect<void, WatchEnded, Scope.Scope> =>
  Effect.gen(function* () {
    const unsettled = yield* inTime(within)(
      store.unsettledTransactions(account),
    )
    const unfollowed = Array.filter(
      unsettled,
      row => !settling.has(row.transactionKey),
    )
    const toFollow = Array.take(
      unfollowed,
      Math.max(0, maximumSettling - settling.size),
    )
    for (const row of toFollow) {
      settling.add(row.transactionKey)
      yield* Effect.forkScoped(
        adapter
          .observeSettlement(liveAccountOf(adapter, account), row.transactionId)
          .pipe(
            Stream.mapError(error =>
              ended(`the chain's settlement stream failed: ${error.code}`),
            ),
            Stream.runForEach(standing =>
              Effect.gen(function* () {
                const maybeStored = yield* inTime(within)(
                  store.storedTransaction(row.transactionKey),
                )
                const nowMs = yield* Clock.currentTimeMillis
                yield* Option.match(
                  Option.flatMap(maybeStored, stored =>
                    settledActivityRow(stored, standing, nowMs),
                  ),
                  {
                    onNone: () => Effect.void,
                    onSome: next =>
                      Effect.andThen(
                        inTime(within)(store.writeTransaction(account, next)),
                        inTime(within)(store.announceChange(account)),
                      ),
                  },
                )
              }),
            ),
            Effect.catch(({ reason }) =>
              Effect.sync(() => {
                console.error(
                  stamped(
                    `watcher: ${account.networkId} ${shortAddress(account.address)} settlement stopped (${reason}); the next watch picks it up`,
                  ),
                )
              }),
            ),
            Effect.ensuring(
              Effect.sync(() => {
                settling.delete(row.transactionKey)
              }),
            ),
          ),
      )
    }
  })

const listen = (
  adapter: LiveNetworkAdapter,
  account: WatchedAccount,
  store: ActivityStore,
  options: WatchOptions,
  hasLiveCursor: Ref.Ref<boolean>,
  settling: Set<string>,
): Effect.Effect<never, WatchEnded, Scope.Scope> =>
  adapter.observeTransactions(liveAccountOf(adapter, account)).pipe(
    Stream.mapError(error => ended(`the chain's stream failed: ${error.code}`)),
    Stream.runForEach(record =>
      Effect.gen(function* () {
        const didWrite = yield* recordObservation(
          account,
          store,
          options.answerWithin,
          record,
        )
        if (didWrite) {
          yield* inTime(options.answerWithin)(store.announceChange(account))
          yield* settleUnsettled(
            adapter,
            account,
            store,
            options.answerWithin,
            settling,
          )
        }
        yield* Ref.set(hasLiveCursor, true)
        yield* inTime(options.answerWithin)(
          store.writeCursor(account, record.transactionId),
        )
      }),
    ),
    Effect.timeoutOrElse({
      duration: options.maximumLifetime,
      orElse: () => Effect.fail(ended('it reached its lifetime')),
    }),
    Effect.andThen(Effect.fail(ended("the chain's stream ended"))),
  )

/**
 * One watch of one account: listen to the chain and write each transaction
 * as it moves forward, and alongside that backfill its history back to the
 * cursor it holds, so a slow or dead history provider never stops a payment
 * from being heard. A failed backfill gets another try every
 * `backfillEvery`; one in flight finishes even if the chain's stream drops.
 * The watch ends with WatchEnded when the chain's stream ends or fails, any
 * write takes longer than `answerWithin`, or a quiet watch reaches
 * `maximumLifetime`; the caller reconnects, and the next watch backfills
 * whatever the gap missed. Open pages get one notice for a whole backfill
 * and one for each live change.
 */
export const watchOnce = (
  adapter: LiveNetworkAdapter,
  account: WatchedAccount,
  store: ActivityStore,
  options: WatchOptions = defaultWatchOptions,
): Effect.Effect<never, WatchEnded> =>
  Effect.scoped(
    Effect.gen(function* () {
      const hasLiveCursor = yield* Ref.make(false)
      const settling = new Set<string>()
      const listening = yield* Effect.forkScoped(
        listen(adapter, account, store, options, hasLiveCursor, settling),
      )
      const attemptBackfill: Effect.Effect<boolean, never, Scope.Scope> =
        recordHistory(
          adapter,
          account,
          store,
          options.answerWithin,
          hasLiveCursor,
        ).pipe(
          Effect.andThen(
            settleUnsettled(
              adapter,
              account,
              store,
              options.answerWithin,
              settling,
            ),
          ),
          Effect.as(true),
          Effect.catch(({ reason }) =>
            Effect.sync(() => {
              console.error(
                stamped(
                  `watcher: ${account.networkId} ${shortAddress(account.address)} history failed (${reason}); still listening`,
                ),
              )
              return false
            }),
          ),
        )
      const backfillUntilDone: Effect.Effect<void, never, Scope.Scope> =
        Effect.gen(function* () {
          yield* Effect.sleep(options.backfillEvery)
          if (!(yield* attemptBackfill)) {
            yield* Effect.suspend(() => backfillUntilDone)
          }
        })
      if (!(yield* attemptBackfill)) {
        yield* Effect.raceFirst(backfillUntilDone, Fiber.await(listening))
      }
      return yield* Fiber.join(listening)
    }),
  )

/**
 * Watches one account for as long as it runs. Every drop is logged with
 * the network and the start of the address, then retried after
 * `reconnectAfter`; every retry backfills back to the newest cursor this
 * watch wrote, so nothing in the gap is missed and nothing is read twice.
 */
export const watchAccount = (
  adapter: LiveNetworkAdapter,
  account: WatchedAccount,
  store: ActivityStore,
  options: Readonly<{
    reconnectAfter: (attempt: number) => number
  }> = { reconnectAfter: jitteredReconnectDelayMs },
): Effect.Effect<never> =>
  Effect.gen(function* () {
    const newestCursor = yield* Ref.make(account.maybeCursor)
    const attempt = yield* Ref.make(0)
    const trackingStore: ActivityStore = {
      ...store,
      writeCursor: (watched, cursor) =>
        Effect.andThen(
          store.writeCursor(watched, cursor),
          Ref.set(newestCursor, Option.some(cursor)),
        ),
    }
    return yield* Effect.forever(
      Effect.gen(function* () {
        const startedAtMs = yield* Clock.currentTimeMillis
        const maybeCursor = yield* Ref.get(newestCursor)
        const { reason } = yield* Effect.flip(
          watchOnce(adapter, { ...account, maybeCursor }, trackingStore),
        )
        console.error(
          stamped(
            `watcher: ${account.networkId} ${shortAddress(account.address)} dropped (${reason}); listening again`,
          ),
        )
        const endedAtMs = yield* Clock.currentTimeMillis
        const nextAttempt = nextReconnectAttempt(
          yield* Ref.get(attempt),
          endedAtMs - startedAtMs,
        )
        yield* Ref.set(attempt, nextAttempt)
        yield* Effect.sleep(
          Duration.millis(options.reconnectAfter(nextAttempt)),
        )
      }),
    )
  })
