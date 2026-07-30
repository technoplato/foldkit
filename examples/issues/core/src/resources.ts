import { Array, Effect, Layer, Option, Stream } from 'effect'

import {
  type InstantToolsDatabase,
  makeInstantToolsLayer,
} from '@foldkit/instant-tools/instant'
import {
  ApplicationProduct,
  Issue,
  IssueTracker,
  type IssueTrackerService,
  LibraryProduct,
  ProductCatalog,
  ProductCatalogEntry,
  type ProductCatalogService,
  RecordingSegment,
  TriageCandidate,
  TriageInbox,
  type TriageInboxService,
} from '@foldkit/instant-tools/issues'
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

const staticIssues: ReadonlyArray<Issue> = [seedIssue]
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
const staticProducts: ReadonlyArray<ProductCatalogEntry> = [scribe, foldkit]
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

const StaticIssueTracker: IssueTrackerService = {
  fetch: query => Effect.succeed(Array.take(staticIssues, query.limit)),
  observe: query => Stream.succeed(Array.take(staticIssues, query.limit)),
  observeIssue: issueId =>
    Stream.succeed(
      Array.findFirst(staticIssues, issue => issue.id === issueId),
    ),
  save: () => Effect.void,
}

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
  Layer.succeed(IssueTracker, StaticIssueTracker),
  Layer.succeed(Logger, StaticLogger),
  Layer.succeed(ProductCatalog, StaticProductCatalog),
  Layer.succeed(TriageInbox, StaticTriageInbox),
  Layer.succeed(IssueIdentity, {
    next: Effect.succeed({ id: 'issue-preview', nowMs: 1_753_800_100_000 }),
  }),
)

/** Live Instant resources for browser and native Clients. */
export const makeLiveIssueTrackerResources = (database: InstantToolsDatabase) =>
  Layer.merge(
    makeInstantToolsLayer(database),
    Layer.succeed(IssueIdentity, LiveIssueIdentity),
  )
