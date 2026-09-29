import { Duration, Effect, Queue, Stream } from 'effect'
import {
  AudioPlayerError,
  type AudioPlayerEvent,
  type AudioPlayerHandle,
  HeardAudioDuration,
  HeardAudioEnded,
  HeardAudioError,
  HeardAudioPaused,
  HeardAudioPlaying,
  HeardAudioPosition,
} from 'words-core-example'

const POSITION_INTERVAL_MS = 100
const METADATA_TIMEOUT = Duration.seconds(5)

const mediaErrorReason = (element: HTMLMediaElement): string => {
  const error = element.error
  if (error === null) {
    return 'The audio failed to load.'
  } else if (error.code === MediaError.MEDIA_ERR_NETWORK) {
    return 'The network dropped while loading the audio.'
  } else if (error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return 'The audio link expired or the format is not supported.'
  } else {
    return error.message === '' ? 'The audio failed to load.' : error.message
  }
}

const eventsOf = (element: HTMLAudioElement): Stream.Stream<AudioPlayerEvent> =>
  Stream.callback<AudioPlayerEvent>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const emit = (event: AudioPlayerEvent) =>
          Queue.offerUnsafe(queue, event)
        const emitPosition = () =>
          emit(HeardAudioPosition({ seconds: element.currentTime }))
        const emitDuration = () => {
          if (Number.isFinite(element.duration)) {
            emit(HeardAudioDuration({ seconds: element.duration }))
          }
        }
        const listeners: ReadonlyArray<readonly [string, () => void]> = [
          ['timeupdate', emitPosition],
          ['seeked', emitPosition],
          ['durationchange', emitDuration],
          ['playing', () => emit(HeardAudioPlaying())],
          ['pause', () => emit(HeardAudioPaused())],
          ['ended', () => emit(HeardAudioEnded())],
          [
            'error',
            () => emit(HeardAudioError({ reason: mediaErrorReason(element) })),
          ],
        ]
        for (const [type, listener] of listeners) {
          element.addEventListener(type, listener)
        }
        const interval = window.setInterval(() => {
          if (!element.paused) {
            emitPosition()
          }
        }, POSITION_INTERVAL_MS)
        emitDuration()
        emitPosition()
        return { listeners, interval }
      }),
      ({ listeners, interval }) =>
        Effect.sync(() => {
          window.clearInterval(interval)
          for (const [type, listener] of listeners) {
            element.removeEventListener(type, listener)
          }
        }),
    ).pipe(Effect.flatMap(() => Effect.never)),
  )

const handleOf = (element: HTMLAudioElement): AudioPlayerHandle => ({
  play: Effect.tryPromise({
    try: () => element.play(),
    catch: cause =>
      new AudioPlayerError({
        reason: cause instanceof Error ? cause.message : String(cause),
      }),
  }),
  pause: Effect.sync(() => element.pause()),
  seek: seconds =>
    Effect.sync(() => {
      element.currentTime = seconds
    }),
  close: Effect.sync(() => {
    element.pause()
    element.removeAttribute('src')
    element.load()
  }),
  events: eventsOf(element),
})

/** Opens a recording's audio in a browser audio element once its metadata loads. */
export const openAudio = (
  url: string,
): Effect.Effect<AudioPlayerHandle, Error> =>
  Effect.callback<AudioPlayerHandle, Error>(resume => {
    const element = new Audio()
    const handleReady = () => {
      detach()
      resume(Effect.succeed(handleOf(element)))
    }
    const handleError = () => {
      detach()
      resume(Effect.fail(new Error(mediaErrorReason(element))))
    }
    const detach = () => {
      element.removeEventListener('loadedmetadata', handleReady)
      element.removeEventListener('error', handleError)
    }
    element.addEventListener('loadedmetadata', handleReady)
    element.addEventListener('error', handleError)
    element.preload = 'metadata'
    element.src = url
    return Effect.sync(detach)
  }).pipe(
    Effect.timeout(METADATA_TIMEOUT),
    Effect.catchTag('TimeoutError', () =>
      Effect.fail(
        new Error('The audio did not start loading within 5 seconds.'),
      ),
    ),
  )
