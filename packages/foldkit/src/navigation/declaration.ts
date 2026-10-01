import { Array, Data, Option, Schema as S } from 'effect'

import type { ProgramSchema } from '../program/program.js'
import type { UiNode } from '../renderers/types.js'
import * as Route from '../route/parser.js'
import { ts } from '../schema/index.js'
import {
  type NavigationStack,
  type PresentationStyle,
  Push,
} from './structure.js'

// SLUG

/**
 * The URL word a Program owns, declared once. The Counter's slug `counter`
 * makes its root print as `/counter`.
 */
export const Slug = S.NonEmptyString.pipe(S.brand('Slug'))
/** The URL word a Program owns, declared once. */
export type Slug = typeof Slug.Type

// ROUTE

/**
 * Where a Destination may sit in a stack: as the root, as an entry above
 * another Destination, or as the fallback a lenient parse uses when no
 * other route matches.
 */
export const Placement = S.Literals(['Root', 'Entry', 'Fallback'])
/** Where a Destination may sit in a stack. */
export type Placement = typeof Placement.Type

/**
 * One Destination case, its parser-printer relative to the entry beneath
 * it, and its stack rules. A Destination's style and title are functions of
 * the Destination, so one key always keeps one presentation.
 */
export type DestinationRoute<Destination> = Readonly<{
  routeCase: Route.RouteCase<Destination, any>
  placement: Placement
  styleOf: (destination: Destination) => PresentationStyle
  isAllowedAbove: (below: Destination) => boolean
  titleOf: (destination: Destination) => string
}>

/** Options shared by the route constructors. */
export type RouteOptions<Destination> = Readonly<{
  isAllowedAbove?: (below: Destination) => boolean
  title?: (destination: Destination) => string
}>

const untitled = (): string => ''

const anywhere = (): boolean => true

/**
 * Declares the Destination a stack starts from.
 *
 * @example
 * ```typescript
 * rootRoute(Route.caseOf(Route.here, tagCase(isCounter, Counter)), {
 *   title: () => 'Counter',
 * })
 * // prints `/counter` when the Program's slug is `counter`
 * ```
 */
export const rootRoute = <Destination, Value>(
  routeCase: Route.RouteCase<Destination, Value>,
  options?: Pick<RouteOptions<Destination>, 'title'>,
): DestinationRoute<Destination> => ({
  routeCase,
  placement: 'Root',
  styleOf: () => Push(),
  isAllowedAbove: () => false,
  titleOf: options?.title ?? untitled,
})

/**
 * Declares a Destination pushed above another.
 *
 * @example
 * ```typescript
 * pushRoute(
 *   Route.caseOf(Route.literal('session'), tagCase(isSessionSettings, SessionSettings)),
 * )
 * // `/counter/session`
 * ```
 */
export const pushRoute = <Destination, Value>(
  routeCase: Route.RouteCase<Destination, Value>,
  options?: RouteOptions<Destination>,
): DestinationRoute<Destination> => ({
  routeCase,
  placement: 'Entry',
  styleOf: () => Push(),
  isAllowedAbove: options?.isAllowedAbove ?? anywhere,
  titleOf: options?.title ?? untitled,
})

/**
 * Declares a Destination presented over another with one style.
 *
 * @example
 * ```typescript
 * presentRoute(menuRouteCase, Dialog(), { title: () => 'Actions' })
 * // `/counter/menu?q=re`
 * ```
 */
export const presentRoute = <Destination, Value>(
  routeCase: Route.RouteCase<Destination, Value>,
  style: PresentationStyle,
  options?: RouteOptions<Destination>,
): DestinationRoute<Destination> => ({
  routeCase,
  placement: 'Entry',
  styleOf: () => style,
  isAllowedAbove: options?.isAllowedAbove ?? anywhere,
  titleOf: options?.title ?? untitled,
})

/**
 * Lifts a child's route into a wider Destination union, so a combinator
 * composes its child's routes without casts.
 *
 * @example
 * ```typescript
 * liftRoute(counterRoute, destination =>
 *   isCounter(destination) ? Option.some(destination) : Option.none(),
 * )
 * ```
 */
export const liftRoute = <Child extends Parent, Parent>(
  route: DestinationRoute<Child>,
  narrow: (destination: Parent) => Option.Option<Child>,
): DestinationRoute<Parent> => ({
  routeCase: {
    parser: route.routeCase.parser,
    casePath: {
      embed: value => route.routeCase.casePath.embed(value),
      extract: destination =>
        Option.flatMap(narrow(destination), route.routeCase.casePath.extract),
    },
  },
  placement: route.placement,
  styleOf: destination =>
    Option.match(narrow(destination), {
      onNone: () => Push(),
      onSome: route.styleOf,
    }),
  isAllowedAbove: below =>
    Option.match(narrow(below), {
      onNone: () => false,
      onSome: route.isAllowedAbove,
    }),
  titleOf: destination =>
    Option.match(narrow(destination), {
      onNone: untitled,
      onSome: route.titleOf,
    }),
})

/**
 * The embed and extract pair for a payload-free tagged Destination, so its
 * route needs no hand-written case path.
 *
 * @example
 * ```typescript
 * Route.caseOf(Route.literal('session'), tagCase(isSessionSettings, SessionSettings))
 * ```
 */
