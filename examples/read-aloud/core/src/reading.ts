import { Context, Data, Layer, Schema as S, Stream } from 'effect'

import { Readings } from './model.js'

// READING

/** The reading source could not be read, and why, safe to show. */
export class ReadingSourceError extends Data.TaggedError('ReadingSourceError')<{
  readonly reason: string
}> {}

/**
 * Where Read Aloud learns what is being read: the books read aloud and
 * every page Scribe heard the reader turn to, sent again whenever Scribe
 * records more. For now that is Scribe's own logs on this laptop,
 * `~/Scribe/things`, read in Node and served to a browser by the dev
 * endpoint; later it is Scribe's `things` and `recordingRecognitions` in
 * Instant, read by the owner only. Tests use one in memory.
 */
export class ReadingSource extends Context.Service<
  ReadingSource,
  Readonly<{
    readings: Stream.Stream<Readings, ReadingSourceError>
  }>
>()('read-aloud/ReadingSource') {}

/**
 * The readings as JSON text, the shape the dev endpoint sends and the page
 * reads back.
 *
 * @example
 * ```typescript
 * S.encodeSync(ReadingsJson)(readings) // '{"books":[...],"turns":[...]}'
 * ```
 */
export const ReadingsJson = S.fromJsonString(S.toCodecJson(Readings))

/**
 * Where the dev endpoint serves the readings as Server-Sent Events: one
 * `readings` event now, and another whenever Scribe's logs change.
 */
export const readingsEndpointPath = '/__read-aloud/readings'

/** The name of the event that carries the readings. */
export const readingsEventName = 'readings'

/** The name of the event that says the readings stopped, and why. */
export const readingsFailedEventName = 'failed'

/**
 * Why the endpoint stopped sending readings, as JSON text: `{"reason":"…"}`.
 */
export const ReadingsFailureJson = S.fromJsonString(
  S.Struct({ reason: S.String }),
)

/**
 * A source that sends `readings` once and stays as it is: what tests and a
 * page with its readings in a file use.
 *
 * @example
 * ```typescript
 * readingsInMemory({ books: [book], turns: [turn] })
 * ```
 */
export const readingsInMemory = (
  readings: Readings,
): Layer.Layer<ReadingSource> =>
  Layer.succeed(ReadingSource, { readings: Stream.make(readings) })

/** A source with no books read aloud: what tests of a holder use. */
export const noReadings = readingsInMemory({ books: [], turns: [] })
