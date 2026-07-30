import {
  Array,
  Cause,
  Data,
  Effect,
  Layer,
  Option,
  Queue,
  Schema as S,
  Stream,
} from 'effect'

import { InstantCoreDatabase, i } from '@instantdb/core'

import {
  Issue,
  type IssueQuery,
  IssueTracker,
  IssueTrackerError,
  type IssueTrackerService,
  ProductCatalog,
  ProductCatalogEntry,
  ProductCatalogError,
  type ProductCatalogService,
  RecordingSegment,
  TrackedProduct,
  TriageCandidate,
  TriageInbox,
  TriageInboxError,
  type TriageInboxService,
} from '../issues/index.js'
import {
  IssueLogEvidence,
  LogContributingPath,
  LogEvent,
  Logger,
  LoggerError,
  type LoggerService,
  withInferredIssueReferences,
} from '../logging/index.js'

const IssueJson = S.fromJsonString(Issue)
const LogEventJson = S.fromJsonString(LogEvent)
const LogContributingPathsJson = S.fromJsonString(S.Array(LogContributingPath))
const RecordingSegmentJson = S.fromJsonString(RecordingSegment)
const TriageCandidateJson = S.fromJsonString(TriageCandidate)

/** A queryable InstantDB envelope for one lossless portable Issue payload. */
export const InstantIssueRecord = S.Struct({
  attachmentCount: S.Number,
  attachmentIdsJson: S.String,
  id: S.String,
  issueID: S.String,
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
  logID: S.String,
  level: S.String,
  name: S.String,
  payloadJson: S.String,
  timestampMs: S.Number,
})
/** A queryable InstantDB envelope for one lossless structured Log Event. */
export type InstantLogRecord = typeof InstantLogRecord.Type

/** A denormalized, queryable link from one Log Event to one Issue. */
export const InstantLogIssueLinkRecord = S.Struct({
  category: S.String,
  contributingPathsJSON: S.String,
  id: S.String,
  issueID: S.String,
  level: S.String,
  logID: S.String,
  logNamespace: S.String,
  message: S.String,
  name: S.String,
  timestampMs: S.Number,
  viewerURL: S.String,
})
/** A denormalized, queryable link from one Log Event to one Issue. */
export type InstantLogIssueLinkRecord = typeof InstantLogIssueLinkRecord.Type

/** A queryable InstantDB envelope for one first-class Application or Library. */
export const InstantProductRecord = S.Struct({
  id: S.String,
  kind: S.Literals(['Application', 'Library']),
  name: S.String,
  updatedAtMs: S.Number,
})
/** A queryable InstantDB envelope for one first-class Application or Library. */
export type InstantProductRecord = typeof InstantProductRecord.Type

/** A queryable InstantDB envelope for one shareable Recording segment. */
export const InstantRecordingSegmentRecord = S.Struct({
  endMilliseconds: S.Number,
  id: S.String,
  payloadJson: S.String,
  recordingId: S.String,
  startMilliseconds: S.Number,
})
/** A queryable InstantDB envelope for one shareable Recording segment. */
export type InstantRecordingSegmentRecord =
  typeof InstantRecordingSegmentRecord.Type

/** A queryable InstantDB envelope for one transcript-derived draft. */
export const InstantTriageCandidateRecord = S.Struct({
  id: S.String,
  payloadJson: S.String,
  productId: S.String,
  recordingId: S.String,
  status: S.String,
  updatedAtMs: S.Number,
})
/** A queryable InstantDB envelope for one transcript-derived draft. */
export type InstantTriageCandidateRecord =
  typeof InstantTriageCandidateRecord.Type

