import { Array, Context, Data, Layer, Stream } from 'effect'

import { type MediaId, Milliseconds } from './ids.js'
import type { Passage } from './model.js'

// TRANSCRIPT

/** The transcript could not be read, and why, safe to show. */
export class TranscriptSourceError extends Data.TaggedError(
  'TranscriptSourceError',
)<{
  readonly reason: string
}> {}

/**
 * How far around the place the player asks for words: the window it is
 * in, 10 minutes, and 5 minutes either side, so a seek nearby has its
 * words already.
 */
export const transcriptWindowMs = 10 * 60 * 1000

/** How much the player asks for before and after its window. */
export const transcriptMarginMs = 5 * 60 * 1000

/** The stretch of a recording one window of words covers. */
export type TranscriptRange = Readonly<{
  fromMs: Milliseconds
  toMs: Milliseconds
}>

/**
 * The stretch the player asks for while the place is in window `index`.
 *
 * @example
 * ```typescript
 * rangeOfWindow(2) // { fromMs: 900000, toMs: 2100000 }, 15:00 to 35:00
 * ```
 */
export const rangeOfWindow = (index: number): TranscriptRange => ({
  fromMs: Milliseconds.make(
    Math.max(0, index * transcriptWindowMs - transcriptMarginMs),
  ),
  toMs: Milliseconds.make(
    (index + 1) * transcriptWindowMs + transcriptMarginMs,
  ),
})

/** The window a place falls in. */
export const windowOf = (placeMs: Milliseconds): number =>
  Math.floor(placeMs / transcriptWindowMs)

/**
 * Where a recording's words come from: the passages that overlap a range,
 * sent again whenever they change, such as when a new transcript lands. A
 * recording with no transcript sends no passages.
 */
export class TranscriptSource extends Context.Service<
  TranscriptSource,
  Readonly<{
    passagesIn: (
      mediaId: MediaId,
      range: TranscriptRange,
    ) => Stream.Stream<ReadonlyArray<Passage>, TranscriptSourceError>
  }>
>()('transcript-player/TranscriptSource') {}

/**
 * A source holding whole transcripts in memory, by recording: what tests
 * and a page with its words in a file use.
 *
 * @example
 * ```typescript
 * transcriptsInMemory(new Map([[mediaId, passages]]))
 * ```
 */
export const transcriptsInMemory = (
  byMedia: ReadonlyMap<MediaId, ReadonlyArray<Passage>>,
): Layer.Layer<TranscriptSource> =>
  Layer.succeed(TranscriptSource, {
    passagesIn: (mediaId, range) =>
      Stream.make(
        Array.filter(
          byMedia.get(mediaId) ?? [],
          passage =>
            passage.endMs > range.fromMs && passage.startMs < range.toMs,
        ),
      ),
  })

/** A source with no transcripts at all. */
export const noTranscripts = transcriptsInMemory(new Map())
