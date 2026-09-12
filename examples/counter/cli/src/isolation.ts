import {
  canOccupyStoredShare,
  ensureNamedShareOwner,
  lookupNamedShare,
} from './shareLedger.js'

/** Instant app id for FoldkitCounterV01. Kept here so the slim view never imports Instant. */
export const counterCliProgramId = '5417c2e3-c6b9-476d-a962-2e11c83492aa'

const sha1Hex = (value: string): string => {
  let hash = 0x811c9dc5
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0')
  return `${hex}${hex}${hex}`
}

const namedShareCountId = (name: string): string =>
  `c0a7c001-0000-4000-8000-${sha1Hex(`share:${name}`).slice(0, 12)}`

const namedShareDeniedCountId = (name: string, subject: string): string =>
  `c0a7c001-0000-4000-8000-${sha1Hex(`share-denied:${name}:${subject}`).slice(0, 12)}`

const namedShareRoom = (name: string): string => `share-${name}`

const namedShareDeniedRoom = (name: string, subject: string): string =>
  `share-${name}-denied-${subject}`

/** Instant room for public vs owned vs named-share counters. */
export const counterInstantRoom = (): string | undefined => {
  const explicit = process.env['COUNTER_INSTANT_ROOM']
  if (explicit !== undefined && explicit !== '') {
    return explicit
  }
  const audience = process.env['COUNTER_AUDIENCE']
  const subject = process.env['COUNTER_SUBJECT']
  if (audience === 'mine' && subject !== undefined && subject !== '') {
    return `mine-${subject}`
  }
  return undefined
}

const bindNamedShare = (name: string, subject: string): void => {
  const originalTape = process.env['COUNTER_TAPE_PATH']
  if (
    originalTape !== undefined &&
    originalTape !== '' &&
    (process.env['COUNTER_SHARE_LEDGER'] === undefined ||
      process.env['COUNTER_SHARE_LEDGER'] === '')
  ) {
    process.env['COUNTER_SHARE_LEDGER'] = `${originalTape}.shares.json`
  }
  process.env['COUNTER_SHARE_NAME'] = name
  const existing = lookupNamedShare(name)
  const grant =
    existing === undefined ? ensureNamedShareOwner(name, subject) : existing
  const allowed = canOccupyStoredShare(grant, subject)
  if (allowed) {
    const room = namedShareRoom(name)
    process.env['COUNTER_INSTANT_ROOM'] = room
    process.env['COUNTER_COUNT_ID'] = namedShareCountId(name)
    if (originalTape !== undefined && originalTape !== '') {
      process.env['COUNTER_TAPE_PATH'] = `${originalTape}.${room}`
    }
    return
  }
  const room = namedShareDeniedRoom(name, subject)
  process.env['COUNTER_INSTANT_ROOM'] = room
  process.env['COUNTER_COUNT_ID'] = namedShareDeniedCountId(name, subject)
  if (originalTape !== undefined && originalTape !== '') {
    process.env['COUNTER_TAPE_PATH'] = `${originalTape}.${room}`
  }
}

/**
 * Applies `--as` / `--audience` / `--name` before the Processor or
 * daemon starts.
 *
 * `counter --as alice --audience mine show` must set the Instant room
 * before the CLI computes its daemon socket, or alice and the public
 * counter share one Processor.
 *
 * `counter --as alice --name kitchen show` occupies `/kitchen`. That
 * is L9 named-share, not L6 mine. File tapes fork a sibling tape so
 * the public snapshot is not clobbered.
 */
export const applyCounterIdentity = (
  subject: string | undefined,
  audience: string | undefined,
  name?: string,
): void => {
  if (subject !== undefined && subject !== '') {
    process.env['COUNTER_SUBJECT'] = subject
  }
  if (audience === 'public' || audience === 'mine') {
    process.env['COUNTER_AUDIENCE'] = audience
  }
  if (audience === 'mine' && subject !== undefined && subject !== '') {
    process.env['COUNTER_INSTANT_ROOM'] = `mine-${subject}`
  }
  if (audience === 'public') {
    delete process.env['COUNTER_INSTANT_ROOM']
  }
  if (
    name !== undefined &&
    name !== '' &&
    subject !== undefined &&
    subject !== ''
  ) {
    bindNamedShare(name, subject)
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
