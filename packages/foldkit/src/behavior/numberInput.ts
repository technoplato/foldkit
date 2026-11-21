import { Match as M, Option, Schema as S } from 'effect'

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
import * as FieldDraft from './fieldDraft.js'
import {
  Device,
  type DeviceReason,
  Sampled,
  Settled,
  Step,
  type Sync,
  Synced,
  defaultPace,
} from './pace.js'
import * as Part from './part.js'
import * as PointerDrag from './pointerDrag.js'
import type { SlotProps } from './slot.js'

// NOTE: this is the core NumberInput Part (Widget #32 of 54, Scribe #2671).
// It composes `FieldDraft` (`Pace.Settled` typing sync) and `PointerDrag`
// (`Pace.Sampled` scrubber drag) into one framework-free Machine and Part
// declaration covering Zag number-input semantics: numeric parsing and
// formatting, min/max bounds, step/largeStep/precision, clampOnBlur,
// allowOverflow, increment/decrement/Home/End/PageUp/PageDown keyboard rules,
// disabled/readOnly guards, and reference-stable SlotBindings (`Input`,
// `IncrementButton`, `DecrementButton`, `Scrubber`, `Label`).

// CONSTANTS

/** Default single-step numeric increment (`1`). */
export const defaultStep = 1

/** Default multiplier applied to `step` for `PageUp` / `PageDown` and `Shift+Arrow` (`10`). */
export const defaultLargeStepMultiplier = 10

/** Default pointer movement distance in pixels per scrubber step (`4`). */
export const defaultScrubStepPx = 4

/** Maximum fraction digits supported by `Number.prototype.toFixed` (`20`). */
const maxPrecisionDigits = 20

/** Default typing-pause settle window in milliseconds (`200`). */
export const defaultSettleMs: number = FieldDraft.defaultSettleMs

/** Default scrubber pointer-move sync sampling window in milliseconds (`50`). */
export const defaultSampleMs: number = PointerDrag.defaultSampleMs

const numericPattern = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/u

// SCHEMAS

/** Horizontal reading direction for scrubber drag polarity (`Ltr` or `Rtl`). */
export const Direction = PointerDrag.DragDirection
/** Horizontal reading direction for scrubber drag polarity. */
export type Direction = typeof Direction.Type

/**
 * Read-only props supplied to the NumberInput chart and projection from the
 * Program's Model. Bounds, step sizes, precision, clamping policy, and
 * accessibility linkage stay out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  min: S.optionalKey(S.Number),
  max: S.optionalKey(S.Number),
  step: S.optionalKey(S.Number),
  largeStep: S.optionalKey(S.Number),
  precision: S.optionalKey(S.Number),
  clampOnBlur: S.optionalKey(S.Boolean),
  allowOverflow: S.optionalKey(S.Boolean),
  scrubStepPx: S.optionalKey(S.Number),
  direction: S.optionalKey(Direction),
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  isRequired: S.optionalKey(S.Boolean),
  isInvalid: S.optionalKey(S.Boolean),
  defaultValue: S.optionalKey(S.Number),
  settleMs: S.optionalKey(S.Number),
  sampleMs: S.optionalKey(S.Number),
  placeholder: S.optionalKey(S.String),
  label: S.optionalKey(S.String),
  hasLabel: S.optionalKey(S.Boolean),
  labelledBy: S.optionalKey(S.String),
  describedBy: S.optionalKey(S.String),
  valueText: S.optionalKey(S.String),
  name: S.optionalKey(S.String),
  form: S.optionalKey(S.String),
})
/** Read-only props supplied to the NumberInput chart and projection. */
export type Props = typeof Props.Type

// STATE

/** The number input is at rest, holding its committed `maybeValue`, `field`, and idle `drag`. */
export const Idle = ts('Idle', {
  maybeValue: S.Option(S.Number),
  field: FieldDraft.Idle,
  drag: PointerDrag.Idle,
})
/** The number input is at rest. */
export type Idle = typeof Idle.Type

/** The number input is being edited, holding the live parsed `maybeValue` and active `FieldDraft.Editing`. */
export const Editing = ts('Editing', {
  maybeValue: S.Option(S.Number),
  field: FieldDraft.Editing,
  drag: PointerDrag.Idle,
})
/** The number input is being edited. */
export type Editing = typeof Editing.Type

/**
 * The number input is being scrubbed with a pointer, tracking `originValue`
 * so cancel or Escape restores the value captured when the scrub began.
 */
export const Scrubbing = ts('Scrubbing', {
  maybeValue: S.Option(S.Number),
  originValue: S.Option(S.Number),
  field: FieldDraft.Idle,
  drag: PointerDrag.Dragging,
})
/** The number input is being scrubbed with a pointer. */
export type Scrubbing = typeof Scrubbing.Type

/** Where a NumberInput Part stands: `Idle`, `Editing`, or `Scrubbing`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Editing, Scrubbing])
/** Where a NumberInput Part stands. */
export type State = typeof State.Type

/** Initial NumberInput state: empty and idle. */
export const initial: State = Idle({
  maybeValue: Option.none(),
  field: FieldDraft.Idle({ value: '' }),
  drag: PointerDrag.Idle(),
})

// NUMERIC HELPERS

const normalizeZero = (value: number): number =>
  Object.is(value, -0) ? 0 : value

/** Resolved single-step increment (`1` by default). */
export const stepOf = (props: Pick<Props, 'step'> = {}): number =>
  props.step !== undefined && Number.isFinite(props.step) && props.step > 0
    ? props.step
    : defaultStep

/** Resolved large-step increment for PageUp / PageDown and Shift+Arrow (`10 * step` by default). */
export const largeStepOf = (
  props: Pick<Props, 'step' | 'largeStep'> = {},
): number =>
  props.largeStep !== undefined &&
  Number.isFinite(props.largeStep) &&
  props.largeStep > 0
    ? props.largeStep
    : stepOf(props) * defaultLargeStepMultiplier

