import { Match as M, Option, Schema as S } from 'effect'

import { define, ignore, when } from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import {
  Device,
  type DeviceReason,
  Sampled,
  type Sync,
  Synced,
  defaultPace,
} from './pace.js'

// NOTE: this is the reusable framework-free `pointerDrag` block (Scribe #2654).
// It models pointer dragging as a pure Machine whose state (`Idle` |
// `Dragging`) lives in the Model and syncs move updates via `Pace.Sampled`
// (50 ms default) while start, commit, and cancel sync via `Pace.Synced`.
// Reused by Slider (#18), DragAndDrop (#22), FileDrop (#23), Drawer (#26),
// NumberInput (#32), ScrollArea (#40), Splitter (#41), AngleSlider (#42),
// ColorPicker (#43), Carousel (#44), FloatingPanel (#45), ImageCropper (#46),
// and SignaturePad (#47) without touching the DOM, timers, or any UI framework.

// SCHEMAS & CONSTANTS

/** Default pointer-move sync sampling window in milliseconds (`50`), taken from `Pace.defaultPace`. */
export const defaultSampleMs: number = defaultPace.dragSampleMs

/** Default drag activation distance threshold in pixels (`0`: activates immediately on pointer down). */
export const defaultThresholdPx = 0

/** Which coordinate axis a pointer drag tracks. */
export const DragAxis = S.Literals(['Horizontal', 'Vertical', 'Both'])
/** Which coordinate axis a pointer drag tracks. */
export type DragAxis = typeof DragAxis.Type

/** Reading direction for horizontal drags: in `Rtl`, horizontal progress runs right-to-left. */
export const DragDirection = S.Literals(['Ltr', 'Rtl'])
/** Reading direction for horizontal drags. */
export type DragDirection = typeof DragDirection.Type

/** A 2D pointer coordinate in a shared coordinate space (such as viewport client coordinates). */
export const Point = S.Struct({
  x: S.Number,
  y: S.Number,
})
/** A 2D pointer coordinate. */
export type Point = typeof Point.Type

/** A 2D bounding rectangle measured by a painter, in the same coordinate space as {@link Point}. */
export const Rect = S.Struct({
  x: S.Number,
  y: S.Number,
  width: S.Number,
  height: S.Number,
})
/** A 2D bounding rectangle measured by a painter. */
export type Rect = typeof Rect.Type

/** Pointer displacement from the drag start position (`current - start`). */
export const Delta = S.Struct({
  dx: S.Number,
  dy: S.Number,
})
/** Pointer displacement from the drag start position. */
export type Delta = typeof Delta.Type

/**
 * Read-only configuration supplied to the PointerDrag chart as its context.
 * Axis, threshold, direction, and sync pace stay out of the chart's state.
 */
export const Props = S.Struct({
  axis: S.optionalKey(DragAxis),
  thresholdPx: S.optionalKey(S.Number),
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  isInverted: S.optionalKey(S.Boolean),
  direction: S.optionalKey(DragDirection),
  sampleMs: S.optionalKey(S.Number),
})
/** Read-only configuration supplied to the PointerDrag chart. */
export type Props = typeof Props.Type

// STATE

/** No pointer drag is in progress. */
export const Idle = ts('Idle', {})
/** No pointer drag is in progress. */
export type Idle = typeof Idle.Type

/**
 * A pointer drag is active for `pointerId`, tracking start and current
 * coordinates, the `originValue` captured when the drag began (so Escape or
 * cancel can restore it), and whether movement has crossed `thresholdPx`.
 */
export const Dragging = ts('Dragging', {
  pointerId: S.Number,
  startX: S.Number,
  startY: S.Number,
  currentX: S.Number,
  currentY: S.Number,
  originValue: S.Number,
  isActivated: S.Boolean,
})
/** A pointer drag is active. */
export type Dragging = typeof Dragging.Type

