import { Array, Option } from 'effect'

import type {
  TranscriptItem,
  TranscriptNode,
  TranscriptPassage,
} from './types.js'

/**
 * One thing on a Transcript's timeline, in the order it is read: a
 * passage of words, or an item that sits between passages.
 */
export type TranscriptEntry =
  | Readonly<{ _tag: 'PassageEntry'; passage: TranscriptPassage }>
  | Readonly<{ _tag: 'ItemEntry'; item: TranscriptItem }>

const itemEntry = (item: TranscriptItem): TranscriptEntry => ({
  _tag: 'ItemEntry',
  item,
})

/**
 * A Transcript's timeline in order, for every painter: each passage, with
 * the items that name it before it, in the order the Transcript holds
 * them, and after the last passage the items that name no passage, or one
 * that is not there. A Transcript with no items is its passages.
 *
 * @example
 * ```typescript
 * transcriptEntriesOf(transcript)
 * // [PassageEntry s1, ItemEntry copied at 0:03, PassageEntry s2, ItemEntry picture at 0:14]
 * ```
 */
export const transcriptEntriesOf = (
  transcript: TranscriptNode,
): ReadonlyArray<TranscriptEntry> => {
  const items = transcript.items ?? []
  const keys = new Set(Array.map(transcript.passages, passage => passage.key))
  const isPlaced = (item: TranscriptItem): boolean =>
    Option.exists(Option.fromNullishOr(item.beforePassage), key =>
      keys.has(key),
    )
  return [
    ...Array.flatMap(transcript.passages, passage => [
      ...Array.map(
        Array.filter(items, item => item.beforePassage === passage.key),
        itemEntry,
      ),
      { _tag: 'PassageEntry' as const, passage },
    ]),
    ...Array.map(
      Array.filter(items, item => !isPlaced(item)),
      itemEntry,
    ),
  ]
}
