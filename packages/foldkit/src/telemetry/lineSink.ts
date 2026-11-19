import { Effect, Layer } from 'effect'

import { type TelemetryEvent, encodeLine } from './event.js'
import { TelemetrySink, type TelemetrySinkLayer } from './sink.js'

// LINE SINK

/** The longest line a line sink writes before it leaves the payload out: 4,000 characters. */
export const defaultMaximumLineCharacters = 4_000

/** How a line sink writes: the longest line it hands on whole. */
export type LineSinkOptions = Readonly<{
  maximumLineBytes?: number
}>

const withoutPayload = (event: TelemetryEvent): TelemetryEvent =>
  event._tag === 'Transition'
    ? { ...event, payload: { omitted: 'too long for one line' } }
    : event._tag === 'CommandStarted' || event._tag === 'CommandFinished'
      ? { ...event, args: { omitted: 'too long for one line' } }
      : event

const lineOf = (event: TelemetryEvent, maximum: number): string => {
  const whole = encodeLine(event)
  return whole.length <= maximum ? whole : encodeLine(withoutPayload(event))
}

/**
 * A sink that hands each event to `write` at once, as one line of the
 * same NDJSON the file and browser sinks write. It is for a host with
 * nowhere of its own to keep telemetry, such as a phone: a development
 * build writes the lines to its console, where the machine that serves it
 * reads them. An event whose line would be longer than `maximumLineBytes`
 * is written without its payload, so one long row never hides the rest.
 * A writer that throws is ignored: recording never stops the Program.
 *
 * @example
 * ```typescript
 * Telemetry.attach(handle, {
 *   app: 'books',
 *   sink: Telemetry.lineSink(line => console.log(line)),
 * })
 * ```
 */
export const lineSink = (
  write: (line: string) => void,
  options: LineSinkOptions = {},
): TelemetrySinkLayer => {
  const maximum = options.maximumLineBytes ?? defaultMaximumLineCharacters
  return Layer.succeed(TelemetrySink, {
    offer: event => {
      try {
        write(lineOf(event, maximum))
      } catch {
        // NOTE: A sink never fails the Program it records.
      }
    },
    flush: Effect.void,
  })
}
