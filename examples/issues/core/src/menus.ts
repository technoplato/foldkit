import { Array, Match as M, Option, pipe } from 'effect'

import {
  claimantFilterChoicesOf,
  groupingChoices,
  priorityFilterChoices,
  productFilterChoicesOf,
  sortChoices,
  statusFilterChoices,
} from './choices.js'
import { type Interaction } from './interaction.js'
import { type IssueView, issuesInView, snapshotMemo } from './issueView.js'
import { issueViewOf, loadedIssuesIn } from './listing.js'
import { type ChoiceMenu, type Model } from './model.js'
import { matchedByName, paletteRowsOf } from './palette.js'

/** One row of a layer of choices: its interaction, and the words beside it. */
export type MenuRow = Readonly<{
  action: Interaction
  isChosen: boolean
  count: Option.Option<number>
}>

const tallyMemo = snapshotMemo<ReadonlyMap<string, number>>()

const tallyOf = (
  model: Model,
  key: string,
  view: IssueView,
  nameOf: (issue: ReturnType<typeof loadedIssuesIn>[number]) => string,
): ReadonlyMap<string, number> => {
  const issues = loadedIssuesIn(model)
  return tallyMemo(issues, key, () => {
    const tally = new Map<string, number>()
    Array.forEach(issuesInView(issues, view), issue => {
      const name = nameOf(issue)
      tally.set(name, (tally.get(name) ?? 0) + 1)
    })
    return tally
  })
}

const countsKey = (view: IssueView, field: string): string =>
  `${field}|${view.query}|${view.sort}|${view.landing._tag}|${view.product._tag === 'OneProduct' ? view.product.productId : ''}|${view.statuses.join(',')}|${view.priorities.join(',')}|${view.claimant._tag === 'OneClaimant' ? view.claimant.claimantId : view.claimant._tag}`

const plainRow = (action: Interaction): MenuRow => ({
  action,
  count: Option.none(),
  isChosen: false,
})

const totalOf = (tally: ReadonlyMap<string, number>): number =>
  Array.reduce(
    Array.fromIterable(tally.values()),
    0,
    (sum, count) => sum + count,
  )

const statusRows = (model: Model): ReadonlyArray<MenuRow> => {
  const view = issueViewOf(model)
  const others = { ...view, statuses: [] }
  const tally = tallyOf(
    model,
    countsKey(others, 'status'),
    others,
    issue => issue.status,
  )
  return Array.map(statusFilterChoices, action =>
    action.message._tag === 'ToggledStatusFilter'
      ? {
          action,
          count: Option.some(tally.get(action.message.status) ?? 0),
          isChosen: Array.contains(view.statuses, action.message.status),
        }
      : {
          action,
          count: Option.some(totalOf(tally)),
          isChosen: Array.isReadonlyArrayEmpty(view.statuses),
        },
  )
}

const priorityRows = (model: Model): ReadonlyArray<MenuRow> => {
  const view = issueViewOf(model)
  const others = { ...view, priorities: [] }
  const tally = tallyOf(
    model,
    countsKey(others, 'priority'),
    others,
    issue => issue.priority,
  )
  return Array.map(priorityFilterChoices, action =>
    action.message._tag === 'ToggledPriorityFilter'
      ? {
          action,
          count: Option.some(tally.get(action.message.priority) ?? 0),
          isChosen: Array.contains(view.priorities, action.message.priority),
        }
      : {
          action,
          count: Option.some(totalOf(tally)),
          isChosen: Array.isReadonlyArrayEmpty(view.priorities),
        },
  )
}

const productRows = (model: Model): ReadonlyArray<MenuRow> => {
  const view = issueViewOf(model)
  const others: IssueView = {
    ...view,
    product: { _tag: 'AllProducts' },
  }
  const tally = tallyOf(
    model,
    countsKey(others, 'product'),
    others,
    issue => issue.product.id,
  )
  return Array.map(productFilterChoicesOf(model), action =>
    action.message._tag === 'SelectedProductFilter' &&
    action.message.filter._tag === 'OneProduct'
      ? {
          action,
          count: Option.some(tally.get(action.message.filter.productId) ?? 0),
          isChosen:
            view.product._tag === 'OneProduct' &&
            view.product.productId === action.message.filter.productId,
        }
      : {
          action,
          count: Option.some(totalOf(tally)),
          isChosen: view.product._tag === 'AllProducts',
        },
  )
}

