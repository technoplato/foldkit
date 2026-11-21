import { Array, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import { define, ignore, when } from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import {
  Device,
  type DeviceReason,
  Free,
  Sampled,
  type Sync,
  Synced,
  defaultPace,
} from './pace.js'
import * as Part from './part.js'
import * as PointerDrag from './pointerDrag.js'
import type { SlotProps } from './slot.js'

// NOTE: this is the core SignaturePad Part (Widget #47 of 54, Scribe #2686).
// It composes `PointerDrag` with `Pace.Sampled({ everyMs })` into one
// framework-free Machine and Part declaration covering Zag signature-pad:
// `StrokePoint` (`{ x, y, pressure }`), completed `strokes`, active
// `currentStroke`, `minPointDistancePx` point thinning, pure SVG polyline /
// quadratic Bezier path derivation (`strokeToSvgPath`, `allPathsOf`),
// `UndoStroke`, `ClearSignature`, `isEmptyOf`, `strokeCountOf`, and
// `isDisabled`/`isReadOnly` guards. Its state (`Idle` | `Drawing`) lives in
// the Model, synced by default (`Domain` category, `Pace.Sampled` on live
// pointer stroke moves) with `SignaturePad.make` and
// `SignaturePad.deviceOnly()`, and projects reference-stable SlotBindings
// (`Root`, `Segment`, `ClearButton`, `UndoButton`).

// CONSTANTS

/** Default minimum Euclidean distance in pixels between consecutive sampled stroke points (`2`). */
export const defaultMinPointDistancePx = 2

/** Default pen pressure when a pointer event supplies none (`0.5`). */
export const defaultPressure = 0.5

/** Default pointer-move sync sampling window in milliseconds (`50`). */
export const defaultSampleMs: number = PointerDrag.defaultSampleMs

/** Default accessible label for the signature pad surface. */
export const defaultLabel = 'Signature pad'

/** Default accessible label for the clear button. */
export const defaultClearLabel = 'Clear signature'

/** Default accessible label for the undo button. */
export const defaultUndoLabel = 'Undo stroke'

// SCHEMAS

/** One captured point along a signature stroke with clamped pressure in `[0, 1]`. */
export const StrokePoint = S.Struct({
  x: S.Number,
  y: S.Number,
  pressure: S.Number,
})
/** One captured point along a signature stroke. */
export type StrokePoint = typeof StrokePoint.Type

/** An ordered sequence of captured points forming one continuous stroke. */
export const Stroke = S.Array(StrokePoint)
/** An ordered sequence of captured points forming one continuous stroke. */
export type Stroke = typeof Stroke.Type

/**
 * Read-only configuration supplied to the SignaturePad chart and projection
 * from the Program's Model.
 */
export const Props = S.Struct({
  id: S.String,
  minPointDistancePx: S.optionalKey(S.Number),
  sampleMs: S.optionalKey(S.Number),
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  isRequired: S.optionalKey(S.Boolean),
  label: S.optionalKey(S.String),
  clearLabel: S.optionalKey(S.String),
  undoLabel: S.optionalKey(S.String),
})
/** Read-only configuration supplied to the SignaturePad chart and projection. */
export type Props = typeof Props.Type

// STATE

/** No stroke is actively being drawn; `strokes` holds every committed stroke. */
export const Idle = ts('Idle', {
  strokes: S.Array(Stroke),
})
/** No stroke is actively being drawn. */
export type Idle = typeof Idle.Type

/** A pointer is actively drawing `currentStroke` on top of previously committed `strokes`. */
export const Drawing = ts('Drawing', {
  strokes: S.Array(Stroke),
  currentStroke: Stroke,
  drag: PointerDrag.Dragging,
})
/** A pointer is actively drawing a stroke. */
export type Drawing = typeof Drawing.Type

/** Where a SignaturePad Part stands: `Idle` or `Drawing`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Drawing])
/** Where a SignaturePad Part stands. */
export type State = typeof State.Type

/** Initial SignaturePad state: idle with no strokes. */
export const initial: State = Idle({ strokes: [] })

/** Creates an initial idle SignaturePad state pre-populated with `strokes`. */
export const initialStrokes = (
  strokes: ReadonlyArray<ReadonlyArray<StrokePoint>>,
): State => Idle({ strokes })

// ACTIONS

/** Removes the most recent completed stroke (or discards the live stroke while drawing). */
export const UndoStroke = Catalog.action('UndoStroke', {
  what: 'Removes the most recently drawn signature stroke',
  why: 'To correct a stray mark without starting over',
  meta: { label: 'Undo stroke', keys: [] },
})

/** Erases every stroke from the signature pad and returns to an empty idle state. */
export const ClearSignature = Catalog.action('ClearSignature', {
  what: 'Erases all strokes from the signature surface',
  why: 'To draw a fresh autograph from scratch',
  meta: { label: 'Clear signature', keys: [] },
})

/** The Catalog Actions a SignaturePad Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  UndoStroke,
  ClearSignature,
]

// MESSAGES

/** Begins drawing a new stroke for `pointerId` at `(x, y)` with optional `pressure`. */
export const BeginSignatureStroke = m('BeginSignatureStroke', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
  pressure: S.optionalKey(S.Number),
})

