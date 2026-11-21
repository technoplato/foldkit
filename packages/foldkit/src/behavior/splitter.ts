import { Array, Match as M, Option, Record, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import { define, ignore, when } from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import {
  Device,
  type DeviceReason,
  Sampled,
  type Sync,
  Synced,
  defaultPace,
} from './pace.js'
import * as Part from './part.js'
import * as PointerDrag from './pointerDrag.js'
import { SlotOrientation, type SlotProps } from './slot.js'

// NOTE: this is the core Splitter Part (Widget #41 of 54, Scribe #2680).
// It composes `PointerDrag` (`Pace.Sampled` on live resize handle moves) into
// one framework-free Machine and Part declaration covering Zag splitter
// semantics. Its state (`Idle` | `Resizing`) lives in the Model, synced by
// default (`Navigation` category), with `Splitter.make` and
// `Splitter.deviceOnly()` options. Reference-stable SlotBindings (`Root`,
// `Panel`, `ResizeTrigger` with `role: 'Slider'`) render across HTML, React,
// and React Native generic hosts with zero Splitter-specific painter logic.

// SCHEMAS & CONSTANTS

/** Total percentage sum across all panels (`100`). */
export const totalPercent = 100

/** Default percentage delta applied by Arrow keys (`1`). */
export const defaultKeyboardStep = 1

/** Default percentage delta applied by Shift+Arrow keys (`10`). */
export const defaultLargeStep = 10

/** Default pointer-move sync sampling window in milliseconds (`50`). */
export const defaultSampleMs: number = PointerDrag.defaultSampleMs

const sizePrecision = 10000
const epsilon = 0.0001
const defaultPanelCount = 2
const collapseHalfwayDivisor = 2

/** Splitter layout axis (`Horizontal` or `Vertical`). */
export const Orientation = SlotOrientation
/** Splitter layout axis. */
export type Orientation = typeof Orientation.Type

/** Default splitter orientation (`'Horizontal'`). */
export const defaultOrientation: Orientation = 'Horizontal'

/** Horizontal reading direction (`Ltr` or `Rtl`). */
export const Direction = PointerDrag.DragDirection
/** Horizontal reading direction. */
export type Direction = typeof Direction.Type

/** Default horizontal reading direction (`'Ltr'`). */
export const defaultDirection: Direction = 'Ltr'

/** Resize trigger source governing collapsible snap behavior. */
export const ResizeSource = S.Literals(['Pointer', 'Keyboard', 'Imperative'])
/** Resize trigger source. */
export type ResizeSource = typeof ResizeSource.Type

/** Configuration for one resizable panel in a Splitter group. */
export const PanelConfig = S.Struct({
  id: S.String,
  minSize: S.optionalKey(S.Number),
  maxSize: S.optionalKey(S.Number),
  collapsible: S.optionalKey(S.Boolean),
  collapsedSize: S.optionalKey(S.Number),
})
/** Configuration for one resizable panel in a Splitter group. */
export type PanelConfig = typeof PanelConfig.Type

/**
 * Read-only props supplied to the Splitter chart and projection from the
 * Program's Model. Panel bounds, orientation, keyboard increments, and labels
 * stay out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  panels: S.Array(PanelConfig),
  orientation: S.optionalKey(Orientation),
  direction: S.optionalKey(Direction),
  keyboardStep: S.optionalKey(S.Number),
  largeStep: S.optionalKey(S.Number),
  defaultSizes: S.optionalKey(S.Array(S.Number)),
  isDisabled: S.optionalKey(S.Boolean),
  sampleMs: S.optionalKey(S.Number),
  label: S.optionalKey(S.String),
})
/** Read-only props supplied to the Splitter chart and projection. */
export type Props = typeof Props.Type

/** Resolved ARIA range values for a resize handle. */
export type HandleBounds = Readonly<{
  valueMin: number
  valueMax: number
  valueNow: number
}>

/** Resolved numeric constraints for one panel. */
export type ResolvedPanelBounds = Readonly<{
  minSize: number
  maxSize: number
  collapsible: boolean
  collapsedSize: number
}>

// STATE

const sizesBeforeCollapseSchema = S.Record(S.String, S.Number)

/** The splitter is at rest, holding current percentage `sizes` summing to 100. */
export const Idle = ts('Idle', {
  sizes: S.Array(S.Number),
  sizesBeforeCollapse: sizesBeforeCollapseSchema,
  drag: PointerDrag.Idle,
})
/** The splitter is at rest. */
export type Idle = typeof Idle.Type

/**
 * The handle at `activeHandleIndex` is actively being dragged via `PointerDrag`,
 * capturing `originSizes` so cancel or Escape restores the layout.
 */
export const Resizing = ts('Resizing', {
  sizes: S.Array(S.Number),
  sizesBeforeCollapse: sizesBeforeCollapseSchema,
  activeHandleIndex: S.Number,
  originSizes: S.Array(S.Number),
  drag: PointerDrag.Dragging,
})
/** A splitter handle is being dragged. */
export type Resizing = typeof Resizing.Type

/** Where a Splitter Part stands: `Idle` or `Resizing`. Lives in the Model. */
export const State = S.Union([Idle, Resizing])
/** Where a Splitter Part stands. */
export type State = typeof State.Type

const roundPercent = (value: number): number => {
  const rounded = Math.round(value * sizePrecision) / sizePrecision
  return Object.is(rounded, -0) ? 0 : rounded
}

const isNearlyEqual = (left: number, right: number): boolean =>
  Math.abs(left - right) <= epsilon

const sizeAt = (sizes: ReadonlyArray<number>, index: number): number =>
  Option.getOrElse(Array.get(sizes, index), () => 0)

const replaceAt = (
  values: ReadonlyArray<number>,
  index: number,
  nextValue: number,
): ReadonlyArray<number> =>
  Array.map(values, (existing, current) =>
    current === index ? nextValue : existing,
  )

const sumOf = (values: ReadonlyArray<number>): number =>
  Array.reduce(values, 0, (total, value) => total + value)

const equalSizesOf = (count: number): ReadonlyArray<number> => {
  if (count <= 0) {
    return []
  }
  const share = roundPercent(totalPercent / count)
  return Array.makeBy(count, index =>
    index === count - 1
      ? roundPercent(totalPercent - share * (count - 1))
      : share,
  )
}

/** Resolves normalized numeric bounds for `panel`. */
export const panelBoundsOf = (panel?: PanelConfig): ResolvedPanelBounds => {
  const collapsedSize = PointerDrag.clampValue(
    panel?.collapsedSize ?? 0,
    0,
    totalPercent,
  )
  const minSize = PointerDrag.clampValue(panel?.minSize ?? 0, 0, totalPercent)
  const maxSize = PointerDrag.clampValue(
    panel?.maxSize ?? totalPercent,
    minSize,
    totalPercent,
  )
  return {
    minSize,
    maxSize,
    collapsible: panel?.collapsible === true,
    collapsedSize: Math.min(collapsedSize, minSize),
  }
}

const panelBoundsAt = (
  panels: ReadonlyArray<PanelConfig>,
  index: number,
): ResolvedPanelBounds =>
  panelBoundsOf(Option.getOrUndefined(Array.get(panels, index)))

/**
 * Normalizes a percentage sizes array so it matches `panels.length` (when
 * supplied), respects per-panel `[minSize, maxSize]` (or `collapsedSize`), and
 * sums cleanly to `100`.
 */
export const normalizeSizes = (
  sizes: ReadonlyArray<number>,
  panels: ReadonlyArray<PanelConfig> = [],
): ReadonlyArray<number> => {
  const count = Array.isReadonlyArrayNonEmpty(panels)
    ? panels.length
    : Array.isReadonlyArrayNonEmpty(sizes)
      ? sizes.length
      : defaultPanelCount
  if (count <= 0) {
    return []
  }
  const base =
    sizes.length === count
      ? Array.map(sizes, value =>
          Number.isFinite(value)
            ? PointerDrag.clampValue(value, 0, totalPercent)
            : 0,
        )
      : equalSizesOf(count)
  const total = sumOf(base)
  const scaled =
    total <= epsilon
      ? equalSizesOf(count)
      : Array.map(base, value => (value / total) * totalPercent)
  const clamped: ReadonlyArray<number> = Array.map(scaled, (value, index) => {
    const bounds = panelBoundsAt(panels, index)
    if (bounds.collapsible && isNearlyEqual(value, bounds.collapsedSize)) {
      return bounds.collapsedSize
    } else {
      return PointerDrag.clampValue(value, bounds.minSize, bounds.maxSize)
    }
  })
  const remainder = totalPercent - sumOf(clamped)
  const adjusted = Array.reduce(
    Array.makeBy(count, index => count - 1 - index),
    { values: clamped, remaining: remainder },
    (acc, index) => {
      if (Math.abs(acc.remaining) <= epsilon) {
        return acc
      }
      const bounds = panelBoundsAt(panels, index)
      const current = sizeAt(acc.values, index)
      const effectiveMin =
        bounds.collapsible && isNearlyEqual(current, bounds.collapsedSize)
          ? bounds.collapsedSize
          : bounds.minSize
      const next = PointerDrag.clampValue(
        current + acc.remaining,
        effectiveMin,
        bounds.maxSize,
      )
      return {
        values: replaceAt(acc.values, index, next),
        remaining: acc.remaining - (next - current),
      }
    },
  )
  const rounded = Array.map(adjusted.values, roundPercent)
  const roundingError = roundPercent(totalPercent - sumOf(rounded))
  if (Math.abs(roundingError) > 0 && count > 0) {
    const lastIndex = count - 1
    return replaceAt(
      rounded,
      lastIndex,
      roundPercent(sizeAt(rounded, lastIndex) + roundingError),
    )
  } else {
    return rounded
  }
}

/** Initial Splitter state: two equal 50/50 panels, idle. */
export const initial: State = Idle({
  sizes: equalSizesOf(defaultPanelCount),
  sizesBeforeCollapse: {},
  drag: PointerDrag.Idle(),
})

/** Creates an initial idle Splitter state with normalized `sizes`. */
export const initialSizes = (
  sizes: ReadonlyArray<number>,
  panels: ReadonlyArray<PanelConfig> = [],
): State =>
  Idle({
    sizes: normalizeSizes(sizes, panels),
    sizesBeforeCollapse: {},
    drag: PointerDrag.Idle(),
  })

// ACTIONS

/** Replaces all panel percentage sizes at once, normalized to sum to 100. */
export const SetSizes = Catalog.action('SetSizes', {
  fields: { sizes: S.Array(S.Number) },
  what: 'Sets percentage sizes across all splitter panels',
  why: 'To restore or apply a custom pane layout',
  meta: { label: 'Set sizes', keys: [] },
})

/** Redistributes percentage space across panels adjacent to `handleIndex` by `deltaPercent`. */
export const ResizeHandle = Catalog.action('ResizeHandle', {
  fields: {
    handleIndex: S.Number,
    deltaPercent: S.Number,
  },
  what: 'Shifts a splitter divider by a percentage delta',
  why: 'To allocate more or less space between neighboring panes',
  meta: { label: 'Resize handle', keys: [] },
})

/** Collapses the collapsible panel identified by `panelId` to its `collapsedSize`. */
export const CollapsePanel = Catalog.action('CollapsePanel', {
  fields: { panelId: S.String },
  choose: {
    field: 'panelId',
    noun: 'panel',
    prompt: 'Collapse which panel?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No panel is available',
  },
  what: 'Collapses a collapsible splitter panel to its minimal size',
  why: 'To hide secondary panes and free room for neighbors',
  meta: { label: 'Collapse panel', keys: [] },
})

/** Expands a collapsed panel identified by `panelId` back to its previous or minimum size. */
export const ExpandPanel = Catalog.action('ExpandPanel', {
  fields: { panelId: S.String },
  choose: {
    field: 'panelId',
    noun: 'panel',
    prompt: 'Expand which panel?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No panel is available',
  },
  what: 'Expands a collapsed splitter panel back to an open size',
  why: 'To bring hidden pane content back into view',
  meta: { label: 'Expand panel', keys: [] },
})

/** Toggles collapse or expand on the collapsible panel beside `handleIndex`. */
export const TogglePanelCollapse = Catalog.action('TogglePanelCollapse', {
  fields: { handleIndex: S.Number },
  choose: {
    field: 'handleIndex',
    noun: 'handle',
    prompt: 'Toggle collapse on which handle?',
    token: S.FiniteFromString.pipe(S.decodeTo(S.Int)),
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No handle is available',
  },
  what: 'Collapses or expands the collapsible pane beside a divider',
  why: 'To switch pane visibility quickly from the divider',
  meta: { label: 'Toggle collapse', keys: [] },
})

/** Restores all panel sizes back to `props.defaultSizes` or equal shares. */
export const ResetSizes = Catalog.action('ResetSizes', {
  what: 'Restores splitter panels to their starting proportions',
  why: 'To return the layout to its balanced defaults',
  meta: { label: 'Reset sizes', keys: [] },
})

/** The Catalog Actions a Splitter Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  SetSizes,
  ResizeHandle,
  CollapsePanel,
  ExpandPanel,
  TogglePanelCollapse,
  ResetSizes,
]

// MESSAGES

/** A pointer went down on the resize trigger at `handleIndex` to begin dragging. */
export const BeginResize = m('BeginResize', {
  handleIndex: S.Number,
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
})

/**
 * The active resize pointer moved to `(x, y)` inside a splitter container of
 * `containerSizePx` pixels along the layout axis. Synced via `Pace.Sampled`.
 */
export const MoveResize = m('MoveResize', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
  containerSizePx: S.Number,
})

