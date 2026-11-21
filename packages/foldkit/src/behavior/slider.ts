import { Array, Match as M, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import {
  type GuardedEdge,
  define,
  ignore,
  to,
  when,
} from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import {
  Device,
  type DeviceReason,
  Sampled,
  Step,
  type Sync,
  Synced,
  defaultPace,
} from './pace.js'
import * as Part from './part.js'
import * as PointerDrag from './pointerDrag.js'
import { SlotOrientation, type SlotProps } from './slot.js'

// NOTE: this is the core Slider Part (Widget #18 of 54, Scribe #2654).
// It composes `PointerDrag` into one framework-free Machine and Part
// declaration covering packages/ui Slider, Zag slider, and Radix slider.
// Its state (`Idle` | `Focused` | `Dragging`) lives in the Model, synced by
// default (`Domain` category) using `Pace.Sampled` on drag moves (50 ms
// default) and `Pace.Synced` on discrete steps, commits, and cancels, with
// `Slider.make` and `Slider.deviceOnly()` options. Reference-stable
// SlotBindings (`Root`, `Track`, `Range`, `Thumb`, `Label`) project generic
// `Slider` role and value ARIA (`aria-valuemin`, `aria-valuemax`,
// `aria-valuenow`, `aria-valuetext`) across HTML, React, and React Native
// generic hosts with zero Slider-specific painter logic.

// SCHEMAS & CONSTANTS

/** Default minimum slider value (`0`). */
export const defaultMin = 0

/** Default maximum slider value (`100`). */
export const defaultMax = 100

/** Default single-step increment (`1`). */
export const defaultStep = 1

/** Default multiplier applied to `step` for PageUp / PageDown and Shift+Arrow (`10`). */
export const defaultLargeStepMultiplier = 10

/** Default minimum steps enforced between adjacent thumbs (`0`). */
export const defaultMinStepsBetweenThumbs = 0

/** Default pointer-move sync sampling window in milliseconds (`50`). */
export const defaultSampleMs: number = PointerDrag.defaultSampleMs

/** Slider track orientation (`Horizontal` or `Vertical`). */
export const Orientation = SlotOrientation
/** Slider track orientation. */
export type Orientation = typeof Orientation.Type

/** Default slider orientation (`'Horizontal'`). */
export const defaultOrientation: Orientation = 'Horizontal'

/** Horizontal reading direction (`Ltr` or `Rtl`). */
export const Direction = PointerDrag.DragDirection
/** Horizontal reading direction. */
export type Direction = typeof Direction.Type

/** Default horizontal reading direction (`'Ltr'`). */
export const defaultDirection: Direction = 'Ltr'

/** Discrete keyboard navigation commands supported by a slider thumb. */
export const NavigationDirection = S.Literals([
  'StepDecrement',
  'StepIncrement',
  'PageDecrement',
  'PageIncrement',
  'Min',
  'Max',
])
/** Discrete keyboard navigation commands supported by a slider thumb. */
export type NavigationDirection = typeof NavigationDirection.Type

/**
 * How thumbs behave when dragged against an adjacent thumb in a multi-thumb slider:
 * - `None` (default): stops at the neighbor's boundary (respecting `minStepsBetweenThumbs`).
 * - `Push`: pushes colliding neighbors along the track while preserving minimum gap.
 * - `Swap`: crosses over the neighbor and swaps active thumb index.
 */
export const ThumbCollisionBehavior = S.Literals(['None', 'Push', 'Swap'])
/** How thumbs behave when dragged against an adjacent thumb. */
export type ThumbCollisionBehavior = typeof ThumbCollisionBehavior.Type

/**
 * Read-only props supplied to the Slider chart and projection from the
 * Program's Model. Bounds, step sizes, orientation, and accessibility linkage
 * stay out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  min: S.optionalKey(S.Number),
  max: S.optionalKey(S.Number),
  step: S.optionalKey(S.Number),
  largeStep: S.optionalKey(S.Number),
  minStepsBetweenThumbs: S.optionalKey(S.Number),
  thumbCollisionBehavior: S.optionalKey(ThumbCollisionBehavior),
  orientation: S.optionalKey(Orientation),
  direction: S.optionalKey(Direction),
  isInverted: S.optionalKey(S.Boolean),
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  isInvalid: S.optionalKey(S.Boolean),
  thresholdPx: S.optionalKey(S.Number),
  sampleMs: S.optionalKey(S.Number),
  defaultValues: S.optionalKey(S.Array(S.Number)),
  label: S.optionalKey(S.String),
  thumbLabels: S.optionalKey(S.Array(S.String)),
  hasLabel: S.optionalKey(S.Boolean),
  labelledBy: S.optionalKey(S.String),
  describedBy: S.optionalKey(S.String),
  valueText: S.optionalKey(S.String),
  valueTexts: S.optionalKey(S.Array(S.String)),
  name: S.optionalKey(S.String),
  form: S.optionalKey(S.String),
})
/** Read-only props supplied to the Slider chart and projection. */
export type Props = typeof Props.Type

/** Effective movable `[min, max]` bounds for one slider thumb. */
export type ThumbBounds = Readonly<{
  min: number
  max: number
}>

/** Normalized `[start, end]` fractions (`0..1`) spanned by the filled range bar. */
export type RangeFractions = Readonly<{
  start: number
  end: number
}>

// STATE

/** The slider is at rest, holding its thumb `values` and an idle `PointerDrag`. */
export const Idle = ts('Idle', {
  values: S.Array(S.Number),
  drag: PointerDrag.Idle,
})
/** The slider is at rest. */
export type Idle = typeof Idle.Type

/** A slider thumb at `focusedIndex` holds focus for keyboard adjustments. */
export const Focused = ts('Focused', {
  values: S.Array(S.Number),
  focusedIndex: S.Number,
  drag: PointerDrag.Idle,
})
/** A slider thumb holds focus. */
export type Focused = typeof Focused.Type

/**
 * A slider thumb at `activeThumbIndex` is being dragged by a pointer,
 * capturing `originValues` so Escape or cancel restores every thumb.
 */
export const Dragging = ts('Dragging', {
  values: S.Array(S.Number),
  activeThumbIndex: S.Number,
  originValues: S.Array(S.Number),
  drag: PointerDrag.Dragging,
})
/** A slider thumb is being dragged. */
export type Dragging = typeof Dragging.Type

/** Where a Slider Part stands: `Idle`, `Focused`, or `Dragging`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Focused, Dragging])
/** Where a Slider Part stands. */
export type State = typeof State.Type

/** Initial Slider state: single thumb at `0`, idle. */
export const initial: State = Idle({
  values: [defaultMin],
  drag: PointerDrag.Idle(),
})

/** Creates an initial idle single-thumb Slider state holding `value`. */
export const initialValue = (value: number): State =>
  Idle({
    values: [value],
    drag: PointerDrag.Idle(),
  })

/** Creates an initial idle Slider state holding `values` (falling back to `[0]` if empty). */
export const initialValues = (values: ReadonlyArray<number>): State =>
  Idle({
    values: Array.isReadonlyArrayEmpty(values) ? [defaultMin] : values,
    drag: PointerDrag.Idle(),
  })

// ACTIONS (Catalog Actions — what a person or agent does on purpose)

/** Sets a slider thumb (active thumb or `thumbIndex`) to `value`, snapped and clamped. */
export const SetSliderValue = Catalog.action('SetSliderValue', {
  fields: {
    value: S.Number,
    thumbIndex: S.optionalKey(S.Number),
  },
  choose: {
    field: 'value',
    noun: 'value',
    prompt: 'Set slider to which value?',
    token: S.FiniteFromString,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'Enter a numeric value',
  },
  what: 'Sets a slider thumb to the chosen numeric value',
  why: 'To move the control directly to a specific level',
  meta: { label: 'Set value', keys: [] },
})

/** Replaces all slider thumb values at once, normalized to range and minimum gap. */
export const SetSliderValues = Catalog.action('SetSliderValues', {
  fields: { values: S.Array(S.Number) },
  what: 'Replaces every slider thumb value at once',
  why: 'To position a full single or multi-thumb range together',
  meta: { label: 'Set values', keys: [] },
})

/** Moves a slider thumb by one step, page, or bound (`StepIncrement`, `StepDecrement`, `PageIncrement`, `PageDecrement`, `Min`, `Max`). */
export const StepSlider = Catalog.action('StepSlider', {
  fields: {
    direction: NavigationDirection,
    thumbIndex: S.optionalKey(S.Number),
  },
  choose: {
    field: 'direction',
    noun: 'direction',
    prompt: 'Move the slider in which direction?',
    token: NavigationDirection,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'Choose a navigation direction',
  },
  what: 'Moves the active slider thumb by one step, page, or bound',
  why: 'To adjust the level incrementally or jump to an endpoint',
  meta: { label: 'Step slider', keys: [] },
})

/** Moves focus onto the slider thumb at `thumbIndex`. */
export const FocusSliderThumb = Catalog.action('FocusSliderThumb', {
  fields: { thumbIndex: S.Number },
  choose: {
    field: 'thumbIndex',
    noun: 'thumb',
    prompt: 'Focus which thumb?',
    token: S.FiniteFromString.pipe(S.decodeTo(S.Int)),
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No thumb is available',
  },
  what: 'Moves focus onto the chosen slider thumb',
  why: 'To target that thumb for subsequent adjustments',
  meta: { label: 'Focus thumb', keys: [] },
})

/** Restores every slider thumb to `props.defaultValues` (or `[min]`) and returns to `Idle`. */
export const ResetSlider = Catalog.action('ResetSlider', {
  what: 'Restores the slider thumbs to their starting values',
  why: 'To undo adjustments and return to defaults',
  meta: { label: 'Reset slider', keys: [] },
})

/** The Catalog Actions a Slider Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  SetSliderValue,
  SetSliderValues,
  StepSlider,
  FocusSliderThumb,
  ResetSlider,
]

// MESSAGES (Facts in addition to the Actions above)

/**
 * A pointer went down directly on the thumb at `thumbIndex`. Starts a drag
 * without shifting the value, absorbing any bubbled `PressSliderTrack`.
 */
export const BeginThumbDrag = m('BeginThumbDrag', {
  thumbIndex: S.Number,
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
})

/**
 * A pointer went down on the slider track at `value`. Picks the nearest
 * movable thumb, snaps it to `value`, and starts dragging it. Ignored when
 * already `Dragging` so a bubbled thumb press cannot shift the value.
 */
export const PressSliderTrack = m('PressSliderTrack', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
  value: S.Number,
})

