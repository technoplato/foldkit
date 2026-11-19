import {
  Array,
  Effect,
  Equal,
  Option,
  Predicate,
  Schema as S,
  pipe,
} from 'effect'
import { FastCheck } from 'effect/testing'

import * as Route from '../route/parser.js'
import type {
  DeclaredNavigation,
  DestinationRoute,
  Placement,
  ProgramNavigation,
} from './declaration.js'
import { entriesOf } from './structure.js'
import { parseStack } from './uri.js'

// TABLE

/**
 * One declared route as plain data: the Destination it shows, by its tag;
 * where it may sit; how it presents; the parts of its own path; and a
 * sample of those parts, made from the Schemas it reads, that the route
 * parses.
 */
export type DeclaredRoute = Readonly<{
  name: string
  placement: Placement
  presentation: string
  segments: ReadonlyArray<Route.RouteSegmentShape>
  sample: ReadonlyArray<string>
}>

/**
 * One address a Program can be at: the Destinations of its stack by tag,
 * root first, how the top one presents, and the parts of its whole path,
 * the Program's slug first.
 *
 * @example
 * ```typescript
 * // { names: ['LibraryPage', 'TitlePage', 'ListenPage'], presentation: 'Push',
 * //   segments: [Literal books, Param slug, Literal listen] }
 * ```
 */
export type DeclaredAddress = Readonly<{
  names: ReadonlyArray<string>
  presentation: string
  segments: ReadonlyArray<Route.RouteSegmentShape>
}>

type AnyNavigation = ProgramNavigation<any, any> | DeclaredNavigation<any>

const sampleSeed = 20261118

const sampleOfSchema = (schema: S.Codec<any, string>): Option.Option<string> =>
  Option.liftThrowable(() =>
    pipe(
      FastCheck.sample(S.toArbitrary(schema), { seed: sampleSeed, numRuns: 1 }),
      Array.head,
      Option.map(S.encodeSync(schema)),
    ),
  )().pipe(Option.flatten)

const plainSample = 'x'

const numberSample = '1'

const sampleOfSegment = (
  segment: Route.RouteSegmentShape,
): Option.Option<string> => {
  if (segment._tag === 'Literal') {
    return Option.some(segment.segment)
  } else if (segment._tag === 'Rest') {
    return Option.some(plainSample)
  } else if (segment.kind === 'Int') {
    return Option.some(numberSample)
  } else if (segment.maybeSchema !== undefined) {
    return sampleOfSchema(segment.maybeSchema)
  } else {
    return Option.some(plainSample)
  }
}

const tagOf = (destination: unknown): Option.Option<string> =>
  Predicate.hasProperty(destination, '_tag') &&
  typeof destination._tag === 'string'
    ? Option.some(destination._tag)
    : Option.none()

const rowOf = (route: DestinationRoute<any>): Option.Option<DeclaredRoute> =>
  Option.gen(function* () {
    const shape = yield* Route.shapeOf(route.routeCase.parser)
    const sample = yield* Option.all(Array.map(shape.segments, sampleOfSegment))
    const [value] = yield* Option.liftThrowable(() =>
      Effect.runSync(route.routeCase.parser.parse(sample)),
    )()
    const destination = route.routeCase.casePath.embed(value)
    const name = yield* tagOf(destination)
    return {
      name,
      placement: route.placement,
      presentation: route.styleOf(destination)._tag,
      segments: shape.segments,
      sample,
    }
  })

/**
 * A Program's declared routes as a table, in the order it declares them:
 * each named by its Destination's tag, with where it may sit, how it
 * presents, and the parts of its own path. A route whose parser cannot
 * say its shape, or whose Schema gives no sample, is left out; the
 * Program still parses it, and a Client falls back to showing it through
 * a catch-all.
 *
 * @example
 * ```typescript
 * routeTableOf(navigation)
 * // [{ name: 'Counter', placement: 'Root', presentation: 'Push', segments: [] }, …]
 * ```
 */
export const routeTableOf = (
  navigation: AnyNavigation,
): ReadonlyArray<DeclaredRoute> =>
  Array.getSomes(Array.map(navigation.routes, rowOf))

// ADDRESSES

/** How deep a stack `addressesOf` follows unless told otherwise. */
export const defaultAddressDepth = 6

type Chain = Readonly<{
  rows: Array.NonEmptyReadonlyArray<DeclaredRoute>
}>