/** The active resize drag ended, committing the current panel sizes. */
export const EndResize = m('EndResize', {
  pointerId: S.optionalKey(S.Number),
})

/** The active resize drag was cancelled, restoring pre-drag `originSizes`. */
export const CancelResize = m('CancelResize', {
  pointerId: S.optionalKey(S.Number),
})

/** A keyboard key was pressed on the resize trigger at `handleIndex` (Arrows, Home, End, Enter, or Escape). */
export const PressedSplitterKey = m('PressedSplitterKey', {
  handleIndex: S.Number,
  key: S.String,
  isShift: S.optionalKey(S.Boolean),
})

/** Every Message the Splitter chart handles. */
export const Message = S.Union([
  SetSizes,
  ResizeHandle,
  CollapsePanel,
  ExpandPanel,
  TogglePanelCollapse,
  ResetSizes,
  BeginResize,
  MoveResize,
  EndResize,
  CancelResize,
  PressedSplitterKey,
])
/** Every Message the Splitter chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Splitter Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the splitter root element id from a base `id`. */
export const rootId = (id: string): string => `${id}-root`

/** Derives one panel element id from a base `id` and `panelId`. */
export const panelId = (id: string, targetPanelId: string): string =>
  `${id}-panel-${targetPanelId}`

/** Derives one resize trigger element id from a base `id` and 0-based `handleIndex`. */
export const resizeTriggerId = (id: string, handleIndex: number): string =>
  `${id}-handle-${handleIndex.toString()}`

