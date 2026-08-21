import {
  Array,
  Cause,
  Context,
  Data,
  Effect,
  Layer,
  Order,
  Queue,
  Schema as S,
  Stream,
} from 'effect'

import { Idea, seedIdeas } from './catalog.js'

/** A catalog query or observation failed. */
export class IdeasStoreError extends Data.TaggedError('IdeasStoreError')<{
  readonly cause: unknown
  readonly operation: 'Fetch' | 'Observe'
}> {}

/** One catalog snapshot with its source. */
export const IdeasSnapshot = S.Struct({
  ideas: S.Array(Idea),
  source: S.Literals(['Instant', 'StaticFallback']),
})
/** One catalog snapshot with its source. */
export type IdeasSnapshot = typeof IdeasSnapshot.Type

/** The side-effecting catalog capability required by the Ideas Program. */
export type IdeasStoreService = Readonly<{
  fetch: Effect.Effect<IdeasSnapshot, IdeasStoreError>
  observe: Stream.Stream<IdeasSnapshot, IdeasStoreError>
}>

/** An injected Ideas catalog whose implementation is selected by the host. */
export class IdeasStore extends Context.Service<
  IdeasStore,
  IdeasStoreService
>()('ideas-core-example/IdeasStore') {}

const InstantIdeaRecord = S.Struct({
  body: S.String,
  id: S.String,
  index: S.Number,
  slug: S.String,
  title: S.String,
})

const ideasQuery = { knophyIdeas: {} } as const

const byIndex = Order.mapInput(Order.Number, (idea: Idea) => idea.index)

const decodeIdeas = (rows: ReadonlyArray<unknown>): ReadonlyArray<Idea> => {
  const decoded = rows.flatMap(row => {
    const parsed = S.decodeUnknownOption(InstantIdeaRecord)(row)
    return parsed._tag === 'Some' ? [parsed.value] : []
  })
  return Array.sort(decoded, byIndex)
}

/** Minimal Instant client used by the live Ideas store. */
export type IdeasInstantClient = Readonly<{
  queryOnce: (query: typeof ideasQuery) => Promise<{
    data: { knophyIdeas: ReadonlyArray<unknown> }
  }>
  subscribeQuery: (
    query: typeof ideasQuery,
    onResponse: (response: {
      data?: { knophyIdeas: ReadonlyArray<unknown> }
      error?: unknown
    }) => void,
  ) => () => void
}>

const snapshotFromRows = (rows: ReadonlyArray<unknown>): IdeasSnapshot => {
  const ideas = decodeIdeas(rows)
  if (ideas.length === 0) {
    return IdeasSnapshot.make({ ideas: seedIdeas, source: 'StaticFallback' })
  }
  return IdeasSnapshot.make({ ideas, source: 'Instant' })
}

/** Deterministic resources for tests, previews, and offline Clients. */
export const StaticIdeasResources = Layer.succeed(IdeasStore, {
  fetch: Effect.succeed(
    IdeasSnapshot.make({ ideas: seedIdeas, source: 'StaticFallback' }),
  ),
  observe: Stream.succeed(
    IdeasSnapshot.make({ ideas: seedIdeas, source: 'StaticFallback' }),
  ),
})

/** Live Instant resources for browser, native, CLI, and TUI Clients. */
export const makeLiveIdeasResources = (database: IdeasInstantClient) =>
  Layer.succeed(IdeasStore, {
    fetch: Effect.tryPromise({
      try: async () => {
        const response = await database.queryOnce(ideasQuery)
        return snapshotFromRows(response.data.knophyIdeas)
      },
      catch: cause => new IdeasStoreError({ cause, operation: 'Fetch' }),
    }),
    observe: Stream.callback<IdeasSnapshot, IdeasStoreError>(queue =>
      Effect.acquireRelease(
        Effect.sync(() =>
          database.subscribeQuery(ideasQuery, response => {
            if (response.error !== undefined) {
              Queue.failCauseUnsafe(
                queue,
                Cause.fail(
                  new IdeasStoreError({
                    cause: response.error,
                    operation: 'Observe',
                  }),
                ),
              )
            } else {
              const rows =
                response.data === undefined ? [] : response.data.knophyIdeas
              Queue.offerUnsafe(queue, snapshotFromRows(rows))
            }
          }),
        ),
        unsubscribe => Effect.sync(unsubscribe),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
  })
