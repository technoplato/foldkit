import { Match as M, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import { define, ignore, to, when } from '../experimental/machine/machine.js'
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

// NOTE: this is the core FloatingPanel Part (Widget #45 of 54, Scribe #2684).
// It composes `PointerDrag` (`Pace.Sampled`) into one framework-free Machine
// and Part declaration covering Zag floating-panel: position (`{ x, y }`), size
// (`{ width, height }`), `minSize`/`maxSize`, `boundaryRect` clamping, pure
// 8-edge/corner `ResizeAxis` (`N | S | E | W | NE | NW | SE | SW`) resize math
// with optional `lockAspectRatio`, and `Stage` (`Default | Minimized |
// Maximized`) preserving `restoreRect`. Its state (`Closed` | `Open` |
// `Dragging` | `Resizing`) lives in the Model, synced by default (`Navigation`
// category, `Pace.Sampled` on drag and resize moves) with `FloatingPanel.make`
// and `FloatingPanel.deviceOnly()`, and projects reference-stable SlotBindings
// (`Root`, `Header`, `Body`, `ResizeHandle`, `MinimizeButton`,
// `MaximizeButton`, `CloseButton`).

// CONSTANTS

/** Default initial floating panel position `{ x: 300, y: 100 }` (matching Zag FloatingPanel). */
export const defaultPosition: PointerDrag.Point = { x: 300, y: 100 }

/** Default initial floating panel dimensions `{ width: 320, height: 240 }` (matching Zag FloatingPanel). */
export const defaultSize: Readonly<{ width: number; height: number }> = {
  width: 320,
  height: 240,
}

/** Default minimum panel dimensions `{ width: 160, height: 120 }`. */
export const defaultMinSize: Readonly<{ width: number; height: number }> = {
  width: 160,
  height: 120,
}

/** Default collapsed header height in pixels when the panel stage is `'Minimized'` (`40`). */
export const defaultMinimizedHeightPx = 40

/** Default snap grid step in pixels for pointer dragging (`1`). */
export const defaultGridSize = 1

/** Default keyboard arrow nudge distance in pixels (`10`). */
export const defaultKeyboardStepPx = 10

/** Multiplier applied to `keyboardStepPx` when Shift is held (`5`). */
export const defaultShiftStepMultiplier = 5

/** Default pointer-move sync sampling window in milliseconds (`50`). */
export const defaultSampleMs: number = PointerDrag.defaultSampleMs

// SCHEMAS

/** 2D position of the floating panel's top-left corner. */
export const Position = PointerDrag.Point
/** 2D position of the floating panel's top-left corner. */
export type Position = typeof Position.Type

/** Width and height dimensions of the floating panel. */
export const Size = S.Struct({
  width: S.Number,
  height: S.Number,
})
/** Width and height dimensions of the floating panel. */
export type Size = typeof Size.Type

/** Combined position and size rectangle of the floating panel. */
export const PanelRect = S.Struct({
  x: S.Number,
  y: S.Number,
  width: S.Number,
  height: S.Number,
})
/** Combined position and size rectangle of the floating panel. */
export type PanelRect = typeof PanelRect.Type

/** One of the eight edge or corner resize handles around the floating panel. */
export const ResizeAxis = S.Literals([
  'N',
  'S',
  'E',
  'W',
  'NE',
  'NW',
  'SE',
  'SW',
])
/** One of the eight edge or corner resize handles around the floating panel. */
export type ResizeAxis = typeof ResizeAxis.Type

/** All eight resize handle axes in clockwise/edge-then-corner order. */
export const allResizeAxes: ReadonlyArray<ResizeAxis> = ResizeAxis.literals

/** Window stage of an open floating panel (`Default`, `Minimized`, or `Maximized`). */
export const Stage = S.Literals(['Default', 'Minimized', 'Maximized'])
/** Window stage of an open floating panel. */
export type Stage = typeof Stage.Type

/**
 * Read-only configuration supplied to the FloatingPanel chart and projection
 * from the Program's Model.
 */
export const Props = S.Struct({
  id: S.String,
  defaultPosition: S.optionalKey(Position),
  defaultSize: S.optionalKey(Size),
  minSize: S.optionalKey(Size),
  maxSize: S.optionalKey(Size),
  boundaryRect: S.optionalKey(PointerDrag.Rect),
  minimizedHeightPx: S.optionalKey(S.Number),
  lockAspectRatio: S.optionalKey(S.Boolean),
  isDraggable: S.optionalKey(S.Boolean),
  isResizable: S.optionalKey(S.Boolean),
  isDisabled: S.optionalKey(S.Boolean),
  closeOnEscape: S.optionalKey(S.Boolean),
  persistRect: S.optionalKey(S.Boolean),
  gridSize: S.optionalKey(S.Number),
  keyboardStepPx: S.optionalKey(S.Number),
  sampleMs: S.optionalKey(S.Number),
  label: S.optionalKey(S.String),
  hasTitle: S.optionalKey(S.Boolean),
})
/** Read-only configuration supplied to the FloatingPanel chart and projection. */
export type Props = typeof Props.Type

// STATE

/** The floating panel is closed, optionally carrying persisted bounds when `persistRect` is enabled. */
export const Closed = ts('Closed', {
  maybePersistedRect: S.Option(PanelRect),
})
/** The floating panel is closed. */
export type Closed = typeof Closed.Type

/** The floating panel is open and resting at `position`, `size`, and `stage`. */
export const Open = ts('Open', {
  position: Position,
  size: Size,
  stage: Stage,
  maybeRestoreRect: S.Option(PanelRect),
})
/** The floating panel is open and resting. */
export type Open = typeof Open.Type

/** The floating panel is actively being moved by a pointer drag tracked through `PointerDrag`. */
export const Dragging = ts('Dragging', {
  position: Position,
  size: Size,
  stage: Stage,
  maybeRestoreRect: S.Option(PanelRect),
  originPosition: Position,
  drag: PointerDrag.Dragging,
})
/** The floating panel is actively being moved by a pointer drag. */
export type Dragging = typeof Dragging.Type

/** The floating panel is actively being resized along `axis` via `PointerDrag`. */
export const Resizing = ts('Resizing', {
  position: Position,
  size: Size,
  stage: Stage,
  maybeRestoreRect: S.Option(PanelRect),
  axis: ResizeAxis,
  originRect: PanelRect,
  drag: PointerDrag.Dragging,
})
/** The floating panel is actively being resized along `axis`. */
export type Resizing = typeof Resizing.Type

/** Where a FloatingPanel Part stands: `Closed`, `Open`, `Dragging`, or `Resizing`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Closed, Open, Dragging, Resizing])
/** Where a FloatingPanel Part stands. */
export type State = typeof State.Type

/** Initial FloatingPanel state: closed with no persisted bounds. */
export const initial: State = Closed({ maybePersistedRect: Option.none() })

// ACTIONS

/** Opens the floating panel at its default or persisted bounds. */
export const OpenFloatingPanel = Catalog.action('OpenFloatingPanel', {
  what: 'Opens the floating panel',
  why: 'To display a movable tool surface',
  meta: { label: 'Open panel', keys: [] },
})

/** Closes the open floating panel. */
export const CloseFloatingPanel = Catalog.action('CloseFloatingPanel', {
  what: 'Closes the open floating panel',
  why: 'To remove the overlay from the workspace',
  meta: { label: 'Close panel', keys: [] },
})

/** Opens the floating panel when closed or closes it when open. */
export const ToggleFloatingPanel = Catalog.action('ToggleFloatingPanel', {
  what: 'Opens the floating panel or closes it when open',
  why: 'To show or hide the tool surface',
  meta: { label: 'Toggle panel', keys: [] },
})

/** Collapses the floating panel to its header height while preserving its restore bounds. */
export const MinimizeFloatingPanel = Catalog.action('MinimizeFloatingPanel', {
  what: 'Collapses the floating panel to its header',
  why: 'To reclaim workspace room while keeping the window handy',
  meta: { label: 'Minimize panel', keys: [] },
})

/** Expands the floating panel to fill its boundary while preserving its restore bounds. */
export const MaximizeFloatingPanel = Catalog.action('MaximizeFloatingPanel', {
  what: 'Expands the floating panel to fill its boundary',
  why: 'To give the surface full viewing area',
  meta: { label: 'Maximize panel', keys: [] },
})

/** Returns a minimized or maximized floating panel to its stored restore bounds. */
export const RestoreFloatingPanel = Catalog.action('RestoreFloatingPanel', {
  what: 'Returns a staged panel to its previous bounds',
  why: 'To resume working at its ordinary dimensions',
  meta: { label: 'Restore panel', keys: [] },
})

/** Minimizes the panel when not minimized, or restores it when already minimized. */
export const ToggleMinimizeFloatingPanel = Catalog.action(
  'ToggleMinimizeFloatingPanel',
  {
    what: 'Minimizes the panel or restores it when minimized',
    why: 'To switch between compact header mode and full bounds',
    meta: { label: 'Minimize or restore panel', keys: [] },
  },
)

/** Maximizes the panel when not maximized, or restores it when already maximized. */
export const ToggleMaximizeFloatingPanel = Catalog.action(
  'ToggleMaximizeFloatingPanel',
  {
    what: 'Maximizes the panel or restores it when maximized',
    why: 'To switch between expanded view and ordinary bounds',
    meta: { label: 'Maximize or restore panel', keys: [] },
  },
)

/** Moves the open floating panel to `(x, y)` clamped within `boundaryRect`. */
export const SetFloatingPanelPosition = Catalog.action(
  'SetFloatingPanelPosition',
  {
    fields: { x: S.Number, y: S.Number },
    what: 'Moves the floating panel to the given coordinates',
    why: 'To place the surface precisely within the workspace',
    meta: { label: 'Set panel position', keys: [] },
  },
)

/** Resizes the open floating panel to `{ width, height }` clamped within min/max/boundary limits. */
export const SetFloatingPanelSize = Catalog.action('SetFloatingPanelSize', {
  fields: { width: S.Number, height: S.Number },
  what: 'Resizes the floating panel to the given dimensions',
  why: 'To fit the contents comfortably inside the surface',
  meta: { label: 'Set panel size', keys: [] },
})

/** The Catalog Actions a FloatingPanel Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  OpenFloatingPanel,
  CloseFloatingPanel,
  ToggleFloatingPanel,
  MinimizeFloatingPanel,
  MaximizeFloatingPanel,
  RestoreFloatingPanel,
  ToggleMinimizeFloatingPanel,
  ToggleMaximizeFloatingPanel,
  SetFloatingPanelPosition,
  SetFloatingPanelSize,
]

// MESSAGES

/** Begins a pointer drag on the panel header to reposition the floating panel. */
export const BeginFloatingPanelDrag = m('BeginFloatingPanelDrag', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
})

