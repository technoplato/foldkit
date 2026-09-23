import { pipe } from 'effect'
import { Route } from 'foldkit'
import { literal } from 'foldkit/route'
import { ts } from 'foldkit/schema'

// NAVIGATION

/** The Counter page: the named root every navigation stack starts from. */
export const Counter = ts('Counter')
/** The Counter page. */
export type Counter = typeof Counter.Type

/** Parser-printer for the Counter page. `counterRouter()` prints `/counter`. */
export const counterRouter = pipe(literal('counter'), Route.mapTo(Counter))

/**
 * The Counter's destinations: one page. The action menu adds itself as a
 * presented destination when `ActionMenu.compose` wraps the Counter.
 */
export const navigation = {
  Destination: Counter,
  root: Counter(),
}
