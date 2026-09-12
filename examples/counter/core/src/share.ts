/**
 * Named-share occupancy (letter L9). Not L6 `--as` / `--audience`.
 *
 * `share --name kitchen --with bob` grants Bob occupancy of `/kitchen`.
 * Alice (owner) and Bob share one count row. Carol cannot occupy that
 * URI. The public `/counter` row does not move.
 */

const sha1Hex = (value: string): string => {
  let hash = 0x811c9dc5
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0')
  return `${hex}${hex}${hex}`
}

/** Instant count row for one named share. Deterministic UUID. */
export const namedShareCountId = (name: string): string =>
  `c0a7c001-0000-4000-8000-${sha1Hex(`share:${name}`).slice(0, 12)}`

/** Instant count row for a subject denied a named share. */
export const namedShareDeniedCountId = (
  name: string,
  subject: string,
): string =>
  `c0a7c001-0000-4000-8000-${sha1Hex(`share-denied:${name}:${subject}`).slice(0, 12)}`

/** Instant room Alice and granted subjects occupy for one name. */
export const namedShareRoom = (name: string): string => `share-${name}`

/** Instant room an ungranted subject gets instead of the named share. */
export const namedShareDeniedRoom = (name: string, subject: string): string =>
  `share-${name}-denied-${subject}`

/** Occupancy token written onto the Model. URI is `/${name}`. */
export const namedShareOccupancy = (name: string): string => name

/** Portable URI for a named share. Kitchen occupies `/kitchen`. */
export const namedShareUri = (name: string): string => `/${name}`

const shareNamePattern = /^[A-Za-z][A-Za-z0-9-]*$/

/** True when `--name` / `--with` is a share token, not a path or flag. */
export const isValidShareName = (value: string): boolean =>
  shareNamePattern.test(value)

/**
 * True when `path` is named-share occupancy, not home or `counter.*`.
 * `kitchen` and `/kitchen` occupy `/kitchen`.
 */
export const isNamedShareOccupancy = (path: string | undefined): boolean => {
  if (path === undefined) {
    return false
  }
  const trimmed = path.trim()
  if (trimmed === '' || trimmed === 'counter' || trimmed === '/counter') {
    return false
  }
  if (trimmed.startsWith('counter.') || trimmed.startsWith('/counter/')) {
    return false
  }
  const name = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed
  return isValidShareName(name)
}

/** Share name from an occupancy path. */
export const namedShareNameFromPath = (
  path: string | undefined,
): string | undefined => {
  if (!isNamedShareOccupancy(path) || path === undefined) {
    return undefined
  }
  const trimmed = path.trim()
  return trimmed.startsWith('/') ? trimmed.slice(1) : trimmed
}

/** One named-share grant. Owner plus `--with` subjects occupy the URI. */
export type NamedShareGrant = Readonly<{
  readonly name: string
  readonly owner: string
  readonly with: ReadonlyArray<string>
}>

/** True when the subject owns or was granted the named share. */
export const canOccupyNamedShare = (
  grant: NamedShareGrant,
  subject: string,
): boolean => grant.owner === subject || grant.with.includes(subject)

/**
 * Records that `owner` shared `name` with `withSubject`.
 * A second share with the same owner adds a grantee. A different
 * owner cannot take the name.
 */
export const grantNamedShare = (
  existing: NamedShareGrant | undefined,
  name: string,
  owner: string,
  withSubject: string,
):
  | Readonly<{ readonly _tag: 'Ok'; readonly grant: NamedShareGrant }>
  | Readonly<{ readonly _tag: 'Denied'; readonly message: string }> => {
  if (existing !== undefined && existing.owner !== owner) {
    return {
      _tag: 'Denied',
      message: `${name} is owned by ${existing.owner}. ${owner} cannot share it.`,
    }
  }
  const already = existing?.with ?? []
  const nextWith = already.includes(withSubject)
    ? already
    : [...already, withSubject]
  return {
    _tag: 'Ok',
    grant: { name, owner, with: nextWith },
  }
}

/** First occupier of a named share becomes owner with no grantees yet. */
export const claimNamedShare = (
  existing: NamedShareGrant | undefined,
  name: string,
  subject: string,
): NamedShareGrant => {
  if (existing !== undefined) {
    return existing
  }
  return { name, owner: subject, with: [] }
}
