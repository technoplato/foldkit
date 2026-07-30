import { Array, Data, Effect, Layer, Option, Schema as S } from 'effect'

import { InstantCoreDatabase, i } from '@instantdb/core'

import {
  Issue,
  type IssueQuery,
  IssueTracker,
  IssueTrackerError,
  type IssueTrackerService,
} from '../issues/index.js'
import {
  LogEvent,
  Logger,
  LoggerError,
  type LoggerService,
} from '../logging/index.js'

const IssueJson = S.fromJsonString(Issue)
const LogEventJson = S.fromJsonString(LogEvent)

/** A queryable InstantDB envelope for one lossless portable Issue payload. */
export const InstantIssueRecord = S.Struct({
  id: S.String,
  payloadJson: S.String,
  priority: S.String,
  productId: S.String,
  projectId: S.String,
  status: S.String,
  updatedAtMs: S.Number,
})
/** A queryable InstantDB envelope for one lossless portable Issue payload. */
export type InstantIssueRecord = typeof InstantIssueRecord.Type

/** A queryable InstantDB envelope for one lossless structured Log Event. */
export const InstantLogRecord = S.Struct({
  category: S.String,
  id: S.String,
  level: S.String,
  name: S.String,
  payloadJson: S.String,
  timestampMs: S.Number,
})
/** A queryable InstantDB envelope for one lossless structured Log Event. */
export type InstantLogRecord = typeof InstantLogRecord.Type

/** The entity definitions a host can compose into its application schema. */
export const InstantToolsEntities = {
  instantToolsIssues: i.entity({
    payloadJson: i.string(),
    priority: i.string().indexed(),
    productId: i.string().indexed(),
    projectId: i.string().indexed(),
    status: i.string().indexed(),
    updatedAtMs: i.number().indexed(),
  }),
  instantToolsLogs: i.entity({
    category: i.string().indexed(),
    level: i.string().indexed(),
    name: i.string().indexed(),
    payloadJson: i.string(),
    timestampMs: i.number().indexed(),
  }),
}

/** A complete InstantDB schema for hosts using only the Instant Tools entities. */
export const InstantToolsSchema = i.schema({
  entities: InstantToolsEntities,
})

/** An InstantDB client initialized by the host with the Instant Tools schema. */
export type InstantToolsDatabase = InstantCoreDatabase<
  typeof InstantToolsSchema
>

/** A low-level Instant entity operation failed. */
export class InstantEntityStoreError extends Data.TaggedError(
  'InstantEntityStoreError',
)<{
  readonly cause: unknown
  readonly operation: 'AppendLog' | 'FetchIssues' | 'SaveIssue'
}> {}

/** The minimal Instant entity capability consumed by both transport adapters. */
export type InstantEntityStoreService = Readonly<{
  appendLog: (
    record: InstantLogRecord,
  ) => Effect.Effect<void, InstantEntityStoreError>
  fetchIssues: Effect.Effect<
    ReadonlyArray<InstantIssueRecord>,
    InstantEntityStoreError
  >
  saveIssue: (
    record: InstantIssueRecord,
  ) => Effect.Effect<void, InstantEntityStoreError>
}>

/** Encodes one portable Issue into its queryable InstantDB envelope. */
export const makeInstantIssueRecord = (issue: Issue): InstantIssueRecord =>
  InstantIssueRecord.make({
    id: issue.id,
    payloadJson: S.encodeSync(IssueJson)(issue),
    priority: issue.priority,
    productId: issue.product.id,
    projectId: Option.getOrElse(issue.projectId, () => ''),
    status: issue.status,
    updatedAtMs: issue.updatedAtMs,
  })

/** Decodes one InstantDB Issue envelope into its portable domain value. */
export const decodeIssueRecord = (record: InstantIssueRecord): Issue =>
  S.decodeUnknownSync(IssueJson)(record.payloadJson)

/** Encodes one structured Log Event into its queryable InstantDB envelope. */
export const makeInstantLogRecord = (event: LogEvent): InstantLogRecord =>
  InstantLogRecord.make({
    category: event.category,
    id: event.id,
    level: event.level,
    name: event.name,
    payloadJson: S.encodeSync(LogEventJson)(event),
    timestampMs: event.timestampMs,
  })

/** Decodes one InstantDB Log envelope into its portable domain value. */
export const decodeLogRecord = (record: InstantLogRecord): LogEvent =>
  S.decodeUnknownSync(LogEventJson)(record.payloadJson)

