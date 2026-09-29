import { Duration, Effect, Option, Queue, Stream } from 'effect'
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
  HeardMediaSessionAction,
  MediaSessionPause,
  MediaSessionPlay,
  MediaSessionSeek,
  MediaSessionSkip,
  type NowPlaying,
  SKIP_SECONDS,
} from 'words-core-example'

const POSITION_INTERVAL_MS = 100
const METADATA_TIMEOUT = Duration.seconds(5)
const NOW_PLAYING_ARTWORK: ReadonlyArray<MediaImage> = [
  { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
]

const mediaErrorReason = (element: HTMLMediaElement): string => {
  const error = element.error
  if (error === null) {
    return 'The audio did not load. Retry to load it again.'
  } else if (error.code === MediaError.MEDIA_ERR_NETWORK) {
    return 'The network dropped while loading the audio. Retry once you are back online.'
  } else if (error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return 'The link to the audio expired, or this browser cannot play its format. Retry to load a fresh link.'
  } else {
    return error.message === ''
      ? 'The audio did not load. Retry to load it again.'
      : `${error.message} Retry to load it again.`
  }
}

const maybeMediaSessionOf = (): Option.Option<MediaSession> =>
  'mediaSession' in navigator
    ? Option.some(navigator.mediaSession)
    : Option.none()

const publishPosition = (element: HTMLAudioElement): void => {
  Option.map(maybeMediaSessionOf(), session => {
    if (
      Number.isFinite(element.duration) &&
      element.currentTime <= element.duration
    ) {
      session.setPositionState({
        duration: element.duration,
        playbackRate: element.playbackRate,
        position: element.currentTime,
      })
    }
  })
}

const publishPlaybackState = (state: MediaSessionPlaybackState): void => {
  Option.map(maybeMediaSessionOf(), session => {
    session.playbackState = state
  })
}

type MediaActionHandler = readonly [
  MediaSessionAction,
  (details: MediaSessionActionDetails) => void,
]

const mediaActionHandlersOf = (
  emit: (event: AudioPlayerEvent) => void,
): ReadonlyArray<MediaActionHandler> => [
  ['play', () => emit(HeardMediaSessionAction({ action: MediaSessionPlay() }))],
  [
    'pause',
    () => emit(HeardMediaSessionAction({ action: MediaSessionPause() })),
  ],
  [
    'seekbackward',
    details =>
      emit(
        HeardMediaSessionAction({
          action: MediaSessionSkip({
            deltaSeconds: -(details.seekOffset ?? SKIP_SECONDS),
          }),
        }),
      ),
  ],
  [
    'seekforward',
    details =>
      emit(
        HeardMediaSessionAction({
          action: MediaSessionSkip({
            deltaSeconds: details.seekOffset ?? SKIP_SECONDS,
          }),
        }),
      ),
  ],
  [
    'seekto',
    details => {
      if (details.seekTime !== undefined) {
        emit(
          HeardMediaSessionAction({
            action: MediaSessionSeek({ seconds: details.seekTime }),
          }),
        )
      }
    },
  ],
]

// NOTE: browsers throw for Media Session actions they do not support, such
// as `seekto` in older Safari; skipping those keeps the others working.
const trySetActionHandler = (
  session: MediaSession,
  action: MediaSessionAction,
  handler: MediaSessionActionHandler | null,
): void => {
  try {
    session.setActionHandler(action, handler)
  } catch {
    return
  }
}

const setMediaActionHandlers = (
  handlers: ReadonlyArray<MediaActionHandler>,
): void => {
  Option.map(maybeMediaSessionOf(), session => {
    for (const [action, handler] of handlers) {
      trySetActionHandler(session, action, handler)
    }
  })
}

const clearMediaSession = (
  handlers: ReadonlyArray<MediaActionHandler>,
): void => {
  Option.map(maybeMediaSessionOf(), session => {
    for (const [action] of handlers) {
      trySetActionHandler(session, action, null)
    }
    session.metadata = null
    session.playbackState = 'none'
  })
}

const eventsOf = (element: HTMLAudioElement): Stream.Stream<AudioPlayerEvent> =>
  Stream.callback<AudioPlayerEvent>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const emit = (event: AudioPlayerEvent) =>
          Queue.offerUnsafe(queue, event)
        const emitPosition = () => {
          emit(HeardAudioPosition({ seconds: element.currentTime }))
        }
        const emitDuration = () => {
          if (Number.isFinite(element.duration)) {
            emit(HeardAudioDuration({ seconds: element.duration }))
            publishPosition(element)
          }
        }
        const listeners: ReadonlyArray<readonly [string, () => void]> = [
          ['timeupdate', emitPosition],
          [
            'seeked',
            () => {
              emitPosition()
              publishPosition(element)
            },
          ],
          ['durationchange', emitDuration],
          [
            'playing',
            () => {
              emit(HeardAudioPlaying())
              publishPlaybackState('playing')
              publishPosition(element)
            },
          ],
          [
            'pause',
            () => {
              emit(HeardAudioPaused())
              publishPlaybackState('paused')
              publishPosition(element)
            },
          ],
          ['ended', () => emit(HeardAudioEnded())],
          [
            'error',
            () => emit(HeardAudioError({ reason: mediaErrorReason(element) })),
          ],
        ]
        for (const [type, listener] of listeners) {
          element.addEventListener(type, listener)
        }
        const mediaActionHandlers = mediaActionHandlersOf(emit)
        setMediaActionHandlers(mediaActionHandlers)
        const interval = window.setInterval(() => {
          if (!element.paused) {
            emitPosition()
          }
        }, POSITION_INTERVAL_MS)
        emitDuration()
        emitPosition()
        return { listeners, interval, mediaActionHandlers }
      }),
      ({ listeners, interval, mediaActionHandlers }) =>
        Effect.sync(() => {
          window.clearInterval(interval)
          for (const [type, listener] of listeners) {
            element.removeEventListener(type, listener)
          }
          clearMediaSession(mediaActionHandlers)
        }),
    ).pipe(Effect.flatMap(() => Effect.never)),
  )

const albumOf = (startedAtMs: number): string =>
  new Date(startedAtMs).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

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
  publishNowPlaying: (nowPlaying: NowPlaying) =>
    Effect.sync(() => {
      Option.map(maybeMediaSessionOf(), session => {
        session.metadata = new MediaMetadata({
          title: nowPlaying.title,
          artist: 'Scribe',
          album: albumOf(nowPlaying.startedAtMs),
          artwork: [...NOW_PLAYING_ARTWORK],
        })
      })
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
        new Error(
          'The audio did not start loading within 5 seconds. Retry to load it again.',
        ),
      ),
    ),
  )
