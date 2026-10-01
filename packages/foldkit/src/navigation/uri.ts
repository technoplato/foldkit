import { Array, Effect, Option, Result, String, pipe } from 'effect'

import type * as Route from '../route/parser.js'
import * as QueryParams from '../route/queryParams.js'
import type {
  DestinationRoute,
  Placement,
  ProgramNavigation,
} from './declaration.js'
import {
  type NavigationStack,
  type Presented,
  entriesOf,
  presented,
  stackAtRoot,
  stackFrom,
} from './structure.js'

// SPLIT

/** A relative URI split into decoded path segments and its raw search. */
export type SplitUri = Readonly<{
  segments: ReadonlyArray<string>
  search: string
}>

const decodeSegment = (segment: string): string =>
  Result.getOrElse(
    Result.try(() => decodeURIComponent(segment)),
    () => segment,
  )

/**
 * Splits a relative URI into decoded path segments and its raw search.
 *
 * @example
 * ```typescript
 * splitUri('/counters/counter/a%20b?q=re')
 * // { segments: ['counters', 'counter', 'a b'], search: 'q=re' }
 * ```
 */
export const splitUri = (uri: string): SplitUri => {
  const maybeQueryIndex = String.indexOf('?')(uri)
  const pathname = Option.match(maybeQueryIndex, {
    onNone: () => uri,
    onSome: queryIndex => uri.slice(0, queryIndex),
  })
  const search = Option.match(maybeQueryIndex, {
    onNone: () => '',
    onSome: queryIndex => uri.slice(queryIndex + 1),
  })
  return {
    segments: pipe(
      pathname,
      String.split('/'),
      Array.filter(String.isNonEmpty),
      Array.map(decodeSegment),
    ),
    search,
  }
}

// PRINT

/** The path and the full URI one print state renders to. */
export type PathAndUri = Readonly<{ path: string; uri: string }>

/**
 * Renders a print state, percent-encoding each segment. The path alone is
 * an entry's identity; the query is configuration.
 *
 * @example
 * ```typescript
 * pathAndUri({ segments: ['counter', 'menu'], queryParams: q=re })
 * // { path: '/counter/menu', uri: '/counter/menu?q=re' }
 * ```
 */
export const pathAndUri = (state: Route.PrintState): PathAndUri => {
  const path = `/${Array.join(Array.map(state.segments, encodeURIComponent), '/')}`
  const query = QueryParams.toString(state.queryParams)
  return { path, uri: String.isEmpty(query) ? path : `${path}?${query}` }
}

/**
 * The path of a URI, without its query: an entry's identity.
 *
 * @example
 * ```typescript
 * pathOf('/counter/menu?q=re') // '/counter/menu'
 * ```
 */
export const pathOf = (uri: string): string =>
  pathAndUri({
    segments: splitUri(uri).segments,
    queryParams: QueryParams.empty,
  }).path

const emptyPrintState: Route.PrintState = {
  segments: [],
  queryParams: QueryParams.empty,
}

const routesOf = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
): ReadonlyArray<DestinationRoute<Destination>> => navigation.routes ?? []

const slugState = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
): Route.PrintState =>
  Option.match(Option.fromNullishOr(navigation.slug), {
    onNone: () => emptyPrintState,
    onSome: slug => ({ segments: [slug], queryParams: QueryParams.empty }),
  })

const runOption = <A>(effect: Effect.Effect<A, unknown>): Option.Option<A> =>
  Result.match(Effect.runSync(Effect.result(effect)), {
    onFailure: () => Option.none(),
    onSuccess: Option.some,
  })

const printWith = <Destination>(
  route: DestinationRoute<Destination>,
  destination: Destination,
  state: Route.PrintState,
): Option.Option<Route.PrintState> =>
  Option.flatMap(route.routeCase.casePath.extract(destination), value =>
    runOption(route.routeCase.parser.print(value, state)),
  )

const rootStateOf = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
  route: DestinationRoute<Destination>,
): Route.PrintState =>
  route.placement === 'Fallback' ? emptyPrintState : slugState(navigation)

/**
 * The print state of every prefix of a stack, root first. None when a
 * Destination has no route or an entry prints no segment of its own. A
 * fallback root prints outside the slug, the inverse of how it parses.
 *
 * @example
 * ```typescript
 * printStates(navigation, stackWithEntries(Counter(), [presented(SessionSettings(), Push())]))
 * // Some([{ segments: ['counter'] }, { segments: ['counter', 'session'] }])
 * ```
 */
export const printStates = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
  stack: NavigationStack<Destination>,
): Option.Option<Array.NonEmptyReadonlyArray<Route.PrintState>> =>
  Array.reduce(
    entriesOf(stack),
    Option.map(
      Array.findFirst(routesOf(navigation), route =>
        printWith(route, stack.root, rootStateOf(navigation, route)),
      ),
      (rootState): Array.NonEmptyReadonlyArray<Route.PrintState> => [rootState],
    ),
    (maybeStates, entry) =>
      Option.flatMap(maybeStates, states => {
        const below = Array.lastNonEmpty(states)
        return pipe(
          Array.findFirst(routesOf(navigation), route =>
            printWith(route, entry.destination, below),
          ),
          Option.filter(next => next.segments.length > below.segments.length),
          Option.map(next => Array.append(states, next)),
        )
      }),
  )

/**
 * Prints a whole stack to one URI: the root and every entry in the path,
 * every entry's configuration in the query.
 *
 * @example
 * ```typescript
 * printStack(navigation, stackWithEntries(Counter(), [presented(ActionMenu('re'), Dialog())]))
 * // Some('/counter/menu?q=re')
 * ```
 */
