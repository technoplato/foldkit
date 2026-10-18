import { Option, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

import { Milliseconds, Speed } from './ids.js'

// STRETCH

/**
 * One continuous play of a title on this device: where in the title it
 * began and when by the wall clock, at what speed, and the last second the
 * audio reached and when. Scribe's timeline shows each one as "Listened to
 * The Lantern Keeper, 12:03–13:32".
 */
export const Stretch = S.Struct({
  mediaStartMs: Milliseconds,
  startedAtMs: S.Number,
  speed: Speed,
  lastPlaceMs: Milliseconds,
  lastAtMs: S.Number,
})
/** One continuous play of a title on this device. */
export type Stretch = typeof Stretch.Type

/** The audio is not sounding. */
export const Quiet = ts('Quiet')
/** The audio has sounded for under 3 s: no stretch yet. */
export const Starting = ts('Starting', { stretch: Stretch })
/** The audio has sounded for 3 s or more: Scribe's timeline has its start. */
export const Begun = ts('Begun', { stretch: Stretch })
/** Where this device's play of the loaded title stands. */
export const StretchState = S.Union([Quiet, Starting, Begun])
/** Where this device's play of the loaded title stands. */
export type StretchState = typeof StretchState.Type

/**
 * Why a stretch ended: a pause, the end of the title, a seek or a jump in
 * the audio, another title, a new speed, the audio failing, or the page
 * closing while it played.
 */
export const StretchEndReason = S.Literals([
  'Paused',
  'Ended',
  'Seeked',
  'TitleChanged',
  'SpeedChanged',
  'Interrupted',
  'PageClosed',
])
/** Why a stretch ended. */
export type StretchEndReason = typeof StretchEndReason.Type

/** Where in the title a stretch ended, when, and why. */
export const StretchEnd = S.Struct({
  mediaEndMs: Milliseconds,
  endedAtMs: S.Number,
  reason: StretchEndReason,
})
/** Where in the title a stretch ended, when, and why. */
export type StretchEnd = typeof StretchEnd.Type

/** A stretch has played 3 s, so its start goes on Scribe's timeline. */
export const StretchBegan = ts('StretchBegan', { stretch: Stretch })
/** A stretch of 3 s or more ended, so its end goes on Scribe's timeline. */
export const StretchEnded = ts('StretchEnded', {
  stretch: Stretch,
  end: StretchEnd,
})
/** What a stretch tells Scribe's timeline. */
export const StretchEvent = S.Union([StretchBegan, StretchEnded])
/** What a stretch tells Scribe's timeline. */
export type StretchEvent = typeof StretchEvent.Type

/** A play shorter than this, by the wall clock, is not a stretch: a tap on Play and Pause. */
export const minimumStretchMs = 3_000

/**
 * How far the audio may be from where the wall clock and the speed put it
 * before it counts as a jump: a seek nobody asked for, or a stall (ADR 0044
 * section 3's 2 s).
 */
export const jumpToleranceMs = 2_000

/** What the audio reported: the second it reached, when, at what speed. */
export type Reached = Readonly<{
  placeMs: Milliseconds
  wallClockMs: number
  speed: Speed
}>

type Recorded = readonly [StretchState, ReadonlyArray<StretchEvent>]

const opened = ({ placeMs, wallClockMs, speed }: Reached): StretchState =>
  Starting({
    stretch: {
      mediaStartMs: placeMs,
      startedAtMs: wallClockMs,
      speed,
      lastPlaceMs: placeMs,
      lastAtMs: wallClockMs,
    },
  })

const maybeStretchOf = (state: StretchState): Option.Option<Stretch> =>
  state._tag === 'Quiet' ? Option.none() : Option.some(state.stretch)

const endedAs = (
  stretch: Stretch,
  end: StretchEnd,
): ReadonlyArray<StretchEvent> =>
  end.endedAtMs - stretch.startedAtMs >= minimumStretchMs
    ? [StretchEnded({ stretch, end })]
    : []

const isJump = (stretch: Stretch, { placeMs, wallClockMs }: Reached) =>
  Math.abs(
    placeMs -
      (stretch.mediaStartMs +
        (wallClockMs - stretch.startedAtMs) * stretch.speed),
  ) > jumpToleranceMs

const continued = (
  state: StretchState,
  stretch: Stretch,
  reached: Reached,
): Recorded => {
  const next: Stretch = {
    ...stretch,
    lastPlaceMs: reached.placeMs,
    lastAtMs: reached.wallClockMs,
  }
  if (
    state._tag === 'Starting' &&
    reached.wallClockMs - stretch.startedAtMs >= minimumStretchMs
  ) {
    return [Begun({ stretch: next }), [StretchBegan({ stretch: next })]]
  } else if (state._tag === 'Begun') {
    return [Begun({ stretch: next }), []]
  } else {
    return [Starting({ stretch: next }), []]
  }
}

/**
 * The stretch after the audio reached a second: the first second opens
 * one; 3 s in, it begins, and its start goes to Scribe's timeline; a jump
 * of more than 2 s from where the wall clock and the speed put it ends it
 * where the audio was last heard, as a seek, and opens the next here.
 *
 * @example
 * ```typescript
 * reachedPlace(Quiet(), { placeMs: Milliseconds.make(723_000), wallClockMs: 1_792_350_000_000, speed: 1 })
 * // [Starting({ stretch: { mediaStartMs: 723000, startedAtMs: 1792350000000, … } }), []]
 * ```
 */
export const reachedPlace = (state: StretchState, reached: Reached): Recorded =>
  Option.match(maybeStretchOf(state), {
    onNone: () => [opened(reached), []],
    onSome: stretch =>
      isJump(stretch, reached)
        ? [
            opened(reached),
            endedAs(stretch, {
              mediaEndMs: stretch.lastPlaceMs,
              endedAtMs: stretch.lastAtMs,
              reason: 'Seeked',
            }),
          ]
        : continued(state, stretch, reached),
  })

/**
 * Ends the stretch where the audio was last heard, for `reason`: a pause,
 * a seek, a new speed, another title, or a failure. Under 3 s it was no
 * stretch, and nothing goes to Scribe's timeline.
 *
 * @example
 * ```typescript
 * stoppedAt(Begun({ stretch }), 'Paused') // [Quiet(), [StretchEnded({ stretch, end: { mediaEndMs: stretch.lastPlaceMs, … } })]]
 * ```
 */
export const stoppedAt = (
  state: StretchState,
  reason: StretchEndReason,
): Recorded => [
  Quiet(),
  Option.match(maybeStretchOf(state), {
    onNone: () => [],
    onSome: stretch =>
      endedAs(stretch, {
        mediaEndMs: stretch.lastPlaceMs,
        endedAtMs: stretch.lastAtMs,
        reason,
      }),
  }),
]

/**
 * Ends the stretch at the end of the title, `durationMs`, at the moment the
 * speed says the audio reached it after the last second it reported.
 *
 * @example
 * ```typescript
 * finishedAt(Begun({ stretch }), Milliseconds.make(4_800_000)) // ends at 1:20:00, reason Ended
 * ```
 */
export const finishedAt = (
  state: StretchState,
  durationMs: Milliseconds,
): Recorded => [
  Quiet(),
  Option.match(maybeStretchOf(state), {
    onNone: () => [],
    onSome: stretch =>
      endedAs(stretch, {
        mediaEndMs: durationMs,
        endedAtMs:
          stretch.lastAtMs +
          Math.max(0, durationMs - stretch.lastPlaceMs) / stretch.speed,
        reason: 'Ended',
      }),
  }),
]

/**
 * True while a stretch plays at another speed than `speed`, so a new speed
 * ends it and the next second opens one at the new speed.
 */
export const isAtOtherSpeed = (state: StretchState, speed: Speed): boolean =>
  Option.exists(maybeStretchOf(state), stretch => stretch.speed !== speed)
