import {
  CompletedScrollCurrentWord,
  HeardAudioEnded,
  HeardAudioPaused,
  HeardAudioPlaying,
  HeardPlaybackPosition,
} from 'books-core-example'
import { Effect, Queue, Schema as S, Stream } from 'effect'
import { Mount } from 'foldkit'

const TICK_INTERVAL_MS = 50

const safeSeconds = (seconds: number): number =>
  Number.isFinite(seconds) && seconds >= 0 ? seconds : 0

/** Observes the reader audio element and emits position at least every 50 ms. */
export const ObserveReaderAudio = Mount.defineStream(
  'ObserveReaderAudio',
  { itemId: S.String, renditionId: S.String, src: S.String },
  HeardPlaybackPosition,
  HeardAudioPlaying,
  HeardAudioPaused,
  HeardAudioEnded,
)(
  ({ itemId, renditionId, src }) =>
    element => {
      if (!(element instanceof HTMLAudioElement)) {
        return Stream.empty
      }
      return Stream.callback(queue =>
        Effect.gen(function* () {
          yield* Effect.acquireRelease(
            Effect.sync(() => {
              const nextSrc = new URL(src, window.location.href).href
              if (element.src !== nextSrc) {
                element.src = src
              }
              const emitTime = () =>
                Queue.offerUnsafe(
                  queue,
                  HeardPlaybackPosition({
                    mediaPosition: safeSeconds(element.currentTime),
                  }),
                )
              const handlers = {
                timeUpdate: () => emitTime(),
                playing: () =>
                  Queue.offerUnsafe(
                    queue,
                    HeardAudioPlaying({ itemId, renditionId }),
                  ),
                paused: () => Queue.offerUnsafe(queue, HeardAudioPaused()),
                ended: () => Queue.offerUnsafe(queue, HeardAudioEnded()),
              }
              element.addEventListener('timeupdate', handlers.timeUpdate)
              element.addEventListener('play', handlers.playing)
              element.addEventListener('pause', handlers.paused)
              element.addEventListener('ended', handlers.ended)
              const interval = window.setInterval(() => {
                if (!element.paused && !element.ended) {
                  emitTime()
                }
              }, TICK_INTERVAL_MS)
              return { handlers, interval }
            }),
            ({ handlers, interval }) =>
              Effect.sync(() => {
                window.clearInterval(interval)
                element.removeEventListener('timeupdate', handlers.timeUpdate)
                element.removeEventListener('play', handlers.playing)
                element.removeEventListener('pause', handlers.paused)
                element.removeEventListener('ended', handlers.ended)
              }),
          )
          return yield* Effect.never
        }),
      )
    },
)

/** Scrolls the highlighted word into view when it becomes current. */
export const ScrollCurrentWord = Mount.define(
  'ScrollCurrentWord',
  CompletedScrollCurrentWord,
)((element: Element) =>
  Effect.sync(() => {
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    return CompletedScrollCurrentWord()
  }),
)