/** Appends a pointer sample to the active stroke when separated by at least `minPointDistancePx`. Synced via `Pace.Sampled`. */
export const MoveSignatureStroke = m('MoveSignatureStroke', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
  pressure: S.optionalKey(S.Number),
})

/** Commits the active stroke onto `strokes` and returns to `Idle`. */
export const EndSignatureStroke = m('EndSignatureStroke', {
  pointerId: S.optionalKey(S.Number),
})

/** Discards the active stroke without modifying committed `strokes` and returns to `Idle`. */
export const CancelSignatureStroke = m('CancelSignatureStroke', {
  pointerId: S.optionalKey(S.Number),
})

/** A key was pressed while interacting with the signature pad (`Escape` cancels an active stroke). */
export const PressedSignatureKey = m('PressedSignatureKey', {
  key: S.String,
})

/** Every Message the SignaturePad chart handles. */
export const Message = S.Union([
  UndoStroke,
  ClearSignature,
  BeginSignatureStroke,
  MoveSignatureStroke,
  EndSignatureStroke,
  CancelSignatureStroke,
  PressedSignatureKey,
])
/** Every Message the SignaturePad chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the SignaturePad Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the root signature surface element id from a base `id`. */
export const rootId = (id: string): string => `${id}-root`

/** Derives the rendered vector stroke segment element id from a base `id`. */
export const segmentId = (id: string): string => `${id}-segment`

/** Derives the clear button element id from a base `id`. */
export const clearButtonId = (id: string): string => `${id}-clear`

/** Derives the undo button element id from a base `id`. */
export const undoButtonId = (id: string): string => `${id}-undo`

// PURE RULES & CONFIGURATION READERS

/** Resolved minimum Euclidean point-thinning distance in pixels (`2` by default, clamped `>= 0`). */
export const minPointDistancePxOf = (
  props: Pick<Props, 'minPointDistancePx'> = {},
): number => {
  const raw = props.minPointDistancePx ?? defaultMinPointDistancePx
  return Number.isFinite(raw) ? Math.max(0, raw) : defaultMinPointDistancePx
}

/** Resolved pointer-move sync sampling window in milliseconds (`50` by default). */
export const sampleMsOf = (props: Pick<Props, 'sampleMs'> = {}): number =>
  props.sampleMs ?? defaultSampleMs

/** True when the signature pad is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** True when the signature pad is read-only (`false` by default). */
export const isReadOnlyOf = (props: Pick<Props, 'isReadOnly'> = {}): boolean =>
  props.isReadOnly === true

/** True when a signature is required (`false` by default). */
export const isRequiredOf = (props: Pick<Props, 'isRequired'> = {}): boolean =>
  props.isRequired === true

/** True when user input may draw, undo, or clear strokes (neither disabled nor read-only). */
export const isInteractiveOf = (
  props: Pick<Props, 'isDisabled' | 'isReadOnly'> = {},
): boolean => !isDisabledOf(props) && !isReadOnlyOf(props)

/** Resolved accessible label for the signature pad surface (`'Signature pad'` by default). */
export const labelOf = (props: Pick<Props, 'label'> = {}): string =>
  props.label ?? defaultLabel

/** Resolved accessible label for the clear button (`'Clear signature'` by default). */
export const clearLabelOf = (props: Pick<Props, 'clearLabel'> = {}): string =>
  props.clearLabel ?? defaultClearLabel

