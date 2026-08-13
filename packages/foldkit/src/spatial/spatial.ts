import { Array, Match as M, Schema as S } from 'effect'

import { ts } from '../schema/index.js'

/** Faces north, decreasing `z`. */
export const North = ts('N')

/** Faces east, increasing `x`. */
export const East = ts('E')

/** Faces south, increasing `z`. */
export const South = ts('S')

/** Faces west, decreasing `x`. */
export const West = ts('W')

/** One of the four cardinal facings on a grid. */
export const CardinalFacing = S.Union([North, East, South, West])

/** One of the four cardinal facings on a grid. */
export type CardinalFacing = typeof CardinalFacing.Type

/** Integer cell on the horizontal `x` / depth `z` plane. */
export const GridCoord = S.Struct({
  x: S.Int,
  z: S.Int,
}).pipe(S.brand('GridCoord'))

/** Integer cell on the horizontal `x` / depth `z` plane. */
export type GridCoord = typeof GridCoord.Type

/** Builds a branded grid cell from integer `x` and `z`. */
export const gridCoord = (x: number, z: number): GridCoord =>
  GridCoord.make({ x, z })

/** Unit step along a facing: north decreases `z`, east increases `x`. */
export const offset = (
  facing: CardinalFacing,
): Readonly<{ dx: number; dz: number }> =>
  M.value(facing).pipe(
    M.tagsExhaustive({
      N: () => ({ dx: 0, dz: -1 }),
      E: () => ({ dx: 1, dz: 0 }),
      S: () => ({ dx: 0, dz: 1 }),
      W: () => ({ dx: -1, dz: 0 }),
    }),
  )

/** The cell one step from `coord` in `facing`. */
export const step = (coord: GridCoord, facing: CardinalFacing): GridCoord => {
  const { dx, dz } = offset(facing)
  return gridCoord(coord.x + dx, coord.z + dz)
}

/** Manhattan distance between two cells. */
export const manhattan = (from: GridCoord, to: GridCoord): number =>
  Math.abs(from.x - to.x) + Math.abs(from.z - to.z)

/** The cell directly in front of `coord` for `facing`. */
export const inFront = (coord: GridCoord, facing: CardinalFacing): GridCoord =>
  step(coord, facing)

/** True when two cells share an edge. */
export const isAdjacent = (from: GridCoord, to: GridCoord): boolean =>
  manhattan(from, to) === 1

/** The four edge-adjacent cells around `coord`. */
export const adjacent = (coord: GridCoord): ReadonlyArray<GridCoord> => [
  step(coord, North()),
  step(coord, East()),
  step(coord, South()),
  step(coord, West()),
]

/** True when two cells have the same `x` and `z`. */
export const equalCoord = (left: GridCoord, right: GridCoord): boolean =>
  left.x === right.x && left.z === right.z

/** The facing opposite `facing`. */
export const opposite = (facing: CardinalFacing): CardinalFacing =>
  M.value(facing).pipe(
    M.tagsExhaustive({
      N: () => South(),
      E: () => West(),
      S: () => North(),
      W: () => East(),
    }),
  )

/** Turns `facing` 90 degrees clockwise. */
export const turnClockwise = (facing: CardinalFacing): CardinalFacing =>
  M.value(facing).pipe(
    M.tagsExhaustive({
      N: () => East(),
      E: () => South(),
      S: () => West(),
      W: () => North(),
    }),
  )

/** True when `candidate` is in the four-cell neighborhood of `coord`. */
export const includesAdjacent = (
  coord: GridCoord,
  candidate: GridCoord,
): boolean => Array.some(adjacent(coord), cell => equalCoord(cell, candidate))