/** Resolved decimal precision when configured, clamped to `[0, 20]`, or none. */
export const precisionOf = (
  props: Pick<Props, 'precision'> = {},
): Option.Option<number> => {
  if (props.precision === undefined || !Number.isFinite(props.precision)) {
    return Option.none()
  } else {
    return Option.some(
      Math.min(maxPrecisionDigits, Math.max(0, Math.trunc(props.precision))),
    )
  }
}

/** True when values outside `[min, max]` are permitted (`false` by default). */
export const allowOverflowOf = (
  props: Pick<Props, 'allowOverflow'> = {},
): boolean => props.allowOverflow === true

/** True when leaving the field clamps out-of-range values into `[min, max]` (`!allowOverflow` by default). */
export const clampOnBlurOf = (
  props: Pick<Props, 'clampOnBlur' | 'allowOverflow'> = {},
): boolean => props.clampOnBlur ?? !allowOverflowOf(props)

/** Resolved pixels-per-step scrub sensitivity (`4` by default). */
export const scrubStepPxOf = (
  props: Pick<Props, 'scrubStepPx'> = {},
): number =>
  props.scrubStepPx !== undefined &&
  Number.isFinite(props.scrubStepPx) &&
  props.scrubStepPx > 0
    ? props.scrubStepPx
    : defaultScrubStepPx

/** Resolved horizontal reading direction (`'Ltr'` by default). */
export const directionOf = (props: Pick<Props, 'direction'> = {}): Direction =>
  props.direction ?? 'Ltr'

/** True when the number input is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** True when the number input is read-only (`false` by default). */
export const isReadOnlyOf = (props: Pick<Props, 'isReadOnly'> = {}): boolean =>
  props.isReadOnly === true

/** True when the number input is required (`false` by default). */
export const isRequiredOf = (props: Pick<Props, 'isRequired'> = {}): boolean =>
  props.isRequired === true

/** True when the number input is marked invalid (`false` by default). */
export const isInvalidOf = (props: Pick<Props, 'isInvalid'> = {}): boolean =>
  props.isInvalid === true

/** True when the number input accepts user edits (neither disabled nor read-only). */
export const canEdit = (
  props: Pick<Props, 'isDisabled' | 'isReadOnly'> = {},
): boolean => FieldDraft.canEdit(props)

/** Resolved typing-pause settle duration in milliseconds (`200` by default). */
export const settleMsOf = (props: Pick<Props, 'settleMs'> = {}): number =>
  props.settleMs ?? defaultSettleMs

/** Resolved scrubber move sync sampling window in milliseconds (`50` by default). */
export const sampleMsOf = (props: Pick<Props, 'sampleMs'> = {}): number =>
  props.sampleMs ?? defaultSampleMs

/**
 * Parses a raw numeric string into a finite number, returning `Option.none()`
 * for empty, incomplete, or non-numeric strings.
 *
 * @example
 * ```typescript
 * parseNumber('42.5') // Some(42.5)
 * parseNumber('  -3 ') // Some(-3)
 * parseNumber('') // None
 * parseNumber('abc') // None
 * ```
 */
export const parseNumber = (raw: string): Option.Option<number> => {
  const trimmed = raw.trim()
  if (trimmed.length === 0 || !numericPattern.test(trimmed)) {
    return Option.none()
  }
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) {
    return Option.none()
  } else {
    return Option.some(normalizeZero(parsed))
  }
}

/**
 * Rounds `value` to `props.precision` when configured, or to `step`'s decimal
 * precision to avoid IEEE-754 stepping drift.
 *
 * @example
 * ```typescript
 * roundNumber(0.1 + 0.2, { step: 0.1 }) // 0.3
 * roundNumber(3.14159, { precision: 2 }) // 3.14
 * ```
 */
export const roundNumber = (
  value: number,
  props: Pick<Props, 'precision' | 'step'> = {},
): number => {
  if (!Number.isFinite(value)) {
    return value
  }
  return Option.match(precisionOf(props), {
    onNone: () => PointerDrag.roundToStepPrecision(value, stepOf(props)),
    onSome: digits => normalizeZero(Number(value.toFixed(digits))),
  })
}

/**
 * Formats a finite numeric `value` for display, honoring `props.precision`
 * fixed decimal places when provided.
 *
 * @example
 * ```typescript
 * formatNumber(5, { precision: 2 }) // '5.00'
 * formatNumber(42) // '42'
 * ```
 */
export const formatNumber = (
  value: number,
  props: Pick<Props, 'precision'> = {},
): string => {
  const clean = normalizeZero(value)
  return Option.match(precisionOf(props), {
    onNone: () => String(clean),
    onSome: digits => clean.toFixed(digits),
  })
}

/**
 * Clamps `value` against `props.min` and `props.max` when defined.
 *
 * @example
 * ```typescript
 * clampToBounds(120, { min: 0, max: 100 }) // 100
 * clampToBounds(-5, { min: 0 }) // 0
 * clampToBounds(42, {}) // 42
 * ```
 */
export const clampToBounds = (
  value: number,
  props: Pick<Props, 'min' | 'max'> = {},
): number => {
  if (props.min !== undefined && props.max !== undefined) {
    return PointerDrag.clampValue(value, props.min, props.max)
  } else if (props.min !== undefined) {
    return Math.max(value, props.min)
  } else if (props.max !== undefined) {
    return Math.min(value, props.max)
  } else {
    return value
  }
}

/** Creates an initial idle NumberInput state holding `value`. */
export const initialValue = (
  value: number,
  props: Pick<Props, 'precision'> = {},
): State => {
  const formatted = formatNumber(value, props)
  return Idle({
    maybeValue: Option.some(normalizeZero(value)),
    field: FieldDraft.Idle({ value: formatted }),
    drag: PointerDrag.Idle(),
  })
}

// ACTIONS

/** Enters edit mode on the number input field. */
export const BeginNumberEdit = Catalog.action('BeginNumberEdit', {
  what: 'Starts editing the numeric field',
  why: 'To type a custom quantity directly',
  meta: { label: 'Begin number edit', keys: [] },
})

/** Updates the live numeric draft text; synced via `Pace.Settled` on typing pauses. */
export const ChangeNumberInput = Catalog.action('ChangeNumberInput', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'number text',
    prompt: 'Enter a numeric value',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No text to enter',
  },
  what: 'Updates the live draft text in the numeric field',
  why: 'To type digits or decimals before committing',
  meta: { label: 'Change number input', keys: [] },
})

