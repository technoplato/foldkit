import { Array, Option } from 'effect'

const sha1Hex = (value: string): string => {
  let hash = 0x811c9dc5
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0')
  return `${hex}${hex}${hex}`
}

/**
 * Instant entity id for the public count snapshot row.
 * Instant requires a UUID. This constant is that one row.
 */
export const COUNT_UUID = 'c0a7c001-0000-4000-8000-000000000001'

/** Instant count row for one owned subject. Deterministic UUID. */
export const ownedCountId = (subject: string): string =>
  `c0a7c001-0000-4000-8000-${sha1Hex(subject).slice(0, 12)}`

/**
 * Instant count row for one named share. Distinct from {@link COUNT_UUID}
 * and from {@link ownedCountId}. Example: `kitchen` is not alice's
 * `--audience mine` row.
 */
export const namedCountId = (name: string): string =>
  `c0a7c009-0000-4000-8000-${sha1Hex(`share:${name}`).slice(0, 12)}`

/**
 * Occupancy token for a named counter. `kitchen` occupies
 * `/counter/kitchen` as `counter.kitchen`. That is not an Action filter;
 * increment and decrement stay listed.
 */
export const namedShareOccupancy = (name: string): string =>
  `counter.${name}`

/** Instant ACL fields on a named count row. */
export type CountAccessRow = Readonly<{
  readonly id: string
  readonly name?: string
  readonly owner?: string
  readonly granted?: string
}>

const grantedSubjects = (granted: string | undefined): ReadonlyArray<string> => {
  if (granted === undefined || granted === '') {
    return []
  }
  return Array.filter(
    Array.map(granted.split(','), subject => subject.trim()),
    subject => subject !== '',
  )
}

/**
 * True when `subject` may occupy a named count. Alice owns `kitchen`.
 * Bob is on `granted`. Carol is not. Missing `--as` cannot occupy.
 */
export const canOccupyNamedCount = (
  subject: string | undefined,
  row: CountAccessRow,
): boolean => {
  if (subject === undefined || subject === '') {
    return false
  }
  if (row.owner === subject) {
    return true
  }
  return Array.contains(grantedSubjects(row.granted), subject)
}

/**
 * Instant count id for this Processor.
 *
 * `--audience mine` stays L6 (`ownedCountId`). `--name kitchen` is L9:
 * owner and granted subjects bind {@link namedCountId}; everyone else
 * stays on the public row. `COUNTER_SHARE_CREATE=1` creates kitchen
 * even when the row is still missing.
 */
export const resolveCountIdFromRows = (
  rows: ReadonlyArray<CountAccessRow>,
): string => {
  const explicit = process.env['COUNTER_COUNT_ID']
  if (explicit !== undefined && explicit !== '') {
    return explicit
  }
  const shareName = process.env['COUNTER_SHARE_NAME']
  const subject = process.env['COUNTER_SUBJECT']
  if (
    process.env['COUNTER_SHARE_CREATE'] === '1' &&
    shareName !== undefined &&
    shareName !== ''
  ) {
    return namedCountId(shareName)
  }
  if (shareName !== undefined && shareName !== '') {
    const namedId = namedCountId(shareName)
    const maybeRow = Array.findFirst(
      rows,
      row => row.id === namedId || row.name === shareName,
    )
    if (
      Option.isSome(maybeRow) &&
      canOccupyNamedCount(subject, maybeRow.value)
    ) {
      return namedId
    }
    return COUNT_UUID
  }
  const audience = process.env['COUNTER_AUDIENCE']
  if (audience === 'mine' && subject !== undefined && subject !== '') {
    return ownedCountId(subject)
  }
  return COUNT_UUID
}

/**
 * True when this Processor is bound to `--name`.
 *
 * Uses `COUNTER_COUNT_ID` when NodeLive already resolved ACL. Does not
 * peek Instant. Example: alice after `share --name kitchen` binds
 * {@link namedCountId}.
 */
export const occupiesNamedShare = (name: string): boolean => {
  const explicit = process.env['COUNTER_COUNT_ID']
  if (explicit !== undefined && explicit !== '') {
    return explicit === namedCountId(name)
  }
  return (
    process.env['COUNTER_SHARE_CREATE'] === '1' &&
    process.env['COUNTER_SHARE_NAME'] === name
  )
}