// PURE CONFIGURATION READERS & PANEL MATH

/** Resolved splitter orientation (`'Horizontal'` by default). */
export const orientationOf = (
  props: Pick<Props, 'orientation'> = {},
): Orientation => props.orientation ?? defaultOrientation

/** Resolved horizontal reading direction (`'Ltr'` by default). */
export const directionOf = (props: Pick<Props, 'direction'> = {}): Direction =>
  props.direction ?? defaultDirection

/** Resolved arrow-key resize percentage step (`1` by default). */
export const keyboardStepOf = (
  props: Pick<Props, 'keyboardStep'> = {},
): number => Math.max(epsilon, props.keyboardStep ?? defaultKeyboardStep)

/** Resolved Shift+Arrow resize percentage step (`10` by default). */
export const largeStepOf = (props: Pick<Props, 'largeStep'> = {}): number =>
  Math.max(epsilon, props.largeStep ?? defaultLargeStep)

/** True when resizing is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** Current percentage sizes of `state`. */
export const sizesOf = (state: State): ReadonlyArray<number> => state.sizes

/** True while `state` is `Idle`. */
export const isIdle = (state: State): boolean => state._tag === 'Idle'

/** True while `state` is `Resizing`. */
export const isResizing = (state: State): boolean => state._tag === 'Resizing'

/** Active handle index while `Resizing`, or `Option.none()` while `Idle`. */
export const activeHandleIndexOf = (state: State): Option.Option<number> =>
  state._tag === 'Resizing'
    ? Option.some(state.activeHandleIndex)
    : Option.none()

/** True when the panel at `index` is collapsible and currently at its `collapsedSize`. */
export const isPanelIndexCollapsed = (
  sizes: ReadonlyArray<number>,
  index: number,
  panels: ReadonlyArray<PanelConfig>,
): boolean => {
  const bounds = panelBoundsAt(panels, index)
  return (
    bounds.collapsible &&
    isNearlyEqual(sizeAt(sizes, index), bounds.collapsedSize)
  )
}

/** True when the panel named `targetPanelId` is collapsible and currently collapsed. */
export const isPanelCollapsed = (
  state: State,
  targetPanelId: string,
  props: Pick<Props, 'panels'>,
): boolean =>
  Option.exists(
    Array.findFirstIndex(props.panels, panel => panel.id === targetPanelId),
    index => isPanelIndexCollapsed(state.sizes, index, props.panels),
  )