/** Where a PointerDrag stands: `Idle` or `Dragging`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Dragging])
/** Where a PointerDrag stands. */
export type State = typeof State.Type

/** Initial PointerDrag state: idle. */
export const initial: State = Idle()

// MESSAGE

/** Begins tracking a pointer drag for `pointerId` at `(x, y)` with pre-drag `originValue`. */
export const StartDrag = m('StartDrag', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
  originValue: S.Number,
})

/**
 * Updates the active drag pointer to `(x, y)`. Ignored when idle or when
 * `pointerId` does not match the active pointer; synced via `Pace.Sampled`.
 */
export const MoveDrag = m('MoveDrag', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
})

/**
 * Commits the active drag and returns to `Idle`. When `pointerId` is provided,
 * ignores releases from other pointers.
 */
export const EndDrag = m('EndDrag', {
  pointerId: S.optionalKey(S.Number),
})

/**
 * Cancels the active drag (for example on Escape or pointercancel) and returns
 * to `Idle`, letting the owner restore `originValue`. When `pointerId` is
 * provided, ignores cancels from other pointers.
 */
export const CancelDrag = m('CancelDrag', {
  pointerId: S.optionalKey(S.Number),
})

/** Every Message the PointerDrag chart handles. */
export const Message = S.Union([StartDrag, MoveDrag, EndDrag, CancelDrag])
/** Every Message the PointerDrag chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the PointerDrag block. */
export const isMessage = S.is(Message)

// PURE HELPERS & MATH

/** True when dragging is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** True when dragging is read-only (`false` by default). */
export const isReadOnlyOf = (props: Pick<Props, 'isReadOnly'> = {}): boolean =>
  props.isReadOnly === true

/**
 * True when a drag interaction is permitted (neither disabled nor read-only).
 *
 * @example
 * ```typescript
 * canDrag({}) // true
 * canDrag({ isDisabled: true }) // false
 * canDrag({ isReadOnly: true }) // false
 * ```
 */
export const canDrag = (
  props: Pick<Props, 'isDisabled' | 'isReadOnly'> = {},
): boolean => !isDisabledOf(props) && !isReadOnlyOf(props)

/** Resolved drag axis (`'Horizontal'` by default). */
export const axisOf = (props: Pick<Props, 'axis'> = {}): DragAxis =>
  props.axis ?? 'Horizontal'

/** Resolved horizontal reading direction (`'Ltr'` by default). */
export const directionOf = (
  props: Pick<Props, 'direction'> = {},
): DragDirection => props.direction ?? 'Ltr'

/** True when axis polarity is inverted (`false` by default). */
export const isInvertedOf = (props: Pick<Props, 'isInverted'> = {}): boolean =>
  props.isInverted === true

/** Resolved non-negative activation threshold in pixels (`0` by default). */
export const thresholdPxOf = (props: Pick<Props, 'thresholdPx'> = {}): number =>
  Math.max(0, props.thresholdPx ?? defaultThresholdPx)

/** Resolved pointer-move sampling window in milliseconds (`50` by default). */
export const sampleMsOf = (props: Pick<Props, 'sampleMs'> = {}): number =>
  props.sampleMs ?? defaultSampleMs

/** True when a keyboard key cancels an active pointer drag (`'Escape'`). */
export const isCancelKey = (key: string): boolean => key === 'Escape'

/**
 * Clamps `value` into `[min, max]`, normalizing reversed bounds if `min > max`.
 *
 * @example
 * ```typescript
 * clampValue(120, 0, 100) // 100
 * clampValue(-5, 0, 100) // 0
 * clampValue(42, 0, 100) // 42
 * ```
 */
export const clampValue = (value: number, min: number, max: number): number => {
  const low = Math.min(min, max)
  const high = Math.max(min, max)
  return Math.min(Math.max(value, low), high)
}

/**
 * Counts decimal places needed to represent `step` cleanly without
 * floating-point drift, handling scientific notation such as `1e-7`.
 *
 * @example
 * ```typescript
 * decimalCountOf(1) // 0
 * decimalCountOf(0.05) // 2
 * decimalCountOf(1e-7) // 7
 * ```
 */
