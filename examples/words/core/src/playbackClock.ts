import { Option, pipe } from 'effect'
import { transcriptPlaceAt } from 'foldkit/renderers'

import type { ReadyPlayback } from './model.js'
import { lastIndexAtOrBefore } from './transcript.js'
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
 * What the edge reads on from between reports of the place: the place in
 * seconds, how fast it moves (`1` while playing, `0` while paused or while
 * the listener drags the scrubber), the recording's length, and whether a
 * word is marked at all, which it is not while the page follows the live
 * edge of a recording in progress. `keepsInView` says the page follows
 * the voice, so the spoken section is brought into view as the mark
 * crosses into it; it is false once the listener has scrolled away, and
 * at the live edge, where the Model keeps the newest line in view.
 */
export type PlaybackClock = Readonly<{
  placeSeconds: number
  rate: number
  durationSeconds: number
  isMarking: boolean
  keepsInView: boolean
}>

/**
 * The clock of an open recording, from the Model alone.
 *
 * @example
 * ```typescript
 * playbackClockOf(ready) // { placeSeconds: 12, rate: 1, durationSeconds: 60, isMarking: true, keepsInView: true }
 * ```
 */
export const playbackClockOf = (ready: ReadyPlayback): PlaybackClock => ({
  placeSeconds: displayedPositionOf(ready),
  rate:
    ready.transport === 'Playing' && ready.scrub._tag === 'NotScrubbing'
      ? 1
      : 0,
  durationSeconds: durationOf(ready),
  isMarking: !isFollowingLiveEdgeOf(ready),
  keepsInView: ready.follow === 'Following' && !isFollowingLiveEdgeOf(ready),
})

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

/** A section as the edge sees it: when it starts, and when each word does. */
export type SpokenSection = Readonly<{
  startSeconds: number
  wordStarts: ReadonlyArray<number>
}>

/**
 * The section and the word being spoken at a place, by their positions:
 * the last section to start at or before it, so a pause between sections
 * keeps the one before current, and the last word of that section to
 * start at or before it. Before the section's first word the section is
 * current and no word is marked; before the first section, nothing is.
 *
 * @example
 * ```typescript
 * spokenAt(sections, 12.9) // { maybeSection: Some(1), maybeWord: Some(1) }
 * ```
 */
export const spokenAt = (
  sections: ReadonlyArray<SpokenSection>,
  placeSeconds: number,
): Readonly<{
  maybeSection: Option.Option<number>
  maybeWord: Option.Option<number>
}> => {
  const maybeSection = lastIndexAtOrBefore(
    sections,
    placeSeconds,
    section => section.startSeconds,
  )
  return {
    maybeSection,
    maybeWord: pipe(
      maybeSection,
      Option.flatMap(index => Option.fromNullishOr(sections[index])),
      Option.flatMap(section =>
        lastIndexAtOrBefore(section.wordStarts, placeSeconds, start => start),
      ),
    ),
  }
}

const isSameSection = Option.makeEquivalence<number>(
  (self, that) => self === that,
)

/**
 * Whether the edge brings the spoken section into view now: the page
 * follows the voice, and the mark has just crossed into a section it was
 * not in. Not once the listener has scrolled away, and not when the mark
 * leaves every section.
 *
 * @example
 * ```typescript
 * bringsIntoView(clock, Option.some(1), Option.some(2)) // true while the page follows the voice
 * ```
 */
export const bringsIntoView = (
  clock: PlaybackClock,
  maybeFrom: Option.Option<number>,
  maybeTo: Option.Option<number>,
): boolean =>
  clock.keepsInView &&
  Option.isSome(maybeTo) &&
  !isSameSection(maybeFrom, maybeTo)