/** Resolved accessible label for the undo button (`'Undo stroke'` by default). */
export const undoLabelOf = (props: Pick<Props, 'undoLabel'> = {}): string =>
  props.undoLabel ?? defaultUndoLabel

/** Projects `SignaturePad.Props` onto the underlying {@link PointerDrag.Props}. */
export const dragPropsOf = (
  props: Pick<Props, 'isDisabled' | 'isReadOnly' | 'sampleMs'> = {},
): PointerDrag.Props => ({
  axis: 'Both',
  isDisabled: isDisabledOf(props),
  isReadOnly: isReadOnlyOf(props),
  ...(props.sampleMs === undefined ? {} : { sampleMs: props.sampleMs }),
})

// PURE POINT THINNING & SVG PATH DERIVATION

/** Normalizes a raw pointer coordinate and optional pressure into a {@link StrokePoint}. */
export const makeStrokePoint = (
  x: number,
  y: number,
  pressure?: number,
): StrokePoint => ({
  x,
  y,
  pressure: PointerDrag.clampValue(
    pressure !== undefined && Number.isFinite(pressure)
      ? pressure
      : defaultPressure,
    0,
    1,
  ),
})

/** Euclidean distance in pixels between two stroke points. */
export const pointDistance = (from: StrokePoint, to: StrokePoint): number =>
  Math.hypot(to.x - from.x, to.y - from.y)

/**
 * True when `candidate` should be appended to `stroke` under `minDistancePx`:
 * always `true` for the first point, otherwise `true` when Euclidean distance
 * from the previous point is `>= minDistancePx`.
 */
export const shouldAcceptPoint = (
  stroke: ReadonlyArray<StrokePoint>,
  candidate: StrokePoint,
  minDistancePx: number = defaultMinPointDistancePx,
): boolean =>
  Option.match(Array.last(stroke), {
    onNone: () => true,
    onSome: last =>
      pointDistance(last, candidate) >= Math.max(0, minDistancePx),
  })

const formatCoord = (value: number): string => {
  const normalized = Object.is(value, -0) ? 0 : value
  const rounded = Number(normalized.toFixed(2))
  return rounded.toString()
}

const midpointOf = (
  first: StrokePoint,
  second: StrokePoint,
): PointerDrag.Point => ({
  x: (first.x + second.x) / 2,
  y: (first.y + second.y) / 2,
})

/**
 * Pure SVG path derivation from one stroke's points:
 * - 0 points: `''`
 * - 1 point: single point move/line `M x y L x y`
 * - 2 points: straight segment `M x0 y0 L x1 y1`
 * - 3+ points: smooth midpoint quadratic Bezier polyline `M x0 y0 Q ... L xn yn`
 *
 * @example
 * ```typescript
 * strokeToSvgPath([{ x: 0, y: 0, pressure: 0.5 }, { x: 10, y: 20, pressure: 0.5 }])
 * // 'M 0 0 L 10 20'
 * ```
 */
export const strokeToSvgPath = (points: ReadonlyArray<StrokePoint>): string =>
  Array.match(points, {
    onEmpty: () => '',
    onNonEmpty: nonEmpty => {
      const first = Array.headNonEmpty(nonEmpty)
      const start = `M ${formatCoord(first.x)} ${formatCoord(first.y)}`
      if (nonEmpty.length === 1) {
        return `${start} L ${formatCoord(first.x)} ${formatCoord(first.y)}`
      } else if (nonEmpty.length === 2) {
        const second = Array.lastNonEmpty(nonEmpty)
        return `${start} L ${formatCoord(second.x)} ${formatCoord(second.y)}`
      } else {
        const segments: Array<string> = [start]
        for (let index = 1; index < nonEmpty.length - 1; index += 1) {
          const maybeControl = Array.get(nonEmpty, index)
          const maybeNext = Array.get(nonEmpty, index + 1)
          if (Option.isSome(maybeControl) && Option.isSome(maybeNext)) {
            const control = maybeControl.value
            const mid = midpointOf(control, maybeNext.value)
            segments.push(
              `Q ${formatCoord(control.x)} ${formatCoord(control.y)} ${formatCoord(mid.x)} ${formatCoord(mid.y)}`,
            )
          }
        }
        const last = Array.lastNonEmpty(nonEmpty)
        segments.push(`L ${formatCoord(last.x)} ${formatCoord(last.y)}`)
        return Array.join(segments, ' ')
      }
    },
  })

