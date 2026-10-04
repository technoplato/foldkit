import { Context, Data, Duration, Layer, Schema as S, Stream } from 'effect'

import { MediaId, Milliseconds, Speed } from './ids.js'

// AUDIO

/** What the player sounds: one recording from one place, and its audio. */
export const Track = S.Struct({
  mediaId: MediaId,
  cue: S.Int,
  fromMs: Milliseconds,
  durationMs: Milliseconds,
  maybeAudioUrl: S.Option(S.String),
})
/** What the player sounds. */
export type Track = typeof Track.Type

/** What an audio output reports while it sounds a track. */
export type AudioEvent = Data.TaggedEnum<{
  Advanced: { readonly placeMs: Milliseconds }
  Ended: {}
  Failed: { readonly reason: string }
}>
/** Builds the AudioEvent variants. */
export const AudioEvent = Data.taggedEnum<AudioEvent>()

/**
 * Sounds a track while its stream runs and stops when it is interrupted,
 * reading the speed every step, so a new speed takes effect without a
 * restart. The browser output plays the audio file; the virtual output
 * only counts, for terminals and tests.
 */
export class AudioOutput extends Context.Service<
  AudioOutput,
  Readonly<{
    sound: (track: Track, readSpeed: () => Speed) => Stream.Stream<AudioEvent>
  }>
>()('transcript-player/AudioOutput') {}

const stepMs = 1000

/**
 * Counts a track a second at a time at the speed, without sound: what a
 * terminal plays, and what the browser plays for a recording with no audio
 * file yet.
 */
export const countedSound = (
  track: Track,
  readSpeed: () => Speed,
): Stream.Stream<AudioEvent> =>
  Stream.tick(Duration.millis(stepMs)).pipe(
    Stream.drop(1),
    Stream.mapAccum(
      (): number => track.fromMs,
      (place): readonly [number, ReadonlyArray<AudioEvent>] => {
        const next = Math.min(
          track.durationMs,
          Math.round(place + stepMs * readSpeed()),
        )
        const reached = AudioEvent.Advanced({
          placeMs: Milliseconds.make(next),
        })
        return [
          next,
          next >= track.durationMs ? [reached, AudioEvent.Ended()] : [reached],
        ]
      },
    ),
    Stream.takeUntil(event => event._tag === 'Ended'),
  )

/**
 * An output that sounds nothing and counts a second of the recording every
 * second, at the speed: 1.5× reaches 4.5 seconds after 3. A terminal plays
 * through it, so its player moves like the browser's.
 */
export const virtualAudioOutput = Layer.succeed(AudioOutput, {
  sound: countedSound,
})
