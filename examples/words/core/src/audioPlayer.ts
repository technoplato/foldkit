import { Data, type Effect, Schema as S, type Stream } from 'effect'
import { ManagedResource } from 'foldkit'
import { ts } from 'foldkit/schema'

import type {
  HeardAudioDuration,
  HeardAudioEnded,
  HeardAudioError,
  HeardAudioPaused,
  HeardAudioPlaying,
  HeardAudioPosition,
  HeardMediaSessionAction,
} from './message.js'

/** The browser, or another host, refused to play the audio. */
export class AudioPlayerError extends Data.TaggedError('AudioPlayerError')<{
  readonly reason: string
}> {}

/** The system's media controls asked to play. */
export const MediaSessionPlay = ts('MediaSessionPlay')
/** The system's media controls asked to pause. */
export const MediaSessionPause = ts('MediaSessionPause')
/** The system's media controls asked to skip backward or forward. */
export const MediaSessionSkip = ts('MediaSessionSkip', {
  deltaSeconds: S.Number,
})
/** The system's media controls asked to move to a time. */
export const MediaSessionSeek = ts('MediaSessionSeek', { seconds: S.Number })
/**
 * What the lock screen, Control Center, headphones, or media keys asked for,
 * through the browser's Media Session.
 */
export const MediaSessionAction = S.Union([
  MediaSessionPlay,
  MediaSessionPause,
  MediaSessionSkip,
  MediaSessionSeek,
])
/** What the system's media controls asked for. */
export type MediaSessionAction = typeof MediaSessionAction.Type

/** What the system's Now Playing shows for the open recording: its title and when it was recorded. */
export const NowPlaying = S.Struct({
  title: S.String,
  startedAtMs: S.Number,
})
/** What the system's Now Playing shows for the open recording. */
export type NowPlaying = typeof NowPlaying.Type

/** Everything an audio player reports while it is open. */
export type AudioPlayerEvent =
  | typeof HeardAudioPosition.Type
  | typeof HeardAudioDuration.Type
  | typeof HeardAudioPlaying.Type
  | typeof HeardAudioPaused.Type
  | typeof HeardAudioEnded.Type
  | typeof HeardAudioError.Type
  | typeof HeardMediaSessionAction.Type

/**
 * One open audio player. Hosts build it from their platform's media element;
 * `events` replays the current duration and position when it starts, and
 * reports the system's media controls while it runs. `publishNowPlaying`
 * names the recording on the lock screen and in Control Center.
 */
export type AudioPlayerHandle = Readonly<{
  play: Effect.Effect<void, AudioPlayerError>
  pause: Effect.Effect<void>
  seek: (seconds: number) => Effect.Effect<void>
  publishNowPlaying: (nowPlaying: NowPlaying) => Effect.Effect<void>
  close: Effect.Effect<void>
  events: Stream.Stream<AudioPlayerEvent>
}>

/** The open recording's audio player, acquired by the host while there is audio to play. */
export const AudioPlayer =
  ManagedResource.tag<AudioPlayerHandle>()('AudioPlayer')

/** The service Commands use to reach the audio player. */
export type AudioPlayerService = ManagedResource.ServiceOf<typeof AudioPlayer>