/**
 * The active drag pointer moved to `(x, y)` corresponding to track `value`.
 * Synced via `Pace.Sampled` (50 ms default). Ignored for non-matching pointers.
 */
export const MoveSliderDrag = m('MoveSliderDrag', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
  value: S.Number,
})

/** The active drag pointer was released, committing the current values and focusing the dragged thumb. */
export const ReleaseSliderDrag = m('ReleaseSliderDrag', {
  pointerId: S.optionalKey(S.Number),
})

/** The active drag was cancelled (Escape or pointercancel), restoring pre-drag `originValues`. */
export const CancelSliderDrag = m('CancelSliderDrag', {
  pointerId: S.optionalKey(S.Number),
})

/** Focus left the slider thumb. */
export const BlurSlider = m('BlurSlider')

/** A keyboard key was pressed while interacting with the slider (navigation keys or Escape while dragging). */
export const PressedSliderKey = m('PressedSliderKey', {
  key: S.String,
  isShift: S.optionalKey(S.Boolean),
  thumbIndex: S.optionalKey(S.Number),
})

/** Every Message the Slider chart handles. */
export const Message = S.Union([
  SetSliderValue,
  SetSliderValues,
  StepSlider,
  FocusSliderThumb,
  ResetSlider,
  BeginThumbDrag,
  PressSliderTrack,
  MoveSliderDrag,
  ReleaseSliderDrag,
  CancelSliderDrag,
  BlurSlider,
  PressedSliderKey,
])
/** Every Message the Slider chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Slider Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the slider root element id from a base `id`. */
export const rootId = (id: string): string => `${id}-root`

/** Derives the slider track element id from a base `id`. */
export const trackId = (id: string): string => `${id}-track`

/** Derives the slider filled range element id from a base `id`. */
export const rangeId = (id: string): string => `${id}-range`

/** Derives the slider label element id from a base `id`. */
export const labelId = (id: string): string => `${id}-label`

/**
 * Derives a slider thumb element id from a base `id` and optional `index`.
 * Omits the numeric suffix when `index` is omitted (`'volume-thumb'`), and
 * appends `-{index}` for indexed multi-thumb slots (`'price-thumb-0'`).
 */
export const thumbId = (id: string, index?: number): string =>
  index === undefined ? `${id}-thumb` : `${id}-thumb-${index.toString()}`

/** Derives a slider hidden form input element id from a base `id` and optional `index`. */
export const hiddenInputId = (id: string, index?: number): string =>
  index === undefined ? `${id}-input` : `${id}-input-${index.toString()}`

// PURE CONFIGURATION READERS

/** Resolved minimum bound (`0` by default). */
export const minOf = (props: Pick<Props, 'min'> = {}): number =>
  props.min ?? defaultMin

/** Resolved maximum bound (`100` by default). */
export const maxOf = (props: Pick<Props, 'max'> = {}): number =>
  props.max ?? defaultMax

/** Resolved step size (`1` by default). */
export const stepOf = (props: Pick<Props, 'step'> = {}): number =>
  props.step ?? defaultStep

/** Resolved large step size for PageUp / PageDown and Shift+Arrow (`10 * step` by default). */
export const largeStepOf = (
  props: Pick<Props, 'step' | 'largeStep'> = {},
): number => props.largeStep ?? stepOf(props) * defaultLargeStepMultiplier

/** Resolved minimum steps between adjacent thumbs (`0` by default). */
export const minStepsBetweenThumbsOf = (
  props: Pick<Props, 'minStepsBetweenThumbs'> = {},
): number =>
  Math.max(0, props.minStepsBetweenThumbs ?? defaultMinStepsBetweenThumbs)

/** Resolved thumb collision policy (`'None'` by default). */
export const collisionBehaviorOf = (
  props: Pick<Props, 'thumbCollisionBehavior'> = {},
): ThumbCollisionBehavior => props.thumbCollisionBehavior ?? 'None'

/** Resolved track orientation (`'Horizontal'` by default). */
export const orientationOf = (
  props: Pick<Props, 'orientation'> = {},
): Orientation => props.orientation ?? defaultOrientation

/** Resolved horizontal reading direction (`'Ltr'` by default). */
export const directionOf = (props: Pick<Props, 'direction'> = {}): Direction =>
  props.direction ?? defaultDirection

/** True when track direction is inverted (`false` by default). */
export const isInvertedOf = (props: Pick<Props, 'isInverted'> = {}): boolean =>
  props.isInverted === true

/** True when the slider is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** True when the slider is read-only (`false` by default). */
export const isReadOnlyOf = (props: Pick<Props, 'isReadOnly'> = {}): boolean =>
  props.isReadOnly === true

/** True when the slider is invalid (`false` by default). */
export const isInvalidOf = (props: Pick<Props, 'isInvalid'> = {}): boolean =>
  props.isInvalid === true

