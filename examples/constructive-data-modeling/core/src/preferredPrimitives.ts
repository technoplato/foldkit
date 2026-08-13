/**
 * Preferred Foldkit layer for new spatial and attention models.
 *
 * Use `foldkit/spatial` (`GridCoord`, `CardinalFacing`) and
 * `foldkit/attention` (`Roaming | Reading | Operating`) instead of
 * boolean pairs. See `examples/world/core`.
 */
export const preferredSpatialAttention: ReadonlyArray<string> = [
  'foldkit/spatial',
  'foldkit/attention',
  'foldkit/interactable',
  'foldkit/asyncData',
]