/** Parses, optionally clamps, formats, and commits the current numeric draft. */
export const CommitNumberInput = Catalog.action('CommitNumberInput', {
  what: 'Formats and commits the current numeric draft',
  why: 'To finalize the entered quantity',
  meta: { label: 'Commit number', keys: [] },
})

/** Cancels active editing and restores the previously committed value. */
export const CancelNumberInput = Catalog.action('CancelNumberInput', {
  what: 'Discards active edits and restores the saved number',
  why: 'To keep the prior quantity unchanged',
  meta: { label: 'Cancel number edit', keys: [] },
})

/** Increments the numeric value by one `props.step`. */
export const IncrementNumber = Catalog.action('IncrementNumber', {
  what: 'Raises the numeric value by one step',
  why: 'To increase the quantity incrementally',
  meta: { label: 'Increment', keys: [] },
})

/** Decrements the numeric value by one `props.step`. */
export const DecrementNumber = Catalog.action('DecrementNumber', {
  what: 'Lowers the numeric value by one step',
  why: 'To decrease the quantity incrementally',
  meta: { label: 'Decrement', keys: [] },
})

/** Sets the numeric value directly to `value`, applying rounding and optional bounds clamping. */
export const SetNumberValue = Catalog.action('SetNumberValue', {
  fields: { value: S.Number },
  choose: {
    field: 'value',
    noun: 'number',
    prompt: 'Set to which number?',
    token: S.FiniteFromString,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'Provide a finite number',
  },
  what: 'Sets the numeric field directly to a given amount',
  why: 'To jump straight to a specific quantity',
  meta: { label: 'Set number', keys: [] },
})

/** Jumps the numeric value to the configured `min` bound. */
export const SetNumberToMin = Catalog.action('SetNumberToMin', {
  what: 'Moves the numeric value to its minimum bound',
  why: 'To reach the lowest allowed quantity immediately',
  meta: { label: 'Set to minimum', keys: [] },
})

/** Jumps the numeric value to the configured `max` bound. */
export const SetNumberToMax = Catalog.action('SetNumberToMax', {
  what: 'Moves the numeric value to its maximum bound',
  why: 'To reach the highest allowed quantity immediately',
  meta: { label: 'Set to maximum', keys: [] },
})

/** Clears the numeric value and text to empty. */
export const ClearNumberInput = Catalog.action('ClearNumberInput', {
  what: 'Empties the numeric field',
  why: 'To remove the current quantity altogether',
  meta: { label: 'Clear number', keys: [] },
})

/** Restores the numeric field to `props.defaultValue` (or empty) and returns to `Idle`. */
export const ResetNumberInput = Catalog.action('ResetNumberInput', {
  what: 'Restores the numeric field to its starting amount',
  why: 'To undo adjustments and start fresh',
  meta: { label: 'Reset number', keys: [] },
})

/** The Catalog Actions a NumberInput Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  BeginNumberEdit,
  ChangeNumberInput,
  CommitNumberInput,
  CancelNumberInput,
  IncrementNumber,
  DecrementNumber,
  SetNumberValue,
  SetNumberToMin,
  SetNumberToMax,
  ClearNumberInput,
  ResetNumberInput,
]

// MESSAGE

/** Focus left the numeric field (blur): commits, formats, and clamps per `clampOnBlur`. */
export const EndNumberEdit = m('EndNumberEdit')

/** A keyboard key was pressed while interacting with the numeric field. */
export const PressedNumberKey = m('PressedNumberKey', {
  key: S.String,
  isShift: S.optionalKey(S.Boolean),
  isComposing: S.optionalKey(S.Boolean),
})

/** A pointer went down on the scrubber handle at `(x, y)`. */
export const BeginScrub = m('BeginScrub', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
})

/**
 * The active scrubber pointer moved to `(x, y)`, stepping the value
 * proportionally to horizontal displacement; synced via `Pace.Sampled`.
 */
export const MoveScrub = m('MoveScrub', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
  isShift: S.optionalKey(S.Boolean),
})

/** The active scrubber pointer was released, committing the scrubbed value to `Idle`. */
export const EndScrub = m('EndScrub', {
  pointerId: S.optionalKey(S.Number),
})

/** The active scrub was cancelled (Escape or pointercancel), restoring pre-scrub `originValue`. */
export const CancelScrub = m('CancelScrub', {
  pointerId: S.optionalKey(S.Number),
})

/** Every Message the NumberInput chart handles. */
export const Message = S.Union([
  BeginNumberEdit,
  ChangeNumberInput,
  CommitNumberInput,
  CancelNumberInput,
  IncrementNumber,
  DecrementNumber,
  SetNumberValue,
  SetNumberToMin,
  SetNumberToMax,
  ClearNumberInput,
  ResetNumberInput,
  EndNumberEdit,
  PressedNumberKey,
  BeginScrub,
  MoveScrub,
  EndScrub,
  CancelScrub,
])
/** Every Message the NumberInput chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the NumberInput Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the numeric input control element id from a base `id`. */
export const inputId = (id: string): string => `${id}-input`

/** Derives the increment button element id from a base `id`. */
export const incrementButtonId = (id: string): string => `${id}-increment`

/** Derives the decrement button element id from a base `id`. */
export const decrementButtonId = (id: string): string => `${id}-decrement`

/** Derives the scrubber element id from a base `id`. */
export const scrubberId = (id: string): string => `${id}-scrubber`

/** Derives the label element id from a base `id`. */
export const labelId = (id: string): string => `${id}-label`

// SUB-BLOCK PROPS

/** Projects `NumberInput.Props` onto the underlying {@link FieldDraft.Props}. */
export const fieldPropsOf = (props: Props): FieldDraft.Props => ({
  ...(props.isDisabled === undefined ? {} : { isDisabled: props.isDisabled }),
  ...(props.isReadOnly === undefined ? {} : { isReadOnly: props.isReadOnly }),
  ...(props.settleMs === undefined ? {} : { settleMs: props.settleMs }),
  ...(props.defaultValue === undefined
    ? {}
    : { defaultValue: formatNumber(props.defaultValue, props) }),
})