/** True when user interaction can change slider values (neither disabled nor read-only). */
export const canInteract = (
  props: Pick<Props, 'isDisabled' | 'isReadOnly'> = {},
): boolean => !isDisabledOf(props) && !isReadOnlyOf(props)

/** Resolved pointer-move sync sample window in milliseconds (`50` by default). */
export const sampleMsOf = (props: Pick<Props, 'sampleMs'> = {}): number =>
  props.sampleMs ?? defaultSampleMs

/** Projects `Slider.Props` onto the underlying {@link PointerDrag.Props}. */
export const dragPropsOf = (props: Props): PointerDrag.Props => ({
  axis: orientationOf(props),
  direction: directionOf(props),
  isInverted: isInvertedOf(props),
  ...(props.thresholdPx === undefined
    ? {}
    : { thresholdPx: props.thresholdPx }),
  ...(props.isDisabled === undefined ? {} : { isDisabled: props.isDisabled }),
  ...(props.isReadOnly === undefined ? {} : { isReadOnly: props.isReadOnly }),
  ...(props.sampleMs === undefined ? {} : { sampleMs: props.sampleMs }),
})

// PURE GEOMETRY, MATH & KEYBOARD RULES

const clampIndex = (index: number, length: number): number =>
  length <= 0 ? 0 : Math.min(Math.max(Math.trunc(index), 0), length - 1)

const valueAt = (
  values: ReadonlyArray<number>,
  index: number,
  props: Pick<Props, 'min'> = {},
): number => Option.getOrElse(Array.get(values, index), () => minOf(props))

/**
 * Effective `[min, max]` movable bounds for the thumb at `index`, constrained
 * by neighboring thumbs and `minStepsBetweenThumbs * step`. For a single-thumb
 * slider this equals `{ min, max }`.
 *
 * @example
 * ```typescript
 * thumbBoundsAt([20, 80], 0, { min: 0, max: 100, step: 1, minStepsBetweenThumbs: 10 })
 * // { min: 0, max: 70 }
 * ```
 */
export const thumbBoundsAt = (
  values: ReadonlyArray<number>,
  index: number,
  props: Pick<Props, 'min' | 'max' | 'step' | 'minStepsBetweenThumbs'> = {},
): ThumbBounds => {
  const min = minOf(props)
  const max = maxOf(props)
  const step = stepOf(props)
  if (values.length <= 1) {
    return { min, max }
  }
  const safeIndex = clampIndex(index, values.length)
  const gap = minStepsBetweenThumbsOf(props) * step
  const maybePrev =
    safeIndex > 0 ? Array.get(values, safeIndex - 1) : Option.none<number>()
  const maybeNext =
    safeIndex + 1 < values.length
      ? Array.get(values, safeIndex + 1)
      : Option.none<number>()
  const thumbMin = Option.match(maybePrev, {
    onNone: () => min,
    onSome: prev =>
      PointerDrag.clampValue(
        PointerDrag.roundToStepPrecision(prev + gap, step),
        min,
        max,
      ),
  })
  const thumbMax = Option.match(maybeNext, {
    onNone: () => max,
    onSome: next =>
      PointerDrag.clampValue(
        PointerDrag.roundToStepPrecision(next - gap, step),
        min,
        max,
      ),
  })
  return {
    min: thumbMin,
    max: Math.max(thumbMin, thumbMax),
  }
}

/**
 * Snaps, clamps, and orders `values` into valid slider positions respecting
 * `min`, `max`, `step`, and `minStepsBetweenThumbs`.
 *
 * @example
 * ```typescript
 * normalizeValues([50, 52], { min: 0, max: 100, step: 1, minStepsBetweenThumbs: 10 })
 * // [50, 60]
 * ```
 */
export const normalizeValues = (
  values: ReadonlyArray<number>,
  props: Pick<Props, 'min' | 'max' | 'step' | 'minStepsBetweenThumbs'> = {},
): ReadonlyArray<number> => {
  const min = minOf(props)
  const max = maxOf(props)
  const step = stepOf(props)
  if (Array.isReadonlyArrayEmpty(values)) {
    return [PointerDrag.snapToStep(min, min, max, step)]
  }
  const gap = minStepsBetweenThumbsOf(props) * step
  const count = values.length
  const normalized: Array<number> = []
  for (let index = 0; index < count; index += 1) {
    const raw = valueAt(values, index, props)
    const snapped = PointerDrag.snapToStep(raw, min, max, step)
    const prev = index > 0 ? normalized[index - 1] : undefined
    const low =
      prev === undefined
        ? min
        : PointerDrag.roundToStepPrecision(prev + gap, step)
    const high = Math.max(
      low,
      PointerDrag.roundToStepPrecision(max - (count - 1 - index) * gap, step),
    )
    normalized.push(
      PointerDrag.roundToStepPrecision(
        PointerDrag.clampValue(snapped, low, high),
        step,
      ),
    )
  }
  return normalized
}

/**
 * Selects the index of the movable thumb closest to `targetValue`. When thumbs
 * are stacked on the same position, picks the thumb free to move toward
 * `targetValue` (or away from `max` when stacked at the upper bound).
 *
 * @example
 * ```typescript
 * closestThumbIndex([20, 80], 70, { min: 0, max: 100 }) // 1
 * closestThumbIndex([50, 50], 70, { min: 0, max: 100 }) // 1
 * closestThumbIndex([50, 50], 30, { min: 0, max: 100 }) // 0
 * ```
 */
export const closestThumbIndex = (
  values: ReadonlyArray<number>,
  targetValue: number,
  props: Pick<Props, 'min' | 'max'> = {},
): number => {
  if (values.length <= 1) {
    return 0
  }
  const max = maxOf(props)
  let bestIndex = 0
  let bestDistance = Math.abs(valueAt(values, 0, props) - targetValue)
  for (let index = 1; index < values.length; index += 1) {
    const candidateValue = valueAt(values, index, props)
    const distance = Math.abs(candidateValue - targetValue)
    const isCloser = distance < bestDistance
    const isTiePreferLater =
      distance === bestDistance && targetValue >= candidateValue
    if (isCloser || isTiePreferLater) {
      bestIndex = index
      bestDistance = distance
    }
  }
  const chosenValue = valueAt(values, bestIndex, props)
  if (chosenValue === max && targetValue <= max) {
    let movable = bestIndex
    while (movable > 0 && valueAt(values, movable - 1, props) === max) {
      movable -= 1
    }
    return movable
  }
  return bestIndex
}

type ResolvedThumbUpdate = Readonly<{
  values: ReadonlyArray<number>
  activeIndex: number
}>

const replaceAt = (
  values: ReadonlyArray<number>,
  index: number,
  nextValue: number,
): ReadonlyArray<number> =>
  Array.map(values, (existing, current) =>
    current === index ? nextValue : existing,
  )

const resolveNoneCollision = (
  values: ReadonlyArray<number>,
  index: number,
  snapped: number,
  props: Pick<Props, 'min' | 'max' | 'step' | 'minStepsBetweenThumbs'>,
): ResolvedThumbUpdate => {
  const step = stepOf(props)
  const bounds = thumbBoundsAt(values, index, props)
  const clamped = PointerDrag.roundToStepPrecision(
    PointerDrag.clampValue(snapped, bounds.min, bounds.max),
    step,
  )
  return { values: replaceAt(values, index, clamped), activeIndex: index }
}

