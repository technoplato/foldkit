import { Array, Effect, Layer, Option, Ref, Stream } from 'effect'

import {
  type InstantToolsDatabase,
  makeInstantToolsLayer,
} from '@foldkit/instant-tools/instant'
import {
  ApplicationProduct,
  Issue,
  type IssueQuery,
  IssueTracker,
  IssueTrackerError,
  type IssueTrackerService,
  LibraryProduct,
  ProductCatalog,
  ProductCatalogEntry,
  type ProductCatalogService,
  RecordingSegment,
  TriageCandidate,
  TriageInbox,
  type TriageInboxService,
  nextIssueId,
  normalizeIssueId,
} from '@foldkit/instant-tools/issues'
import {
  MemoryLeftoverPresenceLive,
  makeInstantLeftoverPresenceLayer,
} from '@foldkit/instant-tools/leftover'
import {
  IssueLogEvidence,
  Logger,
  type LoggerService,
} from '@foldkit/instant-tools/logging'

import { IssueIdentity, LiveIssueIdentity } from './issueIdentity.js'

const scribe = ProductCatalogEntry.make({
  product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
  updatedAtMs: 1_753_800_000_000,
})
const foldkit = ProductCatalogEntry.make({
  product: LibraryProduct.make({ id: 'foldkit', name: 'Foldkit' }),
  updatedAtMs: 1_753_800_000_000,
})
const instantDataSwift = ProductCatalogEntry.make({
  product: LibraryProduct.make({
    id: 'instant-data-swift',
    name: 'Instant Data Swift',
  }),
  updatedAtMs: 1_753_800_000_000,
})
const ayutia = ProductCatalogEntry.make({
  product: ApplicationProduct.make({ id: 'ayutia', name: 'AYUTIA' }),
  updatedAtMs: 1_753_800_000_000,
})
const universalSoftwareShop = ProductCatalogEntry.make({
  product: ApplicationProduct.make({
    id: 'universal-software-shop',
    name: 'Universal Software Shop',
  }),
  updatedAtMs: 1_753_800_000_000,
})
const casino = ProductCatalogEntry.make({
  product: ApplicationProduct.make({ id: 'casino', name: 'Casino' }),
  updatedAtMs: 1_753_800_000_000,
})
const seedIssue = Issue.make({
  area: Option.none(),
  attachments: [],
  claimantId: Option.none(),
  complexity: Option.none(),
  createdAtMs: 1_753_800_000_000,
  details: 'Observe filtered collections and selected Issue detail.',
  id: 'issue-041',
  issueType: Option.none(),
  mentions: [],
  priority: 'P2',
  product: foldkit.product,
  projectId: Option.some('instant-tools'),
  reportedDate: Option.none(),
  sourceDocument: Option.none(),
  status: 'InProgress',
  successCriteria: [],
  title: 'Application-agnostic logging and issue tracking',
  updatedAtMs: 1_753_800_000_000,
  viewerURL: Option.some('https://issues.knophy.com/issues/041'),
  workLog: [],
})
const scribeIssue = Issue.make({
  area: Option.none(),
  attachments: [],
  claimantId: Option.none(),
  complexity: Option.none(),
  createdAtMs: 1_753_800_000_000,
  details: 'Scribe leftover card used to prove product filter.',
  id: 'issue-scribe',
  issueType: Option.some('Task'),
  mentions: [],
  priority: 'P3',
  product: scribe.product,
  projectId: Option.none(),
  reportedDate: Option.none(),
  sourceDocument: Option.none(),
  status: 'Open',
  successCriteria: [],
  title: 'Scribe transcript card',
  updatedAtMs: 1_753_800_000_000,
  viewerURL: Option.some('https://issues.knophy.com/issues/scribe'),
  workLog: [],
})

const staticIssues: ReadonlyArray<Issue> = [seedIssue, scribeIssue]
const staticIssueLogs = [
  IssueLogEvidence.make({
    category: 'issues',
    contributingPaths: [],
    issueID: '041',
    level: 'Info',
    logID: 'preview-log-041',
    logNamespace: 'instantToolsLogs',
    message: 'Issue #041 is available in the lightweight viewer.',
    name: 'issue.preview.loaded',
    timestampMs: 1_753_800_000_000,
    viewerURL: 'https://issues.knophy.com/issues/041',
  }),
]
const staticProducts: ReadonlyArray<ProductCatalogEntry> = [
  scribe,
  foldkit,
  instantDataSwift,
  ayutia,
  universalSoftwareShop,
  casino,
]
const seedSegment = RecordingSegment.make({
  createdAtMs: 1_753_800_000_000,
  endMilliseconds: 49_000,
  id: 'segment-preview',
  publicUrl: Option.some('/segments/segment-preview'),
  recordingId: 'recording-preview',
  startMilliseconds: 42_000,
  transcript: 'The issue list should update while I am looking at it.',
})
const staticTriageCandidates: ReadonlyArray<TriageCandidate> = [
  TriageCandidate.make({
    createdAtMs: 1_753_800_000_000,
    id: 'candidate-preview',
    product: foldkit.product,
    segment: seedSegment,
    status: 'Draft',
    suggestedDetails: seedSegment.transcript,
    suggestedPriority: 'P2',
    suggestedTitle: 'Keep the visible issue list live',
    updatedAtMs: 1_753_800_000_000,
  }),
]