/** Projects `NumberInput.Props` onto the underlying {@link PointerDrag.Props} for the scrubber. */
export const dragPropsOf = (props: Props): PointerDrag.Props => ({
  axis: 'Horizontal',
  direction: directionOf(props),
  ...(props.isDisabled === undefined ? {} : { isDisabled: props.isDisabled }),
  ...(props.isReadOnly === undefined ? {} : { isReadOnly: props.isReadOnly }),
  ...(props.sampleMs === undefined ? {} : { sampleMs: props.sampleMs }),
})

// READINGS

/** The current numeric value, or `Option.none()` when empty or unparseable. */
export const valueOf = (state: State): Option.Option<number> => state.maybeValue

/** The text currently displayed in the numeric input (`draft` while editing, else formatted value). */
export const textOf = (state: State): string => FieldDraft.draftOf(state.field)

/** True while `state` is `Idle`. */
export const isIdle = (state: State): boolean => state._tag === 'Idle'

/** True while `state` is `Editing`. */
export const isEditing = (state: State): boolean => state._tag === 'Editing'

/** True while `state` is `Scrubbing`. */
export const isScrubbing = (state: State): boolean => state._tag === 'Scrubbing'

/** True when no numeric value is currently held and the displayed text is empty. */
export const isEmpty = (state: State): boolean =>
  Option.isNone(state.maybeValue) && FieldDraft.isEmpty(state.field)

/** True when the current numeric value is at or below `props.min`. */
export const isAtMin = (
  state: State,
  props: Pick<Props, 'min'> = {},
): boolean => {
  const min = props.min
  return (
    min !== undefined && Option.exists(state.maybeValue, value => value <= min)
  )
}

/** True when the current numeric value is at or above `props.max`. */
export const isAtMax = (
  state: State,
  props: Pick<Props, 'max'> = {},
): boolean => {
  const max = props.max
  return (
    max !== undefined && Option.exists(state.maybeValue, value => value >= max)
  )
}

/** True when the current numeric value falls outside `[props.min, props.max]`. */
export const isOutOfRange = (
  state: State,
  props: Pick<Props, 'min' | 'max'> = {},
): boolean =>
  Option.exists(
    state.maybeValue,
    value =>
      (props.min !== undefined && value < props.min) ||
      (props.max !== undefined && value > props.max),
  )

/** True when incrementing is currently permitted (editable, and either `allowOverflow` or below `max`). */
export const canIncrement = (
  state: State,
  props: Pick<
    Props,
    'isDisabled' | 'isReadOnly' | 'allowOverflow' | 'max'
  > = {},
): boolean =>
  canEdit(props) && (allowOverflowOf(props) || !isAtMax(state, props))

/** True when decrementing is currently permitted (editable, and either `allowOverflow` or above `min`). */
export const canDecrement = (
  state: State,
  props: Pick<
    Props,
    'isDisabled' | 'isReadOnly' | 'allowOverflow' | 'min'
  > = {},
): boolean =>
  canEdit(props) && (allowOverflowOf(props) || !isAtMin(state, props))

// INTERNAL TRANSITION HELPERS

const resolveStepped = (
  maybeCurrent: Option.Option<number>,
  delta: number,
  props: Props,
): number => {
  const base = Option.getOrElse(maybeCurrent, () => 0)
  const raw = base + delta
  const rounded = roundNumber(raw, props)
  return allowOverflowOf(props) ? rounded : clampToBounds(rounded, props)
}

const resolveExplicit = (value: number, props: Props): number => {
  const rounded = roundNumber(value, props)
  return allowOverflowOf(props) ? rounded : clampToBounds(rounded, props)
}

const idleFromNumber = (value: number, props: Props): Idle => {
  const formatted = formatNumber(value, props)
  return Idle({
    maybeValue: Option.some(normalizeZero(value)),
    field: FieldDraft.Idle({ value: formatted }),
    drag: PointerDrag.Idle(),
  })
}

const editingFromNumber = (value: number, props: Props): Editing => {
  const formatted = formatNumber(value, props)
  return Editing({
    maybeValue: Option.some(normalizeZero(value)),
    field: FieldDraft.Editing({ value: formatted, draft: formatted }),
    drag: PointerDrag.Idle(),
  })
}

const commitEditing = (state: Editing, props: Props): Idle => {
  const draft = state.field.draft.trim()
  if (draft.length === 0) {
    return Idle({
      maybeValue: Option.none(),
      field: FieldDraft.Idle({ value: '' }),
      drag: PointerDrag.Idle(),
    })
  }
  return Option.match(parseNumber(draft), {
    onNone: () => {
      const committed = state.field.value
      const maybeCommitted = parseNumber(committed)
      return Idle({
        maybeValue: maybeCommitted,
        field: FieldDraft.Idle({
          value: Option.match(maybeCommitted, {
            onNone: () => '',
            onSome: num => formatNumber(num, props),
          }),
        }),
        drag: PointerDrag.Idle(),
      })
    },
    onSome: parsed => {
      const rounded = roundNumber(parsed, props)
      const resolved = clampOnBlurOf(props)
        ? clampToBounds(rounded, props)
        : rounded
      return idleFromNumber(resolved, props)
    },
  })
}

const cancelEditing = (state: Editing, props: Props): Idle => {
  const [nextField] = FieldDraft.chart.transition(
    state.field,
    FieldDraft.CancelDraft(),
    fieldPropsOf(props),
  )
  const committedText = FieldDraft.valueOf(nextField)
  return Idle({
    maybeValue: parseNumber(committedText),
    field: FieldDraft.Idle({ value: committedText }),
    drag: PointerDrag.Idle(),
  })
}

const resetToIdle = (props: Props): Idle =>
  props.defaultValue === undefined
    ? Idle({
        maybeValue: Option.none(),
        field: FieldDraft.Idle({ value: '' }),
        drag: PointerDrag.Idle(),
      })
    : idleFromNumber(resolveExplicit(props.defaultValue, props), props)

