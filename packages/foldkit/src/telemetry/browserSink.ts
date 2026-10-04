import { Array, Effect, Layer, Option } from 'effect'

import {
  type TelemetryEvent,
  encodeLine,
  telemetryEndpointPath,
} from './event.js'
import {
  type TelemetryBatching,
  TelemetryOrigin,
  TelemetrySink,
  type TelemetrySinkLayer,
  defaultTelemetryBatching,
  makeBufferedSink,
} from './sink.js'

/** The largest body a browser sends with `keepalive` or `sendBeacon`, in bytes. */
export const maximumKeepaliveBodyBytes = 60_000

const rejectedStatuses: ReadonlySet<number> = new Set([401, 403, 404])

/**
 * Where a browser sink sends its batches and how. `endpoint` is the path
 * the development server serves, `/__foldkit/telemetry` by default.
 * `fetch` replaces the global fetch, such as in a test.
 */
export type BrowserSinkOptions = Readonly<{
  endpoint?: string
  batching?: Partial<TelemetryBatching>
  fetch?: typeof fetch
}>

const oneByteCodePointLimit = 0x80

const twoByteCodePointLimit = 0x800

const threeByteCodePointLimit = 0x10000

const utf8BytesOf = (character: string): number => {
  const codePoint = Option.getOrElse(
    Option.fromNullishOr(character.codePointAt(0)),
    () => 0,
  )
  if (codePoint < oneByteCodePointLimit) {
    return 1
  } else if (codePoint < twoByteCodePointLimit) {
    return 2
  } else if (codePoint < threeByteCodePointLimit) {
    return 3
  } else {
    return 4
  }
}

const byteLengthOf = (text: string): number =>
  Array.reduce(
    text,
    0,
    (byteCount, character) => byteCount + utf8BytesOf(character),
  )

/**
 * Splits events into JSON bodies, each a TelemetryBatch of at most
 * {@link maximumKeepaliveBodyBytes}, keeping their order. An event too
 * large for one body gets a body of its own.
 */
const bodiesOf = (
  origin: Readonly<{ app: string; host: string }>,
  events: ReadonlyArray<TelemetryEvent>,
): ReadonlyArray<string> => {
  const prefix = `{"app":${JSON.stringify(origin.app)},"host":${JSON.stringify(origin.host)},"events":[`
  const suffix = ']}'
  const emptyBodyBytes = byteLengthOf(prefix) + byteLengthOf(suffix)
  const bodies: Array<string> = []
  let lines: Array<string> = []
  let bodyBytes = emptyBodyBytes

  const closeBody = (): void => {
    if (Array.isArrayNonEmpty(lines)) {
      bodies.push(`${prefix}${lines.join(',')}${suffix}`)
    }
    lines = []
    bodyBytes = emptyBodyBytes
  }

  Array.forEach(events, event => {
    const line = encodeLine(event)
    const lineBytes = byteLengthOf(line) + 1
    if (
      Array.isArrayNonEmpty(lines) &&
      bodyBytes + lineBytes > maximumKeepaliveBodyBytes
    ) {
      closeBody()
    }
    lines.push(line)
    bodyBytes += lineBytes
  })
  closeBody()
  return bodies
}

/**
 * A sink for a Program in a browser. It batches events and posts each
 * batch as JSON, `{ app, host, events }`, to the development server's
 * telemetry endpoint, which appends them to the file for that app and
 * host, such as `books-react.ndjson`. When the page is hidden it sends
 * what is waiting at once, and when the page goes away it sends the rest
 * with `navigator.sendBeacon`, so the last Actions before a reload land
 * too.
 *
 * The endpoint answers only local development and verified logins. When
 * it answers 401, 403, or 404, such as on a host that does not serve it,
 * the sink stops sending for the rest of the session and drops what it
 * gets, so telemetry never retries against a server that refuses it. A
 * network failure drops that one batch.
 *
 * @example
 * ```typescript
 * Telemetry.attach(handle, { app: 'books', sink: Telemetry.browserSink() })
 * ```
 */
export const browserSink = (
  options: BrowserSinkOptions = {},
): TelemetrySinkLayer =>
  Layer.effect(
    TelemetrySink,
    Effect.gen(function* () {
      const origin = yield* TelemetryOrigin
      const endpoint = options.endpoint ?? telemetryEndpointPath
      const send = options.fetch ?? globalThis.fetch.bind(globalThis)
      let isRefused = false

      const post = (body: string): Effect.Effect<void> =>
        Effect.promise(() =>
          send(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
            credentials: 'same-origin',
            keepalive: byteLengthOf(body) <= maximumKeepaliveBodyBytes,
          }).then(
            response => {
              if (rejectedStatuses.has(response.status)) {
                isRefused = true
              }
            },
            () => undefined,
          ),
        )

      const write = (
        events: ReadonlyArray<TelemetryEvent>,
      ): Effect.Effect<void> =>
        Effect.suspend(() =>
          isRefused
            ? Effect.void
            : Effect.forEach(bodiesOf(origin, events), post, { discard: true }),
        )

      const sink = yield* makeBufferedSink(write, {
        ...defaultTelemetryBatching,
        ...options.batching,
      })

      const sendWaitingWithBeacon = (): void => {
        const events = sink.takeWaiting()
        if (isRefused || Array.isReadonlyArrayEmpty(events)) {
          return
        }
        Array.forEach(bodiesOf(origin, events), body => {
          const isQueued =
            typeof navigator !== 'undefined' &&
            typeof navigator.sendBeacon === 'function' &&
            navigator.sendBeacon(
              endpoint,
              new Blob([body], { type: 'application/json' }),
            )
          if (!isQueued) {
            Effect.runFork(post(body))
          }
        })
      }

      const flushWhenHidden = (): void => {
        if (document.visibilityState === 'hidden') {
          Effect.runFork(sink.flush)
        }
      }

      if (typeof window !== 'undefined') {
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            window.addEventListener('pagehide', sendWaitingWithBeacon)
            document.addEventListener('visibilitychange', flushWhenHidden)
          }),
          () =>
            Effect.sync(() => {
              window.removeEventListener('pagehide', sendWaitingWithBeacon)
              document.removeEventListener('visibilitychange', flushWhenHidden)
            }),
        )
      }

      return { offer: sink.offer, flush: sink.flush }
    }),
  )
