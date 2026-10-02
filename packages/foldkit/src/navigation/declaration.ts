import { Array, Data, Option, Schema as S } from 'effect'

import type { MenuView } from '../interaction/interaction.js'
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
 * `isAllowedAbove` reads every Destination beneath, root first, so a page
 * can appear once: the Session route refuses a stack that already holds
 * the Session page.
 */
export type DestinationRoute<Destination> = Readonly<{
  routeCase: Route.RouteCase<Destination, any>
  placement: Placement
  styleOf: (destination: Destination) => PresentationStyle
  isAllowedAbove: (beneath: Array.NonEmptyReadonlyArray<Destination>) => boolean
  maybeTitleOf: (destination: Destination) => Option.Option<string>
}>

/** Options shared by the route constructors. */
export type RouteOptions<Destination> = Readonly<{
  isAllowedAbove?: (
    beneath: Array.NonEmptyReadonlyArray<Destination>,
  ) => boolean
  title?: (destination: Destination) => string
}>

const titledBy =
  <Destination>(
    options?: Readonly<{ title?: (destination: Destination) => string }>,
  ) =>
  (destination: Destination): Option.Option<string> =>
    options?.title === undefined
      ? Option.none()
      : Option.some(options.title(destination))

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
  maybeTitleOf: titledBy(options),
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
  maybeTitleOf: titledBy(options),
})

/**
 * Declares a Destination presented over another with one style.
 *
 * @example
 * ```typescript
 * presentRoute(menuRouteCase, Dialog(), { title: () => 'Actions' })
 * // `/counter/menu?menu.q=re`
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
  maybeTitleOf: titledBy(options),
})

/**
 * Lifts a child's route into a wider Destination union, so a combinator
 * composes its child's routes without casts. A child's rule about what it
 * may sit above reads only its own Destinations beneath; a Destination the
 * child does not know, such as the action menu, is left out of it.
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
  isAllowedAbove: beneath =>
    Array.match(Array.getSomes(Array.map(beneath, narrow)), {
      onEmpty: () => true,
      onNonEmpty: route.isAllowedAbove,
    }),
  maybeTitleOf: destination =>
    Option.flatMap(narrow(destination), route.maybeTitleOf),
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

// FALLBACK

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
  maybeTitleOf: () => Option.some('Not found'),
})

// DECLARATION

/**
 * Reads and writes the stack a Model holds. `get` is None while the Model
 * holds no stack yet, such as a synced Model that is still Starting.
 */
export type StackLens<Model, Destination> = Readonly<{
  get: (model: Model) => Option.Option<NavigationStack<Destination>>
  set: (model: Model, stack: NavigationStack<Destination>) => Model
}>

/**
 * Whether a carrier records each move as history or replaces in place. A
 * follower replaces, so its Back is not a list of the leader's moves.
 */
export const HistoryMode = S.Literals(['Record', 'Replace'])
/** Whether a carrier records each move as history or replaces in place. */
export type HistoryMode = typeof HistoryMode.Type

/** What a host paints for one stack entry: a screen tree or the action menu. */
export type EntryView =
  | Readonly<{ _tag: 'Screen'; node: UiNode }>
  | Readonly<{ _tag: 'Menu'; menu: MenuView }>

/** An entry painted as a screen tree. */
export const screenView = (node: UiNode): EntryView => ({
  _tag: 'Screen',
  node,
})

/** An entry painted as the action menu. */
export const menuView = (menu: MenuView): EntryView => ({
  _tag: 'Menu',
  menu,
})

/**
 * A Program's navigation: its Destinations, their routes, and, once a
 * combinator adds one, the stack its Model holds.
 *
 * - `slug` is the URL word the Program owns: `counter` in `/counter`.
 * - `routes` print and parse each Destination, relative to the entry
 *   beneath it. A Program without routes is not URL-addressable.
 * - `stack` reads and writes the stack in the Model.
 * - `viewOf` paints one Destination, so a stack carrier can keep several
 *   screens mounted at once. The root falls back to the Program's screen.
 * - `settleEntry` recomputes the fields of a parsed Destination that the
 *   URI does not carry, such as the action menu's highlighted row.
 * - `historyOf` replaces instead of recording while following someone.
 * - `adoptsLaunch` is false while a launch URI should not move the stack,
 *   such as while navigation is mirrored and the newcomer joins the
 *   shared stack.
 *
 * @example
 * ```typescript
 * const navigation: ProgramNavigation<Model, Counter> = {
 *   slug: Slug.make('counter'),
 *   Destination: Counter,
 *   root: Counter(),
 *   routes: [counterRoute],
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
  viewOf?: (model: Model, destination: Destination) => Option.Option<EntryView>
  settleEntry?: (model: Model, destination: Destination) => Destination
  historyOf?: (model: Model) => HistoryMode
  adoptsLaunch?: (model: Model) => boolean
}>

/** A declaration whose Model holds a stack, as every navigation combinator produces. */
export type StackedNavigation<Model, Destination> = ProgramNavigation<
  Model,
  Destination
> &
  Readonly<{ stack: StackLens<Model, Destination> }>

// FOCUS

/**
 * How a wider Model holds a narrower one. `childOf` is None while the
 * wider Model holds none, such as a synced Model that is still Starting.
 */
export type ModelFocus<Model, ChildModel> = Readonly<{
  childOf: (model: Model) => Option.Option<ChildModel>
  withChild: (model: Model, childModel: ChildModel) => Model
}>

/**
 * A declaration read through a wider Model. Each Model-reading field reads
 * the child's part. While there is none, the stack is absent, nothing is
 * painted, and a parsed Destination stays as parsed.
 *
 * @example
 * ```typescript
 * focusModel(app.navigation, {
 *   childOf: model => (model._tag === 'Ready' ? Option.some(model) : Option.none()),
 *   withChild: (_model, ready) => ready,
 * })
 * ```
 */
export const focusModel = <Model, ChildModel, Destination>(
  navigation: ProgramNavigation<ChildModel, Destination>,
  focus: ModelFocus<Model, ChildModel>,
): ProgramNavigation<Model, Destination> => {
  const { stack, viewOf, settleEntry, historyOf, adoptsLaunch, ...modelFree } =
    navigation
  return {
    ...modelFree,
    ...(stack === undefined
      ? {}
      : {
          stack: {
            get: (model: Model) =>
              Option.flatMap(focus.childOf(model), stack.get),
            set: (model: Model, nextStack: NavigationStack<Destination>) =>
              Option.match(focus.childOf(model), {
                onNone: () => model,
                onSome: childModel =>
                  focus.withChild(model, stack.set(childModel, nextStack)),
              }),
          },
        }),
    ...(viewOf === undefined
      ? {}
      : {
          viewOf: (model: Model, destination: Destination) =>
            Option.flatMap(focus.childOf(model), childModel =>
              viewOf(childModel, destination),
            ),
        }),
    ...(settleEntry === undefined
      ? {}
      : {
          settleEntry: (model: Model, destination: Destination) =>
            Option.match(focus.childOf(model), {
              onNone: () => destination,
              onSome: childModel => settleEntry(childModel, destination),
            }),
        }),
    ...(historyOf === undefined
      ? {}
      : {
          historyOf: (model: Model): HistoryMode =>
            Option.match(focus.childOf(model), {
              onNone: () => 'Record',
              onSome: historyOf,
            }),
        }),
    ...(adoptsLaunch === undefined
      ? {}
      : {
          adoptsLaunch: (model: Model) =>
            Option.match(focus.childOf(model), {
              onNone: () => true,
              onSome: adoptsLaunch,
            }),
        }),
  }
}

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
