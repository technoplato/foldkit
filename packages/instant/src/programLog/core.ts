import { Cause, Data, Effect, Option, Queue, Scope, Stream } from 'effect'

import type { InstantCoreDatabase, InstantSchemaDef } from '@instantdb/core'

import { decodeProgramStoreTransactionOutcome } from '../instantProgramStore/index.js'
import {
  SnapshotLogError,
  type SnapshotLogQueryData,
  type SnapshotLogState,
  type SnapshotLogTransport,
  readLogSince,
} from '../snapshotLog/snapshotLog.js'
import {
  decodeProgramLogState,
  decodeProgramMessageRow,
  programLogPageQuery,
  programLogQuery,
  programLogRecentQuery,
  programMessageFieldsOf,
} from './programLog.js'

/**
 * Any Instant core client a program log can read and write: the shared
 * project's own, or one opened on another app's schema, such as a
 * universal schema whose `programMessage` rows also carry an owner.
 */
export type ProgramLogDatabase = InstantCoreDatabase<
  InstantSchemaDef<any, any, any>,
  boolean
>

/**
 * Whose rows a program log writes. `Anyone` writes the shared project's
 * open rows; `SignedInUser` stamps each row with the signed-in member's
 * id as `ownerUserID`, for an app whose rules let each person read and
 * write only their own rows.
 */
export type ProgramLogOwner = 'Anyone' | 'SignedInUser'

/**
 * Terminal error raised when a `SignedInUser` runtime's signed-in member
 * signs out or switches to another member after boot.
 */
export class ProgramLogAuthChangedError extends Data.TaggedError(
  'ProgramLogAuthChangedError',
)<{
  readonly message: string
}> {}

type AuthEvent = Readonly<{
  readonly user?: Readonly<{ readonly id: string }> | null
  readonly error?: unknown
}>

type AuthSubscribable = Readonly<{
  subscribeAuth?: (callback: (auth: AuthEvent) => void) => () => void
}>

/**
 * Pins the signed-in user id for the lifetime of a `SignedInUser` runtime,
 * checks it before writes and local snapshot saves, and watches auth changes
 * so sign-out or account switch stops persistence and removes cached state.
 */
export type PinnedOwnerController = Readonly<{
  readonly resolvePinnedOwner: () => Promise<Option.Option<string>>
  readonly assertPinnedForWrite: () => Promise<Option.Option<string>>
  readonly isPinnedForSave: () => Promise<boolean>
  readonly watchAuthChanged: (
    onChanged: (reason: string) => void,
  ) => Effect.Effect<void, never, Scope.Scope>
}>

