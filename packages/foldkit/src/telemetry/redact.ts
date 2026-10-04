import {
  Array,
  Match as M,
  Option,
  Order,
  Predicate,
  Record,
  type Schema,
  pipe,
} from 'effect'

import type { TelemetryCommand, TelemetryEvent } from './event.js'

/** What telemetry writes in place of a redacted value. */
export const redactedMarker = '[REDACTED]'

/** What telemetry writes in place of a value cut off by a size limit. */
export const truncatedMarker = '[TRUNCATED]'

/** What telemetry writes in place of a whole Model it leaves out. */
export const omittedModelMarker = '[MODEL]'

/** The default deepest nesting telemetry writes before {@link truncatedMarker}. */
export const maximumDepth = 8

/** The default number of items telemetry writes from one array. */
export const maximumArrayItems = 64

/** The default number of fields telemetry writes from one object. */
export const maximumObjectKeys = 64

/** The default length telemetry cuts one string to. */
export const maximumStringLength = 2_000

/** The shortest environment value the file sink scrubs from strings. */
export const minimumScrubbedValueLength = 12

/**
 * Keys whose values telemetry redacts at any depth by default: any key
 * containing `token`, `secret`, `password`, `passwd`, `authorization`,
 * `cookie`, `credential`, `signature`, `apiKey`, or `privateKey`, in any
 * case. So `refreshToken`, `Authorization`, and `set-cookie` are redacted,
 * and so is `tokens`, which errs on the safe side. The same names are
 * redacted as URL query parameters inside strings, so a signed URL keeps
 * its path but not its `Signature`.
 */
export const defaultSecretKeyPattern =
  /token|secret|passw(or)?d|authorization|cookie|credential|signature|api[-_]?key|private[-_]?key/i

