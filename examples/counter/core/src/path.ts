import { pipe } from 'effect'
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
