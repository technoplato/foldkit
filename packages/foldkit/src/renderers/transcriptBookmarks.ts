import { Array, Option, Order, pipe } from 'effect'

import type { TranscriptBookmark, TranscriptPassage, UiNode } from './types.js'

// BOOKMARKS

/** A bookmark and the word of a passage it sits on, by the word's token. */
export type PlacedBookmark = Readonly<{
  token: string
  bookmark: TranscriptBookmark
}>

/**
 * The bookmarks that fall in a passage, each with the word it sits on:
 * the word that starts on the bookmark's millisecond. They come in the
 * words' order. A bookmark elsewhere, or a passage whose words carry no times, gives
 * none.
 *
 * @example
 * ```typescript
 * bookmarksInPassage(passage, [{ startMs: 1_231_200, label: 'Bookmark at 20:31' }])
 * // [{ token: 'w3', bookmark: { startMs: 1_231_200, label: 'Bookmark at 20:31' } }]
 * ```
 */
export const bookmarksInPassage = (
  passage: TranscriptPassage,
  bookmarks: ReadonlyArray<TranscriptBookmark>,
): ReadonlyArray<PlacedBookmark> =>
  pipe(
    bookmarks,
    Array.map(bookmark =>
      Option.map(
        Array.findFirst(
          passage.words,
          word => word.startMs === bookmark.startMs,
        ),
        word => ({ token: word.token, bookmark }),
      ),
    ),
    Array.getSomes,
    Array.sort(
      Order.mapInput(
        Order.Number,
        (placed: PlacedBookmark) => placed.bookmark.startMs,
      ),
    ),
  )

/**
 * A Transcript with a person's bookmarks on it. Any other node comes
 * back as it is, so a screen can put them on whatever its player gives
 * it.
 *
 * @example
 * ```typescript
 * withTranscriptBookmarks(TranscriptPlayer.transcriptOf(player), [{ startMs: 723_450, label: 'Bookmark at 12:03' }])
 * ```
 */
export const withTranscriptBookmarks = (
  node: UiNode,
  bookmarks: ReadonlyArray<TranscriptBookmark>,
): UiNode =>
  node._tag === 'Transcript' && Array.isReadonlyArrayNonEmpty(bookmarks)
    ? { ...node, bookmarks }
    : node