/** Derived SVG path strings for every completed stroke in `state`. */
export const completedPathsOf = (state: State): ReadonlyArray<string> =>
  Array.filter(Array.map(state.strokes, strokeToSvgPath), path => path !== '')

/** Derived SVG path string for the active in-progress stroke while `Drawing`, or none. */
export const currentPathOf = (state: State): Option.Option<string> => {
  if (state._tag !== 'Drawing') {
    return Option.none()
  }
  const path = strokeToSvgPath(state.currentStroke)
  return path === '' ? Option.none() : Option.some(path)
}

/**
 * Derived SVG path strings for every completed stroke plus the active
 * `currentStroke` while `Drawing`.
 */
export const allPathsOf = (state: State): ReadonlyArray<string> =>
  Option.match(currentPathOf(state), {
    onNone: () => completedPathsOf(state),
    onSome: livePath => [...completedPathsOf(state), livePath],
  })

// READINGS

/** True while no stroke is actively being drawn. */
export const isIdle = (state: State): boolean => state._tag === 'Idle'

/** True while a pointer is actively drawing a stroke. */
export const isDrawing = (state: State): boolean => state._tag === 'Drawing'

/** Active in-progress stroke points while `Drawing`, or an empty array while `Idle`. */
export const currentStrokeOf = (state: State): ReadonlyArray<StrokePoint> =>
  state._tag === 'Drawing' ? state.currentStroke : []

/** Number of completed strokes committed in `state.strokes`. */
export const strokeCountOf = (state: State): number => state.strokes.length

/** True when there are no completed strokes and no active in-progress stroke points. */
export const isEmptyOf = (state: State): boolean =>
  Array.isReadonlyArrayEmpty(state.strokes) &&
  (state._tag === 'Idle' || Array.isReadonlyArrayEmpty(state.currentStroke))

/** True when `UndoStroke` can remove a stroke (interactive and non-empty). */
export const canUndo = (
  state: State,
  props: Pick<Props, 'isDisabled' | 'isReadOnly'> = {},
): boolean => isInteractiveOf(props) && !isEmptyOf(state)

/** True when `ClearSignature` can clear strokes (interactive and non-empty). */
export const canClear = (
  state: State,
  props: Pick<Props, 'isDisabled' | 'isReadOnly'> = {},
): boolean => isInteractiveOf(props) && !isEmptyOf(state)

// INTERNAL CHART HELPERS

const startDragOf = (
  pointerId: number,
  x: number,
  y: number,
  props: Props,
): Option.Option<PointerDrag.Dragging> => {
  const [nextDrag] = PointerDrag.chart.transition(
    PointerDrag.Idle(),
    PointerDrag.StartDrag({ pointerId, x, y, originValue: 0 }),
    dragPropsOf(props),
  )
  return nextDrag._tag === 'Dragging' ? Option.some(nextDrag) : Option.none()
}

const moveDragOf = (
  drag: PointerDrag.Dragging,
  pointerId: number,
  x: number,
  y: number,
  props: Props,
): PointerDrag.Dragging => {
  const [nextDrag] = PointerDrag.chart.transition(
    drag,
    PointerDrag.MoveDrag({ pointerId, x, y }),
    dragPropsOf(props),
  )
  return nextDrag._tag === 'Dragging' ? nextDrag : drag
}

const isMatchingPointer = (
  activePointerId: number,
  incomingPointerId: number | undefined,
): boolean =>
  incomingPointerId === undefined || incomingPointerId === activePointerId

// CHART

/**
 * The SignaturePad Machine chart: `Idle | Drawing` composing `PointerDrag`
 * with `Pace.Sampled` live stroke capture, `minPointDistancePx` thinning,
 * multi-stroke accumulation, `UndoStroke`, `ClearSignature`, Escape
 * cancellation, and `isDisabled`/`isReadOnly` guards.
 */
