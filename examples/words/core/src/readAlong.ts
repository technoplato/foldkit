import { Array } from 'effect'
import type { TranscriptNode, TranscriptPassage } from 'foldkit/renderers'

import type { Section } from './recording.js'
import { formatClock } from './transcript.js'

const MILLISECONDS_PER_SECOND = 1000

/**
 * Where a recording's playback stands, as its player last reported it:
 * the place in seconds, whether it is playing, the wall-clock time of the
 * report in milliseconds, and the speed, `1` at normal speed.
 */
export type ReadAlongPlayback = Readonly<{
  positionSeconds: number
  isPlaying: boolean
  reportedAtMs: number
  rate: number
}>

const millisecondsOf = (seconds: number): number =>
  Math.round(seconds * MILLISECONDS_PER_SECOND)

const passageOf = (section: Section): TranscriptPassage => ({
  key: section.id,
  label: formatClock(section.startSeconds),
  words: Array.map(section.words, word => ({
    token: word.id,
    text: word.text,
    startMs: millisecondsOf(word.startSeconds),
  })),
})

/**
 * A recording as the Transcript every Client of the library reads along
 * with: a passage for each section, labelled with its time, each word
 * with its id as the token and its start, and a clock from the playback,
 * so `transcriptAt` marks the word being spoken between reports of the
 * place, and the shared readings search it, step through it, link to a
 * word and print it for a terminal. A sealed section keeps its place and
 * has no words, as it has none here.
 *
 * @example
 * ```typescript
 * transcriptAt(readAlongOf(detail.sections, playback), Date.now())
 * ```
 */
export const readAlongOf = (
  sections: ReadonlyArray<Section>,
  playback: ReadAlongPlayback,
): TranscriptNode => ({
  _tag: 'Transcript',
  label: 'Transcript',
  action: 'ClickedWord',
  emptyText: 'This recording has no transcript.',
  passages: Array.map(sections, passageOf),
  clock: {
    placeMs: millisecondsOf(playback.positionSeconds),
    atMs: playback.reportedAtMs,
    rate: playback.isPlaying ? playback.rate : 0,
  },
})