const resolvePushCollision = (
  values: ReadonlyArray<number>,
  index: number,
  snapped: number,
  props: Pick<Props, 'min' | 'max' | 'step' | 'minStepsBetweenThumbs'>,
): ResolvedThumbUpdate => {
  const min = minOf(props)
  const max = maxOf(props)
  const step = stepOf(props)
  const gap = minStepsBetweenThumbsOf(props) * step
  const next: Array<number> = [...values]
  const absoluteMin = PointerDrag.roundToStepPrecision(min + index * gap, step)
  const absoluteMax = PointerDrag.roundToStepPrecision(
    max - (values.length - 1 - index) * gap,
    step,
  )
  next[index] = PointerDrag.roundToStepPrecision(
    PointerDrag.clampValue(snapped, absoluteMin, absoluteMax),
    step,
  )
  for (let current = index + 1; current < next.length; current += 1) {
    const previous = next[current - 1]
    const existing = next[current]
    if (previous !== undefined && existing !== undefined) {
      const minAllowed = PointerDrag.roundToStepPrecision(previous + gap, step)
      if (existing < minAllowed) {
        next[current] = PointerDrag.clampValue(minAllowed, min, max)
      }
    }
  }
  for (let current = index - 1; current >= 0; current -= 1) {
    const following = next[current + 1]
    const existing = next[current]
    if (following !== undefined && existing !== undefined) {
      const maxAllowed = PointerDrag.roundToStepPrecision(following - gap, step)
      if (existing > maxAllowed) {
        next[current] = PointerDrag.clampValue(maxAllowed, min, max)
      }
    }
  }
  return { values: next, activeIndex: index }
}

const resolveSwapCollision = (
  values: ReadonlyArray<number>,
  index: number,
  snapped: number,
  props: Pick<Props, 'min' | 'max' | 'step' | 'minStepsBetweenThumbs'>,
  originValue: number,
): ResolvedThumbUpdate => {
  const min = minOf(props)
  const max = maxOf(props)
  const step = stepOf(props)
  const gap = minStepsBetweenThumbsOf(props) * step
  const maybePrev = index > 0 ? Array.get(values, index - 1) : Option.none()
  const maybeNext =
    index + 1 < values.length ? Array.get(values, index + 1) : Option.none()
  const crossingNext =
    Option.isSome(maybeNext) &&
    snapped > maybeNext.value &&
    snapped > originValue
  const crossingPrev =
    Option.isSome(maybePrev) &&
    snapped < maybePrev.value &&
    snapped < originValue

  if (!crossingNext && !crossingPrev) {
    return resolveNoneCollision(values, index, snapped, props)
  }

  const swapIndex = crossingNext ? index + 1 : index - 1
  const next: Array<number> = [...values]
  const neighborValue = valueAt(values, swapIndex, props)

  if (crossingNext) {
    const upperBound = Option.match(Array.get(values, swapIndex + 1), {
      onNone: () => max,
      onSome: afterSwap =>
        PointerDrag.roundToStepPrecision(afterSwap - gap, step),
    })
    const lowerBound = Option.match(maybePrev, {
      onNone: () => min,
      onSome: before => PointerDrag.roundToStepPrecision(before + gap, step),
    })
    const movedValue = PointerDrag.roundToStepPrecision(
      PointerDrag.clampValue(snapped, neighborValue, upperBound),
      step,
    )
    const stayedValue = PointerDrag.roundToStepPrecision(
      PointerDrag.clampValue(
        Math.min(neighborValue, movedValue - gap),
        lowerBound,
        movedValue,
      ),
      step,
    )
    next[swapIndex] = movedValue
    next[index] = stayedValue
  } else {
    const lowerBound = Option.match(Array.get(values, swapIndex - 1), {
      onNone: () => min,
      onSome: beforeSwap =>
        PointerDrag.roundToStepPrecision(beforeSwap + gap, step),
    })
    const upperBound = Option.match(maybeNext, {
      onNone: () => max,
      onSome: after => PointerDrag.roundToStepPrecision(after - gap, step),
    })
    const movedValue = PointerDrag.roundToStepPrecision(
      PointerDrag.clampValue(snapped, lowerBound, neighborValue),
      step,
    )
    const stayedValue = PointerDrag.roundToStepPrecision(
      PointerDrag.clampValue(
        Math.max(neighborValue, movedValue + gap),
        movedValue,
        upperBound,
      ),
      step,
    )
    next[swapIndex] = movedValue
    next[index] = stayedValue
  }

  return { values: next, activeIndex: swapIndex }
}

/**
 * Computes the next `values` array and `activeIndex` when moving thumb `index`
 * toward `rawValue`, applying step snapping, `[min, max]` clamping,
 * `minStepsBetweenThumbs`, and `thumbCollisionBehavior`.
 */
export const resolveThumbValue = (
  values: ReadonlyArray<number>,
  index: number,
  rawValue: number,
  props: Pick<
    Props,
    'min' | 'max' | 'step' | 'minStepsBetweenThumbs' | 'thumbCollisionBehavior'
  > = {},
  originValue?: number,
): ResolvedThumbUpdate => {
  const min = minOf(props)
  const max = maxOf(props)
  const step = stepOf(props)
  const snapped = PointerDrag.snapToStep(rawValue, min, max, step)
  if (values.length <= 1) {
    return { values: [snapped], activeIndex: 0 }
  }
  const safeIndex = clampIndex(index, values.length)
  return M.value(collisionBehaviorOf(props)).pipe(
    M.withReturnType<ResolvedThumbUpdate>(),
    M.when('None', () =>
      resolveNoneCollision(values, safeIndex, snapped, props),
    ),
    M.when('Push', () =>
      resolvePushCollision(values, safeIndex, snapped, props),
    ),
    M.when('Swap', () =>
      resolveSwapCollision(
        values,
        safeIndex,
        snapped,
        props,
        originValue ?? valueAt(values, safeIndex, props),
      ),
    ),
    M.exhaustive,
  )
}

/**
 * Maps a keyboard key to a slider {@link NavigationDirection}, honoring
 * `orientation`, `direction` (`Rtl`), `isInverted`, and `isShift`
 * (`Shift+Arrow` jumps by `largeStep`). Returns `None` for non-slider keys.
 *
 * @example
 * ```typescript
 * resolveSliderKey('ArrowRight') // Some('StepIncrement')
 * resolveSliderKey('ArrowLeft', { direction: 'Rtl' }) // Some('StepIncrement')
 * resolveSliderKey('ArrowRight', { isShift: true }) // Some('PageIncrement')
 * resolveSliderKey('Home') // Some('Min')
 * resolveSliderKey('Enter') // None
 * ```
 */
export const resolveSliderKey = (
  key: string,
  options: Readonly<{
    orientation?: Orientation
    direction?: Direction
    isInverted?: boolean
    isShift?: boolean
  }> = {},
): Option.Option<NavigationDirection> => {
  const orientation = orientationOf(options)
  const isHorizontalReversed =
    orientation === 'Horizontal' &&
    (directionOf(options) === 'Rtl') !== isInvertedOf(options)
  const isVerticalReversed = orientation === 'Vertical' && isInvertedOf(options)
  const incrementStep: NavigationDirection =
    options.isShift === true ? 'PageIncrement' : 'StepIncrement'
  const decrementStep: NavigationDirection =
    options.isShift === true ? 'PageDecrement' : 'StepDecrement'

  if (key === 'Home') {
    return Option.some('Min')
  } else if (key === 'End') {
    return Option.some('Max')
  } else if (key === 'PageUp') {
    return Option.some('PageIncrement')
  } else if (key === 'PageDown') {
    return Option.some('PageDecrement')
  } else if (key === 'ArrowRight') {
    return Option.some(isHorizontalReversed ? decrementStep : incrementStep)
  } else if (key === 'ArrowLeft') {
    return Option.some(isHorizontalReversed ? incrementStep : decrementStep)
  } else if (key === 'ArrowUp') {
    return Option.some(isVerticalReversed ? decrementStep : incrementStep)
  } else if (key === 'ArrowDown') {
    return Option.some(isVerticalReversed ? incrementStep : decrementStep)
  } else {
    return Option.none()
  }
}

