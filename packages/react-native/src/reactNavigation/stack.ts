import { Array, Equal, Match as M, Option, Schema as S, pipe } from 'effect'
import type { Navigation } from 'foldkit'

// STATE

/** The one route name every Foldkit stack entry uses; the key carries identity. */
export const entryRouteName = 'FoldkitEntry'

/** One React Navigation route as a Foldkit stack writes it. */
export type EntryRoute = Readonly<{
  key: string
  name: string
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

const genericName = (): string => entryRouteName

const routeOf =
  (nameOf: (key: string) => string) =>
  (route: Navigation.KeyedRoute): EntryRoute => ({
    key: route.key,
    name: nameOf(route.key),
    params: { uri: route.uri },
  })

/**
 * The navigation state that shows a list of keyed routes, top last, each
 * under the screen `nameOf` gives its key, or the one generic screen.
 *
 * @example
 * ```typescript
 * entryStateOf([{ key: '/counter', uri: '/counter' }])
 * // { index: 0, routes: [{ key: '/counter', name: 'FoldkitEntry', params: { uri: '/counter' } }] }
 * ```
 */
export const entryStateOf = (
  routes: Array.NonEmptyReadonlyArray<Navigation.KeyedRoute>,
  nameOf: (key: string) => string = genericName,
): EntryState => ({
  index: routes.length - 1,
  routes: Array.map(routes, routeOf(nameOf)),
})

/**
 * The routes a navigator holds for a plan, root first: one per entry,
 * keyed by the page the entry is, its identity, and carrying the address
 * it has now. A player whose address follows its place,
 * `/books/a-title/listen/12s`, stays under `/books/a-title/listen/0s`, so
 * its screen is never taken down while it plays.
 *
 * @example
 * ```typescript
 * keyedRoutesOf(plan)
 * // [{ key: '/books', uri: '/books' }, { key: '/books/a-title/listen/0s', uri: '/books/a-title/listen/12s' }]
 * ```
 */
export const keyedRoutesOf = <Destination>(
  plan: Navigation.CarrierPlan<Destination>,
): Array.NonEmptyReadonlyArray<Navigation.KeyedRoute> =>
  Array.map(plan.entries, entry => ({ key: entry.identity, uri: entry.uri }))

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
 * pages slide in as cards; a sheet presents as the platform's modal
 * sheet, which a person swipes down to leave, and so does a drawer, since
 * a phone has no room for a panel beside the page; a dialog and a popover
 * float over the page beneath.
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
          Sheet: () => 'modal',
          BottomSheet: () => 'modal',
          FullScreenCover: () => 'fullScreenModal',
          Dialog: () => 'transparentModal',
          Popover: () => 'transparentModal',
          Drawer: () => 'modal',
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
  nameOf: (key: string) => string = genericName,
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
      ref.resetRoot(entryStateOf(next, nameOf))
    },
    subscribe: listener => ref.addListener('state', listener),
  }
}

// KEYS

const generationMark = '#'

const generationSuffix = /#\d+$/

/**
 * The key a navigator holds one plan entry under: the entry's own key the
 * first time it is shown, and the key with a count after it each time it
 * is shown again, `/counter/session#1`. A plan key is a path, so it never
 * holds a `#` of its own.
 *
 * @example
 * ```typescript
 * navigatorKeyOf('/counter/session', 0) // '/counter/session'
 * navigatorKeyOf('/counter/session', 2) // '/counter/session#2'
 * ```
 */
export const navigatorKeyOf = (key: string, generation: number): string =>
  generation === 0 ? key : `${key}${generationMark}${generation.toString()}`

/**
 * The plan key a navigator's route key stands for.
 *
 * @example
 * ```typescript
 * planKeyOf('/counter/session#2') // '/counter/session'
 * ```
 */
export const planKeyOf = (navigatorKey: string): string =>
  navigatorKey.replace(generationSuffix, '')

/**
 * A keyed stack that never hands a navigator a key it has let go of. A
 * native stack remembers the key of a screen a person dismissed with a
 * gesture, and reports an error when a route with that key appears
 * again. So an entry that left the stack comes back under its key with a
 * count, while an entry that stays keeps its key and its screen. The
 * carrier above still reads and writes plan keys.
 *
 * @example
 * ```typescript
 * Navigation.keyedStackDriver(
 *   Navigation.coalescedStack(renewedStack(reactNavigationStack(ref, routes))),
 * )
 * ```
 */
export const renewedStack = (
  stack: Navigation.KeyedStack,
): Navigation.KeyedStack => {
  const generations = new Map<string, number>()
  let shown: ReadonlySet<string> = new Set(
    Array.map(stack.routes(), route => planKeyOf(route.key)),
  )
  const noteShown = (keys: ReadonlySet<string>): void => {
    shown.forEach(key => {
      if (!keys.has(key)) {
        generations.set(key, (generations.get(key) ?? 0) + 1)
      }
    })
    shown = keys
  }
  return {
    routes: () => {
      const routes = Array.map(stack.routes(), route => ({
        key: planKeyOf(route.key),
        uri: route.uri,
      }))
      noteShown(new Set(Array.map(routes, route => route.key)))
      return routes
    },
    reset: next => {
      noteShown(new Set(Array.map(next, route => route.key)))
      stack.reset(
        Array.map(next, route => ({
          key: navigatorKeyOf(route.key, generations.get(route.key) ?? 0),
          uri: route.uri,
        })),
      )
    },
    subscribe: stack.subscribe,
  }
}

