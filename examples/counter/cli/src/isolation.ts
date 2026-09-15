/** Instant app id for FoldkitCounterV01. Kept here so the slim view never imports Instant. */
export const counterCliProgramId = '5417c2e3-c6b9-476d-a962-2e11c83492aa'

/** Instant room for public vs owned counters. Named share does not use this. */
export const counterInstantRoom = (): string | undefined => {
  const shareName = process.env['COUNTER_SHARE_NAME']
  if (shareName !== undefined && shareName !== '') {
    return undefined
  }
  const audience = process.env['COUNTER_AUDIENCE']
  const subject = process.env['COUNTER_SUBJECT']
  if (audience === 'mine' && subject !== undefined && subject !== '') {
    return `mine-${subject}`
  }
  return undefined
}

/**
 * Daemon suffix for a named counter. Distinct from L6 `mine-${subject}`.
 * Example: `named-kitchen:bob` so Carol cannot join Alice's kitchen
 * Processor.
 */
export const counterShareIsolation = (): string | undefined => {
  const name = process.env['COUNTER_SHARE_NAME']
  if (name === undefined || name === '') {
    return undefined
  }
  const subject = process.env['COUNTER_SUBJECT']
  return `named-${name}:${subject === undefined || subject === '' ? 'anon' : subject}`
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

/**
 * Applies `--name` / `--with` before the Processor or daemon starts.
 *
 * Named share stays on the public Instant app. It is not an L6 mine
 * room. `share --name kitchen --with bob` sets create so Alice binds
 * kitchen before the row exists.
 */
export const applyCounterShare = (
  name: string | undefined,
  grantedTo: string | undefined,
  isCreate: boolean,
): void => {
  if (name !== undefined && name !== '') {
    process.env['COUNTER_SHARE_NAME'] = name
    delete process.env['COUNTER_INSTANT_ROOM']
  }
  if (grantedTo !== undefined && grantedTo !== '') {
    process.env['COUNTER_SHARE_GRANT'] = grantedTo
  }
  if (isCreate) {
    process.env['COUNTER_SHARE_CREATE'] = '1'
  }
}

const isolationSuffix = (): string | undefined => {
  const share = counterShareIsolation()
  if (share !== undefined) {
    return share
  }
  return counterInstantRoom()
}

/** Isolates one daemon per tape, named share, and Instant room. Memory does not start a daemon. */
export const counterCliIsolationKey = (): string => {
  const suffix = isolationSuffix()
  const tapePath = process.env['COUNTER_TAPE_PATH']
  if (tapePath !== undefined && tapePath !== '') {
    if (suffix === undefined) {
      return tapePath
    }
    return `${tapePath}:${suffix}`
  }
  const tape = process.env['COUNTER_TAPE']
  if (tape !== undefined && tape !== '') {
    if (suffix === undefined) {
      return tape
    }
    return `${tape}:${suffix}`
  }
  if (suffix === undefined) {
    return 'instant'
  }
  return `instant:${suffix}`
}

/** True when this process must stay in-memory and skip the daemon. */
export const isCounterCliMemory = (): boolean =>
  process.env['COUNTER_TAPE'] === 'memory'
