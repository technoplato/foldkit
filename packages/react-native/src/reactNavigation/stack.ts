import { Array, Match as M, Option, Schema as S, pipe } from 'effect'
import type { Navigation } from 'foldkit'

// STATE

/** The one route name every Foldkit stack entry uses; the key carries identity. */
export const entryRouteName = 'FoldkitEntry'

/** One React Navigation route as a Foldkit stack writes it. */
export type EntryRoute = Readonly<{
  key: string
  name: typeof entryRouteName
  params: Readonly<{ uri: string }>
}>

/**
 * The React Navigation state for a plan: one keyed route per entry. The
 * routes array is mutable because `resetRoot` takes React Navigation's
 * own state type.
 */
export type EntryState = Readonly<{
  index: number
  routes: Array.NonEmptyArray<EntryRoute>
}>

const routeOf = (route: Navigation.KeyedRoute): EntryRoute => ({
  key: route.key,
  name: entryRouteName,
  params: { uri: route.uri },
})

/**
 * The navigation state that shows a list of keyed routes, top last.
 *
 * @example
 * ```typescript
 * entryStateOf([{ key: '/counter', uri: '/counter' }])
 * // { index: 0, routes: [{ key: '/counter', name: 'FoldkitEntry', params: { uri: '/counter' } }] }
 * ```
 */
export const entryStateOf = (
  routes: Array.NonEmptyReadonlyArray<Navigation.KeyedRoute>,
): EntryState => ({
  index: routes.length - 1,
  routes: Array.map(routes, routeOf),
})

/** The keyed routes a plan shows, root first. */
export const keyedRoutesOf = <Destination>(
  plan: Navigation.CarrierPlan<Destination>,
): Array.NonEmptyReadonlyArray<Navigation.KeyedRoute> =>
  Array.map(plan.entries, entry => ({ key: entry.key, uri: entry.uri }))

// PRESENTATION

/** How a native stack presents one route. */
export type NativePresentation =
  | 'card'
  | 'modal'
  | 'transparentModal'
  | 'fullScreenModal'
  | 'formSheet'

/**
 * The native stack presentation for an entry's style. The root and pushed
 * pages slide in as cards; sheets present as form sheets; a dialog, a
 * popover, and a drawer float over the page beneath.
 *
 * @example
 * ```typescript
 * presentationOf(Option.some(Navigation.Dialog())) // 'transparentModal'
 * ```
 */
export const presentationOf = (
  maybeStyle: Option.Option<Navigation.PresentationStyle>,
): NativePresentation =>
  Option.match(maybeStyle, {
    onNone: () => 'card',
    onSome: style =>
      M.value(style).pipe(
        M.withReturnType<NativePresentation>(),
        M.tagsExhaustive({
          Push: () => 'card',
          Sheet: () => 'formSheet',
          BottomSheet: () => 'formSheet',
          FullScreenCover: () => 'fullScreenModal',
          Dialog: () => 'transparentModal',
          Popover: () => 'transparentModal',
          Drawer: () => 'transparentModal',
        }),
      ),
  })

// REF

/**
 * The parts of a React Navigation container ref the keyed stack uses. A
 * `NavigationContainerRef` satisfies it once the container is ready.
 */
export type NavigationRefLike = Readonly<{
  getRootState: () =>
    | Readonly<{
        routes: ReadonlyArray<
          Readonly<{ key: string; params?: object | undefined }>
        >
      }>
    | undefined
  resetRoot: (state: EntryState) => void
  addListener: (type: 'state', listener: () => void) => () => void
}>

const EntryParams = S.Struct({ uri: S.String })

const decodeParams = S.decodeUnknownOption(EntryParams)

const readRoutes = (
  ref: NavigationRefLike,
): ReadonlyArray<Navigation.KeyedRoute> =>
  pipe(
    Option.fromNullishOr(ref.getRootState()),
    Option.map(state =>
      Array.getSomes(
        Array.map(state.routes, route =>
          Option.map(decodeParams(route.params), ({ uri }) => ({
            key: route.key,
            uri,
          })),
        ),
      ),
    ),
    Option.getOrElse(() => []),
  )

/**
 * A keyed stack over a React Navigation container. Every move resets the
 * root state to the plan's keyed routes, so unchanged screens stay mounted
 * and a pop animates as a pop. Until the container reports routes, it
 * reads as the routes it started with.
 *
 * @example
 * ```typescript
 * Navigation.runCarrier(
 *   bound,
 *   Navigation.keyedStackDriver(reactNavigationStack(navigationRef, initialRoutes)),
 * )
 * ```
 */
export const reactNavigationStack = (
  ref: NavigationRefLike,
  initialRoutes: Array.NonEmptyReadonlyArray<Navigation.KeyedRoute>,
): Navigation.KeyedStack => {
  let lastRoutes = initialRoutes
  const routes = (): Array.NonEmptyReadonlyArray<Navigation.KeyedRoute> => {
    const read = readRoutes(ref)
    if (Array.isReadonlyArrayNonEmpty(read)) {
      lastRoutes = read
    }
    return lastRoutes
  }
  return {
    routes,
    reset: next => {
      lastRoutes = next
      ref.resetRoot(entryStateOf(next))
    },
    subscribe: listener => ref.addListener('state', listener),
  }
}
