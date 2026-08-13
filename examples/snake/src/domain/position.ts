import { Match, Schema } from 'effect'
import { East, North, South, West, offset } from 'foldkit/spatial'

import { GAME } from '../constants'
import * as Direction from './direction'

export const Position = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
})

export const equivalence = Schema.toEquivalence(Position)

export type Position = typeof Position.Type

export const wrap = ({ x, y }: Position): Position => ({
  x: x < 0 ? GAME.GRID_SIZE - 1 : x >= GAME.GRID_SIZE ? 0 : x,
  y: y < 0 ? GAME.GRID_SIZE - 1 : y >= GAME.GRID_SIZE ? 0 : y,
})

const facingForDirection = (direction: Direction.Direction) =>
  Match.value(direction).pipe(
    Match.when('Up', () => North()),
    Match.when('Down', () => South()),
    Match.when('Left', () => West()),
    Match.when('Right', () => East()),
    Match.exhaustive,
  )

export const move = (
  pos: Position,
  direction: Direction.Direction,
): Position => {
  const { dx, dz } = offset(facingForDirection(direction))
  return wrap({ x: pos.x + dx, y: pos.y + dz })
}
