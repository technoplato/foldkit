import {
  Array,
  Cause,
  Effect,
  Layer,
  Option,
  Queue,
  Schema as S,
  Stream,
  pipe,
} from 'effect'
import * as TranscriptPlayer from 'transcript-player-core-example'

import type { ProgramLogDatabase } from '@foldkit/instant/browser'

import { type MediaId, Milliseconds } from './ids.js'

// TRANSCRIPT

const longestSegmentMs = 10 * 60 * 1000

const segmentsLimit = 40

const SegmentWord = S.Struct({
  id: S.optionalKey(S.String),
  text: S.String,
  relativeStartMs: S.Number,
  relativeEndMs: S.Number,
})

const SegmentRow = S.Struct({
  id: S.String,
  relativeStartMs: S.Number,
  relativeEndMs: S.Number,
  wordsJSON: S.String,
})

const SegmentData = S.Struct({
  librarySegments: S.optionalKey(S.Array(S.Unknown)),
})

/**
 * The one bounded query for the words in a range of a rendition: the
 * segments that start up to 10 minutes before it, the longest a segment
 * runs, through its end, in order. The two bounds sit in `and`, because
 * Instant applies only the first comparison when two share one object.
 *
 * @example
 * ```typescript
 * segmentsQueryOf(mediaId, { fromMs: 900000, toMs: 2100000 })
 * ```
 */
export const segmentsQueryOf = (
  mediaId: MediaId,
  range: TranscriptPlayer.TranscriptRange,
) => ({
  librarySegments: {
    $: {
      where: {
        'rendition.id': mediaId,
        and: [
          {
            relativeStartMs: {
              $gte: Math.max(0, range.fromMs - longestSegmentMs),
            },
          },
          { relativeStartMs: { $lt: range.toMs } },
        ],
      },
      order: { relativeStartMs: 'asc' as const },
      limit: segmentsLimit,
    },
  },
})

const millisecondsOf = (value: number): Milliseconds =>
  Milliseconds.make(Math.max(0, Math.round(value)))

const wordsOf = (
  segment: typeof SegmentRow.Type,
): ReadonlyArray<TranscriptPlayer.Word> => {
  const parsed: unknown = Option.getOrElse(
    Option.liftThrowable((json: string): unknown => JSON.parse(json))(
      segment.wordsJSON,
    ),
    () => [],
  )
  return pipe(
    Array.isArray(parsed) ? parsed : [],
    Array.map(row => S.decodeUnknownOption(SegmentWord)(row)),
    Array.getSomes,
    Array.filter(word => word.text.trim() !== ''),
    Array.map((word, index) => ({
      wordId: TranscriptPlayer.WordId.make(
        word.id ?? `${segment.id}.${index.toString()}`,
      ),
      text: word.text.trim(),
      startMs: millisecondsOf(word.relativeStartMs),
      endMs: millisecondsOf(word.relativeEndMs),
    })),
  )
}

/**
 * The passages one segments query gives, in order, with a segment's words
 * read from its JSON. A row or word that does not decode is left out.
 */
export const decodeSegments = (
  data: unknown,
): ReadonlyArray<TranscriptPlayer.Passage> => {
  const rows = Option.match(S.decodeUnknownOption(SegmentData)(data), {
    onNone: () => [],
    onSome: tables => tables.librarySegments ?? [],
  })
  return pipe(
    rows,
    Array.map(row => S.decodeUnknownOption(SegmentRow)(row)),
    Array.getSomes,
    Array.map(segment => ({
      passageId: segment.id,
      startMs: millisecondsOf(segment.relativeStartMs),
      endMs: millisecondsOf(segment.relativeEndMs),
      words: wordsOf(segment),
    })),
  )
}

/**
 * The Transcript Player's words from Instant: a rendition's word-timed
 * `librarySegments` around the place, live, so a transcript that lands
 * while someone listens shows at once.
 */
export const instantTranscriptSource = (
  database: ProgramLogDatabase,
): Layer.Layer<TranscriptPlayer.TranscriptSource> =>
  Layer.succeed(TranscriptPlayer.TranscriptSource, {
    passagesIn: (mediaId, range) =>
      Stream.callback<
        ReadonlyArray<TranscriptPlayer.Passage>,
        TranscriptPlayer.TranscriptSourceError
      >(queue =>
        Effect.acquireRelease(
          Effect.sync(() =>
            database.subscribeQuery(
              segmentsQueryOf(mediaId, range),
              (response: Readonly<{ error?: unknown; data?: unknown }>) => {
                if (response.error !== undefined) {
                  Queue.failCauseUnsafe(
                    queue,
                    Cause.fail(
                      new TranscriptPlayer.TranscriptSourceError({
                        reason: 'the transcript could not be read',
                      }),
                    ),
                  )
                } else {
                  Queue.offerUnsafe(queue, decodeSegments(response.data))
                }
              },
            ),
          ),
          unsubscribe => Effect.sync(unsubscribe),
        ),
      ),
  })
