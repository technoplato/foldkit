import { Array, Option, Order, Schema as S, pipe } from 'effect'

import { segmentIDOf } from '../ids.js'
import {
  type CapturedWord,
  type OpenSegment,
  PendingCounts,
  PendingSegmentWrite,
  type TranscriptProgress,
  type TranscriptResult,
} from './model.js'

/**
 * One write of a transcript section, in the shape the iPhone writes: the
 * first write of a section links it to its recording, later interim writes
 * revise it in place, and the final write settles it.
 */
export const SegmentWrite = PendingSegmentWrite
/** One write of a transcript section. */
export type SegmentWrite = typeof SegmentWrite.Type

/**
 * The totals a final write stamps on the transcription row. The iPhone shows
 * a transcript only once it can read `segmentCount` sections, so these count
 * only final sections.
 */
export const TranscriptCounts = PendingCounts
/** The totals a final write stamps on the transcription row. */
export type TranscriptCounts = typeof TranscriptCounts.Type

/** A transcript's progress and the section writes one step produced. */
export type SegmentStep = Readonly<{
  progress: TranscriptProgress
  writes: ReadonlyArray<SegmentWrite>
}>

const speakersOf = (
  words: ReadonlyArray<CapturedWord>,
): ReadonlyArray<number> =>
  Array.getSomes(Array.map(words, word => word.maybeSpeaker))

const openSegmentFor = (
  recordingID: string,
  progress: TranscriptProgress,
): OpenSegment =>
  Option.getOrElse(progress.maybeOpenSegment, () => ({
    index: progress.nextSegmentIndex,
    id: segmentIDOf(recordingID, progress.nextSegmentIndex),
    words: [],
    isWritten: false,
  }))

const settle = (
  progress: TranscriptProgress,
  open: OpenSegment,
  words: ReadonlyArray<CapturedWord>,
): SegmentStep => ({
  progress: {
    nextSegmentIndex: open.index + 1,
    maybeOpenSegment: Option.none(),
    finalSegmentCount: progress.finalSegmentCount + 1,
    finalWordCount: progress.finalWordCount + Array.length(words),
    speakerIDs: pipe(
      [...progress.speakerIDs, ...speakersOf(words)],
      Array.dedupe,
      Array.sort(Order.Number),
    ),
  },
  writes: [
    {
      id: open.id,
      index: open.index,
      words,
      isFinal: true,
      isFirstWrite: !open.isWritten,
    },
  ],
})

/**
 * Folds one live transcriber result into the transcript, like the iPhone:
 * interim results revise the open section, a final result settles it under
 * the same id, and the next words open a new section. A final result with no
 * words settles the open section with the words already shown.
 *
 * @example
 * ```ts
 * applyTranscriptResult(recordingID, emptyProgress(), { isFinal: false, words: [hello] })
 * // one write: section 0, not final, first write (links the recording)
 * ```
 */
export const applyTranscriptResult = (
  recordingID: string,
  progress: TranscriptProgress,
  result: TranscriptResult,
): SegmentStep => {
  const open = openSegmentFor(recordingID, progress)
  if (result.isFinal) {
    const words = Array.match(result.words, {
      onEmpty: () => open.words,
      onNonEmpty: nonEmptyWords => nonEmptyWords,
    })
    return Array.match(words, {
      onEmpty: () => ({
        progress: { ...progress, maybeOpenSegment: Option.none() },
        writes: [],
      }),
      onNonEmpty: nonEmptyWords => settle(progress, open, nonEmptyWords),
    })
  } else {
    return Array.match(result.words, {
      onEmpty: () => ({ progress, writes: [] }),
      onNonEmpty: words => ({
        progress: {
          ...progress,
          maybeOpenSegment: Option.some({ ...open, words, isWritten: true }),
        },
        writes: [
          {
            id: open.id,
            index: open.index,
            words,
            isFinal: false,
            isFirstWrite: !open.isWritten,
          },
        ],
      }),
    })
  }
}

/** Settles the open section when the recording stops, so no section stays interim. */
export const settleOpenSegment = (
  recordingID: string,
  progress: TranscriptProgress,
): SegmentStep =>
  applyTranscriptResult(recordingID, progress, { isFinal: true, words: [] })

/** The transcription row's totals after a step. */
export const countsOf = (progress: TranscriptProgress): TranscriptCounts => ({
  segmentCount: progress.finalSegmentCount,
  wordCount: progress.finalWordCount,
  speakerIDs: progress.speakerIDs,
})

/** The recording list's two preview slots; the two latest final sections fill them. */
export const PreviewSlot = S.Literals(['A', 'B'])
/** The recording list's two preview slots. */
export type PreviewSlot = typeof PreviewSlot.Type

/** Which recording preview slot a final section fills: even sections A, odd sections B. */
export const previewSlotOf = (segmentIndex: number): PreviewSlot =>
  segmentIndex % 2 === 0 ? 'A' : 'B'

/**
 * The words JSON the iPhone stores on a section: sorted keys `end`, `start`,
 * `text`, and nothing else.
 *
 * @example
 * ```ts
 * wordsJSONOf([{ text: 'so', startSeconds: 12.48, endSeconds: 12.8, maybeSpeaker: Option.none() }])
 * // '[{"end":12.8,"start":12.48,"text":"so"}]'
 * ```
 */
export const wordsJSONOf = (words: ReadonlyArray<CapturedWord>): string =>
  JSON.stringify(
    Array.map(words, word => ({
      end: word.endSeconds,
      start: word.startSeconds,
      text: word.text,
    })),
  )