/** Updates the active pointer drag position. Synced via `Pace.Sampled`. */
export const MoveFloatingPanelDrag = m('MoveFloatingPanelDrag', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
})

/** Commits the active pointer drag and settles back into `Open`. */
export const EndFloatingPanelDrag = m('EndFloatingPanelDrag', {
  pointerId: S.optionalKey(S.Number),
})

/** Cancels the active pointer drag and restores `originPosition`. */
export const CancelFloatingPanelDrag = m('CancelFloatingPanelDrag', {
  pointerId: S.optionalKey(S.Number),
})

/** Begins resizing the panel along one of the 8 `ResizeAxis` edges or corners. */
export const BeginFloatingPanelResize = m('BeginFloatingPanelResize', {
  pointerId: S.Number,
  axis: ResizeAxis,
  x: S.Number,
  y: S.Number,
})

/** Updates the active pointer resize gesture. Synced via `Pace.Sampled`. */
export const MoveFloatingPanelResize = m('MoveFloatingPanelResize', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
  shiftKey: S.optionalKey(S.Boolean),
})

/** Commits the active resize gesture and settles back into `Open`. */
export const EndFloatingPanelResize = m('EndFloatingPanelResize', {
  pointerId: S.optionalKey(S.Number),
})

/** Cancels the active resize gesture and restores `originRect`. */
export const CancelFloatingPanelResize = m('CancelFloatingPanelResize', {
  pointerId: S.optionalKey(S.Number),
})

/** A key was pressed on the floating panel (`Escape` or `ArrowLeft/Right/Up/Down`). */
export const PressedFloatingPanelKey = m('PressedFloatingPanelKey', {
  key: S.String,
  shiftKey: S.optionalKey(S.Boolean),
})

/** Every Message the FloatingPanel chart handles. */
export const Message = S.Union([
  OpenFloatingPanel,
  CloseFloatingPanel,
  ToggleFloatingPanel,
  MinimizeFloatingPanel,
  MaximizeFloatingPanel,
  RestoreFloatingPanel,
  ToggleMinimizeFloatingPanel,
  ToggleMaximizeFloatingPanel,
  SetFloatingPanelPosition,
  SetFloatingPanelSize,
  BeginFloatingPanelDrag,
  MoveFloatingPanelDrag,
  EndFloatingPanelDrag,
  CancelFloatingPanelDrag,
  BeginFloatingPanelResize,
  MoveFloatingPanelResize,
  EndFloatingPanelResize,
  CancelFloatingPanelResize,
  PressedFloatingPanelKey,
])
/** Every Message the FloatingPanel chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the FloatingPanel Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the floating panel root dialog element id from a base `id`. */
export const rootId = (id: string): string => `${id}-root`

/** Derives the floating panel header/drag-handle element id from a base `id`. */
export const headerId = (id: string): string => `${id}-header`

/** Derives the floating panel body region element id from a base `id`. */
export const bodyId = (id: string): string => `${id}-body`

/** Derives one resize handle element id from a base `id` and `axis`. */
export const resizeHandleId = (id: string, axis: ResizeAxis): string =>
  `${id}-resize-${axis.toLowerCase()}`

