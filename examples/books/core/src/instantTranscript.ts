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

const longestSearchPartMs = 2.5 * 60 * 60 * 1000

const mostSearchParts = 8

/**
 * How many parts a recording's words are read in for a search: one for
 * each two and a half hours, eight at most, so a sixteen-hour title comes
 * down as seven requests made at once.
 *
 * @example
 * ```typescript
 * searchPartsOf(Milliseconds.make(16 * 3_600_000)) // 7
 * ```
 */
export const searchPartsOf = (durationMs: Milliseconds): number =>
  Math.min(
    mostSearchParts,
    Math.max(1, Math.ceil(durationMs / longestSearchPartMs)),
  )

/**
 * One part of a rendition's segments for a search: those that start in
 * the part's stretch of time, in order; the last part has no end, so
 * nothing past the stated length is missed. `librarySegments` holds each
 * segment's words as JSON in `wordsJSON` and no text Instant can search,
 * so a search reads the rendition through. The bounds sit in `and`,
 * because Instant applies only the first comparison when two share one
 * object.
 *
 * @example
 * ```typescript
 * segmentsPartQueryOf(mediaId, Milliseconds.make(16 * 3_600_000), 0) // the first of seven parts
 * ```
 */
export const segmentsPartQueryOf = (
  mediaId: MediaId,
  durationMs: Milliseconds,
  part: number,
) => {
  const partsTotal = searchPartsOf(durationMs)
  const partMs = Math.ceil(durationMs / partsTotal)
  return {
    librarySegments: {
      $: {
        where: {
          'rendition.id': mediaId,
          and: [
            { relativeStartMs: { $gte: part * partMs } },
            ...(part === partsTotal - 1
              ? []
              : [{ relativeStartMs: { $lt: (part + 1) * partMs } }]),
          ],
        },
        order: { relativeStartMs: 'asc' as const },
      },
    },
  }
}

const unreadable = new TranscriptPlayer.TranscriptSourceError({
  reason: 'the transcript could not be read',
})

const keepSearchedWordsMs = 10 * 60 * 1000

// NOTE: The words one search session holds: the parts of one rendition
// that have landed. It is this source's own cache, changed in place as
// requests land, and never part of a Model.
type SearchedWords = {
  readonly mediaId: MediaId
  readonly partsTotal: number
  readonly parts: Map<number, ReadonlyArray<TranscriptPlayer.Passage>>
  listeners: number
  leftAtMs: number
}

const readingOf = (words: SearchedWords): TranscriptPlayer.SearchReading => ({
  partsRead: words.parts.size,
  partsTotal: words.partsTotal,
})

const passagesHeld = (
  words: SearchedWords,
): ReadonlyArray<TranscriptPlayer.Passage> =>
  pipe(
    Array.range(0, words.partsTotal - 1),
    Array.flatMap(part => words.parts.get(part) ?? []),
  )

/** What {@link instantTranscriptSource} may be given: the time, for a test. */
export type InstantTranscriptOptions = Readonly<{ now?: () => number }>

/**
 * The Transcript Player's words from Instant: a rendition's word-timed
 * `librarySegments` around the place, live, so a transcript that lands
 * while someone listens shows at once. For a search it reads the whole
 * rendition in parts by time, all asked for at once, says how many are
 * in as each lands, and holds them: while a search is open, and ten
 * minutes after, so the next search of the same title asks Instant
 * nothing. Parts that landed before a search closed are kept, and only
 * the rest are asked for again.
 */
export const instantTranscriptSource = (
  database: ProgramLogDatabase,
  options: InstantTranscriptOptions = {},
): Layer.Layer<TranscriptPlayer.TranscriptSource> => {
  const now = options.now ?? Date.now
  const searched: { maybeWords: Option.Option<SearchedWords> } = {
    maybeWords: Option.none(),
  }
  const heldFor = (mediaId: MediaId): Option.Option<SearchedWords> =>
    Option.filter(
      searched.maybeWords,
      words =>
        words.mediaId === mediaId &&
        (words.listeners > 0 || now() - words.leftAtMs < keepSearchedWordsMs),
    )
  const wordsFor = (
    mediaId: MediaId,
    durationMs: Milliseconds,
  ): SearchedWords => {
    const partsTotal = searchPartsOf(durationMs)
    const words = Option.getOrElse(
      Option.filter(heldFor(mediaId), held => held.partsTotal === partsTotal),
      (): SearchedWords => ({
        mediaId,
        partsTotal,
        parts: new Map(),
        listeners: 0,
        leftAtMs: now(),
      }),
    )
    searched.maybeWords = Option.some(words)
    return words
  }
  return Layer.succeed(TranscriptPlayer.TranscriptSource, {
    passagesMatching: mediaId =>
      Effect.sync(() =>
        Option.match(heldFor(mediaId), {
          onNone: () => ({ passages: [], partsRead: 0, partsTotal: 0 }),
          onSome: words => ({
            passages: passagesHeld(words),
            ...readingOf(words),
          }),
        }),
      ),
    searchWordsOf: (mediaId, durationMs) =>
      Stream.callback<
        TranscriptPlayer.SearchReading,
        TranscriptPlayer.TranscriptSourceError
      >(queue =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const words = wordsFor(mediaId, durationMs)
            const listening = { isOpen: true }
            words.listeners += 1
            Queue.offerUnsafe(queue, readingOf(words))
            Array.forEach(Array.range(0, words.partsTotal - 1), part => {
              if (!words.parts.has(part)) {
                database
                  .queryOnce(segmentsPartQueryOf(mediaId, durationMs, part))
                  .then(response => {
                    words.parts.set(part, decodeSegments(response.data))
                    if (listening.isOpen) {
                      Queue.offerUnsafe(queue, readingOf(words))
                    }
                  })
                  .catch(() => {
                    if (listening.isOpen) {
                      Queue.failCauseUnsafe(queue, Cause.fail(unreadable))
                    }
                  })
              }
            })
            return { words, listening }
          }),
          ({ words, listening }) =>
            Effect.sync(() => {
              listening.isOpen = false
              words.listeners -= 1
              words.leftAtMs = now()
            }),
        ),
      ),
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
