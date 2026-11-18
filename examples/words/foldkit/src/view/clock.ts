import { html } from 'foldkit/html'
import {
  type Message,
  type PlaybackClock,
  type ReadyPlayback,
  playbackClockOf,
} from 'words-core-example'

/**
 * The playback clock as an element carries it, for the effects at the
 * edge that read on from it between reports of the place: the place in
 * seconds, how fast it moves, the recording's length, and whether a word
 * is marked. The Model says it; the edge only reads it.
 */
export const clockAttributesOf = (clock: PlaybackClock) => {
  const h = html<Message>()
  return [
    h.DataAttribute('clock-place', String(clock.placeSeconds)),
    h.DataAttribute('clock-rate', String(clock.rate)),
    h.DataAttribute('clock-duration', String(clock.durationSeconds)),
    h.DataAttribute('clock-marking', String(clock.isMarking)),
  ]
}

/** The clock attributes of an open recording. */
export const clockAttributes = (ready: ReadyPlayback) =>
  clockAttributesOf(playbackClockOf(ready))
