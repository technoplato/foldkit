import { Array, Option, Predicate, Schema as S } from 'effect'

import type { ProgramSchema } from '../program/program.js'
import { Column, Text } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'
import {
  type DestinationRoute,
  type EntryView,
  NotFound,
  type ProgramNavigation,
  type StackLens,
  type StackedNavigation,
  isNotFound,
  liftRoute,
  notFoundRoute,
  screenView,
} from './declaration.js'
import { NavigatedBack, OpenedUri } from './message.js'
import { NavigationStack } from './structure.js'

// HOLD

/**
 * How a navigation combinator holds the stack. The first combinator over a
 * child without a stack owns it: it adds the `navigation` field, the
 * NotFound fallback, and the carrier facts. A combinator over a child that
 * already holds one extends it: it widens the Destinations in the same
 * field. Either way the outermost combinator folds the carrier facts,
 * because only it knows every route.
 *
 * @example
 * ```typescript
 * holdOf(CounterProgram.navigation) // 'Owns': Session adds the stack
 * holdOf(SessionCounter.navigation) // 'Extends': the menu joins Session's stack
 * ```
 */
export type StackHold = 'Owns' | 'Extends'

/**
 * The Destinations a Program declares.
 *
 * @example
 * ```typescript
 * type CounterDestination = DestinationOf<typeof CounterProgram> // Counter
 * ```
 */
export type DestinationOf<P> =
  P extends Readonly<{
    navigation?: ProgramNavigation<any, infer Destination>
  }>
    ? Destination
    : never

/**
 * How a combinator over this child holds the stack.
 *
 * @example
 * ```typescript
 * holdOf(CounterProgram.navigation) // 'Owns'
 * holdOf(SessionCounter.navigation) // 'Extends'
 * ```
 */
export const holdOf = (
  childNavigation: ProgramNavigation<any, any>,
): StackHold => (childNavigation.stack === undefined ? 'Owns' : 'Extends')

/** The field every navigation combinator keeps the stack in: `navigation`. */
export const stackField = 'navigation'

/**
 * The members of a union Schema, or the Schema itself when it is not a
 * union, so a combinator can widen a child's union by one member.
 *
 * @example
 * ```typescript
 * schemaMembersOf(S.Union([Counter, SessionSettings])) // [Counter, SessionSettings]
 * schemaMembersOf(Counter) // [Counter]
 * ```
 */
export const schemaMembersOf = (schema: S.Top): ReadonlyArray<S.Top> =>
  Predicate.hasProperty(schema, 'members') &&
  Array.isArray(schema.members) &&
  Array.every(schema.members, S.isSchema)
    ? schema.members
    : [schema]

/**
 * The composed Destination union: the child's Destinations, the ones this
 * combinator adds, and NotFound when this combinator owns the stack.
 *
 * @example
 * ```typescript
 * composedDestination(CounterProgram.navigation, [SessionSettings], 'Owns')
 * // Counter | SessionSettings | NotFound
 * ```
 */
export const composedDestination = (
  childNavigation: ProgramNavigation<any, any>,
  added: ReadonlyArray<S.Top>,
  hold: StackHold,
): S.Top =>
  S.Union([
    ...schemaMembersOf(childNavigation.Destination),
    ...added,
    ...(hold === 'Owns' ? [NotFound] : []),
  ])

/**
 * The composed Model's fields: the child's, with the `navigation` field
 * added or widened to the composed Destinations.
 *
 * @example
 * ```typescript
 * composedFields({ count: S.Number }, Destination)
 * // { count: S.Number, navigation: NavigationStack(Destination) }
 * ```
 */
export const composedFields = (
  childFields: S.Struct.Fields,
  Destination: S.Top,
): S.Struct.Fields => ({
  ...childFields,
  [stackField]: NavigationStack(Destination),
})

/**
 * The carrier facts a combinator adds to its Message union when it owns
 * the stack: `OpenedUri` and `NavigatedBack`.
 *
 * @example
 * ```typescript
 * ownedMessages('Owns') // [OpenedUri, NavigatedBack]
 * ownedMessages('Extends') // []: the child already folds them in
 * ```
 */
export const ownedMessages = (hold: StackHold): ReadonlyArray<S.Top> =>
  hold === 'Owns' ? [OpenedUri, NavigatedBack] : []

/**
 * Reads and writes the `navigation` field.
 *
 * @example
 * ```typescript
 * fieldLens<AppModel, AppDestination>().get(model) // Some(model.navigation)
 * ```
 */
export const fieldLens = <
  Model extends Readonly<{ navigation: NavigationStack<Destination> }>,
  Destination,
>(): StackLens<Model, Destination> => ({
  get: model => Option.some(model.navigation),
  set: (model, navigation) => ({ ...model, navigation }),
})