/**
 * Computes the next single-thumb value for a keyboard {@link NavigationDirection},
 * snapped to `step` anchored at `min` and clamped to `[min, max]`.
 *
 * @example
 * ```typescript
 * nextValueForDirection(5, 'StepIncrement', { min: 0, max: 10, step: 1 }) // 6
 * nextValueForDirection(20, 'PageIncrement', { min: 0, max: 100, step: 1 }) // 30
 * nextValueForDirection(10, 'Min', { min: 2, max: 20, step: 1 }) // 2
 * ```
 */
export const nextValueForDirection = (
  value: number,
  direction: NavigationDirection,
  props: Pick<Props, 'min' | 'max' | 'step' | 'largeStep'> = {},
): number => {
  const min = minOf(props)
  const max = maxOf(props)
  const step = stepOf(props)
  const largeStep = largeStepOf(props)
  return M.value(direction).pipe(
    M.withReturnType<number>(),
    M.when('StepIncrement', () =>
      PointerDrag.stepValue(value, step, min, max, step),
    ),
    M.when('StepDecrement', () =>
      PointerDrag.stepValue(value, -step, min, max, step),
    ),
    M.when('PageIncrement', () =>
      PointerDrag.stepValue(value, largeStep, min, max, step),
    ),
    M.when('PageDecrement', () =>
      PointerDrag.stepValue(value, -largeStep, min, max, step),
    ),
    M.when('Min', () => min),
    M.when('Max', () => max),
    M.exhaustive,
  )
}

/**
 * Computes the next multi-thumb values array when stepping thumb `index` in
 * `direction`, respecting neighbor bounds and `minStepsBetweenThumbs`.
 */
export const nextValuesForDirection = (
  values: ReadonlyArray<number>,
  index: number,
  direction: NavigationDirection,
  props: Pick<
    Props,
    'min' | 'max' | 'step' | 'largeStep' | 'minStepsBetweenThumbs'
  > = {},
): ReadonlyArray<number> => {
  const safeIndex = clampIndex(index, values.length)
  const current = valueAt(values, safeIndex, props)
  const bounds = thumbBoundsAt(values, safeIndex, props)
  const step = stepOf(props)
  const candidate = nextValueForDirection(current, direction, props)
  const target = M.value(direction).pipe(
    M.withReturnType<number>(),
    M.when('Min', () => bounds.min),
    M.when('Max', () => bounds.max),
    M.orElse(() =>
      PointerDrag.roundToStepPrecision(
        PointerDrag.clampValue(candidate, bounds.min, bounds.max),
        step,
      ),
    ),
  )
  return replaceAt(values, safeIndex, target)
}

/**
 * Maps a pointer `point` within a painter-measured `trackRect` to a `[0, 1]`
 * slider fraction, honoring horizontal RTL / inversion and vertical bottom-to-top
 * default (flipped when `isInverted: true`).
 *
 * @example
 * ```typescript
 * fractionFromPoint({ x: 150, y: 10 }, { x: 100, y: 0, width: 200, height: 20 }) // 0.25
 * fractionFromPoint({ x: 10, y: 25 }, { x: 0, y: 0, width: 20, height: 100 }, { orientation: 'Vertical' }) // 0.75
 * ```
 */
export const fractionFromPoint = (
  point: PointerDrag.Point,
  trackRect: PointerDrag.Rect,
  props: Pick<Props, 'orientation' | 'direction' | 'isInverted'> = {},
): number => {
  const orientation = orientationOf(props)
  return PointerDrag.fractionFromPoint(point, trackRect, {
    axis: orientation,
    direction: directionOf(props),
    isInverted:
      orientation === 'Vertical' ? !isInvertedOf(props) : isInvertedOf(props),
  })
}

/**
 * Maps a pointer `point` within a painter-measured `trackRect` directly to a
 * snapped, clamped slider value.
 */
export const valueFromPoint = (
  point: PointerDrag.Point,
  trackRect: PointerDrag.Rect,
  props: Pick<
    Props,
    'min' | 'max' | 'step' | 'orientation' | 'direction' | 'isInverted'
  > = {},
): number =>
  PointerDrag.valueFromFraction(
    fractionFromPoint(point, trackRect, props),
    minOf(props),
    maxOf(props),
    stepOf(props),
  )

/** Formats a `[0, 1]` fraction as a CSS percentage string rounded to 2 decimals (`'50%'`). */
export const percentStringOf = (fraction: number): string =>
  `${(Math.round(PointerDrag.clampValue(fraction, 0, 1) * 10000) / 100).toString()}%`

// READINGS

/** All current thumb values held by `state`. */
export const valuesOf = (state: State): ReadonlyArray<number> => state.values

/** Current value of the thumb at `index` (`0` by default — single-thumb convenience helper). */
export const valueOf = (state: State, index: number = 0): number =>
  Option.getOrElse(Array.get(state.values, index), () => defaultMin)

/** Normalized `[0, 1]` fraction for every thumb in `state`. */
export const fractionsOf = (
  state: State,
  props: Pick<Props, 'min' | 'max'> = {},
): ReadonlyArray<number> => {
  const min = minOf(props)
  const max = maxOf(props)
  return Array.map(state.values, value =>
    PointerDrag.fractionFromValue(value, min, max),
  )
}

/** Normalized `[0, 1]` fraction for the thumb at `index` (`0` by default). */
export const fractionOf = (
  state: State,
  props: Pick<Props, 'min' | 'max'> = {},
  index: number = 0,
): number =>
  PointerDrag.fractionFromValue(
    valueOf(state, index),
    minOf(props),
    maxOf(props),
  )

/**
 * Filled range `[start, end]` fractions (`0..1`): `[0, fraction]` for a single
 * thumb, and `[minFraction, maxFraction]` for a multi-thumb range slider.
 *
 * @example
 * ```typescript
 * rangeFractionsOf(initialValue(40), { min: 0, max: 100 }) // { start: 0, end: 0.4 }
 * rangeFractionsOf(initialValues([20, 80]), { min: 0, max: 100 }) // { start: 0.2, end: 0.8 }
 * ```
 */
export const rangeFractionsOf = (
  state: State,
  props: Pick<Props, 'min' | 'max'> = {},
): RangeFractions => {
  const fractions = fractionsOf(state, props)
  if (Array.isReadonlyArrayEmpty(fractions)) {
    return { start: 0, end: 0 }
  } else if (fractions.length === 1) {
    return {
      start: 0,
      end: Option.getOrElse(Array.head(fractions), () => 0),
    }
  } else {
    return {
      start: Math.min(...fractions),
      end: Math.max(...fractions),
    }
  }
}

/** True while `state` is `Idle`. */
export const isIdle = (state: State): boolean => state._tag === 'Idle'

/** True while `state` is `Focused`. */
export const isFocused = (state: State): boolean => state._tag === 'Focused'

/** True while `state` is `Dragging`. */
export const isDragging = (state: State): boolean => state._tag === 'Dragging'

/** Active thumb index while `Focused` or `Dragging`, or none while `Idle`. */
export const activeThumbIndexOf = (state: State): Option.Option<number> =>
  M.value(state).pipe(
    M.withReturnType<Option.Option<number>>(),
    M.tagsExhaustive({
      Idle: () => Option.none(),
      Focused: ({ focusedIndex }) => Option.some(focusedIndex),
      Dragging: ({ activeThumbIndex }) => Option.some(activeThumbIndex),
    }),
  )

/** True when the thumb at `index` is currently being dragged. */
export const isThumbDragging = (state: State, index: number): boolean =>
  state._tag === 'Dragging' && state.activeThumbIndex === index

