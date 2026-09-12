/** Instant app id for FoldkitCounterV01. Kept here so the slim view never imports Instant. */
export const counterCliProgramId = '5417c2e3-c6b9-476d-a962-2e11c83492aa'

/** Instant room for public vs owned counters. */
export const counterInstantRoom = (): string | undefined => {
  const audience = process.env['COUNTER_AUDIENCE']
  const subject = process.env['COUNTER_SUBJECT']
  if (audience === 'mine' && subject !== undefined && subject !== '') {
    return `mine-${subject}`
  }
  return undefined
}

/**
 * Applies `--as` / `--audience` before the Processor or daemon starts.
 *
 * `counter --as alice --audience mine show` must set the Instant room
 * before the CLI computes its daemon socket, or alice and the public
 * counter share one Processor.
 */
export const applyCounterIdentity = (
  subject: string | undefined,
  audience: string | undefined,
): void => {
  if (subject !== undefined && subject !== '') {
    process.env['COUNTER_SUBJECT'] = subject
  }
  if (audience === 'public' || audience === 'mine') {
    process.env['COUNTER_AUDIENCE'] = audience
  }
  if (audience === 'mine' && subject !== undefined && subject !== '') {
    process.env['COUNTER_INSTANT_ROOM'] = `mine-${subject}`
    return
  }
  if (audience === 'public') {
    delete process.env['COUNTER_INSTANT_ROOM']
  }
}

/** Isolates one daemon per tape and Instant room. Memory does not start a daemon. */
export const counterCliIsolationKey = (): string => {
  const tapePath = process.env['COUNTER_TAPE_PATH']
  if (tapePath !== undefined && tapePath !== '') {
    return tapePath
  }
  const room = counterInstantRoom()
  const tape = process.env['COUNTER_TAPE']
  if (tape !== undefined && tape !== '') {
    if (room === undefined) {
      return tape
    }
    return `${tape}:${room}`
  }
  if (room === undefined) {
    return 'instant'
  }
  return `instant:${room}`
}

/** True when this process must stay in-memory and skip the daemon. */
export const isCounterCliMemory = (): boolean =>
  process.env['COUNTER_TAPE'] === 'memory'
