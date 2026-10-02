import { Array, Option, Schema as S, String, pipe } from 'effect'

import * as Declaration from '../../navigation/declaration.js'
import {
  Dialog,
  type NavigationStack,
  Push,
  presented,
  stackAtRoot,
} from '../../navigation/structure.js'
import * as Route from '../../route/parser.js'
import { ts } from '../../schema/index.js'

// DESTINATION

export const Counter = ts('Counter')
export type Counter = typeof Counter.Type

export const SessionSettings = ts('SessionSettings')
export type SessionSettings = typeof SessionSettings.Type

export const ActionMenu = ts('ActionMenu', {
  query: S.String,
  focus: S.Number,
})
export type ActionMenu = typeof ActionMenu.Type

export const Destination = S.Union([
  Counter,
  SessionSettings,
  ActionMenu,
  Declaration.NotFound,
])
export type Destination = typeof Destination.Type

const isCounter = S.is(Counter)
export const isSessionSettings = S.is(SessionSettings)
const isActionMenu = S.is(ActionMenu)

// MODEL

export type Model = Readonly<{
  count: number
  preferredFocus: number
  isFollowing: boolean
  navigation: NavigationStack<Destination>
}>

// ROUTE

const MenuQuery = S.Struct({ q: S.optionalKey(S.String) })
type MenuQuery = typeof MenuQuery.Type

const menuQueryOf = (query: string): MenuQuery =>
  String.isEmpty(query) ? {} : { q: query }

export const counterRoute = Declaration.rootRoute(
  Route.caseOf(
    Route.here,
    Declaration.tagCase<Destination, Counter>(isCounter, Counter),
  ),
  { title: () => 'Counter' },
)

export const sessionRoute = Declaration.pushRoute(
  Route.caseOf(
    Route.literal('session'),
    Declaration.tagCase<Destination, SessionSettings>(
      isSessionSettings,
      SessionSettings,
    ),
  ),
  {
    isAllowedAbove: beneath => isCounter(Array.lastNonEmpty(beneath)),
    title: () => 'Session',
  },
)

export const menuRoute = Declaration.presentRoute(
  Route.caseOf<Destination, MenuQuery>(
    pipe(Route.literal('menu'), Route.query(MenuQuery)),
    {
      embed: ({ q }) => ActionMenu({ query: q ?? '', focus: 0 }),
      extract: destination =>
        Option.map(
          Option.liftPredicate(destination, isActionMenu),
          ({ query }) => menuQueryOf(query),
        ),
    },
  ),
  Dialog(),
  {
    isAllowedAbove: beneath => !Array.some(beneath, isActionMenu),
    title: () => 'Actions',
  },
)

export const notFoundRoute = Declaration.notFoundRoute<Destination>(
  Option.liftPredicate(Declaration.isNotFound),
  notFound => notFound,
)

// NAVIGATION

const settleMenuFocus = (
  model: Model,
  destination: Destination,
): Destination =>
  isActionMenu(destination)
    ? ActionMenu({ query: destination.query, focus: model.preferredFocus })
    : destination

export const navigation = Declaration.make<Model, Destination>({
  slug: Declaration.Slug.make('counter'),
  Destination,
  root: Counter(),
  routes: [counterRoute, sessionRoute, menuRoute, notFoundRoute],
  stack: {
    get: model => Option.some(model.navigation),
    set: (model, nextNavigation) => ({ ...model, navigation: nextNavigation }),
  },
  settleEntry: settleMenuFocus,
  historyOf: model => (model.isFollowing ? 'Replace' : 'Record'),
})

export const model = (overrides: Partial<Model> = {}): Model => ({
  count: 0,
  preferredFocus: 0,
  isFollowing: false,
  navigation: stackAtRoot<Destination>(Counter()),
  ...overrides,
})

export const menu = (query: string, focus = 0): Destination =>
  ActionMenu({ query, focus })

export const sessionEntry = presented<Destination>(SessionSettings(), Push())

export const menuEntry = (query: string, focus = 0) =>
  presented<Destination>(menu(query, focus), Dialog())