const matchesQuery = (issue: Issue, query: IssueQuery): boolean => {
  const matchesProduct = Option.match(query.productId, {
    onNone: () => true,
    onSome: productId => issue.product.id === productId,
  })
  const matchesProject = Option.match(query.projectId, {
    onNone: () => true,
    onSome: projectId => Option.contains(issue.projectId, projectId),
  })
  const matchesStatus =
    Array.isReadonlyArrayEmpty(query.statuses) ||
    Array.some(query.statuses, status => status === issue.status)

  return matchesProduct && matchesProject && matchesStatus
}

/** Adapts the low-level Instant entity capability to the portable Issue tracker. */
export const makeIssueTracker = (
  store: InstantEntityStoreService,
): IssueTrackerService => ({
  fetch: query =>
    store.fetchIssues.pipe(
      Effect.flatMap(records =>
        Effect.try({
          try: () => Array.map(records, decodeIssueRecord),
          catch: cause =>
            new IssueTrackerError({
              cause,
              operation: 'Fetch',
            }),
        }),
      ),
      Effect.map(issues =>
        Array.take(
          Array.filter(issues, issue => matchesQuery(issue, query)),
          Math.max(0, query.limit),
        ),
      ),
      Effect.mapError(cause =>
        cause instanceof IssueTrackerError
          ? cause
          : new IssueTrackerError({
              cause,
              operation: 'Fetch',
            }),
      ),
    ),
  save: issue =>
    store.saveIssue(makeInstantIssueRecord(issue)).pipe(
      Effect.mapError(
        cause =>
          new IssueTrackerError({
            cause,
            operation: 'Save',
          }),
      ),
    ),
})

/** Adapts the low-level Instant entity capability to the structured Logger. */
export const makeLogger = (
  store: InstantEntityStoreService,
): LoggerService => ({
  append: event =>
    store
      .appendLog(makeInstantLogRecord(event))
      .pipe(Effect.mapError(cause => new LoggerError({ cause }))),
})

/** Creates the low-level entity capability from a host-initialized database. */
export const makeInstantEntityStore = (
  database: InstantToolsDatabase,
): InstantEntityStoreService => ({
  appendLog: record =>
    Effect.tryPromise({
      try: () => {
        const entity = database.tx.instantToolsLogs[record.id]
        if (entity === undefined) {
          return Promise.reject(
            new Error('Instant log transaction entity was unavailable.'),
          )
        }
        return database
          .transact(
            entity.update({
              category: record.category,
              level: record.level,
              name: record.name,
              payloadJson: record.payloadJson,
              timestampMs: record.timestampMs,
            }),
          )
          .then(() => undefined)
      },
      catch: cause =>
        new InstantEntityStoreError({
          cause,
          operation: 'AppendLog',
        }),
    }),
  fetchIssues: Effect.tryPromise({
    try: async () => {
      const response = await database.queryOnce({
        instantToolsIssues: {},
      })
      return Array.map(response.data.instantToolsIssues, record =>
        S.decodeUnknownSync(InstantIssueRecord)(record),
      )
    },
    catch: cause =>
      new InstantEntityStoreError({
        cause,
        operation: 'FetchIssues',
      }),
  }),
  saveIssue: record =>
    Effect.tryPromise({
      try: () => {
        const entity = database.tx.instantToolsIssues[record.id]
        if (entity === undefined) {
          return Promise.reject(
            new Error('Instant Issue transaction entity was unavailable.'),
          )
        }
        return database
          .transact(
            entity.update({
              payloadJson: record.payloadJson,
              priority: record.priority,
              productId: record.productId,
              projectId: record.projectId,
              status: record.status,
              updatedAtMs: record.updatedAtMs,
            }),
          )
          .then(() => undefined)
      },
      catch: cause =>
        new InstantEntityStoreError({
          cause,
          operation: 'SaveIssue',
        }),
    }),
})

/** Provides both portable services from one host-initialized InstantDB client. */
export const makeInstantToolsLayer = (
  database: InstantToolsDatabase,
): Layer.Layer<IssueTracker | Logger> => {
  const store = makeInstantEntityStore(database)
  return Layer.merge(
    Layer.succeed(IssueTracker, makeIssueTracker(store)),
    Layer.succeed(Logger, makeLogger(store)),
  )
}
