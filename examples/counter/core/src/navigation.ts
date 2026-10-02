import { Navigation, Route } from 'foldkit'
import { ts } from 'foldkit/schema'

// NAVIGATION

/** The Counter page: the named root every navigation stack starts from. */
export const Counter = ts('Counter')
/** The Counter page. */
export type Counter = typeof Counter.Type

/**
 * The Counter's navigation: one screen, its root at `/counter`. The
 * combinators add the rest. `Session.compose` adds its settings page at
 * `/counter/session` and keeps any unknown path as NotFound, and
 * `ActionMenu.compose` presents the menu at `/counter/menu?menu.q=re`.
 *
 * @example
 * ```typescript
 * Navigation.defaultUri(navigation) // Some('/counter')
 * ```
 */
export const navigation = Navigation.screens({
  slug: 'counter',
  root: Navigation.rootScreen(Counter, Route.here, { title: () => 'Counter' }),
})

/** The URI of the Counter page, `/counter`, which its device chrome shows. */
export const maybeCounterUri = Navigation.defaultUri(navigation)
