import { Effect, Option, Queue, Stream } from 'effect'

import * as PointerDrag from '../behavior/pointerDrag.js'
import type { MountAction } from '../mount/index.js'

// NOTE: this is the browser's surface-drag mechanic, paired with `PointerDrag`
// in `foldkit/behavior`. Like `htmlHost.ts`, it holds one short-lived capture
// record (`maybeActive`) from `pointerdown` until the pointer lifts, cancels,
// or loses capture: it snapshots `getBoundingClientRect()` once at
// `pointerdown` (preventing 120Hz layout reflow and moving-box coordinate
// oscillation), ignores additional pointers while a drag is active, defers
// `setPointerCapture` past `thresholdPx` for swipeable containers so child
// buttons still click, and routes both `pointercancel` and
// `lostpointercapture` to `onCancel`.

/**
 * One pointer sample delivered to a surface-drag handler, combining raw
 * viewport coordinates with the normalized sample from `PointerDrag.sampleInRect`.
 */
export type SurfaceDragSample = PointerDrag.SurfaceSample &
  Readonly<{
    pointerId: number
    pointerType: string
    clientX: number
    clientY: number
  }>

/** Callbacks translating a captured pointer sequence into Program Messages. */
export type SurfaceDragHandlers<Message> = Readonly<{
  name: string
  thresholdPx?: number
  isPreventingDefaultOnDown?: boolean
  onStart: (sample: SurfaceDragSample) => Option.Option<Message>
  onMove: (sample: SurfaceDragSample) => Option.Option<Message>
  onEnd: (sample: SurfaceDragSample) => Option.Option<Message>
  onCancel?: (sample: SurfaceDragSample) => Option.Option<Message>
}>

type ActiveSequence = Readonly<{
  pointerId: number
  rect: PointerDrag.Rect
  startX: number
  startY: number
  isCaptured: boolean
}>

const capturePointer = (element: Element, pointerId: number): boolean => {
  try {
    element.setPointerCapture(pointerId)
    return true
  } catch {
    return false
  }
}

const sampleFromEvent = (
  rect: PointerDrag.Rect,
  event: PointerEvent,
): SurfaceDragSample => ({
  ...PointerDrag.sampleInRect({ x: event.clientX, y: event.clientY }, rect),
  pointerId: event.pointerId,
  pointerType: event.pointerType,
  clientX: event.clientX,
  clientY: event.clientY,
})

/**
 * Binds pointer-captured surface dragging on `element`, calling `send` for
 * each Message answered by `handlers`, and returns the cleanup function.
 */
export const bindSurfaceDrag = <Message>(
  element: Element,
  handlers: SurfaceDragHandlers<Message>,
  send: (message: Message) => void,
): (() => void) => {
  let maybeActive: Option.Option<ActiveSequence> = Option.none()
  const thresholdPx = PointerDrag.thresholdPxOf({
    ...(handlers.thresholdPx === undefined
      ? {}
      : { thresholdPx: handlers.thresholdPx }),
  })

  const emitMaybe = (maybeMessage: Option.Option<Message>): void => {
    if (Option.isSome(maybeMessage)) {
      send(maybeMessage.value)
    }
  }

  const onDown = (raw: Event): void => {
    if (!(raw instanceof PointerEvent)) {
      return
    }
    if (raw.pointerType === 'mouse' && raw.button !== 0) {
      return
    }
    if (Option.isSome(maybeActive)) {
      return
    }
    if (handlers.isPreventingDefaultOnDown !== false && thresholdPx <= 0) {
      raw.preventDefault()
    }
    const domRect = element.getBoundingClientRect()
    const rect: PointerDrag.Rect = {
      x: domRect.left,
      y: domRect.top,
      width: domRect.width,
      height: domRect.height,
    }
    const isCaptured =
      thresholdPx <= 0 ? capturePointer(element, raw.pointerId) : false
    maybeActive = Option.some({
      pointerId: raw.pointerId,
      rect,
      startX: raw.clientX,
      startY: raw.clientY,
      isCaptured,
    })
    emitMaybe(handlers.onStart(sampleFromEvent(rect, raw)))
  }

  const onMove = (raw: Event): void => {
    if (!(raw instanceof PointerEvent) || Option.isNone(maybeActive)) {
      return
    }
    const active = maybeActive.value
    if (raw.pointerId !== active.pointerId) {
      return
    }
    if (!active.isCaptured && thresholdPx > 0) {
      const moved = Math.hypot(
        raw.clientX - active.startX,
        raw.clientY - active.startY,
      )
      if (moved >= thresholdPx) {
        maybeActive = Option.some({
          ...active,
          isCaptured: capturePointer(element, raw.pointerId),
        })
      }
    }
    emitMaybe(handlers.onMove(sampleFromEvent(active.rect, raw)))
  }

  const onUp = (raw: Event): void => {
    if (!(raw instanceof PointerEvent) || Option.isNone(maybeActive)) {
      return
    }
    const active = maybeActive.value
    if (raw.pointerId !== active.pointerId) {
      return
    }
    maybeActive = Option.none()
    emitMaybe(handlers.onEnd(sampleFromEvent(active.rect, raw)))
  }

  const onAbort = (raw: Event): void => {
    if (!(raw instanceof PointerEvent) || Option.isNone(maybeActive)) {
      return
    }
    const active = maybeActive.value
    if (raw.pointerId !== active.pointerId) {
      return
    }
    maybeActive = Option.none()
    const sample = sampleFromEvent(active.rect, raw)
    emitMaybe(
      handlers.onCancel !== undefined
        ? handlers.onCancel(sample)
        : handlers.onEnd(sample),
    )
  }

  element.addEventListener('pointerdown', onDown)
  element.addEventListener('pointermove', onMove)
  element.addEventListener('pointerup', onUp)
  element.addEventListener('pointercancel', onAbort)
  element.addEventListener('lostpointercapture', onAbort)

  return () => {
    maybeActive = Option.none()
    element.removeEventListener('pointerdown', onDown)
    element.removeEventListener('pointermove', onMove)
    element.removeEventListener('pointerup', onUp)
    element.removeEventListener('pointercancel', onAbort)
    element.removeEventListener('lostpointercapture', onAbort)
  }
}

/**
 * Creates a Foldkit `MountAction` wrapping {@link bindSurfaceDrag} for an
 * interactive 1D or 2D surface in `foldkit/html`.
 */
export const surfaceDragMount = <Message>(
  handlers: SurfaceDragHandlers<Message>,
): MountAction<Message> => ({
  name: handlers.name,
  f: element =>
    Stream.callback<Message>(queue =>
      Effect.acquireRelease(
        Effect.sync(() =>
          bindSurfaceDrag(element, handlers, message => {
            Queue.offerUnsafe(queue, message)
          }),
        ),
        unbind => Effect.sync(unbind),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
})
