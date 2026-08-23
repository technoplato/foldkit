import { pipe } from 'effect'
import { Route } from 'foldkit'
import { literal, r } from 'foldkit/route'

/** Puzzle Path. Pass `Path()` to `useModel`. Do not pass `'/puzzle'`. */
export const Path = r('Puzzle')
/** Puzzle Path. Pass `Path()` to `useModel`. Do not pass `'/puzzle'`. */
export type Path = typeof Path.Type

/**
 * Parser-printer for {@link Path}.
 * `pathRouter()` prints `/puzzle`. The hash tape is a projection of Model.
 */
export const pathRouter = pipe(literal('puzzle'), Route.mapTo(Path))