const UNCLAIMED_NAME = 'unclaimed'

const claimantRows = (model: Model): ReadonlyArray<MenuRow> => {
  const view = issueViewOf(model)
  const others: IssueView = { ...view, claimant: { _tag: 'AnyClaimant' } }
  const tally = tallyOf(model, countsKey(others, 'claimant'), others, issue =>
    Option.getOrElse(issue.claimantId, () => UNCLAIMED_NAME),
  )
  return Array.map(claimantFilterChoicesOf(model), action =>
    M.value(action.message).pipe(
      M.withReturnType<MenuRow>(),
      M.when({ _tag: 'SelectedClaimantFilter' }, ({ filter }) =>
        M.value(filter).pipe(
          M.withReturnType<MenuRow>(),
          M.tagsExhaustive({
            AnyClaimant: () => ({
              action,
              count: Option.some(totalOf(tally)),
              isChosen: view.claimant._tag === 'AnyClaimant',
            }),
            Unclaimed: () => ({
              action,
              count: Option.some(tally.get(UNCLAIMED_NAME) ?? 0),
              isChosen: view.claimant._tag === 'Unclaimed',
            }),
            OneClaimant: ({ claimantId }) => ({
              action,
              count: Option.some(tally.get(claimantId) ?? 0),
              isChosen:
                view.claimant._tag === 'OneClaimant' &&
                view.claimant.claimantId === claimantId,
            }),
          }),
        ),
      ),
      M.orElse(() => plainRow(action)),
    ),
  )
}

const sortRows = (model: Model): ReadonlyArray<MenuRow> =>
  Array.map(sortChoices, action => ({
    action,
    count: Option.none(),
    isChosen:
      action.message._tag === 'SelectedIssueSort' &&
      action.message.sort === issueViewOf(model).sort,
  }))

const groupRows = (model: Model): ReadonlyArray<MenuRow> =>
  Array.map(groupingChoices, action => ({
    action,
    count: Option.none(),
    isChosen:
      action.message._tag === 'SelectedIssueGrouping' &&
      action.message.grouping === issueViewOf(model).grouping,
  }))

const narrowedByField = (
  rows: ReadonlyArray<MenuRow>,
  query: string,
): ReadonlyArray<MenuRow> => {
  if (query.trim() === '') {
    return rows
  } else {
    const matched = matchedByName(
      Array.map(rows, row => row.action),
      query,
    )
    return Array.flatMap(matched, action =>
      Array.filter(rows, row => row.action === action),
    )
  }
}

/**
 * The rows a layer of choices lists now: the palette's, or one filter's with
 * how many Issues each choice shows, the current one marked, narrowed by what
 * is typed.
 */
export const menuRowsOf = (
  model: Model,
  menu: ChoiceMenu,
  query: string,
): ReadonlyArray<MenuRow> =>
  M.value(menu).pipe(
    M.withReturnType<ReadonlyArray<MenuRow>>(),
    M.when('Everything', () =>
      pipe(paletteRowsOf(model, query), Array.map(plainRow)),
    ),
    M.when('ProductFilter', () => narrowedByField(productRows(model), query)),
    M.when('StatusFilter', () => statusRows(model)),
    M.when('PriorityFilter', () => priorityRows(model)),
    M.when('ClaimantFilter', () => narrowedByField(claimantRows(model), query)),
    M.when('Sort', () => sortRows(model)),
    M.when('Group', () => groupRows(model)),
    M.exhaustive,
  )

/** The rows of the layer on screen, none when no choices show. */
export const openMenuRowsOf = (model: Model): ReadonlyArray<MenuRow> =>
  model.layer._tag === 'ChoiceLayer'
    ? menuRowsOf(model, model.layer.menu, model.layer.query)
    : []