// VIEW

/**
 * The screen for a URI no route matched: what was asked for, and that
 * Back returns to the entry beneath.
 *
 * @example
 * ```typescript
 * notFoundScreen(NotFound({ segments: ['nope'] }))
 * // Column: Text('Not found'), Text('nope')
 * ```
 */
export const notFoundScreen = (notFound: NotFound): UiNode =>
  Column(
    {},
    Text('Not found', { label: 'Not found' }),
    Text(Array.join(notFound.segments, '/'), { mono: true, dim: true }),
  )

// DECLARATION

/**
 * The composed declaration for a navigation combinator: the child's routes
 * lifted into the wider union, then this combinator's own, then the
 * NotFound fallback when it owns the stack. A child without routes is not
 * URL-addressable, so neither is the composition. Views and settling try this
 * combinator first, then the child. A launch is adopted only when both
 * layers adopt it.
 *
 * @example
 * ```typescript
 * composeNavigation({
 *   child: CounterProgram.navigation,
 *   hold: 'Owns',
 *   Destination,
 *   childOf,
 *   embedNotFound: notFound => notFound,
 *   routes: [sessionSettingsRoute],
 * })
 * // prints `/counter`, `/counter/session`, and `/counter/<anything else>`
 * ```
 */
export const composeNavigation = <
  AppModel,
  ChildModel,
  AppDestination,
  ChildDestination extends AppDestination,
>(config: {
  child: ProgramNavigation<ChildModel, ChildDestination>
  hold: StackHold
  Destination: ProgramSchema<AppDestination>
  childOf: (model: AppModel) => ChildModel
  stack: StackLens<AppModel, AppDestination>
  embedNotFound: (notFound: NotFound) => AppDestination
  routes: ReadonlyArray<DestinationRoute<AppDestination>>
  viewOf?: (
    model: AppModel,
    destination: AppDestination,
  ) => Option.Option<EntryView>
  settleEntry?: (model: AppModel, destination: AppDestination) => AppDestination
  adoptsLaunch?: (model: AppModel) => boolean
}): StackedNavigation<AppModel, AppDestination> => {
  const { child, childOf } = config
  const isChildDestination = S.is(child.Destination)
  const narrow = (
    destination: AppDestination,
  ): Option.Option<ChildDestination> =>
    isChildDestination(destination) ? Option.some(destination) : Option.none()

  const childViewOf = (
    model: AppModel,
    destination: AppDestination,
  ): Option.Option<EntryView> =>
    Option.flatMap(narrow(destination), childDestination =>
      child.viewOf === undefined
        ? Option.none()
        : child.viewOf(childOf(model), childDestination),
    )

  const notFoundViewOf = (
    destination: AppDestination,
  ): Option.Option<EntryView> =>
    config.hold === 'Owns' && isNotFound(destination)
      ? Option.some(screenView(notFoundScreen(destination)))
      : Option.none()

  const childSettled = (
    model: AppModel,
    destination: AppDestination,
  ): AppDestination =>
    Option.match(narrow(destination), {
      onNone: () => destination,
      onSome: childDestination =>
        child.settleEntry === undefined
          ? childDestination
          : child.settleEntry(childOf(model), childDestination),
    })

  const childHistoryOf = child.historyOf

  return {
    ...(child.slug === undefined ? {} : { slug: child.slug }),
    Destination: config.Destination,
    root: child.root,
    routes: Array.match(child.routes ?? [], {
      onEmpty: () => [],
      onNonEmpty: childRoutes => [
        ...Array.map(childRoutes, route => liftRoute(route, narrow)),
        ...config.routes,
        ...(config.hold === 'Owns'
          ? [
              notFoundRoute<AppDestination>(
                Option.liftPredicate(isNotFound),
                config.embedNotFound,
              ),
            ]
          : []),
      ],
    }),
    stack: config.stack,
    viewOf: (model, destination) =>
      Option.orElse(
        config.viewOf === undefined
          ? Option.none()
          : config.viewOf(model, destination),
        () =>
          Option.orElse(childViewOf(model, destination), () =>
            notFoundViewOf(destination),
          ),
      ),
    settleEntry: (model, destination) => {
      const settledByChild = childSettled(model, destination)
      return config.settleEntry === undefined
        ? settledByChild
        : config.settleEntry(model, settledByChild)
    },
    ...(childHistoryOf === undefined
      ? {}
      : { historyOf: (model: AppModel) => childHistoryOf(childOf(model)) }),
    adoptsLaunch: model =>
      (config.adoptsLaunch === undefined || config.adoptsLaunch(model)) &&
      (child.adoptsLaunch === undefined || child.adoptsLaunch(childOf(model))),
  }
}
