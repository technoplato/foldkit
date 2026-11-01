import {
  Array,
  Cause,
  Context,
  Data,
  Effect,
  Option,
  Order,
  Queue,
  Ref,
  Schema as S,
  Stream,
  SubscriptionRef,
} from 'effect'

// MODEL

/**
 * A view of the list a person named and kept: `Close to landing` is the list
 * at `?landing=close`. `query` is the list's URL search string, empty for the
 * whole list, so a view holds whatever a link holds. `position` orders them
 * and may fall between two others, so a move writes one row.
 */
export const SavedView = S.Struct({
  createdAtMs: S.Number,
  id: S.String,
  name: S.String,
  position: S.Number,
  query: S.String,
  updatedAtMs: S.Number,
})
/** A view of the list a person named and kept. */
export type SavedView = typeof SavedView.Type

/** What a person gives a new view: its name, what it shows, and its place. */
export type NewSavedView = Pick<SavedView, 'name' | 'position' | 'query'>

/** The views in the order a person keeps them. */
export const SavedViewOrder: Order.Order<SavedView> = Order.mapInput(
  Order.Number,
  (view: SavedView) => view.position,
)

// SERVICE

/** Why a saved view could not be read or written. */
export class IssueViewError extends Data.TaggedError('IssueViewError')<{
  cause: unknown
}> {}

/** Where a person's saved views live. */
export type IssueViewsService = Readonly<{
  createView: (view: NewSavedView) => Effect.Effect<SavedView, IssueViewError>
  deleteView: (viewId: string) => Effect.Effect<void, IssueViewError>
  observeViews: Stream.Stream<ReadonlyArray<SavedView>, IssueViewError>
  updateView: (view: SavedView) => Effect.Effect<SavedView, IssueViewError>
}>

/** A controlled dependency for a person's saved views. */
export class IssueViews extends Context.Service<
  IssueViews,
  IssueViewsService
>()('issues-example/IssueViews') {}

const NO_HOME_REASON = 'This host keeps no saved views.'

/** The views of a host without Scribe's app: none, and none can be kept. */
export const NoIssueViews: IssueViewsService = {
  createView: () =>
    Effect.fail(new IssueViewError({ cause: new Error(NO_HOME_REASON) })),
  deleteView: () =>
    Effect.fail(new IssueViewError({ cause: new Error(NO_HOME_REASON) })),
  observeViews: Stream.succeed([]),
  updateView: () =>
    Effect.fail(new IssueViewError({ cause: new Error(NO_HOME_REASON) })),
}

// MEMORY

const inOrder = (views: ReadonlyArray<SavedView>): ReadonlyArray<SavedView> =>
  Array.sort(views, SavedViewOrder)

/** Saved views held in memory, for previews, tests and offline Clients. */
export const makeMemoryIssueViews = (
  seed: ReadonlyArray<SavedView>,
): Effect.Effect<IssueViewsService> =>
  Effect.gen(function* () {
    const views = yield* SubscriptionRef.make(inOrder(seed))
    const clock = yield* Ref.make(
      Array.reduce(seed, 0, (latest, view) =>
        Math.max(latest, view.updatedAtMs),
      ),
    )
    const nextTime = Ref.updateAndGet(clock, atMs => atMs + 1)
    return {
      createView: fields =>
        Effect.gen(function* () {
          const atMs = yield* nextTime
          const view = SavedView.make({
            ...fields,
            createdAtMs: atMs,
            id: `view-${atMs.toString()}`,
            updatedAtMs: atMs,
          })
          yield* SubscriptionRef.update(views, stored =>
            inOrder(Array.append(stored, view)),
          )
          return view
        }),
      deleteView: viewId =>
        SubscriptionRef.update(views, stored =>
          Array.filter(stored, view => view.id !== viewId),
        ),
      observeViews: SubscriptionRef.changes(views),
      updateView: view =>
        Effect.gen(function* () {
          const atMs = yield* nextTime
          const updated = SavedView.make({ ...view, updatedAtMs: atMs })
          yield* SubscriptionRef.update(views, stored =>
            inOrder(
              Array.map(stored, current =>
                current.id === view.id ? updated : current,
              ),
            ),
          )
          return updated
        }),
    }
  })

// INSTANT

const FORMAT_VERSION = 1

/**
 * The part of an Instant client saved views need, signed in as `ownerUserId`.
 * `saveRow` writes the fields it is given to one `issueViews` row, creating
 * it when it is new.
 */
