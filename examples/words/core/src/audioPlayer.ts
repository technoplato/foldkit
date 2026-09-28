import { Data, type Effect, type Stream } from 'effect'
import { ManagedResource } from 'foldkit'

import type {
  HeardAudioDuration,
  HeardAudioEnded,
  HeardAudioError,
  HeardAudioPaused,
  HeardAudioPlaying,
  HeardAudioPosition,
} from './message.js'

/** The browser, or another host, refused to play the audio. */
export class AudioPlayerError extends Data.TaggedError('AudioPlayerError')<{
  readonly reason: string
}> {}

/** Everything an audio player reports while it is open. */
export type AudioPlayerEvent =
  | typeof HeardAudioPosition.Type
  | typeof HeardAudioDuration.Type
  | typeof HeardAudioPlaying.Type
  | typeof HeardAudioPaused.Type
  | typeof HeardAudioEnded.Type
  | typeof HeardAudioError.Type

/**
 * One open audio player. Hosts build it from their platform's media element;
 * `events` replays the current duration and position when it starts.
 */
export type AudioPlayerHandle = Readonly<{
  play: Effect.Effect<void, AudioPlayerError>
  pause: Effect.Effect<void>
  seek: (seconds: number) => Effect.Effect<void>
  close: Effect.Effect<void>
  events: Stream.Stream<AudioPlayerEvent>
}>

/** The open recording's audio player, acquired by the host while there is audio to play. */
export const AudioPlayer =
  ManagedResource.tag<AudioPlayerHandle>()('AudioPlayer')

/** The service Commands use to reach the audio player. */
export type AudioPlayerService = ManagedResource.ServiceOf<typeof AudioPlayer>