/** True when the thumb at `index` currently holds focus. */
export const isThumbFocused = (state: State, index: number): boolean =>
  state._tag === 'Focused' && state.focusedIndex === index

/** Pre-drag snapshot of all thumb values while `Dragging`, or none otherwise. */
export const originValuesOf = (
  state: State,
): Option.Option<ReadonlyArray<number>> =>
  state._tag === 'Dragging' ? Option.some(state.originValues) : Option.none()

/** Underlying `PointerDrag.State` held by `state`. */
export const dragOf = (state: State): PointerDrag.State => state.drag

// CHART

const canInteractGuard = (
  _state: State,
  _message: Message,
  context: Props,
): boolean => canInteract(context)

const startDragOf = (
  drag: PointerDrag.State,
  message: Readonly<{ pointerId: number; x: number; y: number }>,
  originValue: number,
  context: Props,
): PointerDrag.Dragging => {
  const [nextDrag] = PointerDrag.chart.transition(
    drag,
    PointerDrag.StartDrag({
      pointerId: message.pointerId,
      x: message.x,
      y: message.y,
      originValue,
    }),
    dragPropsOf(context),
  )
  return nextDrag._tag === 'Dragging'
    ? nextDrag
    : PointerDrag.Dragging({
        pointerId: message.pointerId,
        startX: message.x,
        startY: message.y,
        currentX: message.x,
        currentY: message.y,
        originValue,
        isActivated: PointerDrag.thresholdPxOf(context) <= 0,
      })
}

const moveDragOf = (
  drag: PointerDrag.Dragging,
  message: Readonly<{ pointerId: number; x: number; y: number }>,
  context: Props,
): PointerDrag.Dragging => {
  const [nextDrag] = PointerDrag.chart.transition(
    drag,
    PointerDrag.MoveDrag({
      pointerId: message.pointerId,
      x: message.x,
      y: message.y,
    }),
    dragPropsOf(context),
  )
  return nextDrag._tag === 'Dragging' ? nextDrag : drag
}

const endDragOf = (
  drag: PointerDrag.Dragging,
  pointerId: number | undefined,
  context: Props,
): PointerDrag.Idle => {
  const [nextDrag] = PointerDrag.chart.transition(
    drag,
    PointerDrag.EndDrag(pointerId === undefined ? {} : { pointerId }),
    dragPropsOf(context),
  )
  return nextDrag._tag === 'Idle' ? nextDrag : PointerDrag.Idle()
}

const cancelDragOf = (
  drag: PointerDrag.Dragging,
  pointerId: number | undefined,
  context: Props,
): PointerDrag.Idle => {
  const [nextDrag] = PointerDrag.chart.transition(
    drag,
    PointerDrag.CancelDrag(pointerId === undefined ? {} : { pointerId }),
    dragPropsOf(context),
  )
  return nextDrag._tag === 'Idle' ? nextDrag : PointerDrag.Idle()
}

const activeIndexFromState = (
  state: Idle | Focused,
  explicitIndex: number | undefined,
): number =>
  clampIndex(
    explicitIndex ?? (state._tag === 'Focused' ? state.focusedIndex : 0),
    state.values.length,
  )

const beginThumbDragEdges = <Source extends Idle | Focused>(): ReadonlyArray<
  GuardedEdge<State, Message, Source, typeof BeginThumbDrag.Type, never, Props>
> => [
  when(canInteractGuard, 'Dragging', ({ state, message, context }) => {
    const thumbIndex = clampIndex(message.thumbIndex, state.values.length)
    const originValue = valueAt(state.values, thumbIndex, context)
    return Dragging({
      values: state.values,
      activeThumbIndex: thumbIndex,
      originValues: state.values,
      drag: startDragOf(state.drag, message, originValue, context),
    })
  }),
  ignore(),
]

const pressTrackEdges = <Source extends Idle | Focused>(): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    Source,
    typeof PressSliderTrack.Type,
    never,
    Props
  >
> => [
  when(canInteractGuard, 'Dragging', ({ state, message, context }) => {
    const thumbIndex = closestThumbIndex(state.values, message.value, context)
    const originValue = valueAt(state.values, thumbIndex, context)
    const resolved = resolveThumbValue(
      state.values,
      thumbIndex,
      message.value,
      context,
      originValue,
    )
    return Dragging({
      values: resolved.values,
      activeThumbIndex: resolved.activeIndex,
      originValues: state.values,
      drag: startDragOf(state.drag, message, originValue, context),
    })
  }),
  ignore(),
]

const stepSliderEdges = <Source extends Idle | Focused>(): ReadonlyArray<
  GuardedEdge<State, Message, Source, typeof StepSlider.Type, never, Props>
> => [
  when(canInteractGuard, 'Focused', ({ state, message, context }) => {
    const thumbIndex = activeIndexFromState(state, message.thumbIndex)
    return Focused({
      values: nextValuesForDirection(
        state.values,
        thumbIndex,
        message.direction,
        context,
      ),
      focusedIndex: thumbIndex,
      drag: PointerDrag.Idle(),
    })
  }),
  ignore(),
]

const pressedKeyEdges = <Source extends Idle | Focused>(): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    Source,
    typeof PressedSliderKey.Type,
    never,
    Props
  >
> => [
  when(
    (_state, message, context) =>
      canInteract(context)
        ? resolveSliderKey(message.key, {
            orientation: orientationOf(context),
            direction: directionOf(context),
            isInverted: isInvertedOf(context),
            ...(message.isShift === undefined
              ? {}
              : { isShift: message.isShift }),
          })
        : Option.none(),
    'Focused',
    ({ state, message, guardValue, context }) => {
      const thumbIndex = activeIndexFromState(state, message.thumbIndex)
      return Focused({
        values: nextValuesForDirection(
          state.values,
          thumbIndex,
          guardValue,
          context,
        ),
        focusedIndex: thumbIndex,
        drag: PointerDrag.Idle(),
      })
    },
  ),
  ignore(),
]

const focusThumbEdges = <Source extends Idle | Focused>(): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    Source,
    typeof FocusSliderThumb.Type,
    never,
    Props
  >
> => [
  when(
    (_state, _message, context) => !isDisabledOf(context),
    'Focused',
    ({ state, message }) =>
      Focused({
        values: state.values,
        focusedIndex: clampIndex(message.thumbIndex, state.values.length),
        drag: PointerDrag.Idle(),
      }),
  ),
  ignore(),
]

const resetToIdle = (context: Props): Idle =>
  Idle({
    values: normalizeValues(context.defaultValues ?? [minOf(context)], context),
    drag: PointerDrag.Idle(),
  })

