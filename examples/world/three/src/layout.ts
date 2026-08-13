import type { CardinalFacing } from 'foldkit/spatial'
import { type GridCoord } from 'foldkit/spatial'

/** World units per grid cell. */
export const cellSize = 1.7

/** Converts a grid cell to a world-space floor point. */
export const worldFromCell = (
  coord: GridCoord,
): Readonly<{ x: number; z: number }> => ({
  x: (coord.x - 5) * cellSize,
  z: (coord.z - 5) * cellSize,
})

/** Yaw that faces the walker along a cardinal. South looks toward +Z. */
export const yawFromFacing = (facing: CardinalFacing): number => {
  if (facing._tag === 'N') {
    return Math.PI
  }
  if (facing._tag === 'E') {
    return -Math.PI / 2
  }
  if (facing._tag === 'W') {
    return Math.PI / 2
  }
  return 0
}