const queryParameterPattern = /(^|[?&;\s])([^=&#;\s]+)=([^&#;\s]*)/g

const decodedParameterName = (name: string): string => {
  try {
    return decodeURIComponent(name)
  } catch {
    return name
  }
}

const hasSecretQueryParameter = (
  text: string,
  isSecretKey: (key: string) => boolean,
): boolean =>
  text.includes('=') &&
  Array.some(
    Array.fromIterable(text.matchAll(queryParameterPattern)),
    match =>
      Option.exists(Array.get(match, 2), name =>
        isSecretKey(decodedParameterName(name)),
      ) && Option.exists(Array.get(match, 3), value => value !== ''),
  )

const redactSecretQueryParameters = (
  text: string,
  isSecretKey: (key: string) => boolean,
): string =>
  text.includes('=')
    ? text.replace(
        queryParameterPattern,
        (parameter: string, separator: string, name: string, value: string) =>
          value !== '' && isSecretKey(decodedParameterName(name))
            ? `${separator}${name}=${redactedMarker}`
            : parameter,
      )
    : text

/**
 * How telemetry turns values into JSON it may write: which keys to redact,
 * which secret values to scrub out of strings, and how much of a value to
 * keep.
 */
export type RedactionPolicy = Readonly<{
  isSecretKey: (key: string) => boolean
  maybeSecretValuePattern: Option.Option<RegExp>
  maximumDepth: number
  maximumArrayItems: number
  maximumObjectKeys: number
  maximumStringLength: number
}>

/**
 * The policy telemetry uses unless told otherwise: the default secret
 * keys plus `extraSecretKeys`, matched exactly, and the default limits.
 *
 * @example
 * ```typescript
 * const policy = makeRedactionPolicy(['inviteCode'])
 * toTelemetryJson({ inviteCode: 'X7Q', title: 'Dune' }, policy)
 * // { inviteCode: '[REDACTED]', title: 'Dune' }
 * ```
 */
export const makeRedactionPolicy = (
  extraSecretKeys: ReadonlyArray<string> = [],
  maybeSecretValuePattern: Option.Option<RegExp> = Option.none(),
): RedactionPolicy => {
  const extraKeys = new Set(extraSecretKeys)
  return {
    isSecretKey: key => defaultSecretKeyPattern.test(key) || extraKeys.has(key),
    maybeSecretValuePattern,
    maximumDepth,
    maximumArrayItems,
    maximumObjectKeys,
    maximumStringLength,
  }
}

const escapeForPattern = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const longestFirst = Order.flip(
  Order.mapInput(Order.Number, (text: string) => text.length),
)

/**
 * A pattern that finds any of `values` inside a string, longest first, for
 * scrubbing secrets such as environment values out of what telemetry
 * writes. Values shorter than {@link minimumScrubbedValueLength} are left
 * out, so a common word such as `true` is never scrubbed. None when no
 * value is long enough.
 *
 * @example
 * ```typescript
 * secretValuePatternOf(['eyJhbGciOiJIUzI1NiJ9.abc', 'yes'])
 * // Some(/eyJhbGciOiJIUzI1NiJ9\.abc/g)
 * ```
 */
export const secretValuePatternOf = (
  values: Iterable<string>,
): Option.Option<RegExp> => {
  const longValues = pipe(
    Array.fromIterable(values),
    Array.filter(value => value.length >= minimumScrubbedValueLength),
    Array.dedupe,
    Array.sort(longestFirst),
  )
  return Array.match(longValues, {
    onEmpty: () => Option.none(),
    onNonEmpty: nonEmptyValues =>
      Option.some(
        new RegExp(
          Array.join(Array.map(nonEmptyValues, escapeForPattern), '|'),
          'g',
        ),
      ),
  })
}

const isPlainObject = (
  value: unknown,
): value is Readonly<Record<string, unknown>> => {
  if (!Predicate.isObject(value)) {
    return false
  }
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const containsSecretValue = (
  text: string,
  maybePattern: Option.Option<RegExp>,
): boolean => {
  if (Option.isNone(maybePattern)) {
    return false
  }
  maybePattern.value.lastIndex = 0
  return maybePattern.value.test(text)
}

const isCleanString = (text: string, policy: RedactionPolicy): boolean =>
  text.length <= policy.maximumStringLength &&
  !containsSecretValue(text, policy.maybeSecretValuePattern) &&
  !hasSecretQueryParameter(text, policy.isSecretKey)

const isCleanValue = (
  value: unknown,
  policy: RedactionPolicy,
  depth: number,
): boolean => {
  if (value === null || typeof value === 'boolean') {
    return true
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
  }
  if (typeof value === 'string') {
    return isCleanString(value, policy)
  }
  if (depth >= policy.maximumDepth) {
    return false
  }
  if (Array.isArray(value)) {
    return (
      value.length <= policy.maximumArrayItems &&
      value.every(item => isCleanValue(item, policy, depth + 1))
    )
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value)
    return (
      keys.length <= policy.maximumObjectKeys &&
      keys.every(
        key =>
          !policy.isSecretKey(key) &&
          isCleanValue(value[key], policy, depth + 1),
      )
    )
  }
  return false
}

/**
 * True when a value is already JSON telemetry may write as it is: plain
 * objects, arrays, strings, finite numbers, booleans, and null, within the
 * policy's limits, with no secret key and no secret value.
 */
const isCleanJson = (
  value: unknown,
  policy: RedactionPolicy,
): value is Schema.Json => isCleanValue(value, policy, 0)

/**
 * Cuts a string to the policy's length and scrubs its secret values and
 * its secret-looking URL query parameters, for any string telemetry
 * writes, such as a pretty Cause or a signed URL.
 *
 * @example
 * ```typescript
 * scrubText('https://files.example/cover.jpg?Policy=eyJ9&Signature=Nd7x', policy)
 * // 'https://files.example/cover.jpg?Policy=eyJ9&Signature=[REDACTED]'
 * ```
 */
export const scrubText = (text: string, policy: RedactionPolicy): string => {
  const scrubbedText = redactSecretQueryParameters(
    Option.match(policy.maybeSecretValuePattern, {
      onNone: () => text,
      onSome: pattern => {
        pattern.lastIndex = 0
        return text.replace(pattern, redactedMarker)
      },
    }),
    policy.isSecretKey,
  )
  return scrubbedText.length > policy.maximumStringLength
    ? `${scrubbedText.slice(0, policy.maximumStringLength)}${truncatedMarker}`
    : scrubbedText
}

const hasToJson = (
  value: object,
): value is Readonly<{ toJSON: () => unknown }> =>
  Predicate.hasProperty(value, 'toJSON') && Predicate.isFunction(value.toJSON)

const copyArray = (
  items: ReadonlyArray<unknown>,
  policy: RedactionPolicy,
  depth: number,
): Schema.Json => {
  const keptItems = Array.map(
    Array.take(items, policy.maximumArrayItems),
    item =>
      Option.getOrElse(
        copyValue(item, policy, depth + 1),
        (): Schema.Json => null,
      ),
  )
  const omittedCount = items.length - keptItems.length
  return omittedCount > 0
    ? Array.append(keptItems, `${truncatedMarker} ${omittedCount} more`)
    : keptItems
}

type JsonEntry = readonly [string, Schema.Json]

const copyEntry = (
  value: Readonly<Record<string, unknown>>,
  key: string,
  policy: RedactionPolicy,
  depth: number,
): Option.Option<JsonEntry> => {
  if (policy.isSecretKey(key)) {
    return Option.some<JsonEntry>([key, redactedMarker])
  } else {
    return Option.map(
      copyValue(value[key], policy, depth + 1),
      (copiedValue): JsonEntry => [key, copiedValue],
    )
  }
}

const copyObject = (
  value: Readonly<Record<string, unknown>>,
  policy: RedactionPolicy,
  depth: number,
): Schema.Json => {
  const keys = Object.keys(value)
  const keptKeys = Array.take(keys, policy.maximumObjectKeys)
  const copied = Record.fromEntries(
    Array.getSomes(
      Array.map(keptKeys, key => copyEntry(value, key, policy, depth)),
    ),
  )
  const omittedCount = keys.length - keptKeys.length
  return omittedCount > 0
    ? { ...copied, [truncatedMarker]: omittedCount }
    : copied
}

function copyValue(
  value: unknown,
  policy: RedactionPolicy,
  depth: number,
): Option.Option<Schema.Json> {
  if (value === null || typeof value === 'boolean') {
    return Option.some(value)
  }
  if (typeof value === 'number') {
    return Option.some(Number.isFinite(value) ? value : null)
  }
  if (typeof value === 'string') {
    return Option.some(scrubText(value, policy))
  }
  if (typeof value === 'bigint') {
    return Option.some(value.toString())
  }
  if (typeof value !== 'object') {
    return Option.none()
  }
  if (depth >= policy.maximumDepth) {
    return Option.some(truncatedMarker)
  }
  if (Array.isArray(value)) {
    return Option.some(copyArray(value, policy, depth))
  }
  if (value instanceof Map) {
    return Option.some(copyArray(Array.fromIterable(value), policy, depth))
  }
  if (value instanceof Set) {
    return Option.some(copyArray(Array.fromIterable(value), policy, depth))
  }
  if (!isPlainObject(value) && hasToJson(value)) {
    return copyValue(value.toJSON(), policy, depth + 1)
  }
  return Option.some(copyObject({ ...value }, policy, depth))
}

/**
 * Turns any value into JSON telemetry may write. Keys the policy calls
 * secret become {@link redactedMarker} at any depth, secret values inside
 * strings become {@link redactedMarker}, and values past the policy's
 * limits are cut off with {@link truncatedMarker}. Dates, Options, and
 * other values with `toJSON` are written as their JSON, Maps and Sets as
 * arrays, bigints as strings, and functions are left out.
 *
 * A value that is already clean JSON comes back as the same reference, so
 * a typical Message costs one read-only walk and no copy.
 *
 * @example
 * ```typescript
 * toTelemetryJson(
 *   { user: { name: 'Ada', refreshToken: 'r-1' }, at: new Date(0) },
 *   makeRedactionPolicy(),
 * )
 * // { user: { name: 'Ada', refreshToken: '[REDACTED]' }, at: '1970-01-01T00:00:00.000Z' }
 * ```
 */
export const toTelemetryJson = (
  value: unknown,
  policy: RedactionPolicy,
): Schema.Json => {
  if (isCleanJson(value, policy)) {
    return value
  }
  return Option.getOrElse(copyValue(value, policy, 0), (): Schema.Json => null)
}

const scrubCommand = (
  command: TelemetryCommand,
  policy: RedactionPolicy,
): TelemetryCommand =>
  command.args === undefined
    ? command
    : { name: command.name, args: toTelemetryJson(command.args, policy) }

const scrubOptionalJson = <Key extends string>(
  key: Key,
  maybeValue: Schema.Json | undefined,
  policy: RedactionPolicy,
): Partial<Record<Key, Schema.Json>> =>
  maybeValue === undefined
    ? {}
    : Record.singleton(key, toTelemetryJson(maybeValue, policy))

/**
 * Applies a policy again to every field of an event that can carry a
 * value from the Program, such as a Transition's payload and Command args
 * or a Crashed cause. The file sink runs every event through this with the
 * process's environment values as secrets, so no environment value
 * reaches disk, whichever process recorded the event.
 *
 * @example
 * ```typescript
 * scrubEvent(transition, makeRedactionPolicy([], secretValuePatternOf(Object.values(process.env))))
 * ```
 */
export const scrubEvent = (
  event: TelemetryEvent,
  policy: RedactionPolicy,
): TelemetryEvent =>
  M.value(event).pipe(
    M.withReturnType<TelemetryEvent>(),
    M.tagsExhaustive({
      SessionStarted: started => started,
      SessionStopped: stopped => stopped,
      Rendered: rendered => rendered,
      Transition: transition => ({
        ...transition,
        ...scrubOptionalJson('payload', transition.payload, policy),
        ...scrubOptionalJson('model', transition.model, policy),
        commands: Array.map(transition.commands, command =>
          scrubCommand(command, policy),
        ),
      }),
      CommandStarted: started => ({
        ...started,
        ...scrubOptionalJson('args', started.args, policy),
      }),
      CommandFinished: finished => ({
        ...finished,
        ...scrubOptionalJson('args', finished.args, policy),
        ...(finished.cause === undefined
          ? {}
          : { cause: scrubText(finished.cause, policy) }),
      }),
      Diagnostic: diagnostic =>
        diagnostic.cause === undefined
          ? diagnostic
          : { ...diagnostic, cause: scrubText(diagnostic.cause, policy) },
      Crashed: crashed => ({
        ...crashed,
        cause: scrubText(crashed.cause, policy),
      }),
    }),
  )
