import { Array, Match as M, Option } from 'effect'

import { type Issue } from '@foldkit/instant-tools/issues'

import { type BacklogListing, backlogIssues, backlogOf } from './backlog.js'
import {
  type IssueView,
  defaultIssueView,
  issuesFoundBy,
  listingOf,
} from './issueView.js'
import { issuesForLandingFilter } from './landing.js'
import { type ProductFilter, issuesForProductFilter } from './leftover.js'
import { type Model } from './model.js'

/** The Issues loaded so far, none before the first snapshot. */
export const loadedIssuesIn = (model: Model): ReadonlyArray<Issue> =>
  model.issues._tag === 'LoadedIssues' ? model.issues.issues : []

/** The view of the list on screen, or the whole list elsewhere. */
export const issueViewOf = (model: Model): IssueView =>
  model.navigation._tag === 'IssueList'
    ? model.navigation.view
    : defaultIssueView

const productFilterKey = (filter: ProductFilter): string =>
  filter._tag === 'OneProduct' ? `product:${filter.productId}` : 'product:all'

/**
 * The Issues the list shows: those of the chosen product, then only the work
 * close to landing when that filter is on, then those its search finds.
 * Read once per snapshot of the Issues and view.
 */
export const listedIssues = (
  model: Model,
  issues: ReadonlyArray<Issue>,
): ReadonlyArray<Issue> => {
  const view = issueViewOf(model)
  return listingOf(
    issues,
    Array.join(
      [
        productFilterKey(model.productFilter),
        model.landingFilter._tag,
        view.query,
      ],
      '\u0000',
    ),
    () =>
      issuesFoundBy(
        issuesForLandingFilter(
          issuesForProductFilter(issues, model.productFilter),
          model.landingFilter,
        ),
        view.query,
      ),
  )
}

const backlogsBySnapshot = new WeakMap<
  ReadonlyArray<Issue>,
  Map<string, BacklogListing>
>()

/**
 * The backlog of the chosen product: the next build's lane, later builds'
 * lanes, then each priority in rank order, oldest first. Read once per
 * snapshot of the Issues and product.
 */
export const listedBacklog = (
  model: Model,
  issues: ReadonlyArray<Issue>,
): BacklogListing => {
  const key = productFilterKey(model.productFilter)
  const backlogs = Option.getOrElse(
    Option.fromUndefinedOr(backlogsBySnapshot.get(issues)),
    () => {
      const fresh = new Map<string, BacklogListing>()
      backlogsBySnapshot.set(issues, fresh)
      return fresh
    },
  )
  return Option.getOrElse(Option.fromUndefinedOr(backlogs.get(key)), () => {
    const backlog = backlogOf(
      issuesForProductFilter(issues, model.productFilter),
    )
    backlogs.set(key, backlog)
    return backlog
  })
}

/**
 * The rows the cursor walks, in the order the page shows them: the list's or
 * the backlog's. A page without rows has none.
 */
export const rowsInOrderOf = (model: Model): ReadonlyArray<Issue> =>
  M.value(model.navigation).pipe(
    M.withReturnType<ReadonlyArray<Issue>>(),
    M.tagsExhaustive({
      IssueList: () => listedIssues(model, loadedIssuesIn(model)),
      Backlog: () => backlogIssues(listedBacklog(model, loadedIssuesIn(model))),
      IssueDetail: () => [],
      FileIssue: () => [],
      TriageInbox: () => [],
      AskFlow: () => [],
      EntityPage: () => [],
    }),
  )

/** The Issue under the row cursor, when it is among the rows on screen. */
export const issueUnderCursorOf = (model: Model): Option.Option<Issue> =>
  Option.flatMap(model.maybeRowCursor, issueId =>
    Array.findFirst(rowsInOrderOf(model), issue => issue.id === issueId),
  )

/** Which way the row cursor moves. */
export type RowDirection = 'Next' | 'Previous'

/**
 * Where the row cursor lands: the row next to it in the direction, staying on
 * the first and last rows at each end, and the first row when it is on none.
 */
export const movedRowCursor = (
  rows: ReadonlyArray<Issue>,
  maybeCursor: Option.Option<string>,
  direction: RowDirection,
): Option.Option<string> => {
  const maybePosition = Option.flatMap(maybeCursor, issueId =>
    Array.findFirstIndex(rows, issue => issue.id === issueId),
  )
  const nextPosition = Option.match(maybePosition, {
    onNone: () => 0,
    onSome: position =>
      direction === 'Next'
        ? Math.min(position + 1, rows.length - 1)
        : Math.max(position - 1, 0),
  })
  return Option.map(Array.get(rows, nextPosition), issue => issue.id)
}
