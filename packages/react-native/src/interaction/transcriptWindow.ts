import { Array } from 'effect'

// WINDOW

/**
 * How much of a long chapter a reader lays out: the passages in sight and
 * a few screens either side, through the platform's own windowed list.
 * `windowSize` counts screens, the one in sight included.
 */
export const readerWindow = {
  initialNumToRender: 8,
  maxToRenderPerBatch: 8,
  windowSize: 7,
} as const

/** A passage or an item of a Transcript, as the window counts it. */
export type WindowEntry = Readonly<{ key: string; wordCount: number }>

/** A laid-out passage and where its top is in the screen's content now. */
export type WindowAnchor = Readonly<{ index: number; y: number }>

const defaultHeightPerWord = 5

const minimumEntryHeight = 40

/**
 * How tall a word makes a passage, on average, from the heights seen so
 * far; a usual figure before any has been.
 *
 * @example
 * ```typescript
 * heightPerWordOf(entries, new Map([['a', 350]])) // 5, for a passage of 70 words
 * ```
 */
export const heightPerWordOf = (
  entries: ReadonlyArray<WindowEntry>,
  heights: ReadonlyMap<string, number>,
): number => {
  const seen = Array.filter(
    entries,
    entry => heights.has(entry.key) && entry.wordCount > 0,
  )
  const words = Array.reduce(seen, 0, (sum, entry) => sum + entry.wordCount)
  const height = Array.reduce(
    seen,
    0,
    (sum, entry) => sum + (heights.get(entry.key) ?? 0),
  )
  return words === 0 || height === 0 ? defaultHeightPerWord : height / words
}

/**
 * Where the passage at `index` starts in the screen's content, about. A
 * windowed list lays out only the passages near the screen, and a
 * passage's place moves as others are laid out above it, so the place is
 * worked out from a passage that is laid out now, the `anchor`, by the
 * heights between: a height seen before, else a guess from the words.
 * With no passage laid out it is counted from the top of the words. A
 * jump to a passage far away, as a search or a bookmark makes, goes
 * there first; the passage is then laid out and placed exactly.
 *
 * @example
 * ```typescript
 * estimatedTopOf(entries, heights, { index: 12, y: 4100 }, 40, topOfWords) // 13950, about
 * ```
 */
export const estimatedTopOf = (
  entries: ReadonlyArray<WindowEntry>,
  heights: ReadonlyMap<string, number>,
  maybeAnchor: WindowAnchor | undefined,
  index: number,
  topOfWords: number,
): number => {
  if (index < 0 || index >= entries.length) {
    return topOfWords
  }
  const perWord = heightPerWordOf(entries, heights)
  const heightOf = (entry: WindowEntry): number =>
    heights.get(entry.key) ??
    (entry.wordCount === 0 ? minimumEntryHeight : entry.wordCount * perWord)
  const between = (from: number, to: number): number =>
    Array.reduce(
      Array.take(Array.drop(entries, from), Math.max(0, to - from)),
      0,
      (sum, entry) => sum + heightOf(entry),
    )
  if (maybeAnchor === undefined) {
    return topOfWords + between(0, index)
  } else if (maybeAnchor.index <= index) {
    return maybeAnchor.y + between(maybeAnchor.index, index)
  } else {
    return maybeAnchor.y - between(index, maybeAnchor.index)
  }
}
