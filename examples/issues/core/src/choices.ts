import { Array, Match as M, Option, Order } from 'effect'

import { type Issue, IssuePriority } from '@foldkit/instant-tools/issues'

import { type Interaction, interaction } from './interaction.js'
import {
  AnyClaimant,
  type IssueGrouping,
  type IssueLayout,
  type IssueSort,
  OneClaimant,
  STATUS_WORKFLOW,
  Unclaimed,
  snapshotMemo,
} from './issueView.js'
import { AllWork, CloseToLanding, WorkingNow } from './landing.js'
import { AllProducts, OneProduct } from './leftover.js'
import { loadedIssuesIn } from './listing.js'
import {
  ClearedPriorityFilter,
  ClearedStatusFilter,
  OpenedChoiceMenu,
  SelectedClaimantFilter,
  SelectedIssueGrouping,
  SelectedIssueLayout,
  SelectedIssueSort,
  SelectedLandingFilter,
  SelectedProductFilter,
  ToggledPriorityFilter,
  ToggledStatusFilter,
} from './message.js'
import { type ChoiceMenu, type Model } from './model.js'

// PRODUCT

/** The product named by a list filter, with its id for the token. */
export type ProductChoice = Readonly<{ id: string; name: string }>

const PREFERRED_PRODUCTS: ReadonlyArray<string> = [
  'foldkit',
  'scribe',
  'instant-data-swift',
  'casino',
  'ayutia',
]

const productsOfIssuesMemo = snapshotMemo<ReadonlyArray<ProductChoice>>()

const productsOfIssues = (
  issues: ReadonlyArray<Issue>,
): ReadonlyArray<ProductChoice> =>
  productsOfIssuesMemo(issues, 'products', () =>
    Array.dedupeWith(
      Array.map(issues, issue => ({
        id: issue.product.id,
        name: issue.product.name,
      })),
      (left, right) => left.id === right.id,
    ),
  )

/**
 * Every product a list can be filtered by: the catalog's and any an Issue
 * names, the ones most worked on first.
 */
export const productChoicesOf = (
  model: Model,
): ReadonlyArray<ProductChoice> => {
  const catalog =
    model.products._tag === 'LoadedProducts'
      ? Array.map(model.products.products, entry => ({
          id: entry.product.id,
          name: entry.product.name,
        }))
      : []
  const every = Array.dedupeWith(
    [...catalog, ...productsOfIssues(loadedIssuesIn(model))],
    (left, right) => left.id === right.id,
  )
  return [
    ...Array.filter(every, product =>
      Array.contains(PREFERRED_PRODUCTS, product.id),
    ),
    ...Array.filter(
      every,
      product => !Array.contains(PREFERRED_PRODUCTS, product.id),
    ),
  ]
}

const allProducts = interaction(
  'product:all',
  'All products',
  SelectedProductFilter.make({ filter: AllProducts.make({}) }),
)

/** A filter by every product there is, `All products` first. */
export const productFilterChoicesOf = (
  model: Model,
): ReadonlyArray<Interaction> => [
  allProducts,
  ...Array.map(productChoicesOf(model), product =>
    interaction(
      `product:${product.id}`,
      product.name,
      SelectedProductFilter.make({
        filter: OneProduct.make({ productId: product.id }),
      }),
    ),
  ),
]

// WORK

/** The three ways to filter the list by where its work is. */
export const landingChoices: ReadonlyArray<Interaction> = [
  interaction(
    'landing:all',
    'All work',
    SelectedLandingFilter.make({ filter: AllWork.make({}) }),
  ),
  interaction(
    'landing:close',
    'Close to landing',
    SelectedLandingFilter.make({ filter: CloseToLanding.make({}) }),
  ),
  interaction(
    'landing:working',
    'Working now',
    SelectedLandingFilter.make({ filter: WorkingNow.make({}) }),
  ),
]

// STATUS

const ANY_TOKEN = 'any'

/** Every status a list can be filtered by, in the order work moves. */
export const statusFilterChoices: ReadonlyArray<Interaction> = [
  interaction(
    `filter-status:${ANY_TOKEN}`,
    'Any status',
    ClearedStatusFilter.make({}),
  ),
  ...Array.map(STATUS_WORKFLOW, status =>
    interaction(
      `filter-status:${status}`,
      status,
      ToggledStatusFilter.make({ status }),
    ),
  ),
]

// PRIORITY

/** Every priority a list can be filtered by, P0 first. */
export const priorityFilterChoices: ReadonlyArray<Interaction> = [
  interaction(
    `filter-priority:${ANY_TOKEN}`,
    'Any priority',
    ClearedPriorityFilter.make({}),
  ),
  ...Array.map(IssuePriority.literals, priority =>
    interaction(
      `filter-priority:${priority}`,
      priority,
      ToggledPriorityFilter.make({ priority }),
    ),
  ),
]

// CLAIMANT

