import { Cause, Effect, Exit, Fiber, Option, Stream } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  AssetAmount,
  type TransactionHistoryQuery,
  type TransactionRecord,
  WalletClientError,
} from 'wallet-core-example'
import {
  type LiveNetworkAdapter,
  liveWalletNetworkForId,
} from 'wallet-live-client-example'

import {
  type ActivityRow,
  type WatchedAccount,
  accountKeyOf,
} from './activity.js'
import {
  type ActivityStore,
  nextReconnectAttempt,
  reconnectDelayMs,
  watchAccount,
  watchOnce,
} from './watcher.js'

const holder = `brandon-dot:${'b'.repeat(64)}`
const address = 'Watched11111111111111111111111111111111111'

const account: WatchedAccount = {
  accountKey: accountKeyOf({ holder, networkId: 'solana:devnet', address }),
  holder,
  chainId: 'solana',
  networkId: 'solana:devnet',
  address,
  maybeCursor: Option.none(),
}

const record = (
  transactionId: string,
  observedAt: number,
  status: (typeof TransactionRecord.Type)['status'] = 'Confirmed',
): typeof TransactionRecord.Type => ({
  recordId: transactionId,
  transactionId,
  accountId: account.accountKey,
  networkId: 'solana:devnet',
  direction: 'Incoming',
  status,
  amount: AssetAmount.make({
    assetId: 'solana:devnet:sol',
    atomicUnits: '1000',
    observedAt,
  }),
  counterpartyAddress: 'Sender111111111111111111111111111111111111',
  normalizedCounterpartyAddress: 'Sender111111111111111111111111111111111111',
  observedAt,
})

const memoryStore = () => {
  const rows = new Map<string, ActivityRow>()
  const cursors: Array<string> = []
  let writes = 0
  let notices = 0
  const store: ActivityStore = {
    storedTransaction: transactionKey =>
      Effect.sync(() => Option.fromNullishOr(rows.get(transactionKey))),
    writeTransaction: (_account, row) =>
      Effect.sync(() => {
        writes += 1
        rows.set(row.transactionKey, row)
      }),
    writeCursor: (_account, cursor) =>
      Effect.sync(() => {
        cursors.push(cursor)
      }),
    announceChange: () =>
      Effect.sync(() => {
        notices += 1
      }),
  }
  return {
    store,
    rows,
    cursors,
    writeCount: () => writes,
    noticeCount: () => notices,
  }
}

const unavailable = () => new WalletClientError({ code: 'Unavailable' })

const fakeAdapter = (
  history: (
    query: typeof TransactionHistoryQuery.Type,
  ) => Effect.Effect<
    Readonly<{
      records: ReadonlyArray<typeof TransactionRecord.Type>
      maybeNextCursor: Option.Option<string>
    }>,
    WalletClientError
  >,
  observed: Stream.Stream<typeof TransactionRecord.Type, WalletClientError>,
): LiveNetworkAdapter => {
  const configuration = Option.getOrThrow(
    liveWalletNetworkForId('solana:devnet'),
  )
  const notUsed = () => Effect.die('not used by the watcher')
  return {
    configuration,
    loadBalance: notUsed,
    receivingInstruction: () => {
      throw new Error('not used by the watcher')
    },
    validateTransfer: notUsed,
    previewTransfer: notUsed,
    buildTransferPayload: notUsed,
    submitTransaction: notUsed,
    loadTransactionHistory: (_account, query) =>
      Effect.map(history(query), page => ({ ...page, records: page.records })),
    observeTransactions: () => observed,
    requestTestFunding: notUsed,
  }
}

