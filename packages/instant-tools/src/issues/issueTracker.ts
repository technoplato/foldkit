import { Context, Data, Effect, Option, Schema as S, Stream } from 'effect'

import { Issue, IssueStatus } from './domain.js'

/** A portable filter for Issue store queries. */
export const IssueQuery = S.Struct({
  limit: S.Int,
  productId: S.Option(S.String),
  projectId: S.Option(S.String),
  statuses: S.Array(IssueStatus),
})
/** A portable filter for Issue store queries. */
export type IssueQuery = typeof IssueQuery.Type

/** An Issue tracker transport failed to query or persist its data. */
export class IssueTrackerError extends Data.TaggedError('IssueTrackerError')<{
  readonly cause: unknown
  readonly operation: 'Fetch' | 'Observe' | 'ObserveIssue' | 'Save'
}> {}

/** The side-effecting capability required by an Issue tracking Feature. */
export type IssueTrackerService = Readonly<{
  fetch: (
    query: IssueQuery,
  ) => Effect.Effect<ReadonlyArray<Issue>, IssueTrackerError>
  observe: (
    query: IssueQuery,
  ) => Stream.Stream<ReadonlyArray<Issue>, IssueTrackerError>
  observeIssue: (
    issueId: string,
  ) => Stream.Stream<Option.Option<Issue>, IssueTrackerError>
  save: (issue: Issue) => Effect.Effect<void, IssueTrackerError>
}>

/** An injected Issue store whose implementation is selected by the host. */
export class IssueTracker extends Context.Service<
  IssueTracker,
  IssueTrackerService
>()('@foldkit/instant-tools/IssueTracker') {}
