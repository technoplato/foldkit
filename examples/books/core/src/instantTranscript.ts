import {
  Array,
  Cause,
  Clock,
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

const searchPageSize = 40

/**
 * One page of a rendition's segments for a search: the next forty that
 * start after `afterMs`, in order. `librarySegments` holds each segment's
 * words as JSON in `wordsJSON` and no text Instant can search, so a
 * search reads the rendition through, a page at a time.
 *
 * @example
 * ```typescript
 * segmentsPageQueryOf(mediaId, -1) // the first forty segments
 * ```
 */
export const segmentsPageQueryOf = (mediaId: MediaId, afterMs: number) => ({
  librarySegments: {
    $: {
      where: {
        'rendition.id': mediaId,
        relativeStartMs: { $gt: afterMs },
      },
      order: { relativeStartMs: 'asc' as const },
      limit: searchPageSize,
    },
  },
})

const SegmentStart = S.Struct({ relativeStartMs: S.Number })

type SegmentsPage = Readonly<{
  passages: ReadonlyArray<TranscriptPlayer.Passage>
  rowCount: number
  maybeLastStartMs: Option.Option<number>
}>

const segmentsPageOf = (data: unknown): SegmentsPage => {
  const rows = Option.match(S.decodeUnknownOption(SegmentData)(data), {
    onNone: () => [],
    onSome: tables => tables.librarySegments ?? [],
  })
  return {
    passages: decodeSegments(data),
    rowCount: rows.length,
    maybeLastStartMs: Option.map(
      Option.flatMap(Array.last(rows), S.decodeUnknownOption(SegmentStart)),
      row => row.relativeStartMs,
    ),
  }
}

const unreadable = new TranscriptPlayer.TranscriptSourceError({
  reason: 'the transcript could not be read',
})

const beforeFirstSegmentMs = -1

const everySegmentAfter = (
  database: ProgramLogDatabase,
  mediaId: MediaId,
  afterMs: number,
  read: ReadonlyArray<TranscriptPlayer.Passage>,
): Effect.Effect<
  ReadonlyArray<TranscriptPlayer.Passage>,
  TranscriptPlayer.TranscriptSourceError
> =>
  Effect.flatMap(
    Effect.tryPromise({
      try: () => database.queryOnce(segmentsPageQueryOf(mediaId, afterMs)),
      catch: () => unreadable,
    }),
    response => {
      const page = segmentsPageOf(response.data)
      const passages = [...read, ...page.passages]
      return Option.match(
        Option.filter(
          page.maybeLastStartMs,
          () => page.rowCount >= searchPageSize,
        ),
        {
          onNone: () => Effect.succeed(passages),
          onSome: lastStartMs =>
            everySegmentAfter(database, mediaId, lastStartMs, passages),
        },
      )
    },
  )

const keepSearchedWordsMs = 10 * 60 * 1000

type SearchedWords = Readonly<{
  mediaId: MediaId
  passages: ReadonlyArray<TranscriptPlayer.Passage>
  readAtMs: number
}>

/**
 * The Transcript Player's words from Instant: a rendition's word-timed
 * `librarySegments` around the place, live, so a transcript that lands
 * while someone listens shows at once. For a search it reads the whole
 * rendition, forty segments a request, only when a person searches, and
 * keeps those words ten minutes so the next search of the same title
 * asks Instant nothing.
 */
export const instantTranscriptSource = (
  database: ProgramLogDatabase,
): Layer.Layer<TranscriptPlayer.TranscriptSource> => {
  const searched: { maybeWords: Option.Option<SearchedWords> } = {
    maybeWords: Option.none(),
  }
  const keptFor = (
    mediaId: MediaId,
    nowMs: number,
  ): Option.Option<SearchedWords> =>
    Option.filter(
      searched.maybeWords,
      words =>
        words.mediaId === mediaId &&
        nowMs - words.readAtMs < keepSearchedWordsMs,
    )
  return Layer.succeed(TranscriptPlayer.TranscriptSource, {
    passagesMatching: mediaId =>
      Effect.gen(function* () {
        const nowMs = yield* Clock.currentTimeMillis
        const maybeKept = keptFor(mediaId, nowMs)
        if (Option.isSome(maybeKept)) {
          return maybeKept.value.passages
        }
        const passages = yield* everySegmentAfter(
          database,
          mediaId,
          beforeFirstSegmentMs,
          [],
        )
        searched.maybeWords = Option.some({
          mediaId,
          passages,
          readAtMs: nowMs,
        })
        return passages
      }),
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
}