const editingFieldOf = (
  field: FieldDraft.State,
  message: FieldDraft.Message,
  props: Props,
): FieldDraft.Editing => {
  const [next] = FieldDraft.chart.transition(
    field,
    message,
    fieldPropsOf(props),
  )
  return next._tag === 'Editing'
    ? next
    : FieldDraft.Editing({ value: next.value, draft: next.value })
}

const beginScrubFrom = (
  state: Idle | Editing,
  message: typeof BeginScrub.Type,
  props: Props,
): Scrubbing => {
  const baseNumber = Option.getOrElse(state.maybeValue, () =>
    clampToBounds(0, props),
  )
  const [nextDrag] = PointerDrag.chart.transition(
    PointerDrag.Idle(),
    PointerDrag.StartDrag({
      pointerId: message.pointerId,
      x: message.x,
      y: message.y,
      originValue: baseNumber,
    }),
    dragPropsOf(props),
  )
  const activeDrag =
    nextDrag._tag === 'Dragging'
      ? nextDrag
      : PointerDrag.Dragging({
          pointerId: message.pointerId,
          startX: message.x,
          startY: message.y,
          currentX: message.x,
          currentY: message.y,
          originValue: baseNumber,
          isActivated: true,
        })
  const formatted = Option.match(state.maybeValue, {
    onNone: () => '',
    onSome: num => formatNumber(num, props),
  })
  return Scrubbing({
    maybeValue: state.maybeValue,
    originValue: state.maybeValue,
    field: FieldDraft.Idle({ value: formatted }),
    drag: activeDrag,
  })
}

const moveScrubFrom = (
  state: Scrubbing,
  message: typeof MoveScrub.Type,
  props: Props,
): Scrubbing => {
  const dragProps = dragPropsOf(props)
  const [nextDrag] = PointerDrag.chart.transition(
    state.drag,
    PointerDrag.MoveDrag({
      pointerId: message.pointerId,
      x: message.x,
      y: message.y,
    }),
    dragProps,
  )
  const activeDrag = nextDrag._tag === 'Dragging' ? nextDrag : state.drag
  const deltaPx = PointerDrag.axisDeltaOf(activeDrag, dragProps)
  const stepCount = Math.trunc(deltaPx / scrubStepPxOf(props))
  const unit = message.isShift === true ? largeStepOf(props) : stepOf(props)
  const nextNumber = resolveStepped(
    Option.some(activeDrag.originValue),
    stepCount * unit,
    props,
  )
  return Scrubbing({
    maybeValue: Option.some(nextNumber),
    originValue: state.originValue,
    field: FieldDraft.Idle({ value: formatNumber(nextNumber, props) }),
    drag: activeDrag,
  })
}

const canEditGuard = (
  _state: State,
  _message: Message,
  context: Props,
): boolean => canEdit(context)

const isMatchingPointer = (
  activePointerId: number,
  incomingPointerId: number | undefined,
): boolean =>
  incomingPointerId === undefined || incomingPointerId === activePointerId

type KeyAction =
  | Readonly<{ _tag: 'Increment'; amount: number }>
  | Readonly<{ _tag: 'Decrement'; amount: number }>
  | Readonly<{ _tag: 'Min' }>
  | Readonly<{ _tag: 'Max' }>
  | Readonly<{ _tag: 'Commit' }>
  | Readonly<{ _tag: 'Cancel' }>

const resolveKeyAction = (
  message: typeof PressedNumberKey.Type,
  props: Props,
): Option.Option<KeyAction> => {
  if (message.isComposing === true || !canEdit(props)) {
    return Option.none()
  }
  const unit = message.isShift === true ? largeStepOf(props) : stepOf(props)
  if (message.key === 'ArrowUp') {
    return Option.some({ _tag: 'Increment', amount: unit })
  } else if (message.key === 'ArrowDown') {
    return Option.some({ _tag: 'Decrement', amount: unit })
  } else if (message.key === 'PageUp') {
    return Option.some({ _tag: 'Increment', amount: largeStepOf(props) })
  } else if (message.key === 'PageDown') {
    return Option.some({ _tag: 'Decrement', amount: largeStepOf(props) })
  } else if (message.key === 'Home' && props.min !== undefined) {
    return Option.some({ _tag: 'Min' })
  } else if (message.key === 'End' && props.max !== undefined) {
    return Option.some({ _tag: 'Max' })
  } else if (message.key === 'Enter') {
    return Option.some({ _tag: 'Commit' })
  } else if (message.key === 'Escape') {
    return Option.some({ _tag: 'Cancel' })
  } else {
    return Option.none()
  }
}

const applyIdleKey = (state: Idle, action: KeyAction, props: Props): Idle =>
  M.value(action).pipe(
    M.withReturnType<Idle>(),
    M.tagsExhaustive({
      Increment: ({ amount }) =>
        idleFromNumber(resolveStepped(state.maybeValue, amount, props), props),
      Decrement: ({ amount }) =>
        idleFromNumber(resolveStepped(state.maybeValue, -amount, props), props),
      Min: () =>
        props.min === undefined
          ? state
          : idleFromNumber(roundNumber(props.min, props), props),
      Max: () =>
        props.max === undefined
          ? state
          : idleFromNumber(roundNumber(props.max, props), props),
      Commit: () => state,
      Cancel: () => state,
    }),
  )

const editingKeyEdges = (): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    Editing,
    typeof PressedNumberKey.Type,
    never,
    Props
  >
> => [
  when(
    (_state: Editing, message: typeof PressedNumberKey.Type, context: Props) =>
      Option.filter(
        resolveKeyAction(message, context),
        action => action._tag === 'Commit' || action._tag === 'Cancel',
      ),
    'Idle',
    ({ state, guardValue, context }) =>
      guardValue._tag === 'Commit'
        ? commitEditing(state, context)
        : cancelEditing(state, context),
  ),
  when(
    (_state: Editing, message: typeof PressedNumberKey.Type, context: Props) =>
      Option.filter(
        resolveKeyAction(message, context),
        action => action._tag !== 'Commit' && action._tag !== 'Cancel',
      ),
    'Editing',
    ({ state, guardValue, context }) =>
      M.value(guardValue).pipe(
        M.withReturnType<Editing>(),
        M.tagsExhaustive({
          Increment: ({ amount }) =>
            editingFromNumber(
              resolveStepped(state.maybeValue, amount, context),
              context,
            ),
          Decrement: ({ amount }) =>
            editingFromNumber(
              resolveStepped(state.maybeValue, -amount, context),
              context,
            ),
          Min: () =>
            context.min === undefined
              ? state
              : editingFromNumber(roundNumber(context.min, context), context),
          Max: () =>
            context.max === undefined
              ? state
              : editingFromNumber(roundNumber(context.max, context), context),
        }),
      ),
  ),
  ignore(),
]

