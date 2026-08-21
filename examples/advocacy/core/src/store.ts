import {
  Array,
  Cause,
  Context,
  Data,
  Effect,
  Layer,
  Queue,
  Schema as S,
  Stream,
} from 'effect'

import { type Write, encodeWrite, graphFromInstantRows } from './codec.js'
import type { AdvocacyInstantDatabase } from './instantSchema.js'
import { Graph, seedGraph } from './model.js'

/** A graph query, observation, or persist failed. */
export class AdvocacyStoreError extends Data.TaggedError('AdvocacyStoreError')<{
  readonly cause: unknown
  readonly operation: 'Fetch' | 'Observe' | 'Transact'
}> {}

/** One meeting graph snapshot with its source. */
export const AdvocacySnapshot = S.Struct({
  graph: Graph,
  source: S.Literals(['Instant', 'StaticFallback']),
})
/** One meeting graph snapshot with its source. */
export type AdvocacySnapshot = typeof AdvocacySnapshot.Type

/** The side-effecting graph capability required by the Advocacy Program. */
export type AdvocacyStoreService = Readonly<{
  fetch: Effect.Effect<AdvocacySnapshot, AdvocacyStoreError>
  observe: Stream.Stream<AdvocacySnapshot, AdvocacyStoreError>
  transact: (
    writes: ReadonlyArray<Write>,
  ) => Effect.Effect<void, AdvocacyStoreError>
}>

/** An injected advocacy graph whose implementation is selected by the host. */
export class AdvocacyStore extends Context.Service<
  AdvocacyStore,
  AdvocacyStoreService
>()('advocacy-core-example/AdvocacyStore') {}

/** Instant query used by live advocacy stores. */
export const advocacyGraphQuery = {
  advocacyPeople: {},
  advocacyMeetings: {},
  advocacyCalls: {},
  advocacyParticipants: {},
  advocacyChats: {},
  advocacySegments: {},
} as const

/** Instant rows for the advocacy graph namespaces. */
export type AdvocacyGraphRows = {
  readonly advocacyPeople: ReadonlyArray<unknown>
  readonly advocacyMeetings: ReadonlyArray<unknown>
  readonly advocacyCalls: ReadonlyArray<unknown>
  readonly advocacyParticipants: ReadonlyArray<unknown>
  readonly advocacyChats: ReadonlyArray<unknown>
  readonly advocacySegments: ReadonlyArray<unknown>
}

const emptyRows: AdvocacyGraphRows = {
  advocacyPeople: [],
  advocacyMeetings: [],
  advocacyCalls: [],
  advocacyParticipants: [],
  advocacyChats: [],
  advocacySegments: [],
}

const snapshotFromRows = (rows: AdvocacyGraphRows): AdvocacySnapshot => {
  const graph = graphFromInstantRows(rows)
  return Array.match(graph.people, {
    onEmpty: () =>
      AdvocacySnapshot.make({ graph: seedGraph, source: 'StaticFallback' }),
    onNonEmpty: () => AdvocacySnapshot.make({ graph, source: 'Instant' }),
  })
}

/** Minimal Instant client used by the live Advocacy store. */
export type AdvocacyInstantClient = Readonly<{
  queryOnce: (query: typeof advocacyGraphQuery) => Promise<{
    data: AdvocacyGraphRows
  }>
  subscribeQuery: (
    query: typeof advocacyGraphQuery,
    onResponse: (response: {
      data?: AdvocacyGraphRows
      error?: unknown
    }) => void,
  ) => () => void
  transact: (ops: ReadonlyArray<unknown>) => Promise<unknown>
  tx: AdvocacyInstantDatabase['tx']
}>

const adminPollMs = 1000

