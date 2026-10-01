import { Array, Equal, Option } from 'effect'

import type { CarrierDriver, CarrierPlan, CarrierSnapshot } from './carrier.js'
import { History } from './message.js'

// STACK

/** One route of a native stack: the plan key it was written with, and its URI. */
export type KeyedRoute = Readonly<{ key: string; uri: string }>

/**
 * The parts of a native stack navigator the keyed stack driver uses. React
 * Navigation and Expo Router both provide it through a navigation ref once
 * the navigator is ready, so it always holds at least one route: `routes`
 * reads the root state, `reset` dispatches a keyed reset, and `subscribe`
 * listens for state changes.
 */
export type KeyedStack = Readonly<{
  routes: () => Array.NonEmptyReadonlyArray<KeyedRoute>
  reset: (routes: Array.NonEmptyReadonlyArray<KeyedRoute>) => void
  subscribe: (listener: () => void) => () => void
}>

// DRIVER

const routesOf = <Destination>(
  plan: CarrierPlan<Destination>,
): Array.NonEmptyReadonlyArray<KeyedRoute> =>
  Array.map(plan.entries, entry => ({ key: entry.key, uri: entry.uri }))

const isShowing = <Destination>(
  snapshot: CarrierSnapshot,
  plan: CarrierPlan<Destination>,
): boolean =>
  snapshot.uri === plan.uri &&
  Equal.equals(
    snapshot.keys,
    Array.map(plan.entries, entry => entry.key),
  )

/**
 * A carrier driver for a keyed native stack. Every move is one reset to
 * the plan's routes. Routes keep their keys across resets, so a screen
 * whose key is unchanged stays mounted and a pop animates as a pop.
 *
 * @example
 * ```typescript
 * runCarrier(bound, keyedStackDriver(reactNavigationStack(navigationRef)))
 * ```
 */
export const keyedStackDriver = <Destination>(
  stack: KeyedStack,
): CarrierDriver<Destination> => {
  const read = (): CarrierSnapshot => {
    const routes = stack.routes()
    return {
      keys: Array.map(routes, route => route.key),
      uri: Array.lastNonEmpty(routes).uri,
      maybePosition: Option.none(),
    }
  }
  return {
    name: 'keyed-stack',
    read,
    perform: (move, plan) => {
      if (move._tag === 'Unchanged') {
        return Option.none()
      }
      stack.reset(routesOf(plan))
      return Option.some({
        label: `reset(${move._tag})`,
        isMetBy: snapshot => isShowing(snapshot, plan),
      })
    },
    subscribe: listener =>
      stack.subscribe(() => {
        listener({ snapshot: read(), via: History() })
      }),
  }
}