/**
 * Builds the Slider Machine chart starting in `initialState`, composing
 * `PointerDrag.chart` for pointer capture, threshold activation, pointerId
 * matching, and Escape/cancel rollback while handling single- and multi-thumb
 * keyboard and value adjustments.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Idle: {
        on: {
          SetSliderValue: [
            when(canInteractGuard, 'Idle', ({ state, message, context }) => {
              const thumbIndex = clampIndex(
                message.thumbIndex ?? 0,
                state.values.length,
              )
              const resolved = resolveThumbValue(
                state.values,
                thumbIndex,
                message.value,
                context,
              )
              return Idle({
                values: resolved.values,
                drag: PointerDrag.Idle(),
              })
            }),
            ignore(),
          ],
          SetSliderValues: [
            when(canInteractGuard, 'Idle', ({ message, context }) =>
              Idle({
                values: normalizeValues(message.values, context),
                drag: PointerDrag.Idle(),
              }),
            ),
            ignore(),
          ],
          StepSlider: stepSliderEdges<Idle>(),
          FocusSliderThumb: focusThumbEdges<Idle>(),
          ResetSlider: to('Idle', ({ context }) => resetToIdle(context)),
          BeginThumbDrag: beginThumbDragEdges<Idle>(),
          PressSliderTrack: pressTrackEdges<Idle>(),
          MoveSliderDrag: [ignore()],
          ReleaseSliderDrag: [ignore()],
          CancelSliderDrag: [ignore()],
          BlurSlider: [ignore()],
          PressedSliderKey: pressedKeyEdges<Idle>(),
        },
      },
      Focused: {
        on: {
          SetSliderValue: [
            when(canInteractGuard, 'Focused', ({ state, message, context }) => {
              const thumbIndex = activeIndexFromState(state, message.thumbIndex)
              const resolved = resolveThumbValue(
                state.values,
                thumbIndex,
                message.value,
                context,
              )
              return Focused({
                values: resolved.values,
                focusedIndex: resolved.activeIndex,
                drag: PointerDrag.Idle(),
              })
            }),
            ignore(),
          ],
          SetSliderValues: [
            when(canInteractGuard, 'Focused', ({ state, message, context }) => {
              const nextValues = normalizeValues(message.values, context)
              return Focused({
                values: nextValues,
                focusedIndex: clampIndex(state.focusedIndex, nextValues.length),
                drag: PointerDrag.Idle(),
              })
            }),
            ignore(),
          ],
          StepSlider: stepSliderEdges<Focused>(),
          FocusSliderThumb: focusThumbEdges<Focused>(),
          ResetSlider: to('Idle', ({ context }) => resetToIdle(context)),
          BeginThumbDrag: beginThumbDragEdges<Focused>(),
          PressSliderTrack: pressTrackEdges<Focused>(),
          MoveSliderDrag: [ignore()],
          ReleaseSliderDrag: [ignore()],
          CancelSliderDrag: [ignore()],
          BlurSlider: to('Idle', ({ state }) =>
            Idle({ values: state.values, drag: PointerDrag.Idle() }),
          ),
          PressedSliderKey: pressedKeyEdges<Focused>(),
        },
      },
      Dragging: {
        on: {
          SetSliderValue: [
            when(
              canInteractGuard,
              'Dragging',
              ({ state, message, context }) => {
                const thumbIndex = clampIndex(
                  message.thumbIndex ?? state.activeThumbIndex,
                  state.values.length,
                )
                const resolved = resolveThumbValue(
                  state.values,
                  thumbIndex,
                  message.value,
                  context,
                )
                return Dragging({
                  values: resolved.values,
                  activeThumbIndex: resolved.activeIndex,
                  originValues: state.originValues,
                  drag: state.drag,
                })
              },
            ),
            ignore(),
          ],
          SetSliderValues: [ignore()],
          StepSlider: [ignore()],
          FocusSliderThumb: [ignore()],
          ResetSlider: to('Idle', ({ context }) => resetToIdle(context)),
          BeginThumbDrag: [ignore()],
          PressSliderTrack: [ignore()],
          MoveSliderDrag: [
            when(
              (state, message, context) =>
                canInteract(context) &&
                message.pointerId === state.drag.pointerId,
              'Dragging',
              ({ state, message, context }) => {
                const nextDrag = moveDragOf(state.drag, message, context)
                if (!nextDrag.isActivated) {
                  return Dragging({
                    values: state.values,
                    activeThumbIndex: state.activeThumbIndex,
                    originValues: state.originValues,
                    drag: nextDrag,
                  })
                }
                const resolved = resolveThumbValue(
                  state.values,
                  state.activeThumbIndex,
                  message.value,
                  context,
                  valueAt(state.originValues, state.activeThumbIndex, context),
                )
                return Dragging({
                  values: resolved.values,
                  activeThumbIndex: resolved.activeIndex,
                  originValues: state.originValues,
                  drag: nextDrag,
                })
              },
            ),
            ignore(),
          ],
          ReleaseSliderDrag: [
            when(
              (state, message) =>
                message.pointerId === undefined ||
                message.pointerId === state.drag.pointerId,
              'Focused',
              ({ state, message, context }) =>
                Focused({
                  values: state.values,
                  focusedIndex: state.activeThumbIndex,
                  drag: endDragOf(state.drag, message.pointerId, context),
                }),
            ),
            ignore(),
          ],
          CancelSliderDrag: [
            when(
              (state, message) =>
                message.pointerId === undefined ||
                message.pointerId === state.drag.pointerId,
              'Idle',
              ({ state, message, context }) =>
                Idle({
                  values: state.originValues,
                  drag: cancelDragOf(state.drag, message.pointerId, context),
                }),
            ),
            ignore(),
          ],
          BlurSlider: [ignore()],
          PressedSliderKey: [
            when(
              (_state, message) => PointerDrag.isCancelKey(message.key),
              'Idle',
              ({ state, context }) =>
                Idle({
                  values: state.originValues,
                  drag: cancelDragOf(state.drag, undefined, context),
                }),
            ),
            ignore(),
          ],
        },
      },
    },
  })

/** The default Slider Machine chart starting in `Idle({ values: [0], drag: PointerDrag.Idle() })`. */
export const chart = chartOf(initial)

// SYNC

/**
 * Builds the Slider sync table using `Pace.Sampled({ everyMs })` on
 * `MoveSliderDrag` (50 ms default) and `Pace.Synced()` on discrete steps,
 * commits, and cancels. Every Message is synced, so `Part.problemsOf` succeeds
 * with zero mixed-sync issues.
 *
 * @example
 * ```typescript
 * syncOf(50).MoveSliderDrag // Sampled({ everyMs: 50 })
 * syncOf(50).ReleaseSliderDrag // Synced()
 * syncOf(50).StepSlider // Synced()
 * ```
 */
export const syncOf = (
  sampleMs: number = defaultSampleMs,
): Readonly<Record<Message['_tag'], Sync>> => ({
  SetSliderValue: Synced(),
  SetSliderValues: Synced(),
  StepSlider: Synced(),
  FocusSliderThumb: Synced(),
  ResetSlider: Synced(),
  BeginThumbDrag: Synced(),
  PressSliderTrack: Synced(),
  MoveSliderDrag: Sampled({ everyMs: sampleMs }),
  ReleaseSliderDrag: Synced(),
  CancelSliderDrag: Synced(),
  BlurSlider: Synced(),
  PressedSliderKey: Synced(),
})

/** Default synchronization: `MoveSliderDrag` uses `Pace.Sampled({ everyMs: 50 })`, all discrete actions use `Pace.Synced()`. */
export const synced: Readonly<Record<Message['_tag'], Sync>> = syncOf()

/** Device-only synchronization table for a Slider kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  SetSliderValue: Device({ because }),
  SetSliderValues: Device({ because }),
  StepSlider: Device({ because }),
  FocusSliderThumb: Device({ because }),
  ResetSlider: Device({ because }),
  BeginThumbDrag: Device({ because }),
  PressSliderTrack: Device({ because }),
  MoveSliderDrag: Device({ because }),
  ReleaseSliderDrag: Device({ because }),
  CancelSliderDrag: Device({ because }),
  BlurSlider: Device({ because }),
  PressedSliderKey: Device({ because }),
})

/** Returns the {@link Sync} pace for one Slider Message under `sampleMs`. */
export const paceOf = (
  message: Message,
  sampleMs: number = defaultSampleMs,
): Sync => syncOf(sampleMs)[message._tag]

// SLOTS & PROJECTION

