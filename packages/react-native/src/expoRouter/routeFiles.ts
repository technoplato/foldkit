import { Array, Option, Order, pipe } from 'effect'
import {
  type DeclaredAddress,
  pathOfAddress,
} from 'foldkit/navigation/route-table'

// FILES

/** One route file: its path under the app's `app` folder, and what it holds. */
export type RouteFile = Readonly<{ path: string; contents: string }>

/**
 * The first line of every generated route file. The check takes a file
 * that starts with it for one this generator owns, and leaves every
 * other file, such as a layout a person wrote, alone.
 */
export const generatedMark =
  '// Generated from the Program’s declared routes by foldkit-expo-routes. Do not edit: run it again.'

const screenLine =
  "export { FoldkitRouterScreen as default } from '@foldkit/react-native/expo-router'"

const contentsOf = (address: string): string =>
  `${generatedMark}\n// ${address}\n${screenLine}\n`

const catchAllFile = '[...path].tsx'

const indexFile = 'index.tsx'

const fileSpelling = {
  param: (name: string): string => `[${name}]`,
  rest: (name: string): string => `[...${name}]`,
}

/**
 * The route files a Program's addresses ask for: the catch-all and the
 * bare address, which show any address with no file of its own, then one
 * file for each address, where Expo Router looks for it,
 * `books/[slug]/listen/index.tsx` for `/books/:slug/listen`. Every file
 * is the same generic screen: which Destination an address shows stays
 * the Program's to say. With no addresses it is the two files an app
 * needs to run at all.
 *
 * @example
 * ```typescript
 * routeFilesOf(addressesOf(navigation))
 * // [{ path: '[...path].tsx', … }, { path: 'index.tsx', … }, { path: 'books/index.tsx', … }, …]
 * ```
 */
export const routeFilesOf = (
  addresses: ReadonlyArray<DeclaredAddress>,
): ReadonlyArray<RouteFile> =>
  Array.dedupeWith(
    [
      { path: catchAllFile, contents: contentsOf('every other address') },
      { path: indexFile, contents: contentsOf('/') },
      ...Array.map(addresses, address => {
        const path = pathOfAddress(address.segments, fileSpelling)
        return {
          path: `${path.slice(1)}/${indexFile}`,
          contents: contentsOf(path),
        }
      }),
    ],
    (self, that) => self.path === that.path,
  )

// CHECK

/**
 * One way the route files on disk differ from what the Program declares:
 * a file is `Missing`, a generated file has `Changed`, or a generated
 * file is `Unasked` for by any address.
 */
export type StaleRouteFile = Readonly<{
  _tag: 'Missing' | 'Changed' | 'Unasked'
  path: string
}>

/**
 * The route files that are stale: what differs between the files a
 * Program's addresses ask for and the files on disk, by path. A file on
 * disk that does not start with {@link generatedMark} is a person's own
 * and is never named.
 *
 * @example
 * ```typescript
 * staleRouteFilesOf(routeFilesOf(addresses), filesOnDisk)
 * // [{ _tag: 'Missing', path: 'books/[slug]/index.tsx' }]
 * ```
 */
export const staleRouteFilesOf = (
  expected: ReadonlyArray<RouteFile>,
  onDisk: ReadonlyMap<string, string>,
): ReadonlyArray<StaleRouteFile> => {
  const asked = new Set(Array.map(expected, file => file.path))
  const differing = Array.flatMap(expected, (file): Array<StaleRouteFile> => {
    const held = onDisk.get(file.path)
    if (held === undefined) {
      return [{ _tag: 'Missing', path: file.path }]
    } else if (held !== file.contents) {
      return [{ _tag: 'Changed', path: file.path }]
    } else {
      return []
    }
  })
  const unasked = Array.flatMap(
    Array.fromIterable(onDisk),
    ([path, contents]): Array<StaleRouteFile> =>
      !asked.has(path) && contents.startsWith(generatedMark)
        ? [{ _tag: 'Unasked', path }]
        : [],
  )
  return [...differing, ...unasked]
}

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