/** The entity definitions a host can compose into its application schema. */
export const InstantToolsEntities = {
  instantToolsIssues: i.entity({
    attachmentCount: i.number().indexed(),
    attachmentIdsJson: i.string(),
    issueID: i.string().unique().indexed(),
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
    logID: i.string().unique().indexed(),
    name: i.string().indexed(),
    payloadJson: i.string(),
    timestampMs: i.number().indexed(),
  }),
  instantToolsLogIssueLinks: i.entity({
    category: i.string().indexed(),
    contributingPathsJSON: i.string(),
    issueID: i.string().indexed(),
    level: i.string().indexed(),
    logID: i.string().indexed(),
    logNamespace: i.string().indexed(),
    message: i.string(),
    name: i.string().indexed(),
    timestampMs: i.number().indexed(),
    viewerURL: i.string(),
  }),
  instantToolsCorrections: i.entity({
    agentScope: i.string().indexed(),
    fingerprint: i.string().indexed(),
    lastObservedAtMs: i.number().indexed(),
    occurrenceCount: i.number().indexed(),
    payloadJSON: i.string(),
    status: i.string().indexed(),
  }),
  instantToolsPreferences: i.entity({
    agentScope: i.string().indexed(),
    fingerprint: i.string().indexed(),
    lastObservedAtMs: i.number().indexed(),
    occurrenceCount: i.number().indexed(),
    payloadJSON: i.string(),
    status: i.string().indexed(),
  }),
  instantToolsProducts: i.entity({
    kind: i.string().indexed(),
    name: i.string().indexed(),
    updatedAtMs: i.number().indexed(),
  }),
  instantToolsRecordingSegments: i.entity({
    endMilliseconds: i.number().indexed(),
    payloadJson: i.string(),
    recordingId: i.string().indexed(),
    startMilliseconds: i.number().indexed(),
  }),
  instantToolsTriageCandidates: i.entity({
    payloadJson: i.string(),
    productId: i.string().indexed(),
    recordingId: i.string().indexed(),
    status: i.string().indexed(),
    updatedAtMs: i.number().indexed(),
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
  readonly operation:
    | 'AppendLog'
    | 'FetchIssues'
    | 'FetchProducts'
    | 'ObserveIssues'
    | 'ObserveIssue'
    | 'ObserveIssueLogs'
    | 'ObserveProducts'
    | 'ObserveRecordingSegment'
    | 'ObserveTriageCandidates'
    | 'SaveIssue'
    | 'SaveProduct'
    | 'SaveRecordingSegment'
    | 'SaveTriageCandidate'
}> {}

/** The minimal Instant entity capability consumed by both transport adapters. */
export type InstantEntityStoreService = Readonly<{
  appendLog: (
    record: InstantLogRecord,
    issueLinks: ReadonlyArray<InstantLogIssueLinkRecord>,
  ) => Effect.Effect<void, InstantEntityStoreError>
  fetchIssues: Effect.Effect<
    ReadonlyArray<InstantIssueRecord>,
    InstantEntityStoreError
  >
  fetchProducts: Effect.Effect<
    ReadonlyArray<InstantProductRecord>,
    InstantEntityStoreError
  >
  observeIssues: Stream.Stream<
    ReadonlyArray<InstantIssueRecord>,
    InstantEntityStoreError
  >
  observeIssue: (
    issueId: string,
  ) => Stream.Stream<Option.Option<InstantIssueRecord>, InstantEntityStoreError>
  observeIssueLogs: (
    issueId: string,
  ) => Stream.Stream<
    ReadonlyArray<InstantLogIssueLinkRecord>,
    InstantEntityStoreError
  >
  observeProducts: Stream.Stream<
    ReadonlyArray<InstantProductRecord>,
    InstantEntityStoreError
  >
  observeRecordingSegment: (
    segmentId: string,
  ) => Stream.Stream<
    Option.Option<InstantRecordingSegmentRecord>,
    InstantEntityStoreError
  >
  observeTriageCandidates: Stream.Stream<
    ReadonlyArray<InstantTriageCandidateRecord>,
    InstantEntityStoreError
  >
  saveIssue: (
    record: InstantIssueRecord,
  ) => Effect.Effect<void, InstantEntityStoreError>
  saveProduct: (
    record: InstantProductRecord,
  ) => Effect.Effect<void, InstantEntityStoreError>
  saveRecordingSegment: (
    record: InstantRecordingSegmentRecord,
  ) => Effect.Effect<void, InstantEntityStoreError>
  saveTriageCandidate: (
    record: InstantTriageCandidateRecord,
  ) => Effect.Effect<void, InstantEntityStoreError>
}>

/** Encodes one portable Issue into its queryable InstantDB envelope. */
export const makeInstantIssueRecord = (issue: Issue): InstantIssueRecord =>
  InstantIssueRecord.make({
    attachmentCount: Array.length(issue.attachments),
    attachmentIdsJson: JSON.stringify(
      Array.map(issue.attachments, attachment => attachment.id),
    ),
    id: issue.id,
    issueID: issue.id,
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

/** Encodes one catalog entry into its queryable InstantDB envelope. */
export const makeInstantProductRecord = (
  entry: ProductCatalogEntry,
): InstantProductRecord =>
  InstantProductRecord.make({
    id: entry.product.id,
    kind: entry.product._tag,
    name: entry.product.name,
    updatedAtMs: entry.updatedAtMs,
  })

/** Decodes one InstantDB product envelope into its portable catalog entry. */
export const decodeProductRecord = (
  record: InstantProductRecord,
): ProductCatalogEntry =>
  ProductCatalogEntry.make({
    product: S.decodeUnknownSync(TrackedProduct)({
      _tag: record.kind,
      id: record.id,
      name: record.name,
    }),
    updatedAtMs: record.updatedAtMs,
  })

/** Encodes one shareable Recording segment into its Instant envelope. */
export const makeInstantRecordingSegmentRecord = (
  segment: RecordingSegment,
): InstantRecordingSegmentRecord =>
  InstantRecordingSegmentRecord.make({
    endMilliseconds: segment.endMilliseconds,
    id: segment.id,
    payloadJson: S.encodeSync(RecordingSegmentJson)(segment),
    recordingId: segment.recordingId,
    startMilliseconds: segment.startMilliseconds,
  })

/** Decodes one Instant Recording segment envelope. */
export const decodeRecordingSegmentRecord = (
  record: InstantRecordingSegmentRecord,
): RecordingSegment =>
  S.decodeUnknownSync(RecordingSegmentJson)(record.payloadJson)

/** Encodes one transcript-derived triage draft into its Instant envelope. */
export const makeInstantTriageCandidateRecord = (
  candidate: TriageCandidate,
): InstantTriageCandidateRecord =>
  InstantTriageCandidateRecord.make({
    id: candidate.id,
    payloadJson: S.encodeSync(TriageCandidateJson)(candidate),
    productId: candidate.product.id,
    recordingId: candidate.segment.recordingId,
    status: candidate.status,
    updatedAtMs: candidate.updatedAtMs,
  })

/** Decodes one Instant triage draft envelope. */
export const decodeTriageCandidateRecord = (
  record: InstantTriageCandidateRecord,
): TriageCandidate =>
  S.decodeUnknownSync(TriageCandidateJson)(record.payloadJson)

/** Encodes one structured Log Event into its queryable InstantDB envelope. */
export const makeInstantLogRecord = (event: LogEvent): InstantLogRecord =>
  InstantLogRecord.make({
    category: event.category,
    id: event.id,
    logID: event.id,
    level: event.level,
    name: event.name,
    payloadJson: S.encodeSync(LogEventJson)(event),
    timestampMs: event.timestampMs,
  })

/** Decodes one InstantDB Log envelope into its portable domain value. */
export const decodeLogRecord = (record: InstantLogRecord): LogEvent =>
  S.decodeUnknownSync(LogEventJson)(record.payloadJson)

/** Encodes one inferred Issue reference as a denormalized evidence row. */
export const makeInstantLogIssueLinkRecords = (
  event: LogEvent,
): ReadonlyArray<InstantLogIssueLinkRecord> =>
  Array.map(event.issueReferences, reference =>
    InstantLogIssueLinkRecord.make({
      category: event.category,
      contributingPathsJSON: S.encodeSync(LogContributingPathsJson)(
        event.contributingPaths,
      ),
      id: `instantToolsLogs-${event.id}-issue-${reference.issueID}`,
      issueID: reference.issueID,
      level: event.level,
      logID: event.id,
      logNamespace: 'instantToolsLogs',
      message: event.message,
      name: event.name,
      timestampMs: event.timestampMs,
      viewerURL: reference.viewerURL,
    }),
  )

/** Decodes one queryable link row into Issue log evidence. */
export const decodeLogIssueLinkRecord = (
  record: InstantLogIssueLinkRecord,
): IssueLogEvidence =>
  IssueLogEvidence.make({
    category: record.category,
    contributingPaths: S.decodeUnknownSync(LogContributingPathsJson)(
      record.contributingPathsJSON,
    ),
    issueID: record.issueID,
    level: record.level,
    logID: record.logID,
    logNamespace: record.logNamespace,
    message: record.message,
    name: record.name,
    timestampMs: record.timestampMs,
    viewerURL: record.viewerURL,
  })

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
  observe: query =>
    store.observeIssues.pipe(
      Stream.map(records => Array.map(records, decodeIssueRecord)),
      Stream.map(issues =>
        Array.take(
          Array.filter(issues, issue => matchesQuery(issue, query)),
          Math.max(0, query.limit),
        ),
      ),
      Stream.mapError(
        cause =>
          new IssueTrackerError({
            cause,
            operation: 'Observe',
          }),
      ),
    ),
  observeIssue: issueId =>
    store.observeIssue(issueId).pipe(
      Stream.map(maybeRecord => Option.map(maybeRecord, decodeIssueRecord)),
      Stream.mapError(
        cause =>
          new IssueTrackerError({
            cause,
            operation: 'ObserveIssue',
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

/** Adapts the low-level Instant entity capability to the product catalog. */
export const makeProductCatalog = (
  store: InstantEntityStoreService,
): ProductCatalogService => ({
  fetch: store.fetchProducts.pipe(
    Effect.map(records => Array.map(records, decodeProductRecord)),
    Effect.mapError(
      cause => new ProductCatalogError({ cause, operation: 'Fetch' }),
    ),
  ),
  observe: store.observeProducts.pipe(
    Stream.map(records => Array.map(records, decodeProductRecord)),
    Stream.mapError(
      cause => new ProductCatalogError({ cause, operation: 'Observe' }),
    ),
  ),
  save: entry =>
    store
      .saveProduct(makeInstantProductRecord(entry))
      .pipe(
        Effect.mapError(
          cause => new ProductCatalogError({ cause, operation: 'Save' }),
        ),
      ),
})

/** Adapts the low-level Instant entity capability to transcript triage. */
export const makeTriageInbox = (
  store: InstantEntityStoreService,
): TriageInboxService => ({
  observeCandidates: store.observeTriageCandidates.pipe(
    Stream.map(records => Array.map(records, decodeTriageCandidateRecord)),
    Stream.mapError(
      cause => new TriageInboxError({ cause, operation: 'ObserveCandidates' }),
    ),
  ),
  observeSegment: segmentId =>
    store.observeRecordingSegment(segmentId).pipe(
      Stream.map(maybeRecord =>
        Option.map(maybeRecord, decodeRecordingSegmentRecord),
      ),
      Stream.mapError(
        cause => new TriageInboxError({ cause, operation: 'ObserveSegment' }),
      ),
    ),
  saveCandidate: candidate =>
    store
      .saveTriageCandidate(makeInstantTriageCandidateRecord(candidate))
      .pipe(
        Effect.mapError(
          cause => new TriageInboxError({ cause, operation: 'SaveCandidate' }),
        ),
      ),
  saveSegment: segment =>
    store
      .saveRecordingSegment(makeInstantRecordingSegmentRecord(segment))
      .pipe(
        Effect.mapError(
          cause => new TriageInboxError({ cause, operation: 'SaveSegment' }),
        ),
      ),
})

/** Adapts the low-level Instant entity capability to the structured Logger. */
export const makeLogger = (
  store: InstantEntityStoreService,
): LoggerService => ({
  append: event => {
    const taggedEvent = withInferredIssueReferences(event)
    return store
      .appendLog(
        makeInstantLogRecord(taggedEvent),
        makeInstantLogIssueLinkRecords(taggedEvent),
      )
      .pipe(Effect.mapError(cause => new LoggerError({ cause })))
  },
  observeIssue: issueId =>
    store.observeIssueLogs(issueId).pipe(
      Stream.map(records => Array.map(records, decodeLogIssueLinkRecord)),
      Stream.mapError(cause => new LoggerError({ cause })),
    ),
})

/** Creates the low-level entity capability from a host-initialized database. */
export const makeInstantEntityStore = (
  database: InstantToolsDatabase,
): InstantEntityStoreService => ({
  appendLog: (record, issueLinks) =>
    Effect.tryPromise({
      try: () => {
        const entity = database.tx.instantToolsLogs.lookup(
          'logID',
          record.logID,
        )
        if (entity === undefined) {
          return Promise.reject(
            new Error('Instant log transaction entity was unavailable.'),
          )
        }
        const logTransaction = entity.update({
          category: record.category,
          level: record.level,
          logID: record.logID,
          name: record.name,
          payloadJson: record.payloadJson,
          timestampMs: record.timestampMs,
        })
        const linkTransactions = Array.map(issueLinks, issueLink => {
          const linkEntity = database.tx.instantToolsLogIssueLinks[issueLink.id]
          if (linkEntity === undefined) {
            throw new Error(
              'Instant log Issue link transaction entity was unavailable.',
            )
          }
          return linkEntity.update({
            category: issueLink.category,
            contributingPathsJSON: issueLink.contributingPathsJSON,
            issueID: issueLink.issueID,
            level: issueLink.level,
            logID: issueLink.logID,
            logNamespace: issueLink.logNamespace,
            message: issueLink.message,
            name: issueLink.name,
            timestampMs: issueLink.timestampMs,
            viewerURL: issueLink.viewerURL,
          })
        })
        return database
          .transact([logTransaction, ...linkTransactions])
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
  fetchProducts: Effect.tryPromise({
    try: async () => {
      const response = await database.queryOnce({
        instantToolsProducts: {},
      })
      return Array.map(response.data.instantToolsProducts, record =>
        S.decodeUnknownSync(InstantProductRecord)(record),
      )
    },
    catch: cause =>
      new InstantEntityStoreError({
        cause,
        operation: 'FetchProducts',
      }),
  }),
  observeIssues: Stream.callback<
    ReadonlyArray<InstantIssueRecord>,
    InstantEntityStoreError
  >(queue =>
    Effect.acquireRelease(
      Effect.sync(() =>
        database.subscribeQuery({ instantToolsIssues: {} }, response => {
          if (response.error !== undefined) {
            Queue.failCauseUnsafe(
              queue,
              Cause.fail(
                new InstantEntityStoreError({
                  cause: response.error,
                  operation: 'ObserveIssues',
                }),
              ),
            )
          } else {
            try {
              Queue.offerUnsafe(
                queue,
                Array.map(response.data.instantToolsIssues, record =>
                  S.decodeUnknownSync(InstantIssueRecord)(record),
                ),
              )
            } catch (cause) {
              Queue.failCauseUnsafe(
                queue,
                Cause.fail(
                  new InstantEntityStoreError({
                    cause,
                    operation: 'ObserveIssues',
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
  observeIssue: issueId =>
    Stream.callback<Option.Option<InstantIssueRecord>, InstantEntityStoreError>(
      queue =>
        Effect.acquireRelease(
          Effect.sync(() =>
            database.subscribeQuery(
              {
                instantToolsIssues: {
                  $: { where: { issueID: issueId } },
                },
              },
              response => {
                if (response.error !== undefined) {
                  Queue.failCauseUnsafe(
                    queue,
                    Cause.fail(
                      new InstantEntityStoreError({
                        cause: response.error,
                        operation: 'ObserveIssue',
                      }),
                    ),
                  )
                } else {
                  try {
                    Queue.offerUnsafe(
                      queue,
                      Option.map(
                        Array.head(response.data.instantToolsIssues),
                        record =>
                          S.decodeUnknownSync(InstantIssueRecord)(record),
                      ),
                    )
                  } catch (cause) {
                    Queue.failCauseUnsafe(
                      queue,
                      Cause.fail(
                        new InstantEntityStoreError({
                          cause,
                          operation: 'ObserveIssue',
                        }),
                      ),
                    )
                  }
                }
              },
            ),
          ),
          unsubscribe => Effect.sync(unsubscribe),
        ).pipe(Effect.flatMap(() => Effect.never)),
    ),
  observeIssueLogs: issueId =>
    Stream.callback<
      ReadonlyArray<InstantLogIssueLinkRecord>,
      InstantEntityStoreError
    >(queue =>
      Effect.acquireRelease(
        Effect.sync(() =>
          database.subscribeQuery(
            {
              instantToolsLogIssueLinks: {
                $: {
                  where: { issueID: issueId },
                  order: { timestampMs: 'desc' },
                  limit: 200,
                },
              },
            },
            response => {
              if (response.error !== undefined) {
                Queue.failCauseUnsafe(
                  queue,
                  Cause.fail(
                    new InstantEntityStoreError({
                      cause: response.error,
                      operation: 'ObserveIssueLogs',
                    }),
                  ),
                )
              } else {
                try {
                  Queue.offerUnsafe(
                    queue,
                    Array.map(response.data.instantToolsLogIssueLinks, record =>
                      S.decodeUnknownSync(InstantLogIssueLinkRecord)(record),
                    ),
                  )
                } catch (cause) {
                  Queue.failCauseUnsafe(
                    queue,
                    Cause.fail(
                      new InstantEntityStoreError({
                        cause,
                        operation: 'ObserveIssueLogs',
                      }),
                    ),
                  )
                }
              }
            },
          ),
        ),
        unsubscribe => Effect.sync(unsubscribe),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
  observeProducts: Stream.callback<
    ReadonlyArray<InstantProductRecord>,
    InstantEntityStoreError
  >(queue =>
    Effect.acquireRelease(
      Effect.sync(() =>
        database.subscribeQuery({ instantToolsProducts: {} }, response => {
          if (response.error !== undefined) {
            Queue.failCauseUnsafe(
              queue,
              Cause.fail(
                new InstantEntityStoreError({
                  cause: response.error,
                  operation: 'ObserveProducts',
                }),
              ),
            )
          } else {
            try {
              Queue.offerUnsafe(
                queue,
                Array.map(response.data.instantToolsProducts, record =>
                  S.decodeUnknownSync(InstantProductRecord)(record),
                ),
              )
            } catch (cause) {
              Queue.failCauseUnsafe(
                queue,
                Cause.fail(
                  new InstantEntityStoreError({
                    cause,
                    operation: 'ObserveProducts',
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
  observeRecordingSegment: segmentId =>
    Stream.callback<
      Option.Option<InstantRecordingSegmentRecord>,
      InstantEntityStoreError
    >(queue =>
      Effect.acquireRelease(
        Effect.sync(() =>
          database.subscribeQuery(
            {
              instantToolsRecordingSegments: {
                $: { where: { id: segmentId } },
              },
            },
            response => {
              if (response.error !== undefined) {
                Queue.failCauseUnsafe(
                  queue,
                  Cause.fail(
                    new InstantEntityStoreError({
                      cause: response.error,
                      operation: 'ObserveRecordingSegment',
                    }),
                  ),
                )
              } else {
                try {
                  Queue.offerUnsafe(
                    queue,
                    Option.map(
                      Array.head(response.data.instantToolsRecordingSegments),
                      record =>
                        S.decodeUnknownSync(InstantRecordingSegmentRecord)(
                          record,
                        ),
                    ),
                  )
                } catch (cause) {
                  Queue.failCauseUnsafe(
                    queue,
                    Cause.fail(
                      new InstantEntityStoreError({
                        cause,
                        operation: 'ObserveRecordingSegment',
                      }),
                    ),
                  )
                }
              }
            },
          ),
        ),
        unsubscribe => Effect.sync(unsubscribe),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
  observeTriageCandidates: Stream.callback<
    ReadonlyArray<InstantTriageCandidateRecord>,
    InstantEntityStoreError
  >(queue =>
    Effect.acquireRelease(
      Effect.sync(() =>
        database.subscribeQuery(
          { instantToolsTriageCandidates: {} },
          response => {
            if (response.error !== undefined) {
              Queue.failCauseUnsafe(
                queue,
                Cause.fail(
                  new InstantEntityStoreError({
                    cause: response.error,
                    operation: 'ObserveTriageCandidates',
                  }),
                ),
              )
            } else {
              try {
                Queue.offerUnsafe(
                  queue,
                  Array.map(
                    response.data.instantToolsTriageCandidates,
                    record =>
                      S.decodeUnknownSync(InstantTriageCandidateRecord)(record),
                  ),
                )
              } catch (cause) {
                Queue.failCauseUnsafe(
                  queue,
                  Cause.fail(
                    new InstantEntityStoreError({
                      cause,
                      operation: 'ObserveTriageCandidates',
                    }),
                  ),
                )
              }
            }
          },
        ),
      ),
      unsubscribe => Effect.sync(unsubscribe),
    ).pipe(Effect.flatMap(() => Effect.never)),
  ),
  saveIssue: record =>
    Effect.tryPromise({
      try: () => {
        const entity = database.tx.instantToolsIssues.lookup(
          'issueID',
          record.issueID,
        )
        if (entity === undefined) {
          return Promise.reject(
            new Error('Instant Issue transaction entity was unavailable.'),
          )
        }
        return database
          .transact(
            entity.update({
              attachmentCount: record.attachmentCount,
              attachmentIdsJson: record.attachmentIdsJson,
              issueID: record.issueID,
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
  saveProduct: record =>
    Effect.tryPromise({
      try: () => {
        const entity = database.tx.instantToolsProducts[record.id]
        if (entity === undefined) {
          return Promise.reject(
            new Error('Instant product transaction entity was unavailable.'),
          )
        }
        return database
          .transact(
            entity.update({
              kind: record.kind,
              name: record.name,
              updatedAtMs: record.updatedAtMs,
            }),
          )
          .then(() => undefined)
      },
      catch: cause =>
        new InstantEntityStoreError({
          cause,
          operation: 'SaveProduct',
        }),
    }),
  saveRecordingSegment: record =>
    Effect.tryPromise({
      try: () => {
        const entity = database.tx.instantToolsRecordingSegments[record.id]
        if (entity === undefined) {
          return Promise.reject(
            new Error(
              'Instant Recording segment transaction entity was unavailable.',
            ),
          )
        }
        return database
          .transact(
            entity.update({
              endMilliseconds: record.endMilliseconds,
              payloadJson: record.payloadJson,
              recordingId: record.recordingId,
              startMilliseconds: record.startMilliseconds,
            }),
          )
          .then(() => undefined)
      },
      catch: cause =>
        new InstantEntityStoreError({
          cause,
          operation: 'SaveRecordingSegment',
        }),
    }),
  saveTriageCandidate: record =>
    Effect.tryPromise({
      try: () => {
        const entity = database.tx.instantToolsTriageCandidates[record.id]
        if (entity === undefined) {
          return Promise.reject(
            new Error(
              'Instant triage candidate transaction entity was unavailable.',
            ),
          )
        }
        return database
          .transact(
            entity.update({
              payloadJson: record.payloadJson,
              productId: record.productId,
              recordingId: record.recordingId,
              status: record.status,
              updatedAtMs: record.updatedAtMs,
            }),
          )
          .then(() => undefined)
      },
      catch: cause =>
        new InstantEntityStoreError({
          cause,
          operation: 'SaveTriageCandidate',
        }),
    }),
})

/** Provides all portable services from one host-initialized InstantDB client. */
export const makeInstantToolsLayer = (
  database: InstantToolsDatabase,
): Layer.Layer<IssueTracker | Logger | ProductCatalog | TriageInbox> => {
  const store = makeInstantEntityStore(database)
  return Layer.mergeAll(
    Layer.succeed(IssueTracker, makeIssueTracker(store)),
    Layer.succeed(Logger, makeLogger(store)),
    Layer.succeed(ProductCatalog, makeProductCatalog(store)),
    Layer.succeed(TriageInbox, makeTriageInbox(store)),
  )
}
