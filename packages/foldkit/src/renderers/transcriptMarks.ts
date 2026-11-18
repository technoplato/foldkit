import { Array, Option, Order, pipe } from 'effect'

import type { TranscriptMark, TranscriptPassage, UiNode } from './types.js'

// MARKS

/** A mark and the word of a passage it sits on, by the word's token. */
export type PlacedMark = Readonly<{ token: string; mark: TranscriptMark }>

/**
 * The marks that fall in a passage, each with the word it sits on: the
 * word that starts on the mark's millisecond. They come in the words'
 * order. A mark elsewhere, or a passage whose words carry no times, gives
 * none.
 *
 * @example
 * ```typescript
 * marksInPassage(passage, [{ startMs: 1_231_200, label: 'Bookmark at 20:31' }])
 * // [{ token: 'w3', mark: { startMs: 1_231_200, label: 'Bookmark at 20:31' } }]
 * ```
 */
export const marksInPassage = (
  passage: TranscriptPassage,
  marks: ReadonlyArray<TranscriptMark>,
): ReadonlyArray<PlacedMark> =>
  pipe(
    marks,
    Array.map(mark =>
      Option.map(
        Array.findFirst(passage.words, word => word.startMs === mark.startMs),
        word => ({ token: word.token, mark }),
      ),
    ),
    Array.getSomes,
    Array.sort(
      Order.mapInput(Order.Number, (placed: PlacedMark) => placed.mark.startMs),
    ),
  )

/**
 * A Transcript with a person's marks on it, such as their bookmarks. Any
 * other node comes back as it is, so a screen can mark whatever its player
 * gives it.
 *
 * @example
 * ```typescript
 * withTranscriptMarks(TranscriptPlayer.transcriptOf(player), [{ startMs: 723_450, label: 'Bookmark at 12:03' }])
 * ```
 */
export const withTranscriptMarks = (
  node: UiNode,
  marks: ReadonlyArray<TranscriptMark>,
): UiNode =>
  node._tag === 'Transcript' && Array.isReadonlyArrayNonEmpty(marks)
    ? { ...node, marks }
    : node
