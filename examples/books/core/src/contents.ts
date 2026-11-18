import { Array } from 'effect'

import { Milliseconds, clockOf } from './ids.js'
import { type Chapter, chapterAt } from './model.js'

// CONTENTS

const millisecondsPerMinute = 60_000

const minutesPerHour = 60

/**
 * How far through one chapter a place is: what is heard of it, what is
 * left of it, and how long it runs.
 */
export type ChapterReading = Readonly<{
  heardMs: Milliseconds
  leftMs: Milliseconds
  lengthMs: Milliseconds
}>

/**
 * How far through `chapter` the place `place` is. A place before the
 * chapter reads as its start and one after it as its end, so the answer
 * is never negative.
 *
 * @example
 * ```typescript
 * chapterReadingAt(theLight, Milliseconds.make(1_680_000))
 * // { heardMs: 480_000, leftMs: 720_000, lengthMs: 1_200_000 }
 * ```
 */
export const chapterReadingAt = (
  chapter: Chapter,
  place: Milliseconds,
): ChapterReading => {
  const lengthMs = Math.max(0, chapter.endMs - chapter.startMs)
  const heardMs = Math.min(lengthMs, Math.max(0, place - chapter.startMs))
  return {
    heardMs: Milliseconds.make(heardMs),
    leftMs: Milliseconds.make(lengthMs - heardMs),
    lengthMs: Milliseconds.make(lengthMs),
  }
}

/** What the columns of a chapter's row are, in order. */
export const chapterColumnNames: ReadonlyArray<string> = ['Starts', 'Length']

/**
 * A chapter's row in columns: when it starts and how long it runs, each
 * as a clock.
 *
 * @example
 * ```typescript
 * chapterColumnsOf(theLight) // ['20:00', '20:00']
 * ```
 */
export const chapterColumnsOf = (chapter: Chapter): ReadonlyArray<string> => [
  clockOf(chapter.startMs),
  clockOf(chapterReadingAt(chapter, chapter.startMs).lengthMs),
]

/**
 * What is left of the chapter being read, as its row says it:
 * `12:00 left in this chapter`.
 */
export const chapterLeftLineOf = (reading: ChapterReading): string =>
  `${clockOf(reading.leftMs)} left in this chapter`

/**
 * Where a place is among a title's chapters, in one line for the chapter
 * picker: which chapter of how many, and what is left of it.
 *
 * @example
 * ```typescript
 * chapterPlaceLineOf(chapters, Milliseconds.make(1_680_000)) // 'Chapter 2 of 4 · 12:00 left in it'
 * ```
 */
export const chapterPlaceLineOf = (
  chapters: Array.NonEmptyReadonlyArray<Chapter>,
  place: Milliseconds,
): string => {
  const chapter = chapterAt(chapters, place)
  const position =
    Array.filter(chapters, earlier => earlier.startMs < chapter.startMs)
      .length + 1
  return `Chapter ${position.toString()} of ${chapters.length.toString()} · ${clockOf(chapterReadingAt(chapter, place).leftMs)} left in it`
}

const runWordsOf = (ms: number): string => {
  const totalMinutes = Math.max(0, Math.round(ms / millisecondsPerMinute))
  const hours = Math.floor(totalMinutes / minutesPerHour)
  const minutes = totalMinutes % minutesPerHour
  if (hours > 0) {
    return `${hours.toString()}h ${minutes.toString()}m`
  } else {
    return `${minutes.toString()}m`
  }
}

/**
 * The line that heads a title's contents: how many chapters it has and
 * how long they run together.
 *
 * @example
 * ```typescript
 * contentsSummaryOf(chapters) // '134 chapters · 16h 22m'
 * ```
 */
export const contentsSummaryOf = (
  chapters: Array.NonEmptyReadonlyArray<Chapter>,
): string => {
  const runMs =
    Array.lastNonEmpty(chapters).endMs - Array.headNonEmpty(chapters).startMs
  const noun = chapters.length === 1 ? 'chapter' : 'chapters'
  return `${chapters.length.toString()} ${noun} · ${runWordsOf(runMs)}`
}