const memoryIssueId = (issueId: string): string =>
  Option.getOrElse(normalizeIssueId(issueId), () => issueId.trim())

const matchesQuery = (issue: Issue, query: IssueQuery): boolean =>
  Option.match(query.productId, {
    onNone: () => true,
    onSome: productId => issue.product.id === productId,
  }) &&
  Option.match(query.projectId, {
    onNone: () => true,
    onSome: projectId => Option.contains(issue.projectId, projectId),
  }) &&
  (Array.isReadonlyArrayEmpty(query.statuses) ||
    Array.contains(query.statuses, issue.status))

const missingIssue = (
  operation: IssueTrackerError['operation'],
  issueId: string,
): IssueTrackerError =>
  new IssueTrackerError({
    cause: new Error(`Issue ${issueId} does not exist.`),
    operation,
  })

/**
 * An in-memory Issue tracker that numbers, checks, and deletes the way the
 * Instant tracker does, for previews, tests, and offline Clients. Seeded with
 * `001` and `005`, it files the next Issue as `006`.
 */
export const makeMemoryIssueTracker = (
  seed: ReadonlyArray<Issue>,
): Effect.Effect<IssueTrackerService> =>
  Effect.gen(function* () {
    const issues = yield* Ref.make(seed)
    const find = (issueId: string) =>
      Ref.get(issues).pipe(
        Effect.map(stored =>
          Array.findFirst(stored, issue => issue.id === memoryIssueId(issueId)),
        ),
      )
    const fetch = (query: IssueQuery) =>
      Ref.get(issues).pipe(
        Effect.map(stored =>
          Array.take(
            Array.filter(stored, issue => matchesQuery(issue, query)),
            query.limit,
          ),
        ),
      )
    const replace = (next: Issue) =>
      Ref.update(issues, stored =>
        Array.map(stored, issue => (issue.id === next.id ? next : issue)),
      )
    return {
      delete: issueId =>
        Effect.gen(function* () {
          const maybeIssue = yield* find(issueId)
          if (Option.isNone(maybeIssue)) {
            return yield* Effect.fail(missingIssue('Delete', issueId))
          }
          yield* Ref.update(issues, stored =>
            Array.filter(stored, issue => issue.id !== maybeIssue.value.id),
          )
          return maybeIssue.value
        }),
      fetch,
      fetchIssue: find,
      file: makeIssue =>
        Ref.modify(issues, stored => {
          const issue = makeIssue(
            nextIssueId(Array.map(stored, current => current.id)),
          )
          return [issue, Array.append(stored, issue)]
        }),
      observe: query => Stream.fromEffect(fetch(query)),
      observeIssue: issueId => Stream.fromEffect(find(issueId)),
      save: issue =>
        Ref.update(issues, stored =>
          Array.some(stored, current => current.id === issue.id)
            ? Array.map(stored, current =>
                current.id === issue.id ? issue : current,
              )
            : Array.append(stored, issue),
        ),
      update: (issueId, change) =>
        Effect.gen(function* () {
          const maybeIssue = yield* find(issueId)
          if (Option.isNone(maybeIssue)) {
            return yield* Effect.fail(missingIssue('Update', issueId))
          }
          yield* replace(change.apply(maybeIssue.value))
          const maybeStored = yield* find(issueId)
          if (
            Option.isSome(maybeStored) &&
            change.hasLanded(maybeStored.value)
          ) {
            return maybeStored.value
          }
          return yield* Effect.fail(
            new IssueTrackerError({
              cause: new Error(`Issue ${issueId}: the change did not land.`),
              operation: 'Update',
            }),
          )
        }),
    }
  })

const StaticProductCatalog: ProductCatalogService = {
  fetch: Effect.succeed(staticProducts),
  observe: Stream.succeed(staticProducts),
  save: () => Effect.void,
}

const StaticTriageInbox: TriageInboxService = {
  observeCandidates: Stream.succeed(staticTriageCandidates),
  observeSegment: segmentId =>
    Stream.succeed(
      segmentId === seedSegment.id ? Option.some(seedSegment) : Option.none(),
    ),
  saveCandidate: () => Effect.void,
  saveSegment: () => Effect.void,
}

const StaticLogger: LoggerService = {
  append: () => Effect.void,
  observeIssue: issueId =>
    Stream.succeed(
      Array.filter(staticIssueLogs, evidence => evidence.issueID === issueId),
    ),
}

/** Deterministic resources for previews, tests, and offline Clients. */
export const StaticIssueTrackerResources = Layer.mergeAll(
  Layer.effect(IssueTracker, makeMemoryIssueTracker(staticIssues)),
  Layer.succeed(Logger, StaticLogger),
  Layer.succeed(ProductCatalog, StaticProductCatalog),
  Layer.succeed(TriageInbox, StaticTriageInbox),
  MemoryLeftoverPresenceLive,
  Layer.succeed(IssueIdentity, {
    next: Effect.succeed({ id: 'issue-preview', nowMs: 1_753_800_100_000 }),
  }),
)

/** Live Instant resources for browser and native Clients. */
export const makeLiveIssueTrackerResources = (database: InstantToolsDatabase) =>
  Layer.mergeAll(
    makeInstantToolsLayer(database),
    makeInstantLeftoverPresenceLayer(database),
    Layer.succeed(IssueIdentity, LiveIssueIdentity),
  )
