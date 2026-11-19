import { Array, Option, Predicate, Record, Schema as S, pipe } from 'effect'
import { Navigation } from 'foldkit'

import { routeNameFor, uriOfNamedRoute } from './routeNames.js'

// ROUTE

/**
 * The root slot Expo Router mounts the app's root layout in. The layout's
 * stack is the state nested under it.
 */
export const rootSlotName = '__root'

/** The catch-all route file every Foldkit entry renders through: `app/[...path].tsx`. */
export const catchAllRouteName = '[...path]'

/** The index route file the bare `/` renders through: `app/index.tsx`. */
export const indexRouteName = 'index'

/** One route of the root layout's stack, as Expo Router reads and writes it. */
export type RouterRoute = Readonly<{
  key: string
  name: string
  params: Readonly<Record<string, string | ReadonlyArray<string>>>
}>

/**
 * The route that shows one keyed entry, among the route files Expo Router
 * holds: the file its address fits, with the values it reads as params
 * and its query beside them, as Expo Router writes a URL into params. An
 * address no file fits, and every address in an app with no generated
 * files, goes through the catch-all with its segments as `path`.
 *
 * @example
 * ```typescript
 * routerRouteOf({ key: '/counter/menu', uri: '/counter/menu?menu.q=re' })
 * // { key: '/counter/menu', name: '[...path]', params: { 'menu.q': 're', path: ['counter', 'menu'] } }
 * routerRouteOf({ key: '/books/a-title', uri: '/books/a-title' }, ['books/[slug]/index'])
 * // { key: '/books/a-title', name: 'books/[slug]/index', params: { slug: 'a-title' } }
 * ```
 */
export const routerRouteOf = (
  route: Navigation.KeyedRoute,
  routeNames: ReadonlyArray<string> = [],
): RouterRoute => {
  const { segments, search } = Navigation.splitUri(route.uri)
  const named = routeNameFor(
    segments,
    Array.filter(
      routeNames,
      name => name !== indexRouteName && !isRoutersOwn(name),
    ),
  )
  return {
    key: route.key,
    name: named.name,
    params: {
      ...Record.fromEntries(Navigation.queryPairsOf(search)),
      ...named.params,
    },
  }
}

const PathParam = S.Union([S.Array(S.String), S.String])

const decodePath = S.decodeUnknownOption(PathParam)

const segmentsOf = (
  params: Readonly<Record<string, unknown>>,
): ReadonlyArray<string> =>
  pipe(
    Option.fromNullishOr(params['path']),
    Option.flatMap(decodePath),
    Option.map(path => (typeof path === 'string' ? [path] : path)),
    Option.getOrElse(() => []),
  )

const queryEntryOf = ([key, value]: readonly [string, unknown]): Option.Option<
  [string, string]
> =>
  key !== 'path' && typeof value === 'string'
    ? Option.some([key, value])
    : Option.none()

const queryPairsOfParams = (
  params: Readonly<Record<string, unknown>>,
): ReadonlyArray<[string, string]> =>
  Array.getSomes(Array.map(Record.toEntries(params), queryEntryOf))

// NOTE: Expo Router keeps routes of its own beside an app's, `+not-found`
// and `_sitemap`. They show no address of the Program.
const isRoutersOwn = (name: string): boolean =>
  name.startsWith('+') || name.startsWith('_')

const pathParamNamesOf = (name: string): ReadonlyArray<string> =>
  Array.flatMap(name.split('/'), part =>
    part.startsWith('[') && part.endsWith(']') ? [part.slice(1, -1)] : [],
  )

/**
 * The URI a route of the layout's stack shows: its segments, then its
 * query. The index route shows `/`, and a generated route file shows its
 * own path with its params in place.
 *
 * @example
 * ```typescript
 * uriOfRoute({ name: '[...path]', params: { path: ['counter', 'menu'], 'menu.q': 're' } })
 * // Some('/counter/menu?menu.q=re')
 * ```
 */
export const uriOfRoute = (
  route: Readonly<{ name: string; params?: unknown }>,
): Option.Option<string> => {
  const params = Option.getOrElse(
    S.decodeUnknownOption(S.Record(S.String, S.Unknown))(route.params),
    () => ({}),
  )
  if (route.name === catchAllRouteName || route.name === indexRouteName) {
    return Option.some(
      Navigation.pathAndUri({
        segments: segmentsOf(params),
        queryParams: queryPairsOfParams(params),
      }).uri,
    )
  }
  if (isRoutersOwn(route.name)) {
    return Option.none()
  }
  const pathParams = pathParamNamesOf(route.name)
  return Option.map(
    uriOfNamedRoute(route.name, params),
    segments =>
      Navigation.pathAndUri({
        segments,
        queryParams: Array.filter(
          queryPairsOfParams(params),
          ([key]) => !Array.contains(pathParams, key),
        ),
      }).uri,
  )
}

// REF

/** One route of Expo Router's root state: the root slot and its siblings. */
type RootRoute = Readonly<{
  key: string
  name: string
  state?: unknown
}>

