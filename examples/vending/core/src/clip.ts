import { Schema as S } from 'effect'
import { NonEmptyString, NonNegativeInt } from 'foldkit/adt'

/** Speakers in the TJ clip. Michael is the seller. */
export const ClipSpeaker = S.Literals(['Michael', 'TJ'])
/** A speaker in the TJ clip. */
export type ClipSpeaker = typeof ClipSpeaker.Type

/** One iMessage row. Hosts render this; they do not play a video. */
export const ClipLine = S.Struct({
  id: NonEmptyString,
  speaker: ClipSpeaker,
  text: NonEmptyString,
  startMs: NonNegativeInt,
})
/** One iMessage row. */
export type ClipLine = typeof ClipLine.Type

/** Ordered transcript of the clip SKU. */
export const ClipConversation = S.NonEmptyArray(ClipLine)
/** Ordered transcript of the clip SKU. */
export type ClipConversation = typeof ClipConversation.Type

const line = (
  id: string,
  speaker: ClipSpeaker,
  startMs: number,
  text: string,
): ClipLine =>
  ClipLine.make({
    id: NonEmptyString.make(id),
    speaker,
    text: NonEmptyString.make(text),
    startMs: NonNegativeInt.make(startMs),
  })

/**
 * Canonical state for the $14.28 TJ clip.
 * Playback is revealing these rows, not decoding YouTube pixels.
 */
export const clipConversation: ClipConversation = ClipConversation.make([
  line(
    'c1',
    'Michael',
    0,
    "You can't stream a screen with no latency. They dropped to 24 fps just to show the graphics.",
  ),
  line('c2', 'TJ', 3_200, 'The Linux box.'),
  line(
    'c3',
    'Michael',
    4_800,
    "Don't stream pixels. Stream a reference to the state plus the app that would render them.",
  ),
  line(
    'c4',
    'Michael',
    9_200,
    "Then you get a full iOS render. I'm working on that right now.",
  ),
  line('c5', 'TJ', 14_000, "You're preaching to the choir."),
  line('c6', 'Michael', 16_500, "I'll sell you this clip for $14.28 tomorrow."),
  line('c7', 'TJ', 19_800, 'Okay. Deal.'),
  line('c8', 'Michael', 21_400, 'Peace.'),
])

/** Hold after the last line before playback is Complete. */
export const clipHoldMs = 2_400

/** Elapsed milliseconds when every line has been revealed and held. */
const lastClipLine = clipConversation.at(-1)
export const clipCompleteMs: number =
  (lastClipLine === undefined ? 0 : lastClipLine.startMs) + clipHoldMs

/** Playback has not started. The phone screen stays locked. */
export const IdleClipPlayback = S.TaggedStruct('Idle', {})
/** The clip is revealing iMessage rows from elapsed time. */
export const PlayingClipPlayback = S.TaggedStruct('Playing', {
  elapsedMs: NonNegativeInt,
})
/** Every line is on screen. */
export const CompleteClipPlayback = S.TaggedStruct('Complete', {})
/** Exclusive clip playback. Idle cannot overlap Playing. */
export const ClipPlayback = S.Union([
  IdleClipPlayback,
  PlayingClipPlayback,
  CompleteClipPlayback,
])
/** Exclusive clip playback. */
export type ClipPlayback = typeof ClipPlayback.Type

/** How many transcript rows are visible at this elapsed time. */
export const revealedCountAt = (elapsedMs: number): number =>
  clipConversation.filter(row => row.startMs <= elapsedMs).length

/** Visible iMessage rows for a playback tag. */
export const revealedLines = (
  playback: ClipPlayback,
): ReadonlyArray<ClipLine> => {
  if (playback._tag === 'Idle') {
    return []
  }
  if (playback._tag === 'Complete') {
    return clipConversation
  }
  return clipConversation.filter(row => row.startMs <= playback.elapsedMs)
}

/** True when the host should stop ticking playback. */
export const isClipComplete = (playback: ClipPlayback): boolean =>
  playback._tag === 'Complete'

/** Next playback tag after the host reports elapsed time. */
export const playbackAtElapsed = (elapsedMs: number): ClipPlayback => {
  const clamped = Math.max(0, Math.floor(elapsedMs))
  if (clamped >= clipCompleteMs) {
    return CompleteClipPlayback.make({})
  }
  return PlayingClipPlayback.make({
    elapsedMs: NonNegativeInt.make(clamped),
  })
}