export type IssueViewsDatabase = Readonly<{
  deleteRow: (viewId: string) => Promise<unknown>
  newId: () => string
  nowMs: () => number
  ownerUserId: string
  saveRow: (
    viewId: string,
    row: Readonly<Record<string, unknown>>,
  ) => Promise<unknown>
  subscribeQuery: (
    query: typeof storedViewsQuery,
    onResponse: (
      response: Readonly<{ data?: unknown; error?: unknown }>,
    ) => void,
  ) => () => void
}>

/** What the list asks Scribe's app: the fields of every view its rules show. */
export const storedViewsQuery = {
  issueViews: {
    $: {
      fields: ['createdAtMs', 'name', 'position', 'query', 'updatedAtMs'],
    },
  },
}

const StoredViews = S.Struct({ issueViews: S.Array(SavedView) })

const decodeStoredViews = S.decodeUnknownSync(StoredViews)

const viewsOf = (data: unknown): ReadonlyArray<SavedView> =>
  inOrder(decodeStoredViews(data).issueViews)

const attempted = <A>(
  write: () => Promise<unknown>,
  written: A,
): Effect.Effect<A, IssueViewError> =>
  Effect.tryPromise({
    try: write,
    catch: cause => new IssueViewError({ cause }),
  }).pipe(Effect.as(written))

/**
 * Saved views in Scribe's `issueViews`, owner-only, opened the first time a
 * page asks. Instant shows a write in `observeViews` before the server takes
 * it, and a refused write fails here with the reason. A row's owner, format
 * and birth never change, so an update writes only what can.
 */
export const instantIssueViews = (
  openDatabase: Effect.Effect<IssueViewsDatabase, IssueViewError>,
): IssueViewsService => ({
  createView: ({ name, position, query }) =>
    Effect.flatMap(openDatabase, database => {
      const id = database.newId()
      const atMs = database.nowMs()
      return attempted(
        () =>
          database.saveRow(id, {
            createdAtMs: atMs,
            formatVersion: FORMAT_VERSION,
            name,
            ownerUserID: database.ownerUserId,
            position,
            query,
            updatedAtMs: atMs,
          }),
        SavedView.make({
          createdAtMs: atMs,
          id,
          name,
          position,
          query,
          updatedAtMs: atMs,
        }),
      )
    }),
  deleteView: viewId =>
    Effect.flatMap(openDatabase, database =>
      attempted(() => database.deleteRow(viewId), undefined),
    ),
  observeViews: Stream.unwrap(
    Effect.map(openDatabase, database =>
      Stream.callback<ReadonlyArray<SavedView>, IssueViewError>(queue =>
        Effect.acquireRelease(
          Effect.sync(() =>
            database.subscribeQuery(storedViewsQuery, response => {
              if (response.error !== undefined) {
                Queue.failCauseUnsafe(
                  queue,
                  Cause.fail(new IssueViewError({ cause: response.error })),
                )
              } else {
                const maybeRead = Option.liftThrowable(viewsOf)(response.data)
                if (Option.isSome(maybeRead)) {
                  Queue.offerUnsafe(queue, maybeRead.value)
                } else {
                  Queue.failCauseUnsafe(
                    queue,
                    Cause.fail(
                      new IssueViewError({
                        cause: new Error(
                          'Scribe answered with views this page cannot read.',
                        ),
                      }),
                    ),
                  )
                }
              }
            }),
          ),
          unsubscribe => Effect.sync(unsubscribe),
        ).pipe(Effect.flatMap(() => Effect.never)),
      ),
    ),
  ),
  updateView: view =>
    Effect.flatMap(openDatabase, database => {
      const atMs = Math.max(database.nowMs(), view.updatedAtMs)
      return attempted(
        () =>
          database.saveRow(view.id, {
            name: view.name,
            position: view.position,
            query: view.query,
            updatedAtMs: atMs,
          }),
        SavedView.make({ ...view, updatedAtMs: atMs }),
      )
    }),
})

/** Why a saved view was not read or written, in words a person reads. */
export const describeIssueViewError = (error: IssueViewError): string => {
  const cause = error.cause
  if (cause instanceof Error) {
    return cause.message
  } else if (
    typeof cause === 'object' &&
    cause !== null &&
    'message' in cause
  ) {
    return String(cause.message)
  } else {
    return String(cause)
  }
}
