import {
  Cause,
  Context,
  Data,
  Effect,
  Layer,
  Queue,
  Schema as S,
  Stream,
} from 'effect'

/** A snap query or observation failed. */
export class OrbitStoreError extends Data.TaggedError('OrbitStoreError')<{
  readonly cause: unknown
  readonly operation: 'Fetch' | 'Observe'
}> {}

/** One foldkit snap with its source. */
export const OrbitSnapshot = S.Struct({
  seq: S.Number,
  modelJson: S.String,
  source: S.Literals(['Instant', 'StaticFallback']),
})
/** One foldkit snap with its source. */
export type OrbitSnapshot = typeof OrbitSnapshot.Type

/** The side-effecting snap capability required by the Orbit Program. */
export type OrbitStoreService = Readonly<{
  fetch: Effect.Effect<OrbitSnapshot, OrbitStoreError>
  observe: Stream.Stream<OrbitSnapshot, OrbitStoreError>
}>

/** An injected Orbit snap whose implementation is selected by the host. */
export class OrbitStore extends Context.Service<OrbitStore, OrbitStoreService>()(
  'orbit-core-example/OrbitStore',
) {}

const snapQuery = { foldkitSnap: {} } as const

const InstantSnapRecord = S.Struct({
  modelJson: S.String,
  room: S.String,
  seq: S.Number,
})

/** Minimal Instant client used by the live Orbit store. */
export type OrbitInstantClient = Readonly<{
  queryOnce: (query: typeof snapQuery) => Promise<{
    data: { foldkitSnap: ReadonlyArray<unknown> }
  }>
  subscribeQuery: (
    query: typeof snapQuery,
    onResponse: (response: unknown) => void,
  ) => () => void
}>

const emptySnap = (): OrbitSnapshot =>
  OrbitSnapshot.make({
    modelJson: '{}',
    seq: 0,
    source: 'StaticFallback',
  })

const snapshotFromRows = (rows: ReadonlyArray<unknown>): OrbitSnapshot => {
  const parsed = rows.flatMap(row => {
    const decoded = S.decodeUnknownOption(InstantSnapRecord)(row)
    return decoded._tag === 'Some' ? [decoded.value] : []
  })
  const first = parsed[0]
  if (first === undefined) {
    return emptySnap()
  }
  return OrbitSnapshot.make({
    modelJson: first.modelJson,
    seq: first.seq,
    source: 'Instant',
  })
}

/** Deterministic resources for tests, previews, and offline Clients. */
export const StaticOrbitResources = Layer.succeed(OrbitStore, {
  fetch: Effect.succeed(emptySnap()),
  observe: Stream.succeed(emptySnap()),
})

/** Live Instant resources. Falls back to empty snap when Instant has no rows. */
export const makeLiveOrbitResources = (database: OrbitInstantClient) =>
  Layer.succeed(OrbitStore, {
    fetch: Effect.tryPromise({
      try: async () => {
        const response = await database.queryOnce(snapQuery)
        return snapshotFromRows(response.data.foldkitSnap)
      },
      catch: cause => new OrbitStoreError({ cause, operation: 'Fetch' }),
    }),
    observe: Stream.callback<OrbitSnapshot, OrbitStoreError>(queue =>
      Effect.acquireRelease(
        Effect.sync(() =>
          database.subscribeQuery(snapQuery, response => {
            const rec =
              typeof response === 'object' && response !== null
                ? (response as {
                    data?: { foldkitSnap?: ReadonlyArray<unknown> }
                    error?: unknown
                  })
                : {}
            if (rec.error !== undefined) {
              Queue.failCauseUnsafe(
                queue,
                Cause.fail(
                  new OrbitStoreError({
                    cause: rec.error,
                    operation: 'Observe',
                  }),
                ),
              )
            } else {
              const rows = rec.data?.foldkitSnap ?? []
              Queue.offerUnsafe(queue, snapshotFromRows(rows))
            }
          }),
        ),
        unsubscribe => Effect.sync(unsubscribe),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
  })
