import { Cause, Effect, Exit, Option, Stream } from 'effect'
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
import { type ActivityStore, watchOnce } from './watcher.js'

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
  }
  return { store, rows, cursors, writeCount: () => writes }
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

  it('says which error ended the watch, never an empty reason', async () => {
    const { store } = memoryStore()
    const adapter = fakeAdapter(() => Effect.fail(unavailable()), Stream.never)
    const exit = await Effect.runPromiseExit(watchOnce(adapter, account, store))
    const reason = Exit.isFailure(exit)
      ? Option.match(Cause.findErrorOption(exit.cause), {
          onNone: () => '',
          onSome: error => error.reason,
        })
      : ''
    expect(reason).toContain('Unavailable')
  })

  it('fails loudly when the chain does not answer in time', async () => {
    const { store } = memoryStore()
    const adapter = fakeAdapter(() => Effect.never, Stream.never)
    const started = Date.now()
    const exit = await Effect.runPromiseExit(
      watchOnce(adapter, account, store, { answerWithin: '50 millis' }),
    )
    expect(Exit.isFailure(exit)).toBe(true)
    expect(Date.now() - started).toBeLessThan(2_000)
  })
})
