import { Option, Schema as S } from 'effect'
import { Navigation, Route } from 'foldkit'
import { ts } from 'foldkit/schema'

import { type Model } from './model.js'

// NAVIGATION

/** The Counter page: the named root every navigation stack starts from. */
export const Counter = ts('Counter')
/** The Counter page. */
export type Counter = typeof Counter.Type

const isCounter = S.is(Counter)

/** The Counter's only route: its root, at the Program's slug. */
export const counterRoute = Navigation.rootRoute(
  Route.caseOf(
    Route.here,
    Navigation.tagCase<Counter, Counter>(isCounter, Counter),
  ),
  { title: () => 'Counter' },
)

/**
 * The Counter's navigation: one root Destination at `/counter`. The
 * combinators add the rest. `Session.compose` adds its settings page at
 * `/counter/session` and keeps any unknown path as NotFound, and
 * `ActionMenu.compose` presents the menu at `/counter/menu?q=re`.
 *
 * @example
 * ```typescript
 * Navigation.defaultUri(navigation) // Some('/counter')
 * ```
 */
export const navigation = Navigation.make<Model, Counter>({
  slug: Navigation.Slug.make('counter'),
  Destination: Counter,
  root: Counter(),
  routes: [counterRoute],
})

/** The URI of the Counter page: `/counter`. */
export const counterUri = Option.getOrElse(
  Navigation.defaultUri(navigation),
  () => '/',
)
