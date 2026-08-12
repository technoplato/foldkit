import { Option, Predicate, Record as Record_ } from 'effect'

const maximumCauseDescriptionLength = 1_500

/** Prefix written to browser consoles and the headless process stdout. */
export const multipleCountersV3DebugLogPrefix = '[foldkit-instant-v3]'

const taggedName = (cause: Readonly<Record<string, unknown>>): string => {
  if (Predicate.hasProperty(cause, '_tag') && typeof cause._tag === 'string') {
    return cause._tag
  }
  if (Predicate.hasProperty(cause, 'name') && typeof cause.name === 'string') {
    return cause.name
  }
  return 'Unknown'
}

const nestedCause = (cause: Readonly<Record<string, unknown>>): unknown => {
  if (Predicate.hasProperty(cause, 'cause')) {
    return cause.cause
  }
  return undefined
}

const extraFields = (cause: Readonly<Record<string, unknown>>): string => {
  const keys = ['occurrenceId', 'proposalId', 'operation', 'reason', 'message']
  const parts: Array<string> = []
  for (const key of keys) {
    const maybeValue = Record_.get(cause, key)
    if (Option.isSome(maybeValue)) {
      const value = maybeValue.value
      if (typeof value === 'string' && value.length > 0) {
        parts.push(`${key}=${value}`)
      } else if (typeof value === 'number') {
        parts.push(`${key}=${value.toString()}`)
      }
    }
  }
  if (parts.length === 0) {
    return ''
  }
  return ` (${parts.join(', ')})`
}

const truncate = (value: string): string => {
  if (value.length <= maximumCauseDescriptionLength) {
    return value
  }
  return `${value.slice(0, maximumCauseDescriptionLength)}…`
}

/** Flattens tagged errors and Schema issues into one operator-readable line. */
export const describeUnknownCause = (cause: unknown, depth = 0): string => {
  if (depth > 6) {
    return '…'
  }
  if (typeof cause === 'string') {
    return cause
  }
  if (typeof cause === 'number' || typeof cause === 'boolean') {
    return String(cause)
  }
  if (cause === null || cause === undefined) {
    return String(cause)
  }
  if (Predicate.isObject(cause)) {
    const name = taggedName(cause)
    const extras = extraFields(cause)
    const nested = nestedCause(cause)
    if (nested !== undefined) {
      return truncate(
        `${name}${extras}: ${describeUnknownCause(nested, depth + 1)}`,
      )
    }
    if (name !== 'Unknown' || extras.length > 0) {
      return truncate(`${name}${extras}`)
    }
    try {
      return truncate(JSON.stringify(cause))
    } catch {
      return name
    }
  }
  return String(cause)
}

/** Writes one structured debug line without Instant secrets. */
export const logMultipleCountersV3Debug = (
  event: string,
  details: Readonly<Record<string, unknown>> = {},
): void => {
  const encoded = JSON.stringify({ event, ...details })
  const line = `${multipleCountersV3DebugLogPrefix} ${encoded}\n`
  if (typeof process !== 'undefined' && process.stdout?.writable) {
    process.stdout.write(line)
    return
  }
  console.info(multipleCountersV3DebugLogPrefix, { event, ...details })
}