// CHART

/**
 * Builds the NumberInput Machine chart starting in `initialState`, composing
 * `FieldDraft` for text entry and `PointerDrag` for pointer scrubbing.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Idle: {
        on: {
          BeginNumberEdit: [
            when(canEditGuard, 'Editing', ({ state, context }) =>
              Editing({
                maybeValue: state.maybeValue,
                field: editingFieldOf(
                  state.field,
                  FieldDraft.BeginEdit(),
                  context,
                ),
                drag: PointerDrag.Idle(),
              }),
            ),
            ignore(),
          ],
          ChangeNumberInput: [
            when(canEditGuard, 'Editing', ({ state, message, context }) => {
              const nextField = editingFieldOf(
                state.field,
                FieldDraft.ChangeDraft({ value: message.value }),
                context,
              )
              return Editing({
                maybeValue: parseNumber(nextField.draft),
                field: nextField,
                drag: PointerDrag.Idle(),
              })
            }),
            ignore(),
          ],
          CommitNumberInput: [ignore()],
          CancelNumberInput: [ignore()],
          IncrementNumber: [
            when(canEditGuard, 'Idle', ({ state, context }) =>
              idleFromNumber(
                resolveStepped(state.maybeValue, stepOf(context), context),
                context,
              ),
            ),
            ignore(),
          ],
          DecrementNumber: [
            when(canEditGuard, 'Idle', ({ state, context }) =>
              idleFromNumber(
                resolveStepped(state.maybeValue, -stepOf(context), context),
                context,
              ),
            ),
            ignore(),
          ],
          SetNumberValue: [
            when(
              (_state, message, context) =>
                canEdit(context) && Number.isFinite(message.value),
              'Idle',
              ({ message, context }) =>
                idleFromNumber(
                  resolveExplicit(message.value, context),
                  context,
                ),
            ),
            ignore(),
          ],
          SetNumberToMin: [
            when(
              (_state, _message, context) =>
                canEdit(context)
                  ? Option.fromNullishOr(context.min)
                  : Option.none(),
              'Idle',
              ({ guardValue, context }) =>
                idleFromNumber(roundNumber(guardValue, context), context),
            ),
            ignore(),
          ],
          SetNumberToMax: [
            when(
              (_state, _message, context) =>
                canEdit(context)
                  ? Option.fromNullishOr(context.max)
                  : Option.none(),
              'Idle',
              ({ guardValue, context }) =>
                idleFromNumber(roundNumber(guardValue, context), context),
            ),
            ignore(),
          ],
          ClearNumberInput: [
            when(canEditGuard, 'Idle', () => initial),
            ignore(),
          ],
          ResetNumberInput: to('Idle', ({ context }) => resetToIdle(context)),
          EndNumberEdit: [ignore()],
          PressedNumberKey: [
            when(
              (_state, message, context) =>
                Option.filter(
                  resolveKeyAction(message, context),
                  action =>
                    action._tag !== 'Commit' && action._tag !== 'Cancel',
                ),
              'Idle',
              ({ state, guardValue, context }) =>
                applyIdleKey(state, guardValue, context),
            ),
            ignore(),
          ],
          BeginScrub: [
            when(canEditGuard, 'Scrubbing', ({ state, message, context }) =>
              beginScrubFrom(state, message, context),
            ),
            ignore(),
          ],
          MoveScrub: [ignore()],
          EndScrub: [ignore()],
          CancelScrub: [ignore()],
        },
      },
      Editing: {
        on: {
          BeginNumberEdit: [ignore()],
          ChangeNumberInput: [
            when(canEditGuard, 'Editing', ({ state, message, context }) => {
              const nextField = editingFieldOf(
                state.field,
                FieldDraft.ChangeDraft({ value: message.value }),
                context,
              )
              return Editing({
                maybeValue: parseNumber(nextField.draft),
                field: nextField,
                drag: PointerDrag.Idle(),
              })
            }),
            ignore(),
          ],
          CommitNumberInput: [
            when(canEditGuard, 'Idle', ({ state, context }) =>
              commitEditing(state, context),
            ),
            ignore(),
          ],
          CancelNumberInput: [
            when(canEditGuard, 'Idle', ({ state, context }) =>
              cancelEditing(state, context),
            ),
            ignore(),
          ],
          IncrementNumber: [
            when(canEditGuard, 'Editing', ({ state, context }) =>
              editingFromNumber(
                resolveStepped(state.maybeValue, stepOf(context), context),
                context,
              ),
            ),
            ignore(),
          ],
          DecrementNumber: [
            when(canEditGuard, 'Editing', ({ state, context }) =>
              editingFromNumber(
                resolveStepped(state.maybeValue, -stepOf(context), context),
                context,
              ),
            ),
            ignore(),
          ],
          SetNumberValue: [
            when(
              (_state, message, context) =>
                canEdit(context) && Number.isFinite(message.value),
              'Editing',
              ({ message, context }) =>
                editingFromNumber(
                  resolveExplicit(message.value, context),
                  context,
                ),
            ),
            ignore(),
          ],
          SetNumberToMin: [
            when(
              (_state, _message, context) =>
                canEdit(context)
                  ? Option.fromNullishOr(context.min)
                  : Option.none(),
              'Editing',
              ({ guardValue, context }) =>
                editingFromNumber(roundNumber(guardValue, context), context),
            ),
            ignore(),
          ],
          SetNumberToMax: [
            when(
              (_state, _message, context) =>
                canEdit(context)
                  ? Option.fromNullishOr(context.max)
                  : Option.none(),
              'Editing',
              ({ guardValue, context }) =>
                editingFromNumber(roundNumber(guardValue, context), context),
            ),
            ignore(),
          ],
          ClearNumberInput: [
            when(canEditGuard, 'Editing', () =>
              Editing({
                maybeValue: Option.none(),
                field: FieldDraft.Editing({ value: '', draft: '' }),
                drag: PointerDrag.Idle(),
              }),
            ),
            ignore(),
          ],
          ResetNumberInput: to('Idle', ({ context }) => resetToIdle(context)),
          EndNumberEdit: [
            when(canEditGuard, 'Idle', ({ state, context }) =>
              commitEditing(state, context),
            ),
            ignore(),
          ],
          PressedNumberKey: editingKeyEdges(),
          BeginScrub: [
            when(canEditGuard, 'Scrubbing', ({ state, message, context }) =>
              beginScrubFrom(state, message, context),
            ),
            ignore(),
          ],
          MoveScrub: [ignore()],
          EndScrub: [ignore()],
          CancelScrub: [ignore()],
        },
      },
      Scrubbing: {
        on: {
          BeginNumberEdit: [ignore()],
          ChangeNumberInput: [ignore()],
          CommitNumberInput: [ignore()],
          CancelNumberInput: [ignore()],
          IncrementNumber: [ignore()],
          DecrementNumber: [ignore()],
          SetNumberValue: [ignore()],
          SetNumberToMin: [ignore()],
          SetNumberToMax: [ignore()],
          ClearNumberInput: [ignore()],
          ResetNumberInput: to('Idle', ({ context }) => resetToIdle(context)),
          EndNumberEdit: [ignore()],
          PressedNumberKey: [
            when(
              (_state, message) => PointerDrag.isCancelKey(message.key),
              'Idle',
              ({ state, context }) =>
                Option.match(state.originValue, {
                  onNone: () => initial,
                  onSome: origin => idleFromNumber(origin, context),
                }),
            ),
            ignore(),
          ],
          BeginScrub: [ignore()],
          MoveScrub: [
            when(
              (state, message, context) =>
                canEdit(context) && message.pointerId === state.drag.pointerId,
              'Scrubbing',
              ({ state, message, context }) =>
                moveScrubFrom(state, message, context),
            ),
            ignore(),
          ],
          EndScrub: [
            when(
              (state, message) =>
                isMatchingPointer(state.drag.pointerId, message.pointerId),
              'Idle',
              ({ state }) =>
                Idle({
                  maybeValue: state.maybeValue,
                  field: state.field,
                  drag: PointerDrag.Idle(),
                }),
            ),
            ignore(),
          ],
          CancelScrub: [
            when(
              (state, message) =>
                isMatchingPointer(state.drag.pointerId, message.pointerId),
              'Idle',
              ({ state, context }) =>
                Option.match(state.originValue, {
                  onNone: () => initial,
                  onSome: origin => idleFromNumber(origin, context),
                }),
            ),
            ignore(),
          ],
        },
      },
    },
  })

/** The default NumberInput Machine chart starting empty and idle. */
export const chart = chartOf(initial)

