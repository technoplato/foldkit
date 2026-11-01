import { Array, Match as M, Option } from 'effect'

import { type Issue } from '@foldkit/instant-tools/issues'

import { type BacklogListing, backlogIssues, backlogOf } from './backlog.js'
import {
  type IssueGroup,
  type IssueView,
  defaultIssueView,
  issueGroupsOf,
  issuesInView,
  listingKeyOf,
  snapshotMemo,
} from './issueView.js'
import {
  AllProducts,
  type ProductFilter,
  issuesForProductFilter,
} from './leftover.js'
import { type Model } from './model.js'

/** The Issues loaded so far, none before the first snapshot. */
export const loadedIssuesIn = (model: Model): ReadonlyArray<Issue> =>
  model.issues._tag === 'LoadedIssues' ? model.issues.issues : []

/** The view of the list on screen, or the whole list elsewhere. */
export const issueViewOf = (model: Model): IssueView =>
  model.navigation._tag === 'IssueList'
    ? model.navigation.view
    : defaultIssueView

const noProductFilter: ProductFilter = AllProducts.make({})

/** The product the page on screen is filtered by: the list's or the backlog's. */
export const productFilterOf = (model: Model): ProductFilter =>
  M.value(model.navigation).pipe(
    M.withReturnType<ProductFilter>(),
    M.tagsExhaustive({
      IssueList: ({ view }) => view.product,
      Backlog: ({ product }) => product,
      IssueDetail: () => noProductFilter,
      FileIssue: () => noProductFilter,
      TriageInbox: () => noProductFilter,
      AskFlow: () => noProductFilter,
      EntityPage: () => noProductFilter,
    }),
  )

const listingMemo = snapshotMemo<ReadonlyArray<Issue>>()

/**
 * The Issues the list shows: everything its view filters by, in its order,
 * those its search finds. Read once per snapshot of the Issues and view.
 */
export const listedIssues = (
  model: Model,
  issues: ReadonlyArray<Issue>,
): ReadonlyArray<Issue> => {
  const view = issueViewOf(model)
  return listingMemo(issues, listingKeyOf(view), () =>
    issuesInView(issues, view),
  )
}

const groupsMemo = snapshotMemo<ReadonlyArray<IssueGroup>>()

/** The list's rows under the field its view groups by. */
export const listedGroups = (
  model: Model,
  issues: ReadonlyArray<Issue>,
): ReadonlyArray<IssueGroup> => {
  const view = issueViewOf(model)
  return groupsMemo(issues, `${view.grouping}|${listingKeyOf(view)}`, () =>
    issueGroupsOf(listedIssues(model, issues), view.grouping),
  )
}

const backlogMemo = snapshotMemo<BacklogListing>()

const productKeyOf = (filter: ProductFilter): string =>
  filter._tag === 'OneProduct' ? filter.productId : ''

/**
 * The backlog of the chosen product: the next build's lane, later builds'
 * lanes, then each priority in rank order, oldest first. Read once per
 * snapshot of the Issues and product.
 */
export const listedBacklog = (
  model: Model,
  issues: ReadonlyArray<Issue>,
): BacklogListing => {
  const filter = productFilterOf(model)
  return backlogMemo(issues, productKeyOf(filter), () =>
    backlogOf(issuesForProductFilter(issues, filter)),
  )
}

const listRowsInOrderOf = (model: Model): ReadonlyArray<Issue> => {
  const issues = loadedIssuesIn(model)
  return issueViewOf(model).grouping === 'None'
    ? listedIssues(model, issues)
    : Array.flatMap(listedGroups(model, issues), group => group.issues)
}

/**
 * The rows the cursor walks, in the order the page shows them: the list's or
 * the backlog's. A page without rows has none.
 */
export const rowsInOrderOf = (model: Model): ReadonlyArray<Issue> =>
  M.value(model.navigation).pipe(
    M.withReturnType<ReadonlyArray<Issue>>(),
    M.tagsExhaustive({
      IssueList: () => listRowsInOrderOf(model),
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
