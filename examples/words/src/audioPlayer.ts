import { Context, Effect, Option, Queue, Stream } from 'effect'

import {
  type AudioEvent,
  MountedAudioPlayer,
  ObservedAudioDuration,
  ObservedAudioEnded,
  ObservedAudioFailure,
  ObservedAudioPaused,
  ObservedAudioPlaying,
  ObservedAudioTime,
} from './message.js'
import {
  type AudioFailure,
  InvalidAudioElement,
  MediaAudioFailure,
  RejectedAudioOperation,
} from './model.js'

/** The imperative audio capability required by playback Commands. */
export type AudioPlayerService = Readonly<{
  play: Effect.Effect<void, AudioFailure>
  pause: Effect.Effect<void, AudioFailure>
  seek: (seconds: number) => Effect.Effect<void, AudioFailure>
}>

/** An injected imperative browser audio capability. */
export class AudioPlayer extends Context.Service<
  AudioPlayer,
  AudioPlayerService
>()('Words/AudioPlayer') {}

const unknownReason = (cause: unknown): string =>
  cause instanceof Error ? cause.message : globalThis.String(cause)

/** Creates the imperative audio adapter for one supplied fallback player. */
export const makeBrowserAudioPlayer = (
  element: HTMLAudioElement,
): AudioPlayerService => ({
  play: Effect.tryPromise({
    try: () => {
      if (element.ended) {
        element.currentTime = 0
      }
      return element.play()
    },
    catch: cause =>
      RejectedAudioOperation.make({
        operation: 'Play',
        reason: unknownReason(cause),
      }),
  }),
  pause: Effect.try({
    try: () => element.pause(),
    catch: cause =>
      RejectedAudioOperation.make({
        operation: 'Pause',
        reason: unknownReason(cause),
      }),
  }),
  seek: seconds =>
    Effect.try({
      try: () => {
        element.currentTime = seconds
      },
      catch: cause =>
        RejectedAudioOperation.make({
          operation: 'Seek',
          reason: unknownReason(cause),
        }),
    }),
})

const safeSeconds = (seconds: number): number =>
  globalThis.Number.isFinite(seconds) && seconds >= 0 ? seconds : 0

const maybeDuration = (element: HTMLAudioElement): Option.Option<number> =>
  globalThis.Number.isFinite(element.duration) && element.duration >= 0
    ? Option.some(element.duration)
    : Option.none()

const mediaFailure = (element: HTMLAudioElement) => {
  const code = element.error?.code ?? 0
  const reason =
    element.error?.message ?? 'The browser could not play this audio source.'
  return MediaAudioFailure.make({ code, reason })
}

/** Observes one supplied fallback player until the Stream scope closes. */
export const observeAudioPlayer = (
  element: Element,
): Stream.Stream<AudioEvent> => {
  if (!(element instanceof HTMLAudioElement)) {
    return Stream.succeed(
      ObservedAudioFailure.make({
        failure: InvalidAudioElement.make({
          elementName: element.tagName.toLowerCase(),
        }),
      }),
    )
  }

  return Stream.callback<AudioEvent>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const handlers = {
          timeUpdate: () =>
            Queue.offerUnsafe(
              queue,
              ObservedAudioTime.make({
                seconds: safeSeconds(element.currentTime),
              }),
            ),
          durationChange: () =>
            Queue.offerUnsafe(
              queue,
              ObservedAudioDuration.make({
                duration: Option.getOrElse(maybeDuration(element), () => 0),
              }),
            ),
          playing: () =>
            Queue.offerUnsafe(queue, ObservedAudioPlaying.make({})),
          paused: () => Queue.offerUnsafe(queue, ObservedAudioPaused.make({})),
          ended: () =>
            Queue.offerUnsafe(
              queue,
              ObservedAudioEnded.make({
                seconds: safeSeconds(element.currentTime),
              }),
            ),
          failed: () =>
            Queue.offerUnsafe(
              queue,
              ObservedAudioFailure.make({ failure: mediaFailure(element) }),
            ),
        }
        element.addEventListener('timeupdate', handlers.timeUpdate)
        element.addEventListener('durationchange', handlers.durationChange)
        element.addEventListener('loadedmetadata', handlers.durationChange)
        element.addEventListener('play', handlers.playing)
        element.addEventListener('pause', handlers.paused)
        element.addEventListener('ended', handlers.ended)
        element.addEventListener('error', handlers.failed)
        Queue.offerUnsafe(
          queue,
          MountedAudioPlayer.make({
            maybeDuration: maybeDuration(element),
          }),
        )
        return handlers
      }),
      handlers =>
        Effect.sync(() => {
          element.removeEventListener('timeupdate', handlers.timeUpdate)
          element.removeEventListener('durationchange', handlers.durationChange)
          element.removeEventListener('loadedmetadata', handlers.durationChange)
          element.removeEventListener('play', handlers.playing)
          element.removeEventListener('pause', handlers.paused)
          element.removeEventListener('ended', handlers.ended)
          element.removeEventListener('error', handlers.failed)
        }),
    ).pipe(Effect.flatMap(() => Effect.never)),
  )
}
