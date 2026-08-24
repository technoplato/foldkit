import { Array, Option, Order, Schema as S } from 'effect'

import {
  CatalogIssueReference,
  type Issue,
  type IssueStatus,
  type IssueWorkLogEntry,
} from '@foldkit/instant-tools/issues'
import { leftoverRoomRequired } from '@foldkit/instant-tools/leftover'

/** Leftover workflow offered to operators. Stored IssueStatus stays the wide union. */
export const LeftoverStatus = S.Literals(['Open', 'Blocked', 'Closed'])
/** Leftover workflow offered to operators. */
export type LeftoverStatus = typeof LeftoverStatus.Type

/** Leftover kind. Stored on Issue.issueType without shrinking that optional string. */
export const LeftoverKind = S.Literals(['Idea', 'Task', 'Bug', 'Improvement'])
/** Leftover kind. */
export type LeftoverKind = typeof LeftoverKind.Type

/** No product restriction. */
export const AllProducts = S.TaggedStruct('AllProducts', {})
/** Restrict the leftover board to one live catalog product. */
export const OneProduct = S.TaggedStruct('OneProduct', {
  productId: S.String,
})
/** Product filter owned by the Program, not host chrome. */
export const ProductFilter = S.Union([AllProducts, OneProduct])
/** Product filter owned by the Program, not host chrome. */
export type ProductFilter = typeof ProductFilter.Type

/** Instant leftovers that leftover UI and CLI must never mark Closed. */
export const leftoverUnclosableIssueIds: ReadonlyArray<string> = [
  '240',
  '241',
  '242',
  '243',
]

/** Peers required before leftover quorum is present. Does not call done. */
export const leftoverQuorumRequired = leftoverRoomRequired

const closedStored: ReadonlyArray<IssueStatus> = [
  'Closed',
  'Fixed',
  'Resolved',
  'Verified',
]

const leftoverStatuses: ReadonlyArray<LeftoverStatus> = [
  'Open',
  'Blocked',
  'Closed',
]

const unclosableLeftoverStatuses: ReadonlyArray<LeftoverStatus> = [
  'Open',
  'Blocked',
]

/** True when leftover interactions may include Closed. */
export const leftoverMayClose = (issueId: string): boolean =>
  !Array.contains(leftoverUnclosableIssueIds, issueId)

/** Leftover statuses valid for one Issue id. Never Closed on 240-243. */
export const leftoverStatusesForIssue = (
  issueId: string,
): ReadonlyArray<LeftoverStatus> =>
  leftoverMayClose(issueId) ? leftoverStatuses : unclosableLeftoverStatuses

/** Projects the stored wide status onto leftover Open | Blocked | Closed. */
export const leftoverStatusOf = (status: IssueStatus): LeftoverStatus => {
  if (status === 'Blocked') {
    return 'Blocked'
  }
  if (Array.contains(closedStored, status)) {
    return 'Closed'
  }
  return 'Open'
}

/** Maps a leftover status back onto the stored union without inventing labels. */
export const storedStatusForLeftover = (status: LeftoverStatus): IssueStatus =>
  status

/** Decodes leftover kind from the stored optional issueType string. */
export const leftoverKindOf = (issue: Issue): Option.Option<LeftoverKind> =>
  Option.flatMap(issue.issueType, value =>
    S.decodeUnknownOption(LeftoverKind)(value),
  )

/** Work-log rows newest first. */
export const workLogNewestFirst = (
  workLog: ReadonlyArray<IssueWorkLogEntry>,
): ReadonlyArray<IssueWorkLogEntry> =>
  Array.sortWith(workLog, entry => entry.occurredAtMs, Order.flip(Order.Number))

const catalogIssueId = (reference: {
  readonly _tag: string
  readonly id?: string
}): Option.Option<string> =>
  reference._tag === 'Issue' && typeof reference.id === 'string'
    ? Option.some(reference.id)
    : Option.none()

/** CatalogIssueReference ids already linked from this Issue. */
export const catalogIssueIds = (issue: Issue): ReadonlyArray<string> => {
  const ids: Array<string> = []
  const seen = new Set<string>()
  const remember = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  for (const mention of issue.mentions) {
    const maybeSource = catalogIssueId(mention.source)
    if (Option.isSome(maybeSource)) {
      remember(maybeSource.value)
    }
    for (const related of mention.related) {
      const maybeRelated = catalogIssueId(related)
      if (Option.isSome(maybeRelated)) {
        remember(maybeRelated.value)
      }
    }
  }
  return ids
}

/** True when a CatalogIssueReference for targetId is already present. */
export const hasCatalogIssueLink = (issue: Issue, targetId: string): boolean =>
  Array.contains(catalogIssueIds(issue), targetId)

/** One CatalogIssueReference. */
export const catalogIssueReference = (id: string) =>
  CatalogIssueReference.make({ id })

/** Issues matching the Program product filter. */
export const issuesForProductFilter = (
  issues: ReadonlyArray<Issue>,
  filter: ProductFilter,
): ReadonlyArray<Issue> =>
  filter._tag === 'AllProducts'
    ? issues
    : Array.filter(issues, issue => issue.product.id === filter.productId)

/** Unfinished leftover Issues — never Closed. Inbox stays TriageCandidate. */
export const leftoverIssues = (
  issues: ReadonlyArray<Issue>,
): ReadonlyArray<Issue> =>
  Array.filter(issues, issue => leftoverStatusOf(issue.status) !== 'Closed')

/** Unfinished child leftovers linked from a parent Issue. */
export const leftoverChildren = (
  parent: Issue,
  issues: ReadonlyArray<Issue>,
): ReadonlyArray<Issue> => {
  const linked = new Set(catalogIssueIds(parent))
  return leftoverIssues(Array.filter(issues, issue => linked.has(issue.id)))
}

/** Compatibility alias used by leftover writes. */
export const storedStatusOf = storedStatusForLeftover

/** Compatibility alias for newest-first work log. */
export const newestWorkLog = workLogNewestFirst

/** CatalogIssueReference values already linked from this Issue. */
export const catalogIssueRefsOf = (
  issue: Issue,
): ReadonlyArray<typeof CatalogIssueReference.Type> =>
  Array.map(catalogIssueIds(issue), id => CatalogIssueReference.make({ id }))
