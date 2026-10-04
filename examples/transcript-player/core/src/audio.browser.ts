import { Effect, Layer, Match as M, Option, Queue, Stream } from 'effect'

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

const reasonOfMediaError = (maybeError: MediaError | null): string =>
  M.value(maybeError?.code).pipe(
    M.when(
      MediaError.MEDIA_ERR_NETWORK,
      () => 'the audio file stopped downloading',
    ),
    M.when(
      MediaError.MEDIA_ERR_DECODE,
      () => 'the audio file could not be decoded',
    ),
    M.when(
      MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED,
      () =>
        'the audio file could not be reached, or this browser cannot play it',
    ),
    M.orElse(() => 'the audio stopped loading'),
  )

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
        const failed = (reason: string): void => {
          Queue.offerUnsafe(queue, AudioEvents.Failed({ reason }))
          Queue.endUnsafe(queue)
        }
        const onError = (): void => failed(reasonOfMediaError(audio.error))
        audio.addEventListener('timeupdate', onTime)
        audio.addEventListener('ended', onEnded)
        audio.addEventListener('error', onError)
        // NOTE: play() also rejects when the track changes mid-load
        // (AbortError) and when the file fails (the error event reports
        // that), so only a refusal to play without a press is its own failure.
        void audio.play().catch((error: unknown) => {
          if (
            error instanceof DOMException &&
            error.name === 'NotAllowedError'
          ) {
            failed('the browser wants a press of Play first')
          }
        })
        return { audio, onTime, onEnded, onError }
      }),
      ({ audio, onTime, onEnded, onError }) =>
        Effect.sync(() => {
          audio.removeEventListener('error', onError)
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
 * stopped and emptied when the track changes or pauses. A recording with no
 * audio file yet counts silently, so the player still moves.
 */
export const htmlAudioOutput = Layer.succeed(AudioOutput, {
  sound: (track, readSpeed) =>
    Option.match(track.maybeAudioUrl, {
      onNone: () => countedSound(track, readSpeed),
      onSome: url => audioSound(url, track, readSpeed),
    }),
})
