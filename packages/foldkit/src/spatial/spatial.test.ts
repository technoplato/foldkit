import { Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  CardinalFacing,
  East,
  GridCoord,
  North,
  South,
  West,
  adjacent,
  equalCoord,
  gridCoord,
  inFront,
  includesAdjacent,
  isAdjacent,
  manhattan,
  offset,
  opposite,
  step,
  turnClockwise,
} from './spatial.js'

describe('CardinalFacing', () => {
  it('constructs four exhaustive tagged facings', () => {
    expect(North()).toEqual({ _tag: 'N' })
    expect(East()).toEqual({ _tag: 'E' })
    expect(South()).toEqual({ _tag: 'S' })
    expect(West()).toEqual({ _tag: 'W' })
  })

  it('decodes and encodes the union', () => {
    const decoded = S.decodeSync(CardinalFacing)({ _tag: 'E' })
    expect(decoded).toEqual(East())
    expect(S.encodeSync(CardinalFacing)(decoded)).toEqual({ _tag: 'E' })
  })
})

describe('GridCoord', () => {
  it('brands integer cells', () => {
    const coord = gridCoord(3, -2)
    expect(coord).toEqual({ x: 3, z: -2 })
    expect(S.decodeSync(GridCoord)({ x: 3, z: -2 })).toEqual(coord)
  })

  it('rejects non-integer cells', () => {
    expect(S.decodeUnknownExit(GridCoord)({ x: 1.5, z: 0 })._tag).toBe(
      'Failure',
    )
  })
})

describe('step and offset', () => {
  const origin = gridCoord(0, 0)

  it('steps one cell along each facing', () => {
    expect(step(origin, North())).toEqual(gridCoord(0, -1))
    expect(step(origin, East())).toEqual(gridCoord(1, 0))
    expect(step(origin, South())).toEqual(gridCoord(0, 1))
    expect(step(origin, West())).toEqual(gridCoord(-1, 0))
  })

  it('exposes the same unit offset used by step', () => {
    expect(offset(North())).toEqual({ dx: 0, dz: -1 })
    expect(offset(East())).toEqual({ dx: 1, dz: 0 })
  })

  it('treats inFront as step', () => {
    const at = gridCoord(4, 7)
    expect(inFront(at, West())).toEqual(step(at, West()))
  })
})

describe('manhattan and adjacent', () => {
  const origin = gridCoord(2, 2)

  it('counts orthogonal distance', () => {
    expect(manhattan(origin, origin)).toBe(0)
    expect(manhattan(origin, gridCoord(5, 2))).toBe(3)
    expect(manhattan(origin, gridCoord(1, 4))).toBe(3)
  })

  it('treats edge neighbors as adjacent and diagonals as not', () => {
    expect(isAdjacent(origin, gridCoord(2, 3))).toBe(true)
    expect(isAdjacent(origin, gridCoord(3, 3))).toBe(false)
    expect(isAdjacent(origin, origin)).toBe(false)
  })

  it('lists the four neighbors', () => {
    expect(adjacent(origin)).toEqual([
      gridCoord(2, 1),
      gridCoord(3, 2),
      gridCoord(2, 3),
      gridCoord(1, 2),
    ])
    expect(includesAdjacent(origin, gridCoord(3, 2))).toBe(true)
    expect(includesAdjacent(origin, gridCoord(3, 3))).toBe(false)
  })

  it('compares cells by value', () => {
    expect(equalCoord(gridCoord(1, 1), gridCoord(1, 1))).toBe(true)
    expect(equalCoord(gridCoord(1, 1), gridCoord(1, 2))).toBe(false)
  })
})

describe('turns', () => {
  it('reverses and rotates clockwise', () => {
    expect(opposite(North())).toEqual(South())
    expect(opposite(East())).toEqual(West())
    expect(turnClockwise(North())).toEqual(East())
    expect(turnClockwise(West())).toEqual(North())
  })
})
