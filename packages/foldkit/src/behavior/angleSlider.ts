import { Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import { define, ignore, when } from '../experimental/machine/machine.js'
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
import type { SlotProps } from './slot.js'

// NOTE: this is the core AngleSlider Part (Widget #42 of 54, Scribe #2681).
// It composes `PointerDrag` (`Pace.Sampled` on live dial drags) into one
// framework-free Machine and Part declaration covering Zag angle-slider
// semantics. Its state (`Idle` | `Dragging`) lives in the Model, synced by
// default (`Domain` category), with `AngleSlider.make` and
// `AngleSlider.deviceOnly()` options. Reference-stable SlotBindings (`Root`,
// `Control`, `Thumb` with `role: 'Slider'`, `valueMin: 0`, `valueMax: 360`,
// `valueNow`, `valueText: '${angle}°'`) render across HTML, React, and React
// Native generic hosts with zero AngleSlider-specific painter logic.

// SCHEMAS & CONSTANTS

/** Minimum angle in degrees (`0`, 12 o'clock). */
export const minAngle = 0

/** Full revolution in degrees (`360`). */
export const maxAngle = 360

/** Half-circle conversion factor in degrees (`180`). */
const halfCircleDegrees = 180

/** Default degree step increment (`1`). */
export const defaultStep = 1

/** Default multiplier applied to `step` for PageUp / PageDown and Shift+Arrow (`10`). */
export const defaultLargeStepMultiplier = 10

/** Default pointer-move sync sampling window in milliseconds (`50`). */
export const defaultSampleMs: number = PointerDrag.defaultSampleMs

/**
 * Read-only props supplied to the AngleSlider chart and projection from the
 * Program's Model. Step size, disabled/readOnly flags, and accessibility
 * linkage stay out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  step: S.optionalKey(S.Number),
  largeStep: S.optionalKey(S.Number),
  defaultValue: S.optionalKey(S.Number),
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  isInvalid: S.optionalKey(S.Boolean),
  sampleMs: S.optionalKey(S.Number),
  label: S.optionalKey(S.String),
  labelledBy: S.optionalKey(S.String),
  describedBy: S.optionalKey(S.String),
})
/** Read-only props supplied to the AngleSlider chart and projection. */
export type Props = typeof Props.Type

// STATE

/** The angle dial is at rest, holding `angle` in `[0, 360)` and an idle `PointerDrag`. */
export const Idle = ts('Idle', {
  angle: S.Number,
  drag: PointerDrag.Idle,
})
/** The angle dial is at rest. */
export type Idle = typeof Idle.Type

/**
 * The angle dial is being dragged via `PointerDrag`, capturing `originAngle`
 * so cancel or Escape restores the starting orientation.
 */
export const Dragging = ts('Dragging', {
  angle: S.Number,
  originAngle: S.Number,
  drag: PointerDrag.Dragging,
})
/** The angle dial is being dragged. */
export type Dragging = typeof Dragging.Type

/** Where an AngleSlider Part stands: `Idle` or `Dragging`. Lives in the Model. */
export const State = S.Union([Idle, Dragging])
/** Where an AngleSlider Part stands. */
export type State = typeof State.Type

/**
 * Normalizes any angle in degrees into the wrapping range `[0, 360)`.
 *
 * @example
 * ```typescript
 * normalizeAngle(0) // 0
 * normalizeAngle(360) // 0
 * normalizeAngle(375) // 15
 * normalizeAngle(-30) // 330
 * ```
 */
export const normalizeAngle = (angle: number): number => {
  if (!Number.isFinite(angle)) {
    return minAngle
  }
  const wrapped = ((angle % maxAngle) + maxAngle) % maxAngle
  return Object.is(wrapped, -0) ? 0 : wrapped
}

/**
 * Snaps `angle` to the nearest `step` increment and wraps cleanly into
 * `[0, 360)` without floating-point drift.
 *
 * @example
 * ```typescript
 * snapAngle(14, 15) // 15
 * snapAngle(358, 5) // 0
 * snapAngle(-7, 15) // 0
 * ```
 */
export const snapAngle = (
  angle: number,
  step: number = defaultStep,
): number => {
  const normalized = normalizeAngle(angle)
  if (!Number.isFinite(step) || step <= 0) {
    return normalized
  }
  const snapped = Math.round(normalized / step) * step
  return normalizeAngle(PointerDrag.roundToStepPrecision(snapped, step))
}

/**
 * Purely computes the clockwise angle in degrees (`[0, 360)`) from 12 o'clock
 * (`(centerX, centerY - r)` = `0°`) to `(pointX, pointY)` using `Math.atan2`.
 *
 * - 12 o'clock -> `0°`
 * - 3 o'clock -> `90°`
 * - 6 o'clock -> `180°`
 * - 9 o'clock -> `270°`
 *
 * @example
 * ```typescript
 * angleFromPoint(50, 50, 50, 0) // 0
 * angleFromPoint(50, 50, 100, 50) // 90
 * angleFromPoint(50, 50, 50, 100) // 180
 * angleFromPoint(50, 50, 0, 50) // 270
 * ```
 */
export const angleFromPoint = (
  centerX: number,
  centerY: number,
  pointX: number,
  pointY: number,
): number => {
  const dx = pointX - centerX
  const dy = pointY - centerY
  const radians = Math.atan2(dx, -dy)
  const degrees = (radians * halfCircleDegrees) / Math.PI
  return normalizeAngle(degrees)
}

/** Initial AngleSlider state: `0°`, idle. */
export const initial: State = Idle({
  angle: minAngle,
  drag: PointerDrag.Idle(),
})

/** Creates an initial idle AngleSlider state normalized into `[0, 360)`. */
export const initialAngle = (angle: number): State =>
  Idle({
    angle: normalizeAngle(angle),
    drag: PointerDrag.Idle(),
  })

// ACTIONS

/** Sets the dial angle to `angle` degrees (wrapped and snapped to `props.step`). */
export const SetAngle = Catalog.action('SetAngle', {
  fields: { angle: S.Number },
  choose: {
    field: 'angle',
    noun: 'angle',
    prompt: 'Set dial to which degree angle?',
    token: S.FiniteFromString,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'Enter an angle in degrees',
  },
  what: 'Sets the dial angle to the chosen degree value',
  why: 'To orient the control directly to an exact direction',
  meta: { label: 'Set angle', keys: [] },
})

/** Rotates the dial angle by `delta` degrees (wrapping across 0/360 and snapped to `props.step`). */
export const StepAngle = Catalog.action('StepAngle', {
  fields: { delta: S.Number },
  what: 'Rotates the dial angle by a degree increment',
  why: 'To adjust orientation clockwise or counterclockwise',
  meta: { label: 'Step angle', keys: [] },
})

/** Restores the dial angle to `props.defaultValue` (or `0°`) and returns to `Idle`. */
export const ResetAngle = Catalog.action('ResetAngle', {
  what: 'Restores the dial angle to its starting position',
  why: 'To undo rotation adjustments and return to defaults',
  meta: { label: 'Reset angle', keys: [] },
})

/** The Catalog Actions an AngleSlider Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  SetAngle,
  StepAngle,
  ResetAngle,
]

// MESSAGES

/** A pointer went down on the angle control at `(pointX, pointY)` relative to `(centerX, centerY)`. */
export const BeginAngleDrag = m('BeginAngleDrag', {
  pointerId: S.Number,
  centerX: S.Number,
  centerY: S.Number,
  pointX: S.Number,
  pointY: S.Number,
})

/** The active drag pointer moved to `(pointX, pointY)` relative to `(centerX, centerY)`. Synced via `Pace.Sampled`. */
export const MoveAngleDrag = m('MoveAngleDrag', {
  pointerId: S.Number,
  centerX: S.Number,
  centerY: S.Number,
  pointX: S.Number,
  pointY: S.Number,
})

/** The active angle drag ended, committing the current angle. */
export const EndAngleDrag = m('EndAngleDrag', {
  pointerId: S.optionalKey(S.Number),
})

/** The active angle drag was cancelled, restoring `originAngle`. */
export const CancelAngleDrag = m('CancelAngleDrag', {
  pointerId: S.optionalKey(S.Number),
})

/** A keyboard key was pressed on the angle thumb (Arrows, PageUp, PageDown, Home, End, or Escape). */
export const PressedAngleKey = m('PressedAngleKey', {
  key: S.String,
  isShift: S.optionalKey(S.Boolean),
})

/** Every Message the AngleSlider chart handles. */
export const Message = S.Union([
  SetAngle,
  StepAngle,
  ResetAngle,
  BeginAngleDrag,
  MoveAngleDrag,
  EndAngleDrag,
  CancelAngleDrag,
  PressedAngleKey,
])
/** Every Message the AngleSlider chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the AngleSlider Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the angle slider root element id from a base `id`. */
export const rootId = (id: string): string => `${id}-root`

/** Derives the circular dial control element id from a base `id`. */
export const controlId = (id: string): string => `${id}-control`

/** Derives the angle slider thumb element id from a base `id`. */
export const thumbId = (id: string): string => `${id}-thumb`

// PURE CONFIGURATION READERS & KEYBOARD RULES

/** Resolved single-step degree increment (`1` by default). */
export const stepOf = (props: Pick<Props, 'step'> = {}): number =>
  props.step !== undefined && props.step > 0 ? props.step : defaultStep

/** Resolved large-step degree increment for PageUp / PageDown and Shift+Arrow (`10 * step` by default). */
export const largeStepOf = (
  props: Pick<Props, 'step' | 'largeStep'> = {},
): number =>
  props.largeStep !== undefined && props.largeStep > 0
    ? props.largeStep
    : stepOf(props) * defaultLargeStepMultiplier

/** True when the angle slider is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** True when the angle slider is read-only (`false` by default). */
export const isReadOnlyOf = (props: Pick<Props, 'isReadOnly'> = {}): boolean =>
  props.isReadOnly === true

/** True when the angle slider is marked invalid (`false` by default). */
export const isInvalidOf = (props: Pick<Props, 'isInvalid'> = {}): boolean =>
  props.isInvalid === true

/** True when user input can modify the angle (neither disabled nor read-only). */
export const canInteract = (
  props: Pick<Props, 'isDisabled' | 'isReadOnly'> = {},
): boolean => !isDisabledOf(props) && !isReadOnlyOf(props)

/** Current angle in degrees (`[0, 360)`). */
export const angleOf = (state: State): number => state.angle

/** Formats an angle as a human-readable degree string (`'90°'`). */
export const valueTextOf = (angle: number): string => `${angle.toString()}°`

/** True while `state` is `Idle`. */
export const isIdle = (state: State): boolean => state._tag === 'Idle'

/** True while `state` is `Dragging`. */
export const isDragging = (state: State): boolean => state._tag === 'Dragging'

/**
 * Resolves a keyboard key press into the next snapped, wrapped angle, or
 * `Option.none()` for unhandled keys.
 *
 * - `ArrowRight` / `ArrowUp`: `+step` (`+largeStep` with `isShift`)
 * - `ArrowLeft` / `ArrowDown`: `-step` (`-largeStep` with `isShift`)
 * - `PageUp`: `+largeStep`
 * - `PageDown`: `-largeStep`
 * - `Home`: `0`
 * - `End`: highest snapped angle strictly below `360` (`360 - step`, e.g. `359` for `step = 1`, `345` for `step = 15`)
 */
export const resolveAngleKey = (
  currentAngle: number,
  key: string,
  props: Pick<Props, 'step' | 'largeStep'> &
    Readonly<{ isShift?: boolean }> = {},
): Option.Option<number> => {
  const step = stepOf(props)
  const largeStep = largeStepOf(props)
  const arrowDelta = props.isShift === true ? largeStep : step

  if (key === 'Home') {
    return Option.some(minAngle)
  } else if (key === 'End') {
    return Option.some(snapAngle(maxAngle - step, step))
  } else if (key === 'PageUp') {
    return Option.some(snapAngle(currentAngle + largeStep, step))
  } else if (key === 'PageDown') {
    return Option.some(snapAngle(currentAngle - largeStep, step))
  } else if (key === 'ArrowRight' || key === 'ArrowUp') {
    return Option.some(snapAngle(currentAngle + arrowDelta, step))
  } else if (key === 'ArrowLeft' || key === 'ArrowDown') {
    return Option.some(snapAngle(currentAngle - arrowDelta, step))
  } else {
    return Option.none()
  }
}

// CHART

const dragPropsOf = (props: Props): PointerDrag.Props => ({
  axis: 'Both',
  ...(props.isDisabled === undefined ? {} : { isDisabled: props.isDisabled }),
  ...(props.isReadOnly === undefined ? {} : { isReadOnly: props.isReadOnly }),
  ...(props.sampleMs === undefined ? {} : { sampleMs: props.sampleMs }),
})

const canInteractGuard = (
  _state: State,
  _message: Message,
  context: Props,
): boolean => canInteract(context)

const resetToIdle = (context: Props): Idle =>
  Idle({
    angle: snapAngle(context.defaultValue ?? minAngle, stepOf(context)),
    drag: PointerDrag.Idle(),
  })

/**
 * Builds the AngleSlider Machine chart starting in `initialState`: composes
 * `PointerDrag.chart` for circular pointer dragging and handles 0..360 degree
 * wrapping, step snapping, keyboard navigation, disabled/readOnly guards, and
 * Escape cancellation.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Idle: {
        on: {
          SetAngle: [
            when(canInteractGuard, 'Idle', ({ message, context }) =>
              Idle({
                angle: snapAngle(message.angle, stepOf(context)),
                drag: PointerDrag.Idle(),
              }),
            ),
            ignore(),
          ],
          StepAngle: [
            when(canInteractGuard, 'Idle', ({ state, message, context }) =>
              Idle({
                angle: snapAngle(state.angle + message.delta, stepOf(context)),
                drag: PointerDrag.Idle(),
              }),
            ),
            ignore(),
          ],
          ResetAngle: [
            when(canInteractGuard, 'Idle', ({ context }) =>
              resetToIdle(context),
            ),
            ignore(),
          ],
          BeginAngleDrag: [
            when(
              canInteractGuard,
              'Dragging',
              ({ state, message, context }) => {
                const nextAngle = snapAngle(
                  angleFromPoint(
                    message.centerX,
                    message.centerY,
                    message.pointX,
                    message.pointY,
                  ),
                  stepOf(context),
                )
                const [nextDrag] = PointerDrag.chart.transition(
                  state.drag,
                  PointerDrag.StartDrag({
                    pointerId: message.pointerId,
                    x: message.pointX,
                    y: message.pointY,
                    originValue: state.angle,
                  }),
                  dragPropsOf(context),
                )
                const dragging =
                  nextDrag._tag === 'Dragging'
                    ? nextDrag
                    : PointerDrag.Dragging({
                        pointerId: message.pointerId,
                        startX: message.pointX,
                        startY: message.pointY,
                        currentX: message.pointX,
                        currentY: message.pointY,
                        originValue: state.angle,
                        isActivated: true,
                      })
                return Dragging({
                  angle: nextAngle,
                  originAngle: state.angle,
                  drag: dragging,
                })
              },
            ),
            ignore(),
          ],
          MoveAngleDrag: [ignore()],
          EndAngleDrag: [ignore()],
          CancelAngleDrag: [ignore()],
          PressedAngleKey: [
            when(
              (state, message, context) =>
                canInteract(context)
                  ? resolveAngleKey(state.angle, message.key, {
                      step: stepOf(context),
                      largeStep: largeStepOf(context),
                      ...(message.isShift === undefined
                        ? {}
                        : { isShift: message.isShift }),
                    })
                  : Option.none(),
              'Idle',
              ({ guardValue }) =>
                Idle({
                  angle: guardValue,
                  drag: PointerDrag.Idle(),
                }),
            ),
            ignore(),
          ],
        },
      },
      Dragging: {
        on: {
          SetAngle: [
            when(canInteractGuard, 'Dragging', ({ state, message, context }) =>
              Dragging({
                ...state,
                angle: snapAngle(message.angle, stepOf(context)),
              }),
            ),
            ignore(),
          ],
          StepAngle: [ignore()],
          ResetAngle: [
            when(canInteractGuard, 'Idle', ({ context }) =>
              resetToIdle(context),
            ),
            ignore(),
          ],
          BeginAngleDrag: [ignore()],
          MoveAngleDrag: [
            when(
              (state, message, context) =>
                canInteract(context) &&
                message.pointerId === state.drag.pointerId,
              'Dragging',
              ({ state, message, context }) => {
                const [nextDragState] = PointerDrag.chart.transition(
                  state.drag,
                  PointerDrag.MoveDrag({
                    pointerId: message.pointerId,
                    x: message.pointX,
                    y: message.pointY,
                  }),
                  dragPropsOf(context),
                )
                const nextDrag =
                  nextDragState._tag === 'Dragging' ? nextDragState : state.drag
                const nextAngle = snapAngle(
                  angleFromPoint(
                    message.centerX,
                    message.centerY,
                    message.pointX,
                    message.pointY,
                  ),
                  stepOf(context),
                )
                return Dragging({
                  ...state,
                  angle: nextAngle,
                  drag: nextDrag,
                })
              },
            ),
            ignore(),
          ],
          EndAngleDrag: [
            when(
              (state, message) =>
                message.pointerId === undefined ||
                message.pointerId === state.drag.pointerId,
              'Idle',
              ({ state, message, context }) => {
                const [endedDrag] = PointerDrag.chart.transition(
                  state.drag,
                  PointerDrag.EndDrag(
                    message.pointerId === undefined
                      ? {}
                      : { pointerId: message.pointerId },
                  ),
                  dragPropsOf(context),
                )
                return Idle({
                  angle: state.angle,
                  drag:
                    endedDrag._tag === 'Idle' ? endedDrag : PointerDrag.Idle(),
                })
              },
            ),
            ignore(),
          ],
          CancelAngleDrag: [
            when(
              (state, message) =>
                message.pointerId === undefined ||
                message.pointerId === state.drag.pointerId,
              'Idle',
              ({ state, message, context }) => {
                const [cancelledDrag] = PointerDrag.chart.transition(
                  state.drag,
                  PointerDrag.CancelDrag(
                    message.pointerId === undefined
                      ? {}
                      : { pointerId: message.pointerId },
                  ),
                  dragPropsOf(context),
                )
                return Idle({
                  angle: state.originAngle,
                  drag:
                    cancelledDrag._tag === 'Idle'
                      ? cancelledDrag
                      : PointerDrag.Idle(),
                })
              },
            ),
            ignore(),
          ],
          PressedAngleKey: [
            when(
              (_state, message) => PointerDrag.isCancelKey(message.key),
              'Idle',
              ({ state, context }) => {
                const [cancelledDrag] = PointerDrag.chart.transition(
                  state.drag,
                  PointerDrag.CancelDrag({}),
                  dragPropsOf(context),
                )
                return Idle({
                  angle: state.originAngle,
                  drag:
                    cancelledDrag._tag === 'Idle'
                      ? cancelledDrag
                      : PointerDrag.Idle(),
                })
              },
            ),
            ignore(),
          ],
        },
      },
    },
  })

/** Default AngleSlider Machine chart starting at `0°`, idle. */
export const chart = chartOf(initial)

// SYNC

/**
 * Builds the AngleSlider sync table using `Pace.Sampled({ everyMs })` on
 * `MoveAngleDrag` and `Pace.Synced()` on discrete adjustments, commits, and
 * cancels.
 */
export const syncOf = (
  sampleMs: number = defaultSampleMs,
): Readonly<Record<Message['_tag'], Sync>> => ({
  SetAngle: Synced(),
  StepAngle: Synced(),
  ResetAngle: Synced(),
  BeginAngleDrag: Synced(),
  MoveAngleDrag: Sampled({ everyMs: sampleMs }),
  EndAngleDrag: Synced(),
  CancelAngleDrag: Synced(),
  PressedAngleKey: Synced(),
})

/** Default synchronization: `MoveAngleDrag` sampled at 50 ms, discrete messages immediate. */
export const synced: Readonly<Record<Message['_tag'], Sync>> = syncOf()

/** Device-only synchronization table for an AngleSlider kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  SetAngle: Device({ because }),
  StepAngle: Device({ because }),
  ResetAngle: Device({ because }),
  BeginAngleDrag: Device({ because }),
  MoveAngleDrag: Device({ because }),
  EndAngleDrag: Device({ because }),
  CancelAngleDrag: Device({ because }),
  PressedAngleKey: Device({ because }),
})

// SLOTS & PROJECTION

/**
 * The three painted slots of an AngleSlider Part:
 * - `Root`: outer container carrying disabled/readOnly/invalid state.
 * - `Control`: circular dial surface receiving pointer interaction.
 * - `Thumb`: focusable angle slider thumb (`role="slider"`, `valueMin: 0`, `valueMax: 360`, `valueNow`, `valueText: '${angle}°'`).
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Root: {
    role: 'Group',
    focus: 'None',
    gestures: [],
  },
  Control: {
    focus: 'None',
    gestures: [],
  },
  Thumb: {
    role: 'Slider',
    focus: 'None',
    gestures: [],
  },
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  _maybeChoice: Option.Option<string>,
): SlotProps => {
  const disabled = isDisabledOf(props)
  const readOnly = isReadOnlyOf(props)
  const invalid = isInvalidOf(props)

  if (slot === 'Root') {
    return {
      id: rootId(props.id),
      ...(disabled ? { isDisabled: true } : {}),
      ...(readOnly ? { isReadOnly: true } : {}),
      ...(invalid ? { isInvalid: true } : {}),
    }
  } else if (slot === 'Control') {
    return {
      id: controlId(props.id),
      dragAxis: 'Plane',
      ...(disabled ? { isDisabled: true } : {}),
      ...(readOnly ? { isReadOnly: true } : {}),
    }
  } else if (slot === 'Thumb') {
    return {
      id: thumbId(props.id),
      dragAxis: 'Plane',
      valueMin: minAngle,
      valueMax: maxAngle,
      valueNow: state.angle,
      valueText: valueTextOf(state.angle),
      ...(props.label === undefined ? {} : { label: props.label }),
      ...(props.labelledBy === undefined
        ? {}
        : { labelledBy: props.labelledBy }),
      ...(props.describedBy === undefined
        ? {}
        : { describedBy: props.describedBy }),
      ...(disabled ? { isDisabled: true } : {}),
      ...(readOnly ? { isReadOnly: true } : {}),
      ...(invalid ? { isInvalid: true } : {}),
      tabIndex: disabled ? -1 : 0,
    }
  } else {
    return {}
  }
}

/**
 * What a restart opens an AngleSlider Part on: returns to `Idle` keeping the
 * latest settled `angle` and clearing any active drag.
 */
export const atRest = (state: State): State =>
  Idle({
    angle: state.angle,
    drag: PointerDrag.atRest(state.drag),
  })

// PART FACTORY

/** Options for customizing an AngleSlider Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (such as `'OwnView'`) to keep AngleSlider device-only. */
  sync?: 'Synced' | DeviceReason
  /** Initial angle in degrees (`0` by default). */
  defaultValue?: number
  /** Step increment in degrees used for default drag grain (`1` by default). */
  step?: number
  /** Pointer-move sync sampling interval in milliseconds (`50` by default). */
  sampleMs?: number
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates an AngleSlider {@link Part.Part}. Synced by default
 * (`category: 'Domain'`, `MoveAngleDrag` at `Pace.Sampled({ everyMs: 50 })`).
 * Use {@link deviceOnly} for local-only dials.
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const sampleMs = options.sampleMs ?? defaultSampleMs
  const step = options.step ?? defaultStep
  const initialState =
    options.defaultValue === undefined
      ? initial
      : initialAngle(snapAngle(options.defaultValue, step))
  return Part.define<State, Message, Props>({
    name: options.name ?? 'AngleSlider',
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
          dragGrain: Step({ size: step, origin: minAngle }),
          dragSampleMs: sampleMs,
        },
      },
      presets: {},
    },
  })
}

/**
 * Shorthand for an AngleSlider Part whose state stays on the device and is
 * omitted from the synced log and encoded Model.
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

/** The default synced AngleSlider Part (`name: 'AngleSlider'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()
