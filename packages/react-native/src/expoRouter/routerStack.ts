import { Array, Option, Record, Schema as S, String, pipe } from 'effect'
import { Navigation } from 'foldkit'

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

const queryEntriesOf = (
  search: string,
): ReadonlyArray<readonly [string, string]> =>
  Array.fromIterable(new URLSearchParams(search).entries())

/**
 * The catch-all route that shows one keyed entry: its segments as `path`,
 * its query beside them, as Expo Router writes a URL into params.
 *
 * @example
 * ```typescript
 * routerRouteOf({ key: '/counter/menu', uri: '/counter/menu?q=re' })
 * // { key: '/counter/menu', name: '[...path]', params: { q: 're', path: ['counter', 'menu'] } }
 * ```
 */
export const routerRouteOf = (route: Navigation.KeyedRoute): RouterRoute => {
  const { segments, search } = Navigation.splitUri(route.uri)
  return {
    key: route.key,
    name: catchAllRouteName,
    params: { ...Record.fromEntries(queryEntriesOf(search)), path: segments },
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

const queryOf = (params: Readonly<Record<string, unknown>>): string =>
  new URLSearchParams(
    Array.getSomes(Array.map(Record.toEntries(params), queryEntryOf)),
  ).toString()

/**
 * The URI a route of the layout's stack shows: its segments, then its
 * query. The index route shows `/`.
 *
 * @example
 * ```typescript
 * uriOfRoute({ name: '[...path]', params: { path: ['counter', 'menu'], q: 're' } })
 * // Some('/counter/menu?q=re')
 * ```
 */
export const uriOfRoute = (
  route: Readonly<{ name: string; params?: unknown }>,
): Option.Option<string> => {
  if (route.name !== catchAllRouteName && route.name !== indexRouteName) {
    return Option.none()
  }
  const params = Option.getOrElse(
    S.decodeUnknownOption(S.Record(S.String, S.Unknown))(route.params),
    () => ({}),
  )
  const path = `/${Array.join(Array.map(segmentsOf(params), encodeURIComponent), '/')}`
  const query = queryOf(params)
  return Option.some(String.isEmpty(query) ? path : `${path}?${query}`)
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
})

const decodeLayoutState = S.decodeUnknownOption(LayoutState)

const rootSlotOf = (state: RootState): Option.Option<RootRoute> =>
  Array.findFirst(state.routes, route => route.name === rootSlotName)

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
    const nextRoutes = Array.map(next, routerRouteOf)
    Array.forEach(next, route => {
      const maybeShown = uriOfRoute(routerRouteOf(route))
      if (Option.isSome(maybeShown)) {
        written.set(route.key, { route, shown: maybeShown.value })
      }
    })
    const maybeSlot = Option.flatMap(
      Option.fromNullishOr(ref.getRootState()),
      rootSlotOf,
    )
    if (Option.isSome(maybeSlot)) {
      lastRoutes = next
      ref.resetRoot({
        index: 0,
        routes: [
          {
            key: maybeSlot.value.key,
            name: rootSlotName,
            state: { index: next.length - 1, routes: nextRoutes },
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