/** Derives the minimize button element id from a base `id`. */
export const minimizeButtonId = (id: string): string => `${id}-minimize`

/** Derives the maximize button element id from a base `id`. */
export const maximizeButtonId = (id: string): string => `${id}-maximize`

/** Derives the close button element id from a base `id`. */
export const closeButtonId = (id: string): string => `${id}-close`

// PURE RULES & CONFIGURATION READERS

/** Resolved minimum dimensions (`{ width: 160, height: 120 }` by default). */
export const minSizeOf = (props: Pick<Props, 'minSize'> = {}): Size => ({
  width: Math.max(1, props.minSize?.width ?? defaultMinSize.width),
  height: Math.max(1, props.minSize?.height ?? defaultMinSize.height),
})

/** Resolved optional maximum dimensions. */
export const maxSizeOf = (
  props: Pick<Props, 'maxSize'> = {},
): Option.Option<Size> => Option.fromNullishOr(props.maxSize)

/** Resolved optional boundary rectangle for position/size clamping and maximizing. */
export const boundaryRectOf = (
  props: Pick<Props, 'boundaryRect'> = {},
): Option.Option<PointerDrag.Rect> => Option.fromNullishOr(props.boundaryRect)

/** Resolved header height in pixels while minimized (`40` by default). */
export const minimizedHeightPxOf = (
  props: Pick<Props, 'minimizedHeightPx'> = {},
): number => {
  const raw = props.minimizedHeightPx ?? defaultMinimizedHeightPx
  return Number.isFinite(raw) && raw > 0 ? raw : defaultMinimizedHeightPx
}

/** True when aspect ratio is locked during resize (`false` by default). */
export const lockAspectRatioOf = (
  props: Pick<Props, 'lockAspectRatio'> = {},
): boolean => props.lockAspectRatio === true

/** True when header dragging is enabled (`true` by default). */
export const isDraggableOf = (
  props: Pick<Props, 'isDraggable'> = {},
): boolean => props.isDraggable ?? true

/** True when edge/corner resizing is enabled (`true` by default). */
export const isResizableOf = (
  props: Pick<Props, 'isResizable'> = {},
): boolean => props.isResizable ?? true

/** True when all floating panel interactions are disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** True when pressing Escape closes an idle open panel (`true` by default). */
export const closeOnEscapeOf = (
  props: Pick<Props, 'closeOnEscape'> = {},
): boolean => props.closeOnEscape ?? true

/** True when bounds are retained across close/reopen (`false` by default). */
export const persistRectOf = (
  props: Pick<Props, 'persistRect'> = {},
): boolean => props.persistRect === true

/** Resolved drag snap grid step in pixels (`1` by default, clamped to `>= 1`). */
export const gridSizeOf = (props: Pick<Props, 'gridSize'> = {}): number => {
  const raw = props.gridSize ?? defaultGridSize
  return Number.isFinite(raw) && raw >= 1 ? raw : defaultGridSize
}

/** Resolved keyboard arrow move step in pixels (`10` by default, clamped to `>= 1`). */
export const keyboardStepPxOf = (
  props: Pick<Props, 'keyboardStepPx'> = {},
): number => {
  const raw = props.keyboardStepPx ?? defaultKeyboardStepPx
  return Number.isFinite(raw) && raw >= 1 ? raw : defaultKeyboardStepPx
}

/** Resolved pointer-move sync sampling window in milliseconds (`50` by default). */
export const sampleMsOf = (props: Pick<Props, 'sampleMs'> = {}): number =>
  props.sampleMs ?? defaultSampleMs

/** Projects `FloatingPanel.Props` onto the underlying {@link PointerDrag.Props}. */
export const dragPropsOf = (
  props: Pick<Props, 'isDisabled' | 'sampleMs'> = {},
): PointerDrag.Props => ({
  axis: 'Both',
  isDisabled: isDisabledOf(props),
  ...(props.sampleMs === undefined ? {} : { sampleMs: props.sampleMs }),
})

// PURE GEOMETRY & 8-AXIS RESIZE MATH

const hasWestEdge = (axis: ResizeAxis): boolean =>
  axis === 'W' || axis === 'NW' || axis === 'SW'

const hasEastEdge = (axis: ResizeAxis): boolean =>
  axis === 'E' || axis === 'NE' || axis === 'SE'

const hasNorthEdge = (axis: ResizeAxis): boolean =>
  axis === 'N' || axis === 'NW' || axis === 'NE'

const hasSouthEdge = (axis: ResizeAxis): boolean =>
  axis === 'S' || axis === 'SW' || axis === 'SE'

const snapToGrid = (value: number, gridSize: number): number =>
  gridSize > 1 ? Math.round(value / gridSize) * gridSize : value

const effectiveMaxDimensionsOf = (
  props: Pick<Props, 'minSize' | 'maxSize' | 'boundaryRect'>,
): Size => {
  const min = minSizeOf(props)
  const boundaryWidth = props.boundaryRect?.width ?? Number.POSITIVE_INFINITY
  const boundaryHeight = props.boundaryRect?.height ?? Number.POSITIVE_INFINITY
  const configuredMaxWidth = props.maxSize?.width ?? Number.POSITIVE_INFINITY
  const configuredMaxHeight = props.maxSize?.height ?? Number.POSITIVE_INFINITY
  const rawMaxWidth = Math.min(configuredMaxWidth, boundaryWidth)
  const rawMaxHeight = Math.min(configuredMaxHeight, boundaryHeight)
  return {
    width: Number.isFinite(rawMaxWidth)
      ? Math.max(min.width, rawMaxWidth)
      : Number.POSITIVE_INFINITY,
    height: Number.isFinite(rawMaxHeight)
      ? Math.max(min.height, rawMaxHeight)
      : Number.POSITIVE_INFINITY,
  }
}

/**
 * Clamps `size` within `minSize`, optional `maxSize`, and optional
 * `boundaryRect` dimensions.
 */
export const clampPanelSize = (
  size: Size,
  props: Pick<Props, 'minSize' | 'maxSize' | 'boundaryRect'> = {},
): Size => {
  const min = minSizeOf(props)
  const max = effectiveMaxDimensionsOf(props)
  const effectiveMinWidth = Number.isFinite(max.width)
    ? Math.min(min.width, max.width)
    : min.width
  const effectiveMinHeight = Number.isFinite(max.height)
    ? Math.min(min.height, max.height)
    : min.height
  return {
    width: Number.isFinite(max.width)
      ? PointerDrag.clampValue(size.width, effectiveMinWidth, max.width)
      : Math.max(effectiveMinWidth, size.width),
    height: Number.isFinite(max.height)
      ? PointerDrag.clampValue(size.height, effectiveMinHeight, max.height)
      : Math.max(effectiveMinHeight, size.height),
  }
}

/**
 * Clamps `position` so a panel of `size` stays inside `boundaryRect` when a
 * boundary is configured.
 */