// SYNC

/**
 * Builds the NumberInput sync table using `Pace.Settled({ afterMs })` for
 * `ChangeNumberInput`, `Pace.Sampled({ everyMs })` for `MoveScrub`, and
 * `Pace.Synced()` for discrete steps, commits, and cancels.
 */
export const syncOf = (
  settleMs: number = defaultSettleMs,
  sampleMs: number = defaultSampleMs,
): Readonly<Record<Message['_tag'], Sync>> => ({
  BeginNumberEdit: Synced(),
  ChangeNumberInput: Settled({ afterMs: settleMs }),
  CommitNumberInput: Synced(),
  CancelNumberInput: Synced(),
  IncrementNumber: Synced(),
  DecrementNumber: Synced(),
  SetNumberValue: Synced(),
  SetNumberToMin: Synced(),
  SetNumberToMax: Synced(),
  ClearNumberInput: Synced(),
  ResetNumberInput: Synced(),
  EndNumberEdit: Synced(),
  PressedNumberKey: Synced(),
  BeginScrub: Synced(),
  MoveScrub: Sampled({ everyMs: sampleMs }),
  EndScrub: Synced(),
  CancelScrub: Synced(),
})

/** Default synchronization table for NumberInput. */
export const synced: Readonly<Record<Message['_tag'], Sync>> = syncOf()

/** Device-only synchronization table for a NumberInput kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  BeginNumberEdit: Device({ because }),
  ChangeNumberInput: Device({ because }),
  CommitNumberInput: Device({ because }),
  CancelNumberInput: Device({ because }),
  IncrementNumber: Device({ because }),
  DecrementNumber: Device({ because }),
  SetNumberValue: Device({ because }),
  SetNumberToMin: Device({ because }),
  SetNumberToMax: Device({ because }),
  ClearNumberInput: Device({ because }),
  ResetNumberInput: Device({ because }),
  EndNumberEdit: Device({ because }),
  PressedNumberKey: Device({ because }),
  BeginScrub: Device({ because }),
  MoveScrub: Device({ because }),
  EndScrub: Device({ because }),
  CancelScrub: Device({ because }),
})

// SLOTS & PROJECTION

/**
 * The five painted slots of a NumberInput Part:
 * - `Input`: numeric input (`role="textbox"` with `valueMin`, `valueMax`, `valueNow`, `valueText`).
 * - `IncrementButton`: step-up button (`role="button"`, `IncrementNumber`).
 * - `DecrementButton`: step-down button (`role="button"`, `DecrementNumber`).
 * - `Scrubber`: pointer drag handle (`role="slider"` with numeric bounds).
 * - `Label`: clickable label linked via `aria-labelledby` (`BeginNumberEdit`).
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Input: {
    role: 'TextBox',
    focus: 'None',
    gestures: [],
  },
  IncrementButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'IncrementNumber' }],
  },
  DecrementButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'DecrementNumber' }],
  },
  Scrubber: {
    role: 'Slider',
    focus: 'None',
    gestures: [],
  },
  Label: {
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'BeginNumberEdit' }],
  },
}

const labelSlotPropsOf = (
  props: Props,
): Pick<SlotProps, 'label' | 'labelledBy'> => {
  if (props.labelledBy !== undefined) {
    return { labelledBy: props.labelledBy }
  } else if (props.hasLabel === false) {
    return props.label === undefined ? {} : { label: props.label }
  } else if (props.label !== undefined && props.hasLabel !== true) {
    return { label: props.label }
  } else {
    return { labelledBy: labelId(props.id) }
  }
}

const numericValueSlotPropsOf = (
  state: State,
  props: Props,
): Pick<SlotProps, 'valueMin' | 'valueMax' | 'valueNow' | 'valueText'> => {
  const displayText = props.valueText ?? textOf(state)
  return {
    ...(props.min === undefined ? {} : { valueMin: props.min }),
    ...(props.max === undefined ? {} : { valueMax: props.max }),
    ...Option.match(state.maybeValue, {
      onNone: () => ({}),
      onSome: valueNow => ({ valueNow }),
    }),
    ...(displayText.length === 0 ? {} : { valueText: displayText }),
  }
}

/**
 * Derives the virtual-keyboard `InputMode` for a NumberInput: falls back to
 * `'Text'` whenever `min` is omitted or negative (because iOS `'numeric'` and
 * `'decimal'` virtual keypads omit a minus `-` key), else `'Decimal'` when
 * fractional steps or precision are allowed, else `'Numeric'`.
 */
