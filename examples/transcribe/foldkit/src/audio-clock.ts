import { Effect, Queue, Schema as S, Stream } from 'effect'
import { Mount } from 'foldkit'
import {
  CompletedScrollCurrentWord,
  HeardMediaError,
  HeardPlaybackPosition,
} from 'transcribe-core-example'

const TICK_INTERVAL_MS = 50

const safeSeconds = (seconds: number): number =>
  Number.isFinite(seconds) && seconds >= 0 ? seconds : 0

/** Observes the job video element and emits position at least every 50 ms. */
export const ObserveReaderVideo = Mount.defineStream(
  'ObserveReaderVideo',
  { src: S.String },
  HeardPlaybackPosition,
  HeardMediaError,
)(({ src }) => element => {
  if (!(element instanceof HTMLMediaElement)) {
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
              HeardPlaybackPosition.make({
                mediaPosition: safeSeconds(element.currentTime),
              }),
            )
          const handlers = {
            timeUpdate: () => emitTime(),
            seeked: () => emitTime(),
            error: () => Queue.offerUnsafe(queue, HeardMediaError.make({})),
          }
          element.addEventListener('timeupdate', handlers.timeUpdate)
          element.addEventListener('seeked', handlers.seeked)
          element.addEventListener('error', handlers.error)
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
            element.removeEventListener('seeked', handlers.seeked)
            element.removeEventListener('error', handlers.error)
          }),
      )
      return yield* Effect.never
    }),
  )
})

/** Scrolls the highlighted word into view when it becomes current. */
export const ScrollCurrentWord = Mount.define(
  'ScrollCurrentWord',
  CompletedScrollCurrentWord,
)((element: Element) =>
  Effect.sync(() => {
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    return CompletedScrollCurrentWord.make({})
  }),
)
