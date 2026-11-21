import { Effect, Option, Queue, Stream } from 'effect'
import type { MountAction } from 'foldkit/mount'

import type { PlaygroundMessage } from './messages'

export type PointerSample = Readonly<{
  pointerId: number
  pointerType: string
  localX: number
  localY: number
  clientX: number
  clientY: number
  width: number
  height: number
  ratioX: number
  ratioY: number
}>

export type SurfaceDragHandlers = Readonly<{
  name: string
  isPreventingDefaultOnDown?: boolean
  onStart: (sample: PointerSample) => Option.Option<PlaygroundMessage>
  onMove: (sample: PointerSample) => Option.Option<PlaygroundMessage>
  onEnd: (sample: PointerSample) => Option.Option<PlaygroundMessage>
  onCancel?: (sample: PointerSample) => Option.Option<PlaygroundMessage>
}>

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

const sampleOf = (element: Element, event: PointerEvent): PointerSample => {
  const rect = element.getBoundingClientRect()
  const width = rect.width > 0 ? rect.width : 1
  const height = rect.height > 0 ? rect.height : 1
  const localX = event.clientX - rect.left
  const localY = event.clientY - rect.top
  return {
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    localX,
    localY,
    clientX: event.clientX,
    clientY: event.clientY,
    width,
    height,
    ratioX: clamp01(localX / width),
    ratioY: clamp01(localY / height),
  }
}

export const mountSurfaceDrag = (
  handlers: SurfaceDragHandlers,
): MountAction<PlaygroundMessage> => ({
  name: handlers.name,
  f: element =>
    Stream.callback<PlaygroundMessage>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          let activePointerId: Option.Option<number> = Option.none()

          const emitMaybe = (
            maybeMessage: Option.Option<PlaygroundMessage>,
          ): void => {
            if (Option.isSome(maybeMessage)) {
              Queue.offerUnsafe(queue, maybeMessage.value)
            }
          }

          const onDown = (raw: Event): void => {
            if (!(raw instanceof PointerEvent)) {
              return
            }
            if (raw.pointerType === 'mouse' && raw.button !== 0) {
              return
            }
            if (Option.isSome(activePointerId)) {
              return
            }
            if (handlers.isPreventingDefaultOnDown !== false) {
              raw.preventDefault()
            }
            activePointerId = Option.some(raw.pointerId)
            try {
              element.setPointerCapture(raw.pointerId)
            } catch {
              // Synthetic or detached events in tests may not capture.
            }
            emitMaybe(handlers.onStart(sampleOf(element, raw)))
          }

          const onMove = (raw: Event): void => {
            if (!(raw instanceof PointerEvent)) {
              return
            }
            if (!Option.contains(activePointerId, raw.pointerId)) {
              return
            }
            emitMaybe(handlers.onMove(sampleOf(element, raw)))
          }

          const onUp = (raw: Event): void => {
            if (!(raw instanceof PointerEvent)) {
              return
            }
            if (!Option.contains(activePointerId, raw.pointerId)) {
              return
            }
            activePointerId = Option.none()
            emitMaybe(handlers.onEnd(sampleOf(element, raw)))
          }

          const onCancel = (raw: Event): void => {
            if (!(raw instanceof PointerEvent)) {
              return
            }
            if (!Option.contains(activePointerId, raw.pointerId)) {
              return
            }
            activePointerId = Option.none()
            const sample = sampleOf(element, raw)
            emitMaybe(
              handlers.onCancel !== undefined
                ? handlers.onCancel(sample)
                : handlers.onEnd(sample),
            )
          }

          element.addEventListener('pointerdown', onDown)
          element.addEventListener('pointermove', onMove)
          element.addEventListener('pointerup', onUp)
          element.addEventListener('pointercancel', onCancel)

          return () => {
            element.removeEventListener('pointerdown', onDown)
            element.removeEventListener('pointermove', onMove)
            element.removeEventListener('pointerup', onUp)
            element.removeEventListener('pointercancel', onCancel)
          }
        }),
        cleanup => Effect.sync(cleanup),
      ),
    ),
})