export const decimalCountOf = (step: number): number => {
  if (!Number.isFinite(step) || step <= 0) {
    return 0
  }
  const text = step.toString().toLowerCase()
  const exponentIndex = text.indexOf('e')
  if (exponentIndex >= 0) {
    const coefficient = text.slice(0, exponentIndex)
    const exponent = Number(text.slice(exponentIndex + 1))
    const dotIndex = coefficient.indexOf('.')
    const fractionalDigits =
      dotIndex >= 0 ? coefficient.length - dotIndex - 1 : 0
    return Math.max(0, fractionalDigits - exponent)
  } else {
    const dotIndex = text.indexOf('.')
    return dotIndex >= 0 ? text.length - dotIndex - 1 : 0
  }
}

/**
 * Rounds `value` to the decimal precision of `step` and normalizes `-0` to `0`.
 *
 * @example
 * ```typescript
 * roundToStepPrecision(0.30000000000000004, 0.1) // 0.3
 * ```
 */
export const roundToStepPrecision = (value: number, step: number): number => {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) {
    return Object.is(value, -0) ? 0 : value
  }
  const decimals = Math.min(20, decimalCountOf(step))
  const rounded = Number(value.toFixed(decimals))
  return Object.is(rounded, -0) ? 0 : rounded
}

/**
 * Snaps `value` to the nearest `step` grid anchored at `min`, clamps into
 * `[min, max]`, and rounds to `step`'s decimal precision to prevent
 * floating-point drift. Falls back to plain clamping when `step <= 0`.
 *
 * @example
 * ```typescript
 * snapToStep(3, 0, 10, 2) // 4
 * snapToStep(0.3, 0, 1, 0.1) // 0.3
 * snapToStep(99, 0, 10, 1) // 10
 * ```
 */
export const snapToStep = (
  value: number,
  min: number,
  max: number,
  step: number,
): number => {
  if (!Number.isFinite(step) || step <= 0) {
    return clampValue(value, min, max)
  }
  const snapped = min + Math.round((value - min) / step) * step
  return roundToStepPrecision(clampValue(snapped, min, max), step)
}

/**
 * Maps a 1D coordinate `position` inside `[start, start + size]` into a
 * clamped `[0, 1]` fraction, flipping to `1 - fraction` when `isInverted` is
 * `true`. Returns `0` when `size <= 0`.
 *
 * @example
 * ```typescript
 * fractionFromRange(50, 0, 100) // 0.5
 * fractionFromRange(25, 0, 100, true) // 0.75
 * ```
 */
export const fractionFromRange = (
  position: number,
  start: number,
  size: number,
  isInverted: boolean = false,
): number => {
  if (size <= 0) {
    return 0
  }
  const raw = clampValue((position - start) / size, 0, 1)
  return isInverted ? 1 - raw : raw
}

/**
 * Maps a 2D pointer `point` within a painter-measured `rect` into a clamped
 * `[0, 1]` fraction along `axis` (`'Horizontal'` by default), honoring `direction`
 * (`'Rtl'` flips horizontal) and `isInverted`.
 *
 * On `'Vertical'`, natural screen coordinates run top (`0`) to bottom (`1`);
 * pass `isInverted: true` for controls whose vertical value grows bottom-to-top
 * (such as a vertical slider).
 *
 * @example
 * ```typescript
 * fractionFromPoint({ x: 150, y: 10 }, { x: 100, y: 0, width: 200, height: 20 }) // 0.25
 * fractionFromPoint({ x: 150, y: 10 }, { x: 100, y: 0, width: 200, height: 20 }, { direction: 'Rtl' }) // 0.75
 * ```
 */
