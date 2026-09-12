import { Option, pipe } from 'effect'
import { Route } from 'foldkit'
import { literal, r } from 'foldkit/route'

/** Counter Path. Pass `Path()` to `useModel`. Do not pass `'/counter'`. */
export const Path = r('Counter')
/** Counter Path. Pass `Path()` to `useModel`. Do not pass `'/counter'`. */
export type Path = typeof Path.Type

/**
 * Parser-printer for {@link Path}.
 * `pathRouter()` prints `/counter`.
 */
export const pathRouter = pipe(literal('counter'), Route.mapTo(Path))

/**
 * Canonical CLI `--path` for one Action. `counter.increment` occupies
 * `/counter/increment`. Home (`counter`, `/counter`, empty) is none.
 */
export const canonicalShowPath = (
  path: string | undefined,
): Option.Option<string> => {
  if (path === undefined) {
    return Option.none()
  }
  const trimmed = path.trim()
  if (trimmed === '' || trimmed === 'counter' || trimmed === '/counter') {
    return Option.none()
  }
  if (trimmed.startsWith('counter.')) {
    return Option.some(trimmed)
  }
  if (trimmed.startsWith('/counter/')) {
    return Option.some(`counter.${trimmed.slice('/counter/'.length)}`)
  }
  if (trimmed.startsWith('/')) {
    return Option.some(`counter.${trimmed.slice(1)}`)
  }
  if (trimmed.includes('.')) {
    return Option.some(trimmed)
  }
  return Option.some(`counter.${trimmed}`)
}

/**
 * Prints the occupiable URI for a show path.
 * None and `counter` print `/counter`. `counter.increment` prints
 * `/counter/increment`.
 */
export const printDestination = (path: string | undefined): string => {
  const maybePath = canonicalShowPath(path)
  if (Option.isNone(maybePath)) {
    return pathRouter()
  }
  const token = maybePath.value.startsWith('counter.')
    ? maybePath.value.slice('counter.'.length)
    : maybePath.value
  return `/counter/${token}`
}