describe('watching one account', () => {
  it('backfills, then listens, and writes each transaction once as it moves forward', async () => {
    const { store, rows, cursors } = memoryStore()
    const adapter = fakeAdapter(
      () =>
        Effect.succeed({
          records: [record('newer', 2), record('older', 1)],
          maybeNextCursor: Option.none(),
        }),
      Stream.concat(
        Stream.make(record('live', 3, 'Pending'), record('live', 4)),
        Stream.fail(unavailable()),
      ),
    )

    const exit = await Effect.runPromiseExit(watchOnce(adapter, account, store))

    expect(Exit.isFailure(exit)).toBe(true)
    expect([...rows.keys()].sort()).toEqual(
      [
        `${account.accountKey}|live`,
        `${account.accountKey}|newer`,
        `${account.accountKey}|older`,
      ].sort(),
    )
    const live = rows.get(`${account.accountKey}|live`)
    expect(live?.status).toBe('Confirmed')
    expect(live?.observedAtMs).toBe(3)
    expect(cursors.at(-1)).toBe('live')
  })

  it('writes nothing again when it reconnects to what it already holds', async () => {
    const { store, writeCount } = memoryStore()
    const page = {
      records: [record('newer', 2), record('older', 1)],
      maybeNextCursor: Option.none(),
    }
    const adapter = fakeAdapter(
      () => Effect.succeed(page),
      Stream.fail(unavailable()),
    )
    await Effect.runPromiseExit(watchOnce(adapter, account, store))
    const afterFirst = writeCount()
    await Effect.runPromiseExit(
      watchOnce(adapter, { ...account, maybeCursor: Option.some('newer') }, store),
    )
    expect(afterFirst).toBe(2)
    expect(writeCount()).toBe(afterFirst)
  })

  it('pages back only until it meets the cursor it already holds', async () => {
    const { store } = memoryStore()
    const asked: Array<Option.Option<string>> = []
    const firstPage = [record('d', 4), record('c', 3)]
    const secondPage = [record('b', 2), record('a', 1)]
    const adapter = fakeAdapter(query => {
      asked.push(query.maybeCursor)
      return Option.match(query.maybeCursor, {
        onNone: () =>
          Effect.succeed({
            records: firstPage,
            maybeNextCursor: Option.some('c'),
          }),
        onSome: () =>
          Effect.succeed({
            records: secondPage,
            maybeNextCursor: Option.none(),
          }),
      })
    }, Stream.fail(unavailable()))

    await Effect.runPromiseExit(
      watchOnce(adapter, { ...account, maybeCursor: Option.some('c') }, store),
    )
    expect(asked).toEqual([Option.none()])
  })

  it('gives open pages one notice for a whole backfill, and one per live change', async () => {
    const { store, noticeCount } = memoryStore()
    const adapter = fakeAdapter(
      () =>
        Effect.succeed({
          records: [record('newer', 2), record('older', 1)],
          maybeNextCursor: Option.none(),
        }),
      Stream.concat(
        Stream.make(record('live', 3, 'Pending'), record('live', 4)),
        Stream.fail(unavailable()),
      ),
    )
    await Effect.runPromiseExit(watchOnce(adapter, account, store))
    expect(noticeCount()).toBe(3)
  })

  it('gives no notice when nothing changed', async () => {
    const { store, noticeCount } = memoryStore()
    const adapter = fakeAdapter(
      () =>
        Effect.succeed({
          records: [record('older', 1)],
          maybeNextCursor: Option.none(),
        }),
      Stream.concat(Stream.make(record('older', 1)), Stream.fail(unavailable())),
    )
    await Effect.runPromiseExit(watchOnce(adapter, account, store))
    const afterFirst = noticeCount()
    await Effect.runPromiseExit(watchOnce(adapter, account, store))
    expect(afterFirst).toBe(1)
    expect(noticeCount()).toBe(afterFirst)
  })

  it('ends a quiet watch at its lifetime, so a deaf socket cannot hide a payment', async () => {
    const { store } = memoryStore()
    const adapter = fakeAdapter(
      () =>
        Effect.succeed({ records: [], maybeNextCursor: Option.none() }),
      Stream.never,
    )
    const exit = await Effect.runPromiseExit(
      watchOnce(adapter, account, store, {
        answerWithin: '1 second',
        maximumLifetime: '20 millis',
        backfillEvery: '1 second',
      }),
    )
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it('says which error ended the watch, never an empty reason', async () => {
    const { store } = memoryStore()
    const adapter = fakeAdapter(
      () => Effect.succeed({ records: [], maybeNextCursor: Option.none() }),
      Stream.fail(unavailable()),
    )
    const exit = await Effect.runPromiseExit(watchOnce(adapter, account, store))
    const reason = Exit.isFailure(exit)
      ? Option.match(Cause.findErrorOption(exit.cause), {
          onNone: () => '',
          onSome: error => error.reason,
        })
      : ''
    expect(reason).toContain('Unavailable')
  })

  it('fails loudly when the store does not answer in time', async () => {
    const { store } = memoryStore()
    const adapter = fakeAdapter(
      () => Effect.succeed({ records: [], maybeNextCursor: Option.none() }),
      Stream.concat(Stream.make(record('live', 1)), Stream.never),
    )
    const started = Date.now()
    const exit = await Effect.runPromiseExit(
      watchOnce(
        adapter,
        account,
        { ...store, storedTransaction: () => Effect.never },
        {
          answerWithin: '50 millis',
          maximumLifetime: '10 seconds',
          backfillEvery: '10 seconds',
        },
      ),
    )
    expect(Exit.isFailure(exit)).toBe(true)
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('hears a payment while the history provider is down', async () => {
    const { store, rows } = memoryStore()
    const adapter = fakeAdapter(
      () => Effect.fail(unavailable()),
      Stream.concat(Stream.make(record('live', 1)), Stream.never),
    )
    await Effect.runPromiseExit(
      watchOnce(adapter, account, store, {
        answerWithin: '1 second',
        maximumLifetime: '60 millis',
        backfillEvery: '1 second',
      }),
    )
    expect([...rows.keys()]).toEqual([`${account.accountKey}|live`])
  })

  it('hears a payment while the history provider hangs', async () => {
    const { store, rows } = memoryStore()
    const adapter = fakeAdapter(
      () => Effect.never,
      Stream.concat(Stream.make(record('live', 1)), Stream.never),
    )
    await Effect.runPromiseExit(
      watchOnce(adapter, account, store, {
        answerWithin: '30 millis',
        maximumLifetime: '80 millis',
        backfillEvery: '1 second',
      }),
    )
    expect([...rows.keys()]).toEqual([`${account.accountKey}|live`])
  })

  it('tries the backfill again within the same watch', async () => {
    const { store, rows } = memoryStore()
    let historyCalls = 0
    const adapter = fakeAdapter(() => {
      historyCalls += 1
      return historyCalls === 1
        ? Effect.fail(unavailable())
        : Effect.succeed({
            records: [record('missed', 1)],
            maybeNextCursor: Option.none(),
          })
    }, Stream.never)
    await Effect.runPromiseExit(
      watchOnce(adapter, account, store, {
        answerWithin: '1 second',
        maximumLifetime: '200 millis',
        backfillEvery: '10 millis',
      }),
    )
    expect(historyCalls).toBe(2)
    expect([...rows.keys()]).toEqual([`${account.accountKey}|missed`])
  })

  it("finishes a backfill in flight when the chain's stream drops", async () => {
    const { store, rows } = memoryStore()
    const adapter = fakeAdapter(
      () =>
        Effect.as(Effect.sleep('30 millis'), {
          records: [record('older', 1)],
          maybeNextCursor: Option.none(),
        }),
      Stream.fail(unavailable()),
    )
    const exit = await Effect.runPromiseExit(watchOnce(adapter, account, store))
    expect(Exit.isFailure(exit)).toBe(true)
    expect([...rows.keys()]).toEqual([`${account.accountKey}|older`])
  })
})

describe('reconnecting', () => {
  it('waits longer after each quick drop, up to 30 seconds', () => {
    expect(reconnectDelayMs(0)).toBe(1_000)
    expect(reconnectDelayMs(1)).toBe(2_000)
    expect(reconnectDelayMs(4)).toBe(16_000)
    expect(reconnectDelayMs(5)).toBe(30_000)
    expect(reconnectDelayMs(50)).toBe(30_000)
  })

  it('starts over only after a watch held for a minute', () => {
    expect(nextReconnectAttempt(3, 59_000)).toBe(4)
    expect(nextReconnectAttempt(3, 60_000)).toBe(0)
  })
})

describe('following one account for as long as it runs', () => {
  it('reconnects from the newest cursor it wrote, not the one it started with', async () => {
    const { store } = memoryStore()
    const asked: Array<Option.Option<string>> = []
    let reachedEnough: () => void = () => {}
    const enoughWatches = new Promise<void>(resolve => {
      reachedEnough = resolve
    })
    const adapter = fakeAdapter(query => {
      asked.push(query.maybeCursor)
      if (asked.length >= 4) {
        reachedEnough()
      }
      return Option.match(query.maybeCursor, {
        onNone: () =>
          Effect.succeed({
            records: [record('newest', 2)],
            maybeNextCursor: Option.some('page-2'),
          }),
        onSome: () =>
          Effect.succeed({
            records: [record('older', 1)],
            maybeNextCursor: Option.none(),
          }),
      })
    }, Stream.fail(unavailable()))
    const fiber = Effect.runFork(
      watchAccount(adapter, account, store, { reconnectAfter: () => 1 }),
    )
    await enoughWatches
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(asked.slice(0, 4)).toEqual([
      Option.none(),
      Option.some('page-2'),
      Option.none(),
      Option.none(),
    ])
  })
})
