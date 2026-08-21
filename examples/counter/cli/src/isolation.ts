/** Instant app id for FoldkitCounterV01. Kept here so the slim view never imports Instant. */
export const counterCliProgramId = '5417c2e3-c6b9-476d-a962-2e11c83492aa'

/** Isolates one daemon per tape. Memory does not start a daemon. */
export const counterCliIsolationKey = (): string => {
  const tapePath = process.env['COUNTER_TAPE_PATH']
  if (tapePath !== undefined && tapePath !== '') {
    return tapePath
  }
  const tape = process.env['COUNTER_TAPE']
  if (tape !== undefined && tape !== '') {
    return tape
  }
  return 'instant'
}

/** True when this process must stay in-memory and skip the daemon. */
export const isCounterCliMemory = (): boolean =>
  process.env['COUNTER_TAPE'] === 'memory'
