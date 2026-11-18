import {
  Cause,
  Effect,
  Layer,
  Option,
  Queue,
  Schema as S,
  Stream,
} from 'effect'

import type { Readings } from './model.js'
import {
  ReadingSource,
  ReadingSourceError,
  ReadingsFailureJson,
  ReadingsJson,
  readingsEndpointPath,
  readingsEventName,
  readingsFailedEventName,
} from './reading.js'

// READING

const decodeReadings = S.decodeUnknownOption(ReadingsJson)

const decodeFailure = S.decodeUnknownOption(ReadingsFailureJson)

const unreachable =
  'the read-aloud endpoint is not reachable; run the page through its Vite server on this laptop'

/**
 * A reading source over the dev endpoint, `/__read-aloud/readings`: the
 * readings now, and again whenever Scribe writes. The browser reconnects
 * by itself after a dropped connection; the source fails only when the
 * endpoint refuses, or says why it stopped.
 *
 * @example
 * ```typescript
 * Layer.mergeAll(endpointReadingSource(), scriptPreviewSource)
 * ```
 */
export const endpointReadingSource = (
  path: string = readingsEndpointPath,
): Layer.Layer<ReadingSource> =>
  Layer.succeed(ReadingSource, {
    readings: Stream.callback<Readings, ReadingSourceError>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const source = new EventSource(path)
          const fail = (reason: string): void => {
            source.close()
            Queue.failCauseUnsafe(
              queue,
              Cause.fail(new ReadingSourceError({ reason })),
            )
          }
          source.addEventListener(readingsEventName, event => {
            const maybeReadings = decodeReadings(event.data)
            if (Option.isSome(maybeReadings)) {
              Queue.offerUnsafe(queue, maybeReadings.value)
            }
          })
          source.addEventListener(readingsFailedEventName, event => {
            fail(
              Option.match(decodeFailure(event.data), {
                onNone: () => 'the read-aloud endpoint stopped',
                onSome: failure => failure.reason,
              }),
            )
          })
          source.addEventListener('error', () => {
            if (source.readyState === EventSource.CLOSED) {
              fail(unreachable)
            }
          })
          return source
        }),
        source => Effect.sync(() => source.close()),
      ),
    ),
  })