export const clampPanelPosition = (
  position: Position,
  size: Size,
  props: Pick<Props, 'boundaryRect'> = {},
): Position =>
  Option.match(boundaryRectOf(props), {
    onNone: () => position,
    onSome: boundary => ({
      x: PointerDrag.clampValue(
        position.x,
        boundary.x,
        Math.max(boundary.x, boundary.x + boundary.width - size.width),
      ),
      y: PointerDrag.clampValue(
        position.y,
        boundary.y,
        Math.max(boundary.y, boundary.y + boundary.height - size.height),
      ),
    }),
  })

/** Clamps a full `PanelRect` (`size` first, then `position`) against `props`. */
export const constrainPanelRect = (
  rect: PanelRect,
  props: Pick<Props, 'minSize' | 'maxSize' | 'boundaryRect'> = {},
): PanelRect => {
  const size = clampPanelSize({ width: rect.width, height: rect.height }, props)
  const position = clampPanelPosition({ x: rect.x, y: rect.y }, size, props)
  return {
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
  }
}

const clampWidthWithBounds = (
  rawWidth: number,
  minWidth: number,
  maxWidth: number,
): number =>
  Number.isFinite(maxWidth)
    ? PointerDrag.clampValue(rawWidth, minWidth, maxWidth)
    : Math.max(minWidth, rawWidth)

/**
 * Pure 8-edge/corner resize math for `FloatingPanel`. Anchors the opposite
 * edge or corner of `originRect`, applies pointer displacement `delta` along
 * `axis` (`N | S | E | W | NE | NW | SE | SW`), enforces `minSize`, `maxSize`,
 * and `boundaryRect`, and optionally preserves the original aspect ratio when
 * `lockAspectRatio` is `true`.
 *
 * @example
 * ```typescript
 * resizePanelRect(
 *   { x: 100, y: 100, width: 300, height: 200 },
 *   { dx: 50, dy: 40 },
 *   'SE',
 *   { minSize: { width: 160, height: 120 } },
 * ) // { x: 100, y: 100, width: 350, height: 240 }
 * ```
 */
export const resizePanelRect = (
  originRect: PanelRect,
  delta: PointerDrag.Delta,
  axis: ResizeAxis,
  props: Pick<
    Props,
    'minSize' | 'maxSize' | 'boundaryRect' | 'lockAspectRatio' | 'gridSize'
  > = {},
  options: Readonly<{ lockAspectRatio?: boolean }> = {},
): PanelRect => {
  const grid = gridSizeOf(props)
  const dx = snapToGrid(delta.dx, grid)
  const dy = snapToGrid(delta.dy, grid)
  const min = minSizeOf(props)
  const max = effectiveMaxDimensionsOf(props)
  const maybeBoundary = boundaryRectOf(props)

  const originRight = originRect.x + originRect.width
  const originBottom = originRect.y + originRect.height

  const isWest = hasWestEdge(axis)
  const isEast = hasEastEdge(axis)
  const isNorth = hasNorthEdge(axis)
  const isSouth = hasSouthEdge(axis)

  const maxAllowedWidth = Option.match(maybeBoundary, {
    onNone: () => max.width,
    onSome: boundary => {
      if (isWest) {
        return Math.min(
          max.width,
          Math.max(min.width, originRight - boundary.x),
        )
      } else if (isEast) {
        return Math.min(
          max.width,
          Math.max(min.width, boundary.x + boundary.width - originRect.x),
        )
      } else {
        return Math.min(max.width, boundary.width)
      }
    },
  })

  const maxAllowedHeight = Option.match(maybeBoundary, {
    onNone: () => max.height,
    onSome: boundary => {
      if (isNorth) {
        return Math.min(
          max.height,
          Math.max(min.height, originBottom - boundary.y),
        )
      } else if (isSouth) {
        return Math.min(
          max.height,
          Math.max(min.height, boundary.y + boundary.height - originRect.y),
        )
      } else {
        return Math.min(max.height, boundary.height)
      }
    },
  })

  const rawWidth = isEast
    ? originRect.width + dx
    : isWest
      ? originRect.width - dx
      : originRect.width
  const rawHeight = isSouth
    ? originRect.height + dy
    : isNorth
      ? originRect.height - dy
      : originRect.height

  const minWidth = Number.isFinite(maxAllowedWidth)
    ? Math.min(min.width, maxAllowedWidth)
    : min.width
  const minHeight = Number.isFinite(maxAllowedHeight)
    ? Math.min(min.height, maxAllowedHeight)
    : min.height

  const clampedWidth = clampWidthWithBounds(rawWidth, minWidth, maxAllowedWidth)
  const clampedHeight = clampWidthWithBounds(
    rawHeight,
    minHeight,
    maxAllowedHeight,
  )

  const shouldLockRatio =
    (options.lockAspectRatio ?? lockAspectRatioOf(props)) &&
    originRect.width > 0 &&
    originRect.height > 0

  if (shouldLockRatio) {
    const ratio = originRect.width / originRect.height
    const ratioMinWidth = Math.max(minWidth, minHeight * ratio)
    const ratioMaxWidth = Math.min(maxAllowedWidth, maxAllowedHeight * ratio)
    const effectiveMinW = Number.isFinite(ratioMaxWidth)
      ? Math.min(ratioMinWidth, ratioMaxWidth)
      : ratioMinWidth

    const isHorizontalOnly = (isWest || isEast) && !isNorth && !isSouth
    const isVerticalOnly = (isNorth || isSouth) && !isWest && !isEast

    const candidateWidth = isHorizontalOnly
      ? clampedWidth
      : isVerticalOnly
        ? clampedHeight * ratio
        : Math.abs(clampedWidth - originRect.width) >=
            Math.abs(clampedHeight * ratio - originRect.width)
          ? clampedWidth
          : clampedHeight * ratio

    const finalWidth = clampWidthWithBounds(
      candidateWidth,
      effectiveMinW,
      ratioMaxWidth,
    )
    const finalHeight = finalWidth / ratio

    const rawX = isWest ? originRight - finalWidth : originRect.x
    const rawY = isNorth ? originBottom - finalHeight : originRect.y
    const clampedPos = clampPanelPosition(
      { x: rawX, y: rawY },
      { width: finalWidth, height: finalHeight },
      props,
    )
    return {
      x: clampedPos.x,
      y: clampedPos.y,
      width: finalWidth,
      height: finalHeight,
    }
  } else {
    const rawX = isWest ? originRight - clampedWidth : originRect.x
    const rawY = isNorth ? originBottom - clampedHeight : originRect.y
    const clampedPos = clampPanelPosition(
      { x: rawX, y: rawY },
      { width: clampedWidth, height: clampedHeight },
      props,
    )
    return {
      x: clampedPos.x,
      y: clampedPos.y,
      width: clampedWidth,
      height: clampedHeight,
    }
  }
}

// READINGS

/** True when the floating panel is visible (`Open`, `Dragging`, or `Resizing`). */
export const isOpen = (state: State): boolean => state._tag !== 'Closed'