export const fractionFromPoint = (
  point: Point,
  rect: Rect,
  options: Readonly<{
    axis?: 'Horizontal' | 'Vertical'
    direction?: DragDirection
    isInverted?: boolean
  }> = {},
): number => {
  const axis = options.axis ?? 'Horizontal'
  if (axis === 'Vertical') {
    return fractionFromRange(
      point.y,
      rect.y,
      rect.height,
      options.isInverted === true,
    )
  } else {
    const isReversed =
      (options.direction === 'Rtl') !== (options.isInverted === true)
    return fractionFromRange(point.x, rect.x, rect.width, isReversed)
  }
}

/**
 * Maps a 2D pointer `point` within `rect` into clamped `[0, 1]` fractions on
 * both axes (`{ x, y }`), for 2D draggable surfaces such as color areas, image
 * croppers, floating panels, and signature pads.
 *
 * @example
 * ```typescript
 * fractionsFromPoint({ x: 50, y: 25 }, { x: 0, y: 0, width: 100, height: 100 }) // { x: 0.5, y: 0.25 }
 * ```
 */
export const fractionsFromPoint = (
  point: Point,
  rect: Rect,
  options: Readonly<{
    direction?: DragDirection
    isInvertedX?: boolean
    isInvertedY?: boolean
  }> = {},
): Point => ({
  x: fractionFromPoint(point, rect, {
    axis: 'Horizontal',
    ...(options.direction === undefined
      ? {}
      : { direction: options.direction }),
    ...(options.isInvertedX === undefined
      ? {}
      : { isInverted: options.isInvertedX }),
  }),
  y: fractionFromPoint(point, rect, {
    axis: 'Vertical',
    ...(options.isInvertedY === undefined
      ? {}
      : { isInverted: options.isInvertedY }),
  }),
})

/**
 * Converts a `[0, 1]` `fraction` into a value within `[min, max]`, optionally
 * snapping to `step` when a positive `step` is provided.
 *
 * @example
 * ```typescript
 * valueFromFraction(0.5, 0, 100) // 50
 * valueFromFraction(0.24, 0, 100, 10) // 20
 * ```
 */
export const valueFromFraction = (
  fraction: number,
  min: number,
  max: number,
  step?: number,
): number => {
  const clampedFraction = clampValue(fraction, 0, 1)
  const raw = min + clampedFraction * (max - min)
  return step !== undefined && step > 0
    ? snapToStep(raw, min, max, step)
    : clampValue(raw, min, max)
}

/**
 * Converts `value` within `[min, max]` into a clamped `[0, 1]` fraction.
 * Returns `0` when `max <= min`.
 *
 * @example
 * ```typescript
 * fractionFromValue(5, 0, 10) // 0.5
 * fractionFromValue(0, -10, 10) // 0.5
 * fractionFromValue(5, 5, 5) // 0
 * ```
 */
export const fractionFromValue = (
  value: number,
  min: number,
  max: number,
): number => {
  const range = max - min
  if (range <= 0) {
    return 0
  } else {
    return clampValue((value - min) / range, 0, 1)
  }
}

/**
 * Moves `value` by `delta`, snapping to `step` anchored at `min` and clamping
 * into `[min, max]`.
 *
 * @example
 * ```typescript
 * stepValue(0.2, 0.1, 0, 1, 0.1) // 0.3
 * stepValue(10, 1, 0, 10, 1) // 10
 * ```
 */
export const stepValue = (
  value: number,
  delta: number,
  min: number,
  max: number,
  step: number,
): number => snapToStep(value + delta, min, max, step)

/** Unsigned movement distance along `axis` (`|dx|`, `|dy|`, or Euclidean `hypot`). */
export const distanceAlongAxis = (
  dx: number,
  dy: number,
  axis: DragAxis = 'Horizontal',
): number =>
  M.value(axis).pipe(
    M.withReturnType<number>(),
    M.when('Horizontal', () => Math.abs(dx)),
    M.when('Vertical', () => Math.abs(dy)),
    M.when('Both', () => Math.hypot(dx, dy)),
    M.exhaustive,
  )