export const inputModeOf = (
  props: Pick<Props, 'min' | 'step' | 'precision'> = {},
): 'Text' | 'Decimal' | 'Numeric' => {
  if (props.min === undefined || props.min < 0) {
    return 'Text'
  }
  const hasDecimals =
    (props.precision !== undefined && props.precision > 0) ||
    !Number.isInteger(stepOf(props))
  return hasDecimals ? 'Decimal' : 'Numeric'
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  _maybeChoice: Option.Option<string>,
): SlotProps => {
  if (slot === 'Input') {
    const isInvalid = isInvalidOf(props) || isOutOfRange(state, props)
    return {
      id: inputId(props.id),
      tabIndex: isDisabledOf(props) ? -1 : 0,
      inputMode: inputModeOf(props),
      enterKeyHint: 'Done',
      ...labelSlotPropsOf(props),
      ...(props.describedBy === undefined
        ? {}
        : { describedBy: props.describedBy }),
      ...numericValueSlotPropsOf(state, props),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
      ...(isRequiredOf(props) ? { isRequired: true } : {}),
      ...(isInvalid ? { isInvalid: true } : {}),
    }
  } else if (slot === 'IncrementButton') {
    const isDisabled = !canIncrement(state, props)
    return {
      id: incrementButtonId(props.id),
      controls: inputId(props.id),
      label: 'Increment value',
      tabIndex: -1,
      isDisabled,
    }
  } else if (slot === 'DecrementButton') {
    const isDisabled = !canDecrement(state, props)
    return {
      id: decrementButtonId(props.id),
      controls: inputId(props.id),
      label: 'Decrement value',
      tabIndex: -1,
      isDisabled,
    }
  } else if (slot === 'Scrubber') {
    return {
      id: scrubberId(props.id),
      controls: inputId(props.id),
      label: 'Scrub value',
      orientation: 'Horizontal',
      dragAxis: 'Horizontal',
      ...numericValueSlotPropsOf(state, props),
      ...(!canEdit(props) ? { isDisabled: true } : {}),
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
 * What a restart opens a NumberInput on: settles editing or scrubbing to `Idle`
 * with `PointerDrag.Idle()` while preserving the latest value.
 */
export const atRest = (state: State): State =>
  M.value(state).pipe(
    M.withReturnType<State>(),
    M.tagsExhaustive({
      Idle: idle => idle,
      Editing: editing => {
        const settledText = FieldDraft.draftOf(editing.field)
        return Idle({
          maybeValue: Option.orElse(parseNumber(settledText), () =>
            parseNumber(editing.field.value),
          ),
          field: FieldDraft.Idle({ value: settledText }),
          drag: PointerDrag.Idle(),
        })
      },
      Scrubbing: scrubbing =>
        Idle({
          maybeValue: scrubbing.maybeValue,
          field: scrubbing.field,
          drag: PointerDrag.Idle(),
        }),
    }),
  )

// PART FACTORY

/** Options for customizing a NumberInput Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  sync?: 'Synced' | DeviceReason
  settleMs?: number
  sampleMs?: number
  defaultValue?: number
  precision?: number
  min?: number
  step?: number
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a NumberInput {@link Part.Part}. Synced by default (`category: 'Domain'`,
 * `ChangeNumberInput` at `Pace.Settled`, `MoveScrub` at `Pace.Sampled`, discrete
 * actions at `Pace.Synced`).
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const settleMs = options.settleMs ?? defaultSettleMs
  const sampleMs = options.sampleMs ?? defaultSampleMs
  const step = options.step ?? defaultStep
  const min = options.min ?? 0
  const initialState: State =
    options.defaultValue === undefined
      ? initial
      : initialValue(
          options.defaultValue,
          options.precision === undefined
            ? {}
            : { precision: options.precision },
        )
  return Part.define<State, Message, Props>({
    name: options.name ?? 'NumberInput',
    State,
    Message,
    chart: initialState === initial ? chart : chartOf(initialState),
    actions,
    sync:
      options.sync === undefined || options.sync === 'Synced'
        ? syncOf(settleMs, sampleMs)
        : deviceSync(options.sync),
    category: options.category ?? 'Domain',
    slots,
    atRest,
    project: projectSlot,
    configuration: options.configuration ?? {
      base: {
        pace: {
          ...defaultPace,
          typingSettleMs: settleMs,
          dragGrain: Step({ size: step, origin: min }),
          dragSampleMs: sampleMs,
        },
      },
      presets: {},
    },
  })
}

/** Shorthand for a NumberInput Part whose state stays on the device. */
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

/** The default synced NumberInput Part (`name: 'NumberInput'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()
