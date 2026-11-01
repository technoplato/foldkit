import { Array, Match as M, Option } from 'effect'

import { type Issue } from '@foldkit/instant-tools/issues'

import { type BacklogListing, backlogIssues, backlogOf } from './backlog.js'
import {
  type IssueGroup,
  type IssueView,
  defaultIssueView,
  issueColumnsOf,
  issueGroupsOf,
  issuesInView,
  listingKeyOf,
  snapshotMemo,
} from './issueView.js'
import { type SavedView } from './issueViews.js'
import {
  AllProducts,
  type ProductFilter,
  issuesForProductFilter,
} from './leftover.js'
import { type Model } from './model.js'
import { issuesWithEdits } from './rowEdit.js'

/**
 * The Issues loaded so far as a person reads them, none before the first
 * snapshot: a change that waits for its write already shows.
 */
export const loadedIssuesIn = (model: Model): ReadonlyArray<Issue> =>
  model.issues._tag === 'LoadedIssues'
    ? issuesWithEdits(model.issues.issues, model.rowEdits)
    : []

/** A person's saved views, none before the first snapshot. */
export const savedViewsOf = (model: Model): ReadonlyArray<SavedView> =>
  model.savedViews._tag === 'LoadedSavedViews' ? model.savedViews.views : []

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
      Inbox: () => noProductFilter,
      EntityPage: () => noProductFilter,
      Findings: () => noProductFilter,
      Features: () => noProductFilter,
      Products: () => noProductFilter,
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

const columnsMemo = snapshotMemo<ReadonlyArray<IssueGroup>>()

/** The columns of the board its view shows. */
export const listedColumns = (
  model: Model,
  issues: ReadonlyArray<Issue>,
): ReadonlyArray<IssueGroup> => {
  const view = issueViewOf(model)
  return columnsMemo(issues, `${view.grouping}|${listingKeyOf(view)}`, () =>
    issueColumnsOf(listedIssues(model, issues), view.grouping),
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
  const view = issueViewOf(model)
  if (view.layout === 'Board') {
    return Array.flatMap(listedColumns(model, issues), column => column.issues)
  } else if (view.grouping === 'None') {
    return listedIssues(model, issues)
  } else {
    return Array.flatMap(listedGroups(model, issues), group => group.issues)
  }
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
      Inbox: () => [],
      EntityPage: () => [],
      Findings: () => [],
      Features: () => [],
      Products: () => [],
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

/** Whether the page on screen has rows a person selects: the list or the backlog. */
export const isPageOfRows = (model: Model): boolean =>
  model.navigation._tag === 'IssueList' || model.navigation._tag === 'Backlog'

const selectedSets = new WeakMap<ReadonlyArray<string>, ReadonlySet<string>>()

/**
 * The selected Issue ids as a set, read once per selection: every row asks
 * whether it is selected on every paint.
 */
export const selectedSetOf = (model: Model): ReadonlySet<string> =>
  Option.getOrElse(
    Option.fromUndefinedOr(selectedSets.get(model.selectedIssueIds)),
    () => {
      const selected = new Set(model.selectedIssueIds)
      selectedSets.set(model.selectedIssueIds, selected)
      return selected
    },
  )

/**
 * The selected rows a person can see, in the order the page shows them. A row
 * a filter hides stays selected and comes back with the filter, but no change
 * reaches it while it is out of sight.
 */
export const selectedRowsOf = (model: Model): ReadonlyArray<Issue> => {
  if (Array.isReadonlyArrayEmpty(model.selectedIssueIds)) {
    return []
  } else {
    const selected = selectedSetOf(model)
    return Array.filter(rowsInOrderOf(model), issue => selected.has(issue.id))
  }
}

/**
 * The Issues a change applies to now: the one a peek shows, the row whose
 * field was pressed, the one a page shows, the selected rows on screen, or
 * the row under the cursor.
 */
export const issuesInHandOf = (model: Model): ReadonlyArray<string> => {
  if (model.layer._tag === 'PeekLayer') {
    return [model.layer.issueId]
  } else if (
    model.layer._tag === 'ChoiceLayer' &&
    Option.isSome(model.layer.maybePeekedIssueId)
  ) {
    return [model.layer.maybePeekedIssueId.value]
  } else if (
    model.layer._tag === 'ChoiceLayer' &&
    Option.isSome(model.layer.maybeRowIssueId)
  ) {
    return [model.layer.maybeRowIssueId.value]
  } else if (model.navigation._tag === 'IssueDetail') {
    return [model.navigation.issueId]
  } else {
    return Array.match(selectedRowsOf(model), {
      onEmpty: () =>
        Option.match(issueUnderCursorOf(model), {
          onNone: () => [],
          onSome: issue => [issue.id],
        }),
      onNonEmpty: rows => Array.map(rows, issue => issue.id),
    })
  }
}