/** The root state Expo Router's container ref reads. */
type RootState = Readonly<{ routes: ReadonlyArray<RootRoute> }>

/** The root state a reset writes: the root slot, with the layout's stack in it. */
export type RootReset = Readonly<{
  index: number
  routes: Array<{
    key: string
    name: string
    state: { index: number; routes: Array<RouterRoute> }
  }>
}>

/**
 * The parts of Expo Router's container ref, from `useNavigationContainerRef`,
 * that the router stack reads and resets.
 */
export type RouterRefLike = Readonly<{
  getRootState: () => RootState | undefined
  resetRoot: (state: RootReset) => void
  addListener: (type: 'state', listener: () => void) => () => void
}>

const LayoutState = S.Struct({
  routes: S.Array(
    S.Struct({ key: S.String, name: S.String, params: S.optional(S.Unknown) }),
  ),
  routeNames: S.optional(S.Array(S.String)),
})

const decodeLayoutState = S.decodeUnknownOption(LayoutState)

const rootSlotOf = (state: RootState): Option.Option<RootRoute> =>
  Array.findFirst(state.routes, route => route.name === rootSlotName)

const layoutStateOf = (slot: RootRoute): Readonly<Record<string, unknown>> =>
  Predicate.isObject(slot.state) ? slot.state : {}

type Written = Readonly<{ route: Navigation.KeyedRoute; shown: string }>

/**
 * A keyed stack over the root layout's Expo Router stack. A reset writes
 * the plan's routes into the root slot and keeps the slot's key, so the
 * layout stays mounted and unchanged screens keep theirs. A route Expo
 * Router opened from a URL reads as that URL; a route this stack wrote
 * reads as the URI it was written with.
 *
 * @example
 * ```typescript
 * Navigation.runCarrier(
 *   bound,
 *   Navigation.keyedStackDriver(expoRouterStack(useNavigationContainerRef(), routes)),
 * )
 * ```
 */
export const expoRouterStack = (
  ref: RouterRefLike,
  initialRoutes: Array.NonEmptyReadonlyArray<Navigation.KeyedRoute>,
): Navigation.KeyedStack => {
  let lastRoutes = initialRoutes
  const written = new Map<string, Written>()

  const keyedRouteOf = (
    route: Readonly<{ key: string; name: string; params?: unknown }>,
  ): Option.Option<Navigation.KeyedRoute> =>
    Option.map(uriOfRoute(route), shown =>
      pipe(
        Option.fromNullishOr(written.get(route.key)),
        Option.filter(remembered => remembered.shown === shown),
        Option.match({
          onNone: () => ({ key: route.key, uri: shown }),
          onSome: remembered => remembered.route,
        }),
      ),
    )

  const readRoutes = (): ReadonlyArray<Navigation.KeyedRoute> =>
    pipe(
      Option.fromNullishOr(ref.getRootState()),
      Option.flatMap(rootSlotOf),
      Option.flatMap(slot => decodeLayoutState(slot.state)),
      Option.map(layout =>
        Array.getSomes(Array.map(layout.routes, keyedRouteOf)),
      ),
      Option.getOrElse(() => []),
    )

  const routes = (): Array.NonEmptyReadonlyArray<Navigation.KeyedRoute> => {
    const read = readRoutes()
    if (Array.isReadonlyArrayNonEmpty(read)) {
      lastRoutes = read
    }
    return lastRoutes
  }

  const reset = (
    next: Array.NonEmptyReadonlyArray<Navigation.KeyedRoute>,
  ): void => {
    const routeNames = pipe(
      Option.fromNullishOr(ref.getRootState()),
      Option.flatMap(rootSlotOf),
      Option.flatMap(slot => decodeLayoutState(slot.state)),
      Option.flatMap(layout => Option.fromNullishOr(layout.routeNames)),
      Option.getOrElse((): ReadonlyArray<string> => []),
    )
    const nextRoutes = Array.map(next, route =>
      routerRouteOf(route, routeNames),
    )
    Array.forEach(next, route => {
      const maybeShown = uriOfRoute(routerRouteOf(route, routeNames))
      if (Option.isSome(maybeShown)) {
        written.set(route.key, { route, shown: maybeShown.value })
      }
    })
    const maybeRootState = Option.fromNullishOr(ref.getRootState())
    const maybeSlot = Option.flatMap(maybeRootState, rootSlotOf)
    if (Option.isSome(maybeRootState) && Option.isSome(maybeSlot)) {
      lastRoutes = next
      // NOTE: the root and layout states are spread in, so their keys and
      // `stale: false` survive. React Navigation then uses them as given
      // instead of minting new keys, and Expo Router's web linking sees the
      // same states and pushes or pops browser history instead of
      // replacing the URL.
      ref.resetRoot({
        ...maybeRootState.value,
        index: 0,
        routes: [
          {
            ...maybeSlot.value,
            name: rootSlotName,
            state: {
              ...layoutStateOf(maybeSlot.value),
              index: next.length - 1,
              routes: nextRoutes,
            },
          },
        ],
      })
    }
  }

  return {
    routes,
    reset,
    subscribe: listener => ref.addListener('state', listener),
  }
}
