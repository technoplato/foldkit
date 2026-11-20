import { Array, Option } from 'effect'
import { transcriptPlaceAt } from 'foldkit/renderers'

import type { ReadyPlayback } from './model.js'
import type { ReadAlongPlayback } from './readAlong.js'
import {
  displayedPositionOf,
  durationOf,
  isFollowingLiveEdgeOf,
} from './update.js'

const MILLISECONDS_PER_SECOND = 1000

/**
 * How often the audio reports its place while it plays. The page does not
 * need it more often: between reports the edge reads on from the clock.
 */
export const positionReportIntervalMs = 1000

/**
 * What the scrubber and the time beside it read on from between reports
 * of the place: the place in seconds, how fast it moves (`1` while
 * playing, `0` while paused or while the listener drags the scrubber),
 * and the recording's length.
 */
export type PlaybackClock = Readonly<{
  placeSeconds: number
  rate: number
  durationSeconds: number
}>

const isMoving = (ready: ReadyPlayback): boolean =>
  ready.transport === 'Playing' && ready.scrub._tag === 'NotScrubbing'

/**
 * The clock of an open recording's scrubber, from the Model alone.
 *
 * @example
 * ```typescript
 * playbackClockOf(ready) // { placeSeconds: 12, rate: 1, durationSeconds: 60 }
 * ```
 */
export const playbackClockOf = (ready: ReadyPlayback): PlaybackClock => ({
  placeSeconds: displayedPositionOf(ready),
  rate: isMoving(ready) ? 1 : 0,
  durationSeconds: durationOf(ready),
})

/**
 * When the newest thing a recording says starts: the last word of its
 * last section, or that section's own start when it has no words, as a
 * sealed line or one with text and no word times has none. Every painter
 * takes such a section for one spoken unit.
 *
 * @example
 * ```typescript
 * newestSpokenSecondsOf(ready) // Some(92.2), the start of 'lamp.'
 * newestSpokenSecondsOf(endingSealed) // Some(100), the sealed line's start
 * ```
 */
export const newestSpokenSecondsOf = (
  ready: ReadyPlayback,
): Option.Option<number> =>
  Option.map(Array.last(ready.detail.sections), section =>
    Option.match(Array.last(section.words), {
      onNone: () => section.startSeconds,
      onSome: word => word.startSeconds,
    }),
  )

const standingAt = (positionSeconds: number): ReadAlongPlayback => ({
  positionSeconds,
  isPlaying: false,
  reportedAtMs: 0,
  rate: 1,
})

/**
 * Where the reader's clock stands for an open recording, from the Model
 * alone. Every painter marks the word this clock has reached and keeps it
 * in the middle while the words follow the voice.
 *
 * - While a recording in progress is followed at its live edge, no word
 *   sounds, so the clock stands at the newest word and moves on as words
 *   arrive: the newest word is the one followed, or the newest section
 *   itself when it has no words.
 * - Otherwise it is at the place the player last reported, and runs from
 *   the wall-clock time of that report while audio plays. After a jump,
 *   and until the player reports from the new place, it stands still.
 *
 * @example
 * ```typescript
 * readAlongPlaybackOf(playing) // { positionSeconds: 12, isPlaying: true, reportedAtMs: 1795200000000, rate: 1 }
 * readAlongPlaybackOf(recording) // { positionSeconds: 92.2, isPlaying: false, reportedAtMs: 0, rate: 1 }
 * ```
 */
export const readAlongPlaybackOf = (ready: ReadyPlayback): ReadAlongPlayback =>
  isFollowingLiveEdgeOf(ready)
    ? standingAt(
        Option.getOrElse(newestSpokenSecondsOf(ready), () =>
          displayedPositionOf(ready),
        ),
      )
    : Option.match(
        Option.filter(ready.maybePositionReportedAtMs, () => isMoving(ready)),
        {
          onNone: () => standingAt(displayedPositionOf(ready)),
          onSome: reportedAtMs => ({
            positionSeconds: displayedPositionOf(ready),
            isPlaying: true,
            reportedAtMs,
            rate: 1,
          }),
        },
      )

/**
 * The place a clock has reached at `nowMs`, when it was told its place at
 * `anchoredAtMs`: the place plus the time since, at the clock's rate. It
 * never reads more than a second and a half past a report, the library's
 * own limit, nor past the end.
 *
 * @example
 * ```typescript
 * clockPlaceAt(clock, 1_000, 1_450) // 12.45, for a clock told 12 seconds and running
 * ```
 */
export const clockPlaceAt = (
  clock: PlaybackClock,
  anchoredAtMs: number,
  nowMs: number,
): number => {
  const placeSeconds =
    transcriptPlaceAt(
      {
        placeMs: clock.placeSeconds * MILLISECONDS_PER_SECOND,
        atMs: anchoredAtMs,
        rate: clock.rate,
      },
      nowMs,
    ) / MILLISECONDS_PER_SECOND
  return clock.durationSeconds > 0
    ? Math.min(clock.durationSeconds, placeSeconds)
    : placeSeconds
}

/** How far along the scrubber a place is, from 0 to 1. */
export const progressFractionOf = (
  placeSeconds: number,
  durationSeconds: number,
): number =>
  durationSeconds > 0
    ? Math.min(1, Math.max(0, placeSeconds / durationSeconds))
    : 0