const clampPanelTarget = (
  bounds: ResolvedPanelBounds,
  targetSize: number,
  source: ResizeSource,
): number => {
  if (!bounds.collapsible) {
    return PointerDrag.clampValue(targetSize, bounds.minSize, bounds.maxSize)
  }
  if (targetSize <= bounds.collapsedSize + epsilon) {
    return bounds.collapsedSize
  }
  if (targetSize < bounds.minSize - epsilon) {
    if (source === 'Pointer') {
      const halfway =
        bounds.collapsedSize +
        (bounds.minSize - bounds.collapsedSize) / collapseHalfwayDivisor
      return targetSize <= halfway ? bounds.collapsedSize : bounds.minSize
    } else {
      return bounds.collapsedSize
    }
  }
  return PointerDrag.clampValue(targetSize, bounds.minSize, bounds.maxSize)
}

const isValidHandleIndex = (handleIndex: number, panelCount: number): boolean =>
  Number.isInteger(handleIndex) &&
  handleIndex >= 0 &&
  handleIndex < panelCount - 1

const adjustedDeltaForKeyboard = (
  sizes: ReadonlyArray<number>,
  handleIndex: number,
  deltaPercent: number,
  panels: ReadonlyArray<PanelConfig>,
): number => {
  const beforeIndex = handleIndex
  const afterIndex = handleIndex + 1
  const growingIndex = deltaPercent > 0 ? beforeIndex : afterIndex
  const shrinkingIndex = deltaPercent > 0 ? afterIndex : beforeIndex
  const sign = deltaPercent > 0 ? 1 : -1

  const growBounds = panelBoundsAt(panels, growingIndex)
  const growSize = sizeAt(sizes, growingIndex)
  if (
    growBounds.collapsible &&
    isNearlyEqual(growSize, growBounds.collapsedSize)
  ) {
    const needed = growBounds.minSize - growSize
    if (needed > Math.abs(deltaPercent) + epsilon) {
      return sign * needed
    }
  }

  const shrinkBounds = panelBoundsAt(panels, shrinkingIndex)
  const shrinkSize = sizeAt(sizes, shrinkingIndex)
  if (
    shrinkBounds.collapsible &&
    isNearlyEqual(shrinkSize, shrinkBounds.minSize)
  ) {
    const needed = shrinkSize - shrinkBounds.collapsedSize
    if (needed > Math.abs(deltaPercent) + epsilon) {
      return sign * needed
    }
  }

  return deltaPercent
}

/**
 * Purely redistributes `deltaPercent` across the panels on either side of
 * `handleIndex` (between panel `handleIndex` and panel `handleIndex + 1`),
 * respecting every panel's `minSize`, `maxSize`, `collapsible`, and
 * `collapsedSize` while preserving a total sum of `100`.
 *
 * Positive `deltaPercent` grows panel `handleIndex` (and cascades leftward if
 * needed) while shrinking panel `handleIndex + 1` (and cascading rightward).
 * Negative `deltaPercent` reverses the direction.
 *
 * @example
 * ```typescript
 * resizeByDelta([50, 50], 0, 20, [{ id: 'a', minSize: 20 }, { id: 'b', minSize: 20 }])
 * // [70, 30]
 * ```
 */
export const resizeByDelta = (
  sizes: ReadonlyArray<number>,
  handleIndex: number,
  deltaPercent: number,
  panels: ReadonlyArray<PanelConfig> = [],
  source: ResizeSource = 'Pointer',
): ReadonlyArray<number> => {
  const count = sizes.length
  if (
    count < defaultPanelCount ||
    !isValidHandleIndex(handleIndex, count) ||
    !Number.isFinite(deltaPercent) ||
    Math.abs(deltaPercent) <= epsilon
  ) {
    return sizes
  }

  const effectiveDelta =
    source === 'Keyboard'
      ? adjustedDeltaForKeyboard(sizes, handleIndex, deltaPercent, panels)
      : deltaPercent

  const isPositive = effectiveDelta > 0
  const growIndices: ReadonlyArray<number> = isPositive
    ? Array.makeBy(handleIndex + 1, offset => handleIndex - offset)
    : Array.makeBy(
        count - (handleIndex + 1),
        offset => handleIndex + 1 + offset,
      )
  const shrinkIndices: ReadonlyArray<number> = isPositive
    ? Array.makeBy(
        count - (handleIndex + 1),
        offset => handleIndex + 1 + offset,
      )
    : Array.makeBy(handleIndex + 1, offset => handleIndex - offset)

  const maxGrowCapacity = Array.reduce(growIndices, 0, (total, index) => {
    const bounds = panelBoundsAt(panels, index)
    const current = sizeAt(sizes, index)
    return total + Math.max(0, bounds.maxSize - current)
  })
  const requested = Math.min(Math.abs(effectiveDelta), maxGrowCapacity)
  if (requested <= epsilon) {
    return sizes
  }

  const shrunk = Array.reduce(
    shrinkIndices,
    { values: sizes, applied: 0 },
    (acc, index) => {
      const remaining = requested - acc.applied
      if (remaining <= epsilon) {
        return acc
      }
      const current = sizeAt(acc.values, index)
      const bounds = panelBoundsAt(panels, index)
      const target = current - remaining
      const next = clampPanelTarget(bounds, target, source)
      const freed = current - next
      if (freed <= epsilon) {
        return acc
      }
      return {
        values: replaceAt(acc.values, index, next),
        applied: acc.applied + freed,
      }
    },
  )

  if (shrunk.applied <= epsilon) {
    return sizes
  }

  const grown = Array.reduce(
    growIndices,
    { values: shrunk.values, remaining: shrunk.applied },
    (acc, index) => {
      if (acc.remaining <= epsilon) {
        return acc
      }
      const current = sizeAt(acc.values, index)
      const bounds = panelBoundsAt(panels, index)
      const target = current + acc.remaining
      const next =
        bounds.collapsible &&
        isNearlyEqual(current, bounds.collapsedSize) &&
        target < bounds.minSize - epsilon
          ? current
          : PointerDrag.clampValue(target, bounds.minSize, bounds.maxSize)
      const gained = next - current
      if (gained <= epsilon) {
        return acc
      }
      return {
        values: replaceAt(acc.values, index, next),
        remaining: acc.remaining - gained,
      }
    },
  )

  if (grown.remaining > epsilon) {
    return sizes
  }

  const rounded = Array.map(grown.values, roundPercent)
  const drift = roundPercent(totalPercent - sumOf(rounded))
  const finalSizes =
    Math.abs(drift) > 0
      ? replaceAt(
          rounded,
          handleIndex,
          roundPercent(sizeAt(rounded, handleIndex) + drift),
        )
      : rounded

  return isNearlyEqual(sumOf(finalSizes), totalPercent) ? finalSizes : sizes
}

