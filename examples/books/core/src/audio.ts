import {
  Context,
  Data,
  Duration,
  Layer,
  Option,
  Schema as S,
  Stream,
} from 'effect'

import { Milliseconds, Speed, TitleSlug } from './ids.js'

// AUDIO

/** What the player sounds: one title from one place, and its audio. */
export const Track = S.Struct({
  slug: TitleSlug,
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
>()('books/AudioOutput') {}

const stepMs = 1000

/**
 * Counts a track a second at a time at the speed, without sound: what a
 * terminal plays, and what the browser plays for a title with no audio
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
 * An output that sounds nothing and counts a second of the title every
 * second, at the speed: 1.5× reaches 4.5 seconds after 3. A terminal plays
 * through it, so its player moves like the browser's.
 */
export const virtualAudioOutput = Layer.succeed(AudioOutput, {
  sound: countedSound,
})

/** True when a track names an audio file to play. */
export const hasAudio = (track: Track): boolean =>
  Option.isSome(track.maybeAudioUrl)