export const makePinnedOwnerController = (
  database: ProgramLogDatabase,
  owner: ProgramLogOwner,
): PinnedOwnerController => {
  if (owner === 'Anyone') {
    return {
      resolvePinnedOwner: () => Promise.resolve(Option.none()),
      assertPinnedForWrite: () => Promise.resolve(Option.none()),
      isPinnedForSave: () => Promise.resolve(true),
      watchAuthChanged: () => Effect.void,
    }
  }

  let pinnedUserId: string | undefined = undefined
  let isRevoked = false

  const readCurrentUser = async (): Promise<
    Readonly<{ status: 'SignedIn'; id: string }> |
    Readonly<{ status: 'SignedOut' }> |
    Readonly<{ status: 'TransientError' }>
  > => {
    try {
      const user = await database.getAuth()
      if (user === null || user === undefined || user.id === '') {
        return { status: 'SignedOut' }
      }
      return { status: 'SignedIn', id: user.id }
    } catch {
      // Storage read errors are transient; never wipe offline cache on throw.
      return { status: 'TransientError' }
    }
  }

  const resolvePinnedOwner = async (): Promise<Option.Option<string>> => {
    if (isRevoked) {
      return Option.none()
    }
    if (pinnedUserId !== undefined) {
      return Option.some(pinnedUserId)
    }
    const current = await readCurrentUser()
    if (current.status === 'SignedIn') {
      pinnedUserId = current.id
      return Option.some(current.id)
    }
    return Option.none()
  }

  const assertPinnedForWrite = async (): Promise<Option.Option<string>> => {
    if (isRevoked) {
      throw new ProgramLogAuthChangedError({
        message: 'The signed-in member changed or signed out.',
      })
    }
    const current = await readCurrentUser()
    if (current.status === 'TransientError') {
      throw new Error('Could not verify the signed-in member.')
    }
    if (current.status === 'SignedOut') {
      if (pinnedUserId !== undefined) {
        isRevoked = true
        throw new ProgramLogAuthChangedError({
          message: 'The signed-in member signed out.',
        })
      }
      throw new Error('A program log owned by its member needs a sign-in.')
    }
    if (pinnedUserId === undefined) {
      pinnedUserId = current.id
      return Option.some(current.id)
    }
    if (current.id !== pinnedUserId) {
      isRevoked = true
      throw new ProgramLogAuthChangedError({
        message: 'A different member is now signed in.',
      })
    }
    return Option.some(pinnedUserId)
  }

  const isPinnedForSave = async (): Promise<boolean> => {
    if (isRevoked || pinnedUserId === undefined) {
      return false
    }
    const current = await readCurrentUser()
    if (current.status === 'TransientError') {
      return true
    }
    if (current.status === 'SignedOut' || current.id !== pinnedUserId) {
      isRevoked = true
      return false
    }
    return true
  }

  const watchAuthChanged = (
    onChanged: (reason: string) => void,
  ): Effect.Effect<void, never, Scope.Scope> =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const subscribable = database as ProgramLogDatabase & AuthSubscribable
        if (typeof subscribable.subscribeAuth !== 'function') {
          return () => undefined
        }
        return subscribable.subscribeAuth(auth => {
          if (auth.error !== undefined || pinnedUserId === undefined || isRevoked) {
            return
          }
          if (auth.user === null || auth.user === undefined) {
            isRevoked = true
            onChanged('The signed-in member signed out.')
          } else if (auth.user.id !== pinnedUserId) {
            isRevoked = true
            onChanged('A different member signed in.')
          }
        })
      }),
      unsubscribe => Effect.sync(unsubscribe),
    ).pipe(Effect.asVoid)

  return {
    resolvePinnedOwner,
    assertPinnedForWrite,
    isPinnedForSave,
    watchAuthChanged,
  }
}

const rowIdOf = (row: unknown): string | undefined =>
  typeof row === 'object' &&
  row !== null &&
  'id' in row &&
  typeof row.id === 'string'
    ? row.id
    : undefined

const filterConfirmedRows = (
  rows: ReadonlyArray<unknown>,
  pendingWriteIds: ReadonlySet<string>,
): ReadonlyArray<unknown> =>
  pendingWriteIds.size === 0
    ? rows
    : rows.filter(row => {
        const id = rowIdOf(row)
        return id === undefined || !pendingWriteIds.has(id)
      })

const observe = (
  database: ProgramLogDatabase,
  buildQuery: (ownerUserID?: string) =>
    | ReturnType<typeof programLogQuery>
    | ReturnType<typeof programLogRecentQuery>,
  resolveOwner: () => Promise<Option.Option<string>>,
  pendingWriteIds: ReadonlySet<string>,
  decode: (data: SnapshotLogQueryData) => SnapshotLogState,
): Stream.Stream<SnapshotLogState, SnapshotLogError> =>
  Stream.unwrap(
    Effect.tryPromise({
      try: () => resolveOwner(),
      catch: cause => new SnapshotLogError({ cause, operation: 'Observe' }),
    }).pipe(
      Effect.map(maybeOwner => {
        const query = buildQuery(Option.getOrUndefined(maybeOwner))
        return Stream.callback<SnapshotLogState, SnapshotLogError>(queue =>
          Effect.acquireRelease(
            Effect.sync(() =>
              database.subscribeQuery(query, response => {
                if (response.error !== undefined) {
                  Queue.failCauseUnsafe(
                    queue,
                    Cause.fail(
                      new SnapshotLogError({
                        cause: response.error,
                        operation: 'Observe',
                      }),
                    ),
                  )
                } else {
                  try {
                    const filteredData: SnapshotLogQueryData = {
                      ...response.data,
                      programMessage: filterConfirmedRows(
                        response.data.programMessage ?? [],
                        pendingWriteIds,
                      ),
                    }
                    Queue.offerUnsafe(queue, decode(filteredData))
                  } catch (cause) {
                    Queue.failCauseUnsafe(
                      queue,
                      Cause.fail(
                        new SnapshotLogError({ cause, operation: 'Decode' }),
                      ),
                    )
                  }
                }
              }),
            ),
            unsubscribe => Effect.sync(unsubscribe),
          ),
        )
      }),
    ),
  )

