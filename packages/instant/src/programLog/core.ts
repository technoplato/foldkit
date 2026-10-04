import { Cause, Effect, Option, Queue, Stream } from 'effect'

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

const observe = (
  database: ProgramLogDatabase,
  query:
    | ReturnType<typeof programLogQuery>
    | ReturnType<typeof programLogRecentQuery>,
  decode: (data: SnapshotLogQueryData) => SnapshotLogState,
): Stream.Stream<SnapshotLogState, SnapshotLogError> =>
  Stream.callback(queue =>
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
              Queue.offerUnsafe(queue, decode(response.data))
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

const ownerFieldsOf = async (
  database: ProgramLogDatabase,
  owner: ProgramLogOwner,
): Promise<Readonly<{ ownerUserID?: string }>> => {
  if (owner === 'Anyone') {
    return {}
  }
  const maybeUser = Option.fromNullishOr(await database.getAuth())
  return Option.match(maybeUser, {
    onNone: () => {
      throw new Error('A program log owned by its member needs a sign-in.')
    },
    onSome: user => ({ ownerUserID: user.id }),
  })
}

/**
 * One app's log on an Instant project, for browser and native
 * Processors. It reads, follows, and writes only the rows that app wrote,
 * through the app's envelope, so two apps on one project never see each
 * other's Messages. With `owner: 'SignedInUser'`, each row also names the
 * member who wrote it.
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
  options: Readonly<{ owner?: ProgramLogOwner }> = {},
): SnapshotLogTransport => {
  const decode = decodeProgramLogState(app)
  const owner = options.owner ?? 'Anyone'
  return {
    read: () =>
      Effect.tryPromise({
        try: async () => {
          const response = await database.queryOnce(programLogQuery(app))
          return decode(response.data)
        },
        catch: cause => new SnapshotLogError({ cause, operation: 'Read' }),
      }),
    readSince: maybeCursor =>
      readLogSince(
        offset =>
          database
            .queryOnce(programLogPageQuery(app, offset))
            .then(response => response.data.programMessage),
        maybeCursor,
        decodeProgramMessageRow(app),
      ),
    subscribe: observe(database, programLogQuery(app), decode),
    subscribeRecent: observe(database, programLogRecentQuery(app), decode),
    write: write =>
      Effect.tryPromise({
        try: async () => {
          const entity = database.tx['programMessage']?.[write.message.id]
          if (entity === undefined) {
            throw new Error('Expected a program log transaction entity.')
          }
          const ownerFields = await ownerFieldsOf(database, owner)
          return database
            .transact([
              entity.update({
                ...programMessageFieldsOf(app, write.message),
                ...ownerFields,
              }),
            ])
            .then(decodeProgramStoreTransactionOutcome)
        },
        catch: cause => new SnapshotLogError({ cause, operation: 'Write' }),
      }),
  }
}
