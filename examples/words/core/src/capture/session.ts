import { Context, Data, type Effect, type Option, type Stream } from 'effect'
import { ManagedResource } from 'foldkit'

import type {
  HeardCaptureEnded,
  HeardCaptureInterrupted,
  HeardCaptureProgress,
  HeardTranscriberState,
  HeardTranscript,
} from './message.js'
import type { ScribeBuildInfo } from './model.js'

/** The microphone or the recorded audio failed; `reason` is written for the listener. */
export class CaptureSessionError extends Data.TaggedError(
  'CaptureSessionError',
)<{
  readonly reason: string
}> {}

/** The audio a capture recorded, as the WAV file the iPhone also stores. */
export type RecordedAudio = Readonly<{ wav: Blob; durationSeconds: number }>

/** Everything a capture session reports while it is open, in order. */
export type CaptureEvent =
  | typeof HeardCaptureProgress.Type
  | typeof HeardTranscript.Type
  | typeof HeardTranscriberState.Type
  | typeof HeardCaptureInterrupted.Type
  | typeof HeardCaptureEnded.Type

/**
 * One open microphone and live transcriber. `events` reports progress and
 * words in order and ends with `HeardCaptureEnded` after `finish`; events
 * that arrive before anyone reads them wait in order. `close` releases the
 * microphone and the transcriber and forgets the audio.
 */
export type CaptureSessionHandle = Readonly<{
  events: Stream.Stream<CaptureEvent>
  pause: Effect.Effect<void>
  resume: Effect.Effect<void>
  finish: Effect.Effect<void>
  recordedAudio: Effect.Effect<RecordedAudio, CaptureSessionError>
  close: Effect.Effect<void>
}>

/** The browser's microphone and live transcriber, open while a recording is wanted. */
export const CaptureSession =
  ManagedResource.tag<CaptureSessionHandle>()('CaptureSession')

/** The service Commands use to reach the capture session. */
export type CaptureSessionService = ManagedResource.ServiceOf<
  typeof CaptureSession
>

/**
 * What a recording takes from its surroundings: the clock, a fresh id, the
 * device, the date label, the build, and a guard that, while it runs, asks
 * before the page closes with audio that is not saved yet.
 */
export type CaptureEnvironmentService = Readonly<{
  now: Effect.Effect<number>
  newRecordingID: Effect.Effect<string>
  deviceIcon: Effect.Effect<string>
  titleDateLabel: (startedAtMs: number) => Effect.Effect<string>
  maybeBuildInfo: Effect.Effect<Option.Option<ScribeBuildInfo>>
  guardPageClose: Stream.Stream<never>
}>

/** What a new recording takes from its surroundings, provided by the host. */
export class CaptureEnvironment extends Context.Service<
  CaptureEnvironment,
  CaptureEnvironmentService
>()('words-core-example/CaptureEnvironment') {}