/** True while the floating panel is being dragged by its header. */
export const isDragging = (state: State): boolean => state._tag === 'Dragging'

/** True while the floating panel is being resized along a handle axis. */
export const isResizing = (state: State): boolean => state._tag === 'Resizing'

/** Current panel stage when open, or `'Default'` while closed. */
export const stageOf = (state: State): Stage =>
  state._tag === 'Closed' ? 'Default' : state.stage

/** True when the open floating panel is in `'Minimized'` stage. */
export const isMinimized = (state: State): boolean =>
  state._tag !== 'Closed' && state.stage === 'Minimized'

/** True when the open floating panel is in `'Maximized'` stage. */
export const isMaximized = (state: State): boolean =>
  state._tag !== 'Closed' && state.stage === 'Maximized'

/** Current panel position when open, or none while closed. */
export const positionOf = (state: State): Option.Option<Position> =>
  state._tag === 'Closed' ? Option.none() : Option.some(state.position)

/** Current panel dimensions when open, or none while closed. */
export const sizeOf = (state: State): Option.Option<Size> =>
  state._tag === 'Closed' ? Option.none() : Option.some(state.size)

/** Current panel bounds rectangle when open, or none while closed. */
export const rectOf = (state: State): Option.Option<PanelRect> =>
  state._tag === 'Closed'
    ? Option.none()
    : Option.some({
        x: state.position.x,
        y: state.position.y,
        width: state.size.width,
        height: state.size.height,
      })

/** Stored restore rectangle captured before entering `'Minimized'` or `'Maximized'`, or none. */
export const restoreRectOf = (state: State): Option.Option<PanelRect> =>
  state._tag === 'Closed' ? Option.none() : state.maybeRestoreRect

/** Active resize handle axis while `Resizing`, or none otherwise. */
export const activeResizeAxisOf = (state: State): Option.Option<ResizeAxis> =>
  state._tag === 'Resizing' ? Option.some(state.axis) : Option.none()

/** True when pointer dragging is currently allowed (open, enabled, draggable, and not maximized). */
export const canDrag = (state: State, props: Props): boolean =>
  isOpen(state) &&
  !isDisabledOf(props) &&
  isDraggableOf(props) &&
  !isMaximized(state)

/** True when edge/corner resizing is currently allowed (open, enabled, resizable, and in `Default` stage). */
export const canResize = (state: State, props: Props): boolean =>
  isOpen(state) &&
  !isDisabledOf(props) &&
  isResizableOf(props) &&
  stageOf(state) === 'Default'

// INTERNAL CHART HELPERS

type OpenLike = Open | Dragging | Resizing

const defaultRectOf = (props: Props): PanelRect => {
  const initialSize = props.defaultSize ?? defaultSize
  const initialPos = props.defaultPosition ?? defaultPosition
  return constrainPanelRect(
    {
      x: initialPos.x,
      y: initialPos.y,
      width: initialSize.width,
      height: initialSize.height,
    },
    props,
  )
}

const openFromClosed = (state: Closed, props: Props): Open => {
  const rect = Option.match(state.maybePersistedRect, {
    onNone: () => defaultRectOf(props),
    onSome: persisted => constrainPanelRect(persisted, props),
  })
  return Open({
    position: { x: rect.x, y: rect.y },
    size: { width: rect.width, height: rect.height },
    stage: 'Default',
    maybeRestoreRect: Option.none(),
  })
}

const closeFromOpen = (state: OpenLike, props: Props): Closed => {
  if (!persistRectOf(props)) {
    return Closed({ maybePersistedRect: Option.none() })
  }
  const rectToPersist = Option.getOrElse(state.maybeRestoreRect, () => ({
    x: state.position.x,
    y: state.position.y,
    width: state.size.width,
    height: state.size.height,
  }))
  return Closed({ maybePersistedRect: Option.some(rectToPersist) })
}

const currentRectOf = (state: OpenLike): PanelRect => ({
  x: state.position.x,
  y: state.position.y,
  width: state.size.width,
  height: state.size.height,
})

const minimizedOf = (state: OpenLike, props: Props): Open => {
  const restoreRect =
    state.stage === 'Default'
      ? Option.some(currentRectOf(state))
      : state.maybeRestoreRect
  const baseWidth = Option.match(restoreRect, {
    onNone: () => state.size.width,
    onSome: rect => rect.width,
  })
  const basePosition = Option.match(restoreRect, {
    onNone: () => state.position,
    onSome: rect => ({ x: rect.x, y: rect.y }),
  })
  const nextSize: Size = {
    width: baseWidth,
    height: minimizedHeightPxOf(props),
  }
  return Open({
    position: clampPanelPosition(basePosition, nextSize, props),
    size: nextSize,
    stage: 'Minimized',
    maybeRestoreRect: restoreRect,
  })
}

const maximizedOf = (state: OpenLike, props: Props): Open => {
  const restoreRect =
    state.stage === 'Default'
      ? Option.some(currentRectOf(state))
      : state.maybeRestoreRect
  const targetRect = Option.match(boundaryRectOf(props), {
    onSome: boundary => ({
      x: boundary.x,
      y: boundary.y,
      width: boundary.width,
      height: boundary.height,
    }),
    onNone: () =>
      Option.match(maxSizeOf(props), {
        onSome: maxSize => ({
          x: 0,
          y: 0,
          width: maxSize.width,
          height: maxSize.height,
        }),
        onNone: () => ({
          x: 0,
          y: 0,
          width: state.size.width,
          height: state.size.height,
        }),
      }),
  })
  return Open({
    position: { x: targetRect.x, y: targetRect.y },
    size: { width: targetRect.width, height: targetRect.height },
    stage: 'Maximized',
    maybeRestoreRect: restoreRect,
  })
}

const restoredOf = (state: OpenLike, props: Props): Open => {
  const rect = Option.match(state.maybeRestoreRect, {
    onNone: () => constrainPanelRect(currentRectOf(state), props),
    onSome: saved => constrainPanelRect(saved, props),
  })
  return Open({
    position: { x: rect.x, y: rect.y },
    size: { width: rect.width, height: rect.height },
    stage: 'Default',
    maybeRestoreRect: Option.none(),
  })
}

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

const keyboardMoveDeltaOf = (
  key: string,
  step: number,
): Option.Option<PointerDrag.Delta> => {
  if (key === 'ArrowLeft') {
    return Option.some({ dx: -step, dy: 0 })
  } else if (key === 'ArrowRight') {
    return Option.some({ dx: step, dy: 0 })
  } else if (key === 'ArrowUp') {
    return Option.some({ dx: 0, dy: -step })
  } else if (key === 'ArrowDown') {
    return Option.some({ dx: 0, dy: step })
  } else {
    return Option.none()
  }
}

// CHART

/**
 * The FloatingPanel Machine chart: `Closed | Open | Dragging | Resizing`
 * composing `PointerDrag`, with boundary clamping, 8-edge/corner resize math,
 * optional `lockAspectRatio`, `Default | Minimized | Maximized` stages
 * preserving `restoreRect`, Escape cancel/close, and keyboard position nudging.
 */
