import { Array, Option, Order, pipe } from 'effect'

// NAMES

/** The params Expo Router keeps for a route: one value, or the rest. */
export type RouteParams = Readonly<
  Record<string, string | ReadonlyArray<string>>
>

/** The route file an address is shown through, and the values it reads. */
export type NamedRoute = Readonly<{ name: string; params: RouteParams }>

const indexName = 'index'

const catchAllName = '[...path]'

const partsOfName = (name: string): ReadonlyArray<string> =>
  Array.filter(name.split('/'), part => part !== indexName && part !== '')

const paramNameOf = (part: string): Option.Option<string> =>
  part.startsWith('[') && part.endsWith(']') && !part.startsWith('[...')
    ? Option.some(part.slice(1, -1))
    : Option.none()

const isRestPart = (part: string): boolean => part.startsWith('[...')

type Fit = Readonly<{ name: string; params: RouteParams; words: number }>

const fitOf = (
  name: string,
  segments: ReadonlyArray<string>,
): Option.Option<Fit> => {
  const parts = partsOfName(name)
  if (parts.length !== segments.length || Array.some(parts, isRestPart)) {
    return Option.none()
  }
  return Array.reduce(
    Array.zip(parts, segments),
    Option.some<Fit>({ name, params: {}, words: 0 }),
    (maybeFit, [part, segment]) =>
      Option.flatMap(maybeFit, fit =>
        Option.match(paramNameOf(part), {
          onSome: paramName =>
            Option.some({
              ...fit,
              params: { ...fit.params, [paramName]: segment },
            }),
          onNone: () =>
            part === segment
              ? Option.some({ ...fit, words: fit.words + 1 })
              : Option.none(),
        }),
      ),
  )
}

const byWords = Order.mapInput(
  Order.flip(Order.Number),
  (fit: Fit) => fit.words,
)

/**
 * The route file that shows an address, among the files Expo Router
 * holds: the one whose path the address fits, a file with more exact
 * words before one with more values, with the values as its params. An
 * address no file fits goes through the catch-all, so an app with no
 * generated files shows every address there.
 *
 * @example
 * ```typescript
 * routeNameFor(['books', 'a-title', 'listen'], routeNames)
 * // { name: 'books/[slug]/listen/index', params: { slug: 'a-title' } }
 * ```
 */
export const routeNameFor = (
  segments: ReadonlyArray<string>,
  routeNames: ReadonlyArray<string>,
): NamedRoute =>
  pipe(
    Array.getSomes(Array.map(routeNames, name => fitOf(name, segments))),
    Array.sort(byWords),
    Array.head,
    Option.match({
      onSome: fit => ({ name: fit.name, params: fit.params }),
      onNone: () => ({ name: catchAllName, params: { path: segments } }),
    }),
  )

/**
 * The segments of the address a named route shows, from its params. None
 * when a value its path needs is missing, or for the catch-all, whose
 * address is its `path` param.
 *
 * @example
 * ```typescript
 * uriOfNamedRoute('books/[slug]/index', { slug: 'a-title' }) // Some(['books', 'a-title'])
 * ```
 */
export const uriOfNamedRoute = (
  name: string,
  params: Readonly<Record<string, unknown>>,
): Option.Option<ReadonlyArray<string>> =>
  Array.some(partsOfName(name), isRestPart)
    ? Option.none()
    : Option.all(
        Array.map(partsOfName(name), part =>
          Option.match(paramNameOf(part), {
            onNone: () => Option.some(part),
            onSome: paramName => {
              const value = params[paramName]
              return typeof value === 'string'
                ? Option.some(value)
                : Option.none()
            },
          }),
        ),
      )
