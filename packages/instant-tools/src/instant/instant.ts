import {
  Array,
  Cause,
  Clock,
  Data,
  Effect,
  Layer,
  Match as M,
  Option,
  Queue,
  Random,
  Result,
  Schema as S,
  Stream,
} from 'effect'
import { v4 as uuidV4, v5 as uuidV5 } from 'uuid'

import { InstantCoreDatabase, i } from '@instantdb/core'

import {
  Issue,
  type IssueChange,
  IssueNewestFirst,
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
  nextIssueId,
  normalizeIssueId,
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

/**
 * A queryable InstantDB envelope for one first-class Application or Library.
 * `id` is the row's UUID and `productId` the product's own id, such as
 * `acaga`, because Instant takes only UUIDs as row ids.
 */
export const InstantProductRecord = S.Struct({
  id: S.String,
  kind: S.Literals(['Application', 'Library']),
  name: S.String,
  productId: S.String,
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
    productId: i.string().unique().indexed(),
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
  instantToolsAgentQueueMessages: i.entity({
    agentId: i.string().indexed(),
    createdAtMs: i.number().indexed(),
    leftoverId: i.string().indexed(),
    kind: i.string().indexed(),
    payloadJson: i.string(),
  }),
}

/** Transient leftover presence rooms and the queuePing topic. */
export const InstantToolsRooms = {
  leftover: {
    presence: i.entity({
      agentId: i.string(),
      leftoverId: i.string(),
      origin: i.string(),
      role: i.string(),
    }),
    topics: {
      queuePing: i.entity({
        agentId: i.string(),
        leftoverId: i.string(),
        queueMessageId: i.string(),
      }),
    },
  },
}

/** A complete InstantDB schema for hosts using only the Instant Tools entities. */
export const InstantToolsSchema = i.schema({
  entities: InstantToolsEntities,
  rooms: InstantToolsRooms,
})

/**
 * The Instant Tools schema with the files uploaded for each Issue: Instant's
 * own `$files` and the `issueFiles` link, `instantToolsIssues.files` to
 * `$files.issues`, as the tracker's server holds them. The tracker's hosts
 * read an Issue's pictures through it; a host that composes
 * `InstantToolsEntities` into its own schema needs neither.
 */
export const InstantToolsSchemaWithFiles = i.schema({
  entities: {
    ...InstantToolsEntities,
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
  },
  links: {
    issueFiles: {
      forward: { on: 'instantToolsIssues', has: 'many', label: 'files' },
      reverse: { on: '$files', has: 'many', label: 'issues' },
    },
  },
  rooms: InstantToolsRooms,
})

/** An InstantDB client initialized with `InstantToolsSchemaWithFiles`. */
export type InstantToolsDatabaseWithFiles = InstantCoreDatabase<
  typeof InstantToolsSchemaWithFiles
>

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
    | 'CreateIssue'
    | 'DeleteIssue'
    | 'FetchIssueIds'
    | 'FetchIssueRecords'
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

/**
 * Instant refused an Issue write that named the `updatedAtMs` it was read at:
 * the row moved since, or the writer may not write it. Reading the row again
 * tells the two apart.
 */
export class IssueWriteRefused extends Data.TaggedError('IssueWriteRefused')<{
  readonly cause: unknown
  readonly expectedUpdatedAtMs: number
  readonly issueID: string
}> {}

/**
 * Instant only queued an Issue write, because the client was offline: nothing
 * is confirmed. It is sent when the client reconnects, and its rule refuses it
 * then if the Issue changed first.
 */
export class IssueWriteQueued extends Data.TaggedError('IssueWriteQueued')<{
  readonly issueID: string
}> {}

/** The minimal Instant entity capability consumed by both transport adapters. */
export type InstantEntityStoreService = Readonly<{
  appendLog: (
    record: InstantLogRecord,
    issueLinks: ReadonlyArray<InstantLogIssueLinkRecord>,
  ) => Effect.Effect<void, InstantEntityStoreError>
  /** Reads the Issues in `statuses`, or every Issue when it is empty. */
  fetchIssues: (
    statuses: IssueQuery['statuses'],
  ) => Effect.Effect<ReadonlyArray<InstantIssueRecord>, InstantEntityStoreError>
  fetchProducts: Effect.Effect<
    ReadonlyArray<InstantProductRecord>,
    InstantEntityStoreError
  >
  /** Observes the Issues in `statuses`, or every Issue when it is empty. */
  observeIssues: (
    statuses: IssueQuery['statuses'],
  ) => Stream.Stream<ReadonlyArray<InstantIssueRecord>, InstantEntityStoreError>
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
  /**
   * Writes one Issue's row. With `maybeExpectedUpdatedAtMs`, the write names
   * the `updatedAtMs` it was read at, Instant's rule refuses it when the row
   * moved since (`IssueWriteRefused`), and the row takes `record.updatedAtMs`
   * as given; without it, the row is marked changed now.
   */
  saveIssue: (
    record: InstantIssueRecord,
    maybeExpectedUpdatedAtMs: Option.Option<number>,
  ) => Effect.Effect<
    void,
    InstantEntityStoreError | IssueWriteQueued | IssueWriteRefused
  >
  /**
   * Reads only the Issue numbers in use, of the Issues in `statuses`, or of
   * every Issue when it is empty.
   */
  fetchIssueIds: (
    statuses: IssueQuery['statuses'],
  ) => Effect.Effect<ReadonlyArray<string>, InstantEntityStoreError>
  /**
   * Reads every record stored under one Issue number from the server, never
   * from a copy a live query keeps on this client. A record read back carries
   * its Instant entity id in `id`; two records mean the number is taken twice.
   */
  fetchIssueRecordsById: (
    issueId: string,
  ) => Effect.Effect<ReadonlyArray<InstantIssueRecord>, InstantEntityStoreError>
  /**
   * Creates one Issue record under a fresh entity id and returns that id. It
   * never writes over a stored record; Instant refuses a taken `issueID`.
   */
  createIssue: (
    record: InstantIssueRecord,
  ) => Effect.Effect<string, InstantEntityStoreError>
  /** Deletes one Issue record by its Instant entity id. */
  deleteIssue: (
    entityId: string,
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

const StoredIssuePayload = S.fromJsonString(S.Record(S.String, S.Unknown))

const ListItem = S.Record(S.String, S.Unknown).check(
  S.makeFilter(item => typeof item['id'] === 'string'),
)
type ListItem = typeof ListItem.Type

const listItemsOf = (value: unknown): Option.Option<ReadonlyArray<ListItem>> =>
  S.decodeUnknownOption(S.Array(ListItem))(value)

/**
 * The items of one list the change wrote, each over the stored item with its
 * id: the change decides which items there are and every key it writes, and a
 * key only the stored item holds stays, such as a criterion's `evidence`.
 */
const listOver = (
  written: ReadonlyArray<ListItem>,
  stored: ReadonlyArray<ListItem>,
): ReadonlyArray<ListItem> => {
  const storedById = new Map(Array.map(stored, item => [item['id'], item]))
  return Array.map(written, item => {
    const maybeStored = Option.fromUndefinedOr(storedById.get(item['id']))
    return Option.match(maybeStored, {
      onNone: () => item,
      onSome: storedItem => ({ ...storedItem, ...item }),
    })
  })
}

/**
 * Encodes one Issue over the payload already stored for it, so keys the Issue
 * schema does not model survive a save. A stored payload that holds
 * `relatedIssueIds: ['147']` keeps it when a Client changes the Issue's status.
 * Stored payloads carry `relatedIssueIds` and `files` that a plain re-encode
 * would drop (#591). The same holds one level down, inside each item of a
 * list keyed by `id`: a criterion that holds `evidence: ['runs/check.json']`
 * keeps it when a Client marks it satisfied, and an item the change removes
 * goes with all it held.
 */
export const makeInstantIssueRecordOver = (
  issue: Issue,
  maybeStoredRecord: Option.Option<InstantIssueRecord>,
): InstantIssueRecord => {
  const record = makeInstantIssueRecord(issue)
  const maybeStoredPayload = Option.flatMap(maybeStoredRecord, storedRecord =>
    S.decodeUnknownOption(StoredIssuePayload)(storedRecord.payloadJson),
  )
  if (Option.isSome(maybeStoredPayload)) {
    const storedPayload = maybeStoredPayload.value
    const written: Record<string, unknown> = S.encodeSync(Issue)(issue)
    const lists = Object.fromEntries(
      Array.getSomes(
        Array.map(Object.entries(written), ([key, value]) =>
          Option.flatMap(listItemsOf(value), writtenItems =>
            Option.map(listItemsOf(storedPayload[key]), storedItems => [
              key,
              listOver(writtenItems, storedItems),
            ]),
          ),
        ),
      ),
    )
    return InstantIssueRecord.make({
      ...record,
      payloadJson: JSON.stringify({
        ...storedPayload,
        ...written,
        ...lists,
      }),
    })
  } else {
    return record
  }
}

/** Decodes one InstantDB Issue envelope into its portable domain value. */
export const decodeIssueRecord = (record: InstantIssueRecord): Issue =>
  S.decodeUnknownSync(IssueJson)(record.payloadJson)

const reportIssueDecodeFailure = (issueID: string, cause: unknown): void => {
  const reason = cause instanceof Error ? cause.message : String(cause)
  const error = new Error(`Issue ${issueID} could not be decoded: ${reason}`, {
    cause,
  })
  try {
    if (typeof globalThis.reportError === 'function') {
      globalThis.reportError(error)
    }
  } catch {
    return
  }
}

/** One decoded Issue and the stored payload it was decoded from. */
type DecodedIssueRecord = Readonly<{ payloadJson: string; issue: Issue }>

/**
 * The Issues one catalog snapshot decoded, by stored record id. The next
 * snapshot reuses each Issue whose payload text is unchanged, so a change to
 * Issue 1358 decodes Issue 1358 and keeps the other Issues as they were.
 */
export type DecodedIssueCatalog = ReadonlyMap<string, DecodedIssueRecord>

/** The catalog before any snapshot was decoded. */
export const emptyDecodedIssueCatalog: DecodedIssueCatalog = new Map()

/**
 * Decodes a catalog snapshot over the previous one, keeping readable Issues
 * when one payload is stale. An unchanged payload keeps its earlier Issue
 * value, so readers can tell an unchanged Issue by identity.
 */
export const decodeIssueRecordsOver = (
  previous: DecodedIssueCatalog,
  records: ReadonlyArray<InstantIssueRecord>,
): readonly [DecodedIssueCatalog, ReadonlyArray<Issue>] => {
  const next = new Map<string, DecodedIssueRecord>()
  const decodeOne = (record: InstantIssueRecord): Option.Option<Issue> => {
    const maybePrevious = Option.fromUndefinedOr(previous.get(record.id))
    if (
      Option.isSome(maybePrevious) &&
      maybePrevious.value.payloadJson === record.payloadJson
    ) {
      next.set(record.id, maybePrevious.value)
      return Option.some(maybePrevious.value.issue)
    }
    try {
      const issue = decodeIssueRecord(record)
      next.set(record.id, { payloadJson: record.payloadJson, issue })
      return Option.some(issue)
    } catch (cause) {
      reportIssueDecodeFailure(record.issueID, cause)
      return Option.none()
    }
  }
  const issues = Array.getSomes(Array.map(records, decodeOne))
  if (
    Array.isReadonlyArrayEmpty(issues) &&
    Array.isReadonlyArrayNonEmpty(records)
  ) {
    return [next, Array.map(records, decodeIssueRecord)]
  }
  return [next, issues]
}

/** Decodes a catalog snapshot, keeping readable Issues when one payload is stale. */
export const decodeIssueRecords = (
  records: ReadonlyArray<InstantIssueRecord>,
): ReadonlyArray<Issue> =>
  decodeIssueRecordsOver(emptyDecodedIssueCatalog, records)[1]

/**
 * Derives the one Instant row UUID for a product id: `acaga` is always
 * `a07f9008-c1d6-5f59-a814-5d0d9ccfde0e`, so saving a product again updates
 * its row instead of adding a second one.
 */
export const makeInstantProductID = (productId: string): string =>
  uuidV5(`instantToolsProducts/${productId}`, uuidV5.URL)

/** Encodes one catalog entry into its queryable InstantDB envelope. */
export const makeInstantProductRecord = (
  entry: ProductCatalogEntry,
): InstantProductRecord =>
  InstantProductRecord.make({
    id: makeInstantProductID(entry.product.id),
    kind: entry.product._tag,
    name: entry.product.name,
    productId: entry.product.id,
    updatedAtMs: entry.updatedAtMs,
  })

/** Decodes one InstantDB product envelope into its portable catalog entry. */
export const decodeProductRecord = (
  record: InstantProductRecord,
): ProductCatalogEntry =>
  ProductCatalogEntry.make({
    product: S.decodeUnknownSync(TrackedProduct)({
      _tag: record.kind,
      id: record.productId,
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

/** Derives one stable Instant entity UUID for a Log Event and Issue pair. */
export const makeInstantLogIssueLinkID = (
  logID: string,
  issueID: string,
): string => uuidV5(`instantToolsLogs/${logID}/issues/${issueID}`, uuidV5.URL)

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
      id: makeInstantLogIssueLinkID(event.id, reference.issueID),
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

const maximumFilingAttempts = 5

/**
 * How many times one change is written before it fails: 12, so 12 agents
 * logging on one Issue at once each land, however they interleave.
 */
const maximumWriteAttempts = 12

/**
 * How an Issue write waits, in milliseconds. `settleMs` passes between a
 * write and the read that checks it landed: Instant judges each write's rule
 * against the row as it stood when the transaction began, so two transactions
 * that overlap both pass it, and the later one commits a few milliseconds after
 * the earlier. `retryMs` is the first wait before a write is tried again; it
 * doubles with each try, jittered, so writers that met do not meet again.
 */
export type IssueWriteTiming = Readonly<{ retryMs: number; settleMs: number }>

/** The timing every live Client uses: a 300 ms settle, retries from 120 ms. */
export const defaultIssueWriteTiming: IssueWriteTiming = {
  retryMs: 120,
  settleMs: 300,
}

const MAXIMUM_RETRY_MS = 2_000

const waitFor = (ms: number): Effect.Effect<void> =>
  ms > 0 ? Effect.sleep(ms) : Effect.void

const backOff = (
  timing: IssueWriteTiming,
  attempt: number,
): Effect.Effect<void> =>
  Effect.flatMap(Random.nextBetween(0.5, 1.5), jitter =>
    waitFor(
      Math.round(
        Math.min(MAXIMUM_RETRY_MS, timing.retryMs * 2 ** (attempt - 1)) *
          jitter,
      ),
    ),
  )

/**
 * Whether a change leaves an Issue as it was, whatever it did to `updatedAtMs`:
 * setting a status it already has, or releasing a claim no one holds, writes
 * nothing.
 */
const isSameIssueBut = (changed: Issue, current: Issue): boolean =>
  S.encodeSync(IssueJson)(
    Issue.make({ ...changed, updatedAtMs: current.updatedAtMs }),
  ) === S.encodeSync(IssueJson)(current)

/**
 * The `updatedAtMs` a write gives its Issue: past the stored row's, past now,
 * and never behind what the change set, so every write moves it and a read
 * from before the write can never match the row again.
 */
const writeStampOf = (
  stored: InstantIssueRecord,
  changed: Issue,
  nowMs: number,
): number => Math.max(nowMs, stored.updatedAtMs + 1, changed.updatedAtMs)

type IssueTrackerOperation = IssueTrackerError['operation']

const storedIssueId = (issueId: string): string =>
  Option.getOrElse(normalizeIssueId(issueId), () => issueId.trim())

const failIssueTracker = (
  operation: IssueTrackerOperation,
  message: string,
): Effect.Effect<never, IssueTrackerError> =>
  Effect.fail(new IssueTrackerError({ cause: new Error(message), operation }))

const issueRecordsFor = (
  store: InstantEntityStoreService,
  operation: IssueTrackerOperation,
  issueId: string,
): Effect.Effect<ReadonlyArray<InstantIssueRecord>, IssueTrackerError> =>
  store
    .fetchIssueRecordsById(issueId)
    .pipe(Effect.mapError(cause => new IssueTrackerError({ cause, operation })))

const duplicateAdvice = (operation: IssueTrackerOperation): string =>
  operation === 'Delete'
    ? 'delete one by hand after reading both.'
    : 'resolve the duplicate before changing it.'

const singleIssueRecord = (
  store: InstantEntityStoreService,
  operation: IssueTrackerOperation,
  issueId: string,
): Effect.Effect<InstantIssueRecord, IssueTrackerError> =>
  issueRecordsFor(store, operation, issueId).pipe(
    Effect.flatMap(records =>
      Array.match(records, {
        onEmpty: () =>
          failIssueTracker(operation, `Issue ${issueId} does not exist.`),
        onNonEmpty: nonEmptyRecords => {
          const [record] = nonEmptyRecords
          if (nonEmptyRecords.length === 1) {
            return Effect.succeed(record)
          }
          const entityIds = Array.join(
            Array.map(nonEmptyRecords, stored => stored.id),
            ', ',
          )
          return failIssueTracker(
            operation,
            `Issue ${issueId} is held by ${nonEmptyRecords.length} records (${entityIds}); ${duplicateAdvice(operation)}`,
          )
        },
      }),
    ),
  )

const decodeStoredIssue = (
  operation: IssueTrackerOperation,
  record: InstantIssueRecord,
): Effect.Effect<Issue, IssueTrackerError> =>
  Effect.try({
    try: () => decodeIssueRecord(record),
    catch: cause =>
      new IssueTrackerError({
        cause: new Error(`Issue ${record.issueID} could not be read`, {
          cause,
        }),
        operation,
      }),
  })

const fileIssue = (
  store: InstantEntityStoreService,
  makeIssue: (issueId: string) => Issue,
  attemptsLeft: number,
  takenIssueIds: ReadonlyArray<string>,
): Effect.Effect<Issue, IssueTrackerError> =>
  Effect.gen(function* () {
    if (attemptsLeft <= 0) {
      return yield* failIssueTracker(
        'File',
        `No free Issue number after ${maximumFilingAttempts} attempts; other writers took ${Array.join(takenIssueIds, ', ')} while this one was filing.`,
      )
    }
    const storedIds = yield* store
      .fetchIssueIds([])
      .pipe(
        Effect.mapError(
          cause => new IssueTrackerError({ cause, operation: 'File' }),
        ),
      )
    const issueId = nextIssueId([...storedIds, ...takenIssueIds])
    const issue = makeIssue(issueId)
    if (issue.id !== issueId) {
      return yield* failIssueTracker(
        'File',
        `The new Issue was built as ${issue.id}, not under the free number ${issueId}.`,
      )
    }
    const created = yield* Effect.result(
      store.createIssue(makeInstantIssueRecord(issue)),
    )
    if (Result.isFailure(created)) {
      const holders = yield* issueRecordsFor(store, 'File', issueId)
      if (Array.isReadonlyArrayEmpty(holders)) {
        return yield* Effect.fail(
          new IssueTrackerError({ cause: created.failure, operation: 'File' }),
        )
      }
      return yield* fileIssue(store, makeIssue, attemptsLeft - 1, [
        ...takenIssueIds,
        issueId,
      ])
    }
    const entityId = created.success
    const holders = yield* store.fetchIssueRecordsById(issueId).pipe(
      Effect.mapError(
        cause =>
          new IssueTrackerError({
            cause: new Error(
              `Issue ${issueId} was created as entity ${entityId}, but reading it back failed, so check Issue ${issueId} before filing it again`,
              { cause },
            ),
            operation: 'File',
          }),
      ),
    )
    if (!Array.some(holders, record => record.id === entityId)) {
      return yield* failIssueTracker(
        'File',
        `Issue ${issueId} was created as entity ${entityId} but does not read back.`,
      )
    }
    if (holders.length === 1) {
      return issue
    }
    yield* store
      .deleteIssue(entityId)
      .pipe(
        Effect.mapError(
          cause => new IssueTrackerError({ cause, operation: 'File' }),
        ),
      )
    return yield* fileIssue(store, makeIssue, attemptsLeft - 1, [
      ...takenIssueIds,
      issueId,
    ])
  })

const refusedAlthoughCurrent = (
  issueId: string,
  record: InstantIssueRecord,
): string =>
  `Issue ${issueId}: Instant refused the write although the Issue had not changed since it was read (updatedAtMs ${record.updatedAtMs}); only the tracker's owner may write it, so check who this writer is signed in as.`

const queuedOffline = (issueId: string): string =>
  `Issue ${issueId}: offline, so the write was only queued. Instant sends it when this client reconnects and refuses it then if Issue ${issueId} changed first. Nothing is confirmed.`

/**
 * Writes one change over the Issue as the server holds it. The write names
 * the `updatedAtMs` it read, so Instant refuses it when another writer moved
 * the row since: then it reads again and applies the change to what it finds.
 * After a write it waits `timing.settleMs` and reads again, because a
 * transaction that overlapped this one passed the same rule and may have
 * written over it; a change it no longer finds is applied again. A refusal on
 * a row that did not move is not a stale read and fails at once.
 */
const updateIssue = (
  store: InstantEntityStoreService,
  issueId: string,
  change: IssueChange,
  timing: IssueWriteTiming,
): Effect.Effect<Issue, IssueTrackerError> => {
  const attempt = (
    record: InstantIssueRecord,
    attemptNumber: number,
  ): Effect.Effect<Issue, IssueTrackerError> =>
    Effect.gen(function* () {
      const current = yield* decodeStoredIssue('Update', record)
      const nowMs = yield* Clock.currentTimeMillis
      const changed = change.apply(current)
      if (isSameIssueBut(changed, current)) {
        return change.hasLanded(current)
          ? current
          : yield* failIssueTracker(
              'Update',
              `Issue ${issueId}: the change changes nothing, and the stored Issue still reads without it.`,
            )
      }
      const next = Issue.make({
        ...changed,
        updatedAtMs: writeStampOf(record, changed, nowMs),
      })
      const written = yield* Effect.result(
        store.saveIssue(
          makeInstantIssueRecordOver(next, Option.some(record)),
          Option.some(record.updatedAtMs),
        ),
      )
      if (Result.isFailure(written)) {
        return yield* M.value(written.failure).pipe(
          M.tagsExhaustive({
            InstantEntityStoreError: cause =>
              Effect.fail(
                new IssueTrackerError({ cause, operation: 'Update' }),
              ),
            IssueWriteQueued: () =>
              failIssueTracker('Update', queuedOffline(issueId)),
            IssueWriteRefused: () =>
              Effect.gen(function* () {
                const reread = yield* singleIssueRecord(
                  store,
                  'Update',
                  issueId,
                )
                if (reread.updatedAtMs === record.updatedAtMs) {
                  return yield* failIssueTracker(
                    'Update',
                    refusedAlthoughCurrent(issueId, record),
                  )
                }
                if (attemptNumber >= maximumWriteAttempts) {
                  return yield* failIssueTracker(
                    'Update',
                    `Issue ${issueId} changed under every one of ${maximumWriteAttempts} writes; the last was based on updatedAtMs ${record.updatedAtMs} while Instant held ${reread.updatedAtMs}. Nothing was written.`,
                  )
                }
                yield* backOff(timing, attemptNumber)
                return yield* attempt(reread, attemptNumber + 1)
              }),
          }),
        )
      }
      yield* waitFor(timing.settleMs)
      const settled = yield* singleIssueRecord(store, 'Update', issueId)
      const stored = yield* decodeStoredIssue('Update', settled)
      if (change.hasLanded(stored)) {
        return stored
      }
      if (attemptNumber >= maximumWriteAttempts) {
        return yield* failIssueTracker(
          'Update',
          `Issue ${issueId}: the change did not land after ${maximumWriteAttempts} writes; the stored Issue still reads without it.`,
        )
      }
      yield* backOff(timing, attemptNumber)
      return yield* attempt(settled, attemptNumber + 1)
    })
  return singleIssueRecord(store, 'Update', issueId).pipe(
    Effect.flatMap(record => attempt(record, 1)),
  )
}

/**
 * Saves a whole Issue over the row the server holds, refusing to write over a
 * row that moved after it was read: a whole Issue built elsewhere cannot be
 * applied again to a newer one without losing what that one holds.
 */
const saveWholeIssue = (
  store: InstantEntityStoreService,
  issue: Issue,
): Effect.Effect<void, IssueTrackerError> =>
  Effect.gen(function* () {
    const records = yield* issueRecordsFor(store, 'Save', issue.id)
    const maybeStoredRecord = Array.head(records)
    const nowMs = yield* Clock.currentTimeMillis
    const stamped = Option.match(maybeStoredRecord, {
      onNone: () => issue,
      onSome: record =>
        Issue.make({
          ...issue,
          updatedAtMs: writeStampOf(record, issue, nowMs),
        }),
    })
    yield* store
      .saveIssue(
        makeInstantIssueRecordOver(stamped, maybeStoredRecord),
        Option.map(maybeStoredRecord, record => record.updatedAtMs),
      )
      .pipe(
        Effect.mapError(cause =>
          M.value(cause).pipe(
            M.tagsExhaustive({
              InstantEntityStoreError: storeError =>
                new IssueTrackerError({ cause: storeError, operation: 'Save' }),
              IssueWriteQueued: () =>
                new IssueTrackerError({
                  cause: new Error(queuedOffline(issue.id)),
                  operation: 'Save',
                }),
              IssueWriteRefused: refused =>
                new IssueTrackerError({
                  cause: new Error(
                    `Issue ${issue.id} changed after it was read (updatedAtMs ${refused.expectedUpdatedAtMs}), so the whole Issue was not written over it.`,
                  ),
                  operation: 'Save',
                }),
            }),
          ),
        ),
      )
  })

const deleteIssue = (
  store: InstantEntityStoreService,
  issueId: string,
): Effect.Effect<Issue, IssueTrackerError> =>
  Effect.gen(function* () {
    const record = yield* singleIssueRecord(store, 'Delete', issueId)
    const issue = yield* decodeStoredIssue('Delete', record)
    yield* store
      .deleteIssue(record.id)
      .pipe(
        Effect.mapError(
          cause => new IssueTrackerError({ cause, operation: 'Delete' }),
        ),
      )
    const remaining = yield* issueRecordsFor(store, 'Delete', issueId)
    if (Array.some(remaining, stored => stored.id === record.id)) {
      return yield* failIssueTracker(
        'Delete',
        `Issue ${issueId} is still stored after the delete.`,
      )
    }
    return issue
  })

/**
 * Adapts the low-level Instant entity capability to the portable Issue tracker.
 * `timing` is how a write waits: `defaultIssueWriteTiming` for live Clients.
 */
export const makeIssueTracker = (
  store: InstantEntityStoreService,
  timing: IssueWriteTiming = defaultIssueWriteTiming,
): IssueTrackerService => ({
  delete: issueId => deleteIssue(store, storedIssueId(issueId)),
  fetchIssue: issueId =>
    issueRecordsFor(store, 'FetchIssue', storedIssueId(issueId)).pipe(
      Effect.flatMap(records =>
        Array.match(records, {
          onEmpty: () => Effect.succeed(Option.none<Issue>()),
          onNonEmpty: () =>
            singleIssueRecord(store, 'FetchIssue', storedIssueId(issueId)).pipe(
              Effect.flatMap(record => decodeStoredIssue('FetchIssue', record)),
              Effect.map(Option.some),
            ),
        }),
      ),
    ),
  file: makeIssue => fileIssue(store, makeIssue, maximumFilingAttempts, []),
  update: (issueId, change) =>
    updateIssue(store, storedIssueId(issueId), change, timing),
  fetch: query =>
    store.fetchIssues(query.statuses).pipe(
      Effect.flatMap(records =>
        Effect.try({
          try: () => decodeIssueRecords(records),
          catch: cause =>
            new IssueTrackerError({
              cause,
              operation: 'Fetch',
            }),
        }),
      ),
      Effect.map(issues =>
        Array.take(
          Array.sort(
            Array.filter(issues, issue => matchesQuery(issue, query)),
            IssueNewestFirst,
          ),
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
    store.observeIssues(query.statuses).pipe(
      Stream.mapAccumEffect(
        () => emptyDecodedIssueCatalog,
        (previous, records) =>
          Effect.try({
            try: () => {
              const [next, issues] = decodeIssueRecordsOver(previous, records)
              const snapshot: readonly [
                DecodedIssueCatalog,
                ReadonlyArray<ReadonlyArray<Issue>>,
              ] = [next, [issues]]
              return snapshot
            },
            catch: cause =>
              new IssueTrackerError({
                cause,
                operation: 'Observe',
              }),
          }),
      ),
      Stream.map(issues =>
        Array.take(
          Array.sort(
            Array.filter(issues, issue => matchesQuery(issue, query)),
            IssueNewestFirst,
          ),
          Math.max(0, query.limit),
        ),
      ),
      Stream.mapError(cause =>
        cause instanceof IssueTrackerError
          ? cause
          : new IssueTrackerError({
              cause,
              operation: 'Observe',
            }),
      ),
    ),
  observeIssue: issueId =>
    store.observeIssue(issueId).pipe(
      Stream.mapEffect(maybeRecord =>
        Effect.try({
          try: () => Option.map(maybeRecord, decodeIssueRecord),
          catch: cause =>
            new IssueTrackerError({
              cause,
              operation: 'ObserveIssue',
            }),
        }),
      ),
      Stream.mapError(cause =>
        cause instanceof IssueTrackerError
          ? cause
          : new IssueTrackerError({
              cause,
              operation: 'ObserveIssue',
            }),
      ),
    ),
  save: issue => saveWholeIssue(store, issue),
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

/**
 * The Issues in `statuses`, asked of Instant by its indexed `status`, or every
 * Issue when it is empty: `issues list --status Open,InProgress` reads 745
 * Issues (8.3 MB), not all 1,356 (18.6 MB on 2026-10-29, #1358).
 */
const issuesInStatuses = (statuses: IssueQuery['statuses']) =>
  Array.isReadonlyArrayEmpty(statuses)
    ? { instantToolsIssues: {} }
    : {
        instantToolsIssues: {
          $: { where: { status: { $in: [...statuses] } } },
        },
      }

const issueIdField: Array<'issueID'> = ['issueID']

const inStatuses = (statuses: IssueQuery['statuses']) =>
  Array.isReadonlyArrayEmpty(statuses)
    ? {}
    : { where: { status: { $in: [...statuses] } } }

/** The numbers of the Issues in `statuses`, or of every Issue when it is empty. */
const issueIdsInStatuses = (statuses: IssueQuery['statuses']) => ({
  instantToolsIssues: { $: { fields: issueIdField, ...inStatuses(statuses) } },
})

/**
 * The catalog's rows a host kept from an earlier visit, and when they were last
 * read in full.
 */
export type KeptIssueCatalog = Readonly<{
  fullReadAtMs: number
  records: ReadonlyArray<InstantIssueRecord>
}>

/**
 * Where a host keeps the catalog's rows between visits, such as the browser's
 * IndexedDB, so a reload shows them at once and reads only what changed. Writes
 * are best effort and never hold up a reader; a store that cannot be read
 * answers with nothing kept.
 */
export type IssueCatalogCache = Readonly<{
  read: () => Promise<Option.Option<KeptIssueCatalog>>
  rememberAll: (
    records: ReadonlyArray<InstantIssueRecord>,
    fullReadAtMs: number,
  ) => void
  rememberChanged: (records: ReadonlyArray<InstantIssueRecord>) => void
  forget: (rowIds: ReadonlyArray<string>) => void
}>

/** A host that keeps nothing between visits. */
export const noIssueCatalogCache: IssueCatalogCache = {
  read: () => Promise.resolve(Option.none()),
  rememberAll: () => undefined,
  rememberChanged: () => undefined,
  forget: () => undefined,
}

/**
 * How old a kept catalog may be before a reload reads everything again: a day,
 * so a change that somehow fell outside every window heals by itself.
 */
const FULL_READ_EVERY_MS = 24 * 60 * 60 * 1_000

/**
 * How long a reload waits for the catalog kept in the browser before it reads
 * everything instead: 2 seconds, so a store that never answers costs one full
 * read, never an empty list.
 */
const KEPT_CATALOG_READ_TIMEOUT = '2 seconds'

/**
 * How far before the newest change a live window starts, so a writer whose
 * clock runs behind another's still lands inside it: 1 minute.
 */
export const CHANGED_ISSUES_OVERLAP_MS = 60_000

/** How many rows a live window holds before it moves forward. */
const CHANGED_ISSUES_WINDOW_ROWS = 3

const issuesChangedSince = (atMs: number) => ({
  instantToolsIssues: { $: { where: { updatedAtMs: { $gte: atMs } } } },
})

const windowStartOf = (
  records: ReadonlyArray<InstantIssueRecord>,
  nowMs: number,
): number =>
  Array.match(records, {
    onEmpty: () => nowMs,
    onNonEmpty: found =>
      Array.reduce(found, 0, (newest, record) =>
        Math.max(newest, record.updatedAtMs),
      ),
  }) - CHANGED_ISSUES_OVERLAP_MS

const IssueRowId = S.Struct({ id: S.String })

/**
 * The catalog as it changes, after `initial`, without reading it again. A live
 * query holds only the rows changed since the newest one seen, so a write costs
 * the Issues it changed, never the 21.8 MB catalog, and reaches every observer
 * at once. A second live query of the row ids alone says which Issues left. The
 * window moves forward once it holds more than 3 rows, so what one change sends
 * stays small however long a page stays open; a burst inside the overlap stays in
 * one window. Every save marks its row as changed now (`saveIssue`), so
 * no change falls outside the window.
 */
const changedIssueRecords = (
  database: InstantToolsDatabase,
  statuses: IssueQuery['statuses'],
  initial: ReadonlyArray<InstantIssueRecord>,
  cache: IssueCatalogCache,
): Stream.Stream<ReadonlyArray<InstantIssueRecord>, InstantEntityStoreError> =>
  Stream.callback<ReadonlyArray<InstantIssueRecord>, InstantEntityStoreError>(
    queue =>
      Effect.acquireRelease(
        Effect.map(Clock.currentTimeMillis, nowMs => {
          const held = new Map(
            Array.map(initial, record => [record.id, record]),
          )
          const isListed = (record: InstantIssueRecord): boolean =>
            Array.isReadonlyArrayEmpty(statuses) ||
            Array.contains(statuses, record.status)
          let maybeRowIds = Option.none<ReadonlySet<string>>()
          let windowRowIds: ReadonlySet<string> = new Set<string>()
          let openWindowCount = 0
          let closeWindow: () => void = () => undefined
          const failed = (cause: unknown): void => {
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
          const offerHeld = (): void => {
            Queue.offerUnsafe(
              queue,
              Array.filter(
                Array.fromIterable(held.values()),
                record =>
                  isListed(record) &&
                  (windowRowIds.has(record.id) ||
                    Option.match(maybeRowIds, {
                      onNone: () => true,
                      onSome: rowIds => rowIds.has(record.id),
                    })),
              ),
            )
          }
          const openWindow = (startAtMs: number): void => {
            closeWindow()
            openWindowCount += 1
            const thisWindow = openWindowCount
            const closeThisWindow = database.subscribeQuery(
              issuesChangedSince(startAtMs),
              response => {
                if (thisWindow !== openWindowCount) {
                  return
                }
                if (response.error !== undefined) {
                  failed(response.error)
                  return
                }
                try {
                  const changed = Array.map(
                    response.data.instantToolsIssues,
                    record => S.decodeUnknownSync(InstantIssueRecord)(record),
                  )
                  windowRowIds = new Set(
                    Array.map(changed, record => record.id),
                  )
                  const updated = Array.filter(
                    changed,
                    record =>
                      held.get(record.id)?.payloadJson !== record.payloadJson,
                  )
                  for (const record of updated) {
                    held.set(record.id, record)
                  }
                  if (Array.isReadonlyArrayNonEmpty(updated)) {
                    cache.rememberChanged(updated)
                  }
                  offerHeld()
                  const nextStartAtMs = windowStartOf(changed, nowMs)
                  if (
                    changed.length > CHANGED_ISSUES_WINDOW_ROWS &&
                    nextStartAtMs > startAtMs
                  ) {
                    openWindow(nextStartAtMs)
                  }
                } catch (cause) {
                  failed(cause)
                }
              },
            )
            if (thisWindow === openWindowCount) {
              closeWindow = closeThisWindow
            } else {
              closeThisWindow()
            }
          }
          const closeRowIds = database.subscribeQuery(
            issueIdsInStatuses([]),
            response => {
              if (response.error !== undefined) {
                failed(response.error)
                return
              }
              try {
                const rowIds = new Set(
                  Array.map(
                    response.data.instantToolsIssues,
                    row => S.decodeUnknownSync(IssueRowId)(row).id,
                  ),
                )
                maybeRowIds = Option.some(rowIds)
                const leftRowIds = Array.filter(
                  Array.fromIterable(held.keys()),
                  id => !rowIds.has(id) && !windowRowIds.has(id),
                )
                for (const id of leftRowIds) {
                  held.delete(id)
                }
                if (Array.isReadonlyArrayNonEmpty(leftRowIds)) {
                  cache.forget(leftRowIds)
                }
                offerHeld()
              } catch (cause) {
                failed(cause)
              }
            },
          )
          openWindow(windowStartOf(initial, nowMs))
          return () => {
            closeWindow()
            closeRowIds()
          }
        }),
        close => Effect.sync(close),
      ).pipe(Effect.flatMap(() => Effect.never)),
  )

const PermissionDenied = S.Struct({
  body: S.Struct({ type: S.Literal('permission-denied') }),
})

/** Whether Instant refused a request under the app's rules. */
const isPermissionDenied = (cause: unknown): boolean =>
  Option.isSome(S.decodeUnknownOption(PermissionDenied)(cause))

const QueuedTransaction = S.Struct({ status: S.Literal('enqueued') })

/**
 * Whether Instant answered a transaction as queued, not sent: the client was
 * offline or not yet signed in to its socket.
 */
const isQueuedOffline = (result: unknown): boolean =>
  Option.isSome(S.decodeUnknownOption(QueuedTransaction)(result))

/**
 * Creates the low-level entity capability from a host-initialized database.
 * `cache` is where the host keeps the catalog between visits; by default,
 * nowhere.
 */
export const makeInstantEntityStore = (
  database: InstantToolsDatabase,
  cache: IssueCatalogCache = noIssueCatalogCache,
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
  fetchIssues: statuses =>
    Effect.tryPromise({
      try: async () => {
        const response = await database.queryOnce(issuesInStatuses(statuses))
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
  observeIssues: statuses =>
    Stream.unwrap(
      Effect.gen(function* () {
        const nowMs = yield* Clock.currentTimeMillis
        const maybeKept = Array.isReadonlyArrayEmpty(statuses)
          ? yield* Effect.promise(() =>
              cache.read().catch(() => Option.none<KeptIssueCatalog>()),
            ).pipe(
              Effect.timeoutOption(KEPT_CATALOG_READ_TIMEOUT),
              Effect.map(Option.flatten),
              Effect.map(
                Option.filter(
                  ({ fullReadAtMs, records }) =>
                    nowMs - fullReadAtMs < FULL_READ_EVERY_MS &&
                    Array.isReadonlyArrayNonEmpty(records),
                ),
              ),
            )
          : Option.none<KeptIssueCatalog>()
        const records = yield* Option.match(maybeKept, {
          onSome: kept => Effect.succeed(kept.records),
          onNone: () =>
            Effect.tryPromise({
              try: async () => {
                const response = await database.queryOnce(
                  issuesInStatuses(statuses),
                )
                const read = Array.map(
                  response.data.instantToolsIssues,
                  record => S.decodeUnknownSync(InstantIssueRecord)(record),
                )
                if (Array.isReadonlyArrayEmpty(statuses)) {
                  cache.rememberAll(read, nowMs)
                }
                return read
              },
              catch: cause =>
                new InstantEntityStoreError({
                  cause,
                  operation: 'ObserveIssues',
                }),
            }),
        })
        return Stream.concat(
          Stream.succeed(records),
          changedIssueRecords(database, statuses, records, cache),
        )
      }),
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
  fetchIssueIds: statuses =>
    Effect.tryPromise({
      try: async () => {
        const response = await database.queryOnce(issueIdsInStatuses(statuses))
        return Array.map(
          response.data.instantToolsIssues,
          record => record.issueID,
        )
      },
      catch: cause =>
        new InstantEntityStoreError({
          cause,
          operation: 'FetchIssueIds',
        }),
    }),
  fetchIssueRecordsById: issueId =>
    Effect.tryPromise({
      try: async () => {
        // NOTE: a rule param no rule reads makes this query its own, so a
        // page that holds the same query live cannot answer it from its copy.
        const response = await database.queryOnce(
          { instantToolsIssues: { $: { where: { issueID: issueId } } } },
          { ruleParams: { serverReadID: uuidV4() } },
        )
        return Array.map(response.data.instantToolsIssues, record =>
          S.decodeUnknownSync(InstantIssueRecord)(record),
        )
      },
      catch: cause =>
        new InstantEntityStoreError({
          cause,
          operation: 'FetchIssueRecords',
        }),
    }),
  createIssue: record =>
    Effect.tryPromise({
      try: async () => {
        const entityId = uuidV4()
        const entity = database.tx.instantToolsIssues[entityId]
        if (entity === undefined) {
          throw new Error('Instant Issue transaction entity was unavailable.')
        }
        await database.transact(
          entity.create({
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
        return entityId
      },
      catch: cause =>
        new InstantEntityStoreError({
          cause,
          operation: 'CreateIssue',
        }),
    }),
  deleteIssue: entityId =>
    Effect.tryPromise({
      try: async () => {
        const entity = database.tx.instantToolsIssues[entityId]
        if (entity === undefined) {
          throw new Error('Instant Issue transaction entity was unavailable.')
        }
        await database.transact(entity.delete())
      },
      catch: cause =>
        new InstantEntityStoreError({
          cause,
          operation: 'DeleteIssue',
        }),
    }),
  saveIssue: (record, maybeExpectedUpdatedAtMs) =>
    Effect.flatMap(Clock.currentTimeMillis, nowMs =>
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
          const fields = {
            attachmentCount: record.attachmentCount,
            attachmentIdsJson: record.attachmentIdsJson,
            issueID: record.issueID,
            payloadJson: record.payloadJson,
            priority: record.priority,
            productId: record.productId,
            projectId: record.projectId,
            status: record.status,
          }
          return database.transact(
            Option.match(maybeExpectedUpdatedAtMs, {
              onNone: () =>
                entity.update({
                  ...fields,
                  updatedAtMs: Math.max(record.updatedAtMs, nowMs),
                }),
              onSome: expectedUpdatedAtMs =>
                entity
                  .ruleParams({ expectedUpdatedAtMs })
                  .update({ ...fields, updatedAtMs: record.updatedAtMs }),
            }),
          )
        },
        catch: cause =>
          Option.match(maybeExpectedUpdatedAtMs, {
            onNone: () =>
              new InstantEntityStoreError({ cause, operation: 'SaveIssue' }),
            onSome: expectedUpdatedAtMs =>
              isPermissionDenied(cause)
                ? new IssueWriteRefused({
                    cause,
                    expectedUpdatedAtMs,
                    issueID: record.issueID,
                  })
                : new InstantEntityStoreError({
                    cause,
                    operation: 'SaveIssue',
                  }),
          }),
      }).pipe(
        Effect.flatMap(result =>
          isQueuedOffline(result)
            ? Effect.fail(new IssueWriteQueued({ issueID: record.issueID }))
            : Effect.void,
        ),
      ),
    ),
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
              productId: record.productId,
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
  cache: IssueCatalogCache = noIssueCatalogCache,
): Layer.Layer<IssueTracker | Logger | ProductCatalog | TriageInbox> => {
  const store = makeInstantEntityStore(database, cache)
  return Layer.mergeAll(
    Layer.succeed(IssueTracker, makeIssueTracker(store)),
    Layer.succeed(Logger, makeLogger(store)),
    Layer.succeed(ProductCatalog, makeProductCatalog(store)),
    Layer.succeed(TriageInbox, makeTriageInbox(store)),
  )
}