const claimantsMemo = snapshotMemo<ReadonlyArray<string>>()

/** Everyone who holds a claim among the loaded Issues, by name. */
export const claimantsOf = (
  issues: ReadonlyArray<Issue>,
): ReadonlyArray<string> =>
  claimantsMemo(issues, 'claimants', () =>
    Array.sort(
      Array.dedupe(
        Array.flatMap(issues, issue => Option.toArray(issue.claimantId)),
      ),
      Order.String,
    ),
  )

const anyClaimant = interaction(
  `filter-claimant:${ANY_TOKEN}`,
  'Anyone',
  SelectedClaimantFilter.make({ filter: AnyClaimant.make({}) }),
)

const unclaimed = interaction(
  'filter-claimant:unclaimed',
  'Unclaimed',
  SelectedClaimantFilter.make({ filter: Unclaimed.make({}) }),
)

const claimantChoices = new Map<string, Interaction>()

const claimantChoiceOf = (claimantId: string): Interaction =>
  Option.getOrElse(
    Option.fromUndefinedOr(claimantChoices.get(claimantId)),
    () => {
      const choice = interaction(
        `filter-claimant:${claimantId}`,
        claimantId,
        SelectedClaimantFilter.make({
          filter: OneClaimant.make({ claimantId }),
        }),
      )
      claimantChoices.set(claimantId, choice)
      return choice
    },
  )

/** A filter by everyone who holds a claim, by no one, and by anyone. */
export const claimantFilterChoicesOf = (
  model: Model,
): ReadonlyArray<Interaction> => [
  anyClaimant,
  unclaimed,
  ...Array.map(claimantsOf(loadedIssuesIn(model)), claimantChoiceOf),
]

// ORDER

/** What each order of the list's rows is called. */
export const sortNameOf = (sort: IssueSort): string =>
  M.value(sort).pipe(
    M.withReturnType<string>(),
    M.when('Created', () => 'Newest first'),
    M.when('Updated', () => 'Last updated'),
    M.when('Priority', () => 'Most urgent'),
    M.when('Number', () => 'Lowest number'),
    M.exhaustive,
  )

const sortChoice = (sort: IssueSort): Interaction =>
  interaction(
    `sort:${sort.toLowerCase()}`,
    sortNameOf(sort),
    SelectedIssueSort.make({ sort }),
  )

/** Every order of the list's rows. */
export const sortChoices: ReadonlyArray<Interaction> = [
  sortChoice('Created'),
  sortChoice('Updated'),
  sortChoice('Priority'),
  sortChoice('Number'),
]

const groupingChoice = (grouping: IssueGrouping): Interaction =>
  interaction(
    `group:${grouping.toLowerCase()}`,
    grouping,
    SelectedIssueGrouping.make({ grouping }),
  )

/** Every field the list's rows can be grouped under. */
export const groupingChoices: ReadonlyArray<Interaction> = [
  groupingChoice('None'),
  groupingChoice('Status'),
  groupingChoice('Priority'),
  groupingChoice('Product'),
  groupingChoice('Claimant'),
]

const layoutChoice = (layout: IssueLayout): Interaction =>
  interaction(
    `view:${layout.toLowerCase()}`,
    layout,
    SelectedIssueLayout.make({ layout }),
  )

/** The list's rows, or its board. */
export const layoutChoices: ReadonlyArray<Interaction> = [
  layoutChoice('List'),
  layoutChoice('Board'),
]

// MENU

const openMenu = (
  token: string,
  label: string,
  menu: ChoiceMenu,
): Interaction => interaction(token, label, OpenedChoiceMenu.make({ menu }))

/** The filter and order menus the list opens, by the token of their buttons. */
export const listMenuInteractions: ReadonlyArray<Interaction> = [
  openMenu('menu:product', 'Product filter', 'ProductFilter'),
  openMenu('menu:status', 'Status filter', 'StatusFilter'),
  openMenu('menu:priority', 'Priority filter', 'PriorityFilter'),
  openMenu('menu:claimant', 'Claimant filter', 'ClaimantFilter'),
  openMenu('menu:sort', 'Sort', 'Sort'),
  openMenu('menu:group', 'Group', 'Group'),
]

/** Opening the product filter's choices, on the backlog as well as the list. */
export const productMenuInteraction: Interaction = openMenu(
  'menu:product',
  'Product filter',
  'ProductFilter',
)

/**
 * Whether a menu has a field to narrow its rows: the palette and the long lists
 * do. Keys in a menu without a field pick from it directly.
 */
export const menuHasField = (menu: ChoiceMenu): boolean =>
  menu === 'Everything' || menu === 'ProductFilter' || menu === 'ClaimantFilter'

/** Whether a menu stays open after a pick, so more than one can be chosen. */
export const menuStaysOpen = (menu: ChoiceMenu): boolean =>
  menu === 'StatusFilter' || menu === 'PriorityFilter'