/**
 * Computes WAI-ARIA `valueMin`, `valueMax`, and `valueNow` for the resize
 * trigger at `handleIndex` (representing panel `handleIndex`'s size range).
 */
export const handleBoundsOf = (
  sizes: ReadonlyArray<number>,
  handleIndex: number,
  panels: ReadonlyArray<PanelConfig>,
): HandleBounds => {
  const count = Math.max(sizes.length, panels.length)
  if (!isValidHandleIndex(handleIndex, count)) {
    return { valueMin: 0, valueMax: totalPercent, valueNow: 0 }
  }
  const targetBounds = panelBoundsAt(panels, handleIndex)
  const targetMin = targetBounds.collapsible
    ? targetBounds.collapsedSize
    : targetBounds.minSize
  const totals = Array.reduce(
    Array.makeBy(count, index => index),
    { otherMin: 0, otherMax: 0 },
    (acc, index) => {
      if (index === handleIndex) {
        return acc
      }
      const bounds = panelBoundsAt(panels, index)
      const minContribution = bounds.collapsible
        ? bounds.collapsedSize
        : bounds.minSize
      return {
        otherMin: acc.otherMin + minContribution,
        otherMax: acc.otherMax + bounds.maxSize,
      }
    },
  )
  const valueMin = Math.round(
    Math.max(targetMin, totalPercent - totals.otherMax),
  )
  const valueMax = Math.round(
    Math.min(targetBounds.maxSize, totalPercent - totals.otherMin),
  )
  const valueNow = Math.round(sizeAt(sizes, handleIndex))
  return {
    valueMin: PointerDrag.clampValue(valueMin, 0, totalPercent),
    valueMax: PointerDrag.clampValue(valueMax, valueMin, totalPercent),
    valueNow: PointerDrag.clampValue(valueNow, 0, totalPercent),
  }
}

const collapsePanelByIndex = (
  sizes: ReadonlyArray<number>,
  sizesBeforeCollapse: Readonly<Record<string, number>>,
  panelIndex: number,
  panels: ReadonlyArray<PanelConfig>,
): Option.Option<
  Readonly<{
    sizes: ReadonlyArray<number>
    sizesBeforeCollapse: Readonly<Record<string, number>>
  }>
> => {
  const maybePanel = Array.get(panels, panelIndex)
  if (Option.isNone(maybePanel)) {
    return Option.none()
  }
  const panel = maybePanel.value
  const bounds = panelBoundsOf(panel)
  if (!bounds.collapsible) {
    return Option.none()
  }
  const currentSize = sizeAt(sizes, panelIndex)
  if (isNearlyEqual(currentSize, bounds.collapsedSize)) {
    return Option.none()
  }
  const isLast = panelIndex === sizes.length - 1
  const handleIndex = isLast ? panelIndex - 1 : panelIndex
  const delta = isLast
    ? currentSize - bounds.collapsedSize
    : bounds.collapsedSize - currentSize
  const nextSizes = resizeByDelta(
    sizes,
    handleIndex,
    delta,
    panels,
    'Imperative',
  )
  return Option.some({
    sizes: nextSizes,
    sizesBeforeCollapse: { ...sizesBeforeCollapse, [panel.id]: currentSize },
  })
}

const expandPanelByIndex = (
  sizes: ReadonlyArray<number>,
  sizesBeforeCollapse: Readonly<Record<string, number>>,
  panelIndex: number,
  panels: ReadonlyArray<PanelConfig>,
): Option.Option<
  Readonly<{
    sizes: ReadonlyArray<number>
    sizesBeforeCollapse: Readonly<Record<string, number>>
  }>
> => {
  const maybePanel = Array.get(panels, panelIndex)
  if (Option.isNone(maybePanel)) {
    return Option.none()
  }
  const panel = maybePanel.value
  const bounds = panelBoundsOf(panel)
  if (!bounds.collapsible) {
    return Option.none()
  }
  const currentSize = sizeAt(sizes, panelIndex)
  if (!isNearlyEqual(currentSize, bounds.collapsedSize)) {
    return Option.none()
  }
  const savedSize = sizesBeforeCollapse[panel.id]
  const restoreTarget =
    savedSize !== undefined && savedSize >= bounds.minSize
      ? savedSize
      : bounds.minSize
  const isLast = panelIndex === sizes.length - 1
  const handleIndex = isLast ? panelIndex - 1 : panelIndex
  const delta = isLast
    ? currentSize - restoreTarget
    : restoreTarget - currentSize
  const nextSizes = resizeByDelta(
    sizes,
    handleIndex,
    delta,
    panels,
    'Imperative',
  )
  return Option.some({
    sizes: nextSizes,
    sizesBeforeCollapse: Record.remove(sizesBeforeCollapse, panel.id),
  })
}

const toggleCollapseForHandle = (
  sizes: ReadonlyArray<number>,
  sizesBeforeCollapse: Readonly<Record<string, number>>,
  handleIndex: number,
  panels: ReadonlyArray<PanelConfig>,
): Option.Option<
  Readonly<{
    sizes: ReadonlyArray<number>
    sizesBeforeCollapse: Readonly<Record<string, number>>
  }>