// STEADY

/**
 * The entry of a plan a navigator's route shows: the one that is the page
 * the route is keyed by, whatever its address is now.
 *
 * @example
 * ```typescript
 * entryOfNavigatorKey(plan, '/books/a-title/listen/0s#2') // Some(the player at 41s)
 * ```
 */
export const entryOfNavigatorKey = <Destination>(
  plan: Navigation.CarrierPlan<Destination>,
  navigatorKey: string,
): Option.Option<Navigation.CarrierEntry<Destination>> =>
  Array.findFirst(
    plan.entries,
    entry => entry.identity === planKeyOf(navigatorKey),
  )

/**
 * How a steady stack writes an address that moves under a page that
 * stays. Where a navigator shows the address, as Expo Router does in a
 * browser's bar, it is written under the same key. On a phone nothing
 * shows it, so the navigator is left alone.
 */
export type SteadyOptions = Readonly<{ isAddressShown: boolean }>

/**
 * A keyed stack whose navigator holds each entry under the page it is,
 * while the carrier above reads and writes the plan's own keys, which
 * move with the address. When only addresses move and the pages stay,
 * the navigator is not reset: its screens, a gesture under way and its
 * transitions are left alone, once a second while a book plays. `plan`
 * reads the bound Program's plan.
 *
 * @example
 * ```typescript
 * steadyStack(renewedStack(reactNavigationStack(ref, routes)), bound.navigation, {
 *   isAddressShown: false,
 * })
 * ```
 */
export const steadyStack = (
  stack: Navigation.KeyedStack,
  plan: () => Option.Option<Navigation.CarrierPlan<unknown>>,
  options: SteadyOptions,
): Navigation.KeyedStack => {
  const addresses = new Map<string, string>()
  const identityOf = (key: string): string =>
    pipe(
      plan(),
      Option.flatMap(now =>
        Array.findFirst(now.entries, entry => entry.key === key),
      ),
      Option.match({ onNone: () => key, onSome: entry => entry.identity }),
    )
  const keyOf = (identity: string): string =>
    pipe(
      plan(),
      Option.flatMap(now =>
        Array.findFirst(now.entries, entry => entry.identity === identity),
      ),
      Option.match({ onNone: () => identity, onSome: entry => entry.key }),
    )
  return {
    routes: () =>
      Array.map(stack.routes(), route => ({
        key: keyOf(route.key),
        uri: addresses.get(route.key) ?? route.uri,
      })),
    reset: next => {
      const pages = Array.map(next, route => ({
        key: identityOf(route.key),
        uri: route.uri,
      }))
      const held = Array.map(stack.routes(), route => route.key)
      const arePagesHeld = Equal.equals(
        held,
        Array.map(pages, page => page.key),
      )
      addresses.clear()
      if (arePagesHeld && !options.isAddressShown) {
        Array.forEach(pages, page => {
          addresses.set(page.key, page.uri)
        })
      } else {
        stack.reset(pages)
      }
    },
    subscribe: stack.subscribe,
  }
}

// SCREENS

/**
 * The screens a native stack declares for a Program: one named after each
 * Destination it declares, then the one generic screen, for an entry the
 * stack cannot name.
 *
 * @example
 * ```typescript
 * screenNamesOf(bound.destinationTags()) // ['Counter', 'SessionSettings', 'ActionMenu', 'FoldkitEntry']
 * ```
 */
export const screenNamesOf = (
  destinationTags: ReadonlyArray<string>,
): Array.NonEmptyReadonlyArray<string> =>
  Array.append(destinationTags, entryRouteName)

const tagOfDestination = (destination: unknown): Option.Option<string> =>
  S.decodeUnknownOption(S.Struct({ _tag: S.String }))(destination).pipe(
    Option.map(tagged => tagged._tag),
  )

/**
 * The screen an entry is shown under: the one named after its
 * Destination, found by the page the navigator's key stands for, when the
 * stack declares it; else the one generic screen.
 *
 * @example
 * ```typescript
 * screenNameOf(bound.navigation(), '/books/a-title/listen/0s', tags) // 'PlayerPage'
 * ```
 */
export const screenNameOf = (
  maybePlan: Option.Option<Navigation.CarrierPlan<unknown>>,
  navigatorKey: string,
  destinationTags: ReadonlyArray<string>,
): string =>
  pipe(
    maybePlan,
    Option.flatMap(plan => entryOfNavigatorKey(plan, navigatorKey)),
    Option.flatMap(entry => tagOfDestination(entry.destination)),
    Option.filter(tag => Array.contains(destinationTags, tag)),
    Option.getOrElse(genericName),
  )