export const printStack = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
  stack: NavigationStack<Destination>,
): Option.Option<string> =>
  Option.map(
    printStates(navigation, stack),
    states => pathAndUri(Array.lastNonEmpty(states)).uri,
  )

// PARSE

const routesPlaced = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
  placement: Placement,
): ReadonlyArray<DestinationRoute<Destination>> =>
  Array.filter(routesOf(navigation), route => route.placement === placement)

const entryRoutes = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
  isLenient: boolean,
): ReadonlyArray<DestinationRoute<Destination>> =>
  isLenient
    ? Array.appendAll(
        routesPlaced(navigation, 'Entry'),
        routesPlaced(navigation, 'Fallback'),
      )
    : routesPlaced(navigation, 'Entry')

const parseWith = <Destination>(
  route: DestinationRoute<Destination>,
  segments: ReadonlyArray<string>,
  search: string,
): Option.Option<
  Readonly<{ destination: Destination; remaining: ReadonlyArray<string> }>
> =>
  Option.map(
    runOption(route.routeCase.parser.parse(segments, search)),
    ([value, remaining]) => ({
      destination: route.routeCase.casePath.embed(value),
      remaining,
    }),
  )

const parseEntries = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
  segments: ReadonlyArray<string>,
  search: string,
  below: Destination,
  isLenient: boolean,
): Option.Option<ReadonlyArray<Presented<Destination>>> => {
  if (Array.isReadonlyArrayEmpty(segments)) {
    return Option.some([])
  }
  return Array.findFirst(
    Array.filter(entryRoutes(navigation, isLenient), route =>
      route.isAllowedAbove(below),
    ),
    route =>
      pipe(
        parseWith(route, segments, search),
        Option.filter(({ remaining }) => remaining.length < segments.length),
        Option.flatMap(({ destination, remaining }) =>
          Option.map(
            parseEntries(navigation, remaining, search, destination, isLenient),
            above => [
              presented(destination, route.styleOf(destination)),
              ...above,
            ],
          ),
        ),
      ),
  )
}

const parseRoots = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
  segments: ReadonlyArray<string>,
  search: string,
  isLenient: boolean,
): Option.Option<NavigationStack<Destination>> =>
  Array.findFirst(routesPlaced(navigation, 'Root'), route =>
    Option.flatMap(
      parseWith(route, segments, search),
      ({ destination, remaining }) =>
        Option.map(
          parseEntries(navigation, remaining, search, destination, isLenient),
          entries => stackFrom(destination, entries),
        ),
    ),
  )

const parseFallbackRoot = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
  segments: ReadonlyArray<string>,
  search: string,
): Option.Option<NavigationStack<Destination>> =>
  Array.findFirst(routesPlaced(navigation, 'Fallback'), route =>
    pipe(
      parseWith(route, segments, search),
      Option.filter(({ remaining }) => Array.isReadonlyArrayEmpty(remaining)),
      Option.map(({ destination }) => stackAtRoot(destination)),
    ),
  )

const withoutSlug = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
  segments: ReadonlyArray<string>,
): Option.Option<ReadonlyArray<string>> =>
  Option.match(Option.fromNullishOr(navigation.slug), {
    onNone: () => Option.some(segments),
    onSome: slug =>
      Array.matchLeft(segments, {
        onEmpty: () => Option.none(),
        onNonEmpty: (head, tail) =>
          head === slug ? Option.some(tail) : Option.none(),
      }),
  })

/**
 * Parses a URI into a stack. Total: a strict parse with backtracking
 * first, then a lenient one whose unmatched tail becomes NotFound, then a
 * NotFound root for a URI outside the slug, then the root stack.
 *
 * @example
 * ```typescript
 * parseStack(navigation, '/counter/session/menu?q=fo')
 * // [Counter, Push SessionSettings, Dialog ActionMenu('fo')]
 * parseStack(navigation, '/counter/nope')
 * // [Counter, Push NotFound(['nope'])]
 * parseStack(navigation, '/elsewhere')
 * // [NotFound(['elsewhere'])], which prints back as `/elsewhere`
 * ```
 */
export const parseStack = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
  uri: string,
): NavigationStack<Destination> => {
  const { segments, search } = splitUri(uri)
  const maybeAfterSlug = withoutSlug(navigation, segments)
  const parseInSlug =
    (isLenient: boolean) => (): Option.Option<NavigationStack<Destination>> =>
      Option.flatMap(maybeAfterSlug, afterSlug =>
        parseRoots(navigation, afterSlug, search, isLenient),
      )
  return pipe(
    parseInSlug(false)(),
    Option.orElse(parseInSlug(true)),
    Option.orElse(() => parseFallbackRoot(navigation, segments, search)),
    Option.getOrElse(() => stackAtRoot(navigation.root)),
  )
}

/**
 * The canonical spelling of a URI: parsed, then printed. A carrier showing
 * a different spelling is corrected with a replace.
 *
 * @example
 * ```typescript
 * canonicalUri(navigation, '/counter/menu?q=re&utm_source=mail')
 * // Some('/counter/menu?q=re')
 * ```
 */
export const canonicalUri = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
  uri: string,
): Option.Option<string> => printStack(navigation, parseStack(navigation, uri))

/** The URI of the root stack: `/counter`. */
export const defaultUri = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
): Option.Option<string> => printStack(navigation, stackAtRoot(navigation.root))
