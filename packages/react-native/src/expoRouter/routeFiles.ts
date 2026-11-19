import { Array } from 'effect'
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
