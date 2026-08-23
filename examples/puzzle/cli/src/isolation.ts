/** Instant app id for FoldkitPuzzleV01. Kept here so the slim view never imports Instant. */
export const puzzleCliProgramId = '63750881-805d-46d9-89d4-c7ad0b1bb713'

/** Isolates one daemon per tape. Memory does not start a daemon. */
export const puzzleCliIsolationKey = (): string => {
  const tapePath = process.env['PUZZLE_TAPE_PATH']
  if (tapePath !== undefined && tapePath !== '') {
    return tapePath
  }
  const tape = process.env['PUZZLE_TAPE']
  if (tape !== undefined && tape !== '') {
    return tape
  }
  return 'instant'
}

/** True when this process must stay in-memory and skip the daemon. */
export const isPuzzleCliMemory = (): boolean =>
  process.env['PUZZLE_TAPE'] === 'memory'