// READINGS

/** True while `state` is `Idle`. */
export const isIdle = (state: State): boolean => state._tag === 'Idle'

/** True while `state` is `Dragging`. */
export const isDragging = (state: State): boolean => state._tag === 'Dragging'

/** True while `state` is `Dragging` and pointer movement has crossed `thresholdPx`. */
export const isActivated = (state: State): boolean =>
  state._tag === 'Dragging' && state.isActivated

/** Active pointer identifier while `Dragging`, or none while `Idle`. */
export const pointerIdOf = (state: State): Option.Option<number> =>
  state._tag === 'Dragging' ? Option.some(state.pointerId) : Option.none()

/** Pre-drag origin value captured at `StartDrag` while `Dragging`, or none while `Idle`. */
export const originValueOf = (state: State): Option.Option<number> =>
  state._tag === 'Dragging' ? Option.some(state.originValue) : Option.none()

/**
 * Pointer displacement `{ dx, dy }` from the drag start point while `Dragging`,
 * or `{ dx: 0, dy: 0 }` while `Idle`.
 *
 * @example
 * ```typescript
 * deltaOf(Idle()) // { dx: 0, dy: 0 }
 * ```
 */
export const deltaOf = (state: State): Delta =>
  M.value(state).pipe(
    M.withReturnType<Delta>(),
    M.tagsExhaustive({
      Idle: () => ({ dx: 0, dy: 0 }),
      Dragging: ({ startX, startY, currentX, currentY }) => ({
        dx: currentX - startX,
        dy: currentY - startY,
      }),
    }),
  )

/**
 * Signed scalar displacement along `props.axis`, honoring `direction` (`Rtl`
 * negates horizontal) and `isInverted`. Returns Euclidean magnitude on `'Both'`
 * and `0` while `Idle`.
 */
export const axisDeltaOf = (
  state: State,
  props: Pick<Props, 'axis' | 'direction' | 'isInverted'> = {},
): number => {
  if (state._tag === 'Idle') {
    return 0
  }
  const { dx, dy } = deltaOf(state)
  const axis = axisOf(props)
  return M.value(axis).pipe(
    M.withReturnType<number>(),
    M.when('Horizontal', () => {
      const sign = (directionOf(props) === 'Rtl') !== isInvertedOf(props)
      return sign ? -dx : dx
    }),
    M.when('Vertical', () => (isInvertedOf(props) ? -dy : dy)),
    M.when('Both', () => Math.hypot(dx, dy)),
    M.exhaustive,
  )
}

/** Unsigned displacement distance along `axis` (`0` while `Idle`). */
export const distanceOf = (
  state: State,
  axis: DragAxis = 'Horizontal',
): number => {
  const { dx, dy } = deltaOf(state)
  return distanceAlongAxis(dx, dy, axis)
}

// SYNC & REST

/**
 * Builds the PointerDrag sync table using `Pace.Sampled({ everyMs })` on
 * `MoveDrag` (default 50 ms, twenty updates a second at most) and
 * `Pace.Synced()` on `StartDrag`, `EndDrag`, and `CancelDrag`.
 *
 * @example
 * ```typescript
 * syncOf(50).MoveDrag // Sampled({ everyMs: 50 })
 * syncOf(50).EndDrag // Synced()
 * ```
 */
export const syncOf = (
  sampleMs: number = defaultSampleMs,
): Readonly<Record<Message['_tag'], Sync>> => ({
  StartDrag: Synced(),
  MoveDrag: Sampled({ everyMs: sampleMs }),
  EndDrag: Synced(),
  CancelDrag: Synced(),
})

/** Default PointerDrag sync table (`MoveDrag` at `Sampled({ everyMs: 50 })`). */
export const synced: Readonly<Record<Message['_tag'], Sync>> = syncOf()

