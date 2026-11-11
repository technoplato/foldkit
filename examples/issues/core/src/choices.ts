import { Array, Match as M, Option, Order } from 'effect'

import {
  type Issue,
  IssuePriority,
  type IssueStatus,
  type TrackedProduct,
} from '@foldkit/instant-tools/issues'

import { type InboxFilter } from './inbox.js'
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
import { type SavedView } from './issueViews.js'
import { AllWork, CloseToLanding, WorkingNow } from './landing.js'
import { AllProducts, OneProduct } from './leftover.js'
import { loadedIssuesIn, savedViewsOf } from './listing.js'
import {
  AppliedRowChange,
  ClearedPriorityFilter,
  ClearedStatusFilter,
  OpenedChoiceMenu,
  OpenedNavigation,
  SelectedClaimantFilter,
  SelectedInboxKind,
  SelectedIssueGrouping,
  SelectedIssueLayout,
  SelectedIssueSort,
  SelectedLandingFilter,
  SelectedProductFilter,
  ToggledPriorityFilter,
  ToggledStatusFilter,
} from './message.js'
import { type ChoiceMenu, type Model } from './model.js'
import { listPathOfSearch, pathToNavigation } from './route.js'
import {
  ChangedPriority,
  ChangedProduct,
  ChangedStatus,
  ClaimedByAuthor,
  ClaimedFor,
  ReleasedClaim,
} from './rowEdit.js'

// PRODUCT

const PREFERRED_PRODUCTS: ReadonlyArray<string> = [
  'foldkit',
  'scribe',
  'instant-data-swift',
  'casino',
  'ayutia',
]

const productsOfIssuesMemo = snapshotMemo<ReadonlyArray<TrackedProduct>>()

const productsOfIssues = (
  issues: ReadonlyArray<Issue>,
): ReadonlyArray<TrackedProduct> =>
  productsOfIssuesMemo(issues, 'products', () => {
    const byId = new Map<string, TrackedProduct>()
    Array.forEach(issues, ({ product }) => {
      if (!byId.has(product.id)) {
        byId.set(product.id, product)
      }
    })
    return Array.fromIterable(byId.values())
  })

/**
 * Every product a list can be filtered by: the catalog's and any an Issue
 * names, the ones most worked on first.
 */
export const productChoicesOf = (
  model: Model,
): ReadonlyArray<TrackedProduct> => {
  const catalog =
    model.products._tag === 'LoadedProducts'
      ? Array.map(model.products.products, entry => entry.product)
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

// TRIAGE

const STATUS_KEY: Readonly<Record<IssueStatus, string>> = {
  Addressing: 'd',
  Backlog: 'b',
  Blocked: 'l',
  Closed: 'c',
  FeedbackRequested: 'f',
  Fixed: 'x',
  InProgress: 'i',
  NeedsUserInput: 'u',
  Open: 'o',
  PartiallyDone: 'h',
  Planned: 'n',
  Regressed: 'r',
  Resolved: 'e',
  VerificationNeeded: 'v',
  Verified: 'y',
}

/** Every status an Issue can be set to, in the order work moves, each with a key. */
export const statusChangeChoices: ReadonlyArray<Interaction> = Array.map(
  STATUS_WORKFLOW,
  status =>
    interaction(
      `set-status:${status}`,
      status,
      AppliedRowChange.make({ change: ChangedStatus.make({ status }) }),
      [STATUS_KEY[status]],
    ),
)

/** Every priority an Issue can be set to, P0 first, each with its digit. */
export const priorityChangeChoices: ReadonlyArray<Interaction> = Array.map(
  IssuePriority.literals,
  priority =>
    interaction(
      `set-priority:${priority}`,
      priority,
      AppliedRowChange.make({ change: ChangedPriority.make({ priority }) }),
      [priority.slice(1)],
    ),
)

/** The person signed in claims the Issues in hand. */
export const claimAsMe: Interaction = interaction(
  'claim:me',
  'Claim as me',
  AppliedRowChange.make({ change: ClaimedByAuthor.make({}) }),
)

/** The claim on the Issues in hand is let go. */
export const releaseClaim: Interaction = interaction(
  'claim:release',
  'Release the claim',
  AppliedRowChange.make({ change: ReleasedClaim.make({}) }),
)

const claimForChoices = new Map<string, Interaction>()

const claimForChoiceOf = (claimantId: string): Interaction =>
  Option.getOrElse(
    Option.fromUndefinedOr(claimForChoices.get(claimantId)),
    () => {
      const choice = interaction(
        `claim:${claimantId}`,
        `Claim for ${claimantId}`,
        AppliedRowChange.make({ change: ClaimedFor.make({ claimantId }) }),
      )
      claimForChoices.set(claimantId, choice)
      return choice
    },
  )

/** Claiming the Issues in hand: as me, letting go, or for anyone who holds a claim. */
export const claimChoicesOf = (model: Model): ReadonlyArray<Interaction> => [
  claimAsMe,
  releaseClaim,
  ...Array.map(claimantsOf(loadedIssuesIn(model)), claimForChoiceOf),
]

const productChanges = new Map<string, Interaction>()

const productChangeOf = (product: TrackedProduct): Interaction =>
  Option.getOrElse(
    Option.fromUndefinedOr(productChanges.get(product.id)),
    () => {
      const choice = interaction(
        `set-product:${product.id}`,
        product.name,
        AppliedRowChange.make({ change: ChangedProduct.make({ product }) }),
      )
      productChanges.set(product.id, choice)
      return choice
    },
  )

/** Every product an Issue can move to, the ones most worked on first. */
export const productChangeChoicesOf = (
  model: Model,
): ReadonlyArray<Interaction> =>
  Array.map(productChoicesOf(model), productChangeOf)

// INBOX

const inboxChoice = (
  kind: InboxFilter,
  token: string,
  label: string,
): Interaction => interaction(token, label, SelectedInboxKind.make({ kind }))

/** The kinds the inbox narrows to. */
export const inboxChoices: ReadonlyArray<Interaction> = [
  inboxChoice('All', 'inbox:all', 'All'),
  inboxChoice('Status', 'inbox:status', 'Status'),
  inboxChoice('Claim', 'inbox:claim', 'Claims'),
  inboxChoice('Mention', 'inbox:mention', 'Mentions'),
]

// VIEWS

const viewChoices = new WeakMap<SavedView, Interaction>()

/** Opening one saved view, made once per stored row. */
export const viewChoiceOf = (view: SavedView): Interaction =>
  Option.getOrElse(Option.fromUndefinedOr(viewChoices.get(view)), () => {
    const choice = interaction(
      `view-open:${view.id}`,
      view.name,
      OpenedNavigation.make({
        navigation: pathToNavigation(listPathOfSearch(view.query)),
      }),
    )
    viewChoices.set(view, choice)
    return choice
  })

/** Opening each of a person's saved views. */
export const viewChoicesOf = (model: Model): ReadonlyArray<Interaction> =>
  Array.map(savedViewsOf(model), viewChoiceOf)

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
  openMenu('menu:views', 'Saved views', 'SavedViews'),
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
  menu === 'Everything' ||
  menu === 'ProductFilter' ||
  menu === 'ClaimantFilter' ||
  menu === 'SetClaim' ||
  menu === 'SetProduct' ||
  menu === 'SavedViews'

/** Whether a menu stays open after a pick, so more than one can be chosen. */
export const menuStaysOpen = (menu: ChoiceMenu): boolean =>
  menu === 'StatusFilter' || menu === 'PriorityFilter'