/**
 * The five painted slots of a Slider Part:
 * - `Root`: outer container with orientation and disabled/readOnly/invalid state.
 * - `Track`: the interactive rail along which thumbs slide.
 * - `Range`: the filled highlight segment between origin/thumbs.
 * - `Thumb`: focusable slider thumb (`role="slider"`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, `aria-valuetext`, `aria-orientation`).
 * - `Label`: accessible label linked to thumbs via `aria-labelledby`.
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Root: {
    focus: 'None',
    gestures: [],
  },
  Track: {
    focus: 'None',
    gestures: [],
  },
  Range: {
    focus: 'None',
    gestures: [],
  },
  Thumb: {
    role: 'Slider',
    focus: 'None',
    gestures: [],
  },
  Label: {
    focus: 'None',
    gestures: [],
  },
}

const parseThumbChoice = (
  maybeChoice: Option.Option<string>,
  count: number,
): Readonly<{ index: number; isIndexed: boolean }> =>
  Option.match(maybeChoice, {
    onNone: () => ({ index: 0, isIndexed: false }),
    onSome: raw => {
      const parsed = Number(raw)
      return {
        index: Number.isFinite(parsed) ? clampIndex(parsed, count) : 0,
        isIndexed: true,
      }
    },
  })

const thumbLabelPropsOf = (
  props: Props,
  index: number,
  totalThumbs: number,
): Pick<SlotProps, 'label' | 'labelledBy'> => {
  const maybeThumbLabel =
    props.thumbLabels === undefined
      ? Option.none<string>()
      : Array.get(props.thumbLabels, index)
  if (Option.isSome(maybeThumbLabel)) {
    return { label: maybeThumbLabel.value }
  } else if (props.labelledBy !== undefined) {
    return { labelledBy: props.labelledBy }
  } else if (props.hasLabel === false) {
    if (props.label !== undefined) {
      return { label: props.label }
    } else if (totalThumbs === 2) {
      return { label: index === 0 ? 'Minimum' : 'Maximum' }
    } else if (totalThumbs > 2) {
      return {
        label: `Value ${(index + 1).toString()} of ${totalThumbs.toString()}`,
      }
    } else {
      return {}
    }
  } else if (props.label !== undefined && props.hasLabel !== true) {
    return { label: props.label }
  } else {
    return { labelledBy: labelId(props.id) }
  }
}

const thumbValueTextOf = (
  props: Props,
  index: number,
): Option.Option<string> => {
  if (props.valueTexts !== undefined) {
    return Array.get(props.valueTexts, index)
  } else if (index === 0 && props.valueText !== undefined) {
    return Option.some(props.valueText)
  } else {
    return Option.none()
  }
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  const orientation = orientationOf(props)
  if (slot === 'Root') {
    return {
      id: rootId(props.id),
      orientation,
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
      ...(isInvalidOf(props) ? { isInvalid: true } : {}),
    }
  } else if (slot === 'Track') {
    return {
      id: trackId(props.id),
      orientation,
      dragAxis: orientation === 'Vertical' ? 'Vertical' : 'Horizontal',
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
    }
  } else if (slot === 'Range') {
    return {
      id: rangeId(props.id),
      orientation,
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
    }
  } else if (slot === 'Thumb') {
    const { index, isIndexed } = parseThumbChoice(
      maybeChoice,
      state.values.length,
    )
    const bounds = thumbBoundsAt(state.values, index, props)
    const valueNow = valueAt(state.values, index, props)
    const maybeValueText = thumbValueTextOf(props, index)
    return {
      id: isIndexed ? thumbId(props.id, index) : thumbId(props.id),
      orientation,
      dragAxis: orientation === 'Vertical' ? 'Vertical' : 'Horizontal',
      valueMin: bounds.min,
      valueMax: bounds.max,
      valueNow,
      ...Option.match(maybeValueText, {
        onNone: () => ({}),
        onSome: valueText => ({ valueText }),
      }),
      ...thumbLabelPropsOf(props, index, state.values.length),
      ...(props.describedBy === undefined
        ? {}
        : { describedBy: props.describedBy }),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
      tabIndex: isDisabledOf(props) ? -1 : 0,
    }
  } else if (slot === 'Label') {
    return {
      id: labelId(props.id),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
    }
  } else {
    return {}
  }
}

/**
 * What a restart opens a Slider on: returns to `Idle` with `PointerDrag.Idle()`
 * while keeping the latest settled `values`, so a restored session never opens
 * mid-drag and never loses the last synced slider value.
 *
 * @example
 * ```typescript
 * atRest(Dragging({ values: [75], activeThumbIndex: 0, originValues: [25], drag }))
 * // Idle({ values: [75], drag: PointerDrag.Idle() })
 * ```
 */
export const atRest = (state: State): State =>
  Idle({
    values: state.values,
    drag: PointerDrag.atRest(state.drag),
  })

// PART FACTORY

/** Options for customizing a Slider Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (such as `'OwnView'`) to keep this Slider device-only. */
  sync?: 'Synced' | DeviceReason
  /** Pointer-move sync sampling interval in milliseconds (`50` by default). */
  sampleMs?: number
  /** Convenience single-thumb initial value (`0` by default). Ignored if `defaultValues` is set. */
  defaultValue?: number
  /** Multi-thumb initial values. */
  defaultValues?: ReadonlyArray<number>
  /** Minimum value used for the Part's default drag grain (`0` by default). */
  min?: number
  /** Step size used for the Part's default drag grain (`1` by default). */
  step?: number
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Slider {@link Part.Part}. Synced by default (`category: 'Domain'`,
 * `MoveSliderDrag` with `Pace.Sampled({ everyMs: sampleMs ?? 50 })`, discrete
 * steps/commits/cancels with `Pace.Synced()`). Use {@link deviceOnly} for
 * local-only sliders.
 *
 * @example
 * ```typescript
 * const VolumeSlider = Slider.make({ name: 'VolumeSlider', defaultValue: 50 })
 * const PriceRange = Slider.make({ name: 'PriceRange', defaultValues: [20, 80], sampleMs: 100 })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const sampleMs = options.sampleMs ?? defaultSampleMs
  const min = options.min ?? defaultMin
  const step = options.step ?? defaultStep
  const initialState: State =
    options.defaultValues !== undefined
      ? initialValues(options.defaultValues)
      : options.defaultValue !== undefined
        ? initialValue(options.defaultValue)
        : options.min !== undefined
          ? initialValue(options.min)
          : initial
  return Part.define<State, Message, Props>({
    name: options.name ?? 'Slider',
    State,
    Message,
    chart: initialState === initial ? chart : chartOf(initialState),
    actions,
    sync:
      options.sync === undefined || options.sync === 'Synced'
        ? syncOf(sampleMs)
        : deviceSync(options.sync),
    category: options.category ?? 'Domain',
    slots,
    atRest,
    project: projectSlot,
    configuration: options.configuration ?? {
      base: {
        pace: {
          ...defaultPace,
          dragGrain: Step({ size: step, origin: min }),
          dragSampleMs: sampleMs,
        },
      },
      presets: {},
    },
  })
}

/**
 * Shorthand for a Slider Part whose state stays on the device and is omitted
 * from the synced log and encoded Model.
 *
 * @example
 * ```typescript
 * const LocalZoomSlider = Slider.deviceOnly({ name: 'LocalZoomSlider', defaultValue: 100 })
 * ```
 */
export const deviceOnly = (
  options: Omit<MakeOptions, 'sync'> &
    Readonly<{ because?: DeviceReason }> = {},
): Part.Part<State, Message, Props> => {
  const { because, ...rest } = options
  return make({
    ...rest,
    sync: because ?? 'OwnView',
  })
}

/** The default synced Slider Part (`name: 'Slider'`, `category: 'Domain'`, `MoveSliderDrag` at `Pace.Sampled({ everyMs: 50 })`). */
export const part: Part.Part<State, Message, Props> = make()