> => {
  if (!isValidHandleIndex(handleIndex, panels.length)) {
    return Option.none()
  }
  const beforeBounds = panelBoundsAt(panels, handleIndex)
  const afterBounds = panelBoundsAt(panels, handleIndex + 1)
  const maybeTargetIndex = beforeBounds.collapsible
    ? Option.some(handleIndex)
    : afterBounds.collapsible
      ? Option.some(handleIndex + 1)
      : Option.none<number>()
  return Option.flatMap(maybeTargetIndex, targetIndex =>
    isPanelIndexCollapsed(sizes, targetIndex, panels)
      ? expandPanelByIndex(sizes, sizesBeforeCollapse, targetIndex, panels)
      : collapsePanelByIndex(sizes, sizesBeforeCollapse, targetIndex, panels),
  )
}

/**
 * Resolves a keyboard key press on a resize handle into either a resize delta
 * (`'Resize'`), a collapse toggle (`'ToggleCollapse'`), or `Option.none()`.
 */
export const resolveSplitterKey = (
  key: string,
  props: Pick<
    Props,
    'orientation' | 'direction' | 'keyboardStep' | 'largeStep'
  > &
    Readonly<{ isShift?: boolean }> = {},
): Option.Option<
  | Readonly<{ _tag: 'Resize'; deltaPercent: number }>
  | Readonly<{ _tag: 'ToggleCollapse' }>
> => {
  if (key === 'Enter') {
    return Option.some({ _tag: 'ToggleCollapse' })
  }
  const step =
    props.isShift === true ? largeStepOf(props) : keyboardStepOf(props)
  const isHorizontal = orientationOf(props) === 'Horizontal'
  const sign = isHorizontal && directionOf(props) === 'Rtl' ? -1 : 1
  if (key === 'Home') {
    return Option.some({ _tag: 'Resize', deltaPercent: -totalPercent })
  } else if (key === 'End') {
    return Option.some({ _tag: 'Resize', deltaPercent: totalPercent })
  } else if (isHorizontal && key === 'ArrowLeft') {
    return Option.some({ _tag: 'Resize', deltaPercent: -step * sign })
  } else if (isHorizontal && key === 'ArrowRight') {
    return Option.some({ _tag: 'Resize', deltaPercent: step * sign })
  } else if (!isHorizontal && key === 'ArrowUp') {
    return Option.some({ _tag: 'Resize', deltaPercent: -step })
  } else if (!isHorizontal && key === 'ArrowDown') {
    return Option.some({ _tag: 'Resize', deltaPercent: step })
  } else {
    return Option.none()
  }
}

// CHART

const dragPropsOf = (props: Props): PointerDrag.Props => ({
  axis: orientationOf(props),
  direction: directionOf(props),
  ...(props.isDisabled === undefined ? {} : { isDisabled: props.isDisabled }),
  ...(props.sampleMs === undefined ? {} : { sampleMs: props.sampleMs }),
})

const resetSizesFor = (context: Props): Idle =>
  Idle({
    sizes: normalizeSizes(context.defaultSizes ?? [], context.panels),
    sizesBeforeCollapse: {},
    drag: PointerDrag.Idle(),
  })