export const tagCase = <Destination, Tagged extends Destination>(
  isTagged: (destination: Destination) => destination is Tagged,
  make: () => Tagged,
): Route.CasePath<Destination, {}> => ({
  embed: () => make(),
  extract: destination =>
    isTagged(destination) ? Option.some({}) : Option.none(),
})

// NOT FOUND

/**
 * The Destination for a URI no route matched. It keeps the attempted
 * segments, so `/counter/nope` prints back unchanged and Back returns to
 * `/counter`.
 */
export const NotFound = ts('NotFound', {
  segments: S.NonEmptyArray(S.String),
})
/** The Destination for a URI no route matched. */
export type NotFound = typeof NotFound.Type

/** True for the NotFound Destination. */
export const isNotFound = S.is(NotFound)

/**
 * The fallback route a stack owner adds once: it captures every remaining
 * segment, is allowed above anything, and is tried only after a strict
 * parse fails.
 */
export const notFoundRoute = <Destination>(
  narrow: (destination: Destination) => Option.Option<NotFound>,
  embed: (notFound: NotFound) => Destination,
): DestinationRoute<Destination> => ({
  routeCase: Route.caseOf<
    Destination,
    Readonly<{ segments: Array.NonEmptyReadonlyArray<string> }>
  >(Route.rest('segments'), {
    embed: ({ segments }) => embed(NotFound({ segments: [...segments] })),
    extract: destination =>
      Option.map(narrow(destination), ({ segments }) => ({ segments })),
  }),
  placement: 'Fallback',
  styleOf: () => Push(),
  isAllowedAbove: anywhere,
  titleOf: () => 'Not found',
})

// DECLARATION

/** Reads and writes the stack a Model holds. */
export type StackLens<Model, Destination> = Readonly<{
  get: (model: Model) => NavigationStack<Destination>
  set: (model: Model, stack: NavigationStack<Destination>) => Model
}>

/**
 * Whether a carrier records each move as history or replaces in place. A
 * follower replaces, so its Back is not a list of the leader's moves.
 */
export const HistoryMode = S.Literals(['Record', 'Replace'])
/** Whether a carrier records each move as history or replaces in place. */
export type HistoryMode = typeof HistoryMode.Type

/**
 * A Program's navigation: its Destinations, their routes, and, once a
 * combinator adds one, the stack its Model holds.
 *
 * - `slug` is the URL word the Program owns: `counter` in `/counter`.
 * - `routes` print and parse each Destination, relative to the entry
 *   beneath it. A Program without routes is not URL-addressable.
 * - `stack` reads and writes the stack in the Model.
 * - `screenOf` paints one Destination, so a stack carrier can keep several
 *   screens mounted at once.
 * - `settle` recomputes Model-dependent fields the URI does not carry, such
 *   as the action menu's highlighted row.
 * - `historyOf` replaces instead of recording while following someone.
 * - `backKeys` are the keys a terminal or keyboard host treats as Back.
 *
 * @example
 * ```typescript
 * const navigation: ProgramNavigation<Model, Counter> = {
 *   slug: Slug.make('counter'),
 *   Destination: Counter,
 *   root: Counter(),
 *   routes: [counterRoute],
 *   screenOf: model => Option.some(counterScreen(model)),
 * }
 * // the root stack prints as `/counter`
 * ```
 */
export type ProgramNavigation<Model, Destination> = Readonly<{
  slug?: Slug
  Destination: ProgramSchema<Destination>
  root: Destination
  routes?: ReadonlyArray<DestinationRoute<Destination>>
  stack?: StackLens<Model, Destination>
  screenOf?: (model: Model, destination: Destination) => Option.Option<UiNode>
  settle?: (
    model: Model,
    stack: NavigationStack<Destination>,
  ) => NavigationStack<Destination>
  historyOf?: (model: Model) => HistoryMode
  backKeys?: ReadonlyArray<string>
}>

/**
 * The route that prints a Destination, when one is declared.
 *
 * @example
 * ```typescript
 * routeOf(navigation, SessionSettings()) // Some(the `/session` route)
 * routeOf(navigation, Undeclared())      // None
 * ```
 */
export const routeOf = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
  destination: Destination,
): Option.Option<DestinationRoute<Destination>> =>
  Array.findFirst(navigation.routes ?? [], route =>
    Option.isSome(route.routeCase.casePath.extract(destination)),
  )

/** A navigation declaration broke one of the stack laws. */
export class NavigationDeclarationError extends Data.TaggedError(
  'NavigationDeclarationError',
)<{
  readonly reason: string
}> {}

/**
 * Validates a declaration at definition time and returns it: when routes
 * are declared, one Root route must print the root.
 *
 * @example
 * ```typescript
 * make({ slug: Slug.make('counter'), Destination: Counter, root: Counter(), routes: [] })
 * // throws NavigationDeclarationError: no Root route prints the root
 * ```
 */
export const make = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
): ProgramNavigation<Model, Destination> => {
  const routes = navigation.routes ?? []
  const isRootPrinted = Array.some(
    routes,
    route =>
      route.placement === 'Root' &&
      Option.isSome(route.routeCase.casePath.extract(navigation.root)),
  )
  if (Array.isReadonlyArrayNonEmpty(routes) && !isRootPrinted) {
    throw new NavigationDeclarationError({
      reason: 'no Root route prints the root',
    })
  }
  return navigation
}
