import { html } from 'foldkit/html'
import {
  type Message,
  type PlaybackClock,
  type ReadyPlayback,
  playbackClockOf,
} from 'words-core-example'

/**
 * The playback clock as the scrubber and the time beside it carry it, for
 * the effects at the edge that read on from it between reports of the
 * place: the place in seconds, how fast it moves, and the recording's
 * length. The Model says it; the edge only reads it.
 */
export const clockAttributesOf = (clock: PlaybackClock) => {
  const h = html<Message>()
  return [
    h.DataAttribute('clock-place', String(clock.placeSeconds)),
    h.DataAttribute('clock-rate', String(clock.rate)),
    h.DataAttribute('clock-duration', String(clock.durationSeconds)),
  ]
}

/** The clock attributes of an open recording. */
export const clockAttributes = (ready: ReadyPlayback) =>
  clockAttributesOf(playbackClockOf(ready))