export const chart = define({ state: State, message: Message, context: Props })(
  {
    initial,
    states: {
      Idle: {
        on: {
          BeginSignatureStroke: [
            when(
              (_state, message, context) =>
                isInteractiveOf(context)
                  ? startDragOf(
                      message.pointerId,
                      message.x,
                      message.y,
                      context,
                    )
                  : Option.none(),
              'Drawing',
              ({ state, message, guardValue }) =>
                Drawing({
                  strokes: state.strokes,
                  currentStroke: [
                    makeStrokePoint(message.x, message.y, message.pressure),
                  ],
                  drag: guardValue,
                }),
            ),
            ignore(),
          ],
          MoveSignatureStroke: [ignore()],
          EndSignatureStroke: [ignore()],
          CancelSignatureStroke: [ignore()],
          UndoStroke: [
            when(
              (state, _message, context) =>
                isInteractiveOf(context) &&
                Array.isReadonlyArrayNonEmpty(state.strokes),
              'Idle',
              ({ state }) =>
                Idle({ strokes: Array.dropRight(state.strokes, 1) }),
            ),
            ignore(),
          ],
          ClearSignature: [
            when(
              (state, _message, context) =>
                isInteractiveOf(context) &&
                Array.isReadonlyArrayNonEmpty(state.strokes),
              'Idle',
              () => Idle({ strokes: [] }),
            ),
            ignore(),
          ],
          PressedSignatureKey: [ignore()],
        },
      },
      Drawing: {
        on: {
          BeginSignatureStroke: [ignore()],
          MoveSignatureStroke: [
            when(
              (state, message, context) =>
                isInteractiveOf(context) &&
                message.pointerId === state.drag.pointerId,
              'Drawing',
              ({ state, message, context }) => {
                const nextDrag = moveDragOf(
                  state.drag,
                  message.pointerId,
                  message.x,
                  message.y,
                  context,
                )
                const candidate = makeStrokePoint(
                  message.x,
                  message.y,
                  message.pressure,
                )
                const nextStroke = shouldAcceptPoint(
                  state.currentStroke,
                  candidate,
                  minPointDistancePxOf(context),
                )
                  ? [...state.currentStroke, candidate]
                  : state.currentStroke
                return Drawing({
                  strokes: state.strokes,
                  currentStroke: nextStroke,
                  drag: nextDrag,
                })
              },
            ),
            ignore(),
          ],
          EndSignatureStroke: [
            when(
              (state, message) =>
                isMatchingPointer(state.drag.pointerId, message.pointerId),
              'Idle',
              ({ state }) =>
                Idle({
                  strokes: Array.isReadonlyArrayNonEmpty(state.currentStroke)
                    ? [...state.strokes, state.currentStroke]
                    : state.strokes,
                }),
            ),
            ignore(),
          ],
          CancelSignatureStroke: [
            when(
              (state, message) =>
                isMatchingPointer(state.drag.pointerId, message.pointerId),
              'Idle',
              ({ state }) => Idle({ strokes: state.strokes }),
            ),
            ignore(),
          ],
          UndoStroke: [
            when(
              (_state, _message, context) => isInteractiveOf(context),
              'Idle',
              ({ state }) => Idle({ strokes: state.strokes }),
            ),
            ignore(),
          ],
          ClearSignature: [
            when(
              (_state, _message, context) => isInteractiveOf(context),
              'Idle',
              () => Idle({ strokes: [] }),
            ),
            ignore(),
          ],
          PressedSignatureKey: [
            when(
              (_state, message) => PointerDrag.isCancelKey(message.key),
              'Idle',
              ({ state }) => Idle({ strokes: state.strokes }),
            ),
            ignore(),
          ],
        },
      },
    },
  },
)

// SYNC

/**
 * Builds the SignaturePad sync table using `Pace.Sampled({ everyMs })` on
 * `MoveSignatureStroke` (50 ms default) and `Pace.Synced()` on stroke
 * begin/end/cancel, undo, clear, and Escape cancellation.
 */
export const syncOf = (
  sampleMs: number = defaultSampleMs,
): Readonly<Record<Message['_tag'], Sync>> => ({
  UndoStroke: Synced(),
  ClearSignature: Synced(),
  BeginSignatureStroke: Synced(),
  MoveSignatureStroke: Sampled({ everyMs: sampleMs }),
  EndSignatureStroke: Synced(),
  CancelSignatureStroke: Synced(),
  PressedSignatureKey: Synced(),
})