/**
 * One app's log on an Instant project, for browser and native
 * Processors. It reads, follows, and writes only the rows that app wrote,
 * through the app's envelope, so two apps on one project never see each
 * other's Messages. With `owner: 'SignedInUser'`, each row is scoped to
 * and stamped with the pinned member's `ownerUserID`.
 *
 * Rows whose `transact` has not resolved as server-synced are held out of
 * `readSince` pages and live subscription echoes so the server offset cursor
 * and `ConfirmedRow` only count server-acknowledged rows.
 *
 * @example
 * ```typescript
 * makeInstantCoreProgramLogTransport(database, 'multiple-counters')
 * makeInstantCoreProgramLogTransport(database, 'books', { owner: 'SignedInUser' })
 * ```
 */
export const makeInstantCoreProgramLogTransport = (
  database: ProgramLogDatabase,
  app: string,
  options: Readonly<{
    owner?: ProgramLogOwner
    pinnedOwner?: PinnedOwnerController
  }> = {},
): SnapshotLogTransport => {
  const decode = decodeProgramLogState(app)
  const owner = options.owner ?? 'Anyone'
  const pinnedOwner =
    options.pinnedOwner ?? makePinnedOwnerController(database, owner)
  const pendingWriteIds = new Set<string>()

  return {
    read: () =>
      Effect.tryPromise({
        try: async () => {
          const maybeOwner = await pinnedOwner.resolvePinnedOwner()
          const response = await database.queryOnce(
            programLogQuery(app, Option.getOrUndefined(maybeOwner)),
          )
          return decode({
            ...response.data,
            programMessage: filterConfirmedRows(
              response.data.programMessage ?? [],
              pendingWriteIds,
            ),
          })
        },
        catch: cause => new SnapshotLogError({ cause, operation: 'Read' }),
      }),
    readSince: maybeCursor =>
      Effect.tryPromise({
        try: () => pinnedOwner.resolvePinnedOwner(),
        catch: cause => new SnapshotLogError({ cause, operation: 'Read' }),
      }).pipe(
        Effect.flatMap(maybeOwner =>
          readLogSince(
            offset =>
              database
                .queryOnce(
                  programLogPageQuery(
                    app,
                    offset,
                    Option.getOrUndefined(maybeOwner),
                  ),
                )
                .then(response =>
                  filterConfirmedRows(
                    response.data.programMessage ?? [],
                    pendingWriteIds,
                  ),
                ),
            maybeCursor,
            decodeProgramMessageRow(app),
          ),
        ),
      ),
    subscribe: observe(
      database,
      ownerUserID => programLogQuery(app, ownerUserID),
      pinnedOwner.resolvePinnedOwner,
      pendingWriteIds,
      decode,
    ),
    subscribeRecent: observe(
      database,
      ownerUserID => programLogRecentQuery(app, ownerUserID),
      pinnedOwner.resolvePinnedOwner,
      pendingWriteIds,
      decode,
    ),
    write: write =>
      Effect.tryPromise({
        try: async () => {
          const entity = database.tx['programMessage']?.[write.message.id]
          if (entity === undefined) {
            throw new Error('Expected a program log transaction entity.')
          }
          const maybeOwner = await pinnedOwner.assertPinnedForWrite()
          const ownerFields = Option.match(maybeOwner, {
            onNone: () => ({}),
            onSome: ownerUserID => ({ ownerUserID }),
          })
          pendingWriteIds.add(write.message.id)
          try {
            const outcome = decodeProgramStoreTransactionOutcome(
              await database.transact([
                entity.update({
                  ...programMessageFieldsOf(app, write.message),
                  ...ownerFields,
                }),
              ]),
            )
            if (outcome._tag === 'Synced') {
              pendingWriteIds.delete(write.message.id)
            }
            return outcome
          } catch (error) {
            pendingWriteIds.delete(write.message.id)
            throw error
          }
        },
        catch: cause => new SnapshotLogError({ cause, operation: 'Write' }),
      }),
  }
}
