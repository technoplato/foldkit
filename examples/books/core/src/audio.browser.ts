import { Effect, Layer, Option, Queue, Stream } from 'effect'

import {
  type AudioEvent,
  AudioEvent as AudioEvents,
  AudioOutput,
  type Track,
  countedSound,
} from './audio.js'
import { Milliseconds, type Speed } from './ids.js'

// AUDIO

const millisecondsPerSecond = 1000

const audioSound = (
  url: string,
  track: Track,
  readSpeed: () => Speed,
): Stream.Stream<AudioEvent> =>
  Stream.callback<AudioEvent>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const audio = new Audio(url)
        audio.currentTime = track.fromMs / millisecondsPerSecond
        audio.playbackRate = readSpeed()
        const reachedSeconds = { current: -1 }
        const onTime = (): void => {
          audio.playbackRate = readSpeed()
          const seconds = Math.floor(audio.currentTime)
          if (seconds !== reachedSeconds.current) {
            reachedSeconds.current = seconds
            Queue.offerUnsafe(
              queue,
              AudioEvents.Advanced({
                placeMs: Milliseconds.make(
                  Math.round(audio.currentTime * millisecondsPerSecond),
                ),
              }),
            )
          }
        }
        const onEnded = (): void => {
          Queue.offerUnsafe(queue, AudioEvents.Ended())
          Queue.endUnsafe(queue)
        }
        audio.addEventListener('timeupdate', onTime)
        audio.addEventListener('ended', onEnded)
        void audio.play().catch(() => undefined)
        return { audio, onTime, onEnded }
      }),
      ({ audio, onTime, onEnded }) =>
        Effect.sync(() => {
          audio.pause()
          audio.removeEventListener('timeupdate', onTime)
          audio.removeEventListener('ended', onEnded)
          audio.removeAttribute('src')
          audio.load()
        }),
    ),
  )

/**
 * The browser's audio output: one `Audio` element per track, from the
 * track's place at its speed, reporting each new second it reaches, and
 * stopped and emptied when the track changes or pauses. A title with no
 * audio file yet counts silently, so the player still moves.
 */
export const htmlAudioOutput = Layer.succeed(AudioOutput, {
  sound: (track, readSpeed) =>
    Option.match(track.maybeAudioUrl, {
      onNone: () => countedSound(track, readSpeed),
      onSome: url => audioSound(url, track, readSpeed),
    }),
})