/**
 * Builds the Splitter Machine chart starting in `initialState`: composes
 * `PointerDrag.chart` for pointer handle resizing and handles multi-panel
 * percentage redistribution, collapse/expand, keyboard controls, and Escape
 * cancellation.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Idle: {
        on: {
          SetSizes: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Idle',
              ({ state, message, context }) =>
                Idle({
                  sizes: normalizeSizes(message.sizes, context.panels),
                  sizesBeforeCollapse: state.sizesBeforeCollapse,
                  drag: PointerDrag.Idle(),
                }),
            ),
            ignore(),
          ],
          ResizeHandle: [
            when(
              (state, message, context) =>
                !isDisabledOf(context) &&
                isValidHandleIndex(message.handleIndex, state.sizes.length),
              'Idle',
              ({ state, message, context }) =>
                Idle({
                  sizes: resizeByDelta(
                    state.sizes,
                    message.handleIndex,
                    message.deltaPercent,
                    context.panels,
                    'Imperative',
                  ),
                  sizesBeforeCollapse: state.sizesBeforeCollapse,
                  drag: PointerDrag.Idle(),
                }),
            ),
            ignore(),
          ],
          CollapsePanel: [
            when(
              (state, message, context) =>
                !isDisabledOf(context)
                  ? Option.flatMap(
                      Array.findFirstIndex(
                        context.panels,
                        panel => panel.id === message.panelId,
                      ),
                      index =>
                        collapsePanelByIndex(
                          state.sizes,
                          state.sizesBeforeCollapse,
                          index,
                          context.panels,
                        ),
                    )
                  : Option.none(),
              'Idle',
              ({ guardValue }) =>
                Idle({
                  sizes: guardValue.sizes,
                  sizesBeforeCollapse: guardValue.sizesBeforeCollapse,
                  drag: PointerDrag.Idle(),
                }),
            ),
            ignore(),
          ],
          ExpandPanel: [
            when(
              (state, message, context) =>
                !isDisabledOf(context)
                  ? Option.flatMap(
                      Array.findFirstIndex(
                        context.panels,
                        panel => panel.id === message.panelId,
                      ),
                      index =>
                        expandPanelByIndex(
                          state.sizes,
                          state.sizesBeforeCollapse,
                          index,
                          context.panels,
                        ),
                    )
                  : Option.none(),
              'Idle',
              ({ guardValue }) =>
                Idle({
                  sizes: guardValue.sizes,
                  sizesBeforeCollapse: guardValue.sizesBeforeCollapse,
                  drag: PointerDrag.Idle(),
                }),
            ),
            ignore(),
          ],
          TogglePanelCollapse: [
            when(
              (state, message, context) =>
                !isDisabledOf(context)
                  ? toggleCollapseForHandle(
                      state.sizes,
                      state.sizesBeforeCollapse,
                      message.handleIndex,
                      context.panels,
                    )
                  : Option.none(),
              'Idle',
              ({ guardValue }) =>
                Idle({
                  sizes: guardValue.sizes,
                  sizesBeforeCollapse: guardValue.sizesBeforeCollapse,
                  drag: PointerDrag.Idle(),
                }),
            ),
            ignore(),
          ],
          ResetSizes: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Idle',
              ({ context }) => resetSizesFor(context),
            ),
            ignore(),
          ],
          BeginResize: [
            when(
              (state, message, context) =>
                !isDisabledOf(context) &&
                isValidHandleIndex(message.handleIndex, state.sizes.length),
              'Resizing',
              ({ state, message, context }) => {
                const originSize = sizeAt(state.sizes, message.handleIndex)
                const [nextDrag] = PointerDrag.chart.transition(
                  state.drag,
                  PointerDrag.StartDrag({
                    pointerId: message.pointerId,
                    x: message.x,
                    y: message.y,
                    originValue: originSize,
                  }),
                  dragPropsOf(context),
                )
                const dragging =
                  nextDrag._tag === 'Dragging'
                    ? nextDrag
                    : PointerDrag.Dragging({
                        pointerId: message.pointerId,
                        startX: message.x,
                        startY: message.y,
                        currentX: message.x,
                        currentY: message.y,
                        originValue: originSize,
                        isActivated: true,
                      })
                return Resizing({
                  sizes: state.sizes,
                  sizesBeforeCollapse: state.sizesBeforeCollapse,
                  activeHandleIndex: message.handleIndex,
                  originSizes: state.sizes,
                  drag: dragging,
                })
              },
            ),
            ignore(),
          ],
          MoveResize: [ignore()],
          EndResize: [ignore()],
          CancelResize: [ignore()],
          PressedSplitterKey: [
            when(
              (state, message, context) =>
                !isDisabledOf(context) &&
                isValidHandleIndex(message.handleIndex, state.sizes.length)
                  ? resolveSplitterKey(message.key, {
                      orientation: orientationOf(context),
                      direction: directionOf(context),
                      keyboardStep: keyboardStepOf(context),
                      largeStep: largeStepOf(context),
                      ...(message.isShift === undefined
                        ? {}
                        : { isShift: message.isShift }),
                    })
                  : Option.none(),
              'Idle',
              ({ state, message, guardValue, context }) =>
                M.value(guardValue).pipe(
                  M.withReturnType<Idle>(),
                  M.tagsExhaustive({
                    Resize: ({ deltaPercent }) =>
                      Idle({
                        sizes: resizeByDelta(
                          state.sizes,
                          message.handleIndex,
                          deltaPercent,
                          context.panels,
                          'Keyboard',
                        ),
                        sizesBeforeCollapse: state.sizesBeforeCollapse,
                        drag: PointerDrag.Idle(),
                      }),
                    ToggleCollapse: () =>
                      Option.match(
                        toggleCollapseForHandle(
                          state.sizes,
                          state.sizesBeforeCollapse,
                          message.handleIndex,
                          context.panels,
                        ),
                        {
                          onNone: () => state,
                          onSome: toggled =>
                            Idle({
                              sizes: toggled.sizes,
                              sizesBeforeCollapse: toggled.sizesBeforeCollapse,
                              drag: PointerDrag.Idle(),
                            }),
                        },
                      ),
                  }),
                ),
            ),
            ignore(),
          ],
        },
      },
      Resizing: {
        on: {
          SetSizes: [ignore()],
          ResizeHandle: [ignore()],
          CollapsePanel: [ignore()],
          ExpandPanel: [ignore()],
          TogglePanelCollapse: [ignore()],
          ResetSizes: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Idle',
              ({ context }) => resetSizesFor(context),
            ),
            ignore(),
          ],
          BeginResize: [ignore()],
          MoveResize: [
            when(
              (state, message, context) =>
                !isDisabledOf(context) &&
                message.pointerId === state.drag.pointerId,
              'Resizing',
              ({ state, message, context }) => {
                const [nextDragState] = PointerDrag.chart.transition(
                  state.drag,
                  PointerDrag.MoveDrag({
                    pointerId: message.pointerId,
                    x: message.x,
                    y: message.y,
                  }),
                  dragPropsOf(context),
                )
                const nextDrag =
                  nextDragState._tag === 'Dragging' ? nextDragState : state.drag
                const deltaPx = PointerDrag.axisDeltaOf(nextDrag, {
                  axis: orientationOf(context),
                  direction: directionOf(context),
                })
                const deltaPercent =
                  message.containerSizePx > 0
                    ? (deltaPx / message.containerSizePx) * totalPercent
                    : 0
                const nextSizes = resizeByDelta(
                  state.originSizes,
                  state.activeHandleIndex,
                  deltaPercent,
                  context.panels,
                  'Pointer',
                )
                return Resizing({
                  ...state,
                  sizes: nextSizes,
                  drag: nextDrag,
                })
              },
            ),
            ignore(),
          ],
          EndResize: [
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
                  sizes: state.sizes,
                  sizesBeforeCollapse: state.sizesBeforeCollapse,
                  drag:
                    endedDrag._tag === 'Idle' ? endedDrag : PointerDrag.Idle(),
                })
              },
            ),
            ignore(),
          ],
          CancelResize: [
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
                  sizes: state.originSizes,
                  sizesBeforeCollapse: state.sizesBeforeCollapse,
                  drag:
                    cancelledDrag._tag === 'Idle'
                      ? cancelledDrag
                      : PointerDrag.Idle(),
                })
              },
            ),
            ignore(),
          ],
          PressedSplitterKey: [
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
                  sizes: state.originSizes,
                  sizesBeforeCollapse: state.sizesBeforeCollapse,
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

/** Default Splitter Machine chart starting in 50/50 `Idle`. */
export const chart = chartOf(initial)

// SYNC

/**
 * Builds the Splitter sync table using `Pace.Sampled({ everyMs })` on
 * `MoveResize` and `Pace.Synced()` on discrete resizes, commits, cancels, and
 * collapse/expand actions.
 */
export const syncOf = (
  sampleMs: number = defaultSampleMs,
): Readonly<Record<Message['_tag'], Sync>> => ({
  SetSizes: Synced(),
  ResizeHandle: Synced(),
  CollapsePanel: Synced(),
  ExpandPanel: Synced(),
  TogglePanelCollapse: Synced(),
  ResetSizes: Synced(),
  BeginResize: Synced(),
  MoveResize: Sampled({ everyMs: sampleMs }),
  EndResize: Synced(),
  CancelResize: Synced(),
  PressedSplitterKey: Synced(),
})

