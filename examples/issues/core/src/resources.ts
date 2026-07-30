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
} from '@foldkit/instant-tools/issues'

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
  attachments: [],
  createdAtMs: 1_753_800_000_000,
  details: 'Observe filtered collections and selected Issue detail.',
  id: 'issue-041',
  mentions: [],
  priority: 'P2',
  product: foldkit.product,
  projectId: Option.some('instant-tools'),
  sourceDocument: Option.none(),
  status: 'InProgress',
  successCriteria: [],
  title: 'Application-agnostic logging and issue tracking',
  updatedAtMs: 1_753_800_000_000,
  workLog: [],
})

const staticIssues: ReadonlyArray<Issue> = [seedIssue]
const staticProducts: ReadonlyArray<ProductCatalogEntry> = [scribe, foldkit]

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

/** Deterministic resources for previews, tests, and offline Clients. */
export const StaticIssueTrackerResources = Layer.mergeAll(
  Layer.succeed(IssueTracker, StaticIssueTracker),
  Layer.succeed(ProductCatalog, StaticProductCatalog),
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