/** Device-only sync table for a drag kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'InputInProgress',
): Readonly<Record<Message['_tag'], Sync>> => ({
  StartDrag: Device({ because }),
  MoveDrag: Device({ because }),
  EndDrag: Device({ because }),
  CancelDrag: Device({ because }),
})

/**
 * Returns the {@link Sync} pace for one PointerDrag Message under `props`
 * (`Pace.Sampled({ everyMs })` on `MoveDrag`, `Pace.Synced()` on start/commit/cancel).
 *
 * @example
 * ```typescript
 * paceOf(MoveDrag({ pointerId: 1, x: 20, y: 0 })) // Sampled({ everyMs: 50 })
 * paceOf(MoveDrag({ pointerId: 1, x: 20, y: 0 }), { sampleMs: 100 }) // Sampled({ everyMs: 100 })
 * paceOf(EndDrag()) // Synced()
 * ```
 */
export const paceOf = (
  message: Message,
  props: Pick<Props, 'sampleMs'> = {},
): Sync => syncOf(sampleMsOf(props))[message._tag]

/**
 * What a restart opens PointerDrag on: always `Idle()`, so a restored or
 * rehydrated session never reopens mid-drag.
 */
export const atRest = (_state: State): Idle => Idle()

// CHART

const isMatchingPointer = (
  activePointerId: number,
  incomingPointerId: number | undefined,
): boolean =>
  incomingPointerId === undefined || incomingPointerId === activePointerId

/**
 * Builds the PointerDrag Machine chart starting in `initialState`:
 * - `StartDrag`: enters `Dragging` when interactive (`isActivated: true`
 *   immediately when `thresholdPx <= 0`). Ignored if already `Dragging`.
 * - `MoveDrag`: updates `currentX` / `currentY` only for the active
 *   `pointerId`, flipping `isActivated` to `true` once movement crosses
 *   `thresholdPx` along `axis`. Synced via `Pace.Sampled`.
 * - `EndDrag`: returns to `Idle` when `pointerId` matches (or is omitted).
 * - `CancelDrag`: returns to `Idle` when `pointerId` matches (or is omitted),
 *   so the owner can restore `originValue` (for example on Escape).
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Idle: {
        on: {
          StartDrag: [
            when(
              (_state, _message, context) => canDrag(context),
              'Dragging',
              ({ message, context }) =>
                Dragging({
                  pointerId: message.pointerId,
                  startX: message.x,
                  startY: message.y,
                  currentX: message.x,
                  currentY: message.y,
                  originValue: message.originValue,
                  isActivated: thresholdPxOf(context) <= 0,
                }),
            ),
            ignore(),
          ],
          MoveDrag: [ignore()],
          EndDrag: [ignore()],
          CancelDrag: [ignore()],
        },
      },
      Dragging: {
        on: {
          StartDrag: [ignore()],
          MoveDrag: [
            when(
              (state, message, context) =>
                canDrag(context) && message.pointerId === state.pointerId,
              'Dragging',
              ({ state, message, context }) => {
                const movedDistance = distanceAlongAxis(
                  message.x - state.startX,
                  message.y - state.startY,
                  axisOf(context),
                )
                return Dragging({
                  pointerId: state.pointerId,
                  startX: state.startX,
                  startY: state.startY,
                  currentX: message.x,
                  currentY: message.y,
                  originValue: state.originValue,
                  isActivated:
                    state.isActivated ||
                    movedDistance >= thresholdPxOf(context),
                })
              },
            ),
            ignore(),
          ],
          EndDrag: [
            when(
              (state, message) =>
                isMatchingPointer(state.pointerId, message.pointerId),
              'Idle',
              () => Idle(),
            ),
            ignore(),
          ],
          CancelDrag: [
            when(
              (state, message) =>
                isMatchingPointer(state.pointerId, message.pointerId),
              'Idle',
              () => Idle(),
            ),
            ignore(),
          ],
        },
      },
    },
  })

/** The default PointerDrag Machine chart starting in `Idle()`. */
export const chart = chartOf(initial)