/** Default synchronization: `MoveResize` sampled at 50 ms, discrete messages immediate. */
export const synced: Readonly<Record<Message['_tag'], Sync>> = syncOf()

/** Device-only synchronization table for a Splitter kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  SetSizes: Device({ because }),
  ResizeHandle: Device({ because }),
  CollapsePanel: Device({ because }),
  ExpandPanel: Device({ because }),
  TogglePanelCollapse: Device({ because }),
  ResetSizes: Device({ because }),
  BeginResize: Device({ because }),
  MoveResize: Device({ because }),
  EndResize: Device({ because }),
  CancelResize: Device({ because }),
  PressedSplitterKey: Device({ because }),
})

// SLOTS & PROJECTION

/**
 * The three painted slots of a Splitter Part:
 * - `Root`: outer layout container (`role="group"`, `orientation`).
 * - `Panel`: indexed/named resizable panel region (`role="region"`, `isHidden` when collapsed to 0).
 * - `ResizeTrigger`: interactive resize divider (`role="slider"`, `orientation`, `valueMin`, `valueMax`, `valueNow`, `controls`, `tabIndex`).
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Root: {
    role: 'Group',
    focus: 'None',
    gestures: [],
  },
  Panel: {
    role: 'Region',
    focus: 'None',
    gestures: [],
  },
  ResizeTrigger: {
    role: 'Slider',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'TogglePanelCollapse' }],
  },
}

const parseHandleChoice = (maybeChoice: Option.Option<string>): number =>
  Option.match(maybeChoice, {
    onNone: () => 0,
    onSome: raw => {
      const parsed = Number(raw)
      return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0
    },
  })

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  const orientation = orientationOf(props)
  const disabled = isDisabledOf(props)

  if (slot === 'Root') {
    return {
      id: rootId(props.id),
      orientation,
      ...(props.label === undefined ? {} : { label: props.label }),
      ...(disabled ? { isDisabled: true } : {}),
    }
  } else if (slot === 'Panel') {
    return Option.match(maybeChoice, {
      onNone: () => ({}),
      onSome: choice => {
        const maybeIndex = Array.findFirstIndex(
          props.panels,
          panel => panel.id === choice,
        )
        const isCollapsedToZero = Option.exists(maybeIndex, index => {
          const bounds = panelBoundsAt(props.panels, index)
          return (
            bounds.collapsible &&
            bounds.collapsedSize === 0 &&
            isNearlyEqual(sizeAt(state.sizes, index), 0)
          )
        })
        return {
          id: panelId(props.id, choice),
          ...(isCollapsedToZero ? { isHidden: true } : {}),
        }
      },
    })
  } else if (slot === 'ResizeTrigger') {
    const handleIndex = parseHandleChoice(maybeChoice)
    const bounds = handleBoundsOf(state.sizes, handleIndex, props.panels)
    const maybeBefore = Array.get(props.panels, handleIndex)
    const maybeAfter = Array.get(props.panels, handleIndex + 1)
    const maybeControls = Option.map(
      Option.all([maybeBefore, maybeAfter]),
      ([before, after]) =>
        `${panelId(props.id, before.id)} ${panelId(props.id, after.id)}`,
    )
    return {
      id: resizeTriggerId(props.id, handleIndex),
      orientation,
      valueMin: bounds.valueMin,
      valueMax: bounds.valueMax,
      valueNow: bounds.valueNow,
      valueText: `${bounds.valueNow.toString()}%`,
      ...Option.match(maybeControls, {
        onNone: () => ({}),
        onSome: controls => ({ controls }),
      }),
      tabIndex: disabled ? -1 : 0,
      ...(disabled ? { isDisabled: true } : {}),
    }
  } else {
    return {}
  }
}

/**
 * What a restart opens a Splitter Part on: returns to `Idle` while keeping
 * settled panel `sizes` and `sizesBeforeCollapse`.
 */
export const atRest = (state: State): State =>
  Idle({
    sizes: state.sizes,
    sizesBeforeCollapse: state.sizesBeforeCollapse,
    drag: PointerDrag.atRest(state.drag),
  })

// PART FACTORY

/** Options for customizing a Splitter Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (such as `'OwnView'`) to keep Splitter device-only. */
  sync?: 'Synced' | DeviceReason
  /** Initial panel percentage sizes (normalized to sum to 100). */
  defaultSizes?: ReadonlyArray<number>
  /** Pointer-move sync sampling interval in milliseconds (`50` by default). */
  sampleMs?: number
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Splitter {@link Part.Part}. Synced by default
 * (`category: 'Navigation'`, `MoveResize` at `Pace.Sampled({ everyMs: 50 })`).
 * Use {@link deviceOnly} for local-only split layouts.
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const sampleMs = options.sampleMs ?? defaultSampleMs
  const initialState =
    options.defaultSizes === undefined
      ? initial
      : initialSizes(options.defaultSizes)
  return Part.define<State, Message, Props>({
    name: options.name ?? 'Splitter',
    State,
    Message,
    chart: initialState === initial ? chart : chartOf(initialState),
    actions,
    sync:
      options.sync === undefined || options.sync === 'Synced'
        ? syncOf(sampleMs)
        : deviceSync(options.sync),
    category: options.category ?? 'Navigation',
    slots,
    atRest,
    project: projectSlot,
    configuration: options.configuration ?? {
      base: {
        pace: {
          ...defaultPace,
          dragSampleMs: sampleMs,
        },
      },
      presets: {},
    },
  })
}

/**
 * Shorthand for a Splitter Part whose state stays on the device and is omitted
 * from the synced log and encoded Model.
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

/** The default synced Splitter Part (`name: 'Splitter'`, `category: 'Navigation'`). */
export const part: Part.Part<State, Message, Props> = make()
