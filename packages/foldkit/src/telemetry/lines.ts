import { Array, Option, Predicate, Schema as S } from 'effect'

import {
  type TelemetryEvent,
  TelemetryEvent as TelemetryEventSchema,
  decodeLine,
} from './event.js'
import { type TelemetrySurface, surfaceOfHostName } from './surface.js'

/** What decoding telemetry lines found: the events, and lines it could not read. */
export type DecodedLines = Readonly<{
  events: ReadonlyArray<TelemetryEvent>
  unreadableLineCount: number
}>

type LegacyOrigin = Readonly<{ app: string; surface: TelemetrySurface }>

const decodeFields = S.decodeUnknownOption(
  S.fromJsonString(S.Record(S.String, S.Unknown)),
)

const decodeEvent = S.decodeUnknownOption(TelemetryEventSchema)

const sessionTags: ReadonlySet<string> = new Set([
  'SessionStarted',
  'SessionStopped',
])

const legacySessionOriginOf = (
  fields: Readonly<Record<string, unknown>>,
): Option.Option<LegacyOrigin> => {
  const { _tag: tag, app, host } = fields
  if (
    Predicate.isString(tag) &&
    sessionTags.has(tag) &&
    Predicate.isString(app) &&
    Predicate.isString(host)
  ) {
    return Option.map(surfaceOfHostName(host), surface => ({ app, surface }))
  } else {
    return Option.none()
  }
}

const withoutHost = (
  fields: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  const { host: _host, ...rest } = fields
  return rest
}

const syncRuntimeMessages: ReadonlySet<string> = new Set([
  'SnapshotReceived',
  'RemoteMessageReceived',
  'LogRefolded',
  'SyncFailed',
])

const withSyncSource = (
  fields: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  const { _tag: tag, message, source } = fields
  const isSentBySync =
    tag === 'Transition' &&
    Predicate.isString(message) &&
    syncRuntimeMessages.has(message) &&
    Predicate.hasProperty(source, '_tag') &&
    source._tag === 'Host'
  return isSentBySync ? { ...fields, source: { _tag: 'Sync' } } : fields
}

type LegacyLine = Readonly<{
  fields: Readonly<Record<string, unknown>>
  session: string
}>

const legacyLineOf = (line: string): Option.Option<LegacyLine> =>
  Option.flatMap(decodeFields(line), fields => {
    const session = fields['session']
    if ('surface' in fields || !Predicate.isString(session)) {
      return Option.none()
    } else {
      return Option.some({ fields, session })
    }
  })

/**
 * Decodes NDJSON lines into events, in order, and counts the lines that
 * are not events, such as one cut short when a process stopped mid-write.
 *
 * Lines written before sessions declared a surface are read too. Then a
 * session named its Host on SessionStarted, `"host":"react"`, and its
 * other lines named neither app nor surface. Such a session is read as if
 * it had declared the surface its Host names, `web-react`, on every line,
 * so a file from the first telemetry release still summarizes. That
 * release also labeled the Messages the sync runtime sends, such as
 * SnapshotReceived, as sent by the Host; they read as sent by Sync. A line
 * of such a session whose SessionStarted is not among the lines, such as
 * one in a rotated file already deleted, cannot be placed and counts as
 * unreadable.
 *
 * @example
 * ```typescript
 * decodeLines([
 *   '{"_tag":"SessionStarted",…,"session":"9f3c2a71","app":"books","host":"react",…}',
 *   '{"_tag":"Rendered",…,"session":"9f3c2a71","painter":"React","durationMs":3.2}',
 * ])
 * // { events: [SessionStarted { surface: 'web-react', … }, Rendered { app: 'books', surface: 'web-react', … }], unreadableLineCount: 0 }
 * ```
 */
export const decodeLines = (lines: ReadonlyArray<string>): DecodedLines => {
  const legacyOrigins = new Map<string, LegacyOrigin>()
  const events: Array<TelemetryEvent> = []
  let unreadableLineCount = 0

  const upgradeLegacyLine = ({
    fields,
    session,
  }: LegacyLine): Option.Option<TelemetryEvent> => {
    const maybeSessionOrigin = legacySessionOriginOf(fields)
    if (Option.isSome(maybeSessionOrigin)) {
      legacyOrigins.set(session, maybeSessionOrigin.value)
      return decodeEvent({
        ...withoutHost(fields),
        surface: maybeSessionOrigin.value.surface,
      })
    } else {
      return Option.flatMap(
        Option.fromNullishOr(legacyOrigins.get(session)),
        origin =>
          decodeEvent({
            ...withSyncSource(fields),
            app: origin.app,
            surface: origin.surface,
          }),
      )
    }
  }

  Array.forEach(lines, line => {
    const maybeEvent = Option.orElse(decodeLine(line), () =>
      Option.flatMap(legacyLineOf(line), upgradeLegacyLine),
    )
    if (Option.isSome(maybeEvent)) {
      events.push(maybeEvent.value)
    } else {
      unreadableLineCount += 1
    }
  })

  return { events, unreadableLineCount }
}