const slugSegments = (
  navigation: AnyNavigation,
): ReadonlyArray<Route.RouteSegmentShape> =>
  navigation.slug === undefined
    ? []
    : [{ _tag: 'Literal', segment: navigation.slug }]

const sampleUriOf = (navigation: AnyNavigation, chain: Chain): string =>
  `/${Array.join(
    [
      ...(navigation.slug === undefined ? [] : [navigation.slug]),
      ...Array.flatMap(chain.rows, row => row.sample),
    ],
    '/',
  )}`

const namesAt = (
  navigation: AnyNavigation,
  uri: string,
): ReadonlyArray<string> => {
  const stack = parseStack(navigation, uri)
  return Array.getSomes(
    Array.map(
      [stack.root, ...Array.map(entriesOf(stack), entry => entry.destination)],
      tagOf,
    ),
  )
}

const isAllowed = (navigation: AnyNavigation, chain: Chain): boolean =>
  Equal.equals(
    namesAt(navigation, sampleUriOf(navigation, chain)),
    Array.map(chain.rows, row => row.name),
  )

const addressOf = (
  navigation: AnyNavigation,
  chain: Chain,
): DeclaredAddress => ({
  names: Array.map(chain.rows, row => row.name),
  presentation: Array.lastNonEmpty(chain.rows).presentation,
  segments: [
    ...slugSegments(navigation),
    ...Array.flatMap(chain.rows, row => row.segments),
  ],
})

/**
 * Every address a Program can be at, as plain data, shallowest first and
 * in the order the routes are declared: each stack its routes allow, up
 * to `maxDepth` screens, and none they refuse. Whether a stack is allowed
 * is asked of the Program's own parser, with a sample address made from
 * the routes' Schemas, so this never restates a route's rules. The
 * samples are the same on every run.
 *
 * @example
 * ```typescript
 * addressesOf(navigation).map(address => pathOfAddress(address.segments, { param: name => `:${name}` }))
 * // ['/books', '/books/profile', '/books/:slug', '/books/:slug/listen', …]
 * ```
 */
export const addressesOf = (
  navigation: AnyNavigation,
  options: Readonly<{ maxDepth?: number }> = {},
): ReadonlyArray<DeclaredAddress> => {
  const maxDepth = options.maxDepth ?? defaultAddressDepth
  const table = routeTableOf(navigation)
  const entryRows = Array.filter(table, row => row.placement === 'Entry')
  const roots: ReadonlyArray<Chain> = Array.filter(
    Array.map(
      Array.filter(table, row => row.placement === 'Root'),
      (row): Chain => ({ rows: [row] }),
    ),
    chain => isAllowed(navigation, chain),
  )
  const deeper = (chains: ReadonlyArray<Chain>): ReadonlyArray<Chain> =>
    Array.filter(
      Array.flatMap(chains, chain =>
        Array.map(
          Array.filter(
            entryRows,
            row => !Array.some(chain.rows, held => held.name === row.name),
          ),
          (row): Chain => ({ rows: [...chain.rows, row] }),
        ),
      ),
      chain => isAllowed(navigation, chain),
    )
  const levels = Array.reduce(
    Array.range(2, Math.max(2, maxDepth)),
    { all: roots, last: roots },
    (state, depth) => {
      const next = depth > maxDepth ? [] : deeper(state.last)
      return { all: [...state.all, ...next], last: next }
    },
  )
  return Array.map(levels.all, chain => addressOf(navigation, chain))
}

// PATH

/**
 * How a Client spells the parts of an address that are not exact words:
 * `:slug` for one router, `[slug]` for another.
 */
export type AddressSpelling = Readonly<{
  param: (name: string) => string
  rest?: (name: string) => string
}>

/**
 * An address's parts as one path, each value spelled the way a Client's
 * router spells it.
 *
 * @example
 * ```typescript
 * pathOfAddress(address.segments, { param: name => `:${name}` }) // '/books/:slug/listen'
 * pathOfAddress(address.segments, { param: name => `[${name}]` }) // '/books/[slug]/listen'
 * ```
 */
export const pathOfAddress = (
  segments: ReadonlyArray<Route.RouteSegmentShape>,
  spelling: AddressSpelling,
): string =>
  `/${Array.join(
    Array.map(segments, segment => {
      if (segment._tag === 'Literal') {
        return segment.segment
      } else if (segment._tag === 'Param') {
        return spelling.param(segment.name)
      } else {
        return (spelling.rest ?? spelling.param)(segment.name)
      }
    }),
    '/',
  )}`