export const chart = define({ state: State, message: Message, context: Props })(
  {
    initial,
    states: {
      Closed: {
        on: {
          OpenFloatingPanel: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Open',
              ({ state, context }) => openFromClosed(state, context),
            ),
            ignore(),
          ],
          ToggleFloatingPanel: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Open',
              ({ state, context }) => openFromClosed(state, context),
            ),
            ignore(),
          ],
          CloseFloatingPanel: [ignore()],
          MinimizeFloatingPanel: [ignore()],
          MaximizeFloatingPanel: [ignore()],
          RestoreFloatingPanel: [ignore()],
          ToggleMinimizeFloatingPanel: [ignore()],
          ToggleMaximizeFloatingPanel: [ignore()],
          SetFloatingPanelPosition: [ignore()],
          SetFloatingPanelSize: [ignore()],
          BeginFloatingPanelDrag: [ignore()],
          MoveFloatingPanelDrag: [ignore()],
          EndFloatingPanelDrag: [ignore()],
          CancelFloatingPanelDrag: [ignore()],
          BeginFloatingPanelResize: [ignore()],
          MoveFloatingPanelResize: [ignore()],
          EndFloatingPanelResize: [ignore()],
          CancelFloatingPanelResize: [ignore()],
          PressedFloatingPanelKey: [ignore()],
        },
      },
      Open: {
        on: {
          OpenFloatingPanel: [ignore()],
          CloseFloatingPanel: to('Closed', ({ state, context }) =>
            closeFromOpen(state, context),
          ),
          ToggleFloatingPanel: to('Closed', ({ state, context }) =>
            closeFromOpen(state, context),
          ),
          MinimizeFloatingPanel: [
            when(
              (state, _message, context) =>
                !isDisabledOf(context) && state.stage !== 'Minimized',
              'Open',
              ({ state, context }) => minimizedOf(state, context),
            ),
            ignore(),
          ],
          MaximizeFloatingPanel: [
            when(
              (state, _message, context) =>
                !isDisabledOf(context) &&
                isResizableOf(context) &&
                state.stage !== 'Maximized',
              'Open',
              ({ state, context }) => maximizedOf(state, context),
            ),
            ignore(),
          ],
          RestoreFloatingPanel: [
            when(
              (state, _message, context) =>
                !isDisabledOf(context) && state.stage !== 'Default',
              'Open',
              ({ state, context }) => restoredOf(state, context),
            ),
            ignore(),
          ],
          ToggleMinimizeFloatingPanel: [
            when(
              (state, _message, context) =>
                !isDisabledOf(context) && state.stage === 'Minimized',
              'Open',
              ({ state, context }) => restoredOf(state, context),
            ),
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Open',
              ({ state, context }) => minimizedOf(state, context),
            ),
            ignore(),
          ],
          ToggleMaximizeFloatingPanel: [
            when(
              (state, _message, context) =>
                !isDisabledOf(context) && state.stage === 'Maximized',
              'Open',
              ({ state, context }) => restoredOf(state, context),
            ),
            when(
              (_state, _message, context) =>
                !isDisabledOf(context) && isResizableOf(context),
              'Open',
              ({ state, context }) => maximizedOf(state, context),
            ),
            ignore(),
          ],
          SetFloatingPanelPosition: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Open',
              ({ state, message, context }) =>
                Open({
                  ...state,
                  position: clampPanelPosition(
                    { x: message.x, y: message.y },
                    state.size,
                    context,
                  ),
                }),
            ),
            ignore(),
          ],
          SetFloatingPanelSize: [
            when(
              (_state, _message, context) =>
                !isDisabledOf(context) && isResizableOf(context),
              'Open',
              ({ state, message, context }) => {
                const nextSize = clampPanelSize(
                  { width: message.width, height: message.height },
                  context,
                )
                return Open({
                  ...state,
                  size: nextSize,
                  position: clampPanelPosition(
                    state.position,
                    nextSize,
                    context,
                  ),
                })
              },
            ),
            ignore(),
          ],
          BeginFloatingPanelDrag: [
            when(
              (state, message, context) =>
                canDrag(state, context)
                  ? startDragOf(
                      message.pointerId,
                      message.x,
                      message.y,
                      context,
                    )
                  : Option.none(),
              'Dragging',
              ({ state, guardValue }) =>
                Dragging({
                  position: state.position,
                  size: state.size,
                  stage: state.stage,
                  maybeRestoreRect: state.maybeRestoreRect,
                  originPosition: state.position,
                  drag: guardValue,
                }),
            ),
            ignore(),
          ],
          MoveFloatingPanelDrag: [ignore()],
          EndFloatingPanelDrag: [ignore()],
          CancelFloatingPanelDrag: [ignore()],
          BeginFloatingPanelResize: [
            when(
              (state, message, context) =>
                canResize(state, context)
                  ? startDragOf(
                      message.pointerId,
                      message.x,
                      message.y,
                      context,
                    )
                  : Option.none(),
              'Resizing',
              ({ state, message, guardValue }) =>
                Resizing({
                  position: state.position,
                  size: state.size,
                  stage: state.stage,
                  maybeRestoreRect: state.maybeRestoreRect,
                  axis: message.axis,
                  originRect: currentRectOf(state),
                  drag: guardValue,
                }),
            ),
            ignore(),
          ],
          MoveFloatingPanelResize: [ignore()],
          EndFloatingPanelResize: [ignore()],
          CancelFloatingPanelResize: [ignore()],
          PressedFloatingPanelKey: [
            when(
              (_state, message, context) =>
                message.key === 'Escape' && closeOnEscapeOf(context),
              'Closed',
              ({ state, context }) => closeFromOpen(state, context),
            ),
            when(
              (state, message, context) => {
                if (!canDrag(state, context)) {
                  return Option.none()
                }
                const baseStep = keyboardStepPxOf(context)
                const step =
                  message.shiftKey === true
                    ? baseStep * defaultShiftStepMultiplier
                    : baseStep
                return keyboardMoveDeltaOf(message.key, step)
              },
              'Open',
              ({ state, guardValue, context }) =>
                Open({
                  ...state,
                  position: clampPanelPosition(
                    {
                      x: state.position.x + guardValue.dx,
                      y: state.position.y + guardValue.dy,
                    },
                    state.size,
                    context,
                  ),
                }),
            ),
            ignore(),
          ],
        },
      },
      Dragging: {
        on: {
          OpenFloatingPanel: [ignore()],
          CloseFloatingPanel: to('Closed', ({ state, context }) =>
            closeFromOpen(state, context),
          ),
          ToggleFloatingPanel: to('Closed', ({ state, context }) =>
            closeFromOpen(state, context),
          ),
          MinimizeFloatingPanel: [ignore()],
          MaximizeFloatingPanel: [ignore()],
          RestoreFloatingPanel: [ignore()],
          ToggleMinimizeFloatingPanel: [ignore()],
          ToggleMaximizeFloatingPanel: [ignore()],
          SetFloatingPanelPosition: [ignore()],
          SetFloatingPanelSize: [ignore()],
          BeginFloatingPanelDrag: [ignore()],
          MoveFloatingPanelDrag: [
            when(
              (state, message, context) =>
                canDrag(state, context) &&
                message.pointerId === state.drag.pointerId,
              'Dragging',
              ({ state, message, context }) => {
                const nextDrag = moveDragOf(
                  state.drag,
                  message.pointerId,
                  message.x,
                  message.y,
                  context,
                )
                const delta = PointerDrag.deltaOf(nextDrag)
                const grid = gridSizeOf(context)
                const candidatePosition: Position = {
                  x: state.originPosition.x + snapToGrid(delta.dx, grid),
                  y: state.originPosition.y + snapToGrid(delta.dy, grid),
                }
                return Dragging({
                  ...state,
                  position: clampPanelPosition(
                    candidatePosition,
                    state.size,
                    context,
                  ),
                  drag: nextDrag,
                })
              },
            ),
            ignore(),
          ],
          EndFloatingPanelDrag: [
            when(
              (state, message) =>
                isMatchingPointer(state.drag.pointerId, message.pointerId),
              'Open',
              ({ state }) =>
                Open({
                  position: state.position,
                  size: state.size,
                  stage: state.stage,
                  maybeRestoreRect: state.maybeRestoreRect,
                }),
            ),
            ignore(),
          ],
          CancelFloatingPanelDrag: [
            when(
              (state, message) =>
                isMatchingPointer(state.drag.pointerId, message.pointerId),
              'Open',
              ({ state }) =>
                Open({
                  position: state.originPosition,
                  size: state.size,
                  stage: state.stage,
                  maybeRestoreRect: state.maybeRestoreRect,
                }),
            ),
            ignore(),
          ],
          BeginFloatingPanelResize: [ignore()],
          MoveFloatingPanelResize: [ignore()],
          EndFloatingPanelResize: [ignore()],
          CancelFloatingPanelResize: [ignore()],
          PressedFloatingPanelKey: [
            when(
              (_state, message) => PointerDrag.isCancelKey(message.key),
              'Open',
              ({ state }) =>
                Open({
                  position: state.originPosition,
                  size: state.size,
                  stage: state.stage,
                  maybeRestoreRect: state.maybeRestoreRect,
                }),
            ),
            ignore(),
          ],
        },
      },
      Resizing: {
        on: {
          OpenFloatingPanel: [ignore()],
          CloseFloatingPanel: to('Closed', ({ state, context }) =>
            closeFromOpen(state, context),
          ),
          ToggleFloatingPanel: to('Closed', ({ state, context }) =>
            closeFromOpen(state, context),
          ),
          MinimizeFloatingPanel: [ignore()],
          MaximizeFloatingPanel: [ignore()],
          RestoreFloatingPanel: [ignore()],
          ToggleMinimizeFloatingPanel: [ignore()],
          ToggleMaximizeFloatingPanel: [ignore()],
          SetFloatingPanelPosition: [ignore()],
          SetFloatingPanelSize: [ignore()],
          BeginFloatingPanelDrag: [ignore()],
          MoveFloatingPanelDrag: [ignore()],
          EndFloatingPanelDrag: [ignore()],
          CancelFloatingPanelDrag: [ignore()],
          BeginFloatingPanelResize: [ignore()],
          MoveFloatingPanelResize: [
            when(
              (state, message, context) =>
                canResize(state, context) &&
                message.pointerId === state.drag.pointerId,
              'Resizing',
              ({ state, message, context }) => {
                const nextDrag = moveDragOf(
                  state.drag,
                  message.pointerId,
                  message.x,
                  message.y,
                  context,
                )
                const nextRect = resizePanelRect(
                  state.originRect,
                  PointerDrag.deltaOf(nextDrag),
                  state.axis,
                  context,
                  {
                    lockAspectRatio:
                      lockAspectRatioOf(context) || message.shiftKey === true,
                  },
                )
                return Resizing({
                  ...state,
                  position: { x: nextRect.x, y: nextRect.y },
                  size: { width: nextRect.width, height: nextRect.height },
                  drag: nextDrag,
                })
              },
            ),
            ignore(),
          ],
          EndFloatingPanelResize: [
            when(
              (state, message) =>
                isMatchingPointer(state.drag.pointerId, message.pointerId),
              'Open',
              ({ state }) =>
                Open({
                  position: state.position,
                  size: state.size,
                  stage: state.stage,
                  maybeRestoreRect: state.maybeRestoreRect,
                }),
            ),
            ignore(),
          ],
          CancelFloatingPanelResize: [
            when(
              (state, message) =>
                isMatchingPointer(state.drag.pointerId, message.pointerId),
              'Open',
              ({ state }) =>
                Open({
                  position: { x: state.originRect.x, y: state.originRect.y },
                  size: {
                    width: state.originRect.width,
                    height: state.originRect.height,
                  },
                  stage: state.stage,
                  maybeRestoreRect: state.maybeRestoreRect,
                }),
            ),
            ignore(),
          ],
          PressedFloatingPanelKey: [
            when(
              (_state, message) => PointerDrag.isCancelKey(message.key),
              'Open',
              ({ state }) =>
                Open({
                  position: { x: state.originRect.x, y: state.originRect.y },
                  size: {
                    width: state.originRect.width,
                    height: state.originRect.height,
                  },
                  stage: state.stage,
                  maybeRestoreRect: state.maybeRestoreRect,
                }),
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
 * Builds the FloatingPanel sync table using `Pace.Sampled({ everyMs })` on
 * `MoveFloatingPanelDrag` and `MoveFloatingPanelResize` (50 ms default) and
 * `Pace.Synced()` on all discrete open, close, stage, start, end, and cancel
 * transitions.
 */
export const syncOf = (
  sampleMs: number = defaultSampleMs,
): Readonly<Record<Message['_tag'], Sync>> => ({
  OpenFloatingPanel: Synced(),
  CloseFloatingPanel: Synced(),
  ToggleFloatingPanel: Synced(),
  MinimizeFloatingPanel: Synced(),
  MaximizeFloatingPanel: Synced(),
  RestoreFloatingPanel: Synced(),
  ToggleMinimizeFloatingPanel: Synced(),
  ToggleMaximizeFloatingPanel: Synced(),
  SetFloatingPanelPosition: Synced(),
  SetFloatingPanelSize: Synced(),
  BeginFloatingPanelDrag: Synced(),
  MoveFloatingPanelDrag: Sampled({ everyMs: sampleMs }),
  EndFloatingPanelDrag: Synced(),
  CancelFloatingPanelDrag: Synced(),
  BeginFloatingPanelResize: Synced(),
  MoveFloatingPanelResize: Sampled({ everyMs: sampleMs }),
  EndFloatingPanelResize: Synced(),
  CancelFloatingPanelResize: Synced(),
  PressedFloatingPanelKey: Synced(),
})

/** Default FloatingPanel synchronization: live drag and resize moves sampled at 50 ms. */
export const synced: Readonly<Record<Message['_tag'], Sync>> = syncOf()

/** Device-only synchronization table for a FloatingPanel kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  OpenFloatingPanel: Device({ because }),
  CloseFloatingPanel: Device({ because }),
  ToggleFloatingPanel: Device({ because }),
  MinimizeFloatingPanel: Device({ because }),
  MaximizeFloatingPanel: Device({ because }),
  RestoreFloatingPanel: Device({ because }),
  ToggleMinimizeFloatingPanel: Device({ because }),
  ToggleMaximizeFloatingPanel: Device({ because }),
  SetFloatingPanelPosition: Device({ because }),
  SetFloatingPanelSize: Device({ because }),
  BeginFloatingPanelDrag: Device({ because }),
  MoveFloatingPanelDrag: Device({ because }),
  EndFloatingPanelDrag: Device({ because }),
  CancelFloatingPanelDrag: Device({ because }),
  BeginFloatingPanelResize: Device({ because }),
  MoveFloatingPanelResize: Device({ because }),
  EndFloatingPanelResize: Device({ because }),
  CancelFloatingPanelResize: Device({ because }),
  PressedFloatingPanelKey: Device({ because }),
})

/** Returns the {@link Sync} pace for one FloatingPanel Message under `sampleMs`. */
export const paceOf = (
  message: Message,
  sampleMs: number = defaultSampleMs,
): Sync => syncOf(sampleMs)[message._tag]

// SLOTS & PROJECTION

/**
 * The seven painted slots of a FloatingPanel Part: `Root`, `Header`, `Body`,
 * `ResizeHandle`, `MinimizeButton`, `MaximizeButton`, and `CloseButton`.
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Root: {
    role: 'Dialog',
    focus: 'Container',
    gestures: [],
  },
  Header: {
    role: 'Group',
    focus: 'None',
    gestures: [],
  },
  Body: {
    role: 'Region',
    focus: 'None',
    gestures: [],
  },
  ResizeHandle: {
    role: 'Group',
    focus: 'None',
    gestures: [],
  },
  MinimizeButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleMinimizeFloatingPanel' }],
  },
  MaximizeButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleMaximizeFloatingPanel' }],
  },
  CloseButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'CloseFloatingPanel' }],
  },
}

const parseResizeAxisChoice = (
  maybeChoice: Option.Option<string>,
): ResizeAxis =>
  Option.match(maybeChoice, {
    onNone: () => 'SE',
    onSome: raw => {
      const upper = raw.toUpperCase()
      return S.is(ResizeAxis)(upper) ? upper : 'SE'
    },
  })

const resizeHandleLabelOf = (axis: ResizeAxis): string =>
  M.value(axis).pipe(
    M.withReturnType<string>(),
    M.when('N', () => 'Resize north edge'),
    M.when('S', () => 'Resize south edge'),
    M.when('E', () => 'Resize east edge'),
    M.when('W', () => 'Resize west edge'),
    M.when('NE', () => 'Resize northeast corner'),
    M.when('NW', () => 'Resize northwest corner'),
    M.when('SE', () => 'Resize southeast corner'),
    M.when('SW', () => 'Resize southwest corner'),
    M.exhaustive,
  )

const rootLabelPropsOf = (
  props: Props,
): Pick<SlotProps, 'label' | 'labelledBy'> => {
  if (props.label !== undefined) {
    return { label: props.label }
  } else if (props.hasTitle === false) {
    return {}
  } else {
    return { labelledBy: headerId(props.id) }
  }
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  const open = isOpen(state)
  const disabled = isDisabledOf(props)
  const minimized = isMinimized(state)
  const maximized = isMaximized(state)

  if (slot === 'Root') {
    return {
      id: rootId(props.id),
      isModal: false,
      tabIndex: 0,
      ...rootLabelPropsOf(props),
      ...(open ? {} : { isHidden: true }),
    }
  } else if (slot === 'Header') {
    return {
      id: headerId(props.id),
      ...(canDrag(state, props) ? {} : { isDisabled: true }),
    }
  } else if (slot === 'Body') {
    return {
      id: bodyId(props.id),
      ...(!open || minimized ? { isHidden: true } : {}),
    }
  } else if (slot === 'ResizeHandle') {
    const axis = parseResizeAxisChoice(maybeChoice)
    const resizableNow = canResize(state, props)
    return {
      id: resizeHandleId(props.id, axis),
      label: resizeHandleLabelOf(axis),
      ...(resizableNow ? {} : { isDisabled: true, isHidden: true }),
    }
  } else if (slot === 'MinimizeButton') {
    return {
      id: minimizeButtonId(props.id),
      label: minimized ? 'Restore window' : 'Minimize window',
      isPressed: minimized,
      ...(disabled ? { isDisabled: true } : {}),
    }
  } else if (slot === 'MaximizeButton') {
    return {
      id: maximizeButtonId(props.id),
      label: maximized ? 'Restore window' : 'Maximize window',
      isPressed: maximized,
      isDisabled: disabled || !isResizableOf(props),
    }
  } else if (slot === 'CloseButton') {
    return {
      id: closeButtonId(props.id),
      label: 'Close window',
      ...(disabled ? { isDisabled: true } : {}),
    }
  } else {
    return {}
  }
}

/** What a restart opens a FloatingPanel on: always closed with no in-progress drag or resize. */
export const atRest = (_state: State): State => initial

// PART FACTORY

/** Options for customizing a FloatingPanel Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this FloatingPanel device-only. */
  sync?: 'Synced' | DeviceReason
  /** Pointer-move sync sampling interval in milliseconds (`50` by default). */
  sampleMs?: number
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a FloatingPanel {@link Part.Part}. Synced by default
 * (`category: 'Navigation'`, `MoveFloatingPanelDrag` and
 * `MoveFloatingPanelResize` at `Pace.Sampled({ everyMs: 50 })`); pass
 * `sync: 'OwnView'` (or use {@link deviceOnly}) to keep a Program's
 * FloatingPanel local to one device.
 *
 * @example
 * ```typescript
 * const InspectorPanel = FloatingPanel.make({ name: 'InspectorPanel' })
 * const LocalPanel = FloatingPanel.deviceOnly({ name: 'LocalPanel' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const sampleMs = options.sampleMs ?? defaultSampleMs
  return Part.define<State, Message, Props>({
    name: options.name ?? 'FloatingPanel',
    State,
    Message,
    chart,
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
          dragGrain: Free(),
          dragSampleMs: sampleMs,
        },
      },
      presets: {},
    },
  })
}

/** Shorthand for a FloatingPanel Part whose state stays on the device and is omitted from the synced log and encoded Model. */
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

/** The default synced FloatingPanel Part (`name: 'FloatingPanel'`, `category: 'Navigation'`). */
export const part: Part.Part<State, Message, Props> = make()