/** Wraps a public Instant core database for browser hosts. */
export const coreAdvocacyClient = (
  database: AdvocacyInstantDatabase,
): AdvocacyInstantClient => ({
  queryOnce: async query => {
    const response = await database.queryOnce(query)
    return { data: response.data }
  },
  subscribeQuery: (query, onResponse) =>
    database.subscribeQuery(query, response => {
      if (response.error !== undefined) {
        onResponse({ error: response.error })
        return
      }
      if (response.data === undefined) {
        onResponse({ data: emptyRows })
        return
      }
      onResponse({ data: response.data })
    }),
  transact: ops => database.transact(ops as never),
  tx: database.tx,
})
export const adminAdvocacyClient = (database: {
  query: (query: typeof advocacyGraphQuery) => Promise<AdvocacyGraphRows>
  transact: (ops: never) => Promise<unknown>
  tx: AdvocacyInstantDatabase['tx']
}): AdvocacyInstantClient => ({
  queryOnce: async query => ({ data: await database.query(query) }),
  subscribeQuery: (query, onResponse) => {
    let isRunning = true
    const tick = (): void => {
      void database.query(query).then(
        data => {
          if (isRunning) {
            onResponse({ data })
            setTimeout(tick, adminPollMs)
          }
        },
        error => {
          if (isRunning) {
            onResponse({ error })
          }
        },
      )
    }
    tick()
    return () => {
      isRunning = false
    }
  },
  transact: ops => database.transact(ops as never),
  tx: database.tx,
})

const requireTx = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`missing Instant tx for ${label}`)
  }
  return value
}

const opsForWrites = (
  database: AdvocacyInstantClient,
  writes: ReadonlyArray<Write>,
): ReadonlyArray<unknown> =>
  Array.map(writes, write => {
    const encoded = encodeWrite(write)
    if (encoded.namespace === 'advocacyPeople') {
      return requireTx(
        database.tx.advocacyPeople[encoded.id],
        encoded.namespace,
      ).update(encoded.attrs)
    }
    if (encoded.namespace === 'advocacyMeetings') {
      return requireTx(
        database.tx.advocacyMeetings[encoded.id],
        encoded.namespace,
      ).update(encoded.attrs)
    }
    if (encoded.namespace === 'advocacyCalls') {
      return requireTx(
        database.tx.advocacyCalls[encoded.id],
        encoded.namespace,
      ).update(encoded.attrs)
    }
    if (encoded.namespace === 'advocacyParticipants') {
      return requireTx(
        database.tx.advocacyParticipants[encoded.id],
        encoded.namespace,
      ).update(encoded.attrs)
    }
    if (encoded.namespace === 'advocacyChats') {
      return requireTx(
        database.tx.advocacyChats[encoded.id],
        encoded.namespace,
      ).update(encoded.attrs)
    }
    return requireTx(
      database.tx.advocacySegments[encoded.id],
      encoded.namespace,
    ).update(encoded.attrs)
  })

const seedSnapshot = AdvocacySnapshot.make({
  graph: seedGraph,
  source: 'StaticFallback',
})

/** Deterministic resources for tests, previews, and offline Clients. */
export const StaticAdvocacyStore = Layer.succeed(AdvocacyStore, {
  fetch: Effect.succeed(seedSnapshot),
  observe: Stream.succeed(seedSnapshot),
  transact: () => Effect.void,
})

/** Live Instant store for browser, CLI, and TUI Clients. */
export const makeLiveAdvocacyStore = (database: AdvocacyInstantClient) =>
  Layer.succeed(AdvocacyStore, {
    fetch: Effect.tryPromise({
      try: async () => {
        const response = await database.queryOnce(advocacyGraphQuery)
        return snapshotFromRows(response.data)
      },
      catch: cause => new AdvocacyStoreError({ cause, operation: 'Fetch' }),
    }),
    observe: Stream.callback<AdvocacySnapshot, AdvocacyStoreError>(queue =>
      Effect.acquireRelease(
        Effect.sync(() =>
          database.subscribeQuery(advocacyGraphQuery, response => {
            if (response.error !== undefined) {
              Queue.failCauseUnsafe(
                queue,
                Cause.fail(
                  new AdvocacyStoreError({
                    cause: response.error,
                    operation: 'Observe',
                  }),
                ),
              )
            } else {
              const rows =
                response.data === undefined ? emptyRows : response.data
              Queue.offerUnsafe(queue, snapshotFromRows(rows))
            }
          }),
        ),
        unsubscribe => Effect.sync(unsubscribe),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
    transact: writes =>
      Array.match(writes, {
        onEmpty: () => Effect.void,
        onNonEmpty: nonempty =>
          Effect.tryPromise({
            try: async () => {
              await database.transact(opsForWrites(database, nonempty) as never)
            },
            catch: cause =>
              new AdvocacyStoreError({ cause, operation: 'Transact' }),
          }),
      }),
  })