/** Default SignaturePad synchronization: `MoveSignatureStroke` sampled at 50 ms, all discrete transitions synced immediately. */
export const synced: Readonly<Record<Message['_tag'], Sync>> = syncOf()

/** Device-only synchronization table for a SignaturePad kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  UndoStroke: Device({ because }),
  ClearSignature: Device({ because }),
  BeginSignatureStroke: Device({ because }),
  MoveSignatureStroke: Device({ because }),
  EndSignatureStroke: Device({ because }),
  CancelSignatureStroke: Device({ because }),
  PressedSignatureKey: Device({ because }),
})

/** Returns the {@link Sync} pace for one SignaturePad Message under `sampleMs`. */
export const paceOf = (
  message: Message,
  sampleMs: number = defaultSampleMs,
): Sync => syncOf(sampleMs)[message._tag]

// SLOTS & PROJECTION

/**
 * The four painted slots of a SignaturePad Part: `Root`, `Segment`,
 * `ClearButton`, and `UndoButton`.
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Root: {
    role: 'Group',
    focus: 'Container',
    gestures: [],
  },
  Segment: {
    role: 'Region',
    focus: 'None',
    gestures: [],
  },
  ClearButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ClearSignature' }],
  },
  UndoButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'UndoStroke' }],
  },
}

const segmentLabelOf = (state: State): string => {
  const count = strokeCountOf(state)
  if (isEmptyOf(state)) {
    return 'Empty signature'
  } else if (isDrawing(state)) {
    return `Drawing stroke ${(count + 1).toString()}`
  } else if (count === 1) {
    return '1 stroke'
  } else {
    return `${count.toString()} strokes`
  }
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  _maybeChoice: Option.Option<string>,
): SlotProps => {
  const disabled = isDisabledOf(props)
  const readOnly = isReadOnlyOf(props)
  const required = isRequiredOf(props)

  if (slot === 'Root') {
    return {
      id: rootId(props.id),
      label: labelOf(props),
      dragAxis: 'Plane',
      ...(disabled ? { isDisabled: true } : { tabIndex: 0 }),
      ...(readOnly ? { isReadOnly: true } : {}),
      ...(required ? { isRequired: true } : {}),
    }
  } else if (slot === 'Segment') {
    return {
      id: segmentId(props.id),
      label: segmentLabelOf(state),
      ...(isEmptyOf(state) ? { isHidden: true } : {}),
    }
  } else if (slot === 'ClearButton') {
    return {
      id: clearButtonId(props.id),
      label: clearLabelOf(props),
      controls: rootId(props.id),
      isDisabled: !canClear(state, props),
    }
  } else if (slot === 'UndoButton') {
    return {
      id: undoButtonId(props.id),
      label: undoLabelOf(props),
      controls: rootId(props.id),
      isDisabled: !canUndo(state, props),
    }
  } else {
    return {}
  }
}

/**
 * What a restart opens a SignaturePad on: idle with every committed stroke
 * preserved and any half-drawn stroke discarded.
 */
export const atRest = (state: State): State => Idle({ strokes: state.strokes })

// PART FACTORY

/** Options for customizing a SignaturePad Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this SignaturePad device-only. */
  sync?: 'Synced' | DeviceReason
  /** Pointer-move sync sampling interval in milliseconds (`50` by default). */
  sampleMs?: number
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a SignaturePad {@link Part.Part}. Synced by default
 * (`category: 'Domain'`, `MoveSignatureStroke` at
 * `Pace.Sampled({ everyMs: 50 })`); pass `sync: 'OwnView'` (or use
 * {@link deviceOnly}) to keep a Program's SignaturePad local to one device.
 *
 * @example
 * ```typescript
 * const ContractSignature = SignaturePad.make({ name: 'ContractSignature' })
 * const LocalSignature = SignaturePad.deviceOnly({ name: 'LocalSignature' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const sampleMs = options.sampleMs ?? defaultSampleMs
  return Part.define<State, Message, Props>({
    name: options.name ?? 'SignaturePad',
    State,
    Message,
    chart,
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
          dragGrain: Free(),
          dragSampleMs: sampleMs,
        },
      },
      presets: {},
    },
  })
}

/** Shorthand for a SignaturePad Part whose state stays on the device and is omitted from the synced log and encoded Model. */
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

/** The default synced SignaturePad Part (`name: 'SignaturePad'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()
